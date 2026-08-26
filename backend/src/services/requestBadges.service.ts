/**
 * Request Badges Service
 *
 * Drives the unread-change count badges on the sidebar "Requests" nav
 * section. Every count is a *derived* read — "items in my personal scope
 * (reported/submitted/assigned to me) with a change newer than my last visit
 * to that section, made by someone other than me" — computed from data the
 * app already writes. No notification/event table, nothing to backfill.
 *
 * This is deliberately separate from TicketView (work-orders.service.ts),
 * which drives the per-row "unread comment" flag on the Work Orders list at
 * a finer (per-ticket) granularity. The two coexist — this table only drives
 * the nav badge.
 */

import { prisma } from '../lib/prisma';
import { loggers } from '../lib/logger';
import { derivePermLevelFromGroups } from '../utils/groupAuth';
import { fieldTripService } from './fieldTrip.service';

const log = loggers.requestBadges;

export type RequestSectionKey =
  | 'WORK_ORDERS'
  | 'PURCHASE_ORDERS'
  | 'FIELD_TRIPS'
  | 'FIELD_TRIP_APPROVALS'
  | 'TRANSPORTATION_REQUESTS';

export const ALL_REQUEST_SECTIONS: RequestSectionKey[] = [
  'WORK_ORDERS',
  'PURCHASE_ORDERS',
  'FIELD_TRIPS',
  'FIELD_TRIP_APPROVALS',
  'TRANSPORTATION_REQUESTS',
];

export type RequestBadgeCounts = Record<RequestSectionKey, number>;

/**
 * Returns the user's lastVisitedAt for a section, seeding it to now() on
 * first read. Without seeding, a user's first load after this feature ships
 * would count months of pre-existing history as "unread".
 */
async function getOrSeedLastVisited(userId: string, section: RequestSectionKey): Promise<Date> {
  const existing = await prisma.requestSectionView.findUnique({
    where: { userId_section: { userId, section } },
  });
  if (existing) return existing.lastVisitedAt;

  const created = await prisma.requestSectionView.create({
    data: { userId, section },
  });
  return created.lastVisitedAt;
}

/**
 * Work Orders: a non-system comment from someone else on a ticket the caller
 * reported or is assigned to (internal comments only count at permLevel ≥ 3,
 * matching the existing unread-comment logic in work-orders.service.ts
 * exactly), OR a fresh assignment to the caller.
 *
 * Assignment special case: assign() (work-orders.service.ts) writes a system
 * comment as the only timestamped trace of a *manual* reassignment — there is
 * no assignedAt column — and system comments are excluded from the plain
 * new-comment signal above. Without this branch a freshly assigned ticket
 * with no discussion produces no badge at all. Matched on the literal
 * comment body assign() writes; if that text ever changes, update it there too.
 *
 * Auto-assignment special case: most new tickets are assigned at creation via
 * resolveAutoAssignee() (work-orders.service.ts createWorkOrder()), which sets
 * assignedToId directly in the ticket.create() call and writes no comment at
 * all. Such a ticket has neither of the two comment-based signals above, so a
 * ticket currently assigned to the caller and created after `since` also
 * counts as changed.
 */
async function countWorkOrders(userId: string, groups: string[], since: Date): Promise<number> {
  const permLevel = derivePermLevelFromGroups(groups, 'WORK_ORDERS');

  const ownTickets = await prisma.ticket.findMany({
    where: { OR: [{ reportedById: userId }, { assignedToId: userId }] },
    select: { id: true, assignedToId: true, createdAt: true, status: true },
  });
  if (ownTickets.length === 0) return 0;

  const ticketIds = ownTickets.map((t) => t.id);
  const assignedIds = ownTickets.filter((t) => t.assignedToId === userId).map((t) => t.id);

  const [commentRows, assignmentRows] = await Promise.all([
    prisma.ticketComment.findMany({
      where: {
        ticketId: { in: ticketIds },
        authorId: { not: userId },
        isSystem: false,
        createdAt: { gt: since },
        ...(permLevel >= 3 ? {} : { isInternal: false }),
      },
      select: { ticketId: true },
      distinct: ['ticketId'],
    }),
    assignedIds.length > 0
      ? prisma.ticketComment.findMany({
          where: {
            ticketId: { in: assignedIds },
            authorId: { not: userId },
            isSystem: true,
            body: { startsWith: 'Work order assigned to' },
            createdAt: { gt: since },
          },
          select: { ticketId: true },
          distinct: ['ticketId'],
        })
      : Promise.resolve([]),
  ]);

  const changed = new Set<string>();
  for (const row of commentRows) changed.add(row.ticketId);
  for (const row of assignmentRows) changed.add(row.ticketId);
  for (const t of ownTickets) {
    // An assigned ticket that is already closed needs no further look — a general
    // narrowing that also covers create-then-close flows like Quick Fix.
    if (t.assignedToId === userId && t.createdAt > since && t.status !== 'CLOSED') changed.add(t.id);
  }
  return changed.size;
}

/** Purchase Orders: a status change by someone else on a PO the caller requested. */
async function countPurchaseOrders(userId: string, since: Date): Promise<number> {
  const rows = await prisma.requisitionStatusHistory.findMany({
    where: {
      changedById: { not: userId },
      changedAt: { gt: since },
      purchaseOrder: { requestorId: userId },
    },
    select: { purchaseOrderId: true },
    distinct: ['purchaseOrderId'],
  });
  return rows.length;
}

/** Field Trips: a status change or approval action by someone else on a trip the caller submitted. */
async function countFieldTrips(userId: string, since: Date): Promise<number> {
  const [statusRows, approvalRows] = await Promise.all([
    prisma.fieldTripStatusHistory.findMany({
      where: {
        changedById: { not: userId },
        changedAt: { gt: since },
        fieldTripRequest: { submittedById: userId },
      },
      select: { fieldTripRequestId: true },
      distinct: ['fieldTripRequestId'],
    }),
    prisma.fieldTripApproval.findMany({
      where: {
        actedById: { not: userId },
        actedAt: { gt: since },
        fieldTripRequest: { submittedById: userId },
      },
      select: { fieldTripRequestId: true },
      distinct: ['fieldTripRequestId'],
    }),
  ]);

  const changed = new Set<string>();
  for (const row of statusRows) changed.add(row.fieldTripRequestId);
  for (const row of approvalRows) changed.add(row.fieldTripRequestId);
  return changed.size;
}

/**
 * Transportation Requests: approved or denied by someone else since last
 * visit. No status-history table for this model, so this is derived from
 * the four approval/denial timestamp columns rather than a history join.
 * updatedAt is deliberately not used — it bumps when the submitter edits
 * their own request, which would badge people about their own typing.
 */
async function countTransportationRequests(userId: string, since: Date): Promise<number> {
  const rows = await prisma.transportationRequest.findMany({
    where: {
      submittedById: userId,
      OR: [
        { supervisorApprovedAt: { gt: since }, supervisorApprovedById: { not: userId } },
        { supervisorDeniedAt: { gt: since }, supervisorDeniedById: { not: userId } },
        { approvedAt: { gt: since }, approvedById: { not: userId } },
        { deniedAt: { gt: since }, deniedById: { not: userId } },
      ],
    },
    select: { id: true },
  });
  return rows.length;
}

/**
 * Aggregates all five section counts for the caller. `groups` and `isAdmin`
 * come from the caller's JWT claims (req.user.groups / req.user.roles) —
 * this route applies no requireModule gate of its own, so req.user.permLevel
 * is not populated; permission levels needed here are derived directly.
 */
export async function getBadgeCounts(userId: string, groups: string[], isAdmin: boolean): Promise<RequestBadgeCounts> {
  const sinceEntries = await Promise.all(
    ALL_REQUEST_SECTIONS.map(async (section) => [section, await getOrSeedLastVisited(userId, section)] as const),
  );
  const since = Object.fromEntries(sinceEntries) as Record<RequestSectionKey, Date>;

  const fieldTripsPermLevel = derivePermLevelFromGroups(groups, 'FIELD_TRIPS');

  const [workOrders, purchaseOrders, fieldTrips, fieldTripApprovals, transportationRequests] = await Promise.all([
    countWorkOrders(userId, groups, since.WORK_ORDERS),
    countPurchaseOrders(userId, since.PURCHASE_ORDERS),
    countFieldTrips(userId, since.FIELD_TRIPS),
    fieldTripService.countPendingApprovalsSince(userId, fieldTripsPermLevel, isAdmin, since.FIELD_TRIP_APPROVALS),
    countTransportationRequests(userId, since.TRANSPORTATION_REQUESTS),
  ]);

  return {
    WORK_ORDERS: workOrders,
    PURCHASE_ORDERS: purchaseOrders,
    FIELD_TRIPS: fieldTrips,
    FIELD_TRIP_APPROVALS: fieldTripApprovals,
    TRANSPORTATION_REQUESTS: transportationRequests,
  };
}

/** Marks a section visited now, clearing its badge. */
export async function markSectionVisited(userId: string, section: RequestSectionKey): Promise<void> {
  await prisma.requestSectionView.upsert({
    where: { userId_section: { userId, section } },
    create: { userId, section },
    update: { lastVisitedAt: new Date() },
  });
  log.debug('Request section marked visited', { userId, section });
}

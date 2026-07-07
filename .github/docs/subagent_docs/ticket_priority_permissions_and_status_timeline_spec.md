# Spec: Ticket Priority Permissions + Status Timeline

## 1. Current State Analysis

Technology and Maintenance tickets are both stored in a single Prisma model, `Ticket`
(`backend/prisma/schema.prisma:1019-1083`), differentiated by `department: TicketDepartment`.
Everywhere outside the DB layer (routes/controller/service/frontend) this feature is called
**"work orders,"** not "tickets."

### Priority today
- `priority` is a first-class Prisma enum, `TicketPriority` (`LOW | MEDIUM | HIGH | URGENT`) —
  `backend/prisma/schema.prisma:982-987,1024`.
- It is only editable through the generic `PUT /api/work-orders/:id` endpoint
  (`backend/src/routes/work-orders.routes.ts:99-105`), gated by `requireModule('WORK_ORDERS', 3)`.
  Level 3 for the `WORK_ORDERS` module (`backend/src/utils/groupAuth.ts:72-86`) is granted to
  **Principals, Vice Principals, School Maintenance, and County-Wide Maintenance** alike — there
  is no field-level distinction, so today Principals/VPs can silently change priority too, and
  **no audit record is written** (contrast with status changes, which always write a
  `TicketStatusHistory` row in `updateStatus`, `backend/src/services/work-orders.service.ts:568-628`).
- The frontend has a mutation hook for the generic update (`useUpdateWorkOrder`,
  `frontend/src/hooks/mutations/useWorkOrderMutations.ts:33-44`) but it is **never called** —
  there is currently no UI path to change priority after creation at all. The detail page
  (`frontend/src/pages/WorkOrderDetailPage.tsx:315`) only renders priority as a read-only chip.

### Status timeline today
- `TicketStatusHistory` (`backend/prisma/schema.prisma:1102-1117`) already records every status
  transition: `fromStatus`, `toStatus`, `changedById`, `changedAt`, `notes`.
- Ticket status is **not** a one-way workflow like Purchase Orders — `VALID_TRANSITIONS`
  (`backend/src/services/work-orders.service.ts:39-61`) allows reopening (`CLOSED → OPEN`,
  `RESOLVED → IN_PROGRESS`, `RESOLVED → OPEN`) and detours through `ON_HOLD`. This is why PO's
  fixed-stage MUI `Stepper` (`frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx:623-680`)
  is not a good fit here — a stepper implies forward-only progress through fixed stages.
- Today, status history is rendered merged with comments into one chronological feed
  (`WorkOrderDetailPage.tsx:389-415`, `StatusHistoryCard` at line 134), under a single
  "Comments & Activity" panel. There is no dedicated "Status Timeline" section, and no explicit
  "Opened by / Closed by" summary — though the data to derive both already exists: the very
  first `TicketStatusHistory` row is always `{ fromStatus: null, toStatus: 'OPEN', changedById: reportedById }`
  (written at ticket creation, `work-orders.service.ts:507-515`), and any `toStatus: 'CLOSED'`
  row already records who closed it and when.

### Group-based authorization today
`backend/src/utils/groupAuth.ts` is the single source of truth for Entra-group-derived
permissions. `GROUP_MODULE_MAP` (lines 29-137) drives numeric per-module levels via
`requireModule`. For narrower checks that don't map cleanly onto a numeric level threshold, the
codebase already has a precedent: standalone allowlist predicates like `isCountyWideMaintenance`,
`isSchoolMaintenanceWorker`, `canSeeAllLocations`, and `isPrincipalOrVP` (lines 176-253), each
checking a small fixed set of env vars directly against `req.user.groups`. This is the pattern
this feature will follow, since "exactly these 6 groups" does not correspond to any single
`WORK_ORDERS` level (Admin=5, Tech Assistants=5, Tech Director=4, Maintenance Director=4 all
differ from County-Wide/School Maintenance=3 — and Principals/VPs also sit at level 3, but must
be **excluded**).

All 6 requested env vars are confirmed present and configured in `.env`:
`ENTRA_TECH_ASSISTANTS_GROUP_ID`, `ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID`,
`ENTRA_SCHOOL_MAINTENANCE_GROUP_ID`, `ENTRA_ADMIN_GROUP_ID`,
`ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID`, `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID`.

The auth response already exposes raw group IDs to the frontend (`groups: groupIds`,
`backend/src/controllers/auth.controller.ts:393`) alongside **derived boolean capability flags**
computed server-side (e.g. `isFinanceDirectorApprover`, `isPoEntryUser`,
`auth.controller.ts:342-364`, folded into the `permLevels` object at line 394). This is the
established pattern for exposing a non-level-based permission to the frontend, and this feature
will follow it rather than making the frontend re-derive anything from raw group IDs itself
(frontend checks remain display-only; the real gate is server-side).

## 2. Problem Definition

1. Only these 6 groups — Tech Assistants, County-Wide Maintenance, School Maintenance, Admin,
   Maintenance Director, Technology Director — should be able to change the priority of a
   Technology or Maintenance ticket. This is narrower than the existing generic edit permission
   (level 3+), so priority must be split out of the generic update path into its own
   dedicated, specifically-gated action — mirroring how `/status` and `/assign` are already
   separate endpoints from the generic `PUT /:id`.
2. Priority changes should be audited (who changed it, from what, to what, when) — there is
   currently no such record, unlike status changes.
3. The ticket detail page needs a clearly-labeled **Status Timeline** (distinct visual element,
   the ticket-side analog of the PO status timeline) showing: when the ticket was opened (and by
   whom), each subsequent status change (and by whom), and when/if it was closed (and by whom).
   Because ticket status can move backward (reopen), this will be a chronological timeline list,
   not a fixed-stage stepper like the PO's.

## 3. Proposed Solution Architecture

### Backend

**Prisma schema (`backend/prisma/schema.prisma`)**
- Add `TicketPriorityHistory` model, structurally mirroring `TicketStatusHistory`:
  ```prisma
  model TicketPriorityHistory {
    id           String          @id @default(uuid())
    ticketId     String
    fromPriority TicketPriority?
    toPriority   TicketPriority
    changedById  String
    changedAt    DateTime        @default(now())
    notes        String?

    ticket       Ticket          @relation(fields: [ticketId], references: [id], onDelete: Cascade)
    changedBy    User            @relation("TicketPriorityChangedBy", fields: [changedById], references: [id])

    @@index([ticketId])
    @@index([changedAt])
    @@map("ticket_priority_history")
  }
  ```
- Add `priorityHistory TicketPriorityHistory[]` to the `Ticket` model's relations block
  (next to the existing `statusHistory` line, `schema.prisma:1069`).
- Add `ticketPriorityHistory TicketPriorityHistory[] @relation("TicketPriorityChangedBy")` to
  `User`, next to the existing `ticketStatusHistory` line (`schema.prisma:552`).
- Manually author the migration SQL at
  `backend/prisma/migrations/<timestamp>_add_ticket_priority_history/migration.sql`
  (`CREATE TABLE ticket_priority_history (...)` + FKs + indexes, following the exact column
  types/constraints of the existing `ticket_status_history` table). No destructive commands are
  run — this is additive only.

**`backend/src/utils/groupAuth.ts`**
- Add a new allowlist predicate, following the exact shape of `isCountyWideMaintenance` /
  `canSeeAllLocations`:
  ```ts
  const TICKET_PRIORITY_CHANGE_GROUP_ENV_VARS = [
    'ENTRA_ADMIN_GROUP_ID',
    'ENTRA_TECH_ASSISTANTS_GROUP_ID',
    'ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID',
    'ENTRA_SCHOOL_MAINTENANCE_GROUP_ID',
    'ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID',
    'ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID',
  ] as const;

  export function canChangeTicketPriority(groupIds: string[]): boolean {
    const allowlist = TICKET_PRIORITY_CHANGE_GROUP_ENV_VARS
      .map((envVar) => process.env[envVar])
      .filter((id): id is string => Boolean(id));
    return allowlist.some((id) => groupIds.includes(id));
  }
  ```

**Validators (`backend/src/validators/work-orders.validators.ts`)**
- Remove `priority` from `UpdateWorkOrderSchema` (closes the loophole where any level-3+ editor,
  including Principals/VPs, could change it via the generic endpoint).
- Add:
  ```ts
  export const UpdatePrioritySchema = z.object({
    priority: TicketPriorityEnum,
    notes:    z.string().max(1000).optional(),
  });
  export type UpdatePriorityDto = z.infer<typeof UpdatePrioritySchema>;
  ```

**Service (`backend/src/services/work-orders.service.ts`)**
- Remove the `priority: data.priority as any` line from `updateWorkOrder`'s update payload
  (`work-orders.service.ts:547`) — no longer part of `UpdateWorkOrderDto`.
- Add `priorityHistory` to `WORK_ORDER_DETAIL_INCLUDE` (mirrors the existing `statusHistory`
  block at lines 88-91):
  ```ts
  priorityHistory: {
    orderBy: { changedAt: 'asc' as const },
    include: { changedBy: { select: { id: true, displayName: true, email: true } } },
  },
  ```
- Add a new method, mirroring `updateStatus`'s shape:
  ```ts
  async updatePriority(
    id: string,
    data: UpdatePriorityDto,
    userId: string,
    permLevel: number,
    groups: string[],
    maintenanceRole?: MaintenanceRole,
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError('Work order', id);

    // Must already have (scoped) access to this ticket at all.
    await this.assertTicketAccess(ticket, userId, permLevel, maintenanceRole);

    // Then the specific 6-group priority-change permission.
    if (!canChangeTicketPriority(groups)) {
      throw new AuthorizationError('You do not have permission to change ticket priority');
    }

    if (data.priority === ticket.priority) {
      // No-op: return current state, no history noise.
      return this.prisma.ticket.findUnique({ where: { id }, include: WORK_ORDER_DETAIL_INCLUDE });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({
        where: { id },
        data:  { priority: data.priority as any },
        include: WORK_ORDER_DETAIL_INCLUDE,
      });

      await tx.ticketPriorityHistory.create({
        data: {
          ticketId:     id,
          fromPriority: ticket.priority,
          toPriority:   data.priority as any,
          changedById:  userId,
          notes:        data.notes ?? null,
        },
      });

      return result;
    });

    loggers.workOrders.info('Work order priority updated', {
      ticketId: id, from: ticket.priority, to: data.priority, userId,
    });

    return updated;
  }
  ```
  (Import `canChangeTicketPriority` from `../utils/groupAuth`.)

**Controller (`backend/src/controllers/work-orders.controller.ts`)**
- Import `UpdatePrioritySchema` and `canChangeTicketPriority` (only needed if pre-checking; the
  service already enforces it — controller just passes `req.user!.groups ?? []` through).
- Add handler mirroring `updateStatus`:
  ```ts
  export const updatePriority = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data      = UpdatePrioritySchema.parse(req.body);
      const userId    = req.user!.id;
      const permLevel = req.user!.permLevel ?? 1;
      const groups    = req.user!.groups ?? [];
      const maintenanceRole = getMaintenanceRole(groups);

      const ticket = await service.updatePriority(req.params.id as string, data, userId, permLevel, groups, maintenanceRole);
      res.json(mapTicket(ticket));
    } catch (error) {
      handleControllerError(error, res);
    }
  };
  ```

**Routes (`backend/src/routes/work-orders.routes.ts`)**
- Add, right after the `/status` route:
  ```ts
  /**
   * PUT /api/work-orders/:id/priority
   * Change ticket priority. Restricted to Admin, Tech Assistants, County-Wide
   * Maintenance, School Maintenance, Maintenance Director, Technology Director
   * (enforced in the service via canChangeTicketPriority — not level-based,
   * since Principals/VPs share level 3 with School/County Maintenance but must
   * NOT get this permission).
   */
  router.put(
    '/:id/priority',
    validateRequest(WorkOrderIdParamSchema, 'params'),
    validateRequest(UpdatePrioritySchema, 'body'),
    requireModule('WORK_ORDERS', 1),
    workOrdersController.updatePriority,
  );
  ```
  `requireModule('WORK_ORDERS', 1)` here only authenticates and derives `req.user.permLevel`
  (needed by `assertTicketAccess`) — the real gate is the group check inside the service, exactly
  as the minLevel-doesn't-fit reasoning above requires.

**Expose a display-only capability flag (`backend/src/controllers/auth.controller.ts`)**
- Import `canChangeTicketPriority` from `../utils/groupAuth`.
- In both places `permLevels` is built (login response ~line 330-340, and the session-refresh
  handler ~line 736-740), add:
  ```ts
  canChangeWorkOrderPriority: canChangeTicketPriority(groupIds),
  ```
  folded into the same object as `isFinanceDirectorApprover` etc. (line 394) so the frontend gets
  it for free alongside the existing capability flags — no raw group IDs need to change shape,
  this only adds one more derived boolean, consistent with existing precedent.

### Frontend

**Types (`frontend/src/types/work-order.types.ts`)**
- Remove `priority` from `UpdateWorkOrderDto`.
- Add:
  ```ts
  export interface WorkOrderPriorityHistoryEntry {
    id: string;
    fromPriority: WorkOrderPriority | null;
    toPriority: WorkOrderPriority;
    changedAt: string;
    notes: string | null;
    changedBy: WorkOrderUser;
  }
  export interface UpdatePriorityDto {
    priority: WorkOrderPriority;
    notes?: string;
  }
  ```
  and add `priorityHistory: WorkOrderPriorityHistoryEntry[]` to `WorkOrderDetail`.

**Auth types/store (`frontend/src/store/authStore.ts`)**
- Add `canChangeWorkOrderPriority?: boolean` to the `permLevels` type shape (line 21 area),
  matching how `isFinanceDirectorApprover` etc. are already typed there.

**Service (`frontend/src/services/work-order.service.ts`)**
- Add:
  ```ts
  updatePriority: async (id: string, priority: WorkOrderPriority, notes?: string): Promise<WorkOrderDetail> => {
    const res = await api.put<WorkOrderDetail>(`${BASE}/${id}/priority`, { priority, notes });
    return res.data;
  },
  ```

**Mutation hook (`frontend/src/hooks/mutations/useWorkOrderMutations.ts`)**
- Add `useUpdateWorkOrderPriority()`, mirroring `useUpdateWorkOrderStatus()` exactly (same
  invalidation of `workOrders.all` + `workOrders.detail(id)`).

**`frontend/src/pages/WorkOrderDetailPage.tsx`**
- Read `canChangeWorkOrderPriority` from `useAuthStore()` (mirrors the existing `canAssign`
  pattern at line 179).
- Add a "Change Priority" button next to "Update Status" / "Assign To", visible only when
  `canChangeWorkOrderPriority` is true (display-only convenience — the real check is
  server-side).
- Add a Priority dialog (mirrors the existing Status dialog): a `Select` of
  LOW/MEDIUM/HIGH/URGENT pre-populated with the current priority, an optional notes `TextField`,
  wired to `useUpdateWorkOrderPriority().mutateAsync({ id, priority, notes })`.
- Add a **dedicated "Status Timeline" card**, separate from the "Comments & Activity" panel,
  placed above it. Renders `workOrder.statusHistory` as a vertical chronological list (not a
  Stepper, since status can move backward): each entry shows actor, timestamp, and
  from→to (or "Work order opened" for the first entry, since `fromStatus` is `null` there); if a
  `CLOSED` entry exists and reflects the ticket's current state, visually mark it as the closing
  event. This directly satisfies "opened when/by whom, status changed when/by whom, closed
  when/by whom" using data that's already fetched — no new endpoint needed for this part.
- Extend the existing merged `ActivityItem` union in the Comments & Activity panel
  (`WorkOrderDetailPage.tsx:390-397`) with a third kind, `{ kind: 'priority'; ts; item: WorkOrderPriorityHistoryEntry }`,
  sourced from `workOrder.priorityHistory`, rendered via a new small `PriorityHistoryCard`
  sub-component (mirrors `StatusHistoryCard`) — so priority-change audit entries are visible
  inline with comments, since they are not part of the dedicated Status Timeline (which is
  status-only, per the ask).

## 4. Implementation Steps

1. Edit `schema.prisma`: add `TicketPriorityHistory` model, `Ticket.priorityHistory` relation,
   `User.ticketPriorityHistory` relation.
2. Hand-author the migration SQL file (new table + FKs + indexes) at
   `backend/prisma/migrations/<YYYYMMDDHHmmss>_add_ticket_priority_history/migration.sql`.
3. `backend/src/utils/groupAuth.ts`: add `canChangeTicketPriority`.
4. `backend/src/validators/work-orders.validators.ts`: remove `priority` from
   `UpdateWorkOrderSchema`; add `UpdatePrioritySchema` + `UpdatePriorityDto`.
5. `backend/src/services/work-orders.service.ts`: remove `priority` from `updateWorkOrder`'s
   update payload; add `priorityHistory` to `WORK_ORDER_DETAIL_INCLUDE`; add `updatePriority`
   method.
6. `backend/src/controllers/work-orders.controller.ts`: add `updatePriority` handler.
7. `backend/src/routes/work-orders.routes.ts`: add `PUT /:id/priority` route.
8. `backend/src/controllers/auth.controller.ts`: add `canChangeWorkOrderPriority` to both
   `permLevels` construction sites.
9. `frontend/src/types/work-order.types.ts`: type changes described above.
10. `frontend/src/store/authStore.ts`: add `canChangeWorkOrderPriority` to the permLevels type.
11. `frontend/src/services/work-order.service.ts`: add `updatePriority`.
12. `frontend/src/hooks/mutations/useWorkOrderMutations.ts`: add `useUpdateWorkOrderPriority`.
13. `frontend/src/pages/WorkOrderDetailPage.tsx`: Change Priority button + dialog, dedicated
    Status Timeline card, priority entries folded into the Comments & Activity feed.
14. Verify: `docker compose -f docker-compose.dev.yml build backend` and
    `... build frontend` (Phase 6 preflight — not run until Phase 3/5 review passes).

## 5. Dependencies

No new external dependencies. All work uses libraries already in use elsewhere in this exact
subsystem (Zod 4 validators, Prisma 7 models/migrations, MUI v7 components, TanStack Query v5
mutation hooks) — per CLAUDE.md's Dependency Policy, doc verification against upstream is not
required since no new dependency or unfamiliar API surface is introduced; every pattern here is
copied from an existing in-repo analog (`updateStatus`/`TicketStatusHistory`, PO's status
history, `isCountyWideMaintenance`/`isFinanceDirectorApprover`).

## 6. Configuration Changes

None. All 6 required env vars already exist and are populated in `.env`. No new Entra
groups/scopes are introduced — this only adds a new *combination* check over existing groups.

## 7. Risks and Mitigations

- **Risk:** Removing `priority` from `UpdateWorkOrderSchema`/`updateWorkOrder` is a breaking
  change to that endpoint's contract.
  **Mitigation:** confirmed via grep that the frontend `useUpdateWorkOrder` hook (the only
  consumer of the generic update endpoint) is never called anywhere — no frontend code currently
  sends `priority` through that path, so removing it is safe. No other consumers found.
- **Risk:** A ticket a user cannot otherwise access (per `assertTicketAccess` scoping) should not
  be priority-editable even if the user is in one of the 6 groups (e.g. a County-Wide Maintenance
  worker must not touch a Technology ticket, which `assertTicketAccess` already blocks them from
  entirely since their scope is forced to `department === 'MAINTENANCE'`).
  **Mitigation:** `updatePriority` calls `assertTicketAccess` before the group check, so existing
  location/department scoping is preserved unchanged; the new group check is an additional
  restriction, never a bypass.
- **Risk:** Migration file must exactly match what `prisma generate` will expect from the schema
  edit, or the backend container's `prisma migrate deploy` will fail at startup.
  **Mitigation:** column types/nullability/enum references will mirror `ticket_status_history`
  exactly (same DB already has that table as a working reference), reviewed in Phase 3.
- **Risk:** Frontend authStore type drift — `permLevels` is a loosely-typed object augmented ad
  hoc; adding one more optional boolean is low-risk but must be added to the TypeScript interface
  or it will silently be `undefined` at the type level even though present at runtime.
  **Mitigation:** explicitly listed as an implementation step (Step 10).

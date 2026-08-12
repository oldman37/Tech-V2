/**
 * Inventory permanent-delete integration tests.
 *
 * Verifies recreate_upstream_bugfixes_spec.md's inventory-delete fix: the
 * DELETE /api/inventory/:id?permanent=true gate (admins AND Tech Assistants)
 * always succeeds now — the old FK-safety guard that blocked deletion
 * whenever related history existed is replaced by a full cascade
 * (hardDeleteWithRelations) with a `purgeAll` mode switch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { getTestPrisma, createTestUser, cleanupUsers, cleanupTickets } from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Inventory Permanent Delete', () => {
  const prisma = getTestPrisma();

  let adminUser: { id: string; entraId: string; email: string };
  let techUser: { id: string; entraId: string; email: string }; // Tech Assistants group, not ADMIN
  let basicUser: { id: string; entraId: string; email: string }; // ALL_STAFF — no TECHNOLOGY access at all

  let adminToken: string;
  let techToken: string;
  let basicToken: string;

  let cleanItemId: string;
  let assignmentItemId: string;
  let assignmentId: string;
  let techCleanItemId: string;
  let basicRejectedItemId: string;
  let disposeOnlyItemId: string;

  const uid = () => crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    [adminUser, techUser, basicUser] = await Promise.all([
      createTestUser({ role: 'ADMIN', cachedGroups: [] }),
      createTestUser({ cachedGroups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
      createTestUser({ cachedGroups: [process.env.ENTRA_ALL_STAFF_GROUP_ID ?? 'test-allstaff-group-id'] }),
    ]);

    adminToken = signTestAccessToken(
      makeTokenPayload(adminUser, { groups: [], roles: ['ADMIN'], role: 'ADMIN' }),
    );
    techToken = signTestAccessToken(
      makeTokenPayload(techUser, { groups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
    );
    basicToken = signTestAccessToken(
      makeTokenPayload(basicUser, { groups: [process.env.ENTRA_ALL_STAFF_GROUP_ID ?? 'test-allstaff-group-id'] }),
    );

    const [clean, withAssignment, techClean, basicRejected, disposeOnly] = await Promise.all([
      prisma.equipment.create({ data: { assetTag: `TEST-CLEAN-${uid()}`, name: 'Clean Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-ASSIGN-${uid()}`, name: 'Assigned Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-TECH-CLEAN-${uid()}`, name: 'Tech Clean Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-BASIC-REJECT-${uid()}`, name: 'Basic Rejected Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-DISPOSE-${uid()}`, name: 'Dispose Test Item' }, select: { id: true } }),
    ]);
    cleanItemId = clean.id;
    assignmentItemId = withAssignment.id;
    techCleanItemId = techClean.id;
    basicRejectedItemId = basicRejected.id;
    disposeOnlyItemId = disposeOnly.id;

    const assignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: assignmentItemId,
        userId: techUser.id,
        assigneeType: 'staff',
        checkoutBy: adminUser.id,
        checkoutCondition: 'good',
      },
      select: { id: true },
    });
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    await prisma.deviceAssignment.delete({ where: { id: assignmentId } }).catch(() => {});
    await prisma.equipment.deleteMany({
      where: { id: { in: [cleanItemId, assignmentItemId, techCleanItemId, basicRejectedItemId, disposeOnlyItemId] } },
    }).catch(() => {});
    await cleanupUsers([adminUser.id, techUser.id, basicUser.id]);
  });

  it('1. a clean permanent-delete succeeds for an admin', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${cleanItemId}?permanent=true`)
      .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(200);
    const stillExists = await prisma.equipment.findUnique({ where: { id: cleanItemId } });
    expect(stillExists).toBeNull();
  });

  it('2. a permanent-delete succeeds despite an existing DeviceAssignment, and deletes the assignment row', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${assignmentItemId}?permanent=true`)
      .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(200);
    const stillExists = await prisma.equipment.findUnique({ where: { id: assignmentItemId } });
    expect(stillExists).toBeNull();
    const assignmentStillExists = await prisma.deviceAssignment.findUnique({ where: { id: assignmentId } });
    expect(assignmentStillExists).toBeNull();
  });

  it('3. a non-admin Tech Assistant can also permanently delete a clean item', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${techCleanItemId}?permanent=true`)
      .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(200);
    const stillExists = await prisma.equipment.findUnique({ where: { id: techCleanItemId } });
    expect(stillExists).toBeNull();
  });

  it('4. a user with no TECHNOLOGY access (neither admin nor Tech Assistant) is rejected for permanent=true', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${basicRejectedItemId}?permanent=true`)
      .set('Cookie', `access_token=${basicToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(403);
    const stillExists = await prisma.equipment.findUnique({ where: { id: basicRejectedItemId } });
    expect(stillExists).not.toBeNull();
  });

  it('5. the existing dispose (soft-delete) path still works unchanged for a non-admin', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${disposeOnlyItemId}`)
      .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(200);
    const item = await prisma.equipment.findUnique({ where: { id: disposeOnlyItemId } });
    expect(item?.isDisposed).toBe(true);
    expect(item?.status).toBe('disposed');
  });

  it('6. a linked work order survives, unlinked, with a system comment', async () => {
    const item = await prisma.equipment.create({
      data: { assetTag: `TEST-TICKET-${uid()}`, name: 'Ticket Linked Test Item' },
      select: { id: true },
    });
    const location = await prisma.officeLocation.create({
      data: { name: `Perm Delete Test Location ${uid()}`, type: 'SCHOOL', isActive: true },
      select: { id: true },
    });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-PD-${Date.now()}-${uid()}`,
        department: 'TECHNOLOGY',
        description: 'Linked to equipment under test',
        priority: 'LOW',
        status: 'OPEN',
        fiscalYear: '2025-2026',
        reportedById: adminUser.id,
        officeLocationId: location.id,
        equipmentId: item.id,
      },
      select: { id: true },
    });

    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .delete(`/api/inventory/${item.id}?permanent=true`)
        .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue);
      expect(res.status).toBe(200);

      const stillExists = await prisma.equipment.findUnique({ where: { id: item.id } });
      expect(stillExists).toBeNull();

      const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updatedTicket).not.toBeNull();
      expect(updatedTicket?.equipmentId).toBeNull();

      const comments = await prisma.ticketComment.findMany({ where: { ticketId: ticket.id, isSystem: true } });
      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0]?.body).toEqual(expect.stringContaining('permanently deleted'));
    } finally {
      await cleanupTickets([ticket.id]);
    }
  });

  it('7. purgeAll=false preserves a damage incident and its invoice, unlinked with a note', async () => {
    const item = await prisma.equipment.create({
      data: { assetTag: `TEST-DMG-PRESERVE-${uid()}`, name: 'Damage Preserve Test Item' },
      select: { id: true },
    });
    const incident = await prisma.damageIncident.create({
      data: {
        equipmentId: item.id,
        reportedBy: adminUser.id,
        damageType: 'physical_damage',
        severity: 'moderate',
        description: 'Original description',
      },
      select: { id: true },
    });
    const invoice = await prisma.damageInvoice.create({
      data: {
        invoiceNumber: `TEST-INV-${uid()}`,
        damageIncidentId: incident.id,
        recipientEmail: 'test@example.com',
        amount: 50,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: adminUser.id,
      },
      select: { id: true },
    });

    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${item.id}?permanent=true`)
      .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);
    expect(res.status).toBe(200);

    const preservedIncident = await prisma.damageIncident.findUnique({ where: { id: incident.id } });
    expect(preservedIncident).not.toBeNull();
    expect(preservedIncident?.equipmentId).toBeNull();
    expect(preservedIncident?.description).toEqual(expect.stringContaining('permanently deleted'));

    const preservedInvoice = await prisma.damageInvoice.findUnique({ where: { id: invoice.id } });
    expect(preservedInvoice).not.toBeNull();

    await prisma.damageInvoice.delete({ where: { id: invoice.id } }).catch(() => {});
    await prisma.damageIncident.delete({ where: { id: incident.id } }).catch(() => {});
  });

  it('8. purgeAll=true deletes a damage incident and its invoice', async () => {
    const item = await prisma.equipment.create({
      data: { assetTag: `TEST-DMG-PURGE-${uid()}`, name: 'Damage Purge Test Item' },
      select: { id: true },
    });
    const incident = await prisma.damageIncident.create({
      data: {
        equipmentId: item.id,
        reportedBy: adminUser.id,
        damageType: 'physical_damage',
        severity: 'moderate',
        description: 'Original description',
      },
      select: { id: true },
    });
    const invoice = await prisma.damageInvoice.create({
      data: {
        invoiceNumber: `TEST-INV-${uid()}`,
        damageIncidentId: incident.id,
        recipientEmail: 'test@example.com',
        amount: 50,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: adminUser.id,
      },
      select: { id: true },
    });

    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${item.id}?permanent=true&purgeAll=true`)
      .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);
    expect(res.status).toBe(200);

    const purgedIncident = await prisma.damageIncident.findUnique({ where: { id: incident.id } });
    expect(purgedIncident).toBeNull();
    const purgedInvoice = await prisma.damageInvoice.findUnique({ where: { id: invoice.id } });
    expect(purgedInvoice).toBeNull();
  });
});

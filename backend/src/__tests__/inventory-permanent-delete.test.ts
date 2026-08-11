/**
 * Inventory permanent-delete integration tests.
 *
 * Verifies INVENTORY_TABLE_AND_PERMANENT_DELETE_spec.md's Fix B: the
 * pre-existing DELETE /api/inventory/:id?permanent=true admin gate, plus the
 * new FK-safety guard blocking a hard delete when non-cascading related
 * records exist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { getTestPrisma, createTestUser, cleanupUsers } from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Inventory Permanent Delete', () => {
  const prisma = getTestPrisma();

  let adminUser: { id: string; entraId: string; email: string };
  let techUser: { id: string; entraId: string; email: string }; // TECHNOLOGY level 3 (edit access), not ADMIN

  let adminToken: string;
  let techToken: string;

  let cleanItemId: string;
  let blockedItemId: string;
  let disposeOnlyItemId: string;
  let assignmentId: string;

  beforeAll(async () => {
    [adminUser, techUser] = await Promise.all([
      createTestUser({ role: 'ADMIN', cachedGroups: [] }),
      createTestUser({ cachedGroups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
    ]);

    adminToken = signTestAccessToken(
      makeTokenPayload(adminUser, { groups: [], roles: ['ADMIN'], role: 'ADMIN' }),
    );
    techToken = signTestAccessToken(
      makeTokenPayload(techUser, { groups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
    );

    const uid = () => crypto.randomUUID().slice(0, 8);

    const [clean, blocked, disposeOnly] = await Promise.all([
      prisma.equipment.create({ data: { assetTag: `TEST-CLEAN-${uid()}`, name: 'Clean Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-BLOCKED-${uid()}`, name: 'Blocked Test Item' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-DISPOSE-${uid()}`, name: 'Dispose Test Item' }, select: { id: true } }),
    ]);
    cleanItemId = clean.id;
    blockedItemId = blocked.id;
    disposeOnlyItemId = disposeOnly.id;

    const assignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: blockedItemId,
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
    await prisma.equipment.deleteMany({ where: { id: { in: [cleanItemId, blockedItemId, disposeOnlyItemId] } } }).catch(() => {});
    await cleanupUsers([adminUser.id, techUser.id]);
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

  it('2. a permanent-delete is blocked with 409 + a message naming the blocking relation when a DeviceAssignment exists', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${blockedItemId}?permanent=true`)
      .set('Cookie', `access_token=${adminToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(409);
    expect(res.body.message ?? res.body.error).toEqual(expect.stringContaining('checkout record'));

    const stillExists = await prisma.equipment.findUnique({ where: { id: blockedItemId } });
    expect(stillExists).not.toBeNull();
  });

  it('3. a non-admin with TECHNOLOGY edit access is rejected for permanent=true', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/inventory/${disposeOnlyItemId}?permanent=true`)
      .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    expect(res.status).toBe(403);
    const stillExists = await prisma.equipment.findUnique({ where: { id: disposeOnlyItemId } });
    expect(stillExists).not.toBeNull();
  });

  it('4. the existing dispose (soft-delete) path still works unchanged for a non-admin', async () => {
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
});

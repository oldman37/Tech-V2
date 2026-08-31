/**
 * User checkout-history charger row integration tests.
 *
 * Verifies USER_CHECKOUT_HISTORY_CHARGER_ROW_spec.md: GET
 * /api/device-assignments/user/:userId nests the paired charger assignment
 * with its own checkoutAt (added at this call site only, not the shared
 * openChargerAssignmentSelect used elsewhere), so the frontend can render it
 * as its own history row.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { getTestPrisma, createTestUser, cleanupUsers } from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('User Checkout History Charger Row', () => {
  const prisma = getTestPrisma();

  let techUser: { id: string; entraId: string; email: string };
  let student: { id: string; entraId: string; email: string };
  let techToken: string;

  const uid = () => crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    [techUser, student] = await Promise.all([
      createTestUser({ cachedGroups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
      createTestUser({}),
    ]);
    techToken = signTestAccessToken(
      makeTokenPayload(techUser, { groups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
    );
  });

  afterAll(async () => {
    await cleanupUsers([techUser.id, student.id]);
  });

  it('1. an assignment with a paired charger nests the charger assignment with its own checkoutAt', async () => {
    const equipment = await prisma.equipment.create({
      data: { assetTag: `TEST-HIST-DEV-${uid()}`, name: 'History Test Laptop' },
      select: { id: true },
    });
    const charger = await prisma.charger.create({
      data: { serialNumber: `TEST-HIST-CHG-${uid()}`, status: 'checked_out' },
      select: { id: true, serialNumber: true },
    });
    const assignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: equipment.id,
        userId: student.id,
        assigneeType: 'student',
        checkoutBy: techUser.id,
        checkoutCondition: 'good',
      },
      select: { id: true },
    });
    const chargerAssignment = await prisma.chargerAssignment.create({
      data: {
        chargerId: charger.id,
        deviceAssignmentId: assignment.id,
        userId: student.id,
        assigneeType: 'student',
        checkoutBy: techUser.id,
      },
      select: { id: true },
    });

    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .get(`/api/device-assignments/user/${student.id}`)
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue);

      expect(res.status).toBe(200);
      const row = res.body.find((a: { id: string }) => a.id === assignment.id);
      expect(row).toBeDefined();
      expect(row.chargerAssignment).toMatchObject({
        id: chargerAssignment.id,
        returnedAt: null,
        charger: { serialNumber: charger.serialNumber },
      });
      expect(typeof row.chargerAssignment.checkoutAt).toBe('string');
      expect(Number.isNaN(Date.parse(row.chargerAssignment.checkoutAt))).toBe(false);
    } finally {
      await prisma.chargerAssignment.delete({ where: { id: chargerAssignment.id } }).catch(() => {});
      await prisma.deviceAssignment.delete({ where: { id: assignment.id } }).catch(() => {});
      await prisma.charger.delete({ where: { id: charger.id } }).catch(() => {});
      await prisma.equipment.delete({ where: { id: equipment.id } }).catch(() => {});
    }
  });

  it('2. an assignment with no charger has a null chargerAssignment', async () => {
    const equipment = await prisma.equipment.create({
      data: { assetTag: `TEST-HIST-NOCHG-${uid()}`, name: 'History Test Laptop No Charger' },
      select: { id: true },
    });
    const assignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: equipment.id,
        userId: student.id,
        assigneeType: 'student',
        checkoutBy: techUser.id,
        checkoutCondition: 'good',
      },
      select: { id: true },
    });

    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .get(`/api/device-assignments/user/${student.id}`)
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue);

      expect(res.status).toBe(200);
      const row = res.body.find((a: { id: string }) => a.id === assignment.id);
      expect(row).toBeDefined();
      expect(row.chargerAssignment).toBeNull();
    } finally {
      await prisma.deviceAssignment.delete({ where: { id: assignment.id } }).catch(() => {});
      await prisma.equipment.delete({ where: { id: equipment.id } }).catch(() => {});
    }
  });
});

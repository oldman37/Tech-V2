/**
 * Device exchange charger carryover integration tests.
 *
 * Verifies DEVICE_EXCHANGE_CHARGER_CARRYOVER_spec.md: when a damage-incident
 * device exchange checks in a broken laptop and checks out a replacement, the
 * paired open ChargerAssignment on the old checkout follows the student onto
 * the new checkout instead of being stranded on the closed old one (which
 * previously surfaced as a phantom "Charger Outstanding" row).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { getTestPrisma, createTestUser, cleanupUsers } from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Device Exchange Charger Carryover', () => {
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

  async function seedExchangeFixture() {
    const [brokenLaptop, replacementLaptop, charger] = await Promise.all([
      prisma.equipment.create({ data: { assetTag: `TEST-BROKEN-${uid()}`, name: 'Broken Laptop' }, select: { id: true } }),
      prisma.equipment.create({ data: { assetTag: `TEST-REPLACEMENT-${uid()}`, name: 'Replacement Laptop' }, select: { id: true } }),
      prisma.charger.create({ data: { serialNumber: `TEST-CHG-${uid()}`, status: 'checked_out' }, select: { id: true, serialNumber: true } }),
    ]);

    const oldAssignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: brokenLaptop.id,
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
        deviceAssignmentId: oldAssignment.id,
        userId: student.id,
        assigneeType: 'student',
        checkoutBy: techUser.id,
      },
      select: { id: true },
    });

    const incident = await prisma.damageIncident.create({
      data: {
        equipmentId: brokenLaptop.id,
        assignmentId: oldAssignment.id,
        userId: student.id,
        reportedBy: techUser.id,
        damageType: 'physical_damage',
        severity: 'moderate',
      },
      select: { id: true },
    });

    return { brokenLaptop, replacementLaptop, charger, oldAssignment, chargerAssignment, incident };
  }

  async function cleanupExchangeFixture(f: Awaited<ReturnType<typeof seedExchangeFixture>>) {
    await prisma.damageIncident.delete({ where: { id: f.incident.id } }).catch(() => {});
    await prisma.chargerAssignment.deleteMany({ where: { chargerId: f.charger.id } }).catch(() => {});
    await prisma.deviceAssignment.deleteMany({ where: { equipmentId: { in: [f.brokenLaptop.id, f.replacementLaptop.id] } } }).catch(() => {});
    await prisma.charger.delete({ where: { id: f.charger.id } }).catch(() => {});
    await prisma.equipment.deleteMany({ where: { id: { in: [f.brokenLaptop.id, f.replacementLaptop.id] } } }).catch(() => {});
  }

  it('1. exchanging with a replacement carries the open charger assignment to the new checkout', async () => {
    const f = await seedExchangeFixture();
    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .post(`/api/damage-incidents/${f.incident.id}/device-exchange`)
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue)
        .send({
          checkin: { assignmentId: f.oldAssignment.id, returnCondition: 'damaged' },
          checkout: {
            equipmentId: f.replacementLaptop.id,
            userId: student.id,
            assigneeType: 'student',
            checkoutCondition: 'good',
          },
        });

      expect(res.status).toBe(200);
      const newCheckoutId: string = res.body.checkoutAssignment.id;
      expect(res.body.checkoutAssignment.chargerAssignment).toMatchObject({
        id: f.chargerAssignment.id,
        returnedAt: null,
        charger: { serialNumber: f.charger.serialNumber },
      });

      const updatedChargerAssignment = await prisma.chargerAssignment.findUnique({ where: { id: f.chargerAssignment.id } });
      expect(updatedChargerAssignment?.deviceAssignmentId).toBe(newCheckoutId);
      expect(updatedChargerAssignment?.returnedAt).toBeNull();
      expect(updatedChargerAssignment?.chargerId).toBe(f.charger.id);

      const chargerRow = await prisma.charger.findUnique({ where: { id: f.charger.id } });
      expect(chargerRow?.status).toBe('checked_out');

      const activeAssignments = await prisma.deviceAssignment.findMany({
        where: { userId: student.id, returnedAt: null },
      });
      expect(activeAssignments).toHaveLength(1);
      expect(activeAssignments[0]?.id).toBe(newCheckoutId);

      const closedOldAssignment = await prisma.deviceAssignment.findUnique({ where: { id: f.oldAssignment.id } });
      expect(closedOldAssignment?.returnedAt).not.toBeNull();
    } finally {
      await cleanupExchangeFixture(f);
    }
  });

  it('2. skip-checkout (check-in only) leaves the open charger assignment untouched on the old checkout', async () => {
    const f = await seedExchangeFixture();
    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .post(`/api/damage-incidents/${f.incident.id}/device-exchange`)
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue)
        .send({
          checkin: { assignmentId: f.oldAssignment.id, returnCondition: 'damaged' },
        });

      expect(res.status).toBe(200);
      expect(res.body.checkoutAssignment).toBeNull();

      const unchangedChargerAssignment = await prisma.chargerAssignment.findUnique({ where: { id: f.chargerAssignment.id } });
      expect(unchangedChargerAssignment?.deviceAssignmentId).toBe(f.oldAssignment.id);
      expect(unchangedChargerAssignment?.returnedAt).toBeNull();
    } finally {
      await cleanupExchangeFixture(f);
    }
  });
});

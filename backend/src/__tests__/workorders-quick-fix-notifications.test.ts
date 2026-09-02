/**
 * Quick Fix close-notification suppression integration tests.
 *
 * Verifies QUICK_FIX_CLOSE_NOTIFICATION_SUPPRESSION_spec.md: submitting Quick Fix
 * creates a ticket attributed to the checked-out person and immediately closes it
 * as the technician — that close step must NOT enqueue a "work order completed"
 * email/push to the checked-out person, since Quick Fix only logs a fix the
 * technician already performed.
 *
 * `email_queue` (context: 'work_order_closed') is the observable signal — push
 * fans out from the same `sendMail()` call site, so this one assertion covers
 * both channels.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { getTestPrisma, createTestUser, createTestWorkOrder, cleanupTickets, cleanupUsers } from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Quick Fix close-notification suppression', () => {
  const prisma = getTestPrisma();

  let techUser: { id: string; entraId: string; email: string };
  let checkedOutUser: { id: string; entraId: string; email: string };
  let otherUser: { id: string; entraId: string; email: string };
  let location: { id: string };
  let category: { id: string };
  let techToken: string;

  const uid = () => crypto.randomUUID().slice(0, 8);

  async function pollEmailQueue(ticketId: string, timeoutMs: number): Promise<unknown[]> {
    const deadline = Date.now() + timeoutMs;
    let rows: unknown[] = [];
    do {
      rows = await prisma.email_queue.findMany({
        where: { context: 'work_order_closed', relatedEntityId: ticketId },
      });
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    } while (Date.now() < deadline);
    return rows;
  }

  beforeAll(async () => {
    [techUser, checkedOutUser, otherUser] = await Promise.all([
      createTestUser({ cachedGroups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
      createTestUser({}),
      createTestUser({}),
    ]);
    techToken = signTestAccessToken(
      makeTokenPayload(techUser, { groups: [process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID ?? 'test-wo-level-5-group-id'] }),
    );

    location = await prisma.officeLocation.create({
      data: { name: `Test QF Location ${uid()}`, type: 'SCHOOL', isActive: true },
      select: { id: true },
    });

    category = await prisma.workOrderCategory.create({
      data: {
        name: `Test QF Category ${uid()}`,
        module: 'TECHNOLOGY',
        isActive: true,
        quickFix: true,
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await prisma.workOrderCategory.delete({ where: { id: category.id } }).catch(() => {});
    await prisma.officeLocation.delete({ where: { id: location.id } }).catch(() => {});
    await cleanupUsers([techUser.id, checkedOutUser.id, otherUser.id]);
  });

  it('1. Quick Fix enqueues no "work order completed" notification for the checked-out person', async () => {
    const equipment = await prisma.equipment.create({
      data: { assetTag: `TEST-QF-${uid()}`, name: 'Quick Fix Test Laptop' },
      select: { id: true },
    });
    const assignment = await prisma.deviceAssignment.create({
      data: {
        equipmentId: equipment.id,
        userId: checkedOutUser.id,
        assigneeType: 'student',
        checkoutBy: techUser.id,
        checkoutCondition: 'good',
      },
      select: { id: true },
    });

    let ticketId: string | undefined;
    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .post('/api/work-orders/quick-fix')
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue)
        .send({
          reportedByUserId: checkedOutUser.id,
          equipmentId: equipment.id,
          categoryId: category.id,
          issue: 'Trackpad was unresponsive during class.',
          notes: 'Reseated the trackpad cable; confirmed working.',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CLOSED');
      ticketId = res.body.id;

      const rows = await pollEmailQueue(ticketId!, 2000);
      expect(rows).toHaveLength(0);
    } finally {
      if (ticketId) await cleanupTickets([ticketId]);
      await prisma.deviceAssignment.delete({ where: { id: assignment.id } }).catch(() => {});
      await prisma.equipment.delete({ where: { id: equipment.id } }).catch(() => {});
    }
  });

  it('2. control: a normal close by a different user DOES enqueue one', async () => {
    const ticket = await createTestWorkOrder({
      reportedById: checkedOutUser.id,
      officeLocationId: location.id,
    });

    try {
      const { cookieStr, headerValue } = csrfPair();
      const res = await request(app)
        .put(`/api/work-orders/${ticket.id}/status`)
        .set('Cookie', `access_token=${techToken}; ${cookieStr}`)
        .set('x-xsrf-token', headerValue)
        .send({ status: 'CLOSED', notes: 'Resolved directly.' });

      expect(res.status).toBe(200);

      const rows = await pollEmailQueue(ticket.id, 5000);
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await prisma.email_queue.deleteMany({ where: { relatedEntityId: ticket.id } }).catch(() => {});
      await cleanupTickets([ticket.id]);
    }
  });
});

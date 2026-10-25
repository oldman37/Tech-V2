/**
 * Director of Schools Work Order Scope integration tests
 *
 * Verifies: Directors of Schools (ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID, permLevel 4
 * for WORK_ORDERS) see every work order district-wide instead of only tickets at
 * their supervised location (the District Office), while staying below the
 * level-5 hard-delete gate (see
 * .github/docs/subagent_docs/dos_work_order_district_scope_spec.md).
 *
 * Setup:
 *   supervisedLocation   — DoS IS a LocationSupervisor here (mirrors the DO assignment)
 *   unsupervisedLocation — DoS has NO supervisor assignment
 *   supervisedTicket     — TECHNOLOGY, at supervisedLocation
 *   unsupervisedTicket   — TECHNOLOGY, at unsupervisedLocation
 *
 * Verified behaviours:
 *   1. List: DoS sees tickets at both locations.
 *   2. Direct GET by ID: DoS → 200 for the ticket at the unsupervised location.
 *   3. DELETE: DoS → 403 (still level 4).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import {
  createTestUser,
  createTestLocation,
  assignLocationSupervisor,
  createTestWorkOrder,
  cleanupTickets,
  cleanupUsers,
  cleanupLocations,
} from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Work Order Scope — Director of Schools (district-wide)', () => {
  let supervisedLocation: { id: string };
  let unsupervisedLocation: { id: string };
  let dosUser: { id: string; entraId: string; email: string };
  let reporterUser: { id: string; entraId: string; email: string };
  let supervisedTicket: { id: string };
  let unsupervisedTicket: { id: string };
  let dosToken: string;

  beforeAll(async () => {
    [supervisedLocation, unsupervisedLocation] = await Promise.all([
      createTestLocation(),
      createTestLocation(),
    ]);

    const dosGroupId = process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID ?? 'test-dos-group-id';

    [dosUser, reporterUser] = await Promise.all([
      createTestUser({ cachedGroups: [dosGroupId] }),
      createTestUser({ cachedGroups: [] }),
    ]);

    // A supervised location is what scoped level-4 users before the fix.
    await assignLocationSupervisor(dosUser.id, supervisedLocation.id);

    [supervisedTicket, unsupervisedTicket] = await Promise.all([
      createTestWorkOrder({
        reportedById: reporterUser.id,
        officeLocationId: supervisedLocation.id,
        department: 'TECHNOLOGY',
      }),
      createTestWorkOrder({
        reportedById: reporterUser.id,
        officeLocationId: unsupervisedLocation.id,
        department: 'TECHNOLOGY',
      }),
    ]);

    dosToken = signTestAccessToken(makeTokenPayload(dosUser, { groups: [dosGroupId] }));
  });

  afterAll(async () => {
    await cleanupTickets([supervisedTicket.id, unsupervisedTicket.id]);
    await cleanupUsers([dosUser.id, reporterUser.id]);
    await cleanupLocations([supervisedLocation.id, unsupervisedLocation.id]);
  });

  it('DoS list includes work orders at supervised and unsupervised locations', async () => {
    const res = await request(app)
      .get('/api/work-orders')
      .set('Cookie', `access_token=${dosToken}`);

    expect(res.status).toBe(200);
    const items: Array<{ id: string }> = res.body.items ?? [];
    const ids = items.map((wo) => wo.id);
    expect(ids).toContain(supervisedTicket.id);
    expect(ids).toContain(unsupervisedTicket.id);
  });

  it('DoS can read a work order at an unsupervised location', async () => {
    const res = await request(app)
      .get(`/api/work-orders/${unsupervisedTicket.id}`)
      .set('Cookie', `access_token=${dosToken}`);
    expect(res.status).toBe(200);
  });

  it('DoS cannot hard-delete a work order (still level 4)', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .delete(`/api/work-orders/${unsupervisedTicket.id}`)
      .set('Cookie', `access_token=${dosToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Requires WORK_ORDERS level 5');
  });
});

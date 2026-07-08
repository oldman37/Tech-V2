/**
 * Maintenance Director Work Order Scope integration tests
 *
 * Verifies the fix for: Maintenance Directors (ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID,
 * permLevel 4 for WORK_ORDERS) were being scoped by supervised location instead of
 * seeing every MAINTENANCE-department ticket district-wide (see
 * .github/docs/subagent_docs/maintenance_director_ticket_scope_spec.md).
 *
 * Setup:
 *   locationA — director has NO supervisor assignment
 *   maintenanceTicket — MAINTENANCE department, at locationA
 *   technologyTicket  — TECHNOLOGY department, at locationA
 *
 * Verified behaviours:
 *   1. List: director sees the MAINTENANCE ticket despite no location assignment,
 *      and does not see the TECHNOLOGY ticket.
 *   2. Direct GET by ID: director → 200 for the MAINTENANCE ticket, 403 for the
 *      TECHNOLOGY ticket.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import {
  createTestUser,
  createTestLocation,
  createTestWorkOrder,
  cleanupTickets,
  cleanupUsers,
  cleanupLocations,
} from './helpers/db';
import { signTestAccessToken, makeTokenPayload } from './helpers/auth';

describe('Work Order Scope — Maintenance Director (district-wide fix)', () => {
  let location: { id: string };
  let directorUser: { id: string; entraId: string; email: string };
  let reporterUser: { id: string; entraId: string; email: string };
  let maintenanceTicket: { id: string };
  let technologyTicket: { id: string };
  let directorToken: string;

  beforeAll(async () => {
    location = await createTestLocation();

    [directorUser, reporterUser] = await Promise.all([
      createTestUser({ cachedGroups: ['test-maintenance-director-group-id'] }),
      createTestUser({ cachedGroups: [] }),
    ]);

    // Director has no LocationSupervisor row at all — the pre-fix bug scoped
    // permLevel-4 users to zero locations in this exact case.
    [maintenanceTicket, technologyTicket] = await Promise.all([
      createTestWorkOrder({
        reportedById: reporterUser.id,
        officeLocationId: location.id,
        department: 'MAINTENANCE',
      }),
      createTestWorkOrder({
        reportedById: reporterUser.id,
        officeLocationId: location.id,
        department: 'TECHNOLOGY',
      }),
    ]);

    directorToken = signTestAccessToken(
      makeTokenPayload(directorUser, {
        groups: [
          process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID ?? 'test-maintenance-director-group-id',
        ],
      }),
    );
  });

  afterAll(async () => {
    await cleanupTickets([maintenanceTicket.id, technologyTicket.id]);
    await cleanupUsers([directorUser.id, reporterUser.id]);
    await cleanupLocations([location.id]);
  });

  it('director list includes MAINTENANCE tickets district-wide and excludes TECHNOLOGY tickets', async () => {
    const res = await request(app)
      .get('/api/work-orders')
      .set('Cookie', `access_token=${directorToken}`);

    expect(res.status).toBe(200);
    const items: Array<{ id: string }> = res.body.items ?? [];
    const ids = items.map((wo) => wo.id);
    expect(ids).toContain(maintenanceTicket.id);
    expect(ids).not.toContain(technologyTicket.id);
  });

  it('director can read a MAINTENANCE ticket at an unsupervised location', async () => {
    const res = await request(app)
      .get(`/api/work-orders/${maintenanceTicket.id}`)
      .set('Cookie', `access_token=${directorToken}`);
    expect(res.status).toBe(200);
  });

  it('director cannot read a TECHNOLOGY ticket', async () => {
    const res = await request(app)
      .get(`/api/work-orders/${technologyTicket.id}`)
      .set('Cookie', `access_token=${directorToken}`);
    expect(res.status).toBe(403);
  });
});

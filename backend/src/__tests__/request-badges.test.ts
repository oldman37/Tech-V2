/**
 * Requests-nav badge count integration tests.
 *
 * Verifies REQUEST_NAV_BADGES_spec.md: derived, per-user per-section unread
 * counts (RequestSectionView), seeded to now() on first read, excluding the
 * caller's own changes, scoped to the caller's personal involvement only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import {
  getTestPrisma,
  createTestUser,
  createTestWorkOrder,
  createTestComment,
  cleanupUsers,
  cleanupTickets,
} from './helpers/db';
import { signTestAccessToken, makeTokenPayload, csrfPair } from './helpers/auth';

describe('Request Badges', () => {
  const prisma = getTestPrisma();

  let submitter: { id: string; entraId: string; email: string };
  let otherUser: { id: string; entraId: string; email: string };

  let submitterToken: string;
  let otherUserToken: string;

  let poId: string;
  let tripId: string;
  let transportId: string;
  let workOrderId: string;
  let locationId: string;

  beforeAll(async () => {
    [submitter, otherUser] = await Promise.all([
      createTestUser({ cachedGroups: [process.env.ENTRA_ALL_STAFF_GROUP_ID ?? 'test-allstaff-group-id'] }),
      createTestUser({ cachedGroups: [] }),
    ]);

    submitterToken = signTestAccessToken(
      makeTokenPayload(submitter, { groups: [process.env.ENTRA_ALL_STAFF_GROUP_ID ?? 'test-allstaff-group-id'] }),
    );
    // No groups at all — definitively has TECHNOLOGY level 0, well below the
    // level-2 gate inventoryAuditRoutes/roomCheckoutRoutes apply. Used only by
    // test 10 to verify request-badges doesn't inherit that gate.
    otherUserToken = signTestAccessToken(makeTokenPayload(otherUser, { groups: [] }));

    const location = await prisma.officeLocation.create({
      data: { name: `Badge Test Location ${crypto.randomUUID().slice(0, 8)}`, type: 'SCHOOL', isActive: true },
      select: { id: true },
    });

    locationId = location.id;

    const wo = await createTestWorkOrder({ reportedById: submitter.id, officeLocationId: location.id });
    workOrderId = wo.id;

    const po = await prisma.purchase_orders.create({
      data: {
        type: 'equipment',
        requestorId: submitter.id,
        description: 'Badge test PO',
        amount: 100,
      },
      select: { id: true },
    });
    poId = po.id;

    const trip = await prisma.fieldTripRequest.create({
      data: {
        submittedById: submitter.id,
        teacherName: 'Test Teacher',
        schoolBuilding: 'Test School',
        gradeClass: '5th',
        studentCount: 20,
        tripDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        destination: 'Test Destination',
        purpose: 'Badge test trip',
        departureTime: '08:00',
        returnTime: '15:00',
        submitterEmail: submitter.email,
        status: 'PENDING_SUPERVISOR',
        submittedAt: new Date(Date.now() - 60_000),
      },
      select: { id: true },
    });
    tripId = trip.id;

    const transport = await prisma.transportationRequest.create({
      data: {
        submittedById: submitter.id,
        school: 'Test School',
        groupOrActivity: 'Badge test group',
        sponsorName: 'Test Sponsor',
        tripDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        busCount: 1,
        studentCount: 20,
        chaperoneCount: 2,
        loadingLocation: 'Front entrance',
        loadingTime: '08:00',
        leavingSchoolTime: '08:15',
        returnToSchoolTime: '15:00',
        primaryDestinationName: 'Test Destination',
        primaryDestinationAddress: '123 Test St',
        submitterEmail: submitter.email,
      },
      select: { id: true },
    });
    transportId = transport.id;
  });

  afterAll(async () => {
    await prisma.requestSectionView.deleteMany({ where: { userId: { in: [submitter.id, otherUser.id] } } });
    await prisma.transportationRequest.delete({ where: { id: transportId } }).catch(() => {});
    await prisma.fieldTripRequest.delete({ where: { id: tripId } }).catch(() => {});
    await prisma.purchase_orders.delete({ where: { id: poId } }).catch(() => {});
    await cleanupTickets([workOrderId]);
    await cleanupUsers([submitter.id, otherUser.id]);
  });

  it('1. first read seeds all sections and returns all zeros', async () => {
    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      WORK_ORDERS: 0,
      PURCHASE_ORDERS: 0,
      FIELD_TRIPS: 0,
      FIELD_TRIP_APPROVALS: 0,
      TRANSPORTATION_REQUESTS: 0,
    });
  });

  it('2. another user\'s comment on the caller\'s own work order is counted', async () => {
    await createTestComment({ ticketId: workOrderId, authorId: otherUser.id });

    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(res.body.WORK_ORDERS).toBe(1);
  });

  it('3. the caller\'s own comment on their own work order is not counted', async () => {
    // Clear the previous unrelated comment's effect by visiting first.
    const { cookieStr, headerValue } = csrfPair();
    await request(app)
      .post('/api/request-badges/WORK_ORDERS/visited')
      .set('Cookie', `access_token=${submitterToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    await createTestComment({ ticketId: workOrderId, authorId: submitter.id, body: 'my own reply' });

    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(res.body.WORK_ORDERS).toBe(0);
  });

  it('4. a purchase-order status change by someone else is counted; the caller\'s own change is not', async () => {
    await prisma.requisitionStatusHistory.create({
      data: { purchaseOrderId: poId, fromStatus: 'draft', toStatus: 'pending', changedById: otherUser.id },
    });
    const otherRes = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(otherRes.body.PURCHASE_ORDERS).toBe(1);

    const { cookieStr, headerValue } = csrfPair();
    await request(app)
      .post('/api/request-badges/PURCHASE_ORDERS/visited')
      .set('Cookie', `access_token=${submitterToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    await prisma.requisitionStatusHistory.create({
      data: { purchaseOrderId: poId, fromStatus: 'pending', toStatus: 'draft', changedById: submitter.id },
    });
    const selfRes = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(selfRes.body.PURCHASE_ORDERS).toBe(0);
  });

  it('5. a field-trip status change by someone else on the caller\'s own trip is counted', async () => {
    await prisma.fieldTripStatusHistory.create({
      data: {
        fieldTripRequestId: tripId,
        fromStatus: 'PENDING_SUPERVISOR',
        toStatus: 'PENDING_ASST_DIRECTOR',
        changedById: otherUser.id,
        changedByName: 'Other User',
      },
    });
    await prisma.fieldTripRequest.update({ where: { id: tripId }, data: { status: 'PENDING_ASST_DIRECTOR' } });

    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(res.body.FIELD_TRIPS).toBe(1);
  });

  it('6. visiting a section clears its count and returns 0', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const visitRes = await request(app)
      .post('/api/request-badges/FIELD_TRIPS/visited')
      .set('Cookie', `access_token=${submitterToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);
    expect(visitRes.status).toBe(200);
    expect(visitRes.body.count).toBe(0);

    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(res.body.FIELD_TRIPS).toBe(0);
  });

  it('7. a transportation request approved by someone else is counted; the submitter\'s own edit (updatedAt only) is not', async () => {
    await prisma.transportationRequest.update({
      where: { id: transportId },
      data: { supervisorApprovedAt: new Date(), supervisorApprovedById: otherUser.id, status: 'PENDING_SECRETARY_REVIEW' },
    });
    const approvedRes = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(approvedRes.body.TRANSPORTATION_REQUESTS).toBe(1);

    const { cookieStr, headerValue } = csrfPair();
    await request(app)
      .post('/api/request-badges/TRANSPORTATION_REQUESTS/visited')
      .set('Cookie', `access_token=${submitterToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    // Submitter edits their own request — only updatedAt bumps, no new approval timestamp.
    await prisma.transportationRequest.update({
      where: { id: transportId },
      data: { groupOrActivity: 'Updated by submitter' },
    });
    const editRes = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${submitterToken}`);
    expect(editRes.body.TRANSPORTATION_REQUESTS).toBe(0);
  });

  it('8. an unknown section value is rejected with 400', async () => {
    const { cookieStr, headerValue } = csrfPair();
    const res = await request(app)
      .post('/api/request-badges/NOT_A_SECTION/visited')
      .set('Cookie', `access_token=${submitterToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);
    expect(res.status).toBe(400);
  });

  it('9. the endpoint requires authentication', async () => {
    const res = await request(app).get('/api/request-badges');
    expect(res.status).toBe(401);
  });

  it('10. a user with zero TECHNOLOGY access gets a real 200, not an inherited 403 (route-mount-order regression)', async () => {
    // Regression check for the app.ts mount-order bug: inventoryAuditRoutes and
    // roomCheckoutRoutes apply an unconditional, path-less requireModule('TECHNOLOGY', 2)
    // at the bare '/api' prefix. request-badges must be mounted before them, or a
    // user with no TECHNOLOGY group membership at all (otherUser, groups: []) would
    // inherit that gate and get a wrongly-scoped 403 here.
    const res = await request(app)
      .get('/api/request-badges')
      .set('Cookie', `access_token=${otherUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('error');
  });

  it('11. a trip entering the approver\'s stage after their last visit is counted for FIELD_TRIP_APPROVALS', async () => {
    const approver = await createTestUser({
      cachedGroups: [process.env.ENTRA_PRINCIPALS_GROUP_ID ?? 'test-wo-level-3b-group-id'],
    });
    const approverToken = signTestAccessToken(
      makeTokenPayload(approver, { groups: [process.env.ENTRA_PRINCIPALS_GROUP_ID ?? 'test-wo-level-3b-group-id'] }),
    );
    await prisma.userSupervisor.create({
      data: { userId: submitter.id, supervisorId: approver.id },
    });

    try {
      // First read seeds this approver's FIELD_TRIP_APPROVALS lastVisitedAt to now.
      const seedRes = await request(app)
        .get('/api/request-badges')
        .set('Cookie', `access_token=${approverToken}`);
      expect(seedRes.body.FIELD_TRIP_APPROVALS).toBe(0);

      // Trip submitted (and so entering PENDING_SUPERVISOR) after the seed.
      const trip2 = await prisma.fieldTripRequest.create({
        data: {
          submittedById: submitter.id,
          teacherName: 'Test Teacher 2',
          schoolBuilding: 'Test School',
          gradeClass: '5th',
          studentCount: 15,
          tripDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          destination: 'Test Destination 2',
          purpose: 'Badge test trip 2',
          departureTime: '08:00',
          returnTime: '15:00',
          submitterEmail: submitter.email,
          status: 'PENDING_SUPERVISOR',
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      try {
        const res = await request(app)
          .get('/api/request-badges')
          .set('Cookie', `access_token=${approverToken}`);
        expect(res.body.FIELD_TRIP_APPROVALS).toBe(1);
      } finally {
        await prisma.fieldTripRequest.delete({ where: { id: trip2.id } });
      }
    } finally {
      await prisma.userSupervisor.deleteMany({ where: { userId: submitter.id, supervisorId: approver.id } });
      await prisma.requestSectionView.deleteMany({ where: { userId: approver.id } });
      await cleanupUsers([approver.id]);
    }
  });

  it('12. a ticket auto-assigned at creation (assignedToId set on create, no comments) counts for the assignee', async () => {
    // Seed the assignee's WORK_ORDERS lastVisitedAt to now, before the auto-assigned ticket exists.
    const { cookieStr, headerValue } = csrfPair();
    await request(app)
      .post('/api/request-badges/WORK_ORDERS/visited')
      .set('Cookie', `access_token=${otherUserToken}; ${cookieStr}`)
      .set('x-xsrf-token', headerValue);

    // Mirrors createWorkOrder()'s auto-assign path: assignedToId set directly on create, no ticketComment written.
    const autoAssigned = await createTestWorkOrder({
      reportedById: submitter.id,
      officeLocationId: locationId,
      assignedToId: otherUser.id,
    });

    try {
      const res = await request(app)
        .get('/api/request-badges')
        .set('Cookie', `access_token=${otherUserToken}`);
      expect(res.body.WORK_ORDERS).toBe(1);
    } finally {
      await cleanupTickets([autoAssigned.id]);
      await prisma.requestSectionView.deleteMany({ where: { userId: otherUser.id, section: 'WORK_ORDERS' } });
    }
  });
});

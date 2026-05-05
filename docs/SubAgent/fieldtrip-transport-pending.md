# Field Trip Transportation Pending — Root Cause Analysis

**Date:** 2026-05-05  
**Symptom:** An approved field trip request does not appear on the Transportation Pending page for the transportation secretary.

---

## 1. Exact Query / Filter That Populates the Transportation Pending Page

### Frontend call chain

| Step | Location | Detail |
|------|----------|--------|
| UI Tab | `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` line 57–63 | Tab 1 "Transportation Pending" fires `fieldTripTransportationService.listPending` only when the tab is active (`enabled: activeTab === 1`) |
| Frontend service | `frontend/src/services/fieldTripTransportation.service.ts` lines 110–115 | Calls `GET /field-trips/transportation/pending` |
| Route | `backend/src/routes/fieldTrip.routes.ts` lines 218–222 | Maps to `fieldTripTransportationController.listPending` |
| Controller | `backend/src/controllers/fieldTripTransportation.controller.ts` lines 241–253 | Delegates to `fieldTripTransportationService.listPending(userId, permLevel)` |
| **Service query** | `backend/src/services/fieldTripTransportation.service.ts` lines 381–391 | ⬇ |

```ts
// fieldTripTransportation.service.ts  line 381
return prisma.fieldTripTransportationRequest.findMany({
  where:   { status: 'PENDING_TRANSPORTATION' },
  include: TRANSPORT_WITH_TRIP,
  orderBy: { submittedAt: 'asc' },
});
```

**The filter is exclusively `FieldTripTransportationRequest.status === 'PENDING_TRANSPORTATION'`.**

It does **not** look at `FieldTripRequest.status` at all. Two things must be true for a trip to appear:
1. A `FieldTripTransportationRequest` row **exists** in the database.
2. That row's `status` field equals `'PENDING_TRANSPORTATION'`.

---

## 2. Data Model (Prisma Schema)

### FieldTripRequest (`backend/prisma/schema.prisma` lines 523–591)

```
FieldTripRequest {
  id, status, submittedById, transportationNeeded, ...
  transportationRequest   FieldTripTransportationRequest?   // 1:0-1 optional
}
```

Status lifecycle:  
`DRAFT → PENDING_SUPERVISOR → PENDING_ASST_DIRECTOR → PENDING_DIRECTOR → PENDING_FINANCE_DIRECTOR → APPROVED`

### FieldTripTransportationRequest (`backend/prisma/schema.prisma` lines 637–683)

```
FieldTripTransportationRequest {
  id, fieldTripRequestId (UNIQUE), status, busCount, loadingLocation, ...
  // status: DRAFT | PENDING_TRANSPORTATION | TRANSPORTATION_APPROVED | TRANSPORTATION_DENIED
}
```

**This is a completely separate record.** It is created only when the trip submitter (teacher) explicitly fills out the Part A transportation form. It is **never auto-created** by any approval step.

---

## 3. Data Flow — When Is FieldTripTransportationRequest Created?

### Who creates it
The **trip submitter** (teacher) creates it manually:
- Via `POST /api/field-trips/:id/transportation` → `fieldTripTransportationController.create`
- Form page: `/field-trips/:id/transportation` (`FieldTripTransportationPage.tsx`)
- Initial status: `DRAFT`

### When they submit it
The teacher submits their DRAFT form via `POST /api/field-trips/:id/transportation/submit`:
- Transitions `DRAFT → PENDING_TRANSPORTATION`
- Sets `submittedAt`
- **Only at this point does the record appear in the Transportation Pending queue.**

### What the Finance Director approval does (does NOT create the record)
`fieldTrip.service.ts` `approve()` → only updates `FieldTripRequest.status` to `APPROVED`.  
`fieldTrip.controller.ts` `approve()` lines 210–232:
1. Sends "trip fully approved" email to the submitter.
2. Attempts to notify the **Transportation Secretary group** (was silently failing — Bug #1 now fixed).

The transportation secretary notification is **informational only** — it tells the secretary to expect a form. It does **not** create any database record.

### Complete expected workflow
```
1. Teacher submits trip → approval chain → FinDirector approves → FieldTripRequest.status = APPROVED
2. Teacher navigates to /field-trips/:id/transportation  (FieldTripTransportationPage)
3. Teacher fills Part A and clicks Submit → FieldTripTransportationRequest created (DRAFT)
4. Teacher hits "Submit" → status becomes PENDING_TRANSPORTATION
5. Transportation secretary sees row in Transportation Pending queue
6. Secretary/Director approves Part C → TRANSPORTATION_APPROVED
```

---

## 4. Root Cause — Why the Production Trip Does Not Appear

There are **two independent bugs**, both present before the recent patch:

### Bug A (primary) — SUPERVISOR guard blocked transportation form creation

**File:** `backend/src/services/fieldTripTransportation.service.ts`  
**Method:** `create()` starting at line 63

The `create` method fetches the parent trip **including all approvals**:

```ts
// line 64–67 (current code — guard already removed; approvals include is now dead)
const trip = await prisma.fieldTripRequest.findUnique({
  where:   { id: fieldTripId },
  include: { approvals: { orderBy: { actedAt: 'asc' as const } } },  // ← DEAD INCLUDE
});
```

**Before the recent fix**, there was an additional guard here (now removed) that required the field trip to have a SUPERVISOR-stage approval before the teacher could create the transportation form:

```ts
// ORIGINAL code (now deleted):
const hasSupervisorApproval = trip.approvals.some(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
if (!hasSupervisorApproval) {
  throw new ValidationError(
    'Transportation cannot be submitted until the field trip has a supervisor approval',
  );
}
```

**Impact on production trip:** The trip was approved via a path that **bypassed the SUPERVISOR stage** (teacher has no supervisor assigned, so the approval chain skipped directly to ASST_DIRECTOR and up to FINANCE_DIRECTOR). Therefore `hasSupervisorApproval === false`. Every time the teacher tried to create the transportation form, they received a validation error and no `FieldTripTransportationRequest` record was ever inserted.

**Evidence of guard removal:** The `include: { approvals: ... }` at line 66 is completely unused — `trip.approvals` is never referenced anywhere in the current `create` method. This dead include is the direct remnant of the deleted guard.

The same SUPERVISOR guard also existed in the `approve()` and `deny()` methods for transportation Part C, and was **relaxed** (not removed) there to also allow `status === 'APPROVED'`:

```ts
// backend/src/services/fieldTripTransportation.service.ts  lines 262–270 (approve) and 350–362 (deny)
const hasPrincipalApproval = transportRequest.fieldTripRequest.approvals.some(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
const tripIsFullyApproved = transportRequest.fieldTripRequest.status === 'APPROVED';

if (!hasPrincipalApproved && !tripIsFullyApproved) {   // ← relaxed: was !hasPrincipalApproval only
  throw new ValidationError('...');
}
```

### Bug B (secondary) — Finance director notification silently failing

**File:** `backend/src/controllers/fieldTrip.controller.ts` lines 221–232

The `sendFieldTripTransportationNotice` call to the transportation secretary group was failing and being swallowed silently. So even if the secretary was supposed to follow up with the teacher, no notification arrived. Now fixed.

### Why the listPending query returns empty

The query at `fieldTripTransportation.service.ts` line 386:

```ts
where: { status: 'PENDING_TRANSPORTATION' }
```

Returns 0 rows because **no `FieldTripTransportationRequest` record exists** at all for the production trip. The filter itself is logically correct for the Transport Pending queue; it is not the bug.

---

## 5. Exact Fix Needed

### Fix 1 — Code already deployed (SUPERVISOR guard removal + notification fix)

These changes are already live:
- SUPERVISOR guard removed from `create()` (line 66 dead `approvals` include is harmless, can be cleaned up)
- SUPERVISOR guard relaxed in `approve()` and `deny()` (both already show `|| tripIsFullyApproved`)
- Finance director → transportation secretary notification is now in a `try/catch` that logs errors and does not silently swallow them

### Fix 2 — Production data fix (REQUIRED to unblock the existing trip)

The teacher must now complete and submit the Part A transportation form. This is **now unblocked** by Fix 1.

**Path for the teacher:**
1. Log in and navigate to `/field-trips/<trip-id>/transportation`
2. Fill in: bus count, chaperone count, driver info, loading location, loading time, etc.
3. Click Save → then Submit
4. The record transitions `DRAFT → PENDING_TRANSPORTATION`
5. The transportation secretary/director will see it immediately in the Transportation Pending queue

**Alternative: one-time admin/DB script** (if the teacher cannot be reached quickly):
```ts
// Pseudo-code for a seed/repair script
await prisma.fieldTripTransportationRequest.create({
  data: {
    fieldTripRequestId: '<production-trip-id>',
    status:            'DRAFT',
    busCount:          Math.ceil(trip.studentCount / 52),
    chaperoneCount:    0,
    needsDriver:       true,
    loadingLocation:   '(pending)',
    loadingTime:       '(pending)',
  },
});
// Then notify the teacher to log in and complete/submit the form.
```

### Fix 3 — UI discoverability improvement (RECOMMENDED)

**Problem:** `FieldTripDetailPage.tsx` shows `Buses Needed: Yes` (line 304) for APPROVED trips but has no CTA/button prompting the teacher to go submit the transportation form. The teacher has no natural path to discover they need to act.

**File:** `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`  
**Where to add:** After line 304, in the `transportationNeeded` section of the Trip Information card.

Add a conditional Alert + Button when:
- `trip.status === 'APPROVED'`
- `trip.transportationNeeded === true`
- `trip.submittedById === user?.id` (owner only)

```tsx
{trip.status === 'APPROVED' && trip.transportationNeeded && isOwner && (
  <Grid item xs={12}>
    <Alert
      severity="info"
      action={
        <Button
          color="info"
          size="small"
          onClick={() => navigate(`/field-trips/${trip.id}/transportation`)}
        >
          Submit Transportation Form
        </Button>
      }
    >
      Your trip has been approved and requires a transportation request.
      Please complete and submit the Transportation Form (Part A).
    </Alert>
  </Grid>
)}
```

This requires fetching the transportation request status to know if it's already submitted, but even a static alert is an improvement. A more complete version would query `fieldTripTransportationService.getByTripId(trip.id)` and only show the alert if `transport === null` or `transport.status === 'DRAFT'`.

---

## 6. Files and Line Numbers for Every Change Needed

| Priority | File | Line(s) | Action |
|----------|------|---------|--------|
| Data (immediate) | Production DB | — | Create `FieldTripTransportationRequest` DRAFT row for the affected trip; notify teacher to complete and submit |
| Cleanup | `backend/src/services/fieldTripTransportation.service.ts` | 64–67 | Remove dead `include: { approvals: ... }` from `create()` Prisma query — approvals are no longer used here |
| UI (recommended) | `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | ~304 (after transportationNeeded display) | Add Alert + "Submit Transportation Form" Button CTA for APPROVED + transportationNeeded + isOwner |

### Already fixed (no further action needed)
| File | Lines | What was fixed |
|------|-------|----------------|
| `backend/src/services/fieldTripTransportation.service.ts` | 63–84 | SUPERVISOR guard removed from `create()` |
| `backend/src/services/fieldTripTransportation.service.ts` | 262–270 | SUPERVISOR guard relaxed in `approve()` to also allow `tripIsFullyApproved` |
| `backend/src/services/fieldTripTransportation.service.ts` | 350–362 | SUPERVISOR guard relaxed in `deny()` to also allow `tripIsFullyApproved` |
| `backend/src/controllers/fieldTrip.controller.ts` | 221–232 | Transportation secretary notification now in try/catch with proper error logging |

---

## 7. Summary

| Question | Answer |
|----------|--------|
| What filter does Transportation Pending use? | `FieldTripTransportationRequest.status === 'PENDING_TRANSPORTATION'` — a row in that table must exist with that exact status |
| Does it need a FieldTripTransportationRequest record? | **Yes — it is mandatory.** The page has no fallback for showing trips purely from `FieldTripRequest.status`. |
| When is FieldTripTransportationRequest created? | **Manually by the teacher** via the Part A form. It is never auto-created by any approval action. |
| Why is the approved trip not appearing? | **No `FieldTripTransportationRequest` record exists.** It was never created because the old SUPERVISOR guard in `create()` threw a validation error for trips that bypassed the supervisor stage. Additionally, the transportation secretary never received a notification prompting follow-up (notification was silently failing). |
| Is the query filter wrong? | No — the filter is correct. The root issue is a missing row, not a bad filter. |
| What is the fix? | (1) Teacher must now create+submit the Part A form (now unblocked). (2) Optionally run a script to pre-create a DRAFT record on production. (3) Add a UI CTA on FieldTripDetailPage to guide teachers of APPROVED trips to submit the transportation form. |

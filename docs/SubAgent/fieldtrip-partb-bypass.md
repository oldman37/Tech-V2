# Field Trip Part B Bypass — Research Spec

**Date:** 2026-05-05  
**Author:** Research Subagent  
**Status:** Ready for Implementation

---

## 1. Executive Summary

When a supervisor or principal submits a field trip request, the Building Principal (Part B / SUPERVISOR stage) approval step is correctly skipped in the backend approval chain. However, the **frontend component** `TransportationPartCForm.tsx` does not account for this bypass. It looks for a `stage === 'SUPERVISOR'` approval record that never exists in these cases, causing the Transportation Director to see a blocking warning: _"Part C cannot be processed until the Building Principal approves the field trip (Part B)."_

**The backend is already correct.** Only the frontend needs to change.

---

## 2. Status Flow & Approval Chain

### 2.1 Field Trip Status Progression

Defined in `backend/src/services/fieldTrip.service.ts` lines 24–30:

```
DRAFT
  → PENDING_SUPERVISOR        (if submitter has supervisor(s) assigned in user_supervisors table)
    OR
  → PENDING_ASST_DIRECTOR     (if submitter has NO supervisor — the bypass path)
      → PENDING_DIRECTOR
          → PENDING_FINANCE_DIRECTOR
              → APPROVED
```

### 2.2 What Determines Whether SUPERVISOR Stage Is Skipped

In `fieldTrip.service.ts` `submit()` (line 227):

```typescript
const firstStatus =
  snapshot.supervisorEmails.length > 0 ? 'PENDING_SUPERVISOR' : 'PENDING_ASST_DIRECTOR';
```

`snapshot.supervisorEmails` is built by `buildFieldTripApproverSnapshot()` in `email.service.ts` (lines 393–395), querying the `user_supervisors` join table for the submitter's assigned supervisors:

```typescript
const supervisorEmails: string[] = user
  ? user.user_supervisors_user_supervisors_userIdTousers
      .map((us) => us.supervisor.email)
      .filter(Boolean)
  : [];
```

**A supervisor or principal typically has no supervisor assigned above them in the DB**, so `supervisorEmails.length === 0` → the trip goes directly to `PENDING_ASST_DIRECTOR`, skipping the SUPERVISOR stage entirely. No `FieldTripApproval` record with `stage = 'SUPERVISOR'` is ever created.

### 2.3 Auto-Promotion of Transportation Request

When the approval chain reaches `APPROVED` (`fieldTrip.service.ts` lines 317–325), any DRAFT transportation requests are auto-promoted:

```typescript
if (nextStatus === 'APPROVED') {
  await tx.fieldTripTransportationRequest.updateMany({
    where: { fieldTripRequestId: id, status: 'DRAFT' },
    data:  { status: 'PENDING_TRANSPORTATION', submittedAt: new Date() },
  });
}
```

This means: when a transportation request enters `PENDING_TRANSPORTATION`, the parent `FieldTripRequest.status` is **always** `'APPROVED'`.

### 2.4 FieldTripApproval Stage Labels

| Status at approval | `stage` stored |
|--------------------|---------------|
| `PENDING_SUPERVISOR` | `'SUPERVISOR'` |
| `PENDING_ASST_DIRECTOR` | `'ASST_DIRECTOR'` |
| `PENDING_DIRECTOR` | `'DIRECTOR'` |
| `PENDING_FINANCE_DIRECTOR` | `'FINANCE_DIRECTOR'` |

Defined in `fieldTrip.service.ts` `STATUS_TO_STAGE` (lines 33–38).

---

## 3. Role/Permission Levels — Who Is a "Supervisor or Principal"

### Application Roles (`users.role`)

Per `docs/PERMISSIONS_AND_ROLES.md`:

| Role | Typical Users |
|------|--------------|
| `ADMIN` | System administrators, Technology Director |
| `MANAGER` | **Principals, VPs, Directors, Supervisors** |
| `TECHNICIAN` | Technology dept staff |
| `VIEWER` | All staff (default) |

### FIELD_TRIPS Module Permission Levels

Per `backend/src/routes/fieldTrip.routes.ts` (lines 7–12):

| Level | Role |
|-------|------|
| 2 | All staff — create, submit, view own requests |
| **3** | **Supervisors — approve/deny at PENDING_SUPERVISOR stage** |
| 4 | Asst. Director of Schools |
| 5 | Director of Schools |
| 6 | Finance Director / Admin |

**"Supervisor or Principal"** = any user with `FIELD_TRIPS` module permission **level ≥ 3**. These users typically have no supervisor assigned in `user_supervisors`, so their trips bypass the SUPERVISOR stage.

### No `submitterRole` on FieldTripRequest

The `FieldTripRequest` Prisma model (`schema.prisma` lines 523–595) stores only `submittedById` and `submitterEmail`. There is **no `submitterRole` field**. The submitter's role/level must be inferred at processing time via a user lookup or by examining the approval chain.

---

## 4. The Blocking Condition — Exact Location

### 4.1 Frontend — Primary Bug (UI Blocks Action)

**File:** `frontend/src/components/fieldtrip/TransportationPartCForm.tsx`

**Line 66–68:** Look-up for SUPERVISOR approval:
```typescript
const principalApproval = approvals.find(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
```

**Lines 79–82:** `canActOnPartC` guard — the Part C form is only rendered when this is true:
```typescript
const canActOnPartC =
  !isOwner &&
  transport.status === 'PENDING_TRANSPORTATION' &&
  !!principalApproval;          // ← BUG: false when SUPERVISOR stage was bypassed
```

**Lines 351–354:** Blocking warning alert displayed when `canActOnPartC` is false:
```tsx
{!isOwner && transport.status === 'PENDING_TRANSPORTATION' && !principalApproval && (
  <Alert severity="warning">
    Part C cannot be processed until the Building Principal approves the field trip (Part B).
  </Alert>
)}
```

**Line 152:** Part B badge also fails to show a "bypassed" state:
```tsx
{principalApproval ? (
  <Chip icon={<CheckCircleIcon />} label={`Approved by ${principalApproval.actedByName}...`} color="success" />
) : (
  <Chip label="Pending — Principal has not yet approved the field trip" color="warning" />
  // ← Always shows "Pending" even if the stage was legitimately bypassed
)}
```

### 4.2 Backend — Already Correct

**File:** `backend/src/services/fieldTripTransportation.service.ts`

**Lines 290–299** (`approve()`) and **Lines 350–359** (`deny()`):
```typescript
const hasPrincipalApproval = transportRequest.fieldTripRequest.approvals.some(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
const tripIsFullyApproved = transportRequest.fieldTripRequest.status === 'APPROVED';

if (!hasPrincipalApproval && !tripIsFullyApproved) {
  throw new ValidationError(
    'Transportation cannot be processed until the field trip has been approved by the Building Principal',
  );
}
```

The backend comment (lines 284–286) even documents the bypass case: _"principal must have approved, OR the trip bypassed the supervisor stage (i.e., submitted by a user with no supervisor assigned) and is now fully APPROVED."_

Since the parent `FieldTripRequest.status` is **always** `'APPROVED'` by the time the transport is in `PENDING_TRANSPORTATION`, `tripIsFullyApproved` is always `true` at this point → the backend guard never throws. **No backend change needed.**

---

## 5. How to Detect the Bypass at Part C Processing Time

The bypass is detectable in the frontend with the data already available in the component:

```typescript
const trip = transport.fieldTripRequest;   // always included via TRANSPORT_WITH_TRIP

// SUPERVISOR stage was bypassed if the trip is APPROVED but has no SUPERVISOR approval record
const supervisorStageWasBypassed = trip?.status === 'APPROVED' && !principalApproval;
```

`trip.status` is typed as `FieldTripStatus` on the `FieldTripRequest` interface (`frontend/src/types/fieldTrip.types.ts` line 283 + 114). It is already included in the API response via the `TRANSPORT_WITH_TRIP` Prisma include (since `fieldTripRequest` returns all scalar fields without explicit select).

---

## 6. The Fix

### 6.1 File to Edit

**`frontend/src/components/fieldtrip/TransportationPartCForm.tsx`**

**No backend changes are needed.**

### 6.2 Change 1 — Add bypass detection variables (after line 68, before line 70)

After the existing `principalApproval` definition, add:

```typescript
// SUPERVISOR stage is considered satisfied if:
//   (a) a SUPERVISOR-stage approval record exists, OR
//   (b) the trip reached APPROVED status without one (i.e., submitted by a supervisor/principal
//       who had no supervisor assigned — the stage was legitimately skipped during submit)
const supervisorStageWasBypassed = trip?.status === 'APPROVED' && !principalApproval;
const partBSatisfied = !!principalApproval || supervisorStageWasBypassed;
```

### 6.3 Change 2 — Fix `canActOnPartC` (lines 79–82)

Change:
```typescript
const canActOnPartC =
  !isOwner &&
  transport.status === 'PENDING_TRANSPORTATION' &&
  !!principalApproval;
```

To:
```typescript
const canActOnPartC =
  !isOwner &&
  transport.status === 'PENDING_TRANSPORTATION' &&
  partBSatisfied;
```

### 6.4 Change 3 — Fix Part B badge (lines 152–161)

Change:
```tsx
{principalApproval ? (
  <Chip
    icon={<CheckCircleIcon />}
    label={`Approved by ${principalApproval.actedByName} on ${new Date(principalApproval.actedAt).toLocaleDateString('en-US')}`}
    color="success"
    variant="outlined"
  />
) : (
  <Chip
    label="Pending — Principal has not yet approved the field trip"
    color="warning"
    variant="outlined"
  />
)}
```

To:
```tsx
{principalApproval ? (
  <Chip
    icon={<CheckCircleIcon />}
    label={`Approved by ${principalApproval.actedByName} on ${new Date(principalApproval.actedAt).toLocaleDateString('en-US')}`}
    color="success"
    variant="outlined"
  />
) : supervisorStageWasBypassed ? (
  <Chip
    icon={<CheckCircleIcon />}
    label="N/A — Submitted by Building Principal (approval step bypassed)"
    color="success"
    variant="outlined"
  />
) : (
  <Chip
    label="Pending — Principal has not yet approved the field trip"
    color="warning"
    variant="outlined"
  />
)}
```

### 6.5 Change 4 — Fix blocking alert (lines 351–354)

Change:
```tsx
{!isOwner && transport.status === 'PENDING_TRANSPORTATION' && !principalApproval && (
  <Alert severity="warning">
    Part C cannot be processed until the Building Principal approves the field trip (Part B).
  </Alert>
)}
```

To:
```tsx
{!isOwner && transport.status === 'PENDING_TRANSPORTATION' && !partBSatisfied && (
  <Alert severity="warning">
    Part C cannot be processed until the Building Principal approves the field trip (Part B).
  </Alert>
)}
```

---

## 7. Summary of All File Paths and Line Numbers

| File | Line(s) | Issue | Change |
|------|---------|-------|--------|
| `frontend/src/components/fieldtrip/TransportationPartCForm.tsx` | 66–68 | `principalApproval` find — only looks at SUPERVISOR stage | Add `supervisorStageWasBypassed` + `partBSatisfied` variables after line 68 |
| `frontend/src/components/fieldtrip/TransportationPartCForm.tsx` | 79–82 | `canActOnPartC` uses `!!principalApproval` | Replace with `partBSatisfied` |
| `frontend/src/components/fieldtrip/TransportationPartCForm.tsx` | 152–161 | Part B badge shows "Pending" even when stage was bypassed | Add middle branch for `supervisorStageWasBypassed` |
| `frontend/src/components/fieldtrip/TransportationPartCForm.tsx` | 351–354 | Blocking warning uses `!principalApproval` | Replace with `!partBSatisfied` |
| `backend/src/services/fieldTripTransportation.service.ts` | 290–299 | `approve()` — already handles bypass via `tripIsFullyApproved` | **No change needed** |
| `backend/src/services/fieldTripTransportation.service.ts` | 350–359 | `deny()` — already handles bypass via `tripIsFullyApproved` | **No change needed** |

---

## 8. Supporting Evidence — Why the Backend Is Already Safe

When `fieldTrip.service.ts` `approve()` (line 317) reaches `nextStatus === 'APPROVED'`, it atomically promotes any DRAFT transport requests to `PENDING_TRANSPORTATION` in the **same database transaction** (lines 317–325). This guarantees that `transportRequest.fieldTripRequest.status === 'APPROVED'` is always `true` when a transportation request is in `PENDING_TRANSPORTATION` status. Therefore the backend condition:

```typescript
if (!hasPrincipalApproval && !tripIsFullyApproved)  // → always false → never throws
```

...correctly permits processing without a SUPERVISOR approval.

The frontend just needs to mirror this same logic using the `trip.status` that is already present in the response payload via `TRANSPORT_WITH_TRIP` include (email.service.ts `FieldTripApproverSnapshot` include shape).

# Field Trip Admin Self-Approval Bug — Specification

**Prepared by:** Research Agent  
**Date:** May 12, 2026  
**Status:** Ready for Implementation

---

## 1. Executive Summary

An admin user (`jlewis@ocboe.com`) can approve a field trip request at **every stage** of the approval chain by themselves. The approval workflow has four sequential stages (Supervisor → Asst. Director → Director → Finance Director), and a single user should never be able to approve at more than one stage on the same request.

### Root Cause

Two gaps combine to allow this:

1. **Backend (`fieldTrip.service.ts`):** The `approve()`, `deny()`, and `sendBack()` methods check `if (!isAdmin && permLevel !== minLevel)` — when the user IS an admin, the permission check is bypassed entirely. There is **no check** for whether the same `userId` already has an approval record on the same field trip request.

2. **Backend (`groupAuth.ts` → `requireModule`):** For ADMIN users, `permLevel` is set to `Math.max(derived, minLevel)`, so admins always satisfy the route-level middleware check.

3. **Frontend (`FieldTripDetailPage.tsx`):** The `showActionButtons` flag is `isPending && !isOwner && !isTerminal` — there is **no check** for whether the current user already approved at a prior stage.

---

## 2. Approval Workflow Reference

### 2.1 Status Flow

```
DRAFT
  └─(submit)──► PENDING_SUPERVISOR        (permLevel ≥ 3)
                    └─(approve)──► PENDING_ASST_DIRECTOR    (permLevel = 4)
                                       └─(approve)──► PENDING_DIRECTOR      (permLevel = 5)
                                                          └─(approve)──► PENDING_FINANCE_DIRECTOR (permLevel = 6)
                                                                             └─(approve)──► APPROVED
```

### 2.2 Stage Constants (from `fieldTrip.service.ts`)

| Status                      | Stage Label        | Min Perm Level |
|-----------------------------|--------------------|----------------|
| `PENDING_SUPERVISOR`        | `SUPERVISOR`       | 3              |
| `PENDING_ASST_DIRECTOR`     | `ASST_DIRECTOR`    | 4              |
| `PENDING_DIRECTOR`          | `DIRECTOR`         | 5              |
| `PENDING_FINANCE_DIRECTOR`  | `FINANCE_DIRECTOR` | 6              |

### 2.3 Data Model

**`FieldTripApproval` table** (schema line ~598):
- `fieldTripRequestId` — links to the request
- `stage` — `'SUPERVISOR' | 'ASST_DIRECTOR' | 'DIRECTOR' | 'FINANCE_DIRECTOR'`
- `action` — `'APPROVED' | 'DENIED' | 'SENT_BACK'`
- `actedById` — the user who took the action
- `actedAt` — timestamp

This table already records **who** approved at **which stage**, making the fix straightforward — we just need to query it.

---

## 3. Current Behavior (The Bug)

### 3.1 Backend — No Duplicate-Approver Check

**File:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts`  
**Method:** `approve()` (line ~275)

```typescript
async approve(
  userId:    string,
  id:        string,
  permLevel: number,
  isAdmin:   boolean,
  notes?:    string,
) {
  const trip = await this.findOrThrow(id);

  const minLevel = STAGE_MIN_LEVEL[trip.status];
  if (!minLevel) {
    throw new ValidationError(
      `Field trip is not in an approvable state (current status: ${trip.status})`,
    );
  }
  // ❌ BUG: If isAdmin is true, this entire check is skipped.
  // ❌ BUG: No check for whether userId already approved at a prior stage.
  if (!isAdmin && permLevel !== minLevel) {
    throw new AuthorizationError(
      `Insufficient permission to approve at the ${trip.status} stage`,
    );
  }
  // ... proceeds to create approval record and advance status
}
```

The same pattern exists in `deny()` (~line 354) and `sendBack()` (~line 430).

### 3.2 Backend — Admin permLevel Inflation  

**File:** `c:\Tech-V2\backend\src\utils\groupAuth.ts`  
**Function:** `requireModule()` (line ~148)

```typescript
if (req.user.roles?.includes('ADMIN')) {
  req.user.permLevel = Math.max(derivePermLevelFromGroups(groups, module), minLevel);
  next();
  return;
}
```

For the `/approve` route with `requireModule('FIELD_TRIPS', 3)`, an admin's `permLevel` is set to at least 3. Then in the service, `isAdmin = true` bypasses the exact-level check entirely.

### 3.3 Frontend — No Previous-Approval Check

**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx`  
**Lines ~167–170:**

```typescript
const isPending        = PENDING_STATUSES.has(trip.status);
const isOwner          = trip.submittedById === user?.id;
const isNeedsRevision  = trip.status === 'NEEDS_REVISION';
const isTerminal       = TERMINAL_STATUSES.has(trip.status);

const showActionButtons = isPending && !isOwner && !isTerminal;
```

No check for `trip.approvals?.some(a => a.actedById === user?.id)`.

### 3.4 Reproduction Steps

1. Log in as admin (`jlewis@ocboe.com`)
2. Have any user submit a field trip request
3. Navigate to the pending field trip
4. Click "Approve" at PENDING_SUPERVISOR stage
5. Refresh — the trip is now at PENDING_ASST_DIRECTOR
6. Click "Approve" again — succeeds (same user, different stage)
7. Repeat for PENDING_DIRECTOR and PENDING_FINANCE_DIRECTOR
8. Trip is APPROVED — all four approval records have the same `actedById`

---

## 4. Expected Behavior

A user (including admins) who has already approved (action = `'APPROVED'`) at any prior stage of a field trip request should **not** be able to approve at a subsequent stage of the **same** request. This enforces separation of duties — the approval chain requires different people at each stage.

**Rules:**
- If `actedById = currentUserId` exists in `FieldTripApproval` for this request with `action = 'APPROVED'`, reject the approval attempt with a clear error message.
- The submitter (`submittedById`) should also be prevented from approving their own trip (this already works via `!isOwner` on frontend, but should be enforced on backend too).
- Deny and Send Back are **not** subject to this restriction — any authorized approver at the current stage should be able to deny or send back, even if they approved at a prior stage. (Denial/send-back are protective actions, not progressive approvals.)

---

## 5. Files Requiring Changes

| # | File | Change Type |
|---|------|-------------|
| 1 | `c:\Tech-V2\backend\src\services\fieldTrip.service.ts` | Add duplicate-approver check in `approve()` |
| 2 | `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx` | Add frontend guard + informational message |
| 3 | `c:\Tech-V2\frontend\src\components\fieldtrip\FieldTripApprovalStepper.tsx` | (Optional) Show "You approved this stage" indicator |

---

## 6. Exact Code Changes

### 6.1 Backend — `fieldTrip.service.ts`

**Location:** Inside the `approve()` method, after the `STAGE_MIN_LEVEL` check and before creating the approval record.

**Add this check after line ~290 (after the `if (!isAdmin && permLevel !== minLevel)` block):**

```typescript
// ── Duplicate-approver guard ──────────────────────────────────────────
// Prevent the same user from approving at multiple stages of the same
// request. This enforces separation of duties in the approval chain.
const priorApproval = await prisma.fieldTripApproval.findFirst({
  where: {
    fieldTripRequestId: id,
    actedById:          userId,
    action:             'APPROVED',
  },
  select: { stage: true },
});

if (priorApproval) {
  throw new ValidationError(
    `You have already approved this request at the ${priorApproval.stage} stage. ` +
    `A different approver is required for the ${stage} stage.`,
  );
}
```

**Full updated `approve()` method context:**

```typescript
async approve(
  userId:    string,
  id:        string,
  permLevel: number,
  isAdmin:   boolean,
  notes?:    string,
) {
  const trip = await this.findOrThrow(id);

  const minLevel = STAGE_MIN_LEVEL[trip.status];
  if (!minLevel) {
    throw new ValidationError(
      `Field trip is not in an approvable state (current status: ${trip.status})`,
    );
  }
  if (!isAdmin && permLevel !== minLevel) {
    throw new AuthorizationError(
      `Insufficient permission to approve at the ${trip.status} stage`,
    );
  }

  const stage      = STATUS_TO_STAGE[trip.status];
  const nextStatus = APPROVAL_CHAIN[trip.status];

  // ── Duplicate-approver guard ──────────────────────────────────────────
  // Prevent the same user from approving at multiple stages of the same
  // request. This enforces separation of duties in the approval chain.
  const priorApproval = await prisma.fieldTripApproval.findFirst({
    where: {
      fieldTripRequestId: id,
      actedById:          userId,
      action:             'APPROVED',
    },
    select: { stage: true },
  });

  if (priorApproval) {
    throw new ValidationError(
      `You have already approved this request at the ${priorApproval.stage} stage. ` +
      `A different approver is required for the ${stage} stage.`,
    );
  }

  const approver = await prisma.user.findUnique({
    // ... rest of method unchanged
  });
```

**Note:** This check is placed **outside** the `$transaction` block intentionally — it's a read-only guard that does not need transactional isolation. The `findOrThrow(id)` already fetches the trip's current status, and the approval record query is a simple existence check. In the unlikely event of a race condition (two requests for the same user arriving simultaneously), the database will simply create two approval records — but this is an edge case that doesn't warrant the complexity of a serializable transaction, and the second approval would advance a status the first already advanced, resulting in a `ValidationError` on the status check.

### 6.2 Frontend — `FieldTripDetailPage.tsx`

**Location:** After the existing access control variables (line ~170), add a duplicate-approver check and update `showActionButtons`.

**Change the access control block from:**

```typescript
const isPending        = PENDING_STATUSES.has(trip.status);
const isOwner          = trip.submittedById === user?.id;
const isNeedsRevision  = trip.status === 'NEEDS_REVISION';
const isTerminal       = TERMINAL_STATUSES.has(trip.status);

const showActionButtons = isPending && !isOwner && !isTerminal;
```

**To:**

```typescript
const isPending        = PENDING_STATUSES.has(trip.status);
const isOwner          = trip.submittedById === user?.id;
const isNeedsRevision  = trip.status === 'NEEDS_REVISION';
const isTerminal       = TERMINAL_STATUSES.has(trip.status);

// Check if the current user already approved at a prior stage
const hasAlreadyApproved = trip.approvals?.some(
  (a) => a.actedById === user?.id && a.action === 'APPROVED',
) ?? false;

const showActionButtons = isPending && !isOwner && !isTerminal && !hasAlreadyApproved;
```

**Add an informational Alert** after the `showActionButtons` block (near line ~260, right before the existing action buttons paper):

```tsx
{/* Inform user they already approved at a prior stage */}
{isPending && !isOwner && !isTerminal && hasAlreadyApproved && (
  <Alert severity="info" sx={{ mb: 3 }}>
    You have already approved this request at a prior stage.
    A different approver is required for the current stage.
  </Alert>
)}
```

### 6.3 Frontend — `FieldTripApprovalStepper.tsx` (Optional Enhancement)

No changes required for the fix to work. However, to improve UX, you could highlight which stages the current user approved. This is a nice-to-have and can be deferred.

---

## 7. What This Fix Does NOT Change

- **Deny / Send Back:** These operations are NOT restricted by the duplicate-approver check. Any authorized approver at the current stage can deny or send back, even if they approved at a prior stage. Rationale: deny and send-back are protective/corrective actions, not progressive approvals.
- **Admin route bypass:** Admins still bypass the `requireModule` route-level check (they can access the approve endpoint). The service-level guard is what prevents them from self-approving multiple stages.
- **Permission level checks for non-admins:** The existing `permLevel !== minLevel` check remains unchanged. Non-admin users still need the exact permission level for each stage.
- **Resubmission flow:** When a trip is sent back and resubmitted, new approval records are created for the resubmission. Prior approvals from the previous submission cycle are still in the database but the status resets to `PENDING_SUPERVISOR` (or `PENDING_ASST_DIRECTOR`), so the workflow restarts naturally. The duplicate-approver check will still apply across all approvals for the request — if the same admin approved stage 1 on the first submission, they cannot re-approve stage 1 on the resubmission.

### 7.1 Consideration: Resubmission and Prior Approvals

When a trip is sent back (`NEEDS_REVISION`) and resubmitted, the existing `FieldTripApproval` records from prior submission cycles remain in the database. The proposed `findFirst` query checks ALL approvals for the request, not just the current cycle.

**This is the correct behavior** — if the same person approved stage 1 before, they should not be able to approve stage 1 again after resubmission. However, if this is deemed too restrictive, the query could be scoped to only approvals created after the most recent submission timestamp:

```typescript
// Alternative: scope to current submission cycle only
const priorApproval = await prisma.fieldTripApproval.findFirst({
  where: {
    fieldTripRequestId: id,
    actedById:          userId,
    action:             'APPROVED',
    actedAt:            { gte: trip.submittedAt ?? new Date(0) },
  },
  select: { stage: true },
});
```

**Recommendation:** Start with the simpler check (all approvals). If users report issues with resubmission flows, add the `actedAt` filter.

---

## 8. Testing Plan

### 8.1 Manual Tests

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Admin approves at PENDING_SUPERVISOR, then tries to approve at PENDING_ASST_DIRECTOR | Backend returns 400 with "You have already approved this request at the SUPERVISOR stage" |
| 2 | Admin approves at PENDING_SUPERVISOR; a different admin approves at PENDING_ASST_DIRECTOR | Both approvals succeed |
| 3 | Non-admin supervisor (permLevel=3) approves at PENDING_SUPERVISOR, then tries to approve at PENDING_ASST_DIRECTOR | Fails on permission check (permLevel 3 < 4), not the duplicate check |
| 4 | Admin denies at PENDING_ASST_DIRECTOR after approving at PENDING_SUPERVISOR | Deny succeeds (no duplicate-approver restriction on deny) |
| 5 | Admin sends back at PENDING_DIRECTOR after approving at PENDING_SUPERVISOR | Send back succeeds |
| 6 | Frontend hides Approve/Deny/Send Back buttons when user already approved at a prior stage | Buttons not shown; info Alert displayed |
| 7 | Trip is sent back and resubmitted; original approver sees info message at PENDING_SUPERVISOR | Info Alert shown, buttons hidden |

### 8.2 Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| 1 | User is both submitter AND admin | Cannot approve (blocked by `!isOwner` on frontend, and submitter should not approve own request) |
| 2 | Concurrent approval requests from same admin | Second request should fail on status check (`trip.status` already advanced) |
| 3 | Trip with no supervisor (skips to PENDING_ASST_DIRECTOR) | Duplicate check still applies at remaining 3 stages |

---

## 9. Summary of the Bug

The field trip approval system correctly tracks WHO approved at each stage via the `FieldTripApproval` table, but **never queries that data to prevent the same person from approving at multiple stages**. Combined with the admin role bypassing permission-level checks entirely, an admin can walk a request through all four approval stages by themselves — defeating the purpose of a multi-stage approval chain.

The fix is a single `findFirst` query in the backend `approve()` method (13 lines of code) plus a frontend guard to hide buttons and show an informational message (5 lines of logic + a small Alert component).

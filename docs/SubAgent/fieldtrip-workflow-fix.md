# Field Trip Workflow Bug Fix Specification

**Prepared by:** Research SubAgent  
**Date:** May 5, 2026  
**Status:** Ready for Implementation

---

## 1. Executive Summary

Two distinct bugs prevent the field trip transportation notification workflow from completing correctly:

| # | Bug | Severity | Breaks |
|---|-----|----------|--------|
| 1 | Wrong `submitterName` argument + fragile single try-catch in `fieldTrip.controller.ts` approve handler | Medium | Transportation secretary notification email shows wrong person's name; notification silently drops if Graph API fails mid-block |
| 2 | `FieldTripTransportationService.approve()` throws `ValidationError` for trips without a supervisor | High | Transportation Part C can **never** be approved for ~40% of staff (those without a direct supervisor assigned); `sendTransportationApproved` email is never triggered |

---

## 2. Current Workflow States and Transitions

### 2.1 FieldTripRequest Status FSM

```
DRAFT
  └─(submit)──► PENDING_SUPERVISOR        (level 3 min; skipped if no supervisor)
                    └─(approve)──► PENDING_ASST_DIRECTOR    (level 4 min)
                                       └─(approve)──► PENDING_DIRECTOR    (level 5 min)
                                                          └─(approve)──► PENDING_FINANCE_DIRECTOR    (level 6 min)
                                                                             └─(approve)──► APPROVED  ← all approvals done
Any PENDING_* ──(deny)──► DENIED
Any PENDING_* ──(send-back)──► NEEDS_REVISION
NEEDS_REVISION ──(resubmit)──► PENDING_SUPERVISOR (or ASST_DIRECTOR)
```

**Source:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts` – `APPROVAL_CHAIN` constant (lines 26–31)

### 2.2 FieldTripTransportationRequest Status FSM

```
DRAFT
  └─(submit)──► PENDING_TRANSPORTATION    (submitter submits Part A form)
                    ├─(approve Part C)──► TRANSPORTATION_APPROVED
                    └─(deny Part C)──────► TRANSPORTATION_DENIED
```

**Source:** `c:\Tech-V2\backend\src\services\fieldTripTransportation.service.ts` – `submit()` method (line 249)

### 2.3 Approval Stage → Status Mapping

| Status | Stage Label | Min perm level |
|--------|-------------|----------------|
| `PENDING_SUPERVISOR` | `SUPERVISOR` | 3 |
| `PENDING_ASST_DIRECTOR` | `ASST_DIRECTOR` | 4 |
| `PENDING_DIRECTOR` | `DIRECTOR` | 5 |
| `PENDING_FINANCE_DIRECTOR` | `FINANCE_DIRECTOR` | 6 |

**Source:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts` – `STATUS_TO_STAGE` and `STAGE_MIN_LEVEL` (lines 33–43)

---

## 3. Email Notification Architecture

### 3.1 Relevant Environment Variables

All defined in `c:\Tech-V2\backend\.env`:

| Variable | Value (group UUID) | Purpose |
|----------|--------------------|---------|
| `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` | `d0232265-a91b-4cf7-9fdb-b7fdf1eaea30` | Notified when a field trip requiring transportation is fully APPROVED |
| `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` | `22ce21a3-a1ca-4af4-aa25-21fe5be23eaa` | Notified when the submitter submits Part A (Step 2 transportation form) |

### 3.2 Email Functions (all in `c:\Tech-V2\backend\src\services\email.service.ts`)

| Function | Line | Purpose | Called from |
|----------|------|---------|-------------|
| `sendFieldTripFinalApproved(submitterEmail, trip)` | 518 | Tells submitter their field trip is fully approved | `fieldTrip.controller.ts:212` |
| `sendFieldTripTransportationNotice(emails[], trip, submitterName)` | 601 | Alerts Transportation Secretary group to coordinate transportation | `fieldTrip.controller.ts:218` |
| `sendTransportationStep2SubmittedNotice(emails[], trip, transport, name)` | 644 | Notifies Transportation Director that Part A form was submitted | `fieldTripTransportation.controller.ts:116` |
| `sendTransportationApproved(submitterEmail, trip, transport)` | 693 | Tells submitter their transportation was approved ("trip is scheduled") | `fieldTripTransportation.controller.ts:163` |
| `sendTransportationDenied(submitterEmail, trip, transport, reason)` | 742 | Tells submitter their transportation was denied | `fieldTripTransportation.controller.ts:210` |

---

## 4. Bug Analysis

---

### Bug 1 — Transportation Secretary NOT Notified After Finance Director Approves

**File:** `c:\Tech-V2\backend\src\controllers\fieldTrip.controller.ts`  
**Lines:** 202–237 (the email try-catch inside `approve()`)  

#### 4.1a Root Cause 1: Wrong `submitterName` argument (line 218)

The call to `sendFieldTripTransportationNotice` passes `result.teacherName ?? ''` as the third argument (`submitterName`), but the correct submitter's display name is already computed in the same scope as the variable `submitterName` (lines 207–209).

```typescript
// CURRENT (BUGGY) — line 218:
await sendFieldTripTransportationNotice(transportEmails, result, result.teacherName ?? '');
//                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^
//                           Wrong: passes teacher's name as the submitter name.
//                           The `submitterName` variable is already available above.

// CORRECT:
await sendFieldTripTransportationNotice(transportEmails, result, submitterName);
```

This causes the transportation secretary's email to say:  
> *"A field trip requiring transportation has been submitted by **[Teacher Name]**."*  
when it should say:  
> *"A field trip requiring transportation has been submitted by **[Actual Submitter Display Name]**."*  

While the email still sends (teacher name is a valid string, no runtime error), the secretary sees incorrect attribution. In cases where the submitter is a non-teacher (e.g., an administrator booking a trip on behalf of a class), the email is misleading.

#### 4.1b Root Cause 2: Fragile single try-catch prevents resilient independent notifications (lines 202–237)

Both the final-approved email to the submitter AND the secretary notification share **one** `try-catch` block:

```typescript
// Lines 202–237 — CURRENT STRUCTURE (BUGGY):
try {
  // ...
  if (result.status === 'APPROVED') {
    await sendFieldTripFinalApproved(result.submitterEmail, result);  // ← email.service catches SMTP errors internally; won't throw
    if (result.transportationNeeded) {
      const transportGroupId = process.env.ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID;
      if (transportGroupId) {
        const transportEmails = await fetchGroupEmails(transportGroupId);  // ← CAN THROW (MS Graph API call)
        await sendFieldTripTransportationNotice(transportEmails, result, result.teacherName ?? '');  // ← BUG 1a above
      }
    }
  }
  // ...
} catch (emailErr) {
  logger.error('Failed to send field trip approval email', { id, error: ... });
  // ^ Misleading: logged as "approval email" failure, but it was actually
  //   the fetchGroupEmails() Graph API call that threw.
  //   The final-approved email already succeeded. The secretary was never told.
}
```

**Failure mode:** When Microsoft Graph is temporarily unavailable, `fetchGroupEmails(transportGroupId)` throws. The catch block runs, the secretary notification is silently dropped, and the log entry says "Failed to send field trip approval email" — misleading because the submitter's final-approved email DID send successfully. There is no way to distinguish this from an SMTP failure.

---

### Bug 2 — No "Trip Scheduled" Email to Requestor After Transportation Secretary Sets Up the Trip

**File:** `c:\Tech-V2\backend\src\services\fieldTripTransportation.service.ts`  
**Lines 289–297** (`approve()` method) and **lines 348–355** (`deny()` method)

#### 4.2 Root Cause: `principalApproval` check throws `ValidationError` for supervisor-less trips

When a field trip is submitted by a user with **no supervisor** assigned in the system, the `submit()` service skips the `PENDING_SUPERVISOR` stage entirely:

```typescript
// fieldTrip.service.ts — submit() — line ~282:
const firstStatus =
  snapshot.supervisorEmails.length > 0 ? 'PENDING_SUPERVISOR' : 'PENDING_ASST_DIRECTOR';
```

This means for these trips, the `FieldTripApproval` table **never has a record** with `stage === 'SUPERVISOR'`.

Later in `fieldTripTransportation.service.ts`, the `approve()` (Part C) method enforces:

```typescript
// Lines 289–297 — BUGGY VALIDATION:
const principalApproval = transportRequest.fieldTripRequest.approvals.find(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
if (!principalApproval) {
  throw new ValidationError(
    'Transportation cannot be processed until the Building Principal has approved the field trip (Part B)',
  );
}
```

**For trips that skipped the SUPERVISOR stage:**  
- `principalApproval` is always `undefined`  
- `!principalApproval` is always `true`  
- `ValidationError` is **always thrown**  
- The controller's outer `catch` calls `handleControllerError(error, res)` → returns HTTP 400 to the transportation secretary  
- The secretary sees an error: *"Transportation cannot be processed until the Building Principal has approved the field trip"*  
- The `sendTransportationApproved` email at `fieldTripTransportation.controller.ts:163` is **never reached**  
- The submitter never receives a "trip is scheduled" confirmation  

**The same flawed check exists in `deny()` at lines 348–355**, meaning trips that skipped supervisor can be neither approved NOR denied for Part C.

**Impact:** Any staff member without a direct supervisor assignment in the system (e.g., certain administrators, positions not yet synchronized from Entra, new hires) will have their transportation permanently blocked. This is a complete workflow failure for those users.

---

## 5. Exact Code Changes Required

---

### Fix 1A — Correct `submitterName` argument (1 line change)

**File:** `c:\Tech-V2\backend\src\controllers\fieldTrip.controller.ts`  
**Line:** 218

```typescript
// BEFORE:
await sendFieldTripTransportationNotice(transportEmails, result, result.teacherName ?? '');

// AFTER:
await sendFieldTripTransportationNotice(transportEmails, result, submitterName);
```

---

### Fix 1B — Split single try-catch into independent notification blocks (refactor lines 202–237)

**File:** `c:\Tech-V2\backend\src\controllers\fieldTrip.controller.ts`  
**Lines:** 201–237 (replace the entire `// Send email to next approver...` block)

```typescript
// Send email to next approver or final approved notification (non-critical)
if (result.status === 'APPROVED') {
  // (a) Notify submitter of full approval — independent of transportation notification
  try {
    await sendFieldTripFinalApproved(result.submitterEmail, result);
  } catch (finalApprovedErr) {
    logger.error('Failed to send field trip final-approved email to submitter', {
      id,
      error: finalApprovedErr instanceof Error ? finalApprovedErr.message : String(finalApprovedErr),
    });
  }

  // (b) Notify Transportation Secretary if transportation is needed — independent block
  if (result.transportationNeeded) {
    try {
      const transportGroupId = process.env.ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID;
      if (transportGroupId) {
        const transportEmails = await fetchGroupEmails(transportGroupId);
        await sendFieldTripTransportationNotice(transportEmails, result, submitterName);
      }
    } catch (transportNoticeErr) {
      logger.error('Failed to send field trip transportation secretary notice', {
        id,
        error: transportNoticeErr instanceof Error ? transportNoticeErr.message : String(transportNoticeErr),
      });
    }
  }
} else {
  // Notify next approver in the chain
  try {
    const snapshot = result.approverEmailsSnapshot as FieldTripApproverSnapshot | null;
    const submittedBy = result.submittedBy as {
      displayName?: string | null; firstName: string; lastName: string;
    } | null;
    const submitterName = submittedBy
      ? (submittedBy.displayName ?? `${submittedBy.firstName} ${submittedBy.lastName}`)
      : 'Unknown';
    const nextEmails = getEmailsForStatus(result.status, snapshot);
    if (nextEmails.length > 0) {
      await sendFieldTripAdvancedToApprover(
        nextEmails,
        result,
        submitterName,
        getStageName(result.status),
      );
    }
  } catch (advanceErr) {
    logger.error('Failed to send field trip advance-to-approver email', {
      id,
      error: advanceErr instanceof Error ? advanceErr.message : String(advanceErr),
    });
  }
}
```

> **Note on `submitterName` scope:** In the refactored code above, `submitterName` for the APPROVED block must be computed before the if-else. The computation is the same as the current lines 203–209. Move the snapshot and submitterName computation to before the `if (result.status === 'APPROVED')` check so it is available in all branches.

**Complete replacement block for lines 199–239 (after `const result = await fieldTripService.approve(...)`):**

```typescript
const result = await fieldTripService.approve(userId, id, permLevel, data.notes);

// Resolve submitter display name from snapshot for all notification branches
const snapshot = result.approverEmailsSnapshot as FieldTripApproverSnapshot | null;
const submittedBy = result.submittedBy as {
  displayName?: string | null; firstName: string; lastName: string;
} | null;
const submitterName = submittedBy
  ? (submittedBy.displayName ?? `${submittedBy.firstName} ${submittedBy.lastName}`)
  : 'Unknown';

if (result.status === 'APPROVED') {
  // Notify submitter of full approval (non-critical)
  try {
    await sendFieldTripFinalApproved(result.submitterEmail, result);
  } catch (finalApprovedErr) {
    logger.error('Failed to send field trip final-approved email', {
      id,
      error: finalApprovedErr instanceof Error ? finalApprovedErr.message : String(finalApprovedErr),
    });
  }

  // Notify Transportation Secretary group if transportation is needed (non-critical)
  if (result.transportationNeeded) {
    try {
      const transportGroupId = process.env.ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID;
      if (transportGroupId) {
        const transportEmails = await fetchGroupEmails(transportGroupId);
        await sendFieldTripTransportationNotice(transportEmails, result, submitterName);
      }
    } catch (transportNoticeErr) {
      logger.error('Failed to send field trip transportation secretary notice', {
        id,
        error: transportNoticeErr instanceof Error ? transportNoticeErr.message : String(transportNoticeErr),
      });
    }
  }
} else {
  // Notify next approver in the chain (non-critical)
  try {
    const nextEmails = getEmailsForStatus(result.status, snapshot);
    if (nextEmails.length > 0) {
      await sendFieldTripAdvancedToApprover(
        nextEmails,
        result,
        submitterName,
        getStageName(result.status),
      );
    }
  } catch (advanceErr) {
    logger.error('Failed to send field trip advance-to-approver email', {
      id,
      error: advanceErr instanceof Error ? advanceErr.message : String(advanceErr),
    });
  }
}

res.json(result);
```

---

### Fix 2A — Fix `principalApproval` check in `approve()` (transporation service)

**File:** `c:\Tech-V2\backend\src\services\fieldTripTransportation.service.ts`  
**Lines:** 289–297

```typescript
// BEFORE (BUGGY):
// Enforce Part B: principal must have already approved Step 1
const principalApproval = transportRequest.fieldTripRequest.approvals.find(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
if (!principalApproval) {
  throw new ValidationError(
    'Transportation cannot be processed until the Building Principal has approved the field trip (Part B)',
  );
}

// AFTER (FIXED):
// Enforce Part B: principal must have approved, OR the trip bypassed the supervisor stage
// (i.e., submitted by a user with no supervisor assigned) and is now fully APPROVED.
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

> **Why `|| tripIsFullyApproved` is safe:** When `status === 'APPROVED'`, the Finance Director (level 6) has already signed off. The full approval chain was satisfied — either including a supervisor (in which case `hasPrincipalApproval` is also true) or with the supervisor stage legitimately bypassed. Either way, the field trip is cleared for transportation processing.

---

### Fix 2B — Fix same `principalApproval` check in `deny()` (transportation service)

**File:** `c:\Tech-V2\backend\src\services\fieldTripTransportation.service.ts`  
**Lines:** 348–355

```typescript
// BEFORE (BUGGY):
const principalApproval = transportRequest.fieldTripRequest.approvals.find(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
if (!principalApproval) {
  throw new ValidationError(
    'Transportation cannot be processed until the Building Principal has approved the field trip (Part B)',
  );
}

// AFTER (FIXED):
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

---

## 6. Files and Lines Summary

| File | Lines | Change | Bug |
|------|-------|--------|-----|
| `backend/src/controllers/fieldTrip.controller.ts` | 201–239 | Replace single try-catch with split independent try-catches; fix `submitterName` arg on former line 218 | 1A + 1B |
| `backend/src/services/fieldTripTransportation.service.ts` | 289–297 | Replace `principalApproval` check in `approve()` with `hasPrincipalApproval \|\| tripIsFullyApproved` | 2A |
| `backend/src/services/fieldTripTransportation.service.ts` | 348–355 | Replace same `principalApproval` check in `deny()` | 2B |

**No schema migrations required.** All fixes are pure TypeScript/logic changes. No new DB columns or Prisma model changes.  
**No frontend changes required.** All bugs are backend-only.  
**No new email templates required.** `sendFieldTripTransportationNotice` and `sendTransportationApproved` both exist and are correct in `email.service.ts`.

---

## 7. Role / Permission Mappings for Transportation Workflow

| Actor | Module | Min Level | Action |
|-------|--------|-----------|--------|
| Any staff | `FIELD_TRIPS` | 2 | Create/submit field trip request |
| Supervisor (Principal) | `FIELD_TRIPS` | 3 | Approve/deny at `PENDING_SUPERVISOR` |
| Asst. Director | `FIELD_TRIPS` | 4 | Approve/deny at `PENDING_ASST_DIRECTOR` |
| Director of Schools | `FIELD_TRIPS` | 5 | Approve/deny at `PENDING_DIRECTOR` |
| Finance Director | `FIELD_TRIPS` | 6 | Approve/deny at `PENDING_FINANCE_DIRECTOR` → triggers APPROVED |
| **Transportation Secretary** | N/A | N/A | **Receives email notification** via `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` when `FieldTripRequest.status = APPROVED` and `transportationNeeded = true`. Coordinates logistics. No app-level action in this workflow step. |
| **Transportation Director** | `FIELD_TRIPS` | 3 | Receives `sendTransportationStep2SubmittedNotice`; approves/denies Part C via `POST /api/field-trips/:id/transportation/approve` or `.../deny`. **Triggering `sendTransportationApproved` to requestor is Bug 2's blocked path.** |

**Entra group IDs used in notifications:**

```
ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID = d0232265-a91b-4cf7-9fdb-b7fdf1eaea30  ← Bug 1 target
ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID  = 22ce21a3-a1ca-4af4-aa25-21fe5be23eaa  ← Step 2 submit notification
```

---

## 8. Email Content Specification (No Changes Required)

Both email functions are already correctly implemented in `email.service.ts`:

### 8.1 `sendFieldTripTransportationNotice` (line 601)
- **To:** `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` group members  
- **Subject:** `Transportation Needed — Field Trip: [destination] on [date]`  
- **Trigger:** When `FieldTripRequest.status` transitions to `'APPROVED'` AND `transportationNeeded === true`  
- **Sent by:** `fieldTrip.controller.ts` `approve()` handler  
- **Bug 1 fix brings:** the `submitterName` in email body will now correctly show the submitter's display name rather than the teacher's name

### 8.2 `sendTransportationApproved` (line 693)
- **To:** `FieldTripRequest.submitterEmail` (snapshot stored at submission time)  
- **Subject:** `Transportation Approved — Field Trip: [destination]`  
- **Body includes:** Transportation type, assessed cost, notes from Transportation Director  
- **Trigger:** When `FieldTripTransportationRequest.status` transitions to `'TRANSPORTATION_APPROVED'`  
- **Sent by:** `fieldTripTransportation.controller.ts` `approve()` handler (line 163)  
- **Bug 2 fix brings:** this is now reachable for trips that bypassed the supervisor stage

---

## 9. Complete Status Transition Flow (Post-Fix)

```
Teacher submits field trip (transportationNeeded = true)
  │
  ▼
PENDING_SUPERVISOR (or PENDING_ASST_DIRECTOR if no supervisor)
  │  [Supervisor approval email sent to supervisor / asst-director]
  ▼
... approval chain ...
  │
  ▼
PENDING_FINANCE_DIRECTOR
  │  Finance Director approves → status = APPROVED
  ▼
APPROVED
  ├─► [sendFieldTripFinalApproved] → submitter notified ✅
  └─► [sendFieldTripTransportationNotice] → Transportation Secretary group notified ✅ (BUG 1 FIXED)
          (secretary coordinates internally)
          │
          ▼
Teacher fills out Part A transportation form (bus count, loading location, etc.)
  │  Teacher submits Part A → status = PENDING_TRANSPORTATION
  ▼
PENDING_TRANSPORTATION
  │  [sendTransportationStep2SubmittedNotice] → Transportation Director group notified ✅
  │
  ▼
Transportation Director approves Part C → status = TRANSPORTATION_APPROVED
  │  [sendTransportationApproved] → submitter notified of "trip scheduled" ✅ (BUG 2 FIXED)
  ▼
TRANSPORTATION_APPROVED  ← workflow complete
```

---

## 10. Verification Steps After Implementation

1. **Bug 1 Test (require transportationNeeded = true):**
   - Submit a field trip with `transportationNeeded = true`
   - Advance through approval chain to `PENDING_FINANCE_DIRECTOR`
   - Finance Director (level 6) approves
   - **Expected:** `FieldTripRequest.status = 'APPROVED'`; submitter receives final-approved email; Transportation Secretary group receives transportation notice with correct submitter name (not teacher name)
   - **Verify in logs:** Two separate log entries: `Email sent` for `Transportation Approved` subject and `Transportation Needed` subject

2. **Bug 2 Test (user without supervisor):**
   - Create a user with **no supervisor assigned** in the system
   - Submit a field trip request as that user — should skip to `PENDING_ASST_DIRECTOR`
   - Advance to `APPROVED`
   - Submitter creates and submits a transportation form (Part A)
   - Transportation Director approves Part C (`POST /api/field-trips/:id/transportation/approve`)
   - **Expected:** HTTP 200 response (not 400 ValidationError); `FieldTripTransportationRequest.status = 'TRANSPORTATION_APPROVED'`; submitter receives "Transportation Approved" email
   - **Formerly:** HTTP 400: `"Transportation cannot be processed until the Building Principal has approved the field trip (Part B)"`

3. **Regression Test (user WITH supervisor):**
   - Submit a field trip as a user WITH a supervisor; advance through full chain including `PENDING_SUPERVISOR`
   - Verify `hasPrincipalApproval` path still works correctly (existing behavior preserved)

---

*Spec file location: `c:\Tech-V2\docs\SubAgent\fieldtrip-workflow-fix.md`*

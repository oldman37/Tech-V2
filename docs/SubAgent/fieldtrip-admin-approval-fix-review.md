# Field Trip Admin Approval Fix — Code Review

**Reviewed by:** Review Agent  
**Date:** May 12, 2026  
**Spec:** `docs/SubAgent/fieldtrip-admin-approval-fix.md`  
**Verdict:** ✅ Acceptable — minor observation noted, no blockers

---

## Files Reviewed

| # | File | Lines Reviewed |
|---|------|----------------|
| 1 | `backend/src/services/fieldTrip.service.ts` | 1–50 (constants), 270–370 (`approve()` method) |
| 2 | `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | 1–50 (imports), 50–100 (state/queries), 150–280 (access control + render) |
| 3 | `backend/prisma/schema.prisma` | 595–630 (`FieldTripApproval` model) |
| 4 | `frontend/src/types/fieldTrip.types.ts` | 35–55 (`FieldTripApproval` interface), 115–145 (`FieldTripRequest`) |

---

## 1. Backend — Duplicate-Approver Guard

### 1.1 Prisma Model & Field Names ✅

The query correctly references:
- **Model:** `prisma.fieldTripApproval` — matches `model FieldTripApproval` in schema (line 598)
- **`fieldTripRequestId: id`** — correct FK field name in schema
- **`actedById: userId`** — correct field name in schema
- **`action: 'APPROVED'`** — correct string value; the schema column is `String`, and the service consistently writes `'APPROVED'`
- **`select: { stage: true }`** — used only for the error message; correct and efficient

### 1.2 Error Handling ✅

- Uses `ValidationError` which maps to HTTP 400 — matches spec requirement
- Error message includes both the prior stage (`priorApproval.stage`) and the current stage (`stage`) — clear and actionable
- `stage` is computed from `STATUS_TO_STAGE[trip.status]` on the line before the guard, so it is defined when referenced in the error message

### 1.3 Placement ✅

The guard is placed:
1. **After** the status check (`STAGE_MIN_LEVEL`) — so invalid-state requests fail fast
2. **After** the permission check (`!isAdmin && permLevel !== minLevel`) — so unauthorized requests fail fast
3. **After** `stage` and `nextStatus` are computed — so `stage` is available for the error message
4. **Before** the `$transaction` block — correct, since it's a read-only guard

### 1.4 Correctness: Allows First Approval, Blocks Subsequent ✅

- `findFirst` with `action: 'APPROVED'` returns `null` when no prior approval exists → first approval proceeds
- Returns the prior approval record when one exists → throws `ValidationError`
- Only checks `'APPROVED'` actions — prior DENIED or SENT_BACK records do not block, which is correct per spec

### 1.5 Deny / Send Back Not Restricted ✅

The `deny()` (line ~379) and `sendBack()` (line ~454) methods do **not** have the duplicate-approver guard. This matches spec section 7: "Deny / Send Back are NOT subject to this restriction."

### 1.6 Race Condition ⚠️ Acceptable

**Scenario:** Two concurrent approval requests from the same admin arrive simultaneously.

- Both call `findFirst` and find no prior approval
- Both enter the `$transaction` and create an approval record
- Both update the trip status to `nextStatus`

**Result:** Two approval records for the same stage by the same user, but the trip only advances one stage. This is a data inconsistency (duplicate record) but not a functional breakage — the second request is a no-op on status since both set the same `nextStatus`.

**Assessment:** The spec explicitly acknowledges this and deems it acceptable (spec section 6.1, note paragraph). The probability is near-zero in practice (same user, two browser windows, exact same instant). Moving the check inside the `$transaction` or adding a unique constraint would add complexity for negligible benefit.

---

## 2. Frontend — `hasAlreadyApproved` Guard

### 2.1 Field References ✅

```typescript
trip.approvals?.some(
  (a) => a.actedById === user?.id && a.action === 'APPROVED',
) ?? false;
```

- **`trip.approvals`** — optional field on `FieldTripRequest`, typed as `FieldTripApproval[]`
- **`a.actedById`** — exists on `FieldTripApproval` interface (line 41 of types file)
- **`a.action`** — exists on `FieldTripApproval` interface, typed as `'APPROVED' | 'DENIED' | 'SENT_BACK'`
- **`user?.id`** — from auth store, safely optional-chained
- **`?? false`** — correct fallback when `approvals` is `undefined`

### 2.2 Data Availability ✅

- The detail endpoint uses `TRIP_WITH_RELATIONS` which includes `approvals` with **no `select` clause** — all fields are returned, including `actedById`
- The list endpoint uses `TRIP_LIST_INCLUDE` which selects only `{ id, stage, action, actedAt, actedByName }` — `actedById` is **excluded**. This is fine because `hasAlreadyApproved` is only used on the detail page, not the list page.

### 2.3 `showActionButtons` Update ✅

```typescript
const showActionButtons = isPending && !isOwner && !isTerminal && !hasAlreadyApproved;
```

Correctly adds `!hasAlreadyApproved` to the existing guard.

### 2.4 Informational Alert ✅

```tsx
{isPending && !isOwner && !isTerminal && hasAlreadyApproved && (
  <Alert severity="info" sx={{ mb: 3 }}>
    You have already approved this request at a prior stage.
    A different approver is required for the current stage.
  </Alert>
)}
```

- Condition is the exact inverse of `showActionButtons` with `hasAlreadyApproved` toggled — logically correct
- `severity="info"` — appropriate for a non-error notification
- Positioned between the transportation CTA and the action buttons — correct placement

### 2.5 TypeScript ✅

No compile errors reported by the editor for either modified file.

---

## 3. Observation: Deny/Send-Back Button Visibility

**Spec prose (sections 4 & 7):** "Deny and Send Back are NOT subject to this restriction — any authorized approver at the current stage should be able to deny or send back, even if they approved at a prior stage."

**Spec code changes (section 6.2):** `showActionButtons = isPending && !isOwner && !isTerminal && !hasAlreadyApproved` — hides **all** buttons (Approve, Deny, Send Back) when `hasAlreadyApproved` is true.

**Implementation:** Matches the spec's code changes exactly — all buttons are hidden.

**Assessment:** There is an internal inconsistency in the spec between the prose and the prescribed code changes. The implementation follows the code changes, which is the correct choice. Practically, hiding all buttons for a prior approver is defensible — a user who already participated in the approval chain probably should not be the one to deny or send back at a later stage either, as this undermines the same separation-of-duties principle. The backend still permits deny/send-back from prior approvers as a safety valve (e.g., API calls from other clients). **No action required** unless product requirements explicitly demand that prior approvers can deny/send-back from the UI.

---

## 4. Summary

| Check | Result |
|-------|--------|
| Correct Prisma model and field names | ✅ Pass |
| Proper error type and HTTP status | ✅ Pass (`ValidationError` → 400) |
| Frontend references correct API fields | ✅ Pass |
| TypeScript compile errors | ✅ None |
| First approval allowed, duplicates blocked | ✅ Pass |
| Deny/Send Back not restricted (backend) | ✅ Pass |
| Race condition handling | ⚠️ Acceptable (documented) |
| Deny/Send Back button visibility (frontend) | ⚠️ Observation — matches spec code, minor prose inconsistency |

**Verdict:** The implementation is correct, matches the spec's prescribed code changes, and is ready to merge. No blocking issues found.

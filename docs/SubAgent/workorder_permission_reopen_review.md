# Work Order Permission Fix & Reopen Feature — Code Review

**Document:** `docs/SubAgent/workorder_permission_reopen_review.md`
**Date:** 2026-04-29
**Reviewer:** GitHub Copilot
**Spec reference:** `docs/SubAgent/workorder_permission_reopen_spec.md`
**Verdict:** NEEDS_REFINEMENT

---

## Build Results

| Target | Command | Result |
|--------|---------|--------|
| Backend | `cd backend ; npx tsc --noEmit` | ✅ 0 errors |
| Frontend | `cd frontend ; npx tsc --noEmit` | ✅ 0 errors |

---

## Verification Checklist

| # | Item | File | Result |
|---|------|------|--------|
| 1 | All `to: 'CLOSED'` entries have `minLevel: 3` | `work-orders.service.ts` | ✅ PASS |
| 2 | Assignment check block fully removed from `updateStatus` | `work-orders.service.ts` | ✅ PASS |
| 3 | `CLOSED` transitions include `{ to: 'OPEN', minLevel: 3 }` | `work-orders.service.ts` | ✅ PASS |
| 4 | `RESOLVED` transitions include `{ to: 'OPEN', minLevel: 3 }` | `work-orders.service.ts` | ✅ PASS |
| 5 | `updateStatus` clears `closedAt` and `resolvedAt` on reopen | `work-orders.service.ts` | ✅ PASS |
| 6 | `ALLOWED_NEXT_STATUSES` present and correct for all 5 statuses | `WorkOrderDetailPage.tsx` | ❌ FAIL — 3 of 5 entries incorrect |
| 7 | State dropdown filters by the map | `WorkOrderDetailPage.tsx` | ✅ PASS |
| 8 | Reopen button present, only visible when `status === 'CLOSED'` | `WorkOrderDetailPage.tsx` | ✅ PASS |
| 9 | No `console.log` statements added | both files | ✅ PASS |
| 10 | No PII in logs | both files | ✅ PASS |
| 11 | No leftover partial assignment check code | `work-orders.service.ts` | ✅ PASS |

---

## Findings

### CRITICAL

#### C1 — `ALLOWED_NEXT_STATUSES` does not match backend `VALID_TRANSITIONS` for 3 statuses

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, lines ~78–84

The frontend client-side transition map contains three entries not supported by the backend state machine. These options appear in the status dropdown but will always return an error from the backend (`Cannot transition work order from X to Y`).

| From | Frontend allows | Backend allows | Issue |
|------|----------------|----------------|-------|
| `OPEN` | `IN_PROGRESS`, **`ON_HOLD`**, `CLOSED` | `IN_PROGRESS`, `CLOSED` | `ON_HOLD` not a valid backend transition |
| `IN_PROGRESS` | **`OPEN`**, `ON_HOLD`, `RESOLVED`, `CLOSED` | `ON_HOLD`, `RESOLVED`, `CLOSED` | `OPEN` not a valid backend transition |
| `ON_HOLD` | **`OPEN`**, `IN_PROGRESS`, `CLOSED` | `IN_PROGRESS`, `CLOSED` | `OPEN` not a valid backend transition |
| `RESOLVED` | `CLOSED`, `OPEN` | `CLOSED`, `IN_PROGRESS`, `OPEN` | ✅ (addressed separately in R1) |
| `CLOSED` | `OPEN` | `OPEN` | ✅ |

**Required fix — correct the map to mirror the backend exactly:**

```typescript
const ALLOWED_NEXT_STATUSES: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD:     ['IN_PROGRESS', 'CLOSED'],
  RESOLVED:    ['CLOSED', 'IN_PROGRESS', 'OPEN'],
  CLOSED:      ['OPEN'],
};
```

---

### RECOMMENDED

#### R1 — `ALLOWED_NEXT_STATUSES.RESOLVED` missing `IN_PROGRESS`

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, line ~84

Current implementation:
```typescript
RESOLVED: ['CLOSED', 'OPEN'],
```

The backend supports `RESOLVED → IN_PROGRESS` (`minLevel: 3`). This was a valid transition before the fix and remains valid after. Omitting it from the frontend map means users cannot revert a RESOLVED ticket back to IN_PROGRESS via the dropdown, despite the backend supporting it.

**Required fix:** Add `'IN_PROGRESS'` to the RESOLVED list (see C1 corrected map above, which already includes it).

---

#### R2 — Reopen error from `handleReopenClick` is invisible to the user

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, lines ~170–179

`handleReopenClick` calls `setStatusError(...)` on failure, but `statusError` is only rendered inside the Update Status dialog. Since that dialog is not open when the Reopen button is clicked, the error alert is never displayed to the user — failures silently disappear.

The spec (Step 5) explicitly notes: _"Display `statusError` outside the dialog so reopen errors are visible without opening the dialog."_

**Required fix:** Add a `statusError` alert in the main page body, outside the dialog. Place it in the header section near the action buttons:

```tsx
{statusError && !statusOpen && (
  <Alert severity="error" onClose={() => setStatusError(null)} sx={{ mb: 2 }}>
    {statusError}
  </Alert>
)}
```

---

### OPTIONAL

#### O1 — Reopen button uses `ReplayIcon` instead of `RestoreIcon`

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, line ~44

Spec step 5 specifies `RestoreIcon` (`@mui/icons-material/Restore`). Implementation uses `ReplayIcon` (`@mui/icons-material/Replay`). Both are semantically similar icons. This is cosmetic only.

#### O2 — Reopen button missing `color="warning"` prop

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, line ~295

Spec step 5 shows `color="warning"` on the Reopen button. The implementation omits it, so the button renders in the default theme color rather than amber/warning. Cosmetic only.

#### O3 — `ALLOWED_NEXT_STATUSES` typed as `Record<string, string[]>` instead of `Record<WorkOrderStatus, WorkOrderStatus[]>`

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`, line ~78

Using `WorkOrderStatus` keys and values would provide compile-time exhaustiveness checking and catch future state machine mismatches at build time.

---

## Positive Observations

- **Backend timestamp handling is correct and comprehensive.** The reopen branch (`data.status === 'OPEN' && (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED')`) clears both `closedAt` and `resolvedAt` in a single else-if, correctly handling both CLOSED→OPEN and RESOLVED→OPEN. This is more robust than the minimal spec example (which only cleared `closedAt`).
- **Assignment check fully removed.** No remnants of the dual-blocker remain. The `updateStatus` method is clean.
- **Audit trail preserved.** Every reopen is recorded in `TicketStatusHistory` with `changedById` and optional `notes`.
- **No PII in log statements.** Logs use `ticketId`, `userId` (opaque IDs), `from`/`to` status — no user-identifying data.
- **TypeScript strict mode passes** on both frontend and backend.

---

## Summary

The backend implementation is fully correct and spec-compliant. Issue 1 (permission fix) and Issue 2 (reopen timestamps/transitions) are properly implemented server-side.

The frontend has one correctness failure (C1 + R1): `ALLOWED_NEXT_STATUSES` diverges from the backend state machine in 4 of 5 entries, presenting users with dropdown options that will always fail at the API. This must be corrected before the feature can be considered done. The reopen error silencing (R2) is a secondary UX correctness issue that should also be addressed.

**Return: NEEDS_REFINEMENT**

Required before approval:
1. Fix `ALLOWED_NEXT_STATUSES` to match the backend VALID_TRANSITIONS exactly (C1, R1 addressed together)
2. Surface reopen errors outside the dialog (R2)

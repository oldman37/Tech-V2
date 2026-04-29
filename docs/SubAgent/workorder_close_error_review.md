# Work Order Close/Complete Authorization Error — Code Review

**Date:** 2026-04-29  
**Reviewer:** Review SubAgent  
**Spec Reference:** `docs/SubAgent/workorder_close_error_spec.md`  
**Files Reviewed:**
- `backend/src/services/work-orders.service.ts`
- `frontend/src/pages/WorkOrderDetailPage.tsx`

---

## Build Validation

| Target | Command | Result |
|--------|---------|--------|
| Backend | `cd backend ; npx tsc --noEmit` | **SUCCESS** (0 errors) |
| Frontend | `cd frontend ; npx tsc --noEmit` | **SUCCESS** (0 errors) |

---

## Finding Summary

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| C1 | **CRITICAL** | Security / Correctness | Assignment check does not cover `RESOLVED` — level-3 users can resolve any work order |
| C2 | **CRITICAL** | Security / Correctness | Assignment check ignores `reportedById` — reporters cannot close their own work orders |
| C3 | **CRITICAL** | Security / Correctness | Null `assignedToId` edge case silently blocks all level-3 users from closing unassigned work orders |
| R4 | RECOMMENDED | Security | `assertValidTransition` fallback message still exposes internal permission-level number |
| R5 | RECOMMENDED | UX / Completeness | Frontend fallback error string does not match spec (less helpful) |
| R6 | RECOMMENDED | Consistency | `statusError` Alert is missing `onClose` handler unlike identically patterned `commentError` |
| O7 | OPTIONAL | Code Quality | Inline type cast on `err` — consider a shared Axios error helper if one exists in the codebase |
| O8 | OPTIONAL | Security | `groupAuth.ts` `requireModule` 403 message still exposes module/level names (spec Step 4, marked Low) |

---

## Detailed Findings

### C1 — CRITICAL: Assignment Check Does Not Cover RESOLVED

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** ~498–509

**Current code:**
```typescript
if (permLevel === 3 && data.status === 'CLOSED') {
  if (ticket.assignedToId !== userId) {
    ...
    throw new AuthorizationError(
      'You can only close work orders that are assigned to you. ...',
    );
  }
}
```

**Spec required (section 4.1):**
```typescript
if (
  permLevel === 3 &&
  (data.status === 'CLOSED' || data.status === 'RESOLVED') &&
  ticket.assignedToId !== userId &&
  ticket.reportedById !== userId
) { ... }
```

**Impact:** A level-3 technician can mark ANY work order in their location as `RESOLVED` regardless of assignment. The RESOLVED→CLOSED path requires this guard because RESOLVED is the last step before closure. This check must include `RESOLVED`.

**Fix:** Change the condition from `data.status === 'CLOSED'` to `(data.status === 'CLOSED' || data.status === 'RESOLVED')`.

---

### C2 — CRITICAL: Assignment Check Ignores `reportedById`

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** ~498–509

**Current code:**
```typescript
if (ticket.assignedToId !== userId) {
  throw new AuthorizationError(...);
}
```

**Spec required (section 4.1):**
```typescript
ticket.assignedToId !== userId &&
ticket.reportedById !== userId
```

**Impact:** A level-3 user who *reported* a work order (e.g., a teacher or staff member who filed a tech request) cannot close it even after the work is resolved. The spec explicitly permits reporters to close their own tickets. This causes a workflow regression for self-reported and self-serviced work orders.

**Fix:** Add `&& ticket.reportedById !== userId` to the condition so either the assignee OR the reporter may close/resolve.

---

### C3 — CRITICAL: Null `assignedToId` Edge Case Blocks All Level-3 Users

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** ~498–509

**Current code:**
```typescript
if (ticket.assignedToId !== userId) { ... }
```

When `ticket.assignedToId` is `null` (unassigned work order):
- `null !== userId` → evaluates to `true`
- Every level-3 user attempting `CLOSED` receives the error
- Error message `"You can only close work orders that are assigned to you"` is misleading when nobody is assigned

**Impact:** Unassigned work orders in `RESOLVED` state are permanently un-closeable by any level-3 user. This is a silent regression for the common workflow where a work order is resolved without a formal assignment, or where the assignee was removed after resolution. Only level-4+ supervisors could close them.

**Fix:** The combined C1+C2 fix (adding `reportedById` check per spec) does NOT resolve this issue on its own. An explicit null guard should be added:

```typescript
// Only enforce assignment when the work order is actually assigned to someone
if (
  permLevel === 3 &&
  (data.status === 'CLOSED' || data.status === 'RESOLVED') &&
  ticket.assignedToId !== null &&           // skip check if unassigned
  ticket.assignedToId !== userId &&
  ticket.reportedById !== userId
) {
  throw new AuthorizationError(
    'You can only close or resolve work orders that are assigned to you.',
  );
}
```

Alternatively, if the business rule is that unassigned work orders should *require* supervisor approval before closing, the message should reflect that:
```typescript
if (ticket.assignedToId === null) {
  throw new AuthorizationError(
    'This work order must be assigned before it can be closed. Please contact a supervisor.',
  );
}
```
Either approach is acceptable but the current silent behavior is not.

---

### R4 — RECOMMENDED: `assertValidTransition` Fallback Still Exposes Permission Level

**File:** `backend/src/services/work-orders.service.ts`  
**Lines:** ~205–212

**Current code:**
```typescript
if (permLevel < rule.minLevel) {
  throw new AuthorizationError(
    toStatus === 'CLOSED'
      ? 'You do not have the required permissions to close this work order.'
      : `Permission level ${rule.minLevel}+ required to move work order to ${toStatus}`,  // ← still leaks
  );
}
```

The spec (section 4.2) required all transition denial messages to avoid internal permission-level numbers. The `CLOSED` branch was fixed but the `else` branch (`IN_PROGRESS`, `ON_HOLD`, `RESOLVED`) still exposes `rule.minLevel` in HTTP 403 responses.

**Recommended fix:**
```typescript
throw new AuthorizationError(
  `You do not have permission to change this work order's status to ${toStatus.toLowerCase().replace('_', ' ')}.`,
);
```

---

### R5 — RECOMMENDED: Frontend Fallback Error String Does Not Match Spec

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Lines:** ~170–173

**Current code:**
```typescript
setStatusError(apiMessage ?? 'Failed to update status.');
```

**Spec required (section 4.3):**
```typescript
'Unable to update the work order status. Please try again or contact your supervisor.'
```

The current fallback `'Failed to update status.'` is brief and gives the user no next step. Per Nielsen Norman's error message guidelines (cited in spec section 7), users need to know what they can do to resolve the problem. The spec's message is more actionable.

---

### R6 — RECOMMENDED: `statusError` Alert Missing `onClose` Handler

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Line:** ~467 (inside status dialog `<DialogContent>`)

**Current code:**
```tsx
{statusError && <Alert severity="error">{statusError}</Alert>}
```

**Other error alerts in the same file (commentError, line ~370):**
```tsx
{commentError && <Alert severity="error" onClose={() => setCommentError(null)}>{commentError}</Alert>}
```

The `statusError` alert cannot be manually dismissed by the user, while `commentError` can. This inconsistency means a 403 error message in the status dialog persists until the dialog is closed and reopened.

---

### O7 — OPTIONAL: Inline Type Cast on `err`

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`  
**Lines:** ~170–171

```typescript
const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
```

The inline cast is type-safe (better than `err as any` suggested in spec), but if the codebase has a shared Axios error type helper (common in hooks/queries layers), it would be more consistent to use that. This is minor.

---

### O8 — OPTIONAL: `groupAuth.ts` `requireModule` 403 Message Not Updated

**File:** `backend/src/utils/groupAuth.ts` (line ~151)

Spec Step 4 (Low priority) was to change:
```typescript
message: `Requires ${module} level ${minLevel}`,
// → 
message: 'You do not have permission to perform this action.',
```

This was not implemented. For level 1/2 users hitting the route-level guard, the response still reads `"Requires WORK_ORDERS level 3"`, leaking the module name and level. However, this was explicitly marked as Low/Optional in the spec and is out of scope for the current files under review.

---

## Security Compliance Checklist

| Requirement | Status |
|-------------|--------|
| Assignment check: level 3 only, level 4+ bypass | ⚠️ Partial — `permLevel === 3` condition is correct; level 4+ bypasses correctly; but RESOLVED case and reportedById missing |
| Error message does NOT expose who is assigned | ✅ Pass — logs and messages contain no assignee identity |
| No `console.log` in reviewed files | ✅ Pass — both files use `logger` exclusively |
| Custom error classes used (`AuthorizationError`, not `Error`) | ✅ Pass |
| No sensitive data in logs | ✅ Pass — `logger.warn` logs only `ticketId` and `userId` (requestor), not assignee PII |

---

## Summary Score Table

| Category | Score | Notes |
|----------|-------|-------|
| Best Practices | 7/10 | Good overall structure; logger used correctly; no raw `console.*` |
| Security Compliance | 4/10 | Three critical gaps in authorization logic; partial message sanitization |
| Consistency | 8/10 | Follows existing service/controller patterns; minor Alert inconsistency |
| Maintainability | 8/10 | Clear code, appropriate use of AuthorizationError, readable conditions |
| Completeness vs. Spec | 5/10 | Frontend error extraction done; backend missing RESOLVED, reportedById, null guard |
| Build Validation | 10/10 | Both `tsc --noEmit` checks pass with zero errors |

| | |
|---|---|
| **Weighted Score** | **≈ 60 / 100** |
| **Overall Grade** | **D+ → C** |
| **Assessment** | **NEEDS_REFINEMENT** |

> The build is clean and the frontend error surfacing is implemented correctly. However, the backend authorization logic contains three critical deviations from spec: the guard is missing for `RESOLVED` transitions, it does not allow reporters to close their own tickets, and it silently blocks all level-3 users from closing unassigned work orders. These must be resolved before this feature can be considered production-ready.

---

## Recommended Fix Order

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 1 | C3 — Add null `assignedToId` guard | `work-orders.service.ts` | < 5 min |
| 2 | C1 — Add `RESOLVED` to assignment check | `work-orders.service.ts` | < 2 min |
| 3 | C2 — Add `reportedById` to assignment check | `work-orders.service.ts` | < 2 min |
| 4 | R4 — Fix `assertValidTransition` fallback message | `work-orders.service.ts` | < 5 min |
| 5 | R5 — Update frontend fallback error string | `WorkOrderDetailPage.tsx` | < 2 min |
| 6 | R6 — Add `onClose` to `statusError` Alert | `WorkOrderDetailPage.tsx` | < 2 min |

---

*Review authored by: Review SubAgent | Review file: `docs/SubAgent/workorder_close_error_review.md`*

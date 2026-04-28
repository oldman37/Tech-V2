# Finance Director Permission Bug — Security Fix Review

> **Review Date:** 2026-03-24  
> **Reviewer:** Review Subagent  
> **Spec File:** `docs/SubAgent/finance_director_permission_bug_spec.md`  
> **Verdict:** ⚠️ **NEEDS_REFINEMENT** — One critical security logging violation in new code must be fixed before merge.

---

## Score Summary

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 95% | A |
| Best Practices | 82% | B |
| Functionality | 98% | A+ |
| Code Quality | 87% | B+ |
| Security | 72% | C |
| Performance | 92% | A- |
| Consistency | 88% | B+ |
| Build Success | 100% | A+ |

**Overall Grade: B+ (89%)**

---

## Build Results

| Target | Command | Result | Notes |
|---|---|---|---|
| Backend | `cd c:\Tech-V2\backend && npm run build` | ✅ **PASS** | `tsc` clean — zero errors, zero warnings |
| Frontend | `cd c:\Tech-V2\frontend && npm run build` | ✅ **PASS** | `tsc && vite build` clean; chunk-size warning is pre-existing and unrelated |

---

## Findings

### 🔴 CRITICAL

---

#### CRIT-01 — Security: `userGroups` and group ID env vars logged in new `logger.warn` calls

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Lines:** ~785–792 and ~803–812

**Violated spec requirement:** _Security Compliance — MANDATORY — "No sensitive data in logs (no user IDs, group IDs, tokens logged)"_

The two new `logger.warn` calls that fire when a user attempts Finance Director or Director of Schools approval without group membership log:
- `userGroups` — the **full array of the approver's Entra group GUIDs** (extracted from their JWT). An attacker who succeeds in reading the application log can use these to map group memberships.
- `fdGroupId` / `dosGroupId` — the **env-configured Entra group object IDs**, leaking internal group configuration to anyone with log read access.
- `userId` — links the actor's identity to the authorization-failure event in the log.

```typescript
// VIOLATION — both blocks have this pattern:
logger.warn('Finance Director approval attempted without group membership', {
  userId,       // ← user ID in logs (prohibited)
  userGroups,   // ← full group ID array in logs (prohibited)
  fdGroupId,    // ← internal env-configured group ID in logs (prohibited)
});
```

**Required fix:** Replace with a safe, opaque log entry:
```typescript
logger.warn('Finance Director approval attempted without group membership', {
  poId: id,                         // PO being acted on (not sensitive)
  attemptedStage: 'supervisor_approved → finance_director_approved',
});
```
Omit `userId`, `userGroups`, `fdGroupId`, and `dosGroupId` from all security-denial warn entries. The requesting user's identity is already captured in the HTTP access log and JWT audit trail; it does not need to be re-logged here.

**Risk if unresolved:** An attacker probing the approval endpoint without group membership causes warning-level log entries that expose their full group membership profile — reducing the cost of reconnaissance against the Entra group structure.

---

### 🟡 RECOMMENDED

---

#### REC-01 — Deviation from spec: Admin permLevel fallback is `|| 3` instead of `|| 0`

**File:** `backend/src/middleware/permissions.ts`  
**Line:** ~97

**Spec proposed** (Fix 1, alternative approach):
```typescript
req.user!.permLevel = highest;  // → 0 if no DB record
```

**Implemented:**
```typescript
req.user!.permLevel = highest || 3;  // → 3 if no DB record
```

The `|| 3` fallback is intentional (documented in code comment) and not a security regression — level 3 is still below the Finance Director threshold (5). However, it is an undocumented extension to the spec. An Admin with no REQUISITIONS record (e.g. during a migration window) silently receives level 3, which may be more access than expected. This should either be formally accepted as policy or reduced to `|| 0`.

**Risk if unresolved:** Low. Level 3 < 5 prevents FD approval regardless.

---

#### REC-02 — Frontend `canActAtStage` / `stageMinLevel` still gate the "waiting" UI label but not the approve button

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
**Lines:** ~165–167, ~564

The component now computes two separate readiness signals:
- `canActAtStage = permLevel >= stageMinLevel` — used **only** for the "Awaiting Finance Director Approval" waiting label
- `effectiveCanAct = canActAtFdStage || canActAtDosStage || canActAtSupStage` — used for the Approve/Reject button rendering

When a user has `permLevel >= 5` but is NOT in the Finance Director group (edge case after the fix — should be rare but possible if a DB permission row is manually elevated), `canActAtStage = true` but `effectiveCanAct = false`. The result: the "Awaiting Finance Director Approval" label is hidden AND no approve button is shown. The user sees an empty action panel with no explanation.

This is a UX inconsistency. The correct label display logic should use `effectiveCanAct` rather than the permLevel-only `canActAtStage`:
```typescript
// Suggested change on line 564:
{!effectiveCanAct && waitingLabel && po.status !== 'denied' && (
```

**Risk if unresolved:** Minor UX confusion in a rare edge case. No security impact.

---

#### REC-03 — No automated test coverage for the new group membership checks

The spec's Testing Plan (section 9) calls for:
1. Backend unit test: `approvePurchaseOrder` with `permLevel = 6, groups = []` expects `AuthorizationError`
2. Backend integration test: ADMIN JWT + `supervisor_approved` PO → `403`
3. Backend integration test: Finance Director JWT → `200`
4. Frontend unit test: `useRequisitionsPermLevel` with ADMIN returning level 3 from DB

None of these tests appear to exist in the repository. Without automated tests, a future refactor of the middleware ADMIN bypass or service signature could silently re-introduce the vulnerability.

**Recommended action:** Implement the four tests defined in spec section 9 before closing this security ticket.

---

### 🔵 OPTIONAL

---

#### OPT-01 — Frontend safe-degradation when `VITE_ENTRA_FINANCE_DIRECTOR_GROUP_ID` is unset

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
**Lines:** ~180–183

When the env var is not set, the frontend falls back to purely permLevel-based gating:
```typescript
const isFinanceDirector = fdGroupId ? userGroups.includes(fdGroupId) : permLevel >= 5;
```

This mirrors the backend's safe degradation and is functionally correct post-fix (only FD group members have permLevel 5 in DB). Document this in the `.env.example` comment to make the operational consequence explicit.

---

#### OPT-02 — Backend `permissions.ts` debug log includes `userId`

**File:** `backend/src/middleware/permissions.ts`  
**Line:** ~93

```typescript
logger.debug('Admin access granted (DB-derived permLevel)', {
  userId,
  ...
});
```

`debug` level is excluded from production log aggregation in most configurations, so the practical risk is low. However, for strict compliance with the spec's security requirements, consider removing `userId` from all log entries or replacing with a non-reversible correlation token. Note this pattern is pre-existing throughout the file and was not introduced by this fix.

---

## Correctness Analysis — Core Security Questions

| Question | Answer | Evidence |
|---|---|---|
| Can a System Admin still "Approve As Finance Director"? | ✅ **NO** — blocked at two layers | (1) `permissions.ts` DB query returns `permLevel = 3` for ADMIN; `checkPermission('REQUISITIONS', 3)` passes but `permLevel = 3 < 5` blocks FD stage in service. (2) Service group membership check independently rejects non-FD requests. |
| FD approval gated on BOTH `permLevel >= 5` AND Entra group membership? | ✅ **YES** | Service: `permLevel < stageReq.requiredLevel` check then `userGroups.includes(fdGroupId)` check. Frontend: `permLevel >= 5 && isFinanceDirector`. |
| Admin bypass in `permissions.ts` does real DB lookup? | ✅ **YES** | `prisma.userPermission.findMany({ where: { userId } })` is called; result drives `req.user!.permLevel = highest || 3`. |
| `userSync.service.ts` Admin group syncs `REQUISITIONS: level 3`? | ✅ **YES** | Line ~151: `{ module: 'REQUISITIONS', level: 3 }` (was `level: 6`). |
| Frontend hook removes `isAdmin → permLevel: 6` shortcut? | ✅ **YES** | `enabled: !!user?.id` (was `!!user?.id && !isAdmin`); `if (isAdmin) return { permLevel: 6 }` line removed. |
| `PurchaseOrderDetail.tsx` checks group membership for FD button? | ✅ **YES** | `canActAtFdStage = po.status === 'supervisor_approved' && permLevel >= 5 && isFinanceDirector`. |

---

## Regression Analysis

| Scenario | Expected | Verified |
|---|---|---|
| Finance Director user approves at FD stage | ✅ Still works — `permLevel=5` AND in FD group | ✅ Code paths confirm |
| System Admin manages users, views all POs | ✅ Still works — ADMIN bypass calls `next()`, `permLevel=3` gives PO list visibility | ✅ Confirmed |
| `ENTRA_FINANCE_DIRECTOR_GROUP_ID` not set | ✅ Fails safe — service skips group check; permLevel threshold still blocks admin (level 3 < 5) | ✅ Outer `if (fdGroupId \|\| dosGroupId)` guard confirmed |
| Admin has no REQUISITIONS DB record | ✅ Falls back to level 3 (not 0) — still below FD threshold | ✅ `highest \|\| 3` fallback in permissions.ts |
| Director of Schools approves at DOS stage | ✅ DOS group check added; DOS member with `permLevel=6` AND in DOS group can approve | ✅ Confirmed in service (~803-812) |
| Legitimate FD user sees FD button | ✅ `isFinanceDirector = true` (FD group member), `permLevel=5 >= 5` → button shown | ✅ Frontend logic confirmed |

---

## Per-File Assessment

### 1. `backend/src/middleware/permissions.ts`

- ✅ ADMIN bypass replaced with real DB query
- ✅ `highest || 3` fallback prevents Finance-Director-level access for unmapped Admins
- ✅ `return next()` preserved — Admin always passes route gate
- ✅ Expired permission filtering applied to Admin DB results
- ⚠️ REC-01: Fallback is `|| 3` not `|| 0` (minor spec deviation, not a security regression)
- ⚠️ OPT-02: debug log includes `userId` (pre-existing pattern)

### 2. `backend/src/services/userSync.service.ts`

- ✅ System Admin mapped to `REQUISITIONS: level 3` (was `level: 6`) — **core data-layer fix**
- ✅ Comment clarifies rationale: "Admins do NOT hold Finance Director (level 5) or Director of Schools (level 6) approval authority"
- ✅ Director of Schools mapping correctly retains `REQUISITIONS: level 6` (DoS needs it)
- ✅ Finance Director mapping correctly uses `role: USER` + `REQUISITIONS: level 5`
- No new issues

### 3. `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`

- ✅ `enabled` changed from `!!user?.id && !isAdmin` → `!!user?.id` — DB always queried
- ✅ `if (isAdmin) return { permLevel: 6 }` shortcut removed
- ✅ Comment updated to explain design rationale
- ✅ `staleTime: 0` preserved — permissions always refreshed
- No issues

### 4. `backend/src/controllers/purchaseOrder.controller.ts`

- ✅ `const userGroups = req.user!.groups ?? [];` correctly extracts groups from auth context
- ✅ `userGroups` passed as 4th argument to `service.approvePurchaseOrder`
- ✅ `stageLabels` map correctly derives email label from post-approval PO status
- ✅ No `console.log` statements
- No issues

### 5. `backend/src/services/purchaseOrder.service.ts`

- ✅ `approvePurchaseOrder` signature extended with `userGroups: string[]`
- ✅ FD stage (`supervisor_approved`) group check: `fdGroupId || dosGroupId` outer guard + `includes()` per group
- ✅ DOS stage (`finance_director_approved`) group check: `dosGroupId` guard + `includes()`
- ✅ Safe degradation: if neither env var is set, group check is skipped (permLevel threshold still applies)
- ✅ `AuthorizationError` used (not raw errors or `console.log`)
- ✅ Prisma ORM only
- 🔴 **CRIT-01**: `logger.warn` logs `userGroups`, `fdGroupId`/`dosGroupId`, `userId` — violates MANDATORY "no group IDs in logs" security requirement

### 6. `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

- ✅ `isFinanceDirector` and `isDosApprover` derived from `user?.groups` (JWT groups)
- ✅ `canActAtFdStage` gate: `permLevel >= 5 && isFinanceDirector`
- ✅ `canActAtDosStage` gate: `permLevel >= 6 && isDosApprover`
- ✅ `effectiveCanAct` correctly combines all three stage conditions
- ✅ `canApprove` and `canReject` both use `effectiveCanAct` in the else branch
- ⚠️ REC-02: `canActAtStage` (used for waiting label) still uses `permLevel >= stageMinLevel` — minor UX inconsistency in edge cases

### 7. `backend/.env.example`

- ✅ `ENTRA_FINANCE_DIRECTOR_GROUP_ID` documented with comment
- ✅ `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` documented with comment
- ✅ Existing `ENTRA_ADMIN_GROUP_ID` remains
- No issues

### 8. `frontend/.env.example`

- ✅ `VITE_ENTRA_FINANCE_DIRECTOR_GROUP_ID` added with comment
- ✅ `VITE_ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` added with comment
- No issues

---

## Prioritized Action Items

| Priority | ID | File | Action Required |
|---|---|---|---|
| 🔴 CRITICAL | CRIT-01 | `backend/src/services/purchaseOrder.service.ts` | Remove `userId`, `userGroups`, `fdGroupId`, `dosGroupId` from `logger.warn` calls (lines ~785–792 and ~803–812). Log only the PO ID and attempted stage. |
| 🟡 RECOMMENDED | REC-01 | `backend/src/middleware/permissions.ts` | Document (or adjust) the `\|\| 3` Admin fallback vs spec's `\|\| 0`. Either explicitly accept it as policy in a code comment or reduce to `\|\| 0`. |
| 🟡 RECOMMENDED | REC-02 | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Change line 564's guard from `!canActAtStage` to `!effectiveCanAct` so the waiting label accurately reflects the group-gated readiness, not just permLevel. |
| 🟡 RECOMMENDED | REC-03 | New test files | Implement the 4 automated tests from spec section 9 before closing the security ticket. |
| 🔵 OPTIONAL | OPT-01 | `frontend/.env.example` | Add comment noting that omitting the env var causes fallback to permLevel-only gating. |
| 🔵 OPTIONAL | OPT-02 | `backend/src/middleware/permissions.ts` | Remove `userId` from `debug` log on line ~93 for strict log hygiene (pre-existing pattern). |

---

## Overall Assessment

**Verdict: NEEDS_REFINEMENT**

The implementation correctly addresses all five root causes identified in the spec:
- ADMIN bypass `permLevel = 6` hardcode replaced with DB-derived level ✅
- System Admin `userSync` mapping corrected from `REQUISITIONS: 6` → `3` ✅
- Frontend `isAdmin → permLevel: 6` shortcut removed ✅
- Group membership enforcement added at the service layer ✅
- Controller passes `userGroups` to service ✅
- Both `.env.example` files updated with new vars ✅
- Both builds pass cleanly ✅

The fix is functionally sound and closes the privilege escalation vector. However, one CRITICAL security logging violation was introduced: the new `logger.warn` entries added as part of the group membership enforcement log the user's full Entra group GUIDs and the env-configured group IDs — explicitly prohibited by the spec's MANDATORY security requirements. This single fix (replacing ~6 log-field lines with PO-scoped identifiers only) must be made before this change is merged.

No hardcoded `permLevel = 6` remains. No `console.log` statements were introduced. Prisma ORM is used exclusively. Custom error classes are applied correctly throughout.

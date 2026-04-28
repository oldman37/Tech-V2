# PO Visibility Bug Fix — Code Review

**Date:** 2026-03-24  
**Reviewer:** Review Subagent  
**Spec Reference:** `docs/SubAgent/po_visibility_bug_spec.md`  
**Overall Assessment:** ✅ **PASS**

---

## Summary Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 100% | A+ |
| Best Practices | 92% | A |
| Functionality | 95% | A |
| Code Quality | 93% | A |
| Security | 97% | A+ |
| Performance | 88% | B+ |
| Consistency | 95% | A |
| Build Success | 100% | A+ |

**Overall Grade: A (95%)**

---

## Build Validation Results — CRITICAL GATE

| Build | Command | Result | Notes |
|---|---|---|---|
| Backend TypeScript | `cd C:\Tech-V2\backend ; npm run build` | ✅ **PASS** — 0 errors, 0 warnings | Clean compile |
| Frontend Vite/React | `cd C:\Tech-V2\frontend ; npm run build` | ✅ **PASS** — 0 errors, 2 warnings | Warnings are pre-existing (see below) |

**Frontend Warnings (pre-existing, not introduced by this fix):**
1. `api.ts` mixed dynamic/static import warning — affects tree-shaking, pre-existing codebase pattern  
2. Chunk size > 500 kB — pre-existing, unrelated to PO changes

---

## Bug-by-Bug Compliance

### Bug #1 — Level-3 Supervisor Global Visibility → Location-Scoped

**File:** [backend/src/services/purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts)  
**Status:** ✅ FIXED — Correctly implemented

The `getPurchaseOrders()` method now uses a proper three-tier `userScopeClause`:

```
onlyMine || permLevel < 3  →  { requestorId: userId }          (own POs only)
permLevel === 3             →  { OR: [own, supervisedLocations] } (location-scoped)
permLevel >= 4              →  {}                                (global visibility)
```

**Edge Case: Supervisor with no LocationSupervisor records** — CORRECTLY HANDLED.  
The code falls back to own-only scope and emits a `logger.warn()`:
```typescript
// No assigned locations — fall back to own POs only
logger.warn('Level-3 supervisor has no LocationSupervisor records; falling back to own-only scope', { userId });
userScopeClause = { requestorId: userId };
```
This prevents any accidental escalation to global visibility.

---

### Bug #1b — `getPurchaseOrderById` Level-3 Bypass

**File:** [backend/src/services/purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts)  
**Status:** ✅ FIXED — Correctly implemented

The single-item fetch now mirrors the three-tier model:

- `permLevel < 3`: must be requestor or 403
- `permLevel === 3`: must be requestor OR `locationSupervisor.findFirst({ userId, locationId: po.officeLocationId })` must return a row, else 403
- PO with no `officeLocationId` is denied for level-3 users who aren't the requestor
- `permLevel >= 4`: no restriction

**Edge Case: Can a supervisor still fetch a PO from another location by ID?** — **NO**. The `findFirst` check correctly prevents this.

---

### Bug #2 — "My Requests" Tab Sends No `onlyMine` Signal

**Files:**
- [backend/src/validators/purchaseOrder.validators.ts](../../backend/src/validators/purchaseOrder.validators.ts)
- [frontend/src/types/purchaseOrder.types.ts](../../frontend/src/types/purchaseOrder.types.ts)
- [frontend/src/services/purchaseOrder.service.ts](../../frontend/src/services/purchaseOrder.service.ts)
- [frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx)

**Status:** ✅ FIXED — End-to-end implementation complete

The entire `onlyMine` signal chain is correctly implemented:

1. **Backend validator** (`purchaseOrder.validators.ts`): `onlyMine` field added with `z.preprocess()` that converts `'true'` / `'1'` / `true` to boolean
2. **Backend service** (`purchaseOrder.service.ts`): `if (onlyMine || permLevel < 3)` correctly short-circuits the full scope resolution
3. **Frontend types** (`purchaseOrder.types.ts`): `onlyMine?: boolean` added to `PurchaseOrderFilters`
4. **Frontend service** (`purchaseOrder.service.ts`): `if (filters.onlyMine) q.append('onlyMine', 'true')` serializes correctly
5. **Frontend page** (`PurchaseOrderList.tsx`): `if (tab === 'mine') f.onlyMine = true` sets the flag

**Edge Case: `onlyMine` with permLevel 4+?** — `onlyMine` is respected even for level 4+ users (`if (onlyMine || permLevel < 3)` takes precedence over all other branches). This is the CORRECT behavior — a level-4 admin clicking "My Requests" should see only their own submissions.

---

### Bug #3 — "All" Tab Visible to Level 2 Users

**File:** [frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx)  
**Status:** ✅ FIXED

`TABS` constant now correctly shows `minPermLevel: 3` for the `'all'` tab (changed from 2 → 3). Level-2 users no longer see a misleading "All" tab.

```typescript
const TABS: TabDef[] = [
  { key: 'all',     label: 'All',                minPermLevel: 3 },  // ✅ Fixed
  { key: 'mine',    label: 'My Requests',         minPermLevel: 1 },
  { key: 'pending', label: 'Pending My Approval', minPermLevel: 3 },
  { key: 'issued',  label: 'Issued',              minPermLevel: 1 },
];
```

---

### Bug #4 — Route Comment Documentation Drift

**File:** [backend/src/routes/purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts)  
**Status:** ✅ FIXED

The `GET /` route comment now accurately documents the three-tier model:
```
List purchase orders (own only for levels 1–2; location-scoped for level 3 supervisors; all for levels 4+)
```

---

### Bug #5 — Permission Middleware Expired-Permission Race Condition

**File:** [backend/src/middleware/permissions.ts](../../backend/src/middleware/permissions.ts)  
**Status:** ✅ FIXED

The middleware now correctly:
1. **Pre-filters** all `userPermissions` into `activePermissions` (excludes any with `expiresAt < now`)
2. **Searches only `activePermissions`** for `matchingPermission` — expired-first-found scenario is eliminated
3. **Computes `highestLevel`** from `activePermissions` only
4. Falls back into the original `userPermissions` array ONLY for the "better error message" path (checking if an expired match existed) — this is a read-only check with no security implications

```typescript
const activePermissions = userPermissions.filter(
  (up) => !up.expiresAt || up.expiresAt >= now,
);
const matchingPermission = activePermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
);
```

This resolves the race condition where expired REQ:3 + valid REQ:2 would previously result in a 403 instead of granting access at level 2.

---

## Security Compliance Checklist

| Check | Result | Notes |
|---|---|---|
| `authenticateToken` on all routes | ✅ PASS | `router.use(authenticate)` applied globally |
| `checkPermission` where appropriate | ✅ PASS | All routes have appropriate permission checks |
| No tokens in localStorage | ✅ PASS | HttpOnly cookie auth, no localStorage/sessionStorage usage found |
| Zod validates all inputs including `onlyMine` | ✅ PASS | Full schema coverage confirmed |
| No `console.log` statements | ✅ PASS | Grep confirmed zero matches |
| No sensitive data in logs (PII, tokens) | ✅ PASS | Logs contain only IDs, module names, status strings |
| Custom error classes used | ✅ PASS | `AuthorizationError`, `NotFoundError`, `ValidationError` throughout |
| SQL injection prevention (Prisma ORM only) | ✅ PASS | No raw queries in any reviewed file |
| Expired permissions filtered in middleware | ✅ PASS | Fixed as part of Bug #5 |

---

## Findings by Priority

### CRITICAL Issues — Must Fix
*None.* Both builds pass. No security violations detected.

---

### RECOMMENDED Issues — Should Fix

#### REC-1: `GET /:id` Route Comment Is Still Inaccurate
**File:** [backend/src/routes/purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts) (approx. line 65)  
**Severity:** RECOMMENDED  
**Issue:** The comment for `GET /api/purchase-orders/:id` still reads:
```
Get PO detail (own only for level 1; any for level 2+)
```
This is outdated now that the service enforces: levels 1–2 = own only, level 3 = location-scoped, level 4+ = any. The comment was part of the original documentation drift problem (Bug #4) but only the `GET /` route comment was updated.  
**Fix:** Update to match the actual three-tier logic:
```
Get PO detail (own only for levels 1–2; location-scoped for level 3; any for levels 4+)
```

---

#### REC-2: `onlyMine` Validator Preprocess Has Unreachable Branch
**File:** [backend/src/validators/purchaseOrder.validators.ts](../../backend/src/validators/purchaseOrder.validators.ts) (approx. line 94)  
**Severity:** RECOMMENDED (code quality)  
**Issue:** The `onlyMine` preprocess includes:
```typescript
(val) => val === 'true' || val === '1' || val === true,
```
The `|| val === true` branch is dead code — HTTP query parameters are always strings (`typeof val === 'string'`). The boolean `true` check can never be reached via an HTTP request. While harmless, it is misleading.  
**Fix:**
```typescript
(val) => val === 'true' || val === '1',
```

---

### OPTIONAL Issues — Nice to Have

#### OPT-1: `getStats()` Has Hard Limit of 1000 POs
**File:** [frontend/src/services/purchaseOrder.service.ts](../../frontend/src/services/purchaseOrder.service.ts) (approx. line 200)  
**Severity:** OPTIONAL (pre-existing, not introduced by this fix)  
**Issue:** `getStats()` calls `getAll({ limit: 1000 })`. For organizations with > 1000 POs visible to a given user, the stats will silently under-count. Note: now that level-3 supervisors have location-scoped visibility, this concern is reduced for supervisors but remains valid for level-4+ admins.  
**Recommendation:** Add a dedicated `GET /api/purchase-orders/stats` endpoint that computes counts via `groupBy` aggregation in Prisma rather than fetching full records on the frontend.

#### OPT-2: CSRF Token Applies to GET Routes (Pre-existing)
**File:** [backend/src/routes/purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts) (approx. line 40)  
**Severity:** OPTIONAL (pre-existing codebase pattern)  
**Issue:** `router.use(validateCsrfToken)` is applied to all routes including `GET` requests. The comment says "for all state-changing routes" but the placement applies it universally. CSRF protection on GET is non-standard (GET should be idempotent and CSRF only affects state-changing verbs). This is not a security vulnerability, but it means GET requests to the PO API require a valid CSRF token — which may cause issues for clients that don't include it. This is a pre-existing codebase pattern not introduced by this fix.

---

## Summary of All 5 Bugs from Spec

| Bug # | Description | Status |
|---|---|---|
| Bug #1 | Level-3 supervisors see all POs globally instead of location-scoped | ✅ Fixed |
| Bug #1b | `getPurchaseOrderById` allows level-3 to access any PO by ID | ✅ Fixed |
| Bug #2 | "My Requests" tab sends no `onlyMine` signal for level 3+ users | ✅ Fixed |
| Bug #3 | "All" tab visible to level-2 users (`minPermLevel: 2` → should be 3) | ✅ Fixed |
| Bug #4 | `GET /` route comment contradicts service logic | ✅ Fixed |
| Bug #5 | Expired permission middleware may wrongly block a valid lower-level grant | ✅ Fixed |

All 5 bugs from the specification are addressed. The `getPurchaseOrderById` fix (Bug #1b from the spec's proposed fixes) is also correctly implemented.

---

## Edge Case Review

| Edge Case | Expected | Actual | Result |
|---|---|---|---|
| Level-3 supervisor with no `LocationSupervisor` record | Fall back to own-only scope, do NOT grant global | `userScopeClause = { requestorId: userId }` + `logger.warn` | ✅ Correct |
| `onlyMine=true` for level-4+ user | Respect `onlyMine`, return only own POs | `if (onlyMine \|\| permLevel < 3)` short-circuits | ✅ Correct |
| Level-3 supervisor fetching a PO by ID from another location | 403 Forbidden | `locationSupervisor.findFirst` check, throws `AuthorizationError` | ✅ Correct |
| Level-3 supervisor fetching PO with no `officeLocationId` (not own) | 403 Forbidden | `else` branch throws `AuthorizationError` | ✅ Correct |
| Expired REQ:3 + valid REQ:2 | Grant access at level 2 | Pre-filters to `activePermissions` before `find()` | ✅ Correct |

---

## Files Reviewed

| File | Changes Present | Assessment |
|---|---|---|
| [backend/src/services/purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts) | ✅ Bug #1, #1b, #2 fix | Clean, correct three-tier logic |
| [backend/src/validators/purchaseOrder.validators.ts](../../backend/src/validators/purchaseOrder.validators.ts) | ✅ Bug #2 fix (`onlyMine` field) | Correct; minor dead-code in preprocess (REC-2) |
| [backend/src/routes/purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts) | ✅ Bug #4 fix | `GET /` comment fixed; `GET /:id` comment still outdated (REC-1) |
| [backend/src/middleware/permissions.ts](../../backend/src/middleware/permissions.ts) | ✅ Bug #5 fix | Expired-first-found race condition resolved |
| [frontend/src/types/purchaseOrder.types.ts](../../frontend/src/types/purchaseOrder.types.ts) | ✅ Bug #2 fix (`onlyMine` type) | Correctly typed |
| [frontend/src/services/purchaseOrder.service.ts](../../frontend/src/services/purchaseOrder.service.ts) | ✅ Bug #2 fix (`onlyMine` serialization) | Correctly serializes to query string |
| [frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx) | ✅ Bug #2+#3 fix (`onlyMine` flag + tab restriction) | Correct |

---

## Conclusion

The implementation subagent correctly addressed all five bugs identified in the specification. Both backend and frontend compile cleanly. The three-tier access model is properly enforced end-to-end:

- **Level 1–2 users:** Restricted to `requestorId = userId` in both list and detail endpoints
- **Level-3 supervisors:** Location-scoped via `LocationSupervisor` joins, with correct fallback to own-only when no location assignments exist
- **Level 4+ users:** Global visibility preserved
- **"My Requests" tab:** Always sends `onlyMine=true` regardless of user's permLevel, and backend respects it even for level 4+ users
- **"All" tab:** Hidden from level-2 users (corrected `minPermLevel: 3`)
- **Permission middleware:** Expired permissions no longer block valid active grants

Two recommended fixes (route comment and dead-code in validator) are minor and do not affect security or functionality. One optional issue (`getStats` limit) is pre-existing.

**Assessment: PASS — Ready for deployment.**

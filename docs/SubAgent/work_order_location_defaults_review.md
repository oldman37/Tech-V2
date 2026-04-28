# Work Order Location Defaults — Code Review

> **Reviewer:** Copilot Phase 3 Review  
> **Date:** 2026-04-23  
> **Spec:** docs/SubAgent/work_order_location_defaults.md  
> **Overall Assessment:** **NEEDS_REFINEMENT**

---

## Build Validation Results

### Backend: `npx tsc --noEmit`
**Result: ✅ SUCCESS** — No errors produced.

### Frontend: `npx tsc --noEmit`
**Result: ❌ FAILED** — 1 error related to this feature, 1 pre-existing error.

| # | File | Error | Related? |
|---|------|-------|----------|
| 1 | `frontend/src/hooks/queries/useUserDefaultLocation.ts:2` | `TS2613: Module has no default export. Did you mean to use 'import { userService }'?` | **Yes — CRITICAL** |
| 2 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx:293` | `TS2322: Type 'EntityLocationType \| null' is not assignable to type '"SCHOOL" \| "DEPARTMENT" \| "PROGRAM"'` | No — pre-existing |

---

## Findings

### CRITICAL Issues (Must Fix)

#### C1. Default import on named export — BUILD FAILURE
- **File:** `frontend/src/hooks/queries/useUserDefaultLocation.ts`, line 2
- **Current:** `import userService from '@/services/userService';`
- **Problem:** `userService.ts` exports a *named* export (`export const userService = new UserService()`), not a default export. This causes `TS2613` and fails the frontend build.
- **Fix:** Change to `import { userService } from '@/services/userService';`
- **Evidence:** The existing hook `useUsers.ts` correctly uses `import { userService, User, PaginatedResponse } from '@/services/userService';`

---

### RECOMMENDED Issues (Should Fix)

#### R1. `useEffect` defaults may fire more than once on strict-mode double-mount
- **File:** `frontend/src/pages/NewWorkOrderPage.tsx`, lines 107–115
- **Current logic:** Uses `defaultsApplied.current` ref to guard, which is correct. However, `locationOverridden` is in the dependency array and is also a state variable, which means if the effect fires before `userDefaults` is ready and then again after, the ref guard handles it. **This is acceptable but could be simplified.**
- **Suggestion:** Remove `locationOverridden` from the `useEffect` dependency array since `defaultsApplied.current` already prevents re-application. Having it there is harmless but adds a subtle coupling that could confuse future maintainers.
- **Severity:** Minor correctness/clarity.

#### R2. Missing unused import: `api` imported directly in new hook
- **File:** `frontend/src/hooks/queries/useUserDefaultLocation.ts`, line 3
- **Current:** `import { api } from '@/services/api';`
- **Problem:** The hook uses `api.get('/users/me/office-location')` directly for the fallback path instead of going through `userService`. While this works, it breaks the service-layer abstraction that the rest of the codebase follows. `userService` already has no method for this specific call, but the approach is inconsistent — `getMe()` goes through the service, while the fallback goes directly to `api`.
- **Suggestion:** Either add a `getMyOfficeLocation()` method to `UserService` class in `userService.ts`, or accept the direct `api` call and document why the split exists (acceptable since this is a one-off fallback).
- **Severity:** Consistency.

#### R3. Helper text wording diff from spec
- **File:** `frontend/src/pages/NewWorkOrderPage.tsx`, lines 270–274
- **Spec says:** `"Pre-filled from your assigned location. You can change it above."`
- **Implemented:** `"Pre-filled from your assigned location"`
- **Suggestion:** Add the trailing instruction `". You can change it above."` or equivalent to match spec.
- **Severity:** Spec compliance.

---

### OPTIONAL Issues (Nice to Have)

#### O1. Hook could deduplicate the `/users/me` call with auth store or React Query cache
- **File:** `frontend/src/hooks/queries/useUserDefaultLocation.ts`
- **Observation:** If other parts of the app already call `/users/me` (e.g., during auth flow or profile display), TanStack Query might already have this data cached under a different query key. The hook uses its own key `['users', 'me', 'default-location']`, so it always makes a fresh request on first mount.
- **Suggestion:** Consider refactoring to read from a shared `useCurrentUser()` hook (if one exists) and derive the defaults, rather than making a redundant `/users/me` call. The 5-minute `staleTime` mitigates this on subsequent navigations.
- **Severity:** Performance optimization.

#### O2. `isLoading` from hook is unused in the page
- **File:** `frontend/src/hooks/queries/useUserDefaultLocation.ts` returns `isLoading`, but `NewWorkOrderPage.tsx` destructures only `{ data: userDefaults }`.
- **Observation:** The spec (§5.3.C) originally showed using `isLoading` / `defaultsLoading`. The current implementation doesn't show a loading indicator for the default location fetch. This is acceptable since the form is usable without defaults, but a brief skeleton or spinner could improve UX.
- **Severity:** UX enhancement.

#### O3. Room dropdown may flash when defaults are applied
- **Observation:** When `useUserDefaultLocation` resolves, the `useEffect` sets both `officeLocationId` and `roomId` at once. However, `useRoomsByLocation(form.officeLocationId)` will fire a separate query. If rooms haven't loaded yet, the room `<Select>` value may temporarily be a UUID that doesn't match any option, potentially showing a blank/invalid selection until rooms load.
- **Suggestion:** Either briefly show a disabled room select with a loading indicator, or defer setting `roomId` until `rooms` data is available.
- **Severity:** Minor UX.

---

## Security Compliance Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Authentication required | ✅ PASS | `/users/me` and `/users/me/office-location` both require `authenticateToken` middleware |
| Authorization / permissions | ✅ PASS | No new elevated endpoints; user reads own data |
| CSRF protection | ✅ PASS | No new mutation endpoints added; existing `POST /api/work-orders` already protected |
| No tokens in localStorage additions | ✅ PASS | No localStorage usage in any modified file |
| Input validation (Zod) | ✅ PASS | No new inputs; backend `CreateWorkOrderSchema` already validates `officeLocationId`/`roomId` as optional UUIDs |
| No `console.log` statements | ✅ PASS | Zero `console.log` found in all 5 reviewed files |
| No sensitive data in logs | ✅ PASS | No logging added |
| Custom error classes | ✅ PASS | Backend uses `NotFoundError`, `ValidationError` from `../utils/errors` |
| SQL injection prevention (Prisma only) | ✅ PASS | All DB access through Prisma ORM |
| Data exposure check | ✅ PASS | `locationId` UUID added to `primaryRoom` is non-sensitive; already available via `/locations` |

---

## Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Expand `primaryRoom` select to include `locationId` in `findById()` | ✅ Done | `user.service.ts` lines 191–197 |
| Expand `primaryRoom` select to include `locationId` in `findAll()` | ✅ Done | `user.service.ts` lines 148–154 |
| Update `UserWithPermissions` interface | ✅ Done | `user.service.ts` line 52 |
| Update `formatUserWithPermissions()` type | ✅ Done | `user.service.ts` line 630 |
| Update frontend `User` type | ✅ Done | `userService.ts` line 15 |
| Add query key `defaultLocation` | ✅ Done | `queryKeys.ts` line 33 |
| Create `useUserDefaultLocation` hook | ✅ Done | New file |
| Priority 1: primaryRoom → locationId + roomId | ✅ Done | Hook lines 31–35 |
| Priority 2: fallback to `/users/me/office-location` | ✅ Done | Hook lines 38–44 |
| Priority 3: null/null graceful fallback | ✅ Done | Hook line 47 |
| Pre-populate form on mount | ✅ Done | `NewWorkOrderPage.tsx` useEffect |
| Track `locationOverridden` to prevent overwrite | ✅ Done | State + ref guard |
| Helper text for auto-filled location | ✅ Done | Minor wording diff (R3) |
| Room dropdown resets on location change | ✅ Done | `set('roomId', '')` on location change |
| No backend changes to work order endpoint | ✅ Correct | No changes needed |

---

## Summary Score Table

| Category | Score | Grade | Notes |
|----------|-------|-------|-------|
| Specification Compliance | 95% | A | Minor helper text wording difference (R3) |
| Best Practices | 90% | A- | useEffect dep array could be tightened (R1) |
| Functionality | 95% | A | Works correctly; minor room flash edge case (O3) |
| Code Quality | 90% | A- | Direct `api` call inconsistency (R2); unused `isLoading` (O2) |
| Security | 100% | A+ | All security standards met |
| Performance | 90% | A- | Potential duplicate `/users/me` call (O1) |
| Consistency | 90% | A- | Import style mismatch; direct api vs service pattern (R2) |
| Build Success | 0% | F | Frontend build FAILS due to import error (C1) |
| **Overall** | **78%** | **C+** | **Build failure drives overall grade down** |

> **Note:** Once the single CRITICAL build error (C1) is fixed, the overall grade would recalculate to approximately **A- (93%)**.

---

## Priority Recommendations

### Must Fix (before merge)
1. **C1:** Fix default import → `import { userService } from '@/services/userService'` in `useUserDefaultLocation.ts`

### Should Fix (same PR)
2. **R1:** Remove `locationOverridden` from useEffect dependency array
3. **R2:** Consider adding `getMyOfficeLocation()` to `UserService` for consistency, or add a comment explaining the direct `api` call
4. **R3:** Match spec helper text wording

### Nice to Have (future)
5. **O1:** Deduplicate `/users/me` call via shared hook
6. **O2:** Use `isLoading` for skeleton/placeholder UX
7. **O3:** Defer `roomId` default until rooms are loaded

---

## Affected File Paths

1. `backend/src/services/user.service.ts`
2. `frontend/src/services/userService.ts`
3. `frontend/src/lib/queryKeys.ts`
4. `frontend/src/hooks/queries/useUserDefaultLocation.ts` ← **CRITICAL fix needed**
5. `frontend/src/pages/NewWorkOrderPage.tsx`

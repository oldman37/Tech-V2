# Remove Legacy Permission System — Quality Review

**Date:** 2026-03-12  
**Reviewer:** QA SubAgent  
**Spec:** `docs/SubAgent/remove_legacy_permissions_spec.md`  
**Status:** NEEDS_REFINEMENT

---

## Summary Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 9/10 | A- |
| Best Practices | 7/10 | B |
| Functionality | 7/10 | B |
| Code Quality | 8/10 | B+ |
| Security | 9/10 | A- |
| Performance | 10/10 | A+ |
| Consistency | 6/10 | C+ |
| Build Success | 10/10 | A+ |
| **Overall** | **8.25/10** | **B+** |

---

## Build Results

| Package | Command | Result |
|---|---|---|
| `backend` | `npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| `shared` | `npx tsc --noEmit` | ✅ **PASS** — 0 errors |
| `frontend` | `npx tsc --noEmit` | ✅ **PASS** — 0 errors |

---

## Files Reviewed

| File | Status |
|---|---|
| `backend/src/services/userSync.service.ts` | ✅ Modified correctly (with one CRITICAL bug) |
| `backend/src/middleware/permissions.ts` | ✅ `checkRole()` removed cleanly |
| `shared/src/types.ts` | ✅ Legacy types replaced |
| `shared/src/api-types.ts` | ✅ Stale token types removed |
| `frontend/src/pages/Users.backup.tsx` | ✅ Deleted (file no longer exists) |

---

## Overall Assessment: NEEDS_REFINEMENT

All spec-required changes have been implemented and all three TypeScript builds pass cleanly. However, **one CRITICAL runtime bug** was detected and **two RECOMMENDED type-system issues** were found. The critical bug (`ENTRA_FINANCE_DIRECTOR_GROUP_ID` / `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` env var mismatch) causes Director of Finance users to silently receive the default `VIEWER` role with zero permissions after every Entra sync — a functional regression.

---

## Findings

---

### CRITICAL

#### C-1 — Env Var Name Mismatch for Finance Director Group (`userSync.service.ts`)

**File:** `backend/src/services/userSync.service.ts`  
**Severity:** CRITICAL — silent functional regression; incorrect permission assignment  

The constructor registers the Finance Director mapping using the env var `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` (line 61), but `getRoleFromGroups()` iterates the priority list using `ENTRA_FINANCE_DIRECTOR_GROUP_ID` (line 244). These are **two different env var names**. The Map is keyed by the *value* of `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID`, but `getRoleFromGroups` looks up the *value* of `ENTRA_FINANCE_DIRECTOR_GROUP_ID`. Unless both env vars happen to be set to the same GUID in every deployment environment (which would be accidental and fragile), the Director of Finance group will **never match** the priority list and all Finance Director users will fall through to the default `VIEWER` role with no permissions after each sync.

**Impact:** Finance Director users lose all REQUISITIONS, TECHNOLOGY, and MAINTENANCE permissions on the next Entra sync. They will receive `403 Forbidden` on all permission-guarded routes.

**Evidence:**
```typescript
// Constructor (line 61) — registers with env var A:
if (process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID) {
  this.groupRoleMappings.set(process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID, {
    ...

// getRoleFromGroups (line 244) — looks up env var B (different name!):
process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID,
```

**Fix:** Standardise on one env var name. The spec uses `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` in the mapping tables (§1.4), so update the priority list to match:

```typescript
// In getRoleFromGroups priorityOrder array, replace:
process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID,
// With:
process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID,
```

---

### RECOMMENDED

#### R-1 — `PermissionModule` Type Inconsistency Between `permissions.ts` and `shared/types.ts`

**Files:** `backend/src/middleware/permissions.ts`, `shared/src/types.ts`, `backend/src/services/userSync.service.ts`  
**Severity:** RECOMMENDED — type-system inconsistency; not a build failure but causes confusion

The `PermissionModule` union type is defined in three places with divergent members:

| Source | Members |
|---|---|
| `backend/src/middleware/permissions.ts` | `TECHNOLOGY`, `MAINTENANCE`, `TRANSPORTATION`, `NUTRITION`, `CURRICULUM`, `FINANCE`, `REQUISITIONS` |
| `shared/src/types.ts` | `TECHNOLOGY`, `MAINTENANCE`, `REQUISITIONS`, `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS` |
| `userSync.service.ts` (local) | `TECHNOLOGY`, `MAINTENANCE`, `REQUISITIONS`, `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS` |

The DB seed (`prisma/seed.ts`) defines permissions for: `TECHNOLOGY`, `MAINTENANCE`, `REQUISITIONS`, `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS`. The `permissions.ts` middleware type is **the only one** that omits these three real DB modules and instead lists `TRANSPORTATION`, `NUTRITION`, `CURRICULUM`, `FINANCE` which do not yet exist in the seed.

Because `userSync.service.ts` uses its own local `PermissionModule` type (not imported from `permissions.ts`), TypeScript does not catch this divergence. If a developer adds a route calling `checkPermission('PROFESSIONAL_DEV', 1)`, it will fail TypeScript compilation — a misleading barrier against valid DB modules.

**Fix:** Update `permissions.ts` to reflect the actual seeded modules, or add the missing modules to both types until the DB seeds are expanded:

```typescript
// backend/src/middleware/permissions.ts
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'REQUISITIONS'
  | 'PROFESSIONAL_DEV'
  | 'SPECIAL_ED'
  | 'TRANSCRIPTS'
  | 'TRANSPORTATION'   // future
  | 'NUTRITION'        // future
  | 'CURRICULUM'       // future
  | 'FINANCE';         // future
```

Alternatively, import and re-export `PermissionModule` from `shared/types.ts` to ensure a single source of truth.

---

#### R-2 — `any` Return Types and Graph API Casts in `userSync.service.ts`

**File:** `backend/src/services/userSync.service.ts`  
**Severity:** RECOMMENDED — violates TypeScript strict mode spirit; pre-existing but not corrected

The following `any` usages remain in the file:

| Line | Usage | Comment |
|---|---|---|
| 363 | `groups.value.map((g: any) => g.id)` | Should use `GraphGroup` type (already imported in `auth.controller.ts`) |
| 431 | `} catch (error: any) {` | Should be `} catch (error) {` with `instanceof Error` guard |
| 486 | `let members: any[] = [];` | Should be `{ id: string; '@odata.type': string }[]` or the existing `GraphGroup` interface |
| 533 | `let allUsers: any[] = [];` | Should be `{ id: string }[]` |

`syncUser`, `syncGroupUsers`, and `syncAllUsers` all return `Promise<any>` instead of typed `Promise<User>` / `Promise<User[]>`. Callers in `auth.controller.ts` annotate responses carefully, but the absence of return types means TypeScript cannot catch shape mismatches.

**Fix (minimal):**
```typescript
// Replace return type annotations on all three public methods:
async syncUser(entraId: string): Promise<User>
async syncGroupUsers(groupId: string): Promise<User[]>
async syncAllUsers(): Promise<User[]>

// Replace the graph groups cast:
const groupIds = (groups.value as Array<{ id: string }>).map((g) => g.id);
```

---

### OPTIONAL

#### O-1 — Redundant `UserPermission` Interface in `shared/src/types.ts`

**File:** `shared/src/types.ts` (lines 196–203)  
**Severity:** OPTIONAL — dead code, harmless

`UserPermission` (the assignment record interface with `userId`, `permissionId`) is retained alongside `UserPermissionDetail` (the richer permission view with `module`, `level`, `name`). No code in the codebase imports `UserPermission` from the shared package. Consider removing it in a follow-up pass to prevent confusion about which interface to use.

---

#### O-2 — `PermissionLevel` Does Not Include `0`

**File:** `shared/src/types.ts`  
**Severity:** OPTIONAL — theoretical; no current consumer impacted

The DB seed creates level `0` records for `PROFESSIONAL_DEV`, `SPECIAL_ED`, and `TRANSCRIPTS` (as "No Access" sentinels). `PermissionLevel = 1 | 2 | 3 | 4 | 5` excludes `0`. No route currently calls `checkPermission` for those modules, and the sync service never assigns level 0, so this has no current impact. If these modules gain route guards in the future, level 0 records may cause subtle issues with the type. Consider either:
- Adding `0` to the union, or
- Documenting that level 0 is a DB-only sentinel not surfaced through the API type

---

## Verification Checklist

| Check | Result |
|---|---|
| `checkRole()` removed from `permissions.ts` | ✅ Removed — file ends immediately after `checkPermission` function |
| No `checkRole` reference in any route file | ✅ Confirmed — grep across `backend/src/routes/**` returns zero matches |
| `RefreshTokenRequest` / `RefreshTokenResponse` removed from `shared/api-types.ts` | ✅ Confirmed — only comment referencing "refresh_token" is the HttpOnly cookie note |
| `LoginResponse` no longer has `accessToken`/`refreshToken` fields | ✅ Confirmed — only `user: UserWithPermissions` and cookie comment |
| `Users.backup.tsx` deleted | ✅ Confirmed — file_search returns no results |
| `PermissionModule` in `shared/types.ts` matches modern DB modules | ✅ Correct (`TECHNOLOGY`, `MAINTENANCE`, `REQUISITIONS`, `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS`) |
| `PermissionLevel` in `shared/types.ts` is numeric union `1\|2\|3\|4\|5` | ✅ Correct |
| `Permission.level` typed as `number` (not `string`) | ✅ Confirmed |
| `UserPermissionDetail.level` typed as `number` (not `string`) | ✅ Confirmed |
| Legacy module strings (`USERS`, `LOCATIONS`, `EQUIPMENT`, `INVENTORY`, `PURCHASE_ORDERS`, `MAINTENANCE_REQUESTS`) — no remaining occurrences | ✅ Zero matches across all source files |
| Old string-based `PermissionLevel` values (`'VIEW'`, `'CREATE'`, `'EDIT'`, `'DELETE'`, `'ADMIN'`) — no remaining occurrences | ✅ Zero matches across permission-related source files |
| All routes retain `authenticate` middleware | ✅ All 9 non-auth routes import and apply `authenticate` |
| All routes retain `checkPermission()` where spec requires | ✅ All routes listed in spec §2.3 still use `checkPermission()` |
| No `console.log` added in modified files | ✅ None found in `userSync.service.ts` or `permissions.ts` |
| DB schema `Permission.level` field type | ✅ `Int` in `schema.prisma` — matches all `number` typed code |
| DB-seeded levels match `userSync.service.ts` assignments | ✅ TECHNOLOGY 1–3, MAINTENANCE 1–3, REQUISITIONS 1–5, PD 0–1, SPED 0–1, TRANSCRIPTS 0–1 all exist; sync assigns within those ranges |
| TECHNOLOGY levels corrected (was `1`/`3` inverted) | ✅ Corrected per spec §1.4 |
| REQUISITIONS levels corrected (was old 1–9 system) | ✅ Corrected per spec §1.4 |
| Backend `tsc --noEmit` | ✅ 0 errors |
| Shared `tsc --noEmit` | ✅ 0 errors |
| Frontend `tsc --noEmit` | ✅ 0 errors |

---

## Security Assessment

No security regressions were introduced:

- Every route file that previously had `authenticate` + `checkPermission()` still has both. No accidental removal of auth middleware was found.
- The removal of `checkRole()` is safe — confirmed zero usages across all route files before and after.
- The removal of token-in-body fields from `shared/api-types.ts` aligns with the HttpOnly cookie security model.
- The `userSync.service.ts` level corrections are security-conservative (higher levels grant more access; the fix corrects under-permissioned directors, not over-permissioned ones).
- The `Users.backup.tsx` deletion removes dead but unreferenced code with no auth impact.
- **Exception (C-1 above):** The Finance Director env var mismatch is not a security *escalation* (nobody gets too much access), but it is a security-functional failure (Finance Director users are locked out). Categorised as functional-critical rather than a security vulnerability.

---

## Spec vs Implementation Comparison

| Spec Step | Description | Implemented | Notes |
|---|---|---|---|
| Step 1 | Fix `userSync.service.ts` level numbers | ✅ Yes | **C-1**: Finance Director env var mismatch not fixed |
| Step 2 | Remove `checkRole()` from `permissions.ts` | ✅ Yes | Clean removal, no stale exports |
| Step 3 | Delete `Users.backup.tsx` | ✅ Yes | Confirmed gone |
| Step 4 | Update `shared/src/types.ts` | ✅ Yes | All legacy types replaced; **O-1** optional cleanup pending |
| Step 5 | Update `shared/src/api-types.ts` | ✅ Yes | Stale token types removed; `LoginResponse` updated |

---

## Required Actions Before Merge

1. **Fix C-1** — Change line 244 of `userSync.service.ts` from `process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID` to `process.env.ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` to match the constructor.

---

## Recommended Actions (Non-Blocking)

2. **Fix R-1** — Align `PermissionModule` type in `backend/src/middleware/permissions.ts` to include `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS` (actual DB modules).
3. **Fix R-2** — Replace `Promise<any>` return types on `syncUser`, `syncGroupUsers`, `syncAllUsers`; replace `(g: any)` cast with typed interface.

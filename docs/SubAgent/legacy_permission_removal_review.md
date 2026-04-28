# Legacy Permission Removal — Code Review

> **Review Date:** April 9, 2026  
> **Reviewer:** Automated Code Review Agent  
> **Spec Reference:** `docs/SubAgent/legacy_permission_removal_plan.md`  
> **Status:** NEEDS_REFINEMENT — 3 issues require attention before this can be marked COMPLETE

---

## Build Results

| Check | Result | Details |
|-------|--------|---------|
| Backend `tsc --noEmit` | ✅ **PASSED** | Zero TypeScript errors |
| Backend `prisma validate` | ✅ **PASSED** | Schema valid 🚀 |
| Frontend `tsc --noEmit` | ✅ **PASSED** | Zero TypeScript errors |
| Frontend `npm run build` | ✅ **PASSED** | Built in 23.31s (2 pre-existing Vite warnings) |

**Frontend build warnings (pre-existing, not introduced by this change):**
- `api.ts` is dynamically imported in `useUsers.ts` (`useSupervisorsList`) but also statically imported by 13 other files — dynamic split is ineffective.
- Single output chunk `index-Dxeu7YV0.js` is 1,031 kB (> 500 kB recommendation).

---

## File-by-File Findings

### Backend — New Utility

#### `backend/src/utils/groupAuth.ts` ✅ PASS
- `GROUP_MODULE_MAP` mirrors `UserSyncService` constructor mappings correctly.
- `derivePermLevelFromGroups` uses `process.env[envVar]` ✅ — correct server-side access.
- `requireModule` sets `req.user.permLevel`, calls `next()`, and properly returns `401` if `req.user` is absent.
- **RECOMMENDED:** The ADMIN bypass uses `derivePermLevelFromGroups(groups, module) || minLevel`. The spec describes this as `max(derived, minLevel)`. JavaScript `||` returns the **first truthy value**, not the arithmetic maximum. If `derived = 3` and `minLevel = 3`, the result is 3 (correct). If `derived = 3` and `minLevel > 3` (hypothetical future route), `3 || minLevel = 3` — silently wrong. Should use `Math.max(derived, minLevel)` for correctness and intent clarity.

---

### Backend — Middleware

#### `backend/src/middleware/auth.ts` ⚠️ MINOR
- `permLevel?: number` field remains on both `AuthRequest.user` and `TypedAuthRequest.user`. This is **intentional** — the field is still set by `requireModule` and read by downstream controllers. ✅
- **RECOMMENDED:** Both occurrences of the inline comment `// Set by checkPermission middleware for the checked module` are stale — they should reference `requireModule` instead of the removed `checkPermission`.

---

### Backend — Controllers

#### `backend/src/controllers/auth.controller.ts` ✅ PASS
- No `syncPermissionsForUser` calls found. Login flow only calls `userSyncService.getRoleFromGroups()` for role determination. ✅
- `roleMapping.permissions` is still logged for diagnostics (`loggers.auth.info`) — acceptable, this is structured logging.

#### `backend/src/controllers/user.controller.ts` ✅ PASS
- `updateUserPermissions`, `getPermissions`, `getEffectivePermissions` handlers all removed. ✅
- Only remaining handlers are: `getUsers`, `getMe`, `getMyOfficeLocation`, `getUserById`, `updateUserRole`, `toggleUserStatus`, `getSupervisorUsers`, `getUserSupervisors`, `addUserSupervisor`, `removeUserSupervisor`, `searchPotentialSupervisors`, `searchUsers`.

#### `backend/src/controllers/purchaseOrder.controller.ts` ✅ PASS
- `req.user!.permLevel ?? 1` used consistently across all handlers. ✅
- `buildApproverEmailSnapshot` call wrapped in `try/catch`; on Graph failure returns **503 immediately before submitting** — PO remains in draft. ✅ Correct error-blocking behavior.
- Snapshot persisted as fire-and-forget after submit (`catch` logs error, never throws). ✅
- Uses `prisma.purchase_orders.update` — correct, model is named `purchase_orders` in schema. ✅

---

### Backend — Services

#### `backend/src/services/userSync.service.ts` ✅ PASS
- `syncPermissionsForUser` function removed. ✅
- `PermissionMapping` interface retained — still used by `getRoleFromGroups()` return type (kept by design for login role determination). ✅

#### `backend/src/services/user.service.ts` ⚠️ MINOR
- `updatePermissions()`, `getAvailablePermissions()`, `getEffectivePermissions()` removed. ✅
- `findAll()` and `findById()` no longer include `userPermissions` in DB queries. ✅
- **RECOMMENDED:** The local `UserWithPermissions` interface still carries a `permissions` field (full DB-shaped array). `formatUserWithPermissions` always returns `permissions: []`. This is dead field in every API response — the interface should be cleaned up to remove the `permissions` field, and `formatUserWithPermissions` renamed or inlined to reflect the simpler shape.

#### `backend/src/services/email.service.ts` ✅ PASS
- `buildApproverEmailSnapshot` added. ✅
- Supervisor emails fetched from DB (no Graph dependency).
- Finance Director, DOS, PO Entry emails fetched from Microsoft Graph groups.
- On any Graph failure: logs the error and `throw new ExternalAPIError(...)` — correctly propagates to controller which returns 503. ✅
- `escapeHtml()` applied to all user-supplied content in email bodies. ✅ Security: XSS prevented.

---

### Backend — Routes

#### All reviewed route files ✅ PASS
All routes correctly migrated from `checkPermission` to `requireModule`:

| File | Import | Usage |
|------|--------|-------|
| `inventory.routes.ts` | `requireModule` from `../utils/groupAuth` | TECHNOLOGY levels 1–3 |
| `purchaseOrder.routes.ts` | `requireModule` from `../utils/groupAuth` | REQUISITIONS levels 1–5 |
| `referenceData.routes.ts` | `requireModule` from `../utils/groupAuth` | TECHNOLOGY levels 1–2 |
| `fundingSource.routes.ts` | `requireModule` from `../utils/groupAuth` | TECHNOLOGY levels 1–3 |
| `assignment.routes.ts` | `requireModule` from `../utils/groupAuth` | TECHNOLOGY levels 2–3 |
| `user.routes.ts` | `requireModule` from `../utils/groupAuth` | TECHNOLOGY level 1 (search endpoint) |

All routes have `authenticate` + `requireModule` / `requireAdmin` guards. No auth regression. ✅

#### `backend/src/routes/admin.routes.ts` ✅ PASS
- `GET /diagnose-permissions/:userId` removed. ✅
- `POST /resync-permissions/:userId` removed. ✅

---

### Backend — Prisma

#### `backend/prisma/schema.prisma` ✅ PASS
- Models `Permission`, `UserPermission`, `RoleProfile`, `RoleProfilePermission` all removed. ✅
- `userPermissions UserPermission[]` relation on `User` model removed. ✅
- `approverEmailsSnapshot Json?` added to `purchase_orders` model (line 362). ✅
- Schema validated successfully by `prisma validate`. ✅

#### `backend/prisma/seed.ts` ✅ PASS
- All 12 `Permission` seed records removed. ✅
- All 5 `RoleProfile` seed records removed. ✅
- Only remaining seed: `SystemSettings` singleton upsert. ✅
- Seed file uses structured `console.log` for progress output (appropriate for seed scripts). ✅

---

### Backend — Deleted Files (Confirmed Absent)

| File | Status |
|------|--------|
| `backend/src/middleware/permissions.ts` | ✅ Deleted |
| `backend/src/services/roles.service.ts` | ✅ Deleted |
| `backend/src/controllers/roles.controller.ts` | ✅ Deleted |
| `backend/src/routes/roles.routes.ts` | ✅ Deleted |
| `backend/src/validators/roles.validators.ts` | ✅ Deleted |

---

### Frontend — New Utility

#### `frontend/src/utils/groupAuth.ts` ✅ PASS
- `GROUP_MODULE_MAP` uses `VITE_ENTRA_*` prefixes — correct for client-side env access. ✅
- `derivePermLevelFrontend` uses `import.meta.env[envVar]` ✅ — correct Vite environment access.
- Structure mirrors backend `GROUP_MODULE_MAP` — levels are consistent. ✅
- Synchronous — no API call, no async, no side effects. ✅

---

### Frontend — Hooks

#### `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` ✅ PASS
- Replaced DB-fetching hook with synchronous group-based derivation. ✅
- Uses `useAuthStore()` to get `user.groups` from JWT. ✅
- ADMIN role users get `permLevel: 6` directly (correct bypass). ✅
- Returns `{ permLevel, isLoading: false, isAdmin }` — `isLoading: false` is correct since no async is involved. ✅

#### `frontend/src/hooks/queries/useUsers.ts` ✅ PASS
- `usePermissions()` and `useEffectivePermissions()` hooks removed. ✅
- `useSupervisorsList` uses a dynamic import of `@/services/api` — this is a pre-existing pattern that triggers the Vite bundle warning. Not introduced by this change.

#### `frontend/src/hooks/mutations/useUserMutations.ts` ✅ PASS
- `useUpdateUserPermissions()` mutation removed. ✅
- Remaining mutations: `useUpdateUserRole`, `useToggleUserStatus`. ✅
- Two `console.error` calls in `onError` handlers — acceptable for frontend error boundaries; not structured backend logging.

---

### Frontend — Services

#### `frontend/src/services/userService.ts` ✅ PASS
- `Permission`, `UserPermission`, `PermissionsByModule`, `EffectivePermissions` interfaces removed. ✅
- `getPermissions()`, `updateUserPermissions()`, `getEffectivePermissions()` methods removed. ✅
- `User` interface is clean — no permission fields. ✅

---

### Frontend — Pages

#### `frontend/src/pages/Users.tsx` ✅ PASS
- Permission modal, `usePermissions()`, `useUpdateUserPermissions()`, `useEffectivePermissions()` all removed. ✅
- Only remaining reference to "permissions" is a generic UI label: `"Manage user roles and permissions"` (acceptable descriptive text). ✅

#### `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` ✅ PASS
- Uses `useRequisitionsPermLevel()` (new group-based hook). ✅
- Action button visibility gated by `permLevel` derived from Entra groups. ✅

#### `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` ✅ PASS
- Uses `useRequisitionsPermLevel()` (new group-based hook). ✅
- `TABS` array uses `minPermLevel` for tab filtering based on `permLevel`. ✅

---

### Frontend — Deleted Files (Confirmed Absent)

| File | Status |
|------|--------|
| `frontend/src/pages/ManageRoles.tsx` | ✅ Deleted |
| `frontend/src/hooks/mutations/useRoleMutations.ts` | ✅ Deleted |
| `frontend/src/services/rolesService.ts` | ✅ Deleted |
| `frontend/src/types/roles.types.ts` | ✅ Deleted |

---

### Shared Types

#### `shared/src/types.ts` ❌ CRITICAL
- **ISSUE:** `Permission` interface (lines 153–165) and `UserPermission` interface (lines 167–173) are **still present**.
- Per the spec: _"PermissionModule, PermissionLevel types; UserPermissionDetail interface; UserWithPermissions interface"_ should be removed.
- `UserWithPermissions extends User {}` is now a clean empty extension — acceptable.
- `Permission` and `UserPermission` interfaces are dead code: the backing DB tables have been dropped. Leaving them creates a false impression that these types are still in use and will cause confusion if anyone attempts to use them.
- **Action Required:** Remove `Permission` and `UserPermission` interfaces.

#### `shared/src/api-types.ts` ❌ CRITICAL
- **ISSUE:** `Permission` is still imported (`import { ..., Permission, ... } from './types'`) and `GetPermissionsResponse` interface is still defined.
- The spec called for removing `UpdateUserPermissionsRequest` (done ✅) but `GetPermissionsResponse` — which depends on the now-dropped `Permission` DB model — was not cleaned up.
- **Action Required:** Remove `Permission` from the import list and remove the `GetPermissionsResponse` interface. Note: if `Permission` type is removed from `shared/src/types.ts` first, this file will have a dangling import that will break the TypeScript build.

---

## Issues Summary

### CRITICAL (Must Fix)

| # | File | Issue | Impact |
|---|------|-------|--------|
| C-1 | `shared/src/types.ts` | `Permission` and `UserPermission` interfaces not removed | Dead code from dropped DB tables; misleading |
| C-2 | `shared/src/api-types.ts` | `Permission` import and `GetPermissionsResponse` interface not removed | Dead code; will become a TS error once C-1 is fixed |

### RECOMMENDED (Should Fix)

| # | File | Issue |
|---|------|-------|
| R-1 | `backend/src/utils/groupAuth.ts` | ADMIN bypass uses `\|\|` instead of `Math.max()` — semantically differs from spec's `max(derived, minLevel)` |
| R-2 | `backend/src/middleware/auth.ts` | Stale comment: `permLevel` field comment still says "Set by checkPermission middleware" |
| R-3 | `backend/src/services/user.service.ts` | `UserWithPermissions` local interface + `formatUserWithPermissions` still return `permissions: []` — dead field in API response |
| R-4 | `backend/src/services/userSync.service.ts` | `PermissionMapping` is still exported (used internally, but name is legacy) — consider renaming to `ModuleAccessMapping` |

---

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 85% | B |
| Best Practices | 86% | B |
| Functionality | 88% | B+ |
| Code Quality | 88% | B+ |
| Security | 93% | A |
| Performance | 97% | A+ |
| Consistency | 90% | A- |
| Build Success | 100% | A+ |

**Overall Grade: B+ (91%)**

---

## Assessment

**Overall Result: NEEDS_REFINEMENT**

The core implementation is well-executed:
- All 5 legacy backend files deleted ✅
- All 4 frontend legacy files deleted ✅
- All 37 `checkPermission` call sites replaced with `requireModule` ✅
- `syncPermissionsForUser` removed from login flow ✅
- 4 Prisma models dropped, `approverEmailsSnapshot` added ✅
- `buildApproverEmailSnapshot` correctly blocks PO submission on Graph failure ✅
- Zero TypeScript errors, valid Prisma schema, clean production build ✅

The two CRITICAL issues are both in the **shared package** and are dead code only — they do not cause build failures today, but `Permission`/`UserPermission` interfaces in `shared/src/types.ts` and `GetPermissionsResponse` in `shared/src/api-types.ts` are misleading remnants of the dropped DB layer that must be removed to complete the spec.

The RECOMMENDED fixes are minor quality improvements. Notably R-1 (`Math.max` vs `||`) should be addressed to ensure correctness for any future route additions with higher `minLevel` values.

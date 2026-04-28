# Remove Legacy Permission System — Specification

**Date:** 2026-03-12  
**Author:** Research SubAgent  
**Status:** Ready for Implementation

---

## Executive Summary

The Tech-V2 codebase contains **two coexisting permission designs**:

| | Legacy System | Modern System |
|---|---|---|
| **Location** | `shared/src/types.ts`, `userSync.service.ts` constructor block | `backend/src/middleware/permissions.ts`, `Permission`/`UserPermission` DB tables |
| **Level type** | String: `'VIEW' \| 'CREATE' \| 'EDIT' \| 'DELETE' \| 'ADMIN'` | Integer: `1–5` (ascending authority) |
| **Module names** | `'USERS' \| 'LOCATIONS' \| 'SUPERVISORS' \| 'ROOMS' \| 'EQUIPMENT' \| 'MAINTENANCE' \| 'REPORTS' \| 'SETTINGS'` | `'TECHNOLOGY' \| 'MAINTENANCE' \| 'REQUISITIONS' \| 'PROFESSIONAL_DEV' \| 'SPECIAL_ED' \| 'TRANSCRIPTS'` |
| **DB enforcement** | None (types never imported; no DB column for string level) | Yes — `checkPermission(module, level)` middleware queries `user_permissions` join `permissions` on every guarded request |
| **Used in routes** | Never | `inventory.routes.ts`, `purchaseOrder.routes.ts`, `user.routes.ts`, `referenceData.routes.ts`, `fundingSource.routes.ts`, `assignment.routes.ts` |
| **Status** | **Dead code / orphaned** | **Active, security-enforced** |

There is also a third, smaller piece of dead code: a `checkRole()` function defined in `backend/src/middleware/permissions.ts` that is never invoked by any route.

Additionally, `backend/src/services/userSync.service.ts` still hard-codes permission level numbers from a **previously-fixed inverted level system** (TECHNOLOGY levels were inverted 1↔3; REQUISITIONS used a legacy 1–9 scale). These stale numbers reference non-existent permission records, causing the Entra-sync to silently drop permission assignments for users belonging to several AD groups.

**Affected files: 6**

---

## Part 1 — Complete Inventory of the Legacy System

### 1.1 `shared/src/types.ts`

**Status:** The `@mgspe/shared-types` package (located at `shared/`) is **not listed as a dependency** in either `backend/package.json` or `frontend/package.json`. Nothing imports from it at runtime. The entire package is orphaned.

**Legacy members in this file:**

| Lines (approx.) | Symbol | Problem |
|---|---|---|
| 41–52 | `export type PermissionModule` | Module names differ from DB/backend (`'USERS'`, `'LOCATIONS'`, `'SUPERVISORS'`, `'ROOMS'`, `'EQUIPMENT'`, `'MAINTENANCE'`, `'REPORTS'`, `'SETTINGS'`) — only `MAINTENANCE` overlaps with the real DB modules |
| 54 | `export type PermissionLevel = 'VIEW' \| 'CREATE' \| 'EDIT' \| 'DELETE' \| 'ADMIN'` | String-based — directly contradicts the DB where `permissions.level` is a PostgreSQL `Int`. Never used in any route, validator, or hook. |
| ~183–193 | `export interface Permission { ... level: string; ... }` | `level` is typed as `string` when the DB column and every active code path use `number` |
| ~87–97 | `export interface UserPermissionDetail { ... level: string; ... }` | Same issue — `level` should be `number` |
| ~198–206 | `export interface UserPermission` | Stand-alone interface that duplicates information in `UserPermissionDetail` |

**Action:** Remove or correct the `PermissionModule`, `PermissionLevel`, and the `level: string` fields. Because the package is completely orphaned, the cleanest approach is to either delete the package or update the types to match the modern system exactly (for future use).

---

### 1.2 `shared/src/api-types.ts`

**Status:** Part of the same orphaned package.

**Legacy members:**

| Symbol | Problem |
|---|---|
| `LoginResponse.accessToken: string`, `LoginResponse.refreshToken: string` | Modern auth stores tokens in **HttpOnly cookies** only — `accessToken` and `refreshToken` are not returned in the JSON body |
| `RefreshTokenRequest`, `RefreshTokenResponse` | Stale token-in-body pattern — the modern `/auth/refresh` endpoint uses cookie-based rotation |
| Imports `Permission` from `./types` | Inherits the wrong `level: string` |

**Note:** `UpdateUserPermissionsRequest.permissions: Array<{ module: string; level: number }>` is **correct** in this file (numeric level) — do not remove that.

---

### 1.3 `shared/src/index.ts`

Re-exports everything from `types.ts` and `api-types.ts`. No change needed here beyond what is fixed in those files; it remains as the package barrel.

---

### 1.4 `backend/src/services/userSync.service.ts` — Constructor Level Mappings

**This is the highest-risk legacy artifact.** The private constructor block (`groupRoleMappings`) hard-codes integer permission levels for Entra group → permission assignments. These numbers were written against **two different legacy schemes** that were subsequently fixed by migration scripts:

- `fix-permission-levels.ts` swapped TECHNOLOGY and MAINTENANCE levels 1↔3.
- `fix-requisition-permission-levels.ts` replaced REQUISITIONS levels 1–9 (descending authority) with 1–5 (ascending authority).

The constructor was **never updated after those migrations**. As a result:

**TECHNOLOGY module — wrong levels:**

| Group | Current level in code | Comment in code | What level 1 actually means now | Correct level |
|---|---|---|---|---|
| `ENTRA_ADMIN_GROUP_ID` | 1 | (full access) | General User (view only) | **bypass — ADMIN role skips check** |
| `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | 1 | "Technology Director" | General User (view only) | **3** (Technology Department) |
| `ENTRA_TECH_ADMIN_GROUP_ID` | 1 | "Technology Department" | General User (view only) | **3** (Technology Department) |
| `ENTRA_ALL_STAFF_GROUP_ID` | 3 | "General User" | Technology Department (full admin) | **1** (General User) |
| `ENTRA_ALL_STUDENTS_GROUP_ID` | 3 | "General User only" | Technology Department (full admin) | **1** (General User) |

**MAINTENANCE module — wrong levels (same 1↔3 inversion):**

| Group | Current level | Correct level |
|---|---|---|
| `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` | 1 | **3** |
| `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` | 1 | **3** |
| `ENTRA_ALL_STAFF_GROUP_ID` | 3 | **1** |

**REQUISITIONS module — levels from old 1–9 inverted system, non-existent in DB:**

| Group | Current level (old system) | Correct level (new 1–5 system) | Old name → New name |
|---|---|---|---|
| `ENTRA_ADMIN_GROUP_ID` | 1 | **bypass** (ADMIN role) | Director of Schools → bypass |
| `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | 1 | **5** | Director of Schools → Director of Services |
| `ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID` | 2 | **5** | Director of Finance → Director of Services |
| `ENTRA_TECH_ADMIN_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_PRINCIPALS_GROUP_ID` | 4 | **3** | Principal → Supervisor |
| `ENTRA_VICE_PRINCIPALS_GROUP_ID` | 5 | **3** | Vice Principal → Supervisor |
| `ENTRA_SPED_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_NURSE_DIRECTOR_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID` | 7 | **3** | Supervisor → Supervisor |
| `ENTRA_ALL_STAFF_GROUP_ID` | 9 | **2** | General User → General User |

**How the bug manifests at runtime:** `syncUserPermissions()` calls `prisma.permission.findUnique({ where: { module_level: { module, level } } })`. If level 7 or level 9 does not exist in the `permissions` table, the `findUnique` returns `null` and the permission is silently skipped — **the user is synced with no REQUISITIONS permission at all**, leaving them unable to perform any action guarded by `checkPermission('REQUISITIONS', N)`.

**File location:** `backend/src/services/userSync.service.ts`  
**Change required:** Update every `{ module: ..., level: ... }` entry in the constructor `groupRoleMappings` to use the correct post-migration levels per the mapping tables above, and reconcile the now-incorrect inline comments.

---

### 1.5 `backend/src/middleware/permissions.ts` — `checkRole()` Function

**Lines:** ~150–207 (the entire `checkRole` function and its JSDoc block)

**Status:** Defined and exported, but **never imported or called by any route file**. Search results confirm zero usages in `src/routes/`. The function provides simple role-string matching, redundant with the inline `roles.includes('ADMIN')` checks already scattered across route files.

```typescript
// Dead code — remove this entire function block
export function checkRole(allowedRoles: string[]) { ... }
```

**Action:** Remove the function. The JSDoc example comment is the only reference.

---

### 1.6 `frontend/src/pages/Users.backup.tsx`

**Status:** A backup of the original `Users.tsx` before the TanStack Query migration. Uses direct `async/await` API calls (`userService.getUsers()`, `adminService.getSyncStatus()`) instead of TanStack Query hooks. This file is not imported or registered in any route in `App.tsx`. It is unreachable dead code.

**Action:** Delete the entire file.

---

## Part 2 — Complete Inventory of the Modern System

The following is the authoritative permission infrastructure to keep. Listed here to confirm it covers all cases the legacy system was meant to handle.

### 2.1 Database Models (`schema.prisma`)

```prisma
model Permission {
  id              String           @id @default(uuid())
  module          String           // TECHNOLOGY | MAINTENANCE | REQUISITIONS | ...
  level           Int              // 1–5 ascending authority
  name            String
  description     String?
  isActive        Boolean          @default(true)
  userPermissions UserPermission[]
  @@unique([module, level])
  @@map("permissions")
}

model UserPermission {
  id           String     @id @default(uuid())
  userId       String
  permissionId String
  grantedAt    DateTime   @default(now())
  grantedBy    String?
  expiresAt    DateTime?
  permission   Permission @relation(...)
  user         User       @relation(...)
  @@unique([userId, permissionId])
  @@map("user_permissions")
}
```

`User.role` (`ADMIN | MANAGER | TECHNICIAN | VIEWER`) acts as a fast-path macro:
- **ADMIN role** → `checkPermission` returns immediately with `permLevel = 5` (no DB query)
- Other roles → full DB lookup

---

### 2.2 Backend Middleware (`backend/src/middleware/permissions.ts`)

| Export | Status | Description |
|---|---|---|
| `PermissionModule` type | **KEEP** | `'TECHNOLOGY' \| 'MAINTENANCE' \| 'TRANSPORTATION' \| 'NUTRITION' \| 'CURRICULUM' \| 'FINANCE' \| 'REQUISITIONS'` |
| `PermissionLevel` type | **KEEP** | `1 \| 2 \| 3 \| 4 \| 5` |
| `checkPermission(module, level)` | **KEEP** | Core RBAC middleware; queries DB; sets `req.user.permLevel` |
| `checkRole(allowedRoles)` | **REMOVE** | Dead code (see §1.5) |

---

### 2.3 Guarded Route Files

Every route file that currently uses `checkPermission`:

| File | Modules/Levels Used |
|---|---|
| `backend/src/routes/inventory.routes.ts` | `TECHNOLOGY 1` (read), `TECHNOLOGY 2` (write), `TECHNOLOGY 3` (delete) |
| `backend/src/routes/purchaseOrder.routes.ts` | `REQUISITIONS 1–5` |
| `backend/src/routes/referenceData.routes.ts` | `TECHNOLOGY 1` (read), `TECHNOLOGY 2` (write) |
| `backend/src/routes/fundingSource.routes.ts` | `TECHNOLOGY 1` (read), `TECHNOLOGY 2` (write), `TECHNOLOGY 3` (delete) |
| `backend/src/routes/assignment.routes.ts` | `TECHNOLOGY 2` (write), `TECHNOLOGY 1` (read) |
| `backend/src/routes/user.routes.ts` | `TECHNOLOGY 1` (search endpoint only; rest gated by `requireAdmin`) |

Routes **not yet covered** by `checkPermission` (use only `authenticate` or `requireAdmin`):
- `room.routes.ts` — only `authenticate` + CSRF, no module-level check
- `location.routes.ts` — only `authenticate` + CSRF, no module-level check
- `admin.routes.ts` — `requireAdmin` (ADMIN role only)
- `settings.routes.ts` — `requireAdmin` (ADMIN role only)
- `auth.routes.ts` — public/token endpoints

These are not a concern for this removal task; they fall under the role-based gate (`requireAdmin`) which is part of the *modern* system.

---

### 2.4 Permission Seed Data (`backend/prisma/seed.ts`)

Post-migration seed defines:

| Module | Levels |
|---|---|
| TECHNOLOGY | 1 (view), 2 (edit), 3 (admin) |
| MAINTENANCE | 1 (view), 2 (edit), 3 (admin) |
| REQUISITIONS | 1 (viewer), 2 (general user/requestor), 3 (supervisor), 4 (purchasing staff), 5 (DOS/full) |
| PROFESSIONAL_DEV | 0 (no access), 1 (access) |
| SPECIAL_ED | 0 (no access), 1 (access) |
| TRANSCRIPTS | 0 (no access), 1 (access) |

---

### 2.5 Backend Service & Controller

| File | Key Functions |
|---|---|
| `backend/src/services/user.service.ts` | `updatePermissions(userId, permissions[], grantedBy)` — transactional replace of all UserPermission rows |
| `backend/src/services/user.service.ts` | `getAvailablePermissions()` — returns all Permission records grouped by module |
| `backend/src/controllers/user.controller.ts` | `updateUserPermissions`, `getPermissions` |
| `backend/src/validators/user.validators.ts` | `UpdateUserPermissionsSchema` — validates `{ module: string, level: number }` array |

---

### 2.6 Frontend

| File | Role |
|---|---|
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | Reads user's `permissions[]` from user-detail API, finds max `REQUISITIONS` level, returns numeric `permLevel` |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Uses `permLevel >= N` comparisons to show/hide tabs and buttons |
| `frontend/src/services/userService.ts` | `updateUserPermissions()` sends `{ module, level: number }[]` |
| `frontend/src/hooks/mutations/useUserMutations.ts` | `useUpdateUserPermissions()` — TanStack mutation wrapper |
| `frontend/src/components/ProtectedRoute.tsx` | Route guard: authentication check + optional `requireAdmin` role check |

---

## Part 3 — Step-by-Step Removal Plan

### Step 1: Fix `userSync.service.ts` Constructor (HIGH PRIORITY — functional bug)

**File:** `backend/src/services/userSync.service.ts`

Replace every stale level number in the constructor's `groupRoleMappings` with the correct post-migration values from the tables in §1.4. Apply the following corrected group mappings:

```typescript
// ADMIN group (TECHNOLOGY check bypassed by role; keep minimal grant)
permissions: [
  // ADMIN role bypasses checkPermission entirely — these are cosmetic fallbacks
  { module: 'TECHNOLOGY',       level: 3 },
  { module: 'MAINTENANCE',      level: 3 },
  { module: 'REQUISITIONS',     level: 5 },
  { module: 'PROFESSIONAL_DEV', level: 1 },
  { module: 'SPECIAL_ED',       level: 1 },
  { module: 'TRANSCRIPTS',      level: 1 },
]

// Director of Schools
permissions: [
  { module: 'TECHNOLOGY',       level: 2 },  // Principal/School Tech
  { module: 'MAINTENANCE',      level: 3 },  // Full maintenance
  { module: 'REQUISITIONS',     level: 5 },  // Director of Services (final approval)
  { module: 'PROFESSIONAL_DEV', level: 1 },
  { module: 'SPECIAL_ED',       level: 1 },
  { module: 'TRANSCRIPTS',      level: 1 },
]

// Director of Finance
permissions: [
  { module: 'TECHNOLOGY',       level: 2 },  // Edit
  { module: 'MAINTENANCE',      level: 2 },  // Edit
  { module: 'REQUISITIONS',     level: 5 },  // Director of Services (final approval)
  { module: 'PROFESSIONAL_DEV', level: 1 },
]

// Tech Admin (ENTRA_TECH_ADMIN_GROUP_ID)
permissions: [
  { module: 'TECHNOLOGY',   level: 3 },  // Technology Department (full admin)
  { module: 'MAINTENANCE',  level: 2 },  // School-level edit
  { module: 'REQUISITIONS', level: 3 },  // Supervisor
]

// Maintenance Admin (ENTRA_MAINTENANCE_ADMIN_GROUP_ID)
permissions: [
  { module: 'TECHNOLOGY',   level: 2 },  // School Tech
  { module: 'MAINTENANCE',  level: 3 },  // Maintenance full admin
  { module: 'REQUISITIONS', level: 3 },  // Supervisor
]

// Principals
permissions: [
  { module: 'TECHNOLOGY',       level: 2 },  // Edit
  { module: 'MAINTENANCE',      level: 2 },  // Edit
  { module: 'REQUISITIONS',     level: 3 },  // Supervisor
  { module: 'PROFESSIONAL_DEV', level: 1 },
]

// Vice Principals
permissions: [
  { module: 'TECHNOLOGY',       level: 2 },  // Edit
  { module: 'MAINTENANCE',      level: 2 },  // Edit
  { module: 'REQUISITIONS',     level: 3 },  // Supervisor
  { module: 'PROFESSIONAL_DEV', level: 1 },
]

// SPED Director
permissions: [
  { module: 'SPECIAL_ED',       level: 1 },
  { module: 'REQUISITIONS',     level: 3 },  // Supervisor
  { module: 'PROFESSIONAL_DEV', level: 1 },
]

// Maintenance Director
permissions: [
  { module: 'MAINTENANCE',  level: 3 },  // Full maintenance admin
  { module: 'REQUISITIONS', level: 3 },  // Supervisor
]

// Transportation Director
permissions: [
  { module: 'REQUISITIONS', level: 3 },  // Supervisor
  { module: 'MAINTENANCE',  level: 2 },  // School-level edit
]

// Technology Director
permissions: [
  { module: 'TECHNOLOGY',   level: 3 },  // Technology Department (full admin)
  { module: 'REQUISITIONS', level: 3 },  // Supervisor
]

// Afterschool Director / Nurse Director / Supervisors of Instruction
permissions: [
  { module: 'REQUISITIONS',     level: 3 },  // Supervisor
  { module: 'PROFESSIONAL_DEV', level: 1 },  // (Nurse: no PD needed — remove if desired)
]

// All Staff
permissions: [
  { module: 'TECHNOLOGY',       level: 1 },  // General User (view only)
  { module: 'MAINTENANCE',      level: 1 },  // General User (view only)
  { module: 'REQUISITIONS',     level: 2 },  // General User (create/submit own POs)
  { module: 'PROFESSIONAL_DEV', level: 1 },
]

// All Students
permissions: [
  { module: 'TECHNOLOGY', level: 1 },  // View only
]
```

After updating the code, run `npm run sync:users:all` (or the admin sync panel) on a staging environment and verify that all user groups receive the correct permission levels.

---

### Step 2: Remove `checkRole()` from Permissions Middleware

**File:** `backend/src/middleware/permissions.ts`

Delete the `checkRole` function (lines ~150–207) and its preceding JSDoc block. No imports to update — it is not imported anywhere.

---

### Step 3: Delete `Users.backup.tsx`

**File:** `frontend/src/pages/Users.backup.tsx`

Delete the entire file. It is not referenced in `App.tsx` or any route/import.

---

### Step 4: Update `shared/src/types.ts`

**Option A (Recommended): Update to match modern system**

Replace legacy type definitions with correct modern equivalents:

```typescript
// REPLACE the legacy string-based PermissionLevel:
// OLD: export type PermissionLevel = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'ADMIN';
// NEW:
export type PermissionLevel = 1 | 2 | 3 | 4 | 5;

// REPLACE the legacy PermissionModule:
// OLD: export type PermissionModule = 'USERS' | 'LOCATIONS' | 'SUPERVISORS' | ...;
// NEW:
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'REQUISITIONS'
  | 'PROFESSIONAL_DEV'
  | 'SPECIAL_ED'
  | 'TRANSCRIPTS';

// REPLACE level: string in Permission interface:
// OLD: level: string;
// NEW: level: number;

// REPLACE level: string in UserPermissionDetail:
// OLD: level: string;
// NEW: level: number;
```

**Option B: Mark shared package as deprecated** (if there are no plans to use it)

Add a `@deprecated` JSDoc comment to the package's `index.ts` barrel export and file a ticket to eventually remove the package. This is the lower-risk option if the package's removal scope is uncertain.

---

### Step 5: Update `shared/src/api-types.ts`

Remove the stale token-in-body auth types (the modern system uses HttpOnly cookies):

```typescript
// REMOVE these (tokens are HttpOnly cookies now, not in response body):
export interface LoginResponse { ... accessToken: string; refreshToken: string; }
export interface RefreshTokenRequest { ... }
export interface RefreshTokenResponse { ... }
```

Replace `LoginResponse` with a slim shape that reflects the actual API response:
```typescript
export interface LoginResponse {
  user: UserWithPermissions;
  // access_token and refresh_token are set as HttpOnly cookies, not in body
}
```

---

## Part 4 — Database Migration Needs

**No new Prisma migration is required** for the code changes above.

- The `Permission` and `UserPermission` tables already exist with the correct schema.
- The `fix-permission-levels.ts` and `fix-requisition-permission-levels.ts` scripts have already updated the DB records (assuming they were run).
- The `userSync.service.ts` fix (Step 1) only changes in-memory level constants that are then used to look up existing `Permission` rows by `(module, level)` composite key.

**Prerequisite check:** Verify the migration scripts have been run and the DB is in the correct state:

```sql
-- Verify TECHNOLOGY levels are correct:
SELECT level, name FROM permissions WHERE module = 'TECHNOLOGY' ORDER BY level;
-- Expected: level 1 = 'General User', level 2 = 'Principal/School Tech', level 3 = 'Technology Department'

-- Verify REQUISITIONS levels are correct:
SELECT level, name FROM permissions WHERE module = 'REQUISITIONS' ORDER BY level;
-- Expected: level 1='Viewer', 2='General User', 3='Supervisor', 4='Purchasing Staff', 5='Director of Services'
```

If these queries return the old inverted order, run the migration scripts **before** re-running user sync.

**After Step 1**, if existing users already have stale `user_permissions` rows from a previous sync with legacy levels, they may have incorrect or missing permissions. A targeted re-sync via the admin panel (`/admin → Sync Users`) will repair all affected records.

---

## Part 5 — Security Considerations

### No Auth Gap Created

- The legacy `PermissionLevel = 'VIEW' | 'CREATE' | ...` type and `checkRole()` function are **never called** by any route. Removing them does not change any access control decision.
- The modern `checkPermission(module, level)` middleware is already the sole gatekeeper on all inventory, purchase-order, reference-data, funding-source, and assignment routes.
- `requireAdmin` in `auth.ts` remains untouched and continues guarding admin/settings routes.
- `ProtectedRoute` in the frontend continues to enforce authentication and the `requireAdmin` flag for admin-only pages.

### Security Risk from `userSync.service.ts` Legacy Levels (Pre-Fix)

The **only security-sensitive change** is Step 1 (fixing `userSync.service.ts`). The current bug causes certain high-authority users (Technology Director, Director of Schools, Supervisors) to receive **no REQUISITIONS permission** after an Entra sync, because level 7 and level 9 do not exist in the DB. This is security-conservative (too restrictive, not too permissive), but it breaks functionality for those users.

The corrected levels in Step 1 must map each group to the **correct** post-migration level. Use the mapping table in §1.4 and validate against `docs/requisition_flow.md` as the canonical spec for REQUISITIONS levels.

### `Users.backup.tsx` — No New Risk

The backup file is not bundled into the app (not registered in `App.tsx`). Deleting it removes dead code only.

---

## Part 6 — Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Fix `userSync.service.ts` levels | **Medium** — re-syncing users will reassign permissions; existing manually-granted permissions will be overwritten on next sync | Test on staging first; verify permission assignment before running on production; re-sync only after confirming fix is correct |
| Remove `checkRole()` | **None** — never called by any route | Confirm with grep that no route imports it |
| Delete `Users.backup.tsx` | **None** — not imported anywhere | Confirm with grep before deleting |
| Update `shared/src/types.ts` | **None** — package is orphaned (not in any package.json) | Run `grep -r "@mgspe/shared-types"` to confirm zero imports before editing |
| Update `shared/src/api-types.ts` | **None** — package is orphaned | Same as above |
| No DB migration needed | **None** | Verify DB state with SQL queries in §4 |

---

## Summary Table of Affected Files

| # | File | Change Type | Priority |
|---|---|---|---|
| 1 | `backend/src/services/userSync.service.ts` | Update — fix 15+ wrong level numbers in constructor | **P0 (functional bug)** |
| 2 | `backend/src/middleware/permissions.ts` | Remove — delete `checkRole()` function (~57 lines) | P1 |
| 3 | `frontend/src/pages/Users.backup.tsx` | Delete — entire file | P1 |
| 4 | `shared/src/types.ts` | Update — fix `PermissionLevel`, `PermissionModule`, and `level: string` fields | P2 |
| 5 | `shared/src/api-types.ts` | Update — remove stale token-in-body auth types | P2 |
| 6 | `shared/src/index.ts` | No change required unless the package is deleted | P3 |

**Total files affected: 5 changes + 1 deletion = 6 files**

---

## Appendix: Quick Verification Commands

Run these before starting implementation to confirm the analysis:

```bash
# Confirm checkRole is never used in routes:
grep -rn "checkRole" backend/src/routes/

# Confirm Users.backup.tsx is not imported:
grep -rn "Users.backup" frontend/src/

# Confirm shared types are not imported by backend or frontend:
grep -rn "@mgspe/shared-types" backend/ frontend/

# Confirm the legacy string PermissionLevel is not used anywhere:
grep -rn "'VIEW'\|'CREATE'\|'EDIT'\|'DELETE'\|'ADMIN'" backend/src/ frontend/src/

# Confirm current REQUISITIONS permission DB state (run via prisma studio or psql):
# SELECT level, name FROM permissions WHERE module = 'REQUISITIONS' ORDER BY level;
```

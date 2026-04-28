# Legacy Permission System Removal Plan

> **Research Date:** April 9, 2026  
> **Status:** Draft — Awaiting Review  
> **Scope:** Remove DB-level permission tables and `checkPermission` middleware; replace with pure Entra-group-derived authorization

---

## Executive Summary

Tech-V2 currently uses a **two-layer hybrid authorization model**:

1. **Group-Based (Entra ID)** — User's Entra groups drive role and permission assignment at login via `UserSyncService.getRoleFromGroups()`.  
2. **DB-Level (Legacy)** — The output of step 1 is written to `user_permissions` (and expiry-checked at request time) via `checkPermission()` middleware. Two additional tables (`role_profiles`, `role_profile_permissions`) support named permission templates managed in the admin UI.

The goal is to **remove the DB-level layer entirely** and serve access control answers **directly from the JWT `groups` claim** already embedded in every authenticated request. This eliminates:
- Two extra DB queries per protected API call (the `UserPermission` pattern)
- A synchronization step at login (`syncPermissionsForUser`)
- Four DB tables: `permissions`, `user_permissions`, `role_profiles`, `role_profile_permissions`
- The Admin "Permission Profiles" UI page and all related frontend machinery
- The `/api/roles` route family and `RolesService`
- The per-user manual permission override capability (not needed once groups are authoritative)

**Total legacy-permission references found: 147 across 37 files.**

---

## Systems Overview

### Legacy Permission System (TO REMOVE)

The legacy system stores a derived snapshot of Entra group membership as rows in the `user_permissions` table. These rows are:
- Written at login by `syncPermissionsForUser()` in `userSync.service.ts`
- Re-synced on demand via `POST /api/admin/resync-permissions/:userId`
- Read at request time by `checkPermission(module, requiredLevel)` middleware
- Exposed to admins and the frontend via the `/api/users/permissions`, `/api/users/:id/permissions`, `/api/users/:id/effective-permissions`, and `/api/roles` endpoints

The system comprises **4 DB models**, **1 middleware file**, and **9+ backend files** plus the entire ManageRoles frontend feature.

### Group-Based Permission System (TO KEEP)

The group-based system is already in place and is the source of truth:
- Entra group IDs are declared in `.env` as `ENTRA_*_GROUP_ID` variables
- At login, Graph API group memberships are fetched, the JWT is signed with a `groups: string[]` claim, and `UserSyncService.getRoleFromGroups()` maps groups to a `{ role, permissions }` result
- `authenticate` middleware in `auth.ts` decodes the JWT and attaches `req.user.groups`  
- `requireAdmin()` already checks both `req.user.roles` AND `req.user.groups.includes(ENTRA_ADMIN_GROUP_ID)` — this is the pattern to expand
- `requireGroup(groupId)` middleware exists and works today

After removal, `checkPermission(module, level)` will be replaced by a new **`requireModule(module, level)`** middleware that derives `permLevel` directly from `req.user.groups` using `UserSyncService.getRoleFromGroups()` logic **inline**, with no DB access.

---

## Complete Inventory of Legacy Permission References

### Database Models (Prisma Schema)

| Model | File | Table | Purpose |
|-------|------|-------|---------|
| `Permission` | `backend/prisma/schema.prisma` L278–303 | `permissions` | Catalog of (module, level, name) records |
| `UserPermission` | `backend/prisma/schema.prisma` L417–433 | `user_permissions` | Junction: user ↔ permission with grantedBy, expiresAt |
| `RoleProfile` | `backend/prisma/schema.prisma` L627–638 | `role_profiles` | Named permission templates |
| `RoleProfilePermission` | `backend/prisma/schema.prisma` L663–675 | `role_profile_permissions` | Junction: RoleProfile ↔ (module, level) |
| `User.userPermissions` | `backend/prisma/schema.prisma` | (relation) | Relation field on User model |

### Backend — Middleware

| File | What | Lines |
|------|------|-------|
| `backend/src/middleware/permissions.ts` | **Entire file** — `checkPermission(module, level)` function; queries `userPermission` table; sets `req.user.permLevel` | All |
| `backend/src/middleware/auth.ts` | `permLevel?: number` field on `AuthRequest.user` / `TypedAuthRequest.user` | L10, L41 |
| `backend/src/middleware/auth.ts` | `JWTPayload` interface — no change needed (groups already present) | — |

### Backend — Controllers

| File | What | Relevant Lines |
|------|------|----------------|
| `backend/src/controllers/auth.controller.ts` | Calls `syncPermissionsForUser(user.id, roleMapping.permissions)` at login | ~L201–L214 |
| `backend/src/controllers/user.controller.ts` | `updateUserPermissions` handler | ~L100–L115 |
| `backend/src/controllers/user.controller.ts` | `getPermissions` handler | ~L118–L127 |
| `backend/src/controllers/user.controller.ts` | `getEffectivePermissions` handler | ~L220–L230 |
| `backend/src/controllers/roles.controller.ts` | **Entire file** — CRUD handlers for `RoleProfile` | All |
| `backend/src/controllers/purchaseOrder.controller.ts` | Reads `req.user!.permLevel` on every handler | L54, L82, L98, L113, L160 |
| `backend/src/controllers/purchaseOrder.controller.ts` | Calls `getEmailsByRequisitionLevel()` for stage notifications | L133, L186, L193, L201 |

### Backend — Services

| File | What | Relevant Lines |
|------|------|----------------|
| `backend/src/services/userSync.service.ts` | `syncPermissionsForUser()` function — writes Entra permissions to DB | L42–L115 |
| `backend/src/services/userSync.service.ts` | `PermissionMapping` interface | L12 |
| `backend/src/services/userSync.service.ts` | `getRoleFromGroups()` — returns `{ role, permissions[] }` | L550+ |
| `backend/src/services/user.service.ts` | `updatePermissions()` method — replaces UserPermission records | L243–L340 |
| `backend/src/services/user.service.ts` | `getAvailablePermissions()` method — queries `Permission` table | L420–L465 |
| `backend/src/services/user.service.ts` | `getEffectivePermissions()` method | L350–L415 |
| `backend/src/services/user.service.ts` | `findAll()` and `findById()` — include `userPermissions` in queries | L130–L155, L174–L192 |
| `backend/src/services/user.service.ts` | `formatUserWithPermissions()` private helper | All occurrences |
| `backend/src/services/roles.service.ts` | **Entire file** — `RolesService` class managing `RoleProfile` | All |
| `backend/src/services/email.service.ts` | `getEmailsByRequisitionLevel()` — queries `userPermissions` to find email recipients | L118–L140 |
| `backend/src/services/purchaseOrder.service.ts` | `permLevel: number` parameter on `getPurchaseOrders`, `getPurchaseOrderById`, `updatePurchaseOrder`, `deletePurchaseOrder`, `approvePurchaseOrder` | Multiple |
| `backend/src/services/purchaseOrder.service.ts` | `STATUS_APPROVAL_REQUIREMENTS_DEFAULT` constant referencing `requiredLevel` integers | L33–L43 |

### Backend — Routes

| File | What | Lines with `checkPermission` |
|------|------|------------------------------|
| `backend/src/routes/inventory.routes.ts` | 13 `checkPermission('TECHNOLOGY', ...)` calls | L82, L93, L105, L117, L129, L142, L154, L166, L182, L194, L210, L221, L233, L241 |
| `backend/src/routes/assignment.routes.ts` | 10 `checkPermission('TECHNOLOGY', ...)` calls | L51, L64, L77, L90, L103, L115, L127, L139, L151 |
| `backend/src/routes/purchaseOrder.routes.ts` | 14 `checkPermission('REQUISITIONS', ...)` calls | L53, L64, L79, L91, L102, L117, L133, L145, L157, L169, L184, L195 |
| `backend/src/routes/referenceData.routes.ts` | 18 `checkPermission('TECHNOLOGY', ...)` calls | L24–L51 |
| `backend/src/routes/fundingSource.routes.ts` | 5 `checkPermission('TECHNOLOGY', ...)` calls | L40, L47, L58, L66, L78 |
| `backend/src/routes/user.routes.ts` | 1 `checkPermission('TECHNOLOGY', 1)` + imports | L3, L42 |
| `backend/src/routes/user.routes.ts` | `GET /permissions`, `PUT /:id/permissions`, `GET /:id/effective-permissions` routes | L64, L81, L83 |
| `backend/src/routes/roles.routes.ts` | **Entire file** — full CRUD + apply routes for `RoleProfile` | All |
| `backend/src/routes/admin.routes.ts` | `GET /diagnose-permissions/:userId` — includes `userPermissions` | ~L93–L175 |
| `backend/src/routes/admin.routes.ts` | `POST /resync-permissions/:userId` — calls `syncPermissionsForUser` | ~L180–L215 |

### Backend — Validators

| File | What |
|------|------|
| `backend/src/validators/user.validators.ts` | `PermissionItemSchema`, `UpdateUserPermissionsSchema`, `UpdateUserPermissions` type |
| `backend/src/validators/roles.validators.ts` | **Entire file** — `RoleProfileIdParamSchema`, `CreateRoleProfileSchema`, `UpdateRoleProfileSchema`, `ApplyRoleProfileParamsSchema` |

### Backend — Seed

| File | What |
|------|------|
| `backend/prisma/seed.ts` | Seeds 12 `Permission` records (TECHNOLOGY×3, MAINTENANCE×3, REQUISITIONS×6) |
| `backend/prisma/seed.ts` | Deactivates legacy REQUISITIONS levels 7, 8, 9 |
| `backend/prisma/seed.ts` | Seeds 5 system `RoleProfile` records |

### Frontend — Services

| File | What |
|------|------|
| `frontend/src/services/userService.ts` | `Permission`, `UserPermission`, `PermissionsByModule`, `EffectivePermissions` interfaces |
| `frontend/src/services/userService.ts` | `getPermissions()`, `updateUserPermissions()`, `getEffectivePermissions()` methods |
| `frontend/src/services/rolesService.ts` | **Entire file** — `getAll`, `getById`, `create`, `update`, `delete`, `applyToUser` |

### Frontend — Types

| File | What |
|------|------|
| `frontend/src/types/roles.types.ts` | **Entire file** — `PERMISSION_MODULES`, `MODULE_LABELS`, `MODULE_LEVELS`, `RoleProfilePermission`, `RoleProfile`, `CreateRoleProfileInput`, `UpdateRoleProfileInput`, `profileToModuleMap()`, `moduleMapToPermissions()` |

### Frontend — Hooks

| File | What |
|------|------|
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | **Entire hook** — fetches REQUISITIONS permission from DB via `/api/users/me` |
| `frontend/src/hooks/queries/useUsers.ts` | `usePermissions()` hook (L78–L97) |
| `frontend/src/hooks/queries/useUsers.ts` | `useEffectivePermissions()` hook (L98–L115) |
| `frontend/src/hooks/mutations/useUserMutations.ts` | `useUpdateUserPermissions()` mutation (L76–L105) |
| `frontend/src/hooks/mutations/useRoleMutations.ts` | **Entire file** — `useCreateRoleProfile`, `useUpdateRoleProfile`, `useDeleteRoleProfile`, `useApplyRoleProfile` |

### Frontend — Pages / Components

| File | What |
|------|------|
| `frontend/src/pages/ManageRoles.tsx` | **Entire page** — Admin UI for permission profile templates |
| `frontend/src/pages/Users.tsx` | Permission modal using `usePermissions()`, `useUpdateUserPermissions()`, `useEffectivePermissions()` |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Uses `useRequisitionsPermLevel()`; `permLevel` comparisons for action-button visibility |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Uses `useRequisitionsPermLevel()`; `minPermLevel` tab filtering |
| `frontend/src/pages/admin/AdminSettings.tsx` | "Approval Stage Permission Levels" section referencing DB permission levels |
| `frontend/src/components/layout/AppLayout.tsx` | "Permission Profiles" nav item pointing to `/admin/roles` |
| `frontend/src/lib/queryKeys.ts` | `permissions`, `allPermissions`, `effectivePermissions` query key factories |

### Shared

| File | What |
|------|------|
| `shared/src/types.ts` | `PermissionModule`, `PermissionLevel` types; `UserPermissionDetail` interface; `UserWithPermissions` interface |
| `shared/src/api-types.ts` | `UpdateUserPermissionsRequest` interface; `UserWithPermissions` usage in `LoginResponse`, `GetUsersResponse` |

---

## Database Changes Required

### Tables to Drop

| Table | Prisma Model | Reason |
|-------|-------------|--------|
| `permissions` | `Permission` | Replaced by compile-time group→level mapping |
| `user_permissions` | `UserPermission` | No longer needed; permLevel derived from JWT groups |
| `role_profiles` | `RoleProfile` | Admin template system removed |
| `role_profile_permissions` | `RoleProfilePermission` | Cascades from RoleProfile deletion |

### Schema Edits Required

1. **Remove model `Permission`** (L278–303 in schema.prisma)
2. **Remove model `UserPermission`** (L417–433) including `@@map("user_permissions")`
3. **Remove model `RoleProfile`** (L627–638) including `@@map("role_profiles")`
4. **Remove model `RoleProfilePermission`** (L663–675) including `@@map("role_profile_permissions")`
5. **Remove relation on `User` model** — delete `userPermissions UserPermission[]` and `fiscalYearRollovers` is unaffected
6. **Remove field `permLevel` from `AuthRequest.user`** in auth.ts (no schema change, just TS type)
7. **`SystemSettings`** — `supervisorApprovalLevel`, `financeDirectorApprovalLevel`, `dosApprovalLevel` fields (L613–615) can be **kept or removed**:
   - If removed → approval thresholds become hard-coded group checks
   - If kept → they serve as run-time admin overrides (recommended to keep them)
8. **Add `approverEmailsSnapshot Json?` to `PurchaseOrder` model** — see Step B9. This is an additive migration and can be done alongside or before the permission table drops.

### Migration Steps

```sql
-- Migration: drop permission tables (run in order due to FK constraints)
DROP TABLE IF EXISTS "user_permissions" CASCADE;
DROP TABLE IF EXISTS "role_profile_permissions" CASCADE;
DROP TABLE IF EXISTS "role_profiles" CASCADE;
DROP TABLE IF EXISTS "permissions" CASCADE;
```

> **⚠ Data Loss Warning:** This permanently destroys all existing permission grants and role profile templates. There is no "undo". Ensure the Entra group configuration in `.env` covers all users before running.

---

## Backend Changes Required

### Step B1 — Create `groupAuth.ts` Utility (New File)

**File:** `backend/src/utils/groupAuth.ts`  
**Purpose:** Replace `checkPermission` with a group-derived permission check.

```typescript
// Derive the effective permission level for a module from Entra group IDs
// Used by the new requireModule() middleware (replaces checkPermission)
export function derivePermLevelFromGroups(
  groupIds: string[],
  module: 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS'
): number {
  // Consult the exact same group→level mapping as UserSyncService constructor
  // but without a DB round-trip.
  // Implementation mirrors UserSyncService but as a pure function.
  let highest = 0;
  for (const [envVar, level] of GROUP_MODULE_MAP[module]) {
    const gid = process.env[envVar];
    if (gid && groupIds.includes(gid)) {
      if (level > highest) highest = level;
    }
  }
  return highest;
}

// Replacement middleware for checkPermission()
export function requireModule(
  module: 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS',
  minLevel: number
) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const groups = req.user.groups ?? [];
    // ADMIN bypass
    if (req.user.roles?.includes('ADMIN')) {
      req.user.permLevel = derivePermLevelFromGroups(groups, module) || minLevel;
      return next();
    }
    const level = derivePermLevelFromGroups(groups, module);
    if (level < minLevel) {
      res.status(403).json({ error: 'Forbidden', message: `Requires ${module} level ${minLevel}` });
      return;
    }
    req.user.permLevel = level;
    next();
  };
}
```

### Step B2 — Delete `backend/src/middleware/permissions.ts`

The entire file becomes obsolete once `requireModule` is in place.

### Step B3 — Update Route Files

Replace all `import { checkPermission } from '../middleware/permissions'` with `import { requireModule } from '../utils/groupAuth'`.  
Replace all `checkPermission('TECHNOLOGY', N)` with `requireModule('TECHNOLOGY', N)`.  
Replace all `checkPermission('REQUISITIONS', N)` with `requireModule('REQUISITIONS', N)`.

Affected route files (60+ call sites):
- `backend/src/routes/inventory.routes.ts` — 14 calls
- `backend/src/routes/assignment.routes.ts` — 10 calls
- `backend/src/routes/purchaseOrder.routes.ts` — 14 calls
- `backend/src/routes/referenceData.routes.ts` — 18 calls
- `backend/src/routes/fundingSource.routes.ts` — 5 calls
- `backend/src/routes/user.routes.ts` — 1 call

### Step B4 — Update `backend/src/middleware/auth.ts`

- `permLevel?: number` may remain on the type (it is set by `requireModule` for downstream controller use)
- No other changes needed

### Step B5 — Update `backend/src/controllers/auth.controller.ts`

Remove the `syncPermissionsForUser()` call and its surrounding try/catch block (~L200–L215).  
Remove the `import { UserSyncService, syncPermissionsForUser } from '../services/userSync.service'` import (keep `UserSyncService` if `getRoleFromGroups()` is still used at login for role determination).

> **Important:** `getRoleFromGroups()` is still needed to determine `user.role` (ADMIN vs USER) at login — only the `syncPermissionsForUser` DB write should be removed.

### Step B6 — Update `backend/src/services/userSync.service.ts`

Remove the `syncPermissionsForUser` exported function (L42–L115) entirely.  
Keep the `UserSyncService` class, `getRoleFromGroups()`, `getGroupDiagnostics()`, and the group→role mapping constructor — these are still used for:  
- Determining `user.role` at login
- Admin sync routes in `admin.routes.ts`

### Step B7 — Update `backend/src/services/user.service.ts`

1. Remove `UserPermission` import from Prisma client
2. Remove `updatePermissions()` method
3. Remove `getAvailablePermissions()` method
4. Remove `getEffectivePermissions()` method
5. Remove `UserWithPermissions.permissions` array field from the interface (or keep as empty `[]` for backward compat)
6. Remove `userPermissions: { include: { permission: true } }` includes from `findAll()` and `findById()`
7. Update `formatUserWithPermissions()` to return `permissions: []`

### Step B8 — Delete `backend/src/services/roles.service.ts`

Entire file obsolete.

### Step B9 — Approver Email Snapshot at PO Submission (replaces `getEmailsByRequisitionLevel`)

**Decision:** Capture approver email addresses as an **immutable snapshot on the `PurchaseOrder` record** at the moment the PO transitions from `draft` → `submitted`. Each subsequent notification stage reads from the snapshot — no group lookup at notification time.

**Rationale:** This is semantically correct (a PO submitted today routes to whoever holds each role *today*, even if group membership changes before the PO is fully approved), eliminates all per-notification Graph API calls, and requires no new cache columns on `User`.

**Failure behavior: BLOCKING.** If the Graph API call at submission time fails, the submission is rejected with a `503` error. The PO remains in `draft` state. This is appropriate for a financial workflow — a PO with no approver recipients should never silently enter the approval queue.

#### Schema Change

Add to `PurchaseOrder` model in `backend/prisma/schema.prisma`:

```prisma
model PurchaseOrder {
  // ... existing fields
  approverEmailsSnapshot Json?  // Immutable snapshot set at submission: { supervisor: string[], finance: string[], dos: string[], poEntry: string[] }
}
```

#### Snapshot Population (in `purchaseOrder.service.ts` submit transition)

```typescript
// Called once during draft → submitted transition
async function buildApproverEmailSnapshot(
  requestorId: string,
  graphClient: GraphApiClient
): Promise<ApproverEmailSnapshot> {
  // supervisor: from existing Supervisor relation on User (already in DB — no Graph call)
  const requestor = await prisma.user.findUnique({
    where: { id: requestorId },
    include: { supervisors: { include: { supervisor: true } } }
  });
  const supervisorEmails = requestor?.supervisors
    .map(s => s.supervisor.email)
    .filter(Boolean) ?? [];

  // finance, dos, poEntry: one Graph API call each (small, stable groups)
  const [financeEmails, dosEmails, poEntryEmails] = await Promise.all([
    graphClient.getGroupMemberEmails(process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID!),
    graphClient.getGroupMemberEmails(process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID!),
    graphClient.getGroupMemberEmails(process.env.ENTRA_FINANCE_PO_ENTRY_GROUP_ID!),
  ]);
  // If any Graph call fails, Promise.all rejects → caller catches and returns 503

  return {
    supervisor: supervisorEmails,
    finance: financeEmails,
    dos: dosEmails,
    poEntry: poEntryEmails,
  };
}
```

#### Email Notification (in `email.service.ts`)

**Delete** `getEmailsByRequisitionLevel()` entirely. Replace call sites with direct snapshot reads:

```typescript
// Example: notifying Finance Director after supervisor approval
const snapshot = po.approverEmailsSnapshot as ApproverEmailSnapshot;
await sendApprovalRequestEmail(snapshot.finance, po);
```

#### Error Handling at Submission

```typescript
// In purchaseOrder.service.ts — submitPurchaseOrder()
let snapshot: ApproverEmailSnapshot;
try {
  snapshot = await buildApproverEmailSnapshot(userId, graphClient);
} catch (err) {
  logger.error('Failed to build approver email snapshot from Graph API', { error: err.message, poId });
  throw new ServiceUnavailableError(
    'Could not retrieve approver information. Please try submitting again in a moment.'
  );
}
// Proceed to update PO status and save snapshot atomically in one Prisma transaction
```

> **Note:** The `approverEmailsSnapshot` column is write-once. After the `draft → submitted` transition it must never be overwritten, even if the PO is rejected and re-submitted. On re-submission, rebuild and overwrite the snapshot to capture any group membership changes that occurred since the original submission.

### Step B10 — Update `backend/src/services/purchaseOrder.service.ts`

No fundamental changes needed — `permLevel` parameter remains but is now derived from groups instead of DB. The `approvePurchaseOrder` method already checks `userGroups` for Finance Director identity (this is the group-first pattern to expand).

### Step B11 — Delete `backend/src/services/roles.service.ts`

### Step B12 — Delete `backend/src/controllers/roles.controller.ts`

### Step B13 — Update `backend/src/controllers/user.controller.ts`

Remove `updateUserPermissions`, `getPermissions`, `getEffectivePermissions` handlers and their exports.

### Step B14 — Update `backend/src/routes/user.routes.ts`

Remove:
- `import { checkPermission }` line
- `GET /users/permissions` route
- `PUT /:id/permissions` route  
- `GET /:id/effective-permissions` route
- `updateUserPermissions`, `getPermissions`, `getEffectivePermissions` from the controller import

### Step B15 — Delete `backend/src/routes/roles.routes.ts`

### Step B16 — Update `backend/src/routes/admin.routes.ts`

Remove `diagnose-permissions/:userId` route (or replace with group-based diagnostics).  
Remove `resync-permissions/:userId` route (no longer needed — groups are re-read on next login).  
Remove `userPermissions: { include: { permission: true } }` from user query in `diagnose-permissions`.

### Step B17 — Delete `backend/src/validators/roles.validators.ts`

### Step B18 — Update `backend/src/validators/user.validators.ts`

Remove `PermissionItemSchema`, `UpdateUserPermissionsSchema`, `UpdateUserPermissions` type.

### Step B19 — Update `backend/src/server.ts`

Remove `import rolesRoutes` and `app.use('/api/roles', rolesRoutes)`.

### Step B20 — Update `backend/prisma/seed.ts`

Remove the `Permission` upsert block (~12 records).  
Remove the deactivation of legacy levels 7/8/9.  
Remove the `RoleProfile` creation block (~5 system profiles).

---

## Frontend Changes Required

### Step F1 — Delete `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`

Replace with a new `useRequisitionsPermLevel.ts` that derives level from `user.groups` in the auth store:

```typescript
export function useRequisitionsPermLevel(): RequisitionsPermResult {
  const { user } = useAuthStore();
  if (!user) return { permLevel: 0, isLoading: false, isAdmin: false };

  const isAdmin = !!(user?.roles?.includes('ADMIN'));
  const groups = user.groups ?? [];
  const permLevel = derivePermLevelFrontend(groups, 'REQUISITIONS');
  return { permLevel, isLoading: false, isAdmin };
}
```

> **Note:** A `derivePermLevelFrontend()` utility must be added to `frontend/src/utils/groupAuth.ts` (or shared) that mirrors the backend mapping using the env-exposed group IDs (passed as Vite `VITE_*` env vars).

### Step F2 — Update `frontend/src/hooks/queries/useUsers.ts`

Remove `usePermissions()` and `useEffectivePermissions()` hooks.  
Remove `PermissionsByModule`, `EffectivePermissions` from imports.

### Step F3 — Update `frontend/src/hooks/mutations/useUserMutations.ts`

Remove `useUpdateUserPermissions()` mutation.

### Step F4 — Delete `frontend/src/hooks/mutations/useRoleMutations.ts`

### Step F5 — Update `frontend/src/services/userService.ts`

Remove `Permission`, `UserPermission`, `PermissionsByModule`, `EffectivePermissions` interfaces.  
Remove `getPermissions()`, `updateUserPermissions()`, `getEffectivePermissions()` methods.  
Update `User` interface: change `permissions: UserPermission[]` to `permissions?: never[]` or remove the field entirely.

### Step F6 — Delete `frontend/src/services/rolesService.ts`

### Step F7 — Delete `frontend/src/types/roles.types.ts`

### Step F8 — Delete `frontend/src/pages/ManageRoles.tsx`

### Step F9 — Update `frontend/src/pages/Users.tsx`

Remove:
- Permission modal (rendered when `showPermissionModal` is true — the entire `<Dialog>` block)
- `openPermissionModal`, `closePermissionModal`, `handlePermissionSave` handlers
- `usePermissions`, `useEffectivePermissions`, `useUpdateUserPermissions` hook usages
- "Edit Permissions" button in the user table row
- `showPermissionModal`, `selectedUser` state used purely for the permission modal

> **Note:** Keep `showSupervisorModal` and the supervisor management functionality — those are unrelated.

### Step F10 — Update `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Replace `useRequisitionsPermLevel()` import and usage with the new group-based hook:

```typescript
const { permLevel } = useRequisitionsPermLevel(); // hook now uses groups, no DB call
```

The `permLevel` comparisons (`>= 2`, `>= 3`, etc.) remain unchanged — only the source of `permLevel` changes.

### Step F11 — Update `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

Same as F10 — hook import replacement only; all `permLevel >=` logic remains.

### Step F12 — Update `frontend/src/pages/admin/AdminSettings.tsx`

Remove or update the "Notification Emails" and "Approval Stage Permission Levels" section (lines ~L470–L555) to reflect that levels come from groups, not DB grants.

> **Note:** `supervisorApprovalLevel`, `financeDirectorApprovalLevel`, `dosApprovalLevel` in `SystemSettings` are kept (they are used by PO service for dynamic thresholds). The AdminSettings UI section can be simplified or left as informational only.

### Step F13 — Update `frontend/src/components/layout/AppLayout.tsx`

Remove the `{ label: 'Permission Profiles', icon: '🎭', path: '/admin/roles', adminOnly: true }` nav item.

### Step F14 — Update `frontend/src/lib/queryKeys.ts`

Remove `permissions`, `allPermissions`, `effectivePermissions` key factories.

### Step F15 — Update `frontend/src/App.tsx` (or router file)

Remove the `/admin/roles` route pointing to `ManageRoles.tsx`.

---

## Shared Changes Required

### Step S1 — Update `shared/src/types.ts`

Remove:
- `PermissionModule` type (or move to frontend/backend individually if still used for labeling)
- `PermissionLevel` type
- `UserPermissionDetail` interface
- `UserWithPermissions.permissions` field (keep `UserWithPermissions` but strip the `permissions` array)

### Step S2 — Update `shared/src/api-types.ts`

Remove:
- `UpdateUserPermissionsRequest` interface
- References to `UserWithPermissions.permissions` in `LoginResponse` / `GetUsersResponse`

---

## Migration Steps (Ordered)

Follow this order to avoid broken builds at each intermediate step.

### Phase 1 — Backend Infrastructure (No Frontend Impact)

1. **[B1]** Create `backend/src/utils/groupAuth.ts` with `derivePermLevelFromGroups()` and `requireModule()`.
2. **[B2]** Keep `permissions.ts` but add a deprecation comment — do not delete yet.
3. **[B19-roles]** Update `server.ts` to stop mounting `/api/roles`. This makes the routes return 404 immediately (safe — frontend still compiles).
4. **[B16]** Remove `diagnose-permissions` and `resync-permissions` from `admin.routes.ts`.
5. **[B5]** Remove `syncPermissionsForUser` call from `auth.controller.ts`. Now logins succeed without DB writes.
6. **[B6]** Delete `syncPermissionsForUser` from `userSync.service.ts`.

### Phase 2 — Route Migration

7. **[B3]** Update all 6 route files: replace `checkPermission` → `requireModule`.
8. **Build and test** — all protected routes should behave identically.
9. **[B2]** Delete `backend/src/middleware/permissions.ts`.

### Phase 3 — Backend Cleanup

10. **[B7]** Remove `updatePermissions`, `getAvailablePermissions`, `getEffectivePermissions` from `user.service.ts`.
11. **[B13]** Remove three handlers from `user.controller.ts`.
12. **[B14]** Remove three routes from `user.routes.ts`.
13. **[B8, B11, B12]** Delete `roles.service.ts`, `roles.controller.ts`.
14. **[B15, B17, B18]** Delete `roles.routes.ts`, `roles.validators.ts`; update `user.validators.ts`.
15. **[B9-email]** Replace `getEmailsByRequisitionLevel` in `email.service.ts`.
16. **[B20]** Update `seed.ts` to remove Permission/RoleProfile seeding.

### Phase 4 — Prisma Migration

17. **[DB]** Remove the 4 models from `schema.prisma`.
18. Run `npx prisma migrate dev --name remove_legacy_permissions`.
19. Run `npx prisma generate` to regenerate the Prisma client.
20. Fix any remaining TypeScript errors from removed Prisma model references.

### Phase 5 — Frontend Migration

21. **[F1]** Create new group-based `useRequisitionsPermLevel.ts`.
22. **[F10, F11]** Update `PurchaseOrderDetail.tsx` and `PurchaseOrderList.tsx`  — the hook interface is unchanged so this may be a no-op import-wise.
23. **[F8, F6, F7, F4]** Delete `ManageRoles.tsx`, `rolesService.ts`, `roles.types.ts`, `useRoleMutations.ts`.
24. **[F13, F15]** Remove nav entry and route for `/admin/roles`.
25. **[F9]** Remove permission modal from `Users.tsx`.
26. **[F2, F3, F5]** Remove permission hooks/methods from `useUsers.ts`, `useUserMutations.ts`, `userService.ts`.
27. **[F12]** Update `AdminSettings.tsx`.
28. **[F14]** Update `queryKeys.ts`.
29. **Build frontend** — fix any remaining TypeScript errors.

### Phase 6 — Shared and Final Cleanup

30. **[S1, S2]** Update `shared/src/types.ts` and `shared/src/api-types.ts`.
31. Run full TypeScript build (`npm run build`) on all three packages — target zero errors.
32. Remove seed data from production DB (or let next deployment seed a clean state).

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Users lose access mid-migration** (if `checkPermission` is removed before `requireModule` is in place) | HIGH | Follow Phase 1→2 order; test with a non-admin user after Phase 2 before proceeding |
| **Email notifications break** (Graph API unavailable at PO submission time) | MEDIUM | Submission is blocked with 503 if Graph API fails — PO stays in draft; user retries. Test notification flow end-to-end after B9 implementation. |
| **Manual permission overrides lost** (admins gave some users higher levels via UI) | MEDIUM | Export `user_permissions` table before drop; re-map to Entra groups or document exceptions |
| **`permLevel` on `req.user` is `undefined`** (if middleware chain is updated inconsistently) | MEDIUM | Audit all `req.user!.permLevel ?? 1` call sites; the `?? 1` fallback makes these safe |
| **Prisma client references removed models** (TypeScript fails) | MEDIUM | Regenerate Prisma client immediately after schema change; build before committing |
| **Frontend `useRequisitionsPermLevel` hook returns 0** during loading (UX flash) | LOW | New hook resolves synchronously from auth store — no loading state needed |
| **Vite env vars not exposed for group IDs** | MEDIUM | Prefix Entra group vars as `VITE_ENTRA_*` in `.env` for frontend access |
| **`ENTRA_ALL_STAFF_GROUP_ID` group grants level 2 REQUISITIONS** — all staff can create POs. If the group check becomes the sole gate, PO creation remains open to all staff. | LOW — by design | Document this explicitly; it matches current behavior |
| **Director of Schools group grants `ADMIN` role** — they bypass all `checkPermission` today | LOW | Ensure `requireModule` respects the ADMIN bypass the same way `checkPermission` does |

---

## Testing Checklist

After completing all migration steps, verify the following:

### Auth & Access Control
- [ ] Non-staff user (no configured group) sees 403 on all protected routes
- [ ] `ENTRA_ALL_STAFF_GROUP_ID` member can: view inventory (TECH 1), create POs (REQ 2), view own POs
- [ ] `ENTRA_PRINCIPALS_GROUP_ID` member can: edit inventory (TECH 2), approve submitted POs (REQ 3)
- [ ] `ENTRA_TECH_ASSISTANTS_GROUP_ID` member can: full TECH 3 operations (bulk import, hard delete)
- [ ] `ENTRA_FINANCE_DIRECTOR_GROUP_ID` member can approve at `supervisor_approved` stage (REQ 5)
- [ ] `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` member can approve at `finance_director_approved` stage (REQ 6)
- [ ] `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` member can issue POs after DoS approval (REQ 4)
- [ ] `ENTRA_ADMIN_GROUP_ID` member has full access everywhere (ADMIN bypass)
- [ ] A user NOT in any configured group gets 403 on all non-public routes

### PO Workflow
- [ ] Submit draft → `submitted` transitions correctly; supervisor email sent
- [ ] Supervisor can approve; Finance Director email notified
- [ ] Finance Director can approve (`supervisor_approved` → `finance_director_approved`); DoS email notified
- [ ] DoS can approve (`finance_director_approved` → `dos_approved`); PO Entry notified
- [ ] PO Entry can issue final PO (`dos_approved` → `po_issued`)
- [ ] Rejection works at each stage; requestor email notified

### User Management (Admin)
- [ ] Admin can see all users (no permission columns displayed)
- [ ] Admin cannot see "Edit Permissions" button on user rows
- [ ] Admin cannot access `/admin/roles` (page removed)
- [ ] `GET /api/users/permissions` returns 404
- [ ] `PUT /api/users/:id/permissions` returns 404

### Email Notifications
- [ ] Finance Director approval request email reaches the correct group members
- [ ] Director of Schools approval request email reaches the correct group members
- [ ] PO Entry notification email reaches the correct group members

### Build Health
- [ ] `npm run build` in `backend/` — 0 TypeScript errors
- [ ] `npm run build` in `frontend/` — 0 TypeScript errors
- [ ] `npx prisma validate` — schema valid
- [ ] `npx prisma generate` — Prisma client generated without warnings

---

## Appendix: Group → PermLevel Mapping Reference

This table is the ground truth for the `derivePermLevelFromGroups()` function.

| Env Var | TECHNOLOGY Level | MAINTENANCE Level | REQUISITIONS Level | Role |
|---------|:----------------:|:-----------------:|:-----------------:|------|
| `ENTRA_ADMIN_GROUP_ID` | 3 | 3 | 6 | ADMIN |
| `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | 3 | — | 3 | ADMIN |
| `ENTRA_TECH_ASSISTANTS_GROUP_ID` | 3 | 2 | 3 | USER |
| `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | 2 | 3 | 6 | ADMIN |
| `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | 2 | 2 | 5 | USER |
| `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` | — | — | 4 | USER |
| `ENTRA_PRINCIPALS_GROUP_ID` | 2 | 2 | 3 | USER |
| `ENTRA_VICE_PRINCIPALS_GROUP_ID` | 2 | 2 | 3 | USER |
| `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` | — | 3 | 3 | USER |
| `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` | 2 | 3 | 3 | USER |
| `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` | — | 2 | 3 | USER |
| `ENTRA_SPED_DIRECTOR_GROUP_ID` | — | — | 3 | USER |
| `ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID` | — | — | 3 | USER |
| `ENTRA_NURSE_DIRECTOR_GROUP_ID` | — | — | 3 | USER |
| `ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID` | — | — | 3 | USER |
| `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` | — | — | 3 | USER |
| `ENTRA_ALL_STAFF_GROUP_ID` | 1 | 1 | 2 | USER |
| `ENTRA_ALL_STUDENTS_GROUP_ID` | 1 | — | — | USER |

**For `derivePermLevelFromGroups(groups, module)`:** iterate all configured group IDs, find those present in the user's `groups[]`, return the maximum level across all matches for the requested module.

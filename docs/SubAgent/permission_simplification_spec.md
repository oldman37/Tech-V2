# Permission System Simplification — 4 Roles → 2 Roles

**System:** Tech-V2 (Tech Department Management System)  
**Created:** March 13, 2026  
**Status:** SPECIFICATION — Not yet implemented  
**Decision:** Option A — Collapse to 2 roles (`ADMIN`, `USER`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State — Complete Role Usage Audit](#2-current-state--complete-role-usage-audit)
3. [Proposed Changes — File-by-File](#3-proposed-changes--file-by-file)
4. [Database Migration](#4-database-migration)
5. [Impact on Help Desk Spec](#5-impact-on-help-desk-spec)
6. [Security Considerations](#6-security-considerations)
7. [Implementation Order](#7-implementation-order)
8. [Verification Checklist](#8-verification-checklist)

---

## 1. Executive Summary

### What

Simplify the application role system from 4 roles (`ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER`) down to 2 roles (`ADMIN`, `USER`).

### Why

- `MANAGER` and `TECHNICIAN` serve no functional purpose beyond organizational labelling — all real access control is driven by `UserPermission` records (module + level pairs)
- `ROLE_DEFAULT_PERMISSIONS` creates a confusing fallback that can mask missing `UserPermission` records
- `userSync` already writes correct `UserPermission` records from Entra groups at login, so removing role-based defaults loses nothing
- Fewer moving parts = fewer bugs, simpler admin UI, clearer mental model

### Design Principles

| Principle | Detail |
|-----------|--------|
| `ADMIN` unchanged | Bypasses all `checkPermission` checks, gets `permLevel = 6`, gates admin UI routes |
| `USER` replaces three roles | `MANAGER`, `TECHNICIAN`, and `VIEWER` all become `USER` |
| `UserPermission` is truth | A user's access is **entirely** determined by their `UserPermission` records in the DB |
| No fallback permissions | `ROLE_DEFAULT_PERMISSIONS` is removed — if no `UserPermission` record exists, access is denied |
| `requireAdmin` unchanged | Backend `requireAdmin` middleware and frontend `ProtectedRoute requireAdmin` prop work exactly as before |
| No data loss | Existing `UserPermission` records are preserved — they're the real access control |

---

## 2. Current State — Complete Role Usage Audit

### 2.1 Backend Files

#### `backend/src/middleware/permissions.ts` — checkPermission + ROLE_DEFAULT_PERMISSIONS

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 32–46 | `ROLE_DEFAULT_PERMISSIONS` constant | Defines fallback permissions for `MANAGER`, `TECHNICIAN`, `VIEWER` |
| 69 | `const userRole = req.user.roles?.[0] \|\| 'VIEWER';` | Defaults to `VIEWER` when no role present |
| 72 | `if (userRole === 'ADMIN')` | ADMIN bypass check |
| 93–98 | Role default fallback block | `ROLE_DEFAULT_PERMISSIONS[userRole]?.[module]` — used when no `UserPermission` record matches |

**Key behavior:** When `checkPermission` finds no matching `UserPermission` for a non-ADMIN user, it falls back to `ROLE_DEFAULT_PERMISSIONS[role][module]`. This is the entire reason `MANAGER`/`TECHNICIAN`/`VIEWER` differentiation exists in the permission middleware.

#### `backend/src/middleware/auth.ts` — requireAdmin

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 110 | `const hasAdminRole = req.user.roles.includes('ADMIN');` | Checks for `ADMIN` role only |

**No change needed.** Only checks for `ADMIN`.

#### `backend/src/services/userSync.service.ts` — Entra group → role mapping

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 7 | `type UserRole = 'ADMIN' \| 'MANAGER' \| 'TECHNICIAN' \| 'VIEWER';` | Type definition with all 4 roles |
| 39 | `role: 'ADMIN'` | Admin group mapping |
| 49 | `role: 'ADMIN'` | Director of Schools mapping |
| 59 | `role: 'MANAGER'` | Director of Finance mapping |
| 69 | `role: 'TECHNICIAN'` | Tech Admin mapping |
| 79 | `role: 'MANAGER'` | Maintenance Admin mapping |
| 89 | `role: 'MANAGER'` | Principals mapping |
| 99 | `role: 'MANAGER'` | Vice Principals mapping |
| 109 | `role: 'MANAGER'` | SPED Director mapping |
| 119 | `role: 'MANAGER'` | Maintenance Director mapping |
| 129 | `role: 'MANAGER'` | Transportation Director mapping |
| 139 | `role: 'ADMIN'` | Technology Director mapping |
| 149 | `role: 'MANAGER'` | Afterschool Director mapping |
| 159 | `role: 'MANAGER'` | Nurse Director mapping |
| 169 | `role: 'MANAGER'` | Supervisors of Instruction mapping |
| 190 | `role: 'VIEWER'` | All Staff mapping |
| 202 | `role: 'VIEWER'` | All Students mapping |
| 256 | `role: 'VIEWER'` | Default fallback when no group matches |

**Key behavior:** Every Entra group mapping assigns one of the 4 roles plus a set of `UserPermission` records. The permissions are the important part — the role label is secondary.

#### `backend/src/services/user.service.ts` — updateRole + getSupervisorUsers

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 212 | `const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];` | Validates role on admin role-change |
| 401 | `{ role: { in: ['ADMIN', 'MANAGER'] } }` | `getSupervisorUsers()` filters potential supervisors by role |

**Key behavior:** `updateRole()` enforces the valid roles list. `getSupervisorUsers()` assumes managers could be supervisors — this needs to change to `['ADMIN', 'USER']` or use a permission-based filter instead.

#### `backend/src/controllers/auth.controller.ts` — login callback

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| ~130 | `const roleMapping = userSyncService.getRoleFromGroups(groupIds);` | Gets role from Entra groups |
| ~148 | `role: determinedRole` (in create branch of upsert) | Sets role on first-time user creation |
| ~157 | `const roles: string[] = [user.role];` | Uses DB-persisted role for JWT |

**Key behavior:** Login uses `getRoleFromGroups()` to determine role. On first login (create), sets the Entra-derived role. On subsequent logins (update), **preserves** the DB role (admin-set). The JWT carries `roles: [user.role]`.

#### `backend/src/validators/user.validators.ts` — Zod schema

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 13 | `const UserRole = z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER']);` | Zod enum validation for role updates |

#### `backend/prisma/schema.prisma` — User model

| Line | Code | Role Reference |
|------|------|----------------|
| 470 | `role String @default("VIEWER")` | Default role for new users |

#### `backend/prisma/seed.ts` — seed data

| Lines | Code | Role Reference |
|-------|------|----------------|
| — | No direct role references | Seed creates permissions and role profiles, not roles on users |

**Note:** The seed creates named "role profiles" (View Only, General Staff, Principal, Tech Admin, Director / Full Access) which are permission templates — not application roles. These are unaffected by this change.

#### Route files using `requireAdmin`

All of these import and use `requireAdmin` from `auth.ts`, which only checks for `ADMIN`. **No changes needed.**

| File | Usage |
|------|-------|
| `backend/src/routes/user.routes.ts` | `router.use(requireAdmin)` after `/search` route |
| `backend/src/routes/settings.routes.ts` | `router.use(requireAdmin)` |
| `backend/src/routes/roles.routes.ts` | `router.use(requireAdmin)` |
| `backend/src/routes/admin.routes.ts` | `router.use(requireAdmin)` |
| `backend/src/routes/auth.routes.ts` | `requireAdmin` on `/sync-users` |
| `backend/src/routes/fundingSource.routes.ts` | `requireAdmin` on hard-delete only |

---

### 2.2 Frontend Files

#### `frontend/src/components/ProtectedRoute.tsx`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 14 | `const isAdmin = user?.roles?.includes('ADMIN');` | Checks for `ADMIN` only |

**No change needed.**

#### `frontend/src/components/layout/AppLayout.tsx`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 76 | `const isAdmin = user?.roles?.includes('ADMIN');` | Checks for `ADMIN` only |
| Various | `adminOnly: true` on nav items | Uses `isAdmin` boolean |

**No change needed.**

#### `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 29 | `const isAdmin = !!(user?.roles?.includes('ADMIN'));` | Checks for `ADMIN` only |

**No change needed.**

#### `frontend/src/pages/Dashboard.tsx`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 79 | `{user?.roles?.includes('ADMIN') && (` | Checks for `ADMIN` to show admin cards |

**No change needed.**

#### `frontend/src/pages/Users.tsx`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 50 | `if (!currentUser?.roles?.includes('ADMIN'))` | Admin check for redirect |
| 358 | `<option value="ADMIN">Admin</option>` | Role dropdown |
| 359 | `<option value="MANAGER">Manager</option>` | Role dropdown — **REMOVE** |
| 360 | `<option value="TECHNICIAN">Technician</option>` | Role dropdown — **REMOVE** |
| 361 | `<option value="VIEWER">Viewer</option>` | Role dropdown — **RENAME to USER** |

#### `frontend/src/store/authStore.ts`

| Line(s) | Code | Role Reference |
|---------|------|----------------|
| 11 | `roles?: string[];` | Stores role array — generic, no specific role values |

**No change needed.**

#### `frontend/src/services/authService.ts`

No role-specific references. **No change needed.**

#### `frontend/src/types/roles.types.ts`

No role-specific references (only permission modules/levels). **No change needed.**

---

### 2.3 Shared Types

#### `shared/src/types.ts`

| Line | Code | Role Reference |
|------|------|----------------|
| 10 | `export type UserRole = 'ADMIN' \| 'MANAGER' \| 'TECHNICIAN' \| 'VIEWER';` | Shared type definition |

---

### 2.4 Documentation Files

#### `docs/PERMISSIONS_AND_ROLES.md`

References all 4 roles extensively in tables, code examples, and architecture diagrams. Must be updated.

#### `docs/permission.md`

References all 4 roles in catalogue, flow diagrams, and matrices. Must be updated.

#### `docs/SubAgent/helpdesk_system_spec.md`

| Line | Code | Role Reference |
|------|------|----------------|
| 497 | `const userRole = req.user!.roles?.[0] \|\| 'VIEWER';` | Code example defaults to `VIEWER` |

The helpdesk spec code example in `checkTicketPermission` defaults the role to `'VIEWER'`. This default string changes to `'USER'`. The ADMIN bypass logic is unaffected.

---

## 3. Proposed Changes — File-by-File

### 3.1 `backend/src/middleware/permissions.ts`

**Change 1: Remove `ROLE_DEFAULT_PERMISSIONS` entirely (lines 32–46)**

Delete:
```typescript
export const ROLE_DEFAULT_PERMISSIONS: Partial<Record<string, Partial<Record<PermissionModule, number>>>> = {
  MANAGER: {
    TECHNOLOGY: 2,
    MAINTENANCE: 2,
    REQUISITIONS: 3,
  },
  TECHNICIAN: {
    TECHNOLOGY: 3,
    MAINTENANCE: 2,
    REQUISITIONS: 3,
  },
  VIEWER: {
    TECHNOLOGY: 1,
    MAINTENANCE: 1,
    REQUISITIONS: 2,
  },
};
```

**Change 2: Update default role fallback (line 69)**

```typescript
// Before:
const userRole = req.user.roles?.[0] || 'VIEWER';

// After:
const userRole = req.user.roles?.[0] || 'USER';
```

**Change 3: Remove role-default fallback block (lines 93–98)**

Delete:
```typescript
const roleDefault = ROLE_DEFAULT_PERMISSIONS[userRole]?.[module];
if (roleDefault !== undefined && roleDefault >= requiredLevel) {
  req.user!.permLevel = roleDefault;
  logger.debug(`Role default fallback: ${userRole} accessing ${module} at level ${roleDefault} (required: ${requiredLevel})`);
  return next();
}
```

After removing, the flow becomes: if no `UserPermission` record matches → immediate 403. This is the **deny-by-default** behavior that was always intended.

---

### 3.2 `backend/src/middleware/auth.ts`

**No changes required.** `requireAdmin` only checks for `'ADMIN'`.

---

### 3.3 `backend/src/services/userSync.service.ts`

**Change 1: Update type definition (line 7)**

```typescript
// Before:
type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER';

// After:
type UserRole = 'ADMIN' | 'USER';
```

**Change 2: Update all non-ADMIN group mappings to use `'USER'` role**

Every `role:` assignment in the constructor that currently uses `'MANAGER'`, `'TECHNICIAN'`, or `'VIEWER'` changes to `'USER'`:

| Line | Current | New |
|------|---------|-----|
| 59 | `role: 'MANAGER'` (Dir. of Finance) | `role: 'USER'` |
| 69 | `role: 'TECHNICIAN'` (Tech Admin) | `role: 'USER'` |
| 79 | `role: 'MANAGER'` (Maintenance Admin) | `role: 'USER'` |
| 89 | `role: 'MANAGER'` (Principals) | `role: 'USER'` |
| 99 | `role: 'MANAGER'` (Vice Principals) | `role: 'USER'` |
| 109 | `role: 'MANAGER'` (SPED Director) | `role: 'USER'` |
| 119 | `role: 'MANAGER'` (Maintenance Director) | `role: 'USER'` |
| 129 | `role: 'MANAGER'` (Transportation Director) | `role: 'USER'` |
| 149 | `role: 'MANAGER'` (Afterschool Director) | `role: 'USER'` |
| 159 | `role: 'MANAGER'` (Nurse Director) | `role: 'USER'` |
| 169 | `role: 'MANAGER'` (Supervisors of Instruction) | `role: 'USER'` |
| 190 | `role: 'VIEWER'` (All Staff) | `role: 'USER'` |
| 202 | `role: 'VIEWER'` (All Students) | `role: 'USER'` |

**ADMIN** mappings (lines 39, 49, 139) stay as `role: 'ADMIN'`.

**Change 3: Update default fallback (line 256)**

```typescript
// Before:
return {
  role: 'VIEWER',
  permissions: [],
};

// After:
return {
  role: 'USER',
  permissions: [],
};
```

**Important:** The `permissions:` arrays for each group mapping are **unchanged**. The `UserPermission` records these produce are the real access control and must not be modified.

---

### 3.4 `backend/src/services/user.service.ts`

**Change 1: Update `updateRole()` valid roles (line 212)**

```typescript
// Before:
const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];

// After:
const validRoles = ['ADMIN', 'USER'];
```

**Change 2: Update `getSupervisorUsers()` role filter (line 401)**

```typescript
// Before:
{ role: { in: ['ADMIN', 'MANAGER'] } },

// After:
{ role: { in: ['ADMIN', 'USER'] } },
```

**Rationale:** After migration, all former MANAGERs are USERs. The filter should still include all non-student users who could be supervisors. Since actual supervisor capability is determined by `UserPermission` records (REQUISITIONS level 3+) and the `LocationSupervisor` table, this broad filter is acceptable and mirrors current behavior.

---

### 3.5 `backend/src/controllers/auth.controller.ts`

**No changes required.** The controller:
- Calls `getRoleFromGroups()` (which will return `'ADMIN'` or `'USER'`) 
- Stores the role in the DB on first login
- Reads `user.role` from DB for JWT on subsequent logins
- All of this works with the new 2-role system

---

### 3.6 `backend/src/validators/user.validators.ts`

**Change 1: Update Zod enum (line 13)**

```typescript
// Before:
const UserRole = z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER']);

// After:
const UserRole = z.enum(['ADMIN', 'USER']);
```

---

### 3.7 `backend/prisma/schema.prisma`

**Change 1: Update User model default role (line 470)**

```prisma
// Before:
role  String  @default("VIEWER")

// After:
role  String  @default("USER")
```

---

### 3.8 `backend/prisma/seed.ts`

**No changes required.** The seed file creates:
- Permission definitions (module/level pairs) — unaffected
- System settings — unaffected  
- Role profiles (named permission templates) — unaffected; these are not application roles

---

### 3.9 `frontend/src/pages/Users.tsx`

**Change 1: Update role dropdown (lines 358–361)**

```tsx
// Before:
<option value="ADMIN">Admin</option>
<option value="MANAGER">Manager</option>
<option value="TECHNICIAN">Technician</option>
<option value="VIEWER">Viewer</option>

// After:
<option value="ADMIN">Admin</option>
<option value="USER">User</option>
```

---

### 3.10 `shared/src/types.ts`

**Change 1: Update UserRole type (line 10)**

```typescript
// Before:
export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER';

// After:
export type UserRole = 'ADMIN' | 'USER';
```

---

### 3.11 Route Files (No Changes)

These files use `requireAdmin` which only checks `'ADMIN'`. No changes needed:

- `backend/src/routes/user.routes.ts`
- `backend/src/routes/settings.routes.ts`
- `backend/src/routes/roles.routes.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/routes/auth.routes.ts`
- `backend/src/routes/fundingSource.routes.ts`

---

### 3.12 Frontend Files (No Changes)

These files only check for `'ADMIN'` role — no changes needed:

- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/store/authStore.ts`
- `frontend/src/services/authService.ts`
- `frontend/src/types/roles.types.ts`

---

## 4. Database Migration

### 4.1 Prisma Migration SQL

Create a new Prisma migration with the following SQL:

```sql
-- Migration: simplify_roles_to_admin_user
-- Collapse MANAGER, TECHNICIAN, VIEWER → USER

-- Step 1: Update all non-ADMIN users to USER
UPDATE users SET role = 'USER' WHERE role IN ('MANAGER', 'TECHNICIAN', 'VIEWER');

-- Step 2: Update default value for new users
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'USER';
```

### 4.2 Migration Steps

1. Run `npx prisma migrate dev --name simplify_roles_to_admin_user`
2. This will detect the schema change (`@default("VIEWER")` → `@default("USER")`)
3. Edit the generated migration SQL to add the `UPDATE` statement **before** the `ALTER` statement
4. Apply the migration

### 4.3 Data Verification Query

After migration, verify:

```sql
-- Should return only 'ADMIN' and 'USER'
SELECT role, COUNT(*) FROM users GROUP BY role;

-- Should return 0
SELECT COUNT(*) FROM users WHERE role NOT IN ('ADMIN', 'USER');
```

### 4.4 Rollback Strategy

If rollback is needed, the original role value is lost (we don't know who was MANAGER vs TECHNICIAN vs VIEWER). However:
- The `UserPermission` records are unchanged and contain the real access data
- Entra group mappings could re-derive roles on next sync if the old code were restored

Mitigation: **Before running the migration, export the current role assignments:**

```sql
-- Run BEFORE migration
COPY (SELECT id, email, role FROM users ORDER BY role, email) TO '/tmp/user_roles_backup.csv' CSV HEADER;
```

---

## 5. Impact on Help Desk Spec

### `docs/SubAgent/helpdesk_system_spec.md`

**Change 1: Line 497 — default role in code example**

```typescript
// Before:
const userRole = req.user!.roles?.[0] || 'VIEWER';

// After:
const userRole = req.user!.roles?.[0] || 'USER';
```

The rest of the helpdesk spec references "technician" in its natural-language sense (a person doing tech work), not as the `TECHNICIAN` role value. These do not need changes:
- Line 52: "Username of technician adding the entry" — describes legacy PHP field
- Line 79: "Technician adds a work log entry" — describes workflow, not role
- Line 82: "tickets are visible to all technicians" — describes legacy behavior
- Line 815: "Technician starts work" — describes workflow diagram

---

## 6. Security Considerations

### 6.1 ADMIN Bypass Preserved

The `ADMIN` check in `checkPermission` (line 72) is unchanged:
```typescript
if (userRole === 'ADMIN') {
  req.user!.permLevel = 6;
  return next();
}
```

The `requireAdmin` middleware is unchanged — still checks `roles.includes('ADMIN')`.

### 6.2 Deny-by-Default Strengthened

Removing `ROLE_DEFAULT_PERMISSIONS` **strengthens** security:
- Previously: a `MANAGER` with no `UserPermission` records could still access TECHNOLOGY at level 2 via role defaults
- After: a `USER` with no `UserPermission` records gets 403 on every `checkPermission` call
- This is the correct behavior — `UserPermission` records are the authoritative source

### 6.3 No Privilege Escalation Risk

- Users cannot gain more access: `USER` has **no** implicit permissions
- Users cannot lose access: their `UserPermission` records are preserved
- ADMIN users are unaffected
- The migration only changes the `role` column value, not `UserPermission` records

### 6.4 Edge Case: Users Created Between Deploy and Migration

If the application code deploys before the migration runs:
- New users will get `role: 'USER'` from `userSync`
- The DB default is still `'VIEWER'` until migration runs
- `checkPermission` will try to look up `ROLE_DEFAULT_PERMISSIONS['USER']` — which doesn't exist — and fall through to 403
- This is safe (deny-by-default) but the migration should be run immediately after deploy

**Recommendation:** Run the Prisma migration before deploying the code, OR deploy code and migration atomically. Since we remove the fallback entirely, the order doesn't matter for security — only for the default column value.

---

## 7. Implementation Order

### Phase 1: Backend Changes (atomic commit)

1. `backend/prisma/schema.prisma` — change default to `'USER'`
2. Create Prisma migration with `UPDATE` + `ALTER`
3. `backend/src/middleware/permissions.ts` — remove `ROLE_DEFAULT_PERMISSIONS`, remove fallback block, update default role string
4. `backend/src/services/userSync.service.ts` — update type, all role mappings, default fallback
5. `backend/src/services/user.service.ts` — update `validRoles` and `getSupervisorUsers` filter
6. `backend/src/validators/user.validators.ts` — update Zod enum

### Phase 2: Frontend Changes (atomic commit)

7. `frontend/src/pages/Users.tsx` — update role dropdown

### Phase 3: Shared Types (atomic commit)

8. `shared/src/types.ts` — update `UserRole` type

### Phase 4: Documentation Updates

9. `docs/SubAgent/helpdesk_system_spec.md` — update default role string
10. `docs/PERMISSIONS_AND_ROLES.md` — comprehensive rewrite for 2-role system
11. `docs/permission.md` — comprehensive rewrite for 2-role system

---

## 8. Verification Checklist

### Pre-Migration

- [ ] Export current user roles: `SELECT id, email, role FROM users`
- [ ] Verify all users have correct `UserPermission` records (run a sync if needed)

### Post-Migration

- [ ] `SELECT role, COUNT(*) FROM users GROUP BY role` — only `ADMIN` and `USER`
- [ ] ADMIN user can log in and access all admin routes
- [ ] Non-admin user can log in and sees correct permissions based on `UserPermission` records
- [ ] Non-admin user with **no** `UserPermission` records gets 403 on all `checkPermission` routes
- [ ] Role dropdown in Users page shows only "Admin" and "User"
- [ ] Admin can change a user's role between Admin and User
- [ ] New user created via Entra sync gets `USER` role (unless in ADMIN group)
- [ ] `requireAdmin` still blocks non-ADMIN users from admin routes
- [ ] Purchase order workflow still works (REQUISITIONS levels 1–6 unaffected)
- [ ] Inventory access still works (TECHNOLOGY levels 1–3 unaffected)

### Files Modified (Summary)

| # | File | Change Type |
|---|------|-------------|
| 1 | `backend/prisma/schema.prisma` | Default value `VIEWER` → `USER` |
| 2 | `backend/prisma/migrations/YYYYMMDD_simplify_roles/migration.sql` | New migration |
| 3 | `backend/src/middleware/permissions.ts` | Remove `ROLE_DEFAULT_PERMISSIONS`, remove fallback, update default string |
| 4 | `backend/src/services/userSync.service.ts` | Update type, all `role:` values, default fallback |
| 5 | `backend/src/services/user.service.ts` | Update `validRoles`, `getSupervisorUsers` filter |
| 6 | `backend/src/validators/user.validators.ts` | Update Zod enum |
| 7 | `frontend/src/pages/Users.tsx` | Update role dropdown options |
| 8 | `shared/src/types.ts` | Update `UserRole` type |
| 9 | `docs/SubAgent/helpdesk_system_spec.md` | Update default role string |
| 10 | `docs/PERMISSIONS_AND_ROLES.md` | Full rewrite for 2-role system |
| 11 | `docs/permission.md` | Full rewrite for 2-role system |

### Files NOT Modified (Confirmed Safe)

| File | Reason |
|------|--------|
| `backend/src/middleware/auth.ts` | Only checks `'ADMIN'` |
| `backend/src/controllers/auth.controller.ts` | Uses `getRoleFromGroups()` result — works with new values |
| `backend/src/routes/*.ts` (all 6 route files) | Only use `requireAdmin` |
| `backend/prisma/seed.ts` | No role values; only permission definitions and profiles |
| `frontend/src/components/ProtectedRoute.tsx` | Only checks `'ADMIN'` |
| `frontend/src/components/layout/AppLayout.tsx` | Only checks `'ADMIN'` |
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | Only checks `'ADMIN'` |
| `frontend/src/pages/Dashboard.tsx` | Only checks `'ADMIN'` |
| `frontend/src/store/authStore.ts` | Generic `roles?: string[]` |
| `frontend/src/services/authService.ts` | No role values |
| `frontend/src/types/roles.types.ts` | Permission modules only |

# Fix: Role Change Not Persisting After Save

> **Document Type:** Research & Specification (Phase 1 SubAgent Output)
> **Feature:** Role Change Bug — Manually-set user role is immediately overwritten
> **Author:** Research SubAgent
> **Date:** 2026-03-13
> **Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis — What the Code Does Now](#2-current-state-analysis--what-the-code-does-now)
3. [Root Cause Identification](#3-root-cause-identification)
4. [All Relevant File Paths](#4-all-relevant-file-paths)
5. [Proposed Fix — Exact Code Changes](#5-proposed-fix--exact-code-changes)
6. [Security Considerations](#6-security-considerations)
7. [Risk and Mitigation](#7-risk-and-mitigation)
8. [Testing Plan](#8-testing-plan)

---

## 1. Executive Summary

**The role change UI saves correctly to the database, but the role is silently overwritten the next time the user logs in (or an admin triggers a sync).**

The `PUT /users/:id/role` API endpoint works correctly. The bug lives entirely in the **login OAuth callback** (`auth.controller.ts`) which unconditionally overwrites the `users.role` column with a value re-derived from the user's Microsoft Entra ID group membership every time they authenticate.

There is a second overwrite path via the **manual "Sync All Users" admin button** which calls `UserSyncService.syncUser()` — this also unconditionally replaces the role.

No frontend bug, no TanStack Query cache bug, no Zod validation bug is involved. The role change **is saved** — it simply gets wiped on the next login or sync.

---

## 2. Current State Analysis — What the Code Does Now

### 2.1 Role Change Request (Frontend → Backend): WORKS CORRECTLY

**Trigger:** Admin opens `Users.tsx`, changes a user's role dropdown.

```
frontend/src/pages/Users.tsx
  └─ handleRoleChange(userId, newRole)
       └─ updateRoleMutation.mutate({ userId, role: newRole })
            └─ frontend/src/hooks/mutations/useUserMutations.ts → useUpdateUserRole()
                 └─ userService.updateUserRole(userId, role)
                      └─ frontend/src/services/userService.ts
                           └─ api.put(`/users/${id}/role`, { role })
```

**Backend:**
```
backend/src/routes/user.routes.ts
  └─ PUT /:id/role
       → validateRequest(UpdateUserRoleSchema, 'body')   [z.enum(['ADMIN','MANAGER','TECHNICIAN','VIEWER'])]
       → updateUserRole controller
            └─ backend/src/controllers/user.controller.ts → updateUserRole()
                 └─ userService.updateRole(userId, role)
                      └─ backend/src/services/user.service.ts → updateRole()
                           └─ prisma.user.update({ where: {id: userId}, data: { role } })
                                ✅ DB UPDATED — role is correctly saved
```

**TanStack Query cache invalidation (after success):**
```typescript
// backend/src/hooks/mutations/useUserMutations.ts
onSuccess: (_, { userId }) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });  // ✅
  queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) }); // ✅
}
```

Cache is correctly invalidated — UX shows the new role immediately.

### 2.2 Login OAuth Callback: OVERWRITES ROLE ❌

**File:** `backend/src/controllers/auth.controller.ts`

Every time any user authenticates via Microsoft Entra ID, the OAuth callback:

1. Fetches the user's current Entra group memberships from Microsoft Graph API
2. Calls `UserSyncService.getRoleFromGroups(groupIds)` to derive a role from Entra groups
3. Does `prisma.user.upsert()` with `role: determinedRole` in the **`update`** clause

```typescript
// auth.controller.ts — the destructive update (happens on EVERY login)
const user = await prisma.user.upsert({
  where: { entraId: userInfo.id },
  update: {
    email: ...,
    displayName: ...,
    firstName: ...,
    lastName: ...,
    jobTitle: ...,
    department: ...,
    role: determinedRole,  // ❌ OVERWRITES admin-set role on every login
    isActive: true,
    lastLogin: new Date(),
  },
  create: {
    entraId: ...,
    role: determinedRole,  // ✅ OK on first creation
    ...
  },
});
```

**Result:** Any manually-set role change is destroyed the next time the affected user signs in.

### 2.3 Manual Sync ("Sync All Users"): ALSO OVERWRITES ROLE ❌

**File:** `backend/src/services/userSync.service.ts` → `syncUser()` method

The admin "Sync All Users" / "Sync Staff Only" buttons in `Users.tsx` call `UserSyncService.syncUser()` for every user. This method:

1. Fetches Entra group memberships via Microsoft Graph
2. Derives role via `getRoleFromGroups(groupIds)` 
3. Does `prisma.user.upsert({ update: { role, isActive, lastSync, ... } })`

```typescript
// userSync.service.ts — syncUser() upsert
const user = await this.prisma.user.upsert({
  where: { entraId },
  update: {
    ...profileFields,
    role,         // ❌ OVERWRITES admin-set role during any sync
    isActive: graphUser.accountEnabled,
    lastSync: new Date(),
  },
  create: { ..., role },
});
// Then also replaces ALL permissions:
await this.syncUserPermissions(user.id, permissions);  // ❌ wipes manually-set permissions too
```

**Result:** Any time an admin runs "Sync All Users", manually-set roles AND permissions are wiped for all synced users.

### 2.4 Schema — No Override Flag Exists

The `User` model in `prisma/schema.prisma` has no way to flag a user as having a manually-overridden role:

```prisma
model User {
  id           String   @id @default(uuid())
  entraId      String   @unique
  email        String   @unique
  role         String   @default("VIEWER")  // ← No isRoleManual flag
  // ... no roleOverriddenAt, no isRoleManual, no roleSource
  @@map("users")
}
```

---

## 3. Root Cause Identification

### PRIMARY ROOT CAUSE
**`auth.controller.ts` overwrites `users.role` on every OAuth login.**

The `update` clause of the `prisma.user.upsert()` call in the OAuth callback unconditionally replaces the role with a value derived from the user's current Entra ID group membership. Since most users log in daily, any manually-set role change is reverted within hours (or minutes if the user immediately re-authenticates).

**Timeline of the failure:**
```
T+0:00  Admin sets user role to MANAGER via UI
        → PUT /api/users/:id/role  → prisma.user.update({ role: 'MANAGER' })
        → DB: role = 'MANAGER'  ✅

T+0:00  Admin sees role as MANAGER in table (optimistic update + cache invalidation)  ✅

T+0:05  User logs in via Microsoft Entra
        → OAuth callback runs
        → Entra groups → getRoleFromGroups() → determinedRole = 'VIEWER' (Entra says 'All Staff')
        → prisma.user.upsert({ update: { role: 'VIEWER' } })
        → DB: role = 'VIEWER'  ❌  (admin change destroyed)

T+0:05  Admin refreshes Users page — sees role back to VIEWER. Appears to have "not saved."
```

### SECONDARY ROOT CAUSE
**`userSync.service.ts → syncUser()` also overwrites `users.role` and all `UserPermission` records during explicit admin sync operations.**

Any time the "Sync All Users", "Sync Staff Only", or "Sync Students Only" button is pressed, all manually-set roles and permission overrides are destroyed for every synced user.

### CONFIRMED NOT THE BUG (Verified)

| Component | Status | Evidence |
|---|---|---|
| `PUT /users/:id/role` endpoint routing | ✅ Correct | `user.routes.ts` line ~63 |
| `UpdateUserRoleSchema` Zod validation | ✅ Correct | `z.enum(['ADMIN','MANAGER','TECHNICIAN','VIEWER'])` |
| `UserService.updateRole()` DB write | ✅ Correct | `prisma.user.update({ data: { role } })` |
| TanStack Query `lists()` invalidation | ✅ Correct | `queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })` |
| TanStack Query detail invalidation | ✅ Correct | `queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) })` |
| Optimistic update rollback on error | ✅ Correct | `context.previousUsers.forEach(...)` in `onError` |
| Frontend role dropdown values | ✅ Correct | Matches `z.enum` valid values |
| Permission `level` type (prior 400 bug) | ✅ **Already fixed** | `z.number().int()` in `user.validators.ts` |

---

## 4. All Relevant File Paths

### Backend
| File | Relevance |
|------|-----------|
| `backend/src/controllers/auth.controller.ts` | **PRIMARY FIX TARGET** — upsert with `role: determinedRole` in `update` clause overwrites role on every login |
| `backend/src/services/userSync.service.ts` | **SECONDARY FIX TARGET** — `syncUser()` always overwrites role and permissions during sync |
| `backend/src/controllers/user.controller.ts` | Role update controller — works correctly, no fix needed |
| `backend/src/services/user.service.ts` | `updateRole()` service method — works correctly, no fix needed |
| `backend/src/routes/user.routes.ts` | Route definitions — correct, no fix needed |
| `backend/src/validators/user.validators.ts` | `UpdateUserRoleSchema` — correct, no fix needed |
| `backend/prisma/schema.prisma` | User model — needs new `isRoleManual` field (Option B only) |
| `backend/prisma/migrations/` | New migration file needed (Option B only) |

### Frontend
| File | Relevance |
|------|-----------|
| `frontend/src/pages/Users.tsx` | Role change UI — works correctly, no fix needed. Minor UX issue: `disabled={updateRoleMutation.isPending}` disables ALL dropdowns during any role change |
| `frontend/src/services/userService.ts` | `updateUserRole()` API call — correct |
| `frontend/src/hooks/mutations/useUserMutations.ts` | `useUpdateUserRole()` mutation with cache invalidation — correct |
| `frontend/src/hooks/queries/useUsers.ts` | `usePaginatedUsers()` query — correct |
| `frontend/src/lib/queryKeys.ts` | Query key definitions — correct |

### Documentation
| File | Relevance |
|------|-----------|
| `docs/SubAgent/role_assignment_fix_report.md` | Prior role bug (type mismatch in auth response) — resolved Feb 2026 |
| `docs/SubAgent/permissions-400-debug.md` | Prior permission 400 bug (`level: z.string()` mismatch) — resolved Mar 2026 |
| `docs/PERMISSIONS_AND_ROLES.md` | Authoritative role/permission reference |
| `docs/SubAgent/manage_roles_spec.md` | Manage Roles feature spec (RoleProfile templates) — separate feature |

---

## 5. Proposed Fix — Exact Code Changes

Two options are described. **Option A is the immediate fix.** Option B is the long-term complete solution. Both can be applied together.

---

### Option A: Immediate Fix — Preserve User Role in Auth Callback (RECOMMENDED)

**Principle:** Do not overwrite the `role` column during login upsert updates. Role is only set at initial user creation from Entra groups. Subsequent role management is the responsibility of admins via the Users page. Explicit admin sync operations can still reset roles.

**File:** `backend/src/controllers/auth.controller.ts`

Find the `prisma.user.upsert()` call in the OAuth callback handler and remove `role: determinedRole` from the `update` clause only (keep it in `create`):

```typescript
// BEFORE
const user = await prisma.user.upsert({
  where: { entraId: userInfo.id },
  update: {
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    role: determinedRole,        // ❌ REMOVE THIS LINE
    isActive: true,
    lastLogin: new Date(),
  },
  create: {
    entraId: userInfo.id,
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    role: determinedRole,        // ✅ KEEP — sets role on first login
    isActive: true,
    lastLogin: new Date(),
  },
});

// AFTER
const user = await prisma.user.upsert({
  where: { entraId: userInfo.id },
  update: {
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    // role intentionally omitted — preserved from admin assignment
    isActive: true,
    lastLogin: new Date(),
  },
  create: {
    entraId: userInfo.id,
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    role: determinedRole,        // ✅ Keep for initial creation
    isActive: true,
    lastLogin: new Date(),
  },
});
```

**Impact:** After this change:
- New users logging in for the first time get their role from Entra groups ✅
- Returning users retain whatever role an admin has set ✅
- The `determinedRole` variable is still computed (used to set `roles` array in the JWT response) — no change needed to the JWT building code below the upsert

**Note on JWT roles array:** The `roles` array in the JWT payload is still set from `determinedRole`. This is fine because the JWT `roles` array is only used for the current session's in-memory authorization (the React auth store). The database `role` column is the source of truth for persistent role state. The JWT is re-issued on every login, so this is consistent.

---

### Option B: Complete Fix — `isRoleManual` Guard Field (Long-term)

**Principle:** Add a flag to explicitly track when an admin has manually overridden a user's role. When this flag is set, both the auth callback AND the sync service skip updating that user's role and permissions.

#### Step 1: Database Migration

Add two fields to the `User` model in `prisma/schema.prisma`:

```prisma
model User {
  id             String    @id @default(uuid())
  // ... existing fields ...
  role           String    @default("VIEWER")
  isRoleManual   Boolean   @default(false)        // ADD THIS
  roleOverrideAt DateTime?                         // ADD THIS (audit trail)
  // ... rest of fields ...
}
```

Generate and run migration:
```bash
cd backend
npx prisma migrate dev --name add_role_manual_override_flag
```

#### Step 2: Update `user.service.ts` — Set Flag on Manual Role Change

```typescript
// backend/src/services/user.service.ts — updateRole()

async updateRole(userId: string, role: string): Promise<User> {
  const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];
  
  if (!validRoles.includes(role)) {
    throw new ValidationError(
      `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      'role'
    );
  }

  try {
    return await this.prisma.user.update({
      where: { id: userId },
      data: {
        role,
        isRoleManual: true,        // ADD: flag that this was an admin override
        roleOverrideAt: new Date(), // ADD: audit timestamp
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      throw new NotFoundError('User', userId);
    }
    throw error;
  }
}
```

#### Step 3: Update `auth.controller.ts` — Skip Role Update for Manually-Overridden Users

```typescript
// auth.controller.ts — in the OAuth callback, BEFORE the upsert

// Fetch existing user to check for manual role override
const existingUser = await prisma.user.findUnique({
  where: { entraId: userInfo.id },
  select: { role: true, isRoleManual: true },
});

// Preserve manually-overridden role; apply Entra-derived role for new/unoverridden users
const effectiveRole = (existingUser?.isRoleManual)
  ? existingUser.role
  : determinedRole;

const user = await prisma.user.upsert({
  where: { entraId: userInfo.id },
  update: {
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    role: effectiveRole,       // preserves manual override
    isActive: true,
    lastLogin: new Date(),
  },
  create: {
    entraId: userInfo.id,
    email: userInfo.userPrincipalName || userInfo.mail || '',
    displayName: userInfo.displayName,
    firstName: userInfo.givenName || '',
    lastName: userInfo.surname || '',
    jobTitle: userInfo.jobTitle,
    department: userInfo.department,
    role: determinedRole,
    isActive: true,
    lastLogin: new Date(),
  },
});
```

#### Step 4: Update `userSync.service.ts` — Skip Manual-Override Users During Sync

```typescript
// backend/src/services/userSync.service.ts — syncUser()

async syncUser(entraId: string, force: boolean = false): Promise<any> {
  // ... existing code to fetch graphUser and determine role/permissions ...

  // Check for manual override before touching role
  const existingUser = await this.prisma.user.findUnique({
    where: { entraId },
    select: { role: true, isRoleManual: true },
  });

  const effectiveRole = (!force && existingUser?.isRoleManual)
    ? existingUser.role   // preserve admin-set role
    : role;               // apply Entra-derived role

  const user = await this.prisma.user.upsert({
    where: { entraId },
    update: {
      email: graphUser.mail,
      displayName: graphUser.displayName,
      firstName: graphUser.givenName,
      lastName: graphUser.surname,
      jobTitle: graphUser.jobTitle,
      department: graphUser.department,
      officeLocation,
      role: effectiveRole,       // respects override flag
      isActive: graphUser.accountEnabled,
      lastSync: new Date(),
    },
    create: {
      entraId,
      email: graphUser.mail,
      displayName: graphUser.displayName,
      firstName: graphUser.givenName,
      lastName: graphUser.surname,
      jobTitle: graphUser.jobTitle,
      department: graphUser.department,
      officeLocation,
      role,
      isActive: graphUser.accountEnabled,
      lastSync: new Date(),
    },
  });

  // Only sync permissions if not manually overridden (or forced)
  if (force || !existingUser?.isRoleManual) {
    await this.syncUserPermissions(user.id, permissions);
  }

  return user;
}
```

#### Step 5: (Optional) UI Enhancement — "Reset to Entra Role" Button

Add a reset button in the Users table that:
1. Calls a new `PUT /users/:id/role/reset` endpoint
2. Sets `isRoleManual = false` and role to the current Entra-derived value
3. Shows a lock icon next to manually-overridden roles so admins can identify them

This is a nice-to-have, not required for the fix. Scope to a separate sprint.

---

### Minor UX Fix (Bonus, `Users.tsx`)

The `disabled={updateRoleMutation.isPending}` on the role `<select>` disables ALL role dropdowns when ANY role change is pending. This is a minor UX issue. Fix by tracking the pending userId:

```tsx
// frontend/src/pages/Users.tsx

// Track which user's role is currently being updated
const [pendingRoleUserId, setPendingRoleUserId] = useState<string | null>(null);

const handleRoleChange = (userId: string, newRole: string) => {
  setPendingRoleUserId(userId);
  updateRoleMutation.mutate(
    { userId, role: newRole },
    {
      onSettled: () => setPendingRoleUserId(null),
    }
  );
};

// In the table render:
<select
  value={user.role}
  onChange={(e) => handleRoleChange(user.id, e.target.value)}
  disabled={pendingRoleUserId === user.id}   // only disable THIS user's dropdown
  className="form-select"
  style={{ fontSize: '0.875rem' }}
>
```

---

## 6. Security Considerations

### 6.1 Privilege Escalation Risk (Option A)

**Risk:** With Option A (remove role from auth update), an admin manually promoted to `ADMIN` role retains that role permanently even if removed from the Entra admin group. There is no automatic demotion mechanism.

**Mitigation:**
- For the school district context, the Entra group membership IS the authoritative source of admin rights — group removal is intentional. The existing "Sync All Users" explicitly re-syncs all roles, so an admin can always force a re-derive by running sync.
- For sensitive ADMIN → lower-role demotions, use the explicit sync button as the de-provisioning tool.
- Long-term: Option B's `force` flag gives full control.

### 6.2 Privilege Escalation Risk (Option B)

**Risk:** A user with `isRoleManual = true` set to `ADMIN` will retain `ADMIN` access even after being removed from Entra admin groups. No automatic revocation occurs.

**Mitigation:**
- Admins should use the "Sync All Users (Force)" operation when deprovisioning
- The `roleOverrideAt` timestamp provides audit trail
- Consider adding a cron job or login-time warning when a user's Entra groups no longer justify their manually-set role

### 6.3 No Change to Authentication or Authorization Middleware

Option A and B only change when the `users.role` DB column is written. The `authenticate` middleware, `requireAdmin` middleware, and `checkPermission` middleware all read from the JWT (which is re-derived from `determinedRole` at login-time). After the fix:
- JWT `roles` array still reflects the Entra-derived role for the current session
- DB `role` column reflects the stable admin-assigned role
- **This creates a session-level discrepancy**: while `isActive` and profile fields come from DB, the JWT `roles` array comes from Entra groups at auth time

**Mitigation for discrepancy:** Ensure that access control middleware reads from the DB-backed user `role`, not the JWT `roles` array. The current `requireAdmin` middleware should be verified to read from `req.user.role` populated by the auth middleware from the DB user record (not solely from the JWT payload). This should be verified as part of the implementation.

### 6.4 CSRF Token

All `PUT /users/:id/role` requests require CSRF token via `validateCsrfToken` middleware (confirmed in `user.routes.ts`). No change needed.

### 6.5 Authorization Scope

`PUT /users/:id/role` requires `authenticate` + `requireAdmin`. Only ADMIN users can change roles. No change to this guard is needed.

---

## 7. Risk and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New users don't get correct role on first login | Low | High | `create` clause still sets `role: determinedRole` — new users work correctly |
| Role stale after Entra group change (Option A) | Medium | Medium | Admin can manually update role, or run explicit sync. Accept trade-off. |
| DB migration fails (Option B) | Low | Medium | New fields have `@default(false)` and `?` nullable — no data migration needed, backwards-compatible |
| `isRoleManual` flag not cleared during re-sync | Medium (if not implemented) | Low | Spec includes `force` parameter in `syncUser()` to bypass override |
| JWT `roles` vs DB `role` discrepancy in session | Medium | Low | Session-level only; affects display in UI. Full permission checks still backed by re-issued JWT at next login. Verify `requireAdmin` reads from DB, not JWT payload. |
| Existing manually-promoted users remain ADMIN | Already true | Low | No regression; existing behavior is already to keep whatever role is in DB |

### Option A vs Option B Comparison

| Concern | Option A (Immediate) | Option B (Complete) |
|---------|---------------------|---------------------|
| Fixes the reported bug | ✅ | ✅ |
| Requires DB migration | ❌ No | ✅ Yes (low risk) |
| Entra group changes propagate automatically | ❌ Not on login (sync still works) | ✅ Partial (non-overridden users) |
| Admin can see which users have override | ❌ No UI indicator | ✅ `isRoleManual` visible via API |
| De-provisioning via Entra group removal | Requires explicit sync | Requires explicit force sync |
| Implementation complexity | Low — 1 line removed | Medium — migration + 2 service files |

**Recommendation:** Apply Option A immediately. Implement Option B in the next sprint alongside the Manage Roles / RoleProfile feature (`manage_roles_spec.md`) which adds the `role_profiles` tables and already touches the user permission assignment flow.

---

## 8. Testing Plan

### Scenario 1 — Basic Role Change Persists
1. Log in as ADMIN
2. Find user with role VIEWER  
3. Change role dropdown to MANAGER, confirm successful save
4. Log out and log back in as ADMIN
5. Reload Users page
6. **Expected:** User still shows MANAGER ✅ (was: VIEWER ❌)

### Scenario 2 — Role Persists After Target User Re-Logs In  
1. Change user A's role from VIEWER to MANAGER
2. Have user A log out and log back in
3. As ADMIN, check user A's role on Users page
4. **Expected:** User A still MANAGER ✅ (was: VIEWER ❌)

### Scenario 3 — New User Gets Correct Role on First Login
1. Find a user who has never logged into Tech-V2 but exists in Entra
2. User logs in for first time
3. **Expected:** Role set from Entra groups (e.g., MANAGER for a principal) ✅

### Scenario 4 — Sync Behavior (Option A)
1. Admin changes user's role to MANAGER
2. Admin clicks "Sync All Users"
3. **Expected (Option A):** Role is reset to Entra-derived value (sync intentionally overwrites)
4. **Expected (Option B):** Role is preserved (isRoleManual = true, sync skips override)

### Scenario 5 — Role Dropdown Only Disables Changed User (UX Bonus Fix)
1. Change user A's role
2. While mutation is pending, verify user B's dropdown remains enabled
3. **Expected:** Only user A's dropdown is disabled ✅

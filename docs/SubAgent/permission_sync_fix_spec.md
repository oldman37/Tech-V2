# Permission Sync Fix Specification

> **Status**: Ready for implementation  
> **Priority**: 🔴 Critical (Issue #1), 🟡 Medium (Issues #2, #3)  
> **Modules affected**: auth.controller.ts, userSync.service.ts  
> **DB models**: User, UserPermission, Permission

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Issue #1 — No Permission Sync at Login](#2-issue-1--no-permission-sync-at-login)
3. [Issue #2 — Manual Permission Overrides Wiped on Sync](#3-issue-2--manual-permission-overrides-wiped-on-sync)
4. [Issue #3 — Role Not Updated on Subsequent Logins](#4-issue-3--role-not-updated-on-subsequent-logins)
5. [Edge Case Handling](#5-edge-case-handling)
6. [Security Considerations](#6-security-considerations)
7. [Files to Modify vs Not Modify](#7-files-to-modify-vs-not-modify)
8. [Implementation Order](#8-implementation-order)

---

## 1. Current State Analysis

### Login Flow (auth.controller.ts — `callback`)

1. OAuth code exchanged for MSAL access token (line 80–92)
2. Microsoft Graph `/me` fetches user info (line 95–115)
3. Microsoft Graph `/me/memberOf` fetches Entra groups (line 118–136)
4. `UserSyncService.getRoleFromGroups(groupIds)` → returns `{ role, permissions }` (line 139–140)
5. `prisma.user.upsert()` creates or updates the User row (line 148–168)
   - **CREATE** block sets `role: determinedRole`
   - **UPDATE** block omits `role` (comment: "preserved from admin assignment")
6. JWT created with `user.role` from DB (line 171–183)
7. **No `syncUserPermissions()` call anywhere in the callback**

### Sync Flow (userSync.service.ts — `syncUser`)

1. Fetches user from Graph API + group memberships (lines 348–377)
2. `getRoleFromGroups(groupIds)` determines role + permissions (line 380)
3. `prisma.user.upsert()` — same pattern: role set on **create** only (lines 395–419)
4. **`syncUserPermissions(userId, permissions)` IS called** (line 422)

### syncUserPermissions (userSync.service.ts — lines 429–455)

```typescript
private async syncUserPermissions(userId: string, permissions: PermissionMapping[]) {
  // Delete ALL existing permissions (wipes manual overrides)
  await this.prisma.userPermission.deleteMany({
    where: { userId },
  });

  // Recreate from Entra-derived template
  for (const perm of permissions) {
    const permission = await this.prisma.permission.findUnique({
      where: { module_level: { module: perm.module, level: perm.level } },
    });
    if (permission) {
      await this.prisma.userPermission.create({
        data: { userId, permissionId: permission.id, grantedBy: 'SYSTEM' },
      });
    }
  }
}
```

**Problems identified:**
1. `deleteMany({ where: { userId } })` wipes ALL permissions — including those with `grantedBy` = an admin UUID
2. Not wrapped in a transaction — partial state possible on error
3. Not called during login at all — new users have zero UserPermission records

### Manual Override Flow (user.service.ts — `updatePermissions`)

```typescript
async updatePermissions(userId, permissions, grantedBy) {
  await this.prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId } });
    // Validate + createMany with grantedBy = adminUserId
  });
}
```

This also deletes ALL and recreates, but with `grantedBy` = the admin's UUID. This is correct for admin intent — the admin is replacing all permissions.

### UserPermission Schema (schema.prisma — lines 406–420)

```prisma
model UserPermission {
  id           String     @id @default(uuid())
  userId       String
  permissionId String
  grantedAt    DateTime   @default(now())
  grantedBy    String?          // ← 'SYSTEM' or admin UUID
  expiresAt    DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  permission   Permission @relation(...)
  user         User       @relation(...)

  @@unique([userId, permissionId])   // ← one record per user+permission pair
  @@map("user_permissions")
}
```

**Key constraint**: `@@unique([userId, permissionId])` means a user cannot have two records for the same Permission (module+level) pair. A user CAN have TECHNOLOGY:1 and TECHNOLOGY:3 simultaneously (they are different Permission records).

### checkPermission Middleware (permissions.ts)

```typescript
// ADMIN bypasses all checks (line 67)
if (userRole === 'ADMIN') { req.user.permLevel = 6; return next(); }

// Query ALL UserPermission rows for user (line 73-78)
const userPermissions = await prisma.userPermission.findMany({
  where: { userId },
  include: { permission: true },
});

// Find matching: module matches AND level >= requiredLevel (line 81-83)
const matchingPermission = userPermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
);
```

If no UserPermission records exist → `matchingPermission` is undefined → **403 Forbidden**.

---

## 2. Issue #1 — No Permission Sync at Login

### Problem

When a user logs in for the first time (or any time), `auth.controller.ts` callback:
- Creates/updates the User row ✅
- Creates a JWT ✅
- **Does NOT create UserPermission records** ❌

Result: first API call after login → `checkPermission()` queries UserPermission → finds nothing → 403.

### Root Cause

`syncUserPermissions()` is a **private** method on `UserSyncService`. It's only called from `syncUser()`, which is only invoked by the admin sync endpoints (`POST /api/admin/sync-users/*`). The login callback never invokes it.

### Fix Design

**Extract a standalone `syncPermissionsAtLogin()` function** that doesn't need the Graph client (all data is already available in the callback). This avoids instantiating a full `UserSyncService` just for permission sync.

#### New exported function in `userSync.service.ts`

```typescript
/**
 * Sync user permissions from Entra-derived role mapping.
 * Called at login and during admin sync.
 *
 * - Replaces only SYSTEM-granted permissions (preserves admin overrides)
 * - Runs inside a transaction for atomicity
 * - Errors are caught and logged — never blocks login
 *
 * @param prisma   - PrismaClient instance  
 * @param userId   - Database user ID
 * @param permissions - Entra-derived permission mappings [{module, level}]
 */
export async function syncPermissionsForUser(
  prisma: PrismaClient,
  userId: string,
  permissions: Array<{ module: string; level: number }>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Fetch existing manual overrides (grantedBy ≠ 'SYSTEM' and NOT null)
    const manualOverrides = await tx.userPermission.findMany({
      where: {
        userId,
        grantedBy: { not: 'SYSTEM' },
        NOT: { grantedBy: null },
      },
      include: { permission: true },
    });

    // Build a map: module → highest manually-granted level
    const manualLevelByModule = new Map<string, number>();
    for (const override of manualOverrides) {
      const current = manualLevelByModule.get(override.permission.module) ?? 0;
      if (override.permission.level > current) {
        manualLevelByModule.set(override.permission.module, override.permission.level);
      }
    }

    // 2. Delete only SYSTEM-granted permissions
    await tx.userPermission.deleteMany({
      where: {
        userId,
        OR: [
          { grantedBy: 'SYSTEM' },
          { grantedBy: null },       // treat null as SYSTEM (legacy data)
        ],
      },
    });

    // 3. Create new SYSTEM permissions from Entra-derived mapping
    for (const perm of permissions) {
      // If a manual override exists at a HIGHER level for this module, skip
      const manualLevel = manualLevelByModule.get(perm.module) ?? 0;
      if (manualLevel >= perm.level) {
        continue; // manual override is equal or higher — skip SYSTEM record
      }

      const permission = await tx.permission.findUnique({
        where: {
          module_level: { module: perm.module, level: perm.level },
        },
      });

      if (permission && permission.isActive) {
        // Check for unique constraint (userId, permissionId)
        const existing = await tx.userPermission.findUnique({
          where: {
            userId_permissionId: { userId, permissionId: permission.id },
          },
        });

        if (!existing) {
          await tx.userPermission.create({
            data: {
              userId,
              permissionId: permission.id,
              grantedBy: 'SYSTEM',
            },
          });
        }
      }
    }
  });
}
```

#### Changes to `auth.controller.ts` callback

After the user upsert (line ~168), add:

```typescript
// Sync Entra-derived permissions to database
// Wrapped in try/catch — permission sync failure must NOT block login
try {
  await syncPermissionsForUser(prisma, user.id, roleMapping.permissions);
} catch (permSyncError) {
  loggers.auth.error('Permission sync at login failed — user can authenticate but may lack DB permissions', {
    userId: user.id,
    error: permSyncError instanceof Error ? { message: permSyncError.message } : permSyncError,
  });
}
```

**Import addition** at top of auth.controller.ts:

```typescript
import { syncPermissionsForUser } from '../services/userSync.service';
```

#### Changes to `userSync.service.ts` — `syncUserPermissions` (private method)

Replace the existing private method body to call the new shared function:

```typescript
private async syncUserPermissions(userId: string, permissions: PermissionMapping[]) {
  await syncPermissionsForUser(this.prisma, userId, permissions);
}
```

This ensures the admin sync endpoints (`/api/admin/sync-users/*`) also get the improved logic (preserve manual overrides + transaction).

---

## 3. Issue #2 — Manual Permission Overrides Wiped on Sync

### Problem

`syncUserPermissions()` does `deleteMany({ where: { userId } })` — deletes ALL UserPermission rows regardless of `grantedBy`. If an admin manually set REQUISITIONS:5 for a user, the next sync wipes it and replaces with the Entra-derived level (e.g., REQUISITIONS:2).

### Root Cause

The `grantedBy` field exists but is unused as a discriminator during sync.

### Fix Design

Already incorporated in the `syncPermissionsForUser()` function above. The key logic:

```
1. Fetch manual overrides: WHERE grantedBy NOT IN ('SYSTEM', null)
2. Build manualLevelByModule map: module → highest manual level
3. DELETE only WHERE grantedBy = 'SYSTEM' OR grantedBy IS NULL
4. For each Entra permission:
   a. If manualLevelByModule[module] >= entra_level → SKIP (manual is higher)
   b. Else → CREATE with grantedBy = 'SYSTEM'
```

### Decision Matrix for Permission Conflicts

| Manual Level | Entra Level | Action | Reason |
|-----|-----|-----|-----|
| REQUISITIONS:5 | REQUISITIONS:3 | Keep manual:5, skip SYSTEM:3 | Manual is higher — admin intentionally elevated |
| TECHNOLOGY:1 | TECHNOLOGY:3 | Keep manual:1 (harmless), create SYSTEM:3 | Entra is higher — user needs the higher level; manual:1 is superseded but unique constraint allows both since they're different Permission IDs |
| MAINTENANCE:3 | MAINTENANCE:3 | Keep manual:3, skip SYSTEM:3 | Same level — manual is equal, no need for duplicate |
| (none) | REQUISITIONS:2 | Create SYSTEM:2 | No manual override exists |

**Important**: The `@@unique([userId, permissionId])` constraint means the same user cannot have two records pointing to the same `Permission.id`. But a user CAN have both TECHNOLOGY:1 (`permissionId=abc`) and TECHNOLOGY:3 (`permissionId=xyz`) because they're different Permission records. The `checkPermission` middleware finds the highest matching level automatically (lines 96–101).

### Changes to `user.service.ts` — `updatePermissions` (admin manual assignment)

**No changes needed.** When an admin manually sets permissions via `PUT /api/users/:id/permissions`, `updatePermissions()` correctly:
1. Deletes ALL existing permissions (admin intent: replace everything)
2. Creates new ones with `grantedBy = adminUserId`

This is the intended behavior — an admin explicitly overriding all permissions should wipe SYSTEM ones too. The next Entra sync will then respect the manual overrides.

---

## 4. Issue #3 — Role Not Updated on Subsequent Logins

### Problem

In `auth.controller.ts` line 155, the update block of the upsert intentionally omits `role`:

```typescript
update: {
  email: ...,
  displayName: ...,
  // role intentionally omitted — preserved from admin assignment
  isActive: true,
  lastLogin: new Date(),
},
```

With the old multi-role system this made sense — admins could assign granular roles. With the new simplified 2-role system (ADMIN/USER), the role should reflect Entra group membership on every login. If a user is promoted to an ADMIN Entra group, they remain USER in the DB until an admin manually changes it.

### Additionally in `userSync.service.ts` (line 401)

Same pattern:

```typescript
update: {
  // role intentionally omitted — preserved from admin assignment
},
```

### Fix Design

#### auth.controller.ts — Add `role` to update block

```typescript
update: {
  email: userInfo.userPrincipalName || userInfo.mail || '',
  displayName: userInfo.displayName,
  firstName: userInfo.givenName || '',
  lastName: userInfo.surname || '',
  jobTitle: userInfo.jobTitle,
  department: userInfo.department,
  role: determinedRole,  // ← ADD THIS
  // With simplified 2-role system (ADMIN/USER), role always syncs from Entra groups.
  // Admin overrides are expressed via UserPermission (grantedBy = admin UUID), not via role.
  isActive: true,
  lastLogin: new Date(),
},
```

#### userSync.service.ts — Add `role` to update block in `syncUser` 

```typescript
update: {
  email: graphUser.mail,
  displayName: graphUser.displayName,
  firstName: graphUser.givenName,
  lastName: graphUser.surname,
  jobTitle: graphUser.jobTitle,
  department: graphUser.department,
  officeLocation,
  role,  // ← ADD THIS (was intentionally omitted; now synced with simplified 2-role system)
  isActive: graphUser.accountEnabled,
  lastSync: new Date(),
},
```

#### JWT Implications

The JWT is created AFTER the upsert, using `user.role` from the DB:

```typescript
const roles: string[] = [user.role];
```

Since the upsert now includes `role` in both create and update, `user.role` will always reflect the current Entra-derived role. The JWT will be correct.

---

## 5. Edge Case Handling

### 5.1. User has manual REQUISITIONS:5, Entra gives REQUISITIONS:3

- Manual level (5) > Entra level (3)
- **Action**: Keep manual REQUISITIONS:5. Skip creating SYSTEM REQUISITIONS:3.
- `checkPermission('REQUISITIONS', 3)` → finds user's REQUISITIONS:5 (level 5 >= 3) → ✅ pass

### 5.2. User has manual TECHNOLOGY:1, Entra gives TECHNOLOGY:3

- Manual level (1) < Entra level (3)
- **Action**: Keep manual TECHNOLOGY:1 (not deleted — it has admin grantedBy). Create SYSTEM TECHNOLOGY:3.
- User now has two UserPermission rows for TECHNOLOGY (different Permission IDs, so unique constraint not violated)
- `checkPermission('TECHNOLOGY', 3)` → finds TECHNOLOGY:3 → ✅ pass
- Harmless: the TECHNOLOGY:1 manual record is superseded but doesn't interfere

### 5.3. Admin demotes user by removing a manual permission

- Admin calls `PUT /api/users/:id/permissions` with reduced set
- `updatePermissions()` deletes ALL and recreates with admin UUID
- Next Entra sync → only deletes SYSTEM records, creates Entra-derived ones
- Manual (admin-set) permissions remain as admin intended
- **No re-addition of removed permissions**

### 5.4. User has NO manual overrides (typical case)

- All existing permissions have `grantedBy = 'SYSTEM'` or `null`
- Sync deletes all, recreates from Entra mapping
- Behavior identical to current code — no regression

### 5.5. First-time login (user doesn't exist yet)

- Upsert creates User → no existing UserPermission rows
- `syncPermissionsForUser()` finds no manual overrides, creates all Entra-derived
- User immediately has correct permissions ✅

### 5.6. Admin sync endpoints (`POST /api/admin/sync-users/*`)

- These call `syncUser()` → `syncUserPermissions()` → which now delegates to `syncPermissionsForUser()`
- Same improved logic applies — manual overrides preserved
- **No changes needed in admin.routes.ts**

### 5.7. Legacy data (grantedBy = null)

- Old UserPermission records may have `grantedBy = null` (pre-improvement data)
- Treated as SYSTEM-granted: deleted during sync and recreated
- This is safe — null was the default before the grantedBy field was used consistently

### 5.8. User in multiple Entra groups

- `getRoleFromGroups()` uses priority order — returns the FIRST matching group's role+permissions
- This is unchanged — the winning group's permission set is what gets synced
- Users do NOT get merged permissions from all groups (by design)

### 5.9. Performance impact

- Permission sync adds one DB transaction per login (read + delete + create)
- Typical user has 3–6 permission records → negligible overhead
- Transaction ensures atomicity — no partial state
- Admin sync of 200+ users already works this way (per-user sync)

---

## 6. Security Considerations

### 6.1. Transaction Atomicity

All permission writes in `syncPermissionsForUser()` are wrapped in `prisma.$transaction()`. If any step fails, the entire sync is rolled back. No partial permission state.

### 6.2. Login Must Not Be Blocked

Permission sync is wrapped in try/catch in `auth.controller.ts`:

```typescript
try {
  await syncPermissionsForUser(prisma, user.id, roleMapping.permissions);
} catch (permSyncError) {
  loggers.auth.error('Permission sync at login failed', { ... });
}
```

If the DB is temporarily unreachable for the permission sync but the user row was already created, the user still gets a valid JWT and can authenticate. The ADMIN bypass in `checkPermission` means admin users aren't affected. For non-admin users, the next login or admin-triggered sync will fix it.

### 6.3. Structured Logging

All logging uses the existing `loggers.auth` and `loggers.userSync` structured loggers. No `console.log`.

### 6.4. No Permission Details in Logs

Log messages include `userId`, error messages, and counts — but NOT specific permission modules/levels or grantedBy values (PII-adjacent given they reveal organizational role).

### 6.5. grantedBy Validation

The `grantedBy` field discriminator uses:
- `'SYSTEM'` — exact string literal for Entra-synced
- Admin UUID — set by `updatePermissions()` which validates the admin user exists
- `null` — treated as legacy SYSTEM (safe to overwrite)

No external input directly sets `grantedBy` in the sync path.

### 6.6. Privilege Escalation Prevention

- Only `isActive` permissions are created (check added in `syncPermissionsForUser`)
- Deactivated legacy permissions (REQUISITIONS 7-9) cannot be synced even if someone misconfigures a group mapping
- The `@@unique([userId, permissionId])` constraint prevents duplicate grant records

---

## 7. Files to Modify vs Not Modify

### Files to MODIFY

| File | Changes |
|------|---------|
| `backend/src/services/userSync.service.ts` | 1. Export new `syncPermissionsForUser()` standalone function. 2. Replace private `syncUserPermissions()` body to call the shared function. 3. Add `role` to the update block in `syncUser()`. 4. Update comment about role omission. |
| `backend/src/controllers/auth.controller.ts` | 1. Import `syncPermissionsForUser`. 2. Call it after user upsert (in try/catch). 3. Add `role: determinedRole` to the update block of upsert. 4. Update/remove the comment about role being omitted. |

### Files to NOT MODIFY

| File | Reason |
|------|--------|
| `backend/src/middleware/permissions.ts` | checkPermission logic is already correct — it queries UserPermission and finds matching levels. No changes needed once records exist. |
| `backend/src/middleware/auth.ts` | authenticate middleware only validates JWT. Permission sync is not its concern. |
| `backend/src/services/user.service.ts` | `updatePermissions()` is for admin manual assignment — it should continue to delete ALL and recreate with admin UUID. No changes. |
| `backend/prisma/schema.prisma` | UserPermission model already has `grantedBy` field. No schema changes required. |
| `backend/prisma/seed.ts` | Permission seed data is unchanged. |
| `backend/src/routes/admin.routes.ts` | Admin sync endpoints call `syncUser()` which calls the improved `syncUserPermissions()`. No route changes needed. |

---

## 8. Implementation Order

1. **Add `syncPermissionsForUser()` function** in `userSync.service.ts` (exported, standalone)
2. **Update private `syncUserPermissions()`** to delegate to the new function
3. **Add `role` to update block** in `userSync.service.ts` → `syncUser()`
4. **Import `syncPermissionsForUser`** in `auth.controller.ts`
5. **Add permission sync call** after upsert in `auth.controller.ts` callback
6. **Add `role: determinedRole` to update block** in `auth.controller.ts` upsert
7. **Update comments** in both files to reflect new behavior
8. **Test**: Login as a new user → verify UserPermission records created
9. **Test**: Login as existing user with manual override → verify override preserved
10. **Test**: Admin sync → verify improved behavior
11. **Test**: Role change via Entra group → verify role updates on next login

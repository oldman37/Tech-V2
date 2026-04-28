# Permission System Fix Specification

## Dual Permission System Conflict Resolution

**Document:** `docs/SubAgent/permission_system_fix_spec.md`  
**Date:** 2026-03-13  
**Status:** READY FOR IMPLEMENTATION  
**Solution:** Option 1 — Entra Is Source of Truth

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Root Cause Deep Dive](#3-root-cause-deep-dive)
4. [Research & Best Practices](#4-research--best-practices)
5. [Proposed Solution Architecture](#5-proposed-solution-architecture)
6. [Backend Changes](#6-backend-changes)
7. [Frontend Changes](#7-frontend-changes)
8. [Data Model](#8-data-model)
9. [Implementation Steps](#9-implementation-steps)
10. [Security Considerations](#10-security-considerations)
11. [Testing Strategy](#11-testing-strategy)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

Two subsystems write to the same `user_permissions` table and conflict:

| System | Trigger | Strategy | `grantedBy` value |
|--------|---------|----------|-------------------|
| **Entra Group Sync** (`userSync.service.ts`) | Login / admin bulk sync | Delete SYSTEM/null → recreate from group mapping | `'SYSTEM'` |
| **Admin Manual Assignment** (`user.service.ts`) | Admin edits permissions in UI | **Delete ALL → recreate** | `adminUserId` (UUID) |

**The Bug:** `updatePermissions()` does a blind `deleteMany({ where: { userId } })`, wiping SYSTEM records. On next login, the sync sees every record as a manual override (admin UUID ≠ `'SYSTEM'`), skips them, and creates new SYSTEM records alongside → duplicates and unpredictable access levels.

**The Fix:** Make Entra groups the sole authority for base permissions. The admin UI becomes an override/supplement tool that can only ADD or RAISE levels above the Entra baseline. No schema changes or migrations required.

---

## 2. Current State Analysis

### 2.1 Data Model (`schema.prisma`)

```prisma
model UserPermission {
  id           String     @id @default(uuid())
  userId       String
  permissionId String
  grantedAt    DateTime   @default(now())
  grantedBy    String?                    // ← KEY FIELD: 'SYSTEM' | adminUUID | null
  expiresAt    DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  permission   Permission @relation(...)
  user         User       @relation(...)

  @@unique([userId, permissionId])        // ← compound unique
  @@map("user_permissions")
}

model Permission {
  id       String  @id @default(uuid())
  module   String                         // 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS'
  level    Int                            // 1-6
  name     String
  isActive Boolean @default(true)
  @@unique([module, level])               // ← natural key
  @@map("permissions")
}
```

The `grantedBy` field already distinguishes SYSTEM grants from manual overrides. No schema changes needed.

### 2.2 System A: Entra Group Sync (`userSync.service.ts` lines 29-99)

```typescript
export async function syncPermissionsForUser(
  userId: string,
  permissions: PermissionMapping[]
): Promise<void> {
  await defaultPrisma.$transaction(async (tx) => {
    // 1. Fetch manual overrides (grantedBy != 'SYSTEM' AND grantedBy != null)
    const manualOverrides = await tx.userPermission.findMany({
      where: {
        userId,
        grantedBy: { not: 'SYSTEM' },
        NOT: { grantedBy: null },
      },
      include: { permission: true },
    });

    // Build map: module → highest manually-granted level
    const manualLevelByModule = new Map<string, number>();
    for (const override of manualOverrides) {
      const current = manualLevelByModule.get(override.permission.module) ?? 0;
      if (override.permission.level > current) {
        manualLevelByModule.set(override.permission.module, override.permission.level);
      }
    }

    // 2. Delete only SYSTEM/null records (preserves manual overrides)
    await tx.userPermission.deleteMany({
      where: {
        userId,
        OR: [
          { grantedBy: 'SYSTEM' },
          { grantedBy: null },   // legacy data
        ],
      },
    });

    // 3. Recreate SYSTEM permissions; skip if manual override >= SYSTEM level
    for (const perm of permissions) {
      const manualLevel = manualLevelByModule.get(perm.module) ?? 0;
      if (manualLevel >= perm.level) continue;

      const permission = await tx.permission.findUnique({
        where: { module_level: { module: perm.module, level: perm.level } },
      });
      if (permission && permission.isActive) {
        const existing = await tx.userPermission.findUnique({
          where: { userId_permissionId: { userId, permissionId: permission.id } },
        });
        if (!existing) {
          await tx.userPermission.create({
            data: { userId, permissionId: permission.id, grantedBy: 'SYSTEM' },
          });
        }
      }
    }
  });
}
```

**Assessment:** This function is correctly designed. It:
- Only deletes SYSTEM/null records
- Skips SYSTEM creation when manual override already covers the level
- Runs atomically inside a transaction
- ✅ **No changes needed.**

### 2.3 System B: Admin Manual Assignment (`user.service.ts` lines 259-299)

```typescript
async updatePermissions(
  userId: string,
  permissions: Array<{ module: string; level: number }>,
  grantedBy: string
): Promise<UserWithPermissions> {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  await this.prisma.$transaction(async (tx) => {
    // ❌ BUG: Deletes ALL permissions, including grantedBy='SYSTEM'
    await tx.userPermission.deleteMany({ where: { userId } });

    const permissionRecords = [];
    for (const perm of permissions) {
      const permission = await tx.permission.findUnique({
        where: { module_level: { module: perm.module, level: perm.level } },
      });
      if (!permission || !permission.isActive) {
        throw new NotFoundError(`Permission ${perm.module}:${perm.level}`, '');
      }
      permissionRecords.push({ userId, permissionId: permission.id, grantedBy });
    }

    if (permissionRecords.length > 0) {
      await tx.userPermission.createMany({ data: permissionRecords });
    }
  });

  return this.findById(userId);
}
```

**Identified Bug:** Line `deleteMany({ where: { userId } })` deletes every `UserPermission` record for this user, including those with `grantedBy = 'SYSTEM'`. All recreated records get `grantedBy = adminUserId`. On next login, `syncPermissionsForUser()` sees these as manual overrides and creates new SYSTEM records alongside them → duplicates.

### 2.4 Permission Middleware (`permissions.ts`)

```typescript
export function checkPermission(module: PermissionModule, requiredLevel: PermissionLevel) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // ADMIN role bypasses entirely
    if (userRole === 'ADMIN') { req.user.permLevel = 6; return next(); }

    // Fetch ALL UserPermission records for user
    const userPermissions = await prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });

    // Find any matching permission for the module at required level
    const matchingPermission = userPermissions.find(
      (up) => up.permission.module === module && up.permission.level >= requiredLevel
    );

    // Attach highest non-expired level for the module
    const highestLevel = userPermissions
      .filter(up => up.permission.module === module && (!up.expiresAt || up.expiresAt >= now))
      .reduce((max, up) => Math.max(max, up.permission.level), 0);
    req.user.permLevel = highestLevel || matchingPermission.permission.level;
  };
}
```

**Assessment:** This middleware naturally picks the highest level across ALL `UserPermission` records for a module, regardless of `grantedBy`. This means SYSTEM and manual records coexist correctly — the highest wins. ✅ **No changes needed.**

### 2.5 Frontend Permission Modal (`Users.tsx` lines ~500-610)

The `PermissionModal` component:
- Initializes from `user.permissions` (flat list, no `grantedBy` distinction)
- Allows selecting a level per module via dropdown
- Sends the full set `{ module, level }[]` to the API
- Does NOT differentiate SYSTEM vs manual permissions

**Problem:** The modal has no awareness of Entra-sourced permissions. It sends the full permission set, which the backend replaces entirely (including SYSTEM records).

### 2.6 API Route & Validation (`user.routes.ts`, `user.validators.ts`)

```
PUT /api/users/:id/permissions
  → authenticate → requireAdmin → validateCsrfToken
  → validateRequest(UpdateUserPermissionsSchema, 'body')
  → updateUserPermissions controller
```

Validation schema:
```typescript
const PermissionItemSchema = z.object({
  module: z.string().min(1),
  level: z.number().int().min(0),
});
export const UpdateUserPermissionsSchema = z.object({
  permissions: z.array(PermissionItemSchema).min(0),
});
```

**Assessment:** Route security is solid (auth + admin + CSRF + Zod validation). The schema allows `level: 0` which could be used to represent "remove override." ✅ **No changes needed to route or validation.**

### 2.7 Frontend Service Layer (`userService.ts`)

```typescript
async updateUserPermissions(id: string, permissions: { module: string; level: number }[]): Promise<User> {
  const response = await api.put(`/users/${id}/permissions`, { permissions });
  return response.data.user;
}
```

The `UserPermission` interface does NOT include `grantedBy`:
```typescript
export interface UserPermission extends Permission {
  module: string;
  grantedAt: string;
  expiresAt?: string;
}
```

The `User` interface has `permissions: UserPermission[]` — all permissions are treated equally.

---

## 3. Root Cause Deep Dive

### Conflict Sequence (Before Fix)

```
Timeline:
─────────────────────────────────────────────────────────────
1. User logs in → syncPermissionsForUser() runs
   DB state: [TECH L1 grantedBy=SYSTEM, MAINT L1 grantedBy=SYSTEM]

2. Admin opens permission modal for user
   → reads user.permissions → sees TECH L1, MAINT L1
   → admin changes TECH to L2, leaves MAINT at L1
   → frontend sends: [{ TECH, 2 }, { MAINT, 1 }]

3. updatePermissions() runs:
   a) DELETE ALL where userId = X           ← destroys SYSTEM records
   b) CREATE [TECH L2 grantedBy=adminUUID, MAINT L1 grantedBy=adminUUID]
   
4. User logs in again → syncPermissionsForUser() runs
   a) Finds manual overrides: [TECH L2 grantedBy=adminUUID, MAINT L1 grantedBy=adminUUID]
   b) manualLevelByModule = { TECH: 2, MAINT: 1 }
   c) Deletes SYSTEM/null records → nothing to delete (none exist)
   d) For TECH L1 from Entra: manualLevel(2) >= 1 → skip ✓
   e) For MAINT L1 from Entra: manualLevel(1) >= 1 → skip ✓
   
   Result: No duplicates THIS time, but ALL permissions are now "manual" 
   → Entra group changes will NEVER downgrade this user's permissions
   → The user's Entra baseline is permanently invisible

5. Admin removes user from Entra group that granted MAINT L1
   → syncPermissionsForUser() runs with permissions = [TECH L1]
   a) MAINT L1 grantedBy=adminUUID is treated as manual override → PRESERVED
   → User STILL has MAINT L1 even though they shouldn't!
─────────────────────────────────────────────────────────────
```

**Core Issue:** The admin save path converts SYSTEM grants into admin grants, making them invisible to the sync's preservation logic. This breaks the contract between the two systems.

---

## 4. Research & Best Practices

### Source 1: Microsoft — Entra ID Role-Based Access Control
**URL:** https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/custom-overview

**Key principle:** Entra RBAC evaluates role memberships from group claims in access tokens. Role assignments are additive — access is granted by creating a role assignment, revoked by removing one. Microsoft recommends assigning roles to groups (not individual users) for manageability. This maps directly to our pattern: Entra groups define the baseline, individual overrides are separate assignments.

### Source 2: Microsoft — App Roles in Entra Applications
**URL:** https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps

**Key principle:** App roles and group claims are not mutually exclusive — they can be combined for finer-grained access control. The `roles` claim in tokens represents the IdP-derived baseline. Applications should treat these as the authoritative floor and allow local supplementation. The "highest role wins" pattern is standard: if a user has multiple role assignments, the most permissive applies.

### Source 3: Azure RBAC Best Practices
**URL:** https://learn.microsoft.com/en-us/azure/role-based-access-control/best-practices

**Key principles applied to our design:**
- **Least privilege:** Grant only the access users need — Entra groups define the organizational minimum.
- **Assign roles to groups, not users:** Our Entra group mapping follows this pattern exactly.
- **Limit privileged admin role assignments:** Manual overrides should be the exception, not the norm, and should only elevate (never reduce) access.

### Source 4: Microsoft — Automatic User Provisioning Planning
**URL:** https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-auto-user-provisioning

**Key principles:**
- IdP provisioning should be additive to avoid destructive race conditions.
- The source system (Entra) owns identity data; target systems (our app) should not override source-of-truth attributes.
- Incremental sync cycles should preserve locally-managed attributes while updating IdP-sourced ones.

This directly supports our "Entra is source of truth" approach — the sync manages its own records and the app manages its own independently.

### Source 5: OWASP Authorization Cheat Sheet
**URL:** https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

**Key principles applied:**
- **Validate permissions on every request:** Our `checkPermission()` middleware already does this.
- **Deny by default:** If no `UserPermission` records exist for a module, access is denied. ✓
- **Enforce least privileges:** Entra baseline establishes the floor; manual overrides only elevate.
- **Create tests for authorization logic:** Our testing strategy must cover the merge behavior.
- **Log authorization events:** Use structured logger for permission changes.
- **Server-side enforcement:** Never rely on frontend to enforce access boundaries.

### Source 6: OWASP Web Security Testing Guide — Authorization Testing
**URL:** https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/

**Key principles applied:**
- **Test for privilege escalation:** Ensure admin overrides cannot grant levels above what the admin themselves holds (existing `requireAdmin` check covers this since ADMINs bypass level checks entirely).
- **Test for IDOR:** The userId parameter in the permissions endpoint is protected by admin-only middleware.
- **Test for bypassing authorization schema:** The fix must ensure that removing a manual override doesn't accidentally remove SYSTEM grants.

### Design Pattern: "Highest Level Wins" Merge Strategy

From the research, the standard pattern for hybrid IdP + local permissions is:

```
effective_level(user, module) = MAX(
  system_grants.filter(module).max(level),
  manual_overrides.filter(module).max(level)
)
```

Both SYSTEM and manual records coexist in the same table. The middleware picks the maximum. This is exactly what our `checkPermission()` already does. The only broken piece is the save path that destroys SYSTEM records.

---

## 5. Proposed Solution Architecture

### Design Principles

1. **Entra Is Source of Truth:** Entra groups define the permission floor. The sync owns all `grantedBy = 'SYSTEM'` records.
2. **Admin Overrides Are Supplements:** Admin UI can only ADD or RAISE levels above the Entra baseline. Manual records use `grantedBy = adminUserId`.
3. **Highest Level Wins:** The middleware evaluates all records regardless of source and uses the maximum level.
4. **Non-Destructive Saves:** The admin save path must never touch SYSTEM records.
5. **Transparent UI:** The frontend must clearly show which permissions come from Entra vs manual override.

### Data Flow Diagram

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Entra ID   │────→│ syncPermissionsFor   │────→│ user_permissions    │
│  Groups     │     │ User()               │     │ grantedBy='SYSTEM'  │
└─────────────┘     │ DELETE SYSTEM/null    │     └─────────────────────┘
                    │ CREATE SYSTEM         │              │
                    └──────────────────────┘              │
                                                          │   MAX(level)
                    ┌──────────────────────┐              │   per module
                    │ updatePermissions()  │              ▼
┌─────────────┐     │ DELETE non-SYSTEM    │     ┌─────────────────────┐
│  Admin UI   │────→│ CREATE adminId       │────→│ user_permissions    │
│  Override   │     │ (only if > baseline) │     │ grantedBy=adminUUID │
└─────────────┘     └──────────────────────┘     └─────────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────────┐
                                                 │ checkPermission()   │
                                                 │ → highest level     │
                                                 │   across ALL rows   │
                                                 └─────────────────────┘
```

---

## 6. Backend Changes

### 6.A Fix `updatePermissions()` in `user.service.ts`

**File:** `backend/src/services/user.service.ts`  
**Method:** `updatePermissions()` (around line 259)

**Current (buggy):**
```typescript
await tx.userPermission.deleteMany({ where: { userId } });
```

**New logic:**

```typescript
async updatePermissions(
  userId: string,
  permissions: Array<{ module: string; level: number }>,
  grantedBy: string
): Promise<UserWithPermissions> {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  await this.prisma.$transaction(async (tx) => {
    // 1. Fetch SYSTEM-granted permissions to know the Entra baseline
    const systemGrants = await tx.userPermission.findMany({
      where: {
        userId,
        OR: [
          { grantedBy: 'SYSTEM' },
          { grantedBy: null },
        ],
      },
      include: { permission: true },
    });

    // Build map: module → highest SYSTEM-granted level
    const systemLevelByModule = new Map<string, number>();
    for (const grant of systemGrants) {
      const current = systemLevelByModule.get(grant.permission.module) ?? 0;
      if (grant.permission.level > current) {
        systemLevelByModule.set(grant.permission.module, grant.permission.level);
      }
    }

    // 2. Delete only non-SYSTEM permissions (preserve Entra baseline)
    await tx.userPermission.deleteMany({
      where: {
        userId,
        grantedBy: { notIn: ['SYSTEM'] },
        NOT: { grantedBy: null },
      },
    });

    // 3. Create manual overrides only where level > SYSTEM baseline
    const permissionRecords = [];
    for (const perm of permissions) {
      const systemLevel = systemLevelByModule.get(perm.module) ?? 0;

      // Skip if admin-requested level is at or below the SYSTEM baseline
      if (perm.level <= systemLevel) continue;

      const permission = await tx.permission.findUnique({
        where: { module_level: { module: perm.module, level: perm.level } },
      });

      if (!permission || !permission.isActive) {
        throw new NotFoundError(`Permission ${perm.module}:${perm.level}`, '');
      }

      // Check for unique constraint (userId, permissionId) — SYSTEM may hold a different level
      const existing = await tx.userPermission.findUnique({
        where: { userId_permissionId: { userId, permissionId: permission.id } },
      });

      if (!existing) {
        permissionRecords.push({
          userId,
          permissionId: permission.id,
          grantedBy,
        });
      }
    }

    if (permissionRecords.length > 0) {
      await tx.userPermission.createMany({ data: permissionRecords });
    }
  });

  return this.findById(userId);
}
```

**Key behavior changes:**
1. Only deletes records where `grantedBy` is NOT `'SYSTEM'` and NOT `null`
2. Reads the SYSTEM baseline before deciding what to create
3. Only creates manual override records where the requested level exceeds the SYSTEM baseline
4. If the admin sets a level ≤ SYSTEM level for a module, no manual record is created (the SYSTEM grant already covers it)

### 6.B Verify `syncPermissionsForUser()` in `userSync.service.ts`

**Status: ✅ NO CHANGES NEEDED**

Verified that:
- It correctly queries manual overrides (`grantedBy != 'SYSTEM'` AND `grantedBy != null`)
- It only deletes SYSTEM/null records
- It skips SYSTEM creation when `manualLevel >= perm.level`
- It handles the `userId_permissionId` unique constraint
- It runs inside a transaction

### 6.C Verify `checkPermission()` in `permissions.ts`

**Status: ✅ NO CHANGES NEEDED**

Verified that:
- It fetches ALL `UserPermission` records for the user (no `grantedBy` filter)
- It finds ANY matching permission at the required level (SYSTEM or manual)
- The `highestLevel` calculation aggregates across all sources
- ADMIN role bypasses entirely
- Expiry is checked

### 6.D New Endpoint: `GET /api/users/:id/effective-permissions`

**File:** `backend/src/services/user.service.ts` — add new method  
**File:** `backend/src/controllers/user.controller.ts` — add new handler  
**File:** `backend/src/routes/user.routes.ts` — add new route

**Purpose:** Return permissions split by source so the frontend can distinguish Entra baseline from manual overrides.

**Service method to add:**

```typescript
/**
 * Get user permissions split by source (SYSTEM vs manual)
 */
async getEffectivePermissions(userId: string): Promise<{
  system: Array<{ module: string; level: number; name: string }>;
  manual: Array<{ module: string; level: number; name: string; grantedBy: string }>;
  effective: Array<{ module: string; level: number; source: 'SYSTEM' | 'MANUAL' | 'BOTH' }>;
}> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      userPermissions: { include: { permission: true } },
    },
  });

  if (!user) throw new NotFoundError('User', userId);

  const system: Array<{ module: string; level: number; name: string }> = [];
  const manual: Array<{ module: string; level: number; name: string; grantedBy: string }> = [];

  for (const up of user.userPermissions) {
    if (up.grantedBy === 'SYSTEM' || up.grantedBy === null) {
      system.push({
        module: up.permission.module,
        level: up.permission.level,
        name: up.permission.name,
      });
    } else {
      manual.push({
        module: up.permission.module,
        level: up.permission.level,
        name: up.permission.name,
        grantedBy: up.grantedBy,
      });
    }
  }

  // Compute effective: highest level per module with source attribution
  const modules = new Set([
    ...system.map(s => s.module),
    ...manual.map(m => m.module),
  ]);

  const effective: Array<{ module: string; level: number; source: 'SYSTEM' | 'MANUAL' | 'BOTH' }> = [];
  for (const mod of modules) {
    const sysLevel = system.filter(s => s.module === mod).reduce((max, s) => Math.max(max, s.level), 0);
    const manLevel = manual.filter(m => m.module === mod).reduce((max, m) => Math.max(max, m.level), 0);
    const maxLevel = Math.max(sysLevel, manLevel);

    let source: 'SYSTEM' | 'MANUAL' | 'BOTH';
    if (sysLevel > 0 && manLevel > 0) source = 'BOTH';
    else if (manLevel > 0) source = 'MANUAL';
    else source = 'SYSTEM';

    effective.push({ module: mod, level: maxLevel, source });
  }

  return { system, manual, effective };
}
```

**Controller handler:**

```typescript
export const getEffectivePermissions = async (req: Request, res: Response) => {
  try {
    const result = await userService.getEffectivePermissions(req.params.id as string);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

**Route registration** (add before the generic `:id` route or use specific path):

```typescript
router.get('/:id/effective-permissions', validateRequest(UserIdParamSchema, 'params'), getEffectivePermissions);
```

---

## 7. Frontend Changes

### 7.E Update `Users.tsx` Permission Modal

**File:** `frontend/src/pages/Users.tsx`

**Current behavior:** The `PermissionModal` shows a single dropdown per module. All permissions are treated identically.

**New behavior:** Two-section display:

#### Section 1: "Entra Group Baseline" (read-only)
- Shows permissions where `source === 'SYSTEM'`
- Each module shows the SYSTEM-granted level with a lock icon and "From Entra" badge
- Non-editable

#### Section 2: "Manual Overrides" (editable)
- For each module, show a dropdown that starts at one level ABOVE the SYSTEM baseline
- If SYSTEM grants TECH L1, the dropdown options start at L2 and L3 (or "No Override" which removes the manual record)
- If no SYSTEM grant exists for a module, the full range is available

**Implementation:**

1. **Add a hook/query** to fetch effective permissions when the modal opens:
   ```typescript
   // In hooks/queries/useUsers.ts — add:
   export function useEffectivePermissions(userId: string) {
     return useQuery({
       queryKey: ['users', userId, 'effective-permissions'],
       queryFn: () => userService.getEffectivePermissions(userId),
       enabled: !!userId,
     });
   }
   ```

2. **Add service method** to `userService.ts`:
   ```typescript
   async getEffectivePermissions(userId: string): Promise<{
     system: Array<{ module: string; level: number; name: string }>;
     manual: Array<{ module: string; level: number; name: string; grantedBy: string }>;
     effective: Array<{ module: string; level: number; source: 'SYSTEM' | 'MANUAL' | 'BOTH' }>;
   }> {
     const response = await api.get(`/users/${userId}/effective-permissions`);
     return response.data;
   }
   ```

3. **Update `UserPermission` type** in `frontend/src/services/userService.ts`:
   ```typescript
   export interface UserPermission extends Permission {
     module: string;
     grantedAt: string;
     grantedBy?: string;   // ← ADD this field
     expiresAt?: string;
   }
   ```

4. **Modify `PermissionModal` component:**

```tsx
const PermissionModal: React.FC<PermissionModalProps> = ({
  user,
  permissions,  // available permissions by module
  onSave,
  onClose,
  isSaving,
}) => {
  const { data: effectivePerms, isLoading: loadingEffective } = useEffectivePermissions(user.id);
  
  // Manual override selections
  const [overrides, setOverrides] = useState<{ [module: string]: number | null }>({});

  // Initialize overrides from the MANUAL permissions only
  useEffect(() => {
    if (!effectivePerms) return;
    const initial: { [module: string]: number | null } = {};
    for (const m of effectivePerms.manual) {
      initial[m.module] = m.level;
    }
    setOverrides(initial);
  }, [effectivePerms]);

  // Get SYSTEM baseline level for a module
  const getSystemLevel = (module: string): number => {
    if (!effectivePerms) return 0;
    return effectivePerms.system
      .filter(s => s.module === module)
      .reduce((max, s) => Math.max(max, s.level), 0);
  };

  const handleSubmit = () => {
    // Only send overrides that are above the SYSTEM baseline
    const overrideArray = Object.entries(overrides)
      .filter(([module, level]) => {
        if (level === null) return false;
        return level > getSystemLevel(module);
      })
      .map(([module, level]) => ({ module, level: level! }));
    onSave(overrideArray);
  };

  // For each module, show:
  // 1. The SYSTEM baseline (read-only, with lock icon)
  // 2. Dropdown for manual override (only levels ABOVE baseline)
  return (
    <div>
      {Object.entries(permissions).map(([module, perms]) => {
        const sysLevel = getSystemLevel(module);
        const sysName = effectivePerms?.system.find(
          s => s.module === module
        )?.name;

        return (
          <div key={module}>
            <label>{module.replace(/_/g, ' ')}</label>
            
            {/* SYSTEM baseline display */}
            {sysLevel > 0 && (
              <div className="entra-baseline">
                🔒 Entra Baseline: Level {sysLevel} — {sysName}
              </div>
            )}
            
            {/* Manual override dropdown */}
            <select
              value={overrides[module] ?? ''}
              onChange={(e) => setOverrides(prev => ({
                ...prev, 
                [module]: e.target.value ? parseInt(e.target.value) : null,
              }))}
              disabled={isSaving}
            >
              <option value="">
                {sysLevel > 0 ? 'No Override (use Entra)' : 'No Access'}
              </option>
              {perms
                .filter(p => p.level > sysLevel)  // Only show levels above baseline
                .map(perm => (
                  <option key={perm.id} value={perm.level}>
                    {perm.name} (Override → Level {perm.level})
                  </option>
                ))}
            </select>
          </div>
        );
      })}
    </div>
  );
};
```

### 7.F Update Permission Save Logic

**Current:** Frontend sends ALL permissions (SYSTEM + manual combined).  
**New:** Frontend only sends manual overrides above the SYSTEM baseline.

The `handlePermissionSave` in Users.tsx already passes the array to `updatePermissionsMutation.mutate()`. The modal's `handleSubmit` now only includes overrides. No change to the mutation logic itself — just the data it receives.

**Behavioral change:** If an admin removes an override (setting it back to "No Override"), the corresponding module won't be in the array → the backend `updatePermissions()` won't create a manual record → only the SYSTEM record remains → the user gets the Entra baseline level.

---

## 8. Data Model

### No Schema Changes Required

The existing `grantedBy` field on `UserPermission` already distinguishes:
- `'SYSTEM'` — Entra-derived
- `null` — legacy/pre-migration data (treated as SYSTEM)
- UUID string — admin-granted manual override

### No Migration Required

The fix is purely behavioral:
1. Backend `updatePermissions()` stops deleting SYSTEM records
2. Frontend stops sending SYSTEM permissions in save requests
3. New endpoint exposes the split view

### Data Cleanup Consideration

After deploying the fix, some users may have "orphaned" admin-UUID records that duplicate SYSTEM records at the same level. These are harmless (the middleware takes the max) but could be cleaned up:

```sql
-- Optional cleanup: remove manual records that duplicate SYSTEM grants at same module+level
DELETE FROM user_permissions up1
WHERE up1.granted_by IS NOT NULL 
  AND up1.granted_by != 'SYSTEM'
  AND EXISTS (
    SELECT 1 FROM user_permissions up2
    JOIN permissions p1 ON up1.permission_id = p1.id
    JOIN permissions p2 ON up2.permission_id = p2.id
    WHERE up2.user_id = up1.user_id
      AND p2.module = p1.module
      AND p2.level >= p1.level
      AND (up2.granted_by = 'SYSTEM' OR up2.granted_by IS NULL)
  );
```

This is optional and can be run manually after deployment verification.

---

## 9. Implementation Steps

### Phase 1: Backend Fix (Critical Path)

| Step | File | Change | Risk |
|------|------|--------|------|
| 1 | `backend/src/services/user.service.ts` | Replace `updatePermissions()` with SYSTEM-aware version | **HIGH** — core fix |
| 2 | `backend/src/services/user.service.ts` | Add `getEffectivePermissions()` method | LOW |
| 3 | `backend/src/controllers/user.controller.ts` | Add `getEffectivePermissions` handler | LOW |
| 4 | `backend/src/routes/user.routes.ts` | Register `GET /:id/effective-permissions` route | LOW |

### Phase 2: Frontend Enhancement

| Step | File | Change | Risk |
|------|------|--------|------|
| 5 | `frontend/src/services/userService.ts` | Add `getEffectivePermissions()` method; add `grantedBy` to `UserPermission` type | LOW |
| 6 | `frontend/src/hooks/queries/useUsers.ts` | Add `useEffectivePermissions()` hook | LOW |
| 7 | `frontend/src/pages/Users.tsx` | Refactor `PermissionModal` for two-section display | MEDIUM |

### Phase 3: Testing & Verification

| Step | Action |
|------|--------|
| 8 | Test: Admin saves permissions → verify SYSTEM records untouched in DB |
| 9 | Test: User logs in after admin save → verify no duplicate records |
| 10 | Test: Admin sets override above SYSTEM → verify both records coexist |
| 11 | Test: Admin removes override → verify only SYSTEM record remains |
| 12 | Test: Entra group change → verify SYSTEM records update correctly |
| 13 | Test: Frontend modal shows correct baseline/override split |

### Implementation Order

```
Step 1 (backend fix) → Step 8-12 (backend tests) → Steps 2-4 (new endpoint)
→ Steps 5-7 (frontend) → Step 13 (frontend tests) → Deploy
```

The backend fix (Step 1) is independently deployable and fixes the core bug immediately. The frontend and endpoint changes are UI enhancements that can follow.

---

## 10. Security Considerations

### Existing Protections (Verified, No Changes Needed)

| Control | Implementation | Status |
|---------|---------------|--------|
| **Authentication** | JWT middleware (`authenticate`) on all user routes | ✅ |
| **Authorization** | `requireAdmin` middleware — only ADMIN role can modify permissions | ✅ |
| **CSRF** | `validateCsrfToken` middleware on all state-changing routes | ✅ |
| **Input Validation** | Zod schema validates `permissions` array structure | ✅ |
| **SQL Injection** | Prisma ORM parameterizes all queries | ✅ |
| **Rate Limiting** | Applied at Express middleware layer | ✅ |

### New Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Admin cannot downgrade SYSTEM permissions** | By design — `updatePermissions()` only creates records ABOVE the SYSTEM baseline. The SYSTEM records are immutable from the admin UI. |
| **Admin cannot spoof `grantedBy = 'SYSTEM'`** | The `grantedBy` value is set server-side from `req.user.id`, never from request body. An admin's UUID will never equal the string `'SYSTEM'`. |
| **New endpoint access control** | `GET /:id/effective-permissions` inherits the `authenticate` + `requireAdmin` middleware from the router-level `router.use()`. |
| **Logging** | Permission changes are logged via structured logger. The `grantedBy` field provides a full audit trail. Never log PII beyond userId. |
| **Privilege escalation via manual override** | Only ADMINs can create overrides. ADMINs already bypass `checkPermission()` entirely, so they inherently have the highest access. A non-admin cannot reach the `updatePermissions` endpoint. |
| **Transaction isolation** | Both sync and update run inside `$transaction`. Prisma uses PostgreSQL serializable transactions by default, preventing race conditions between concurrent sync + admin save. |

---

## 11. Testing Strategy

### Unit Tests

#### Test 1: `updatePermissions` preserves SYSTEM records
```
Setup: User has [TECH L1 grantedBy=SYSTEM, MAINT L1 grantedBy=SYSTEM]
Action: updatePermissions(userId, [{ TECH, 2 }], adminId)
Assert: 
  - TECH L1 grantedBy=SYSTEM still exists
  - TECH L2 grantedBy=adminId created
  - MAINT L1 grantedBy=SYSTEM still exists (untouched)
```

#### Test 2: `updatePermissions` skips override at or below SYSTEM level
```
Setup: User has [TECH L2 grantedBy=SYSTEM]
Action: updatePermissions(userId, [{ TECH, 1 }, { TECH, 2 }], adminId)
Assert: No manual records created (both ≤ SYSTEM L2)
```

#### Test 3: `updatePermissions` removes previous manual overrides
```
Setup: User has [TECH L1 grantedBy=SYSTEM, TECH L3 grantedBy=prevAdmin]
Action: updatePermissions(userId, [{ TECH, 2 }], newAdmin)
Assert:
  - TECH L1 grantedBy=SYSTEM still exists
  - TECH L3 grantedBy=prevAdmin DELETED
  - TECH L2 grantedBy=newAdmin created
```

#### Test 4: `updatePermissions` with empty array removes all manual overrides
```
Setup: User has [TECH L1 grantedBy=SYSTEM, TECH L3 grantedBy=admin]
Action: updatePermissions(userId, [], adminId)
Assert:
  - TECH L1 grantedBy=SYSTEM still exists
  - TECH L3 grantedBy=admin DELETED
```

#### Test 5: Sync + admin cycle produces no duplicates
```
Setup: User has no permissions
Action 1: syncPermissionsForUser(userId, [{ TECH, 1 }])
Action 2: updatePermissions(userId, [{ TECH, 2 }], adminId)
Action 3: syncPermissionsForUser(userId, [{ TECH, 1 }])
Assert:
  - Exactly 2 UserPermission records: [TECH L1 SYSTEM, TECH L2 adminId]
  - No duplicates
```

#### Test 6: `getEffectivePermissions` returns correct split
```
Setup: User has [TECH L1 grantedBy=SYSTEM, TECH L3 grantedBy=admin, MAINT L2 grantedBy=SYSTEM]
Assert:
  - system: [{ TECH, 1 }, { MAINT, 2 }]
  - manual: [{ TECH, 3 }]
  - effective: [{ TECH, 3, BOTH }, { MAINT, 2, SYSTEM }]
```

### Integration Tests

#### Test 7: Full login → admin edit → re-login cycle
```
1. Create user, assign to Entra group with TECH L1
2. Trigger syncPermissionsForUser → verify SYSTEM record created
3. Admin edits permissions: TECH L2 override
4. Verify DB: TECH L1 SYSTEM + TECH L2 admin
5. User logs in again → syncPermissionsForUser
6. Verify DB: Still exactly TECH L1 SYSTEM + TECH L2 admin (no duplicates)
7. checkPermission('TECHNOLOGY', 2) → passes ✓
8. checkPermission('TECHNOLOGY', 3) → fails ✗
```

#### Test 8: Entra group removal propagation
```
1. User has [TECH L1 SYSTEM, TECH L2 admin]
2. User removed from Entra group → sync runs with permissions=[]
3. Verify: TECH L1 SYSTEM deleted, TECH L2 admin preserved
4. checkPermission('TECHNOLOGY', 2) → passes ✓ (manual override still active)
5. Admin removes override → updatePermissions([], adminId)
6. Verify: No permissions remain → user has no TECH access
```

### Frontend Tests

#### Test 9: Permission modal displays correct sections
```
Given: User has TECH L1 from SYSTEM, MAINT L2 from admin
When: Admin opens permission modal
Then:
  - TECH section shows "🔒 Entra Baseline: Level 1" (read-only)
  - TECH dropdown only shows L2 and L3 options
  - MAINT section shows "No Entra Baseline" 
  - MAINT dropdown shows L2 selected as override
```

#### Test 10: Save only sends overrides
```
Given: User has TECH L1 from SYSTEM, admin selects TECH L2 override
When: Admin clicks Save
Then: API receives { permissions: [{ module: 'TECHNOLOGY', level: 2 }] }
  - NOT [{ module: 'TECHNOLOGY', level: 1 }, { module: 'TECHNOLOGY', level: 2 }]
```

---

## 12. Risks & Mitigations

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| 1 | **Existing corrupted data** — users with admin-UUID records that should be SYSTEM | Medium | High (already happening) | Harmless post-fix (middleware takes max). Optional SQL cleanup script above. |
| 2 | **Race condition between sync and admin save** | Low | Low | Both use `$transaction`. PostgreSQL serializable isolation prevents conflicts. |
| 3 | **Admin confusion** — new UI behavior different from old | Medium | Medium | Clear visual distinction (lock icon, "From Entra" badge). Tooltip explanations. |
| 4 | **Admin cannot lower Entra-granted permissions** | Low | Low | By design. If an admin needs to restrict a user, they should modify the Entra group membership in the Entra admin center, not in the app. |
| 5 | **Legacy null grantedBy records** | Low | Medium | Both sync and updatePermissions treat `null` as SYSTEM. The sync's delete clause already handles `grantedBy: null`. |
| 6 | **Rollback complexity** | Low | Low | The fix is backward-compatible. Reverting `updatePermissions()` to the old delete-all behavior would reintroduce the bug but not break the data model. |
| 7 | **Performance** — extra query for SYSTEM grants in updatePermissions | Negligible | N/A | One additional `findMany` query inside an existing transaction. Negligible for a single-user operation. |

---

## Summary

### Files to Modify

| File | Type | Change Description |
|------|------|-------------------|
| `backend/src/services/user.service.ts` | **MODIFY** | Fix `updatePermissions()` + add `getEffectivePermissions()` |
| `backend/src/controllers/user.controller.ts` | **MODIFY** | Add `getEffectivePermissions` handler |
| `backend/src/routes/user.routes.ts` | **MODIFY** | Register new GET route |
| `frontend/src/services/userService.ts` | **MODIFY** | Add `getEffectivePermissions()` + update `UserPermission` type |
| `frontend/src/hooks/queries/useUsers.ts` | **MODIFY** | Add `useEffectivePermissions` hook |
| `frontend/src/pages/Users.tsx` | **MODIFY** | Refactor `PermissionModal` for dual-section display |

### Files Verified (No Changes Needed)

| File | Reason |
|------|--------|
| `backend/src/services/userSync.service.ts` | Already correctly preserves manual overrides |
| `backend/src/middleware/permissions.ts` | Already picks highest level across all sources |
| `backend/prisma/schema.prisma` | `grantedBy` field already distinguishes sources |
| `backend/src/validators/user.validators.ts` | Schema already accepts the needed format |
| `frontend/src/types/roles.types.ts` | Role profiles are unaffected |
| `frontend/src/pages/ManageRoles.tsx` | Role profile management is separate |

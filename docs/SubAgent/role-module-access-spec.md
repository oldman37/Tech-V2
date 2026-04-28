# Role-Level Module Access Defaults — Implementation Specification

> **Document type:** Research & specification (Phase 1 output)  
> **Author:** Research subagent  
> **Date:** 2026-03-13  
> **Target files:** `backend/src/middleware/permissions.ts`, `backend/prisma/seed.ts`, `backend/src/services/user.service.ts`, `docs/PERMISSIONS_AND_ROLES.md`

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Proposed Approach — Decision Rationale](#2-proposed-approach--decision-rationale)
3. [Role → Module → Level Mapping Table](#3-role--module--level-mapping-table)
4. [Middleware Changes (`permissions.ts`)](#4-middleware-changes-permissionsts)
5. [Seed Changes](#5-seed-changes)
6. [Service Changes (`user.service.ts`)](#6-service-changes-userservicets)
7. [DB Migration Assessment](#7-db-migration-assessment)
8. [PERMISSIONS_AND_ROLES.md Update](#8-permissions_and_rolesmd-update)
9. [Interaction with `syncUser` / Entra Login](#9-interaction-with-syncuser--entra-login)
10. [Edge Cases & Risks](#10-edge-cases--risks)

---

## 1. Current State Analysis

### What Exists

**Two-layer access control:**

| Layer | Storage | Logic |
|-------|---------|-------|
| Application Role | `users.role` string — `ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER` | Set on first login from Entra group mapping; manual admin override via `PUT /api/users/:id/role` |
| Module Permission | `user_permissions` join table → `permissions` table | 0–N records per user; each pairs a module + level |

**`checkPermission` middleware (current logic, `permissions.ts` lines 47–144):**

```
1. If role === 'ADMIN' → short-circuit; set permLevel=6; next()
2. Query ALL UserPermission rows for userId (no module filter in the DB query)
3. Find any UP where permission.module === module AND permission.level >= requiredLevel
4. If none found → 403
5. Also check expiresAt (a second loop/find)
6. Compute highestLevel across non-expired records for the module
7. Set req.user.permLevel = highestLevel
8. next()
```

**Current Pain Points:**

1. **`MANAGER`, `TECHNICIAN`, `VIEWER` have zero inherent module access.** A newly created user (or one who falls through the `*(no match)*` Entra case, returning `role: 'VIEWER', permissions: []`) has a role of `VIEWER` but **no `UserPermission` rows** — they get 403 on all module-protected routes including `GET /inventory` (TECHNOLOGY ≥ 1).

2. **One-shot Entra sync overwrites manual grants.** `syncUserPermissions()` in `userSync.service.ts` calls `prisma.userPermission.deleteMany` then re-creates from the Entra-derived list. Any admin-manual grant is silently wiped on next login. This is documented in `PERMISSIONS_AND_ROLES.md §12` as a known quirk but not mitigated.

3. **Role change does not update permissions.** `UserService.updateRole()` only writes `users.role`; no permission adjustment happens. A user promoted from `VIEWER` to `TECHNICIAN` still has whatever `UserPermission` rows they had before — possibly none.

4. **`checkPermission` makes a broad DB query.** It fetches all permissions for the user regardless of module, then filters in memory. For a user with many permissions this is wasteful; for one with none, the query returns fast but the 403 is unavoidable.

5. **No audit/default signal.** There is no way to distinguish "user has TECHNOLOGY:1 because they are a VIEWER" from "TECHNOLOGY:1 was manually granted by admin" — they look identical as `UserPermission` rows.

### What Already Exists That Is Relevant

- **`RoleProfile` / `RoleProfilePermission` tables** — seeded in `seed.ts`. These are named, apply-on-demand templates ("View Only", "General Staff", "Principal", etc.). They are **not** role-level defaults; they are manually-applied profiles, not automatically consulted during `checkPermission`.
- **`UserSyncService.getRoleFromGroups()`** — assigns both a role AND specific `UserPermission` rows at login. This is the only current mechanism for attaching permissions to a role context.

---

## 2. Proposed Approach — Decision Rationale

### Option A: Hardcoded role defaults in `permissions.ts` (inline config)

Define a `ROLE_DEFAULT_PERMISSIONS` constant map inside `permissions.ts`. When `checkPermission` finds no matching `UserPermission` row for the required module, it falls back to the role defaults before returning 403.

**Pros:**
- No DB migration required.
- No new Prisma models.
- Defaults are always consistent with code — can't drift out of sync with DB records.
- Easy to unit-test.
- No additional DB query at request time (pure in-memory lookup after the existing UP query).

**Cons:**
- Defaults are not admin-configurable via UI without a code deploy.
- Slightly less discoverable than a DB table (though documented here and in code comments).

### Option B: New `RolePermission` DB table (role-level defaults in DB)

Add a `role_permissions` table (`role`, `module`, `level`) and query it as a fallback in `checkPermission`.

**Pros:**
- Admin-configurable without a code deploy.
- Discoverable in DB introspection.

**Cons:**
- Requires a new Prisma migration + model.
- Adds a second DB query on every permission check for non-ADMIN, non-matching users (or requires caching).
- The existing `RoleProfile` pattern already covers "named permission sets"; a separate `RolePermission` table would create two overlapping concepts.
- Over-engineered for the use case: role defaults are business policy, not end-user data.

### Option C: Seed `UserPermission` rows automatically on role assignment

When a user's role is set (via Entra sync or manual), immediately create default `UserPermission` rows for their role.

**Pros:**
- No middleware change needed.
- Defaults visible in the admin permission UI.

**Cons:**
- On every Entra login, `syncUserPermissions` already overwrites all permissions — this would need to merge rather than replace, adding complexity.
- Role defaults would need to be maintained in two places: the Entra sync config and the role assignment logic.
- Permissions become indistinguishable from intentional grants.

---

### **Decision: Option A — Hardcoded config in `permissions.ts` as fallback**

**Justification:**

1. **No DB migration needed** — the highest-priority constraint given the existing schema's maturity.
2. **Fallback semantics are correct** — role defaults kick in only when no explicit `UserPermission` exists for that module. Explicit grants always win. This is the "principle of least surprise."
3. **Consistency with ADMIN short-circuit** — ADMIN already bypasses via code. This extends the same pattern to the three non-ADMIN roles.
4. **Performance** — the existing DB query for `userPermissions` already runs; the role default lookup is a pure in-memory constant map, adding ~0ms.
5. **Maintains admin override precedence** — if an admin has manually granted (or Entra sync has assigned) a different level, `userPermissions` will have a row and the fallback will not be consulted.
6. **`RoleProfile` alignment** — the default for `TECHNICIAN` matches the seeded "Tech Admin" profile and the `ENTRA_TECH_ADMIN_GROUP_ID` mapping. The `MANAGER` default matches "Principal". The `VIEWER` default matches "General Staff". The design is internally consistent.

**Semantics:** **Fallback** (not baseline minimum). If a `UserPermission` exists for the module, it supersedes the role default in all respects. The role default only applies when the UP query returns no matching record for the requested module.

---

## 3. Role → Module → Level Mapping Table

These are the **fallback defaults** — applied by `checkPermission` when the user has no `UserPermission` row for the requested module.

| Module | `ADMIN` | `MANAGER` | `TECHNICIAN` | `VIEWER` |
|--------|:-------:|:---------:|:------------:|:--------:|
| `TECHNOLOGY` | 6 (bypass) | 2 | 3 | 1 |
| `MAINTENANCE` | 6 (bypass) | 2 | 2 | 1 |
| `REQUISITIONS` | 6 (bypass) | 3 | 3 | 2 |
| `PROFESSIONAL_DEV` | 6 (bypass) | 1 | — | — |
| `SPECIAL_ED` | 6 (bypass) | — | — | — |
| `TRANSCRIPTS` | 6 (bypass) | — | — | — |

**Legend:**
- `—` = No default access; user requires an explicit `UserPermission` grant.
- `6 (bypass)` = ADMIN is already short-circuited before defaults are consulted; listed for completeness.
- All levels use `>=` semantics — a MANAGER with no explicit `UserPermission` for TECHNOLOGY satisfies any route requiring TECHNOLOGY ≥ 1 or ≥ 2, but not ≥ 3.

**Design notes per role:**

**`TECHNICIAN`** — Technology staff; full tech admin (3), school-level maintenance edit (2), and requisition supervisor capability (3). Aligns with `ENTRA_TECH_ADMIN_GROUP_ID` mapping and the seeded "Tech Admin" profile.

**`MANAGER`** — Principals/VPs/Directors who need to manage school-level inventory (2), maintenance (2), and submit/approve requisitions (3). Includes PROFESSIONAL_DEV:1 as managers may oversee PD activities. Aligns with `ENTRA_PRINCIPALS_GROUP_ID` mapping and the seeded "Principal" profile.

**`VIEWER`** — All staff baseline. View-only on inventory (1) and maintenance (1); can create and submit their own purchase orders (2). Aligns with `ENTRA_ALL_STAFF_GROUP_ID` mapping and the seeded "General Staff" profile. **Note:** PROFESSIONAL_DEV is intentionally excluded from the `VIEWER` default to match the fact that not all staff are in the All Staff Entra group; PD access should be granted explicitly or via Entra.

**`ADMIN`** — Already short-circuited at line 57–64 of `permissions.ts`; the default table is not consulted. No change.

---

## 4. Middleware Changes (`permissions.ts`)

### 4.1 Add Role Default Config

Add a `ROLE_DEFAULT_PERMISSIONS` constant **above** the `checkPermission` function. This is a pure data structure — no imports needed.

```typescript
/**
 * Default module permission levels per application role.
 *
 * These are FALLBACK values — applied only when the user has no UserPermission
 * row for the requested module. Explicit UserPermission records always take
 * precedence. ADMIN is handled by the short-circuit above and not consulted here.
 *
 * Levels use >= semantics (same as UserPermission checks):
 *   a default of 2 satisfies routes requiring level 1 or 2.
 */
export const ROLE_DEFAULT_PERMISSIONS: Partial<
  Record<string, Partial<Record<PermissionModule, number>>>
> = {
  MANAGER: {
    TECHNOLOGY: 2,
    MAINTENANCE: 2,
    REQUISITIONS: 3,
    PROFESSIONAL_DEV: 1,
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

### 4.2 Modify `checkPermission` — Fallback Logic

**Current flow after the ADMIN short-circuit (lines 68–122 of `permissions.ts`):**

```typescript
// Query all UserPermissions for userId
const userPermissions = await prisma.userPermission.findMany({ ... });

// Find matching permission for the module
const matchingPermission = userPermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
);

if (!matchingPermission) {
  throw new AuthorizationError(...);
}
```

**Proposed flow — insert role default fallback before the 403 throw:**

```typescript
// Query all UserPermissions for userId (unchanged)
const userPermissions = await prisma.userPermission.findMany({
  where: { userId },
  include: { permission: true },
});

// Find matching UserPermission for the module (unchanged)
const matchingPermission = userPermissions.find(
  (up) => up.permission.module === module && up.permission.level >= requiredLevel
);

if (!matchingPermission) {
  // --- NEW: Check role-level defaults as fallback ---
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[userRole];
  const defaultLevel = roleDefaults?.[module] ?? 0;

  if (defaultLevel >= requiredLevel) {
    logger.debug('Permission granted via role default', {
      userId,
      module,
      requiredLevel,
      userRole,
      defaultLevel,
    });
    req.user!.permLevel = defaultLevel;
    return next();
  }
  // --- END NEW ---

  logger.warn('Permission denied', {
    userId, module, requiredLevel, userRole,
  });
  throw new AuthorizationError(
    `Insufficient permissions for ${module} module (requires level ${requiredLevel})`
  );
}
```

**The `permLevel` computation at the end of the function** (lines 114–122) must also use the role default when there are no UserPermission rows for the module. The block that sets `req.user!.permLevel` after `matchingPermission` is found does not need to change — it only runs when a matching UP exists.

**Summary of all changes to `permissions.ts`:**

| What | Where | Change |
|------|-------|--------|
| Add `ROLE_DEFAULT_PERMISSIONS` constant | Above `checkPermission` function | New export |
| Insert fallback block | Inside `checkPermission`, after `if (!matchingPermission)` check, before the 403 throw | ~10 lines inserted |

**No other changes** to the function are needed. The expiry check, `highestLevel` computation, and `req.user.permLevel` assignment all remain as-is for the happy path where a UP record exists.

### 4.3 Complete Rewritten `checkPermission` Function

```typescript
export function checkPermission(module: PermissionModule, requiredLevel: PermissionLevel) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthorizationError('No user context found');
      }

      const userId = req.user.id;
      const userRole = req.user.roles?.[0] || 'VIEWER';

      // ADMIN role has access to everything (unchanged)
      if (userRole === 'ADMIN') {
        logger.debug('Admin access granted', { userId, module, requiredLevel });
        req.user!.permLevel = 6;
        return next();
      }

      // Check user permissions in database (unchanged)
      const userPermissions = await prisma.userPermission.findMany({
        where: { userId },
        include: { permission: true },
      });

      // Find matching permission for the module (unchanged)
      const matchingPermission = userPermissions.find(
        (up) => up.permission.module === module && up.permission.level >= requiredLevel
      );

      if (!matchingPermission) {
        // NEW: Role-level default fallback
        const roleDefaults = ROLE_DEFAULT_PERMISSIONS[userRole];
        const defaultLevel = roleDefaults?.[module] ?? 0;

        if (defaultLevel >= requiredLevel) {
          logger.debug('Permission granted via role default', {
            userId, module, requiredLevel, userRole, defaultLevel,
          });
          req.user!.permLevel = defaultLevel;
          return next();
        }

        logger.warn('Permission denied', {
          userId, module, requiredLevel, userRole,
        });
        throw new AuthorizationError(
          `Insufficient permissions for ${module} module (requires level ${requiredLevel})`
        );
      }

      // Check if matched permission has expired (unchanged)
      if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
        // Expired UP — retry with role default
        const roleDefaults = ROLE_DEFAULT_PERMISSIONS[userRole];
        const defaultLevel = roleDefaults?.[module] ?? 0;

        if (defaultLevel >= requiredLevel) {
          logger.debug('Expired UserPermission; falling back to role default', {
            userId, module, requiredLevel, userRole, defaultLevel,
          });
          req.user!.permLevel = defaultLevel;
          return next();
        }

        logger.warn('Expired permission', {
          userId, module, permissionId: matchingPermission.id,
        });
        throw new AuthorizationError(
          `Permission for ${module} module has expired`
        );
      }

      logger.debug('Permission granted', {
        userId, module, requiredLevel,
        userLevel: matchingPermission.permission.level,
      });

      // Compute highest non-expired level for this module (unchanged)
      const now = new Date();
      const highestLevel = userPermissions
        .filter(up =>
          up.permission.module === module &&
          (!up.expiresAt || up.expiresAt >= now)
        )
        .reduce((max, up) => Math.max(max, up.permission.level), 0);

      req.user!.permLevel = highestLevel || matchingPermission.permission.level;

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else {
        logger.error('Permission check error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user?.id, module,
        });
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to check permissions',
        });
      }
    }
  };
}
```

**Note on expired permission handling:** The current code throws a 403 immediately on an expired record even if a valid matching record also exists (it only checks `matchingPermission`, which may be the expired one). The rewrite above mirrors the existing behavior but adds a role-default fallback after the expiry 403. A more complete fix (filtering out expired records before running `find()`) is tracked as the existing edge case in `§12` of `PERMISSIONS_AND_ROLES.md` and is **out of scope** for this spec.

---

## 5. Seed Changes

**No new seed data is required.** The role defaults are entirely in-memory constants in `permissions.ts`.

However, the seeded `RoleProfile` records are directly aligned with the defaults and should be documented as the "canonical template" for what the role defaults represent. No changes needed to existing seed entries.

**Optional enhancement (not required):** A future seed addition could add a new system profile "Tech Department Staff" for a TECHNICIAN with no explicit permissions granted. This is out of scope for this implementation.

---

## 6. Service Changes (`user.service.ts`)

### 6.1 `formatUserWithPermissions` — No Change Required

The `permissions` array in `UserWithPermissions` returns only explicit `UserPermission` rows from the DB. This is correct — the role defaults are a runtime middleware concern, not a user entity property. The API response should reflect what is **stored**, not what would be **effective** at a middleware check. No change needed.

### 6.2 `updateRole()` — No Change Required (with caveat)

Currently `updateRole()` only updates `users.role`. Under the new system, changing a user's role implicitly changes their module access at the middleware level (via the `ROLE_DEFAULT_PERMISSIONS` map). This is the desired behavior — the role change takes effect immediately on the next request without any DB writes.

**Caveat:** If a user has explicit `UserPermission` rows that conflict with their new role default (e.g., a VIEWER promoted to TECHNICIAN still has VIEWER-level UPs), the explicit rows continue to win. This is acceptable — admins should clear or update permissions when promoting a user, which is consistent with the existing behavior.

**Optional enhancement (not required):** `updateRole()` could optionally clear `UserPermission` rows for modules where the new role default exceeds the existing explicit grant. This is future scope.

### 6.3 `updatePermissions()` — No Change Required

The transaction-based replace-all behavior is unchanged. An admin explicitly assigning permissions always writes `UserPermission` rows, which will supersede the role defaults.

### 6.4 `getAvailablePermissions()` — No Change Required

Returns active `Permission` rows from the DB. Not affected by role defaults.

### 6.5 Potential New Helper: `getEffectivePermissions(userId, role)` (Optional, Future)

If the admin UI needs to show "effective" access (DB grants + role defaults merged), a helper could be added to `user.service.ts`:

```typescript
async getEffectivePermissions(userId: string, role: string): Promise<Record<PermissionModule, number>> {
  // 1. Get stored UserPermission rows
  // 2. Start with role defaults from ROLE_DEFAULT_PERMISSIONS[role]
  // 3. Merge: explicit DB levels override defaults
  // 4. Return merged map
}
```

This is **out of scope** for this implementation sprint but is the right place for it.

---

## 7. DB Migration Assessment

**No DB migration is needed.**

The `ROLE_DEFAULT_PERMISSIONS` map is a pure TypeScript constant in the middleware. The existing schema needs no changes:

- No new tables.
- No new columns.
- No changes to existing indexes, constraints, or foreign keys.
- No Prisma schema file modification.
- No `prisma migrate dev` or `prisma migrate deploy` required.

The existing `RoleProfile` / `RoleProfilePermission` tables remain untouched and continue to serve their purpose as apply-on-demand permission templates in the admin UI.

---

## 8. `PERMISSIONS_AND_ROLES.md` Update

### Section 2 — Application Roles

The current text in §2 reads:

> `MANAGER` | No | No | Principals, VPs, Directors, Supervisors  
> `TECHNICIAN` | No | No | Technology dept staff  
> `VIEWER` | No | No | All staff (default), Students

**Updated §2 Application Roles table** should read:

```markdown
| Role | Bypasses Module Checks | Default Module Access | Admin UI Access | Typical Users |
|------|:----------------------:|----------------------|:---------------:|---------------|
| `ADMIN` | **Yes** — effective `permLevel = 6` everywhere | N/A (bypass) | Yes | System administrators, Technology Director |
| `MANAGER` | No | TECH:2, MAINT:2, REQ:3, PROF_DEV:1 | No | Principals, VPs, Directors, Supervisors |
| `TECHNICIAN` | No | TECH:3, MAINT:2, REQ:3 | No | Technology dept staff |
| `VIEWER` | No | TECH:1, MAINT:1, REQ:2 | No | All staff (default), Students |
```

And add this explanatory note after the table:

```markdown
> **Role Default Access:** `MANAGER`, `TECHNICIAN`, and `VIEWER` roles have built-in module
> access defaults defined in `ROLE_DEFAULT_PERMISSIONS` in `permissions.ts`. These defaults act
> as a **fallback** — applied when a user has no explicit `UserPermission` row for the requested
> module. Explicit `UserPermission` records (set by Entra group sync or admin override) always
> take precedence over role defaults.

> **`PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS`:** These modules have no role-level default
> for `TECHNICIAN` or `VIEWER`. Users must have explicit `UserPermission` grants (via Entra group
> membership or admin UI) to access these modules.
```

### Section 5 — How Permissions Are Checked

The step-by-step flow in §5 should be updated to reflect the new fallback step:

```
5. Query DB: SELECT all UserPermission records for this user
       including the related Permission row
6. Find any record where
       permission.module === module
       AND permission.level >= requiredLevel
       AND (expiresAt IS NULL OR expiresAt > now)
7. If no matching UserPermission record found:
       → Look up ROLE_DEFAULT_PERMISSIONS[userRole][module]
       → If defaultLevel >= requiredLevel:
             set req.user.permLevel = defaultLevel; call next()
       → Else → 403 AuthorizationError
8. (If matching record found) Check expiresAt; if expired → same role default fallback → else 403
9. Compute highestLevel = max of all non-expired permission levels for this module
10. Set req.user.permLevel = highestLevel; call next()
```

### Section 12 — Edge Cases

Add a new subsection:

```markdown
### Role Default Permissions (New in v2.x)

`ROLE_DEFAULT_PERMISSIONS` in `permissions.ts` defines fallback levels per role per module.
These take effect when the user has no `UserPermission` row for the checked module.

**Key behaviors:**
- Role defaults are **not stored in the DB** — they live in code.
- An explicit `UserPermission` row always wins over the role default, regardless of level.
- `ADMIN` is unaffected — it short-circuits before defaults are consulted.
- `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS` have no default for `TECHNICIAN` or `VIEWER`.
  Users need explicit grants for these modules.
- When `syncUser()` assigns Entra-derived `UserPermission` rows (e.g., TECH:1 for VIEWER via
  All Staff group), those rows now override the role default of TECH:1 — which is fine since
  they are equal. If an Entra group grants a lower level than the role default, the explicit UP
  still wins. Admins should be aware of this when configuring Entra group permission mappings.
```

---

## 9. Interaction with `syncUser` / Entra Login

### Current `syncUser` behavior (from `userSync.service.ts`):

1. Fetches user from Graph API.
2. Calls `getRoleFromGroups(groupIds)` → returns `{ role, permissions }`.
3. Upserts the user row (`role` only set on `create`, not update — role drift is possible).
4. Calls `syncUserPermissions(userId, permissions)` → **deletes all UP rows**, then re-creates from the Entra-derived list.

### Impact of Role Defaults on `syncUser`:

- When a user **matches an Entra group** (e.g., `ENTRA_ALL_STAFF_GROUP_ID`), `syncUserPermissions` creates explicit UP rows (TECH:1, MAINT:1, REQ:2). These explicit rows supersede the VIEWER role defaults for those modules — **no conflict**, the values are identical by design.
- When a user **matches no Entra group** (default fallback returns `role: 'VIEWER', permissions: []`), the `syncUserPermissions` call creates zero UP rows. Previously this resulted in a 403 on all module routes. **With the new defaults**, the VIEWER role default (TECH:1, MAINT:1, REQ:2) will apply — the user gets baseline access. This is the primary problem being solved.
- When a user has an Entra group with **higher permissions than the role default** (e.g., TECH:3 for TECHNICIAN), the explicit UP wins — the default of TECH:3 would also win, but this doesn't matter.
- When an **admin manually changes a user's role** (without touching Entra groups), the new role default takes effect on the next request. If the user then logs in again, `syncUser` rebuilds permissions from Entra groups (potentially re-lowering them). This is the pre-existing sync conflict described in §12 and is unaffected by this change.

**No changes are needed to `userSync.service.ts`.**

---

## 10. Edge Cases & Risks

### 10.1 `VIEWER` with REQUISITIONS:2 Default — Intended Access Level

The VIEWER default includes `REQUISITIONS: 2` (General User — can create and submit own POs). This is intentional and matches the `ENTRA_ALL_STAFF_GROUP_ID` mapping. However, it means that a user with `role: 'VIEWER'` and no UP rows can create POs. If there is a use case for "pure read-only viewer who cannot create POs," they must be explicitly granted `REQUISITIONS: 1` via a UP record.

**Mitigation:** Document this in §2 of `PERMISSIONS_AND_ROLES.md` (covered in §8 above).

### 10.2 `TECHNICIAN` Default TECHNOLOGY:3 — Admin Operations

A TECHNICIAN with no explicit UP rows gets TECHNOLOGY:3 by role default, which allows bulk imports and potentially destructive operations (see §4 of `PERMISSIONS_AND_ROLES.md`). This is intentional — TECHNICIAN role is for technology department staff who need full tech access.

**Mitigation:** Ensure that `TECHNICIAN` role is granted only to appropriate users. The role assignment is controlled by `PUT /api/users/:id/role` which requires ADMIN.

### 10.3 `permLevel` Set to Role Default — Controller Scoping

Some controllers use `req.user.permLevel` for row-level scoping (e.g., a REQUISITIONS level-1 user sees only own POs). When the role default path is taken, `req.user.permLevel` is set to the role default level. This is correct — a VIEWER user with default REQUISITIONS:2 should be scoped as a level-2 user (can see all their own POs but not others').

Controllers must not assume `req.user.permLevel` implies an explicit UP row exists. They should only use its numeric value for scoping decisions. Current controller implementations already treat `permLevel` as a pure number, so this is safe.

### 10.4 No change to `PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS` for VIEWER/TECHNICIAN

These modules remain access-denied for VIEWER and TECHNICIAN by default, unchanged from the current behavior. This is intentional — they are sensitive modules.

### 10.5 Expired UP + No Role Default

If a user has an expired UP for a module where the role default provides no access (e.g., a VIEWER with an expired TRANSCRIPTS:1 grant), they get a 403. This is the correct and safe behavior.

### 10.6 Existing Users with Zero UP Rows

Users created via `syncUser` who fell through to the default `permissions: []` currently get 403 on all routes. After this change they will get VIEWER defaults. This is a **breaking behavior change for the better** — these users gain read-only baseline access. Admins should be aware that previously locked-out users will now have access.

---

## Summary for Implementation Subagent

### Files to Modify

| File | Change Summary |
|------|----------------|
| `backend/src/middleware/permissions.ts` | Add `ROLE_DEFAULT_PERMISSIONS` constant; insert fallback block in `checkPermission` before the 403 throw; add fallback to expired-UP path |
| `docs/PERMISSIONS_AND_ROLES.md` | Update §2 table, update §5 flow, add §12 subsection for role defaults |

### Files That Do NOT Need Changes

| File | Reason |
|------|--------|
| `backend/prisma/schema.prisma` | No new models needed |
| `backend/prisma/seed.ts` | No new seed data needed |
| `backend/src/services/user.service.ts` | No service changes needed |
| `backend/src/services/userSync.service.ts` | No sync changes needed |
| `backend/src/controllers/user.controller.ts` | No controller changes needed |
| `backend/src/routes/user.routes.ts` | No route changes needed |

### Zero Database Impact

- No migration file to generate or apply.
- No `prisma migrate dev` required.
- No seeded data changes.

### Minimal Code Delta

The total implementation is approximately **30 lines** of new TypeScript added to `permissions.ts` and a small update to `PERMISSIONS_AND_ROLES.md`. No other files require modification.

# Permission / Role Assignment Bug — Investigation Spec

**Status:** Research Complete  
**Date:** 2026-03-18  
**Reported By:** Engineering  
**Affected User:** rdevices@ocboe.com (Finance Director)  
**Symptom:** User is in the "Finance Director" Entra group but does not receive Finance Director permissions (REQUISITIONS level 5) in the application.

---

## 1. How the Permission System Works

### 1.1 Auth Flow (Login)

```
User logs in via MSAL OAuth
  ↓
auth.controller.ts:callback()
  ↓
  1. Exchange auth code for access token via MSAL
  2. Call /me/memberOf on Microsoft Graph (returns DIRECT group memberships only)
  3. Collect groupIds[]
  4. new UserSyncService(prisma, graphClient).getRoleFromGroups(groupIds[])
       → walks groupRoleMappings Map (built from process.env ENTRA_*_GROUP_ID vars)
       → merges permissions from ALL matching groups (takes highest level per module)
       → returns { role: 'ADMIN'|'USER', permissions: PermissionMapping[] }
  5. Upsert User record in DB with determined role
  6. syncPermissionsForUser(user.id, permissions)
       → DELETE all existing SYSTEM-granted UserPermission rows for this user
       → For each permission: find Permission row by (module, level) in DB
       → If isActive=true AND no duplicate: INSERT UserPermission with grantedBy='SYSTEM'
  7. Issue JWT containing: { id, entraId, email, roles: [user.role], groups: groupIds }
```

### 1.2 Per-Request Permission Check

```
checkPermission(module, requiredLevel)  [middleware/permissions.ts]
  ↓
  1. If req.user.roles[0] === 'ADMIN' → bypass all module checks (permLevel = 6)
  2. Query UserPermission table: WHERE userId = req.user.id (all modules)
  3. Find any record where permission.module === module AND permission.level >= requiredLevel
  4. If none found → 403 Forbidden
  5. Compute highestLevel = max non-expired level for this module
  6. Set req.user.permLevel = highestLevel → passed to controller for row-level scoping
```

### 1.3 Finance Director Workflow

- Finance Director approval action: `POST /api/purchase-orders/:id/approve`
- Route guard: `checkPermission('REQUISITIONS', 3)` (level 3 minimum)
- Controller branches internally by `req.user.permLevel`:
  - `permLevel === 3` → Supervisor stage
  - `permLevel >= 5` → Finance Director stage (`supervisor_approved` → `finance_director_approved`)
  - `permLevel >= 6` → Director of Schools stage
- Finance Director must have a `UserPermission` row for `REQUISITIONS:5` in the DB to:
  1. Pass the `checkPermission('REQUISITIONS', 3)` gate
  2. Have `permLevel` set to 5 (so the controller routes them correctly)

### 1.4 Frontend Permission Resolution

`useRequisitionsPermLevel` hook (`frontend/src/hooks/queries/useRequisitionsPermLevel.ts`):
- If `user.roles.includes('ADMIN')` → returns `permLevel = 6` (no DB call)
- Otherwise → calls `GET /api/users/me` to retrieve `permissions[]` from DB
- Finds highest REQUISITIONS level in returned permissions
- This value drives all Finance Director UI: "Approve as Finance Director" button visibility, "pending" tab filtering (`supervisor_approved` status), etc.

---

## 2. Bugs Found

### Bug 1 — PRIMARY: `/memberOf` returns only direct group memberships

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Files** | `backend/src/controllers/auth.controller.ts` line 116 |
| | `backend/src/services/userSync.service.ts` line 467 |
| **Impact** | All users in nested Entra groups |

**Root Cause:**  
Both the login flow and the admin-sync flow use the Microsoft Graph `/memberOf` endpoint, which only returns **direct** group memberships.

```typescript
// auth.controller.ts — line 116 (login callback)
const groupsResponse = await fetch(
  'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName',
  { headers: { 'Authorization': `Bearer ${response.accessToken}` } }
);

// userSync.service.ts — line 467 (admin sync)
const groups = await this.graphClient
  .api(`/users/${entraId}/memberOf`)
  .get();
```

If `rdevices@ocboe.com` is a member of a **sub-group** (e.g., "Finance Staff") which is itself a member of the "Finance Director" Entra group, her effective Finance Director membership is **transitive** — it will NOT appear in `/memberOf` results, only in `/transitiveMemberOf`.

**Required Fix:**  
Change both calls from `/memberOf` to `/transitiveMemberOf`:

```typescript
// auth.controller.ts — line 116
const groupsResponse = await fetch(
  'https://graph.microsoft.com/v1.0/me/transitiveMemberOf?$select=id,displayName',
  { headers: { 'Authorization': `Bearer ${response.accessToken}` } }
);

// userSync.service.ts — line 467
const groups = await this.graphClient
  .api(`/users/${entraId}/transitiveMemberOf`)
  .get();
```

> **Note:** `/transitiveMemberOf` returns all group types (groups, directory roles, etc.) mixed together. The existing code should already filter by `g['@odata.type'] === '#microsoft.graph.group'` in admin sync, and the login flow maps all returned IDs directly. Filtering is required when iterating the results of the admin sync (already done at `admin.routes.ts` line ~145: `.filter((g: any) => g['@odata.type'] === '#microsoft.graph.group')`).

---

### Bug 2 — HIGH: Possibly Wrong Group ID for Finance Director in `.env`

| Field | Value |
|-------|-------|
| **Severity** | HIGH (unverifiable without Azure access) |
| **File** | `backend/.env` line 68 |
| **Impact** | rdevices@ocboe.com only |

**Root Cause:**  
The `.env` file was populated from "Supervisors list.xlsx". If the spreadsheet contained an incorrect or stale GUID for the Finance Director group (or if the Finance Director and Finance PO Entry GUIDs were transposed), `getRoleFromGroups()` would never match the user's actual Entra group.

```ini
# backend/.env — line 68-69
ENTRA_FINANCE_DIRECTOR_GROUP_ID=5f8623ed-0afd-476d-838a-5da1730b3698
ENTRA_FINANCE_PO_ENTRY_GROUP_ID=bb379769-bd72-4c6c-abb5-4f07fb3e8115
```

**Verification Steps:**  
1. Go to Azure Portal → Entra ID → Groups
2. Search for the Finance Director group by name
3. Copy its **Object ID** 
4. Compare with `5f8623ed-0afd-476d-838a-5da1730b3698` in `.env`
5. If different, update `.env` and restart the backend

Additionally, the admin diagnostic endpoint provides real-time visibility:
```
GET /api/admin/diagnose-permissions/{userId}
```
The response includes `matchedConfiguredGroups` — if Finance Director group is missing there, the group ID is wrong.

---

### Bug 3 — CONFIRMED: `ENTRA_TECH_ADMIN_GROUP_ID` and `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` are absent from `.env`

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `backend/.env` (missing entries) |
| **Code** | `userSync.service.ts` lines 179 and 189 |
| **Impact** | All users in Tech Admin and Maintenance Admin Entra groups |

**Root Cause:**  
`userSync.service.ts` registers mappings for these two groups:

```typescript
// userSync.service.ts — line 179
addMapping('ENTRA_TECH_ADMIN_GROUP_ID', process.env.ENTRA_TECH_ADMIN_GROUP_ID, {
  role: 'USER',
  permissions: [
    { module: 'TECHNOLOGY', level: 3 },
    { module: 'MAINTENANCE', level: 2 },
    { module: 'REQUISITIONS', level: 3 },
  ],
});

// userSync.service.ts — line 189
addMapping('ENTRA_MAINTENANCE_ADMIN_GROUP_ID', process.env.ENTRA_MAINTENANCE_ADMIN_GROUP_ID, {
  role: 'USER',
  permissions: [
    { module: 'TECHNOLOGY', level: 2 },
    { module: 'MAINTENANCE', level: 3 },
    { module: 'REQUISITIONS', level: 3 },
  ],
});
```

Both `process.env.ENTRA_TECH_ADMIN_GROUP_ID` and `process.env.ENTRA_MAINTENANCE_ADMIN_GROUP_ID` are `undefined` — the variables simply don't exist in `.env`. The `addMapping` helper silently skips undefined values (`if (!groupId) return;`), so no mapping is ever registered.

**Required Fix:**  
Add the correct Entra group Object IDs to `.env`:
```ini
# Department Admin Groups — GET IDs from Azure Portal → Entra ID → Groups
ENTRA_TECH_ADMIN_GROUP_ID=<get-from-azure-portal>
ENTRA_MAINTENANCE_ADMIN_GROUP_ID=<get-from-azure-portal>
```

---

### Bug 4 — LOW: Documentation Drift — Role names don't match code

| Field | Value |
|-------|-------|
| **Severity** | LOW (docs-only, not functional) |
| **File** | `docs/PERMISSIONS_AND_ROLES.md` section 7 |
| **Code** | `userSync.service.ts` lines 7-8 |

**Root Cause:**  
`PERMISSIONS_AND_ROLES.md` describes a 4-role system (`ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER`) in Section 7's table. The actual code type is:

```typescript
// userSync.service.ts — line 7-8
type UserRole = 'ADMIN' | 'USER';
```

Finance Director is documented as receiving `MANAGER` role, but the code assigns `USER`. Since `checkPermission` only bypasses for `'ADMIN'` role, non-ADMIN users (including Finance Director) are always evaluated by module-level DB queries regardless of role name. This is not a functional bug but:
1. Misleads developers into thinking role checks matter for Finance Director access
2. The `PERMISSIONS_AND_ROLES.md` step 7a describes a `ROLE_DEFAULT_PERMISSIONS` fallback that **does not exist** in the actual `permissions.ts` code

---

### Bug 5 — LOW: Permission sync failure is silently swallowed at login

| Field | Value |
|-------|-------|
| **Severity** | LOW (defensive code concern) |
| **File** | `backend/src/controllers/auth.controller.ts` ~line 215 |

**Root Cause:**  
The login `syncPermissionsForUser` call is wrapped in a try/catch that logs the error but **does not fail login**. This is intentional (login must succeed even if permissions are stale), but it means:
- If the DB has no `REQUISITIONS:5` Permission row (e.g., `seed.ts` was not run after a migration), the sync silently skips creating that permission with no visible error
- The user logs in successfully but has no REQUISITIONS:5 `UserPermission` row
- Every subsequent `checkPermission('REQUISITIONS', 5)` call returns 403

`REQUISITIONS:5` IS correctly seeded by `seed.ts` (confirmed), so this is only a risk if seeds haven't been run.

---

## 3. Root Cause Summary for `rdevices@ocboe.com`

The most likely reason Finance Director permissions are missing is one or more of:

| Priority | Cause | Verifiable Without Azure? |
|:--------:|-------|:-------------------------:|
| 1 | **Wrong group ID**: `ENTRA_FINANCE_DIRECTOR_GROUP_ID` doesn't match the actual Azure group GUID | No — requires Azure Portal |
| 2 | **Transitive membership**: User is in Finance Director via a sub/nested group and `/memberOf` doesn't return transitive memberships | No — requires Azure Portal |
| 3 | **Stale DB**: Group ID was only recently added to `.env` and user hasn't logged in since (permissions not yet synced) | Yes — use `/api/admin/diagnose-permissions/{userId}` |

---

## 4. Exact Fixes Required

### Fix 1 — Code: Switch to `/transitiveMemberOf` (addresses Bug 1)

**File:** `backend/src/controllers/auth.controller.ts`, line 116  
**Change:** `me/memberOf` → `me/transitiveMemberOf`

**File:** `backend/src/services/userSync.service.ts`, line 467  
**Change:** `/users/${entraId}/memberOf` → `/users/${entraId}/transitiveMemberOf`

### Fix 2 — Config: Verify and correct Finance Director group ID in `.env` (addresses Bug 2)

**File:** `backend/.env`, line 68  
**Action:** Cross-check `ENTRA_FINANCE_DIRECTOR_GROUP_ID=5f8623ed-0afd-476d-838a-5da1730b3698` against Azure Portal. Update if incorrect.

### Fix 3 — Config: Add missing group IDs to `.env` (addresses Bug 3)

**File:** `backend/.env`  
**Action:** Add `ENTRA_TECH_ADMIN_GROUP_ID` and `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` with correct Azure group Object IDs.

### Fix 4 — Immediate Remediation for rdevices@ocboe.com (no re-login required)

Once Bug 1 and/or Bug 2 are fixed, trigger a permission resync for the affected user via the existing admin API:
```
POST /api/admin/resync-permissions/{userId}
```
This calls `syncPermissionsForUser` fresh (fetches current Entra groups, rebuilds UserPermission rows) without requiring the user to log out and back in.

### Fix 5 — Docs: Update `PERMISSIONS_AND_ROLES.md` (addresses Bug 4)

Update Section 7 table to reflect the actual `ADMIN | USER` role system and remove references to `MANAGER` / `TECHNICIAN` / `VIEWER` from the auto-assignment table.

---

## 5. Files Modified / To Be Modified

| File | Change Type | Bug |
|------|-------------|-----|
| `backend/src/controllers/auth.controller.ts` L116 | Code fix | Bug 1 |
| `backend/src/services/userSync.service.ts` L467 | Code fix | Bug 1 |
| `backend/.env` L68 | Config verify/fix | Bug 2 |
| `backend/.env` | Config addition | Bug 3 |
| `docs/PERMISSIONS_AND_ROLES.md` | Docs update | Bug 4 |

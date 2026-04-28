# Tech-V2 — Permissions & Roles Reference

> **Last Updated:** 2026-03-12  
> Auto-derived from [backend/src/middleware/permissions.ts](../backend/src/middleware/permissions.ts), [backend/prisma/seed.ts](../backend/prisma/seed.ts), and the route layer.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Application Roles](#2-application-roles)
3. [Permission Modules](#3-permission-modules)
4. [Permission Levels per Module](#4-permission-levels-per-module)
5. [How Permissions Are Checked](#5-how-permissions-are-checked)
6. [Middleware Stack](#6-middleware-stack)
7. [Auto-Assigned Permissions (Entra Group → Role & Permissions)](#7-auto-assigned-permissions-entra-group--role--permissions)
8. [Manual Permission Overrides](#8-manual-permission-overrides)
9. [Named Permission Profiles (Seeded)](#9-named-permission-profiles-seeded)
10. [API Route → Permission Map](#10-api-route--permission-map)
11. [Database Models](#11-database-models)
12. [Edge Cases & Known Quirks](#12-edge-cases--known-quirks)

---

## 1. Overview

The system uses a **two-layer access control model**:

| Layer | Description |
|-------|-------------|
| **Application Role** | Coarse-grained: `ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER`. Stored on the `users.role` column. Derived from Microsoft Entra ID group membership at login. |
| **Module Permission** | Fine-grained: each user holds 0–N `UserPermission` records, each pairing a **module** (e.g., `TECHNOLOGY`) with a **level** (1–6). Controls access within individual feature areas. |

The `ADMIN` role **bypasses** all module permission checks and always receives `permLevel = 6`. All other roles are subject to per-route `checkPermission(module, minLevel)` middleware.

---

## 2. Application Roles

Stored in `users.role` (string, default `"VIEWER"`). Set automatically on login from Entra group mapping, or manually by an admin via `PUT /api/users/:id/role`.

| Role | Bypasses Module Checks | Default Module Access | Admin UI Access | Typical Users |
|------|:----------------------:|----------------------|:---------------:|---------------|
| `ADMIN` | **Yes** — effective `permLevel = 6` everywhere | All modules at level 6 | Yes | System administrators, Technology Director |
| `MANAGER` | No | TECH:2, MAINT:2, REQ:3 | No | Principals, VPs, Directors, Supervisors |
| `TECHNICIAN` | No | TECH:3, MAINT:2, REQ:3 | No | Technology dept staff |
| `VIEWER` | No | TECH:1, MAINT:1, REQ:2 | No | All staff (default), Students |

> **Valid values** enforced by `UserService.updateRole()`: `['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER']`

---

## 3. Permission Modules

Six modules exist as the `PermissionModule` TypeScript union type:

| Module Key | Feature Area |
|-----------|-------------|
| `TECHNOLOGY` | Equipment inventory, assignments, brands, categories, models, vendors, funding sources |
| `MAINTENANCE` | Maintenance orders and work requests |
| `REQUISITIONS` | Purchase order creation, approval workflow, and issuance |

---

## 4. Permission Levels per Module

### TECHNOLOGY — 3 Levels

| Level | Name | What it Allows |
|:-----:|------|----------------|
| 1 | **General User** | View inventory, equipment history, assignment history, reference data (read-only) |
| 2 | **Principal / School Tech** | All Level 1 + create/edit/delete inventory items, assign/unassign equipment, manage brands/vendors/categories/models |
| 3 | **Technology Department** | All Level 2 + bulk imports, hard-delete funding sources (admin operations) |

### MAINTENANCE — 3 Levels

| Level | Name | What it Allows |
|:-----:|------|----------------|
| 1 | **General User** | View maintenance requests (own only) |
| 2 | **Principal / School Maintenance** | View + edit maintenance requests (school level) |
| 3 | **Supervisor of Maintenance** | Full oversight: view all, create, edit, close maintenance orders |

### REQUISITIONS — 6 Levels

| Level | Name | What it Allows |
|:-----:|------|----------------|
| 1 | **Viewer** | View own purchase orders only; no create or submit |
| 2 | **General User** | Create, edit, and submit own purchase orders; delete own drafts |
| 3 | **Supervisor** | Approve or reject submitted POs (Principals, VPs, Department Supervisors) |
| 4 | **PO Entry** | Assign account codes; issue final PO numbers after Director of Schools approval (Bookkeepers, Purchasing Staff) |
| 5 | **Director of Finance** | Financial approval step: `supervisor_approved` → `finance_director_approved` |
| 6 | **Director of Schools** | Final approval step: `finance_director_approved` → `dos_approved` (PO Entry then issues the PO) |

> **Legacy levels 7, 8, 9** in REQUISITIONS exist in the DB but are **deactivated** (`isActive = false`). They cannot be assigned via the admin UI and are filtered out from `getAvailablePermissions()`.

---

## 5. How Permissions Are Checked

### `checkPermission(module, requiredLevel)` — Step-by-Step

```
1. Request arrives at protected route
2. authenticate middleware has already attached req.user (JWT payload)
3. checkPermission reads req.user.roles[0]
4. If role === 'ADMIN'
       → set req.user.permLevel = 6
       → call next() immediately (NO database query)
5. Query DB: SELECT all UserPermission records for this user
       including the related Permission row
6. Find any record where
       permission.module === module
       AND permission.level >= requiredLevel
       AND (expiresAt IS NULL OR expiresAt > now)
7. If no matching record → 403 AuthorizationError
7a. If no matching UserPermission record:
       → Check ROLE_DEFAULT_PERMISSIONS[role][module]
       → If default level >= requiredLevel: set req.user.permLevel = default, call next()
       → Otherwise: 403 AuthorizationError
8. Compute highestLevel = max of all non-expired permission levels
       for this module (for row-level scoping in controllers)
9. Set req.user.permLevel = highestLevel
10. call next() — controller reads req.user.permLevel to scope data
```

**Key semantics:**
- Uses `>=` comparison — a level-3 user satisfies any check requiring level 1, 2, or 3.
- `req.user.permLevel` is set so controllers can implement row-level logic (e.g., Viewers see only their own POs; Supervisors see all POs in their scope).
- The REQUISITIONS `/approve` endpoint requires minimum level 3 but branches internally by exact `permLevel`: 3 → supervisor stage, 5 → finance director stage, 6 → Director of Schools stage.

---

## 6. Middleware Stack

### Typical Protection Chain (mutating endpoint)

```
authenticate
  → validateCsrfToken
    → validateRequest(zodSchema)
      → checkPermission(module, level)
        → controller
```

### Other Middleware

| Middleware | Gate | Applied To |
|-----------|------|------------|
| `authenticate` | Validates `access_token` cookie (or `Authorization: Bearer` header) via `jwt.verify` | All protected routes |
| `requireAdmin` | Checks `req.user.roles.includes('ADMIN')` or Entra `ADMIN` group GUID | User management, settings, sync endpoints |
| `checkPermission(module, level)` | DB query; checks module level ≥ required | All feature module routes |
| `validateCsrfToken` | `crypto.timingSafeEqual(XSRF-TOKEN cookie, x-xsrf-token header)` | POST / PUT / PATCH / DELETE |
| `validateRequest(schema, source)` | Zod validation on `body` / `params` / `query` | Schema-validated routes |

---

## 7. Auto-Assigned Permissions (Entra Group → Role & Permissions)

At login, `UserSyncService.getRoleFromGroups(groupIds[])` walks the following **priority-ordered** list. The **first matching group wins** — lower entries are ignored for users in higher-priority groups.

| Priority | Entra Group (env var) | App Role Assigned | Module Permissions Granted |
|:--------:|-----------------------|:-----------------:|---------------------------|
| 1 | `ENTRA_ADMIN_GROUP_ID` | `ADMIN` | TECH:3, MAINT:3, REQ:6 |
| 2 | `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | `ADMIN` | TECH:3, REQ:3 |
| 3 | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | `ADMIN` | TECH:2, MAINT:3, REQ:6 |
| 4 | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | `MANAGER` | TECH:2, MAINT:2, REQ:5 |
| 5 | `ENTRA_SPED_DIRECTOR_GROUP_ID` | `MANAGER` | REQ:3 |
| 6 | `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` | `MANAGER` | MAINT:3, REQ:3 |
| 7 | `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` | `MANAGER` | REQ:3, MAINT:2 |
| 8 | `ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID` | `MANAGER` | REQ:3 |
| 9 | `ENTRA_NURSE_DIRECTOR_GROUP_ID` | `MANAGER` | REQ:3 |
| 10 | `ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID` | `MANAGER` | REQ:3 |
| 11 | `ENTRA_PRINCIPALS_GROUP_ID` | `MANAGER` | TECH:2, MAINT:2, REQ:3 |
| 12 | `ENTRA_VICE_PRINCIPALS_GROUP_ID` | `MANAGER` | TECH:2, MAINT:2, REQ:3 |
| 13 | `ENTRA_TECH_ADMIN_GROUP_ID` | `TECHNICIAN` | TECH:3, MAINT:2, REQ:3 |
| 14 | `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` | `MANAGER` | TECH:2, MAINT:3, REQ:3 |
| 15 | `ENTRA_ALL_STAFF_GROUP_ID` | `VIEWER` | TECH:1, MAINT:1, REQ:2 |
| 16 | `ENTRA_ALL_STUDENTS_GROUP_ID` | `VIEWER` | TECH:1 |
| *(no match)* | — | `VIEWER` | *(none — no module permissions)* |

**Important:** Each login sync **replaces** the user's existing `UserPermission` records with the group-derived set. Manual overrides (see §8) will be overwritten on next login unless the user's Entra group membership changes.

---

## 8. Manual Permission Overrides

Admins can manually override a user's permissions via:

```
PUT /api/users/:id/permissions   (requires: ADMIN role)
```

**Body:**
```json
{
  "permissions": [
    { "module": "TECHNOLOGY", "level": 2 },
    { "module": "REQUISITIONS", "level": 3 }
  ]
}
```

**Behavior:**
1. Deletes **all** existing `UserPermission` rows for the user.
2. Resolves each `(module, level)` pair to a `permissions` table record.
3. Throws `NotFoundError` if the permission level is `isActive = false` (deactivated legacy levels).
4. Bulk-inserts new `UserPermission` rows with `grantedBy` set to the requesting admin's user ID (audit trail).

> **Warning:** Manual overrides are overwritten on next login if `syncUser()` reruns group-derived permissions. Coordinate with Entra group assignments for persistent changes.

### Role Overrides

```
PUT /api/users/:id/role          (requires: ADMIN role)
```

Changes the user's application role (`ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER`) independently of group membership.

---

## 9. Named Permission Profiles (Seeded)

These are pre-built templates stored in the system. Admins can apply them when editing a user's permissions. Dash (—) means no permission record for that module.

| Profile | TECH | MAINT | REQ | Typical Users |
|---------|:----:|:-----:|:---:|---------------|
| **View Only** | 1 | 1 | 1 | Auditors, read-only access |
| **General Staff** | 1 | 1 | 2 | All staff (default) |
| **Principal** | 2 | 2 | 3 | Principals, Vice Principals |
| **Tech Admin** | 3 | 2 | 3 | Technology dept technicians |
| **Director / Full Access** | 3 | 3 | 6 | System admins, Directors |

---

## 10. API Route → Permission Map

### Public / Auth Routes (`/api/auth`)

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/auth/login` | **Public** |
| GET | `/auth/callback` | **Public** |
| POST | `/auth/refresh-token` | **Public** |
| POST | `/auth/logout` | **Public** |
| GET | `/auth/me` | Authenticated (valid JWT only) |
| GET | `/auth/sync-users` | `ADMIN` role |

---

### User Management (`/api/users`)

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/users/search` | TECHNOLOGY ≥ 1 |
| GET | `/users` | `ADMIN` role |
| GET | `/users/supervisors/list` | `ADMIN` role |
| GET | `/users/permissions` | `ADMIN` role |
| GET | `/users/:id` | `ADMIN` role |
| GET | `/users/:userId/supervisors` | `ADMIN` role |
| POST | `/users/:userId/supervisors` | `ADMIN` role |
| DELETE | `/users/:userId/supervisors/:supervisorId` | `ADMIN` role |
| GET | `/users/:userId/supervisors/search` | `ADMIN` role |
| PUT | `/users/:id/role` | `ADMIN` role |
| PUT | `/users/:id/permissions` | `ADMIN` role |
| PUT | `/users/:id/toggle-status` | `ADMIN` role |

---

### Inventory (`/api/inventory`)

| Method | Endpoint | Min Level |
|--------|----------|:---------:|
| GET | `/inventory` | TECHNOLOGY **1** |
| GET | `/inventory/stats` | TECHNOLOGY **1** |
| GET | `/inventory/:id` | TECHNOLOGY **1** |
| GET | `/inventory/:id/history` | TECHNOLOGY **1** |
| POST | `/inventory/export` | TECHNOLOGY **1** |
| GET | `/locations/:locationId/inventory` | TECHNOLOGY **1** |
| GET | `/rooms/:roomId/inventory` | TECHNOLOGY **1** |
| POST | `/inventory` | TECHNOLOGY **2** |
| PUT | `/inventory/:id` | TECHNOLOGY **2** |
| DELETE | `/inventory/:id` | TECHNOLOGY **2** |
| POST | `/inventory/bulk-update` | TECHNOLOGY **2** |
| POST | `/inventory/import` | TECHNOLOGY **3** |
| GET | `/inventory/import` | TECHNOLOGY **3** |
| GET | `/inventory/import/:jobId` | TECHNOLOGY **3** |

---

### Equipment Assignments

| Method | Endpoint | Min Level |
|--------|----------|:---------:|
| GET | `/equipment/:id/assignment-history` | TECHNOLOGY **1** |
| GET | `/equipment/:id/current-assignment` | TECHNOLOGY **1** |
| GET | `/users/:userId/assigned-equipment` | TECHNOLOGY **1** |
| GET | `/rooms/:roomId/assigned-equipment` | TECHNOLOGY **1** |
| GET | `/my-equipment` | Authenticated only |
| POST | `/equipment/:id/assign` | TECHNOLOGY **2** |
| POST | `/equipment/:id/assign-room` | TECHNOLOGY **2** |
| POST | `/equipment/:id/unassign` | TECHNOLOGY **2** |
| POST | `/equipment/:id/transfer` | TECHNOLOGY **2** |
| POST | `/equipment/bulk-assign` | TECHNOLOGY **3** |

---

### Reference Data (Brands, Categories, Models, Vendors)

| Method | Endpoint | Min Level |
|--------|----------|:---------:|
| GET | `/brands`, `/brands/:id` | TECHNOLOGY **1** |
| POST / PUT / DELETE | `/brands` | TECHNOLOGY **2** |
| GET | `/vendors`, `/vendors/:id` | Authenticated only |
| POST / PUT / DELETE | `/vendors` | TECHNOLOGY **2** |
| GET | `/categories`, `/categories/:id` | TECHNOLOGY **1** |
| POST / PUT / DELETE | `/categories` | TECHNOLOGY **2** |
| GET | `/equipment-models`, `/equipment-models/:id` | TECHNOLOGY **1** |
| POST / PUT / DELETE | `/equipment-models` | TECHNOLOGY **2** |

---

### Funding Sources (`/api/funding-sources`)

| Method | Endpoint | Min Level |
|--------|----------|:---------:|
| GET | `/funding-sources` | TECHNOLOGY **1** |
| GET | `/funding-sources/:id` | TECHNOLOGY **1** |
| POST | `/funding-sources` | TECHNOLOGY **2** |
| PUT | `/funding-sources/:id` | TECHNOLOGY **2** |
| DELETE | `/funding-sources/:id` | TECHNOLOGY **3** (soft delete) |
| DELETE | `/funding-sources/:id/hard` | `ADMIN` role (bypasses module system) |

---

### Purchase Orders (`/api/purchase-orders`)

| Method | Endpoint | Min Level | Notes |
|--------|----------|:---------:|-------|
| GET | `/purchase-orders` | REQUISITIONS **1** | Level 1: own POs only; Level 2+: all POs |
| GET | `/purchase-orders/:id` | REQUISITIONS **1** | Level 1: own only |
| GET | `/purchase-orders/:id/pdf` | REQUISITIONS **1** | |
| GET | `/purchase-orders/:id/history` | REQUISITIONS **1** | |
| POST | `/purchase-orders` | REQUISITIONS **2** | Create draft |
| PUT | `/purchase-orders/:id` | REQUISITIONS **2** | Edit draft |
| DELETE | `/purchase-orders/:id` | REQUISITIONS **2** | Delete own draft |
| POST | `/purchase-orders/:id/submit` | REQUISITIONS **2** | Draft → Submitted |
| POST | `/purchase-orders/:id/approve` | REQUISITIONS **3** | Branches by exact `permLevel`: 3=supervisor, 5=finance director, 6=Director of Schools |
| POST | `/purchase-orders/:id/reject` | REQUISITIONS **3** | Same branching as approve |
| POST | `/purchase-orders/:id/account` | REQUISITIONS **4** | Assign account code |
| POST | `/purchase-orders/:id/issue` | REQUISITIONS **4** | Issue PO number (after DOS approval) |

#### Purchase Order Workflow — Status Transitions

```
[draft]
   ↓  (level 2: submit)
[submitted]
   ↓  (level 3: supervisor approve)
[supervisor_approved]
   ↓  (level 5: finance director approve)
[finance_director_approved]
   ↓  (level 6: Director of Schools approve)
[dos_approved]
   ↓  (level 4: PO Entry issues)
[issued]

At any stage: level ≥ 3 can reject back to [rejected]
```

---

## 11. Database Models

### `permissions` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `module` | String | `'TECHNOLOGY'` \| `'MAINTENANCE'` \| etc. |
| `level` | Int | 0–6 depending on module |
| `name` | String | Human-readable name (e.g., `"General User"`) |
| `description` | String? | Optional description |
| `isActive` | Boolean | `false` = deactivated; excluded from UI dropdowns |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Unique constraint: `(module, level)` — the composite key used by seed upserts.

---

### `user_permissions` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `userId` | String | FK → `users.id` (cascade delete) |
| `permissionId` | String | FK → `permissions.id` (cascade delete) |
| `grantedAt` | DateTime | When permission was granted |
| `grantedBy` | String? | Admin user ID (audit trail) — null for system-granted |
| `expiresAt` | DateTime? | `null` = permanent; set for time-limited access |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Unique constraint: `(userId, permissionId)` — one record per user-permission pair.

---

### `users` table (permission-relevant fields)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `entraId` | String | Unique — Microsoft Entra Object ID |
| `email` | String | Unique |
| `role` | String | `"ADMIN"` \| `"MANAGER"` \| `"TECHNICIAN"` \| `"VIEWER"` (default) |
| `isActive` | Boolean | Inactive users cannot log in |

---

## 12. Edge Cases & Known Quirks

### Expired Permissions: False 403 Risk

`checkPermission` iterates `UserPermission` records without a guaranteed sort order. If a user holds an **expired** higher-level record AND a **valid** lower-level record, the expired record may be encountered first and trigger a `403` even when the user should have access.

**Mitigation:** Expired permissions should be removed via `PUT /api/users/:id/permissions` when detected. Do not rely on expired records resolving gracefully at runtime.

---

### Login Sync Overwrites Manual Grants

`UserSyncService.syncUser()` rebuilds `UserPermission` rows from Entra group membership on every login. Any manually-granted permission (`grantedBy` set) will be overwritten.

**Mitigation:** For permanent overrides, either add the user to the correct Entra group, or use a re-sync-resistant mechanism (future enhancement).

---

### ADMIN Role: No Module Permissions Needed

An `ADMIN`-role user can access any route without having any `user_permissions` rows in the database. `checkPermission` short-circuits immediately to `permLevel = 6` for all ADMIN users.

---

### Deactivated Legacy REQUISITIONS Levels (7, 8, 9)

These exist in the DB from a prior schema iteration but are set `isActive = false` by `seed.ts`. They:
- Are invisible in the admin permission assignment UI (`getAvailablePermissions()` filters `isActive: true`)
- Cannot be assigned via `PUT /api/users/:id/permissions` (throws `NotFoundError`)
- If somehow present on an existing user, they will be treated as non-existent by `checkPermission` (no special handling — the active levels 1–6 govern all access)

---

### `permLevel` on `req.user`

After `checkPermission` runs, `req.user.permLevel` is set to the user's **highest active level** for the checked module. Controllers use this for row-level scoping:

```typescript
// Example from purchaseOrder.controller.ts
const isViewer = req.user.permLevel === 1;
const filter = isViewer ? { createdById: req.user.id } : {};
```

This means permission checks are stateless beyond the initial DB query — no second lookup is needed inside the controller for row-level decisions.

---

### Role Default Permissions as Fallback

Role defaults in `ROLE_DEFAULT_PERMISSIONS` (defined in `permissions.ts`) apply **only when no `UserPermission` row exists** for the user/module combination. Explicit `UserPermission` records (from Entra sync or admin grants) always take precedence. This means a user in the `VIEWER` role with a manually granted `REQUISITIONS:4` permission will correctly use level 4, not the default of 2.

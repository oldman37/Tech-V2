# Permissions Documentation Specification
## Tech-V2 — Tech Department Management System

**Spec Type:** Research & Documentation  
**Created:** 2026-03-12  
**Author:** Copilot Research Subagent  
**Target Output:** `docs/permissions.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Permission Architecture Overview](#2-permission-architecture-overview)
3. [Role Catalogue](#3-role-catalogue)
4. [Permission Catalogue](#4-permission-catalogue)
5. [Entra ID Group → Role Mappings](#5-entra-id-group--role-mappings)
6. [Full Permission Flow Diagrams](#6-full-permission-flow-diagrams)
7. [Database Schema for Permissions](#7-database-schema-for-permissions)
8. [Backend Enforcement Details](#8-backend-enforcement-details)
9. [Frontend Enforcement Details](#9-frontend-enforcement-details)
10. [CSRF Protection](#10-csrf-protection)
11. [Security Considerations](#11-security-considerations)
12. [Best Practices Research Findings](#12-best-practices-research-findings)
13. [Proposed Structure for Final permissions.md](#13-proposed-structure-for-final-permissionsmd)

---

## 1. Executive Summary

Tech-V2 uses a **two-layer authorization system** built on top of **Microsoft Entra ID (Azure AD)**:

**Layer 1 — Role:** A coarse-grained `role` field on the `User` model (`ADMIN | MANAGER | TECHNICIAN | VIEWER`). This is assigned automatically from the user's Entra AD group memberships at login time by `UserSyncService.getRoleFromGroups()`. Roles are embedded in the JWT and used by the `requireAdmin` middleware for blanket admin-only routes.

**Layer 2 — Module Permission:** A fine-grained `UserPermission` table (junction of `User` ↔ `Permission`). Each `Permission` record is a `(module, level)` pair. The `checkPermission(module, requiredLevel)` middleware queries this table at request time and attaches the user's highest active permission level as `req.user.permLevel` for controllers to use.

**Authentication** is handled via Microsoft Entra ID OAuth 2.0 (MSAL), producing an application-level JWT stored in an **HttpOnly cookie**. CSRF is protected via the **Double Submit Cookie pattern**.

**Key Architectural Facts:**
- `ADMIN` role **bypasses** `checkPermission` entirely — admins always get `permLevel = 5`.
- Permissions can **expire** (`expiresAt` field in `UserPermission`).
- Permissions are **granted explicitly** per user — there is no role-based default permission grant in runtime checks (defaults only come from the Entra sync at login).
- The `permLevel` attached to `req.user` lets controllers implement **row-level** visibility (e.g., REQUISITIONS level 1 sees only own POs; level 2+ sees all).

---

## 2. Permission Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                MICROSOFT ENTRA ID (Azure AD)                │
│  Groups: ADMIN, TECHNOLOGY_DIRECTOR, PRINCIPALS, etc.       │
└──────────────────────┬──────────────────────────────────────┘
                       │  OAuth 2.0 Authorization Code Flow
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              AUTH CONTROLLER (callback)                     │
│  1. Exchange code → MSAL token                              │
│  2. Fetch /me and /memberOf from Graph API                  │
│  3. UserSyncService.getRoleFromGroups(groupIds)             │
│     → returns { role, permissions[] }                       │
│  4. Upsert User record with determined role                 │
│  5. Upsert UserPermission records (optional, on sync)       │
│  6. Sign application JWT with { id, email, roles, groups }  │
│  7. Set access_token, refresh_token as HttpOnly cookies     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              JWT ACCESS TOKEN (HttpOnly Cookie)             │
│  Payload: { id, entraId, email, name, roles[], groups[] }   │
│  Expiry: env JWT_EXPIRES_IN (default 1h)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │  Every authenticated API request
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           authenticate MIDDLEWARE                           │
│  1. Read access_token from cookie (or Authorization header) │
│  2. jwt.verify() → decode payload                           │
│  3. Attach decoded payload to req.user                      │
└──────────────┬───────────────────┬─────────────────────────┘
               │                   │
               ▼                   ▼
┌──────────────────────┐  ┌────────────────────────────────────┐
│  requireAdmin        │  │  checkPermission(module, level)    │
│                      │  │                                    │
│  Checks:             │  │  1. If req.user.roles[0]==='ADMIN' │
│  req.user.roles[0]   │  │     → set permLevel=5, next()      │
│  === 'ADMIN'         │  │  2. Query UserPermission table     │
│                      │  │  3. Find matching module+level     │
│  Used for: admin-     │  │  4. Check expiresAt               │
│  only management      │  │  5. Set req.user.permLevel        │
│  routes              │  │  6. next() or 403 Forbidden        │
└──────────────────────┘  └────────────────────────────────────┘
                                          │
                                          ▼
                          ┌────────────────────────────────────┐
                          │  CONTROLLER                        │
                          │  Uses req.user.permLevel for       │
                          │  row-level visibility decisions    │
                          │  (e.g., own POs vs all POs)        │
                          └────────────────────────────────────┘
```

---

## 3. Role Catalogue

Roles are stored in `users.role` (PostgreSQL `users` table). There are **4 application roles**:

### 3.1 Role Definitions

| Role | Description | Admin UI Access | Notes |
|------|-------------|----------------|-------|
| `ADMIN` | Full system administrator | Yes — full | Bypasses all `checkPermission` checks; `requireAdmin` gates |
| `MANAGER` | Department head / director | No (unless also ADMIN group) | Typical for Principals, Directors |
| `TECHNICIAN` | Technical staff | No | Assigned to Tech/Maintenance Admin groups |
| `VIEWER` | Standard staff or student | No | Assigned to All Staff / All Students groups |

### 3.2 Valid Role Values (enforced by `UserService.updateRole`)

```typescript
const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];
```

### 3.3 Role vs Permission Relationship

The **role** controls access to the admin management UI (`requireAdmin` middleware). The **module permission level** controls access to domain data routes (`checkPermission` middleware).

An `ADMIN` role user automatically gets `permLevel = 5` for any module check — they never need explicit UserPermission records (though they may have them as fallback).

A `MANAGER` with REQUISITIONS level 3 can approve POs but cannot access `/users` or `/admin/settings`.

---

## 4. Permission Catalogue

### 4.1 Module Overview

There are **6 permission modules**:

| Module | Purpose | Active in Routes |
|--------|---------|-----------------|
| `TECHNOLOGY` | Inventory, equipment, assignments, reference data, funding sources | Yes — fully built |
| `MAINTENANCE` | Maintenance orders | Partial (models exist; routes TBD) |
| `REQUISITIONS` | Purchase orders / requisition workflow | Yes — fully built |
| `PROFESSIONAL_DEV` | Professional development tracking | Level 0/1 only; routes TBD |
| `SPECIAL_ED` | Special education access | Level 0/1 only; routes TBD |
| `TRANSCRIPTS` | Transcript access | Level 0/1 only; routes TBD |

### 4.2 TECHNOLOGY Module Levels

| Level | Name | Description | What It Unlocks |
|-------|------|-------------|----------------|
| 1 | General User | Basic technology access (view only) | GET inventory, stats, history, locations, rooms, assignment history, reference data read, funding sources read |
| 2 | Principal/School Tech | School-level technology management | All level 1 + POST/PUT/DELETE inventory (soft), create/update reference data, create/update funding sources, assign/unassign/transfer equipment |
| 3 | Technology Department | Full technology administration | All level 2 + bulk-assign equipment, import/export inventory (admin), hard-delete funding sources |

**Permission check behavior:** uses `>= requiredLevel` — a level 3 user satisfies any level 1 or level 2 check.

### 4.3 MAINTENANCE Module Levels

| Level | Name | Description |
|-------|------|-------------|
| 1 | General User | Basic maintenance requests (view only) |
| 2 | Principal/School Maintenance | School-level maintenance (view + edit) |
| 3 | Supervisor of Maintenance | Full maintenance oversight (view + edit + admin) |

### 4.4 REQUISITIONS Module Levels

| Level | Name | Description | What It Unlocks |
|-------|------|-------------|----------------|
| 1 | Viewer | View own purchase orders only (no create/submit) | GET /purchase-orders (own only), GET /purchase-orders/:id (own only), GET PDF, GET history |
| 2 | General User | Create, edit, submit own purchase orders | All level 1 + POST /purchase-orders, PUT, DELETE (draft), POST /:id/submit |
| 3 | Supervisor | Approve/reject submitted purchase orders | All level 2 + POST /:id/approve (supervisor stage), POST /:id/reject |
| 4 | Purchasing Staff | Purchasing approval; assign account codes | All level 3 checks + POST /:id/account |
| 5 | Director of Services | Final approval and PO issuance | All level 4 checks + POST /:id/issue |

**Row-level visibility:** Controllers read `req.user.permLevel`:
- Level 1: sees only own POs (`WHERE requestorId = userId`)
- Level 2+: sees all POs

### 4.5 PROFESSIONAL_DEV, SPECIAL_ED, TRANSCRIPTS Module Levels

These modules currently use only levels 0 and 1 (binary access control):

| Level | Name | Description |
|-------|------|-------------|
| 0 | No Access | No access to this module |
| 1 | Access | Module access granted |

> **Note:** Level 0 entries exist in the DB seed but are not actively enforced in routes yet. These modules are flagged for future expansion.

### 4.6 Full Permission Matrix (Seeded Records)

```
TECHNOLOGY:1   - General User
TECHNOLOGY:2   - Principal/School Tech
TECHNOLOGY:3   - Technology Department

MAINTENANCE:1  - General User
MAINTENANCE:2  - Principal/School Maintenance
MAINTENANCE:3  - Supervisor of Maintenance

REQUISITIONS:1 - Viewer
REQUISITIONS:2 - General User
REQUISITIONS:3 - Supervisor
REQUISITIONS:4 - Purchasing Staff
REQUISITIONS:5 - Director of Services

PROFESSIONAL_DEV:0 - No Access
PROFESSIONAL_DEV:1 - Access

SPECIAL_ED:0   - No Access
SPECIAL_ED:1   - Access

TRANSCRIPTS:0  - No Access
TRANSCRIPTS:1  - Access
```

Total: **14 seeded permission records** across 6 modules.

---

## 5. Entra ID Group → Role Mappings

At login, `UserSyncService.getRoleFromGroups()` inspects the user's Entra group memberships and assigns a role+permissions bundle using priority ordering.

### 5.1 Priority Resolution Order

When a user belongs to multiple groups, the **highest-priority group wins** (single-role model):

```
Priority 1  →  ENTRA_ADMIN_GROUP_ID                         → ADMIN
Priority 2  →  ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID            → ADMIN
Priority 3  →  ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID            → ADMIN
Priority 4  →  ENTRA_DIRECTOR_OF_FINANCE_GROUP_ID            → MANAGER
Priority 5  →  ENTRA_SPED_DIRECTOR_GROUP_ID                 → MANAGER
Priority 6  →  ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID           → MANAGER
Priority 7  →  ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID        → MANAGER
Priority 8  →  ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID           → MANAGER
Priority 9  →  ENTRA_NURSE_DIRECTOR_GROUP_ID                 → MANAGER
Priority 10 →  ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID     → MANAGER
Priority 11 →  ENTRA_PRINCIPALS_GROUP_ID                     → MANAGER
Priority 12 →  ENTRA_VICE_PRINCIPALS_GROUP_ID                → MANAGER
Priority 13 →  ENTRA_TECH_ADMIN_GROUP_ID                     → TECHNICIAN
Priority 14 →  ENTRA_MAINTENANCE_ADMIN_GROUP_ID              → MANAGER
Priority 15 →  ENTRA_ALL_STAFF_GROUP_ID                      → VIEWER
Priority 16 →  ENTRA_ALL_STUDENTS_GROUP_ID                   → VIEWER
```

> If no group matches, user defaults to `VIEWER` with no module permissions.

### 5.2 Detailed Group Permission Grants

| Entra Group | App Role | TECHNOLOGY | MAINTENANCE | REQUISITIONS | PROF_DEV | SPECIAL_ED | TRANSCRIPTS |
|-------------|----------|-----------|-------------|-------------|---------|-----------|------------|
| System Admin | ADMIN | 3 | 3 | 5 | 1 | 1 | 1 |
| Technology Director | ADMIN | 3 | — | 3 | — | — | — |
| Director of Schools | ADMIN | 2 | 3 | 5 | 1 | 1 | 1 |
| Director of Finance | MANAGER | 2 | 2 | 5 | 1 | — | — |
| Principals | MANAGER | 2 | 2 | 3 | 1 | — | — |
| Vice Principals | MANAGER | 2 | 2 | 3 | 1 | — | — |
| SPED Director | MANAGER | — | — | 3 | 1 | 1 | — |
| Maintenance Director | MANAGER | — | 3 | 3 | — | — | — |
| Transportation Director | MANAGER | — | 2 | 3 | — | — | — |
| Afterschool Director | MANAGER | — | — | 3 | 1 | — | — |
| Nurse Director | MANAGER | — | — | 3 | — | — | — |
| Supervisors of Instruction | MANAGER | — | — | 3 | 1 | — | — |
| Tech Admin (legacy) | TECHNICIAN | 3 | 2 | 3 | — | — | — |
| Maintenance Admin (legacy) | MANAGER | 2 | 3 | 3 | — | — | — |
| All Staff | VIEWER | 1 | 1 | 2 | 1 | — | — |
| All Students | VIEWER | 1 | — | — | — | — | — |

> `—` means the group mapping does not include that module (user gets no UserPermission record for it).

### 5.3 Note on ADMIN vs checkPermission

The `ADMIN` role bypasses `checkPermission` entirely at runtime (line in `permissions.ts`):
```typescript
if (userRole === 'ADMIN') {
  req.user!.permLevel = 5;
  return next();
}
```
Therefore, the permission grants listed for ADMIN groups above are **cosmetic fallbacks** stored in the DB but not checked at runtime.

---

## 6. Full Permission Flow Diagrams

### 6.1 Authentication Flow (Login to JWT)

```
Browser                         Backend                    Microsoft Entra ID
  │                               │                               │
  │── GET /api/auth/login ───────►│                               │
  │                               │── Build auth URL ────────────►│
  │◄──────────────────────────────│◄─ authUrl ────────────────────│
  │                               │                               │
  │── redirect to authUrl ───────────────────────────────────────►│
  │◄──────────── redirect to /callback?code=... ─────────────────│
  │                               │                               │
  │── GET /api/auth/callback ────►│                               │
           ?code=...              │── POST /token (MSAL) ────────►│
                                  │◄─ MSAL token ─────────────────│
                                  │── GET /me (Graph) ───────────►│
                                  │◄─ user info ──────────────────│
                                  │── GET /memberOf (Graph) ─────►│
                                  │◄─ group IDs ──────────────────│
                                  │                               │
                                  │   getRoleFromGroups(groupIds) │
                                  │   → { role, permissions }     │
                                  │                               │
                                  │   prisma.user.upsert(...)     │
                                  │   jwt.sign(payload)           │
                                  │                               │
  │◄─ Set-Cookie: access_token ──│                               │
  │   Set-Cookie: refresh_token  │                               │
  │   redirect to /dashboard     │                               │
```

### 6.2 API Request Authorization Flow

```
Browser Request (e.g., GET /api/inventory)
  │
  │ Cookie: access_token=<JWT>
  │ Header: x-xsrf-token=<CSRF>  (for POST/PUT/PATCH/DELETE)
  │
  ▼
authenticate middleware
  ├── Read access_token from cookie
  ├── jwt.verify(token, JWT_SECRET)
  ├── Decode: { id, entraId, email, name, roles, groups }
  └── Attach to req.user → next()
  │
  ▼
validateCsrfToken middleware (state-changing routes only)
  ├── Skip if GET/HEAD/OPTIONS
  ├── Compare cookie XSRF-TOKEN vs header x-xsrf-token
  └── 403 if mismatch → next() if match
  │
  ▼
checkPermission('TECHNOLOGY', 1) middleware
  ├── If req.user.roles[0] === 'ADMIN'
  │     → req.user.permLevel = 5, next()
  ├── Query: SELECT * FROM user_permissions
  │     WHERE userId = req.user.id
  │     INCLUDE permission
  ├── Find: permission.module === 'TECHNOLOGY'
  │     AND permission.level >= 1
  │     AND (expiresAt IS NULL OR expiresAt >= NOW())
  ├── Not found → 403 Forbidden
  └── Found → req.user.permLevel = highest active level, next()
  │
  ▼
Controller (inventoryController.getInventory)
  ├── Reads req.user.permLevel if row-level scoping needed
  └── Returns data
```

### 6.3 Frontend Route Guard Flow

```
React Router Navigation (e.g., /users)
  │
  ▼
<ProtectedRoute requireAdmin={true}>
  │
  ├── useAuthStore() → { isAuthenticated, user }
  │
  ├── if !isAuthenticated
  │     → <Navigate to="/login" />
  │
  ├── if requireAdmin && !user.roles.includes('ADMIN')
  │     → <AccessDenied> component
  │
  └── else → render children
```

### 6.4 Token Refresh Flow

```
API Call → 401 Unauthorized (token expired)
  │
  ▼
Frontend interceptor (axios)
  │
  ├── POST /api/auth/refresh-token
  │     Body: { refreshToken }  (or cookie)
  │
  ├── Backend validates refresh token signature + expiry
  ├── Issues new access_token cookie
  │
  └── Retry original request
```

---

## 7. Database Schema for Permissions

### 7.1 Core Tables

#### `permissions` table (mapped from `Permission` model)

```sql
CREATE TABLE "permissions" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "module"      TEXT NOT NULL,          -- e.g., 'TECHNOLOGY'
  "level"       INTEGER NOT NULL,       -- 1, 2, 3, 4, or 5
  "name"        TEXT NOT NULL,          -- e.g., 'General User'
  "description" TEXT,
  "isActive"    BOOLEAN DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ,
  UNIQUE ("module", "level"),
  INDEX ("module")
);
```

Prisma model:
```prisma
model Permission {
  id              String           @id @default(uuid())
  module          String
  level           Int
  name            String
  description     String?
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  userPermissions UserPermission[]

  @@unique([module, level])
  @@index([module])
  @@map("permissions")
}
```

#### `user_permissions` table (mapped from `UserPermission` model)

```sql
CREATE TABLE "user_permissions" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  "grantedAt"    TIMESTAMPTZ DEFAULT NOW(),
  "grantedBy"    UUID,                  -- admin user ID who granted it
  "expiresAt"    TIMESTAMPTZ,           -- NULL = permanent
  "createdAt"    TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ,
  UNIQUE ("userId", "permissionId"),
  INDEX ("userId"),
  INDEX ("permissionId")
);
```

Prisma model:
```prisma
model UserPermission {
  id           String     @id @default(uuid())
  userId       String
  permissionId String
  grantedAt    DateTime   @default(now())
  grantedBy    String?
  expiresAt    DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, permissionId])
  @@index([permissionId])
  @@index([userId])
  @@map("user_permissions")
}
```

#### `users` table (relevant fields)

```prisma
model User {
  id              String           @id @default(uuid())
  entraId         String           @unique   // Microsoft Entra Object ID
  email           String           @unique
  firstName       String
  lastName        String
  displayName     String?
  role            String           @default("VIEWER")  // ADMIN|MANAGER|TECHNICIAN|VIEWER
  isActive        Boolean          @default(true)
  userPermissions UserPermission[]
  // ... (many other relations)
  @@map("users")
}
```

### 7.2 Entity Relationship Diagram

```
users ──────────────── user_permissions ──────── permissions
  id  1            *    userId                *   1   id
  role               ← ─ permissionId  ──────►─── module
  entraId              grantedBy               ── level
  email                expiresAt                  name
                        grantedAt                 isActive
```

### 7.3 UpdatePermissions Transaction Pattern

The `UserService.updatePermissions()` method atomically replaces all permissions:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Delete all existing UserPermission records for the user
  await tx.userPermission.deleteMany({ where: { userId } });
  
  // 2. Resolve Permission IDs by (module, level) composite key
  // 3. Create new UserPermission records with grantedBy audit trail
  await tx.userPermission.createMany({ data: permissionRecords });
});
```

---

## 8. Backend Enforcement Details

### 8.1 Middleware Stack Summary

| Middleware | File | Applied To | Purpose |
|-----------|------|-----------|---------|
| `authenticate` | `middleware/auth.ts` | Almost all routes | JWT validation, attaches `req.user` |
| `requireAdmin` | `middleware/auth.ts` | Admin-only routes | Role === 'ADMIN' gate |
| `checkPermission(module, level)` | `middleware/permissions.ts` | Domain routes | Module+level check via DB |
| `validateCsrfToken` | `middleware/csrf.ts` | POST/PUT/PATCH/DELETE | CSRF token validation |
| `validateRequest(schema, source)` | `middleware/validation.ts` | Schema-validated routes | Zod input validation |

### 8.2 Route-by-Route Permission Requirements

#### Auth Routes (`/api/auth/*`)
| Method | Path | Auth | Role | Module | Level |
|--------|------|------|------|--------|-------|
| GET | /login | None | — | — | — |
| GET | /callback | None | — | — | — |
| POST | /refresh-token | None | — | — | — |
| POST | /logout | None | — | — | — |
| GET | /me | ✓ JWT | — | — | — |
| GET | /sync-users | ✓ JWT | ADMIN | — | — |

#### User Routes (`/api/users/*`)
| Method | Path | Auth | Role | Module | Level |
|--------|------|------|------|--------|-------|
| GET | /users/search | ✓ JWT | — | TECHNOLOGY | 1 |
| GET | /users | ✓ JWT | ADMIN | — | — |
| GET | /users/supervisors/list | ✓ JWT | ADMIN | — | — |
| GET | /users/permissions | ✓ JWT | ADMIN | — | — |
| GET | /users/:id | ✓ JWT | ADMIN | — | — |
| GET | /users/:userId/supervisors | ✓ JWT | ADMIN | — | — |
| POST | /users/:userId/supervisors | ✓ JWT | ADMIN | — | — |
| DELETE | /users/:userId/supervisors/:supervisorId | ✓ JWT | ADMIN | — | — |
| PUT | /users/:id/role | ✓ JWT | ADMIN | — | — |
| PUT | /users/:id/permissions | ✓ JWT | ADMIN | — | — |
| PUT | /users/:id/toggle-status | ✓ JWT | ADMIN | — | — |

#### Inventory Routes (`/api/inventory/*` and related)
| Method | Path | Auth | Module | Level |
|--------|------|------|--------|-------|
| GET | /inventory | ✓ JWT | TECHNOLOGY | 1 |
| GET | /inventory/stats | ✓ JWT | TECHNOLOGY | 1 |
| GET | /inventory/:id | ✓ JWT | TECHNOLOGY | 1 |
| GET | /inventory/:id/history | ✓ JWT | TECHNOLOGY | 1 |
| POST | /inventory | ✓ JWT | TECHNOLOGY | 2 |
| PUT | /inventory/:id | ✓ JWT | TECHNOLOGY | 2 |
| DELETE | /inventory/:id | ✓ JWT | TECHNOLOGY | 2 |
| POST | /inventory/bulk-update | ✓ JWT | TECHNOLOGY | 2 |
| GET | /locations/:locationId/inventory | ✓ JWT | TECHNOLOGY | 1 |
| GET | /rooms/:roomId/inventory | ✓ JWT | TECHNOLOGY | 1 |
| POST | /inventory/import | ✓ JWT | TECHNOLOGY | 3 |
| GET | /inventory/import | ✓ JWT | TECHNOLOGY | 3 |
| GET | /inventory/import/:jobId | ✓ JWT | TECHNOLOGY | 3 |
| POST | /inventory/export | ✓ JWT | TECHNOLOGY | 1 |

#### Assignment Routes (`/api/equipment/*`, `/api/users/*`, `/api/rooms/*`)
| Method | Path | Auth | Module | Level |
|--------|------|------|--------|-------|
| POST | /equipment/:id/assign | ✓ JWT | TECHNOLOGY | 2 |
| POST | /equipment/:id/assign-room | ✓ JWT | TECHNOLOGY | 2 |
| POST | /equipment/:id/unassign | ✓ JWT | TECHNOLOGY | 2 |
| POST | /equipment/:id/transfer | ✓ JWT | TECHNOLOGY | 2 |
| GET | /equipment/:id/assignment-history | ✓ JWT | TECHNOLOGY | 1 |
| GET | /equipment/:id/current-assignment | ✓ JWT | TECHNOLOGY | 1 |
| GET | /users/:userId/assigned-equipment | ✓ JWT | TECHNOLOGY | 1 |
| GET | /rooms/:roomId/assigned-equipment | ✓ JWT | TECHNOLOGY | 1 |
| POST | /equipment/bulk-assign | ✓ JWT | TECHNOLOGY | 3 |

#### Reference Data Routes (`/api/brands`, `/api/vendors`, etc.)
| Method | Path | Auth | Module | Level |
|--------|------|------|--------|-------|
| GET | /brands, /brands/:id | ✓ JWT | TECHNOLOGY | 1 |
| POST/PUT | /brands | ✓ JWT | TECHNOLOGY | 2 |
| DELETE | /brands/:id | ✓ JWT | TECHNOLOGY | 2 |
| GET | /vendors, /vendors/:id | ✓ JWT | — | — (auth only) |
| POST/PUT/DELETE | /vendors | ✓ JWT | TECHNOLOGY | 2 |
| GET | /categories, /categories/:id | ✓ JWT | TECHNOLOGY | 1 |
| POST/PUT/DELETE | /categories | ✓ JWT | TECHNOLOGY | 2 |
| GET | /equipment-models | ✓ JWT | TECHNOLOGY | 1 |
| POST/PUT/DELETE | /equipment-models | ✓ JWT | TECHNOLOGY | 2 |

#### Funding Source Routes (`/api/funding-sources/*`)
| Method | Path | Auth | Module | Level |
|--------|------|------|--------|-------|
| GET | /funding-sources, /:id | ✓ JWT | TECHNOLOGY | 1 |
| POST | /funding-sources | ✓ JWT | TECHNOLOGY | 2 |
| PUT | /funding-sources/:id | ✓ JWT | TECHNOLOGY | 2 |
| DELETE | /funding-sources/:id | ✓ JWT | TECHNOLOGY | 3 |
| DELETE (hard) | /funding-sources/:id/hard | ✓ JWT | ADMIN role | — |

#### Purchase Order Routes (`/api/purchase-orders/*`)
| Method | Path | Auth | Module | Level | Note |
|--------|------|------|--------|-------|------|
| GET | /purchase-orders | ✓ JWT | REQUISITIONS | 1 | Own only for level 1 |
| POST | /purchase-orders | ✓ JWT | REQUISITIONS | 2 | Create draft |
| GET | /purchase-orders/:id | ✓ JWT | REQUISITIONS | 1 | Own only for level 1 |
| PUT | /purchase-orders/:id | ✓ JWT | REQUISITIONS | 2 | Edit draft |
| DELETE | /purchase-orders/:id | ✓ JWT | REQUISITIONS | 2 | Delete draft |
| POST | /:id/submit | ✓ JWT | REQUISITIONS | 2 | Submit for approval |
| POST | /:id/approve | ✓ JWT | REQUISITIONS | 3 | Supervisor/purchasing/DOS |
| POST | /:id/reject | ✓ JWT | REQUISITIONS | 3 | Deny at any stage |
| POST | /:id/account | ✓ JWT | REQUISITIONS | 4 | Assign account code |
| POST | /:id/issue | ✓ JWT | REQUISITIONS | 5 | Issue PO number (DOS) |
| GET | /:id/pdf | ✓ JWT | REQUISITIONS | 1 | Download PDF |
| GET | /:id/history | ✓ JWT | REQUISITIONS | 1 | Status history |

#### Location & Room Routes (auth only, no module permission)
| Method | Path | Auth | Role | Note |
|--------|------|------|------|------|
| GET/POST/PUT/DELETE | /locations/* | ✓ JWT | — | Auth only |
| GET/POST/PUT/DELETE | /rooms/* | ✓ JWT | — | Auth only |

#### Admin Routes (`/api/admin/*`)
| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | /admin/sync-status | ✓ JWT | ADMIN |
| POST | /admin/sync-users | ✓ JWT | ADMIN |
| All others | /admin/* | ✓ JWT | ADMIN |

#### Settings Routes (`/api/settings/*`)
| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | /settings | ✓ JWT | ADMIN |
| PUT | /settings | ✓ JWT | ADMIN |

### 8.3 The `requireAdmin` Middleware

```typescript
// middleware/auth.ts
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Checks roles[0] === 'ADMIN'
  // Returns 403 if not admin
};
```

### 8.4 The `checkPermission` Middleware

```typescript
// middleware/permissions.ts
export function checkPermission(module: PermissionModule, requiredLevel: PermissionLevel) {
  return async (req, res, next) => {
    const userRole = req.user.roles?.[0] || 'VIEWER';
    
    // Short-circuit for ADMIN
    if (userRole === 'ADMIN') {
      req.user.permLevel = 5;
      return next();
    }
    
    // DB query
    const userPermissions = await prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });
    
    // Find match: module match AND level >= requiredLevel AND not expired
    const matchingPermission = userPermissions.find(
      (up) => up.permission.module === module && up.permission.level >= requiredLevel
    );
    
    // Expiry check
    if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date())
      → 403
    
    // Set highest non-expired level for this module on req.user
    req.user.permLevel = highestLevel;
    next();
  };
}
```

### 8.5 JWT Payload Structure

**Access Token Payload** (`JWTAccessTokenPayload`):
```typescript
{
  id: string;         // internal User.id (UUID)
  entraId: string;    // Microsoft Entra Object ID
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  groups: string[];   // Entra group IDs
  roles: string[];    // ['ADMIN'] | ['MANAGER'] | ['TECHNICIAN'] | ['VIEWER']
  role: string;       // roles[0]
}
```

**Token Storage:** HttpOnly cookies (`access_token`, `refresh_token`) — never in localStorage.

---

## 9. Frontend Enforcement Details

### 9.1 Auth State Store (`Zustand`)

**File:** `frontend/src/store/authStore.ts`

```typescript
interface User {
  id: string;
  entraId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  groups: string[];
  roles?: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

Persisted to `localStorage` under key `auth-storage` (user info only — tokens stay in HttpOnly cookies).

### 9.2 ProtectedRoute Component

**File:** `frontend/src/components/ProtectedRoute.tsx`

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;   // default false
}
```

Guard logic:
1. If `!isAuthenticated` → redirect to `/login`
2. If `requireAdmin && !user.roles.includes('ADMIN')` → render `<AccessDenied>` UI

**Note:** The frontend `ProtectedRoute` only guards by `role` (ADMIN or not). It does **not** check module-level permissions. Module permission checks are enforced exclusively on the backend.

### 9.3 Frontend Route Protection Map

| Route | ProtectedRoute | requireAdmin |
|-------|---------------|-------------|
| /login | None | — |
| /dashboard | ✓ | No |
| /users | ✓ | **Yes** |
| /admin/settings | ✓ | **Yes** |
| /supervisors | ✓ | **Yes** |
| /reference-data | ✓ | **Yes** |
| /inventory | ✓ | No |
| /disposed-equipment | ✓ | No |
| /equipment-search | ✓ | No |
| /my-equipment | ✓ | No |
| /purchase-orders | ✓ | No |
| /purchase-orders/new | ✓ | No |
| /purchase-orders/:id | ✓ | No |

### 9.4 Frontend Permission-Aware Behavior

While the frontend `ProtectedRoute` only uses role (ADMIN), the pages themselves may use the user's `roles` from authStore to conditionally show/hide features (e.g., action buttons). The authoritative enforcement is always the backend.

The `user.roles` array in the frontend mirrors exactly the `roles` array in the JWT payload.

---

## 10. CSRF Protection

**Pattern:** Double Submit Cookie

**Implementation:** `middleware/csrf.ts`

### 10.1 How It Works

1. On any request, `provideCsrfToken` middleware checks for `XSRF-TOKEN` cookie.
2. If absent, generates `crypto.randomBytes(32).toString('hex')`.
3. Sets `XSRF-TOKEN` cookie (`httpOnly: true`, `sameSite: 'strict'`, 24h expiry).
4. Also sends token in `X-CSRF-Token` response header (readable by JS, exposed via CORS `exposedHeaders`).
5. Frontend reads the header value and caches it in memory.
6. On POST/PUT/PATCH/DELETE: frontend sends token in `x-xsrf-token` request header.
7. `validateCsrfToken` middleware compares cookie token vs header token.

### 10.2 Protected Methods

```typescript
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
```

GET/HEAD/OPTIONS skip validation.

### 10.3 CSRF Token Endpoint

`GET /api/csrf-token` — explicit endpoint for frontend to fetch a fresh token.

---

## 11. Security Considerations

### 11.1 Token Storage Security
- Access tokens stored in **HttpOnly, Secure, SameSite=Strict cookies** — not accessible to JavaScript.
- Refresh tokens similarly cookie-stored.
- No tokens in localStorage or sessionStorage (documented in codebase: `token_storage_security_spec.md`).

### 11.2 Permission Expiry
- `UserPermission.expiresAt` allows time-limited access grants.
- `checkPermission` actively validates expiry on every request — an expired permission is treated as absent.

### 11.3 Admin Bypass Risk
- The `ADMIN` role bypass in `checkPermission` is a design choice. ADMIN accounts must be protected with MFA in Entra ID.
- Only the `ENTRA_ADMIN_GROUP_ID` group (and `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID`, `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID`) map to the ADMIN role.

### 11.4 Rate Limiting
- General API: 500 requests / 15 min per IP
- Auth endpoints (login initiation): 20 requests / 15 min per IP

### 11.5 Input Validation
- All routes use Zod validator schemas (`validateRequest` middleware) before permission checks.
- Validation runs before permission checks — invalid input is rejected early.

### 11.6 OWASP Considerations
| OWASP Top 10 | Mitigation in Tech-V2 |
|-------------|----------------------|
| A01 Broken Access Control | `checkPermission` DB-backed; `requireAdmin` role gate; CSRF protection |
| A02 Cryptographic Failures | HttpOnly cookies; JWT secret from env; HTTPS enforced in prod |
| A03 Injection | Prisma ORM parameterized queries; Zod input validation |
| A05 Security Misconfiguration | Helmet.js; CORS configured; rate limiting |
| A07 Auth Failures | Short JWT expiry; refresh token rotation; MFA via Entra ID |
| A09 Security Logging | Structured logging (request ID, user ID, permission denied events) |

---

## 12. Best Practices Research Findings

The following sources inform recommendations for the final `permissions.md` documentation:

### Source 1: NIST SP 800-162 — Guide to Attribute Based Access Control
*https://csrc.nist.gov/publications/detail/sp/800-162/final*
- Recommends documenting the **subject** (user), **object** (resource), **action** (operation), and **environment** (time, expiry) for each access control rule.
- Tech-V2 aligns: subject=User, object=module, action=level, environment=expiresAt.

### Source 2: OWASP Authorization Cheat Sheet
*https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html*
- "Enforce least privilege" — Tech-V2's tiered 1-5 level model follows this.
- "Prefer deny-by-default" — Tech-V2's checkPermission returns 403 when no matching UserPermission record exists, satisfying deny-by-default.
- "Enforce on the server side" — Backend is the authoritative enforcement point; frontend guards are UX convenience only.

### Source 3: Auth0 RBAC Documentation
*https://auth0.com/docs/manage-users/access-control/rbac*
- Distinguishes roles (broad categories) from permissions (fine-grained actions).
- Recommends storing roles in tokens for quick checks, permissions in DB for fine-grained control — matches Tech-V2's architecture (roles in JWT, permissions in DB).

### Source 4: Microsoft Entra ID Role-Based Access Control
*https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/custom-overview*
- Group-to-role mapping pattern used in Tech-V2 is the recommended Entra integration pattern.
- Recommends PIM (Privileged Identity Management) for time-limited access — analogous to Tech-V2's `expiresAt` on UserPermission.

### Source 5: Prisma Best Practices — Access Control
*https://www.prisma.io/docs/orm/prisma-client/queries/transactions*
- Atomic transactions for permission updates (delete + recreate) prevent partial-state bugs — Tech-V2 implements this correctly in `updatePermissions`.

### Source 6: Express.js Security Best Practices (Node.js Foundation)
*https://expressjs.com/en/advanced/best-practice-security.html*
- Use helmet for HTTP header security — Tech-V2 uses `helmet()`.
- Rate limiting — implemented.
- Use HTTPS in production — CSRF cookie is `secure: true` in production.
- Store sensitive config in environment variables — JWT secret, Entra IDs from `.env`.

### Source 7: JWT Best Practices (RFC 8725)
*https://datatracker.ietf.org/doc/html/rfc8725*
- Use short expiry with refresh token rotation — Tech-V2 uses 1h expiry + refresh tokens.
- Never put sensitive data in payload — Tech-V2 JWT excludes permissions (fetched from DB at check time).
- Validate all claims — Tech-V2 validates via `jwt.verify()`.

---

## 13. Proposed Structure for Final `permissions.md`

The final document at `docs/permissions.md` should be structured as follows:

```markdown
# Tech-V2 Permissions & Authorization Reference

## Overview
- Two-layer system: Role (coarse) + Module Permission Level (fine)
- Authentication via Microsoft Entra ID

## Quick Reference
- Permission level table (all modules at a glance)
- Role capabilities summary

## Role Reference
- ADMIN
- MANAGER
- TECHNICIAN
- VIEWER

## Permission Module Reference
### TECHNOLOGY (levels 1-3)
### MAINTENANCE (levels 1-3)
### REQUISITIONS (levels 1-5)
### PROFESSIONAL_DEV (levels 0-1)
### SPECIAL_ED (levels 0-1)
### TRANSCRIPTS (levels 0-1)

## Entra ID Group Mappings
- Priority resolution table
- Full group→role→permissions matrix

## Authentication Flow
- Login sequence diagram
- JWT payload reference
- Token storage (HttpOnly cookies)

## API Route Permission Reference
- Complete route table with auth/role/module/level requirements

## Frontend Route Guards
- ProtectedRoute usage
- Admin-only vs authenticated-only routes

## Database Schema
- ERD
- Permission and UserPermission Prisma models

## Permission Administration
- How to grant/revoke permissions (admin UI)
- How to update roles

## Security Notes
- CSRF protection
- Rate limiting
- Token expiry

## Appendix
- Full seeded permission list
- Environment variables reference
```

---

## Files Analyzed

| File | Purpose |
|------|---------|
| `backend/src/middleware/auth.ts` | JWT validation, `requireAdmin`, `AuthRequest` interface |
| `backend/src/middleware/permissions.ts` | `checkPermission` middleware, `PermissionModule`, `PermissionLevel` types |
| `backend/src/middleware/csrf.ts` | CSRF double-submit cookie protection |
| `backend/src/controllers/auth.controller.ts` | OAuth callback, JWT issuance, user upsert |
| `backend/src/controllers/user.controller.ts` | User management, permission assignment |
| `backend/src/controllers/purchaseOrder.controller.ts` | PO workflow, permLevel usage |
| `backend/src/services/user.service.ts` | `updatePermissions` transaction, `getAvailablePermissions` |
| `backend/src/services/userSync.service.ts` | Entra group→role mappings, `getRoleFromGroups` |
| `backend/src/routes/*.ts` | All route permission requirements |
| `backend/prisma/schema.prisma` | `Permission`, `UserPermission`, `User` models |
| `backend/prisma/seed.ts` | All seeded permission records |
| `backend/src/server.ts` | Middleware stack, rate limiting, CORS, CSRF |
| `frontend/src/store/authStore.ts` | Zustand auth state, user object structure |
| `frontend/src/components/ProtectedRoute.tsx` | Frontend route guard |
| `frontend/src/App.tsx` | Route definitions and guard usage |
| `shared/src/types.ts` | Shared `UserRole`, `PermissionModule`, `PermissionLevel` types |
| `shared/src/api-types.ts` | `LoginResponse`, `UpdateUserPermissionsRequest` |
| `docs/requisition_flow.md` | Requisition workflow documentation |

# Tech-V2 Permissions & Authorization Reference

> **System:** Tech Department Management System (Tech-V2)  
> **Last Updated:** 2026-03-12  
> **Architecture:** Two-layer RBAC — Microsoft Entra ID Groups → Application Roles → Module Permission Levels

---

## Table of Contents

1. [Overview](#1-overview)
2. [Roles Catalogue](#2-roles-catalogue)
3. [Permission Modules Catalogue](#3-permission-modules-catalogue)
   - [3.1 TECHNOLOGY](#31-technology)
   - [3.2 MAINTENANCE](#32-maintenance)
   - [3.3 REQUISITIONS](#33-requisitions)
4. [Permission Matrix](#4-permission-matrix)
5. [Authentication & Authorization Flow](#5-authentication--authorization-flow)
   - [5.1 Login Flow (Entra ID → JWT)](#51-login-flow-entra-id--jwt)
   - [5.2 API Request Authorization Flow](#52-api-request-authorization-flow)
   - [5.3 Frontend Route Guard Flow](#53-frontend-route-guard-flow)
   - [5.4 Token Refresh Flow](#54-token-refresh-flow)
6. [Database Schema](#6-database-schema)
7. [Backend Enforcement](#7-backend-enforcement)
   - [7.1 Middleware Stack](#71-middleware-stack)
   - [7.2 `authenticate` Middleware](#72-authenticate-middleware)
   - [7.3 `requireAdmin` Middleware](#73-requireadmin-middleware)
   - [7.4 `checkPermission` Middleware](#74-checkpermission-middleware)
   - [7.5 CSRF Validation Middleware](#75-csrf-validation-middleware)
8. [Frontend Enforcement](#8-frontend-enforcement)
   - [8.1 Auth Store (Zustand)](#81-auth-store-zustand)
   - [8.2 `ProtectedRoute` Component](#82-protectedroute-component)
   - [8.3 Frontend Route Protection Map](#83-frontend-route-protection-map)
9. [API Route Permission Map](#9-api-route-permission-map)
10. [Security Considerations](#10-security-considerations)
11. [Adding Permissions to New Features](#11-adding-permissions-to-new-features)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)

---

## 1. Overview

### What the Permission System Is

Tech-V2 uses a **two-layer authorization system** built on top of **Microsoft Entra ID (Azure AD)**. It controls who can access each module of the application and at what level of authority.

**Layer 1 — Application Role:** A coarse-grained `role` field on the `User` model. Assigned automatically from the user's Entra ID group memberships at login time. Controls blanket admin access to management routes.

**Layer 2 — Module Permission Level:** A fine-grained `UserPermission` table linking users to `(module, level)` pairs. Controls access to specific domain data routes and row-level visibility within controllers.

### Architecture Summary

```
Microsoft Entra ID
  └── Groups (ADMIN, PRINCIPALS, ALL_STAFF, etc.)
        │
        ▼  [at login — getRoleFromGroups()]
Application Role
  └── ADMIN | MANAGER | TECHNICIAN | VIEWER
        │
        ├── [requireAdmin middleware]  → Admin-only management routes
        │
        └── [checkPermission(module, level) middleware]
              └── UserPermission table
                    └── (module, level) pairs per user
                          │
                          ▼  [controller reads req.user.permLevel]
                    Row-level data visibility
```

### Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Deny by default** | `checkPermission` returns `403` when no matching `UserPermission` record exists |
| **Server-side enforcement** | All permission checks run on the backend; frontend guards are UX convenience only |
| **Least privilege** | Users start with no module permissions and are granted the minimum required |
| **ADMIN bypass** | The `ADMIN` role short-circuits `checkPermission` entirely — `req.user.permLevel = 5` |
| **Time-limited access** | `UserPermission.expiresAt` supports temporary permission grants |
| **Audit trail** | `UserPermission.grantedBy` records who granted each permission |
| **Atomic updates** | Permission changes use Prisma transactions (delete + recreate) to prevent partial state |

---

## 2. Roles Catalogue

Roles are stored in `users.role` (the `users` PostgreSQL table). There are **4 application roles**.

### Role Definitions

| Role | Description | Admin UI Access | Bypasses `checkPermission` |
|------|-------------|----------------|---------------------------|
| `ADMIN` | Full system administrator; highest privilege | **Yes** — full access | **Yes** — always gets `permLevel = 5` |
| `MANAGER` | Department head, director, principal | No | No |
| `TECHNICIAN` | Technical staff (tech/maintenance admin) | No | No |
| `VIEWER` | Standard staff or student; default role | No | No |

### Role Descriptions

#### ADMIN
The `ADMIN` role represents system administrators with complete authority. At runtime, `checkPermission` short-circuits for ADMINs — they never need explicit `UserPermission` records. The `requireAdmin` middleware gates all user management, settings, and sync endpoints. Only 3 Entra groups map to ADMIN: System Admins, Technology Director, Director of Schools.

#### MANAGER
The `MANAGER` role represents department heads, principals, vice principals, and directors. They access domain data (e.g., approve purchase orders, view all requisitions) via module permissions, but cannot access the admin management UI (`/users`, `/admin/settings`, etc.).

#### TECHNICIAN
The `TECHNICIAN` role is assigned to technical staff (e.g., legacy Tech Admin group). Identical to MANAGER in terms of UI access restrictions; differentiated primarily for organizational clarity and future extensibility.

#### VIEWER
The `VIEWER` role is the default for all staff and students. A `VIEWER` can only access what their explicit `UserPermission` records allow. Without any `UserPermission` records, a VIEWER is effectively locked out of all domain data.

### Role Determination at Login

At login, `UserSyncService.getRoleFromGroups()` inspects the user's Entra ID group memberships and resolves a role using **priority ordering** (highest priority wins):

```
Priority  1  →  ENTRA_ADMIN_GROUP_ID                         → ADMIN
Priority  2  →  ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID            → ADMIN
Priority  3  →  ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID            → ADMIN
Priority  4  →  ENTRA_FINANCE_DIRECTOR_GROUP_ID               → MANAGER
Priority  5  →  ENTRA_SPED_DIRECTOR_GROUP_ID                  → MANAGER
Priority  6  →  ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID           → MANAGER
Priority  7  →  ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID        → MANAGER
Priority  8  →  ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID           → MANAGER
Priority  9  →  ENTRA_NURSE_DIRECTOR_GROUP_ID                 → MANAGER
Priority 10  →  ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID     → MANAGER
Priority 11  →  ENTRA_PRINCIPALS_GROUP_ID                     → MANAGER
Priority 12  →  ENTRA_VICE_PRINCIPALS_GROUP_ID                → MANAGER
Priority 13  →  ENTRA_TECH_ADMIN_GROUP_ID                     → TECHNICIAN
Priority 14  →  ENTRA_MAINTENANCE_ADMIN_GROUP_ID              → MANAGER
Priority 15  →  ENTRA_ALL_STAFF_GROUP_ID                      → VIEWER
Priority 16  →  ENTRA_ALL_STUDENTS_GROUP_ID                   → VIEWER

If no group matches → VIEWER (default; no module permissions granted)
```

### Entra ID Group → Role → Module Permission Matrix

| Entra Group | App Role | TECHNOLOGY | MAINTENANCE | REQUISITIONS |
|-------------|----------|:----------:|:-----------:|:------------:|
| System Admin | ADMIN | 3 | 3 | 5 |
| Technology Director | ADMIN | 3 | — | 3 |
| Director of Schools | ADMIN | 2 | 3 | 5 |
| Director of Finance | MANAGER | 2 | 2 | 5 |
| Principals | MANAGER | 2 | 2 | 3 |
| Vice Principals | MANAGER | 2 | 2 | 3 |
| SPED Director | MANAGER | — | — | 3 |
| Maintenance Director | MANAGER | — | 3 | 3 |
| Transportation Director | MANAGER | — | 2 | 3 |
| Afterschool Director | MANAGER | — | — | 3 |
| Nurse Director | MANAGER | — | — | 3 |
| Supervisors of Instruction | MANAGER | — | — | 3 |
| Tech Admin (legacy) | TECHNICIAN | 3 | 2 | 3 |
| Maintenance Admin (legacy) | MANAGER | 2 | 3 | 3 |
| All Staff | VIEWER | 1 | 1 | 2 |
| All Students | VIEWER | 1 | — | — |

> `—` = group mapping does not include that module; user gets no `UserPermission` record for it.  
> ADMIN roles: the DB permission records shown are cosmetic fallbacks — they are **not checked at runtime** due to the ADMIN bypass.

### Valid Role Values

Enforced by `UserService.updateRole()`:

```typescript
const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];
```

---

## 3. Permission Modules Catalogue

There are **6 permission modules**. Checks use `>=` semantics — a user with level 3 satisfies any level ≤ 3 check.

### 3.1 TECHNOLOGY

**Purpose:** Governs all inventory, equipment, assignments, reference data, and funding source management.

**Status:** Fully implemented and active in all inventory/equipment routes.

#### Permission Levels

| Level | Name | Description | What It Unlocks |
|-------|------|-------------|----------------|
| 1 | General User | View-only technology access | GET inventory, stats, history; GET locations/rooms; GET assignment history; GET reference data (brands, categories, models); GET funding sources |
| 2 | Principal / School Tech | School-level technology management | All level 1 **+** POST/PUT/DELETE inventory (soft delete); create/update reference data; create/update funding sources; assign/unassign/transfer equipment; bulk-update equipment |
| 3 | Technology Department | Full technology administration | All level 2 **+** bulk-assign equipment; import inventory (CSV/Excel); manage import jobs; hard-delete funding sources (admin-restricted) |

#### Typical Role Assignments

| Role/Group | TECHNOLOGY Level |
|-----------|:----------------:|
| All Staff | 1 |
| All Students | 1 |
| Principals, Vice Principals, Director of Finance | 2 |
| Director of Schools | 2 |
| Tech Admin, Technology Director, System Admin | 3 |

#### Code Example — Route Protection

```typescript
// backend/src/routes/inventory.routes.ts
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

// Level 1: View inventory
router.get('/', authenticate, checkPermission('TECHNOLOGY', 1), getInventory);

// Level 2: Create/update
router.post('/', authenticate, checkPermission('TECHNOLOGY', 2), createInventory);
router.put('/:id', authenticate, checkPermission('TECHNOLOGY', 2), updateInventory);

// Level 3: Import (admin operation)
router.post('/import', authenticate, checkPermission('TECHNOLOGY', 3), importInventory);
```

---

### 3.2 MAINTENANCE

**Purpose:** Governs maintenance order creation, management, and oversight.

**Status:** Model and schema exist. Routes are partially defined; full route enforcement is pending.

#### Permission Levels

| Level | Name | Description |
|-------|------|-------------|
| 1 | General User | View maintenance orders; create basic maintenance requests |
| 2 | Principal / School Maintenance | School-level maintenance management; update orders |
| 3 | Supervisor of Maintenance | Full maintenance oversight; assign technicians; close orders |

#### Typical Role Assignments

| Role/Group | MAINTENANCE Level |
|-----------|:----------------:|
| All Staff | 1 |
| Principals, Vice Principals, Director of Finance, Transportation Director | 2 |
| Tech Admin, Maintenance Admin | 2 |
| Maintenance Director, Director of Schools, System Admin | 3 |

---

### 3.3 REQUISITIONS

**Purpose:** Governs the entire purchase order workflow — from draft creation through supervisor approval, account code assignment, and final PO issuance.

**Status:** Fully implemented with a 5-level workflow.

#### Permission Levels

| Level | Name | Description | What It Unlocks |
|-------|------|-------------|----------------|
| 1 | Viewer | View own purchase orders only | GET `/purchase-orders` (own only), GET `/:id` (own only), GET PDF, GET status history |
| 2 | General User | Create and manage own purchase orders | All level 1 **+** POST (create draft), PUT (edit draft), DELETE (delete draft), POST `/:id/submit` |
| 3 | Supervisor | First-stage approval authority | All level 2 **+** POST `/:id/approve` (supervisor stage); POST `/:id/reject`; sees **all** POs |
| 4 | Purchasing Staff | Assign account codes | All level 3 **+** POST `/:id/account` (assign account code/program) |
| 5 | Director of Services | Final approval and PO issuance | All level 4 **+** POST `/:id/issue` (issue formal PO number) |

#### Row-Level Visibility

Controllers read `req.user.permLevel` to scope data:

```typescript
// backend/src/controllers/purchaseOrder.controller.ts
const whereClause = req.user!.permLevel! >= 2
  ? {}                                          // Level 2+: see all POs
  : { requestorId: req.user!.id };              // Level 1:  see only own POs
```

#### Typical Role Assignments

| Role/Group | REQUISITIONS Level |
|-----------|:-----------------:|
| All Staff | 2 (create own) |
| Principals, Vice Principals, most Directors | 3 (approve) |
| Director of Finance | 5 (DOS / final) |
| Director of Schools, System Admin | 5 (DOS / final) |
| Tech Admin, Maintenance Admin | 3 |

---

### Seeded Permission Records (All 12)

The `prisma/seed.ts` script seeds the following `Permission` records:

```
TECHNOLOGY:1         - General User
TECHNOLOGY:2         - Principal/School Tech
TECHNOLOGY:3         - Technology Department

MAINTENANCE:1        - General User
MAINTENANCE:2        - Principal/School Maintenance
MAINTENANCE:3        - Supervisor of Maintenance

REQUISITIONS:1       - Viewer
REQUISITIONS:2       - General User
REQUISITIONS:3       - Supervisor
REQUISITIONS:4       - Purchasing Staff
REQUISITIONS:5       - Director of Services
```

---

## 4. Permission Matrix

Complete matrix of **Role × Module → Typical Assigned Permission Level**.

> ADMIN bypasses all checks at runtime (always `permLevel = 5`). Levels shown for ADMIN are DB records only.

| Module | ADMIN | MANAGER | TECHNICIAN | VIEWER |
|--------|:-----:|:-------:|:----------:|:------:|
| TECHNOLOGY | 3 *(bypass)* | 2 (typical) | 3 (tech staff) | 1 |
| MAINTENANCE | 3 *(bypass)* | 2–3 (varies) | 2 | 1 |
| REQUISITIONS | 5 *(bypass)* | 3–5 (varies) | 3 | 2 |

> Actual `UserPermission` records are set per-user by `UserSyncService` based on Entra group. Admins can override via `/api/users/:id/permissions`.

---

## 5. Authentication & Authorization Flow

### 5.1 Login Flow (Entra ID → JWT)

```
Browser                         Backend                     Microsoft Entra ID
  │                               │                                │
  │── GET /api/auth/login ───────►│                                │
  │                               │── Build PKCE auth URL ────────►│
  │◄───────────────── redirect ───│◄─ authorization URL ───────────│
  │                               │                                │
  │── User authenticates with MFA at Entra login page ───────────►│
  │◄─────────────────────── redirect /callback?code=... ──────────│
  │                               │                                │
  │── GET /api/auth/callback ────►│                                │
         ?code=...                │                                │
                                  │── POST /oauth2/token (MSAL) ──►│
                                  │◄── MSAL token ─────────────────│
                                  │                                │
                                  │── GET /me (Graph API) ────────►│
                                  │◄── { user profile } ───────────│
                                  │                                │
                                  │── GET /memberOf (Graph API) ──►│
                                  │◄── { groupIds[] } ─────────────│
                                  │                                │
                                  │   UserSyncService
                                  │   .getRoleFromGroups(groupIds)
                                  │   → { role, permissions[] }
                                  │
                                  │   prisma.user.upsert(...)
                                  │   prisma.userPermission.upsert(...)
                                  │
                                  │   jwt.sign({
                                  │     id, entraId, email, name,
                                  │     roles: [role],
                                  │     groups: groupIds
                                  │   }, JWT_SECRET, { expiresIn: '1h' })
                                  │
  │◄── Set-Cookie: access_token  ─│   (HttpOnly, Secure, SameSite=Strict)
  │◄── Set-Cookie: refresh_token ─│   (HttpOnly, Secure, SameSite=Strict)
  │◄── redirect: /dashboard ──────│
```

**JWT Payload Structure:**

```typescript
// JWTPayload (backend/src/middleware/auth.ts)
interface JWTPayload {
  id: string;        // Internal User.id (UUID)
  entraId: string;   // Microsoft Entra Object ID
  email: string;
  name: string;
  roles: string[];   // e.g., ['ADMIN'] | ['MANAGER'] | ['TECHNICIAN'] | ['VIEWER']
  groups: string[];  // Raw Entra group GUIDs
}
```

---

### 5.2 API Request Authorization Flow

```
Browser (e.g., GET /api/inventory)
  │
  │  Cookie: access_token=<JWT>
  │  Header: x-xsrf-token=<CSRF token>   (POST/PUT/PATCH/DELETE only)
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  authenticate middleware                                    │
│                                                             │
│  1. Read 'access_token' cookie                              │
│  2. Fallback: Authorization: Bearer <token> header          │
│  3. jwt.verify(token, JWT_SECRET)                           │
│  4. Attach decoded payload → req.user                       │
│  5. Returns 401 if missing/expired/invalid                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  validateCsrfToken middleware  (state-changing routes only) │
│                                                             │
│  1. Skip if GET / HEAD / OPTIONS                            │
│  2. Read XSRF-TOKEN cookie                                  │
│  3. Read x-xsrf-token header                                │
│  4. crypto.timingSafeEqual(cookie, header)                  │
│  5. Returns 403 if tokens don't match                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  validateRequest(schema, source)  (schema-validated routes) │
│                                                             │
│  1. Validate body / params / query against Zod schema       │
│  2. Returns 400 Bad Request if validation fails             │
│  3. Runs BEFORE permission check — bad input rejected early │
└──────────────────────┬──────────────────────────────────────┘
                       │
           ┌───────────┴────────────┐
           │                        │
           ▼                        ▼
  ┌────────────────┐    ┌────────────────────────────────────┐
  │ requireAdmin   │    │ checkPermission('TECHNOLOGY', 1)   │
  │                │    │                                    │
  │ Checks:        │    │ 1. If roles[0] === 'ADMIN'         │
  │ roles[0]       │    │    → req.user.permLevel = 5        │
  │ === 'ADMIN'    │    │    → next()  (short-circuit)       │
  │                │    │                                    │
  │ Returns 403    │    │ 2. prisma.userPermission.findMany  │
  │ if not admin   │    │    WHERE userId = req.user.id      │
  └────────────────┘    │                                    │
                        │ 3. Find: module === 'TECHNOLOGY'   │
                        │    AND level >= 1                  │
                        │                                    │
                        │ 4. Check expiresAt (if set)        │
                        │    Returns 403 if expired          │
                        │                                    │
                        │ 5. Set req.user.permLevel =        │
                        │    highest valid level for module  │
                        │                                    │
                        │ 6. Returns 403 if no match found   │
                        └───────────────┬────────────────────┘
                                        │
                                        ▼
                        ┌────────────────────────────────────┐
                        │  Controller                        │
                        │                                    │
                        │  Reads req.user.permLevel for      │
                        │  row-level visibility              │
                        │  (e.g., own POs vs all POs)        │
                        └────────────────────────────────────┘
```

---

### 5.3 Frontend Route Guard Flow

```
React Router Navigation (e.g., /users or /inventory)
  │
  ▼
<ProtectedRoute requireAdmin={true|false}>
  │
  ├── useAuthStore() → { isAuthenticated, user }
  │
  ├── if !isAuthenticated
  │     → <Navigate to="/login" replace />
  │
  ├── if requireAdmin === true
  │     └── if !user.roles.includes('ADMIN')
  │           → <AccessDenied> UI component
  │
  └── if authenticated (and admin check passes)
        → render {children}
```

> **Critical note:** The frontend `ProtectedRoute` only guards by role (ADMIN or not). It does **not** enforce module-level permissions. Module checks are entirely a backend concern.

---

### 5.4 Token Refresh Flow

```
API Call → 401 Unauthorized (token expired)
  │
  ▼
Frontend axios interceptor
  │
  ├── POST /api/auth/refresh-token
  │     (refresh_token sent via HttpOnly cookie)
  │
  ├── Backend:
  │     Validates refresh token signature + expiry
  │     Issues new access_token (HttpOnly cookie)
  │     Issues new refresh_token (HttpOnly cookie, rotated)
  │
  └── Retry original request with new cookie
```

---

## 6. Database Schema

### Core Models

#### `Permission` model → `permissions` table

A catalogue of all possible `(module, level)` pairs. Seeded at init; rarely modified.

```prisma
model Permission {
  id              String           @id @default(uuid())
  module          String                        // e.g., 'TECHNOLOGY'
  level           Int                           // 1, 2, 3, 4, or 5
  name            String                        // e.g., 'General User'
  description     String?
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  userPermissions UserPermission[]

  @@unique([module, level])                     // Composite unique key
  @@index([module])
  @@map("permissions")
}
```

#### `UserPermission` model → `user_permissions` table

The junction table granting a specific `Permission` record to a specific `User`. This is what `checkPermission` queries at runtime.

```prisma
model UserPermission {
  id           String     @id @default(uuid())
  userId       String                           // FK → users.id
  permissionId String                           // FK → permissions.id
  grantedAt    DateTime   @default(now())
  grantedBy    String?                          // User ID who granted (audit)
  expiresAt    DateTime?                        // NULL = permanent
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

#### `User` model → `users` table (permission-relevant fields)

```prisma
model User {
  id              String           @id @default(uuid())
  entraId         String           @unique    // Microsoft Entra Object ID
  email           String           @unique
  firstName       String
  lastName        String
  displayName     String?
  department      String?
  jobTitle        String?
  role            String           @default("VIEWER")  // ADMIN|MANAGER|TECHNICIAN|VIEWER
  isActive        Boolean          @default(true)
  lastSync        DateTime         @default(now())
  lastLogin       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  officeLocation  String?

  userPermissions UserPermission[]
  // ... many other relations

  @@map("users")
}
```

### Entity Relationship Diagram

```
users (1) ────────────────── (*) user_permissions (*) ────────────────── (1) permissions
  id                              userId                                      id
  role ◄── stored here            permissionId                               module
  entraId                         grantedAt                                  level
  email                           grantedBy                                  name
  isActive                        expiresAt ◄── expiry enforcement           isActive
```

### How Permissions are Created / Updated

`UserService.updatePermissions()` uses an **atomic transaction** to replace all permissions for a user:

```typescript
await this.prisma.$transaction(async (tx) => {
  // Step 1: Remove all existing UserPermission records for the user
  await tx.userPermission.deleteMany({ where: { userId } });

  // Step 2: Resolve Permission IDs from (module, level) pairs
  const permissionIds = await Promise.all(
    permissions.map(({ module, level }) =>
      tx.permission.findUnique({ where: { module_level: { module, level } } })
    )
  );

  // Step 3: Create new UserPermission records with grantedBy audit trail
  await tx.userPermission.createMany({
    data: permissionIds.map((p) => ({
      userId,
      permissionId: p!.id,
      grantedBy: adminUserId,
    })),
  });
});
```

The transaction prevents a partial-permission state (e.g., old permissions deleted but new ones not yet created).

### How Permissions are Seeded

The Entra sync (`UserSyncService.getRoleFromGroups()`) returns a bundle of `{ role, permissions[] }` for each user. On login (OAuth callback), the auth controller calls `UserSyncService` and upserts `UserPermission` records based on the user's current group memberships.

Admins can also manually override permissions via `PUT /api/users/:id/permissions`.

---

## 7. Backend Enforcement

### 7.1 Middleware Stack

| Middleware | File | Applied To | Purpose |
|-----------|------|-----------|---------|
| `authenticate` | `middleware/auth.ts` | All protected routes | Validates JWT; attaches `req.user` |
| `requireAdmin` | `middleware/auth.ts` | Admin-only routes | Checks `roles.includes('ADMIN')` OR Entra admin group membership |
| `checkPermission(module, level)` | `middleware/permissions.ts` | Domain data routes | Module+level check via DB query |
| `validateCsrfToken` | `middleware/csrf.ts` | POST/PUT/PATCH/DELETE | Custom-header CSRF token validation (`XSRF-TOKEN` httpOnly cookie + `X-CSRF-Token` response header) |
| `validateRequest(schema, source)` | `middleware/validation.ts` | Schema-validated routes | Zod input validation — runs **before** `checkPermission` so invalid input is rejected before any DB query |
| `optionalAuth` | `middleware/auth.ts` | Endpoints with optional auth | Authenticates without failing if no token is present |
| `requireGroup(groupId)` | `middleware/auth.ts` | Group-gated endpoints | Gates access based on raw Entra group GUID (less commonly used than `requireAdmin`) |

**Middleware order matters.** The typical stack for a protected data mutation route is:

```
authenticate → validateCsrfToken → validateRequest → checkPermission → controller
```

---

### 7.2 `authenticate` Middleware

**File:** [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts)

```typescript
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // 1. Prefer cookie (HttpOnly — not accessible to JS)
  let token = req.cookies?.access_token;

  // 2. Fallback: Authorization Bearer header (backward compatibility)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    req.user = {
      id: decoded.id,
      entraId: decoded.entraId,
      email: decoded.email,
      name: decoded.name,
      roles: decoded.roles || [],
      groups: decoded.groups || [],
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token',
    });
  }
};
```

The `AuthRequest` interface extends Express `Request` with the `user` property:

```typescript
export interface AuthRequest extends Request {
  user?: {
    id: string;
    entraId: string;
    email: string;
    name: string;
    roles: string[];
    groups: string[];
    permLevel?: number;  // Set by checkPermission middleware
  };
}
```

---

### 7.3 `requireAdmin` Middleware

**File:** [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts)

```typescript
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
  const hasAdminRole = req.user.roles.includes('ADMIN');
  const isInAdminGroup = adminGroupId && req.user.groups.includes(adminGroupId);

  if (!hasAdminRole && !isInAdminGroup) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }

  next();
};
```

> `requireAdmin` checks **both** `roles` (from JWT) **and** raw Entra group membership (`groups`) as a fallback. Must be preceded by `authenticate`.

---

### 7.4 `checkPermission` Middleware

**File:** [backend/src/middleware/permissions.ts](../backend/src/middleware/permissions.ts)

```typescript
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'REQUISITIONS';

export type PermissionLevel = 1 | 2 | 3 | 4 | 5;

export function checkPermission(module: PermissionModule, requiredLevel: PermissionLevel) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthorizationError('No user context found');
      }

      const userId = req.user.id;
      const userRole = req.user.roles?.[0] || 'VIEWER';

      // ── ADMIN short-circuit ──────────────────────────────────────────────
      if (userRole === 'ADMIN') {
        req.user!.permLevel = 5;
        return next();
      }

      // ── DB query ─────────────────────────────────────────────────────────
      const userPermissions = await prisma.userPermission.findMany({
        where: { userId },
        include: { permission: true },
      });

      // ── Module + level match ──────────────────────────────────────────────
      const matchingPermission = userPermissions.find(
        (up) =>
          up.permission.module === module &&
          up.permission.level >= requiredLevel
      );

      if (!matchingPermission) {
        throw new AuthorizationError(
          `Insufficient permissions for ${module} module (requires level ${requiredLevel})`
        );
      }

      // ── Expiry check ──────────────────────────────────────────────────────
      if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
        throw new AuthorizationError(`Permission for ${module} module has expired`);
      }

      // ── Attach highest non-expired level for controller use ───────────────
      const now = new Date();
      const highestLevel = userPermissions
        .filter(
          (up) =>
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
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  };
}
```

**Key behaviors:**
- `ADMIN` always gets `permLevel = 5` without any DB query.
- For non-admins, all `UserPermission` records are loaded and then filtered in-memory.
- `req.user.permLevel` is set to the **highest non-expired level** for the module, not just the minimum required. This lets controllers implement nuanced visibility (e.g., a level-3 user sees more than a level-1 user even if the route only required level 1).
- A missing or expired permission returns `403 Forbidden`.

> **Known limitation — expiry check ordering:** The initial `find()` gate does **not** pre-filter by expiry. If a user holds multiple permissions for the same module (e.g., `TECHNOLOGY:3` expired AND `TECHNOLOGY:1` valid) and a route requires level 1, `find()` may return the expired `TECHNOLOGY:3` record first (the `findMany` result has no explicit sort order). The expiry check then fires on that record and throws `403`, even though the valid `TECHNOLOGY:1` permission was never evaluated. The `highestLevel` recalculation lower in the function does filter expiry correctly, but it only runs **after** the gate check passes. **Workaround:** Remove expired permissions promptly by resubmitting the user's full permission set via `PUT /api/users/:id/permissions` (see also [Troubleshooting §12](#12-troubleshooting--faq)).

---

### 7.5 CSRF Validation Middleware

**File:** [backend/src/middleware/csrf.ts](../backend/src/middleware/csrf.ts)

**Pattern:** Custom Request Header CSRF Token (httpOnly variant — the `XSRF-TOKEN` cookie is marked `httpOnly: true` so JavaScript cannot read it directly; the token is instead delivered to the client via the `X-CSRF-Token` **response header**, which the frontend caches in memory and sends back as the `x-xsrf-token` **request header** on every state-changing call)

```typescript
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-xsrf-token';
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export const validateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  // Read requests are safe — skip validation
  if (!PROTECTED_METHODS.includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers['x-csrf-token'];

  if (!cookieToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }
  if (!headerToken) {
    return res.status(403).json({ error: 'CSRF token not provided in request header' });
  }

  // Timing-safe comparison prevents timing attacks
  const tokensMatch = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken as string)
  );

  if (!tokensMatch) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
};

export const provideCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  let token = req.cookies[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  // Expose in response header so frontend JS can read it
  res.setHeader('X-CSRF-Token', token);
  next();
};
```

The frontend reads the `X-CSRF-Token` response header, caches it in memory, and sends it as `x-xsrf-token` on every state-changing request.

---

## 8. Frontend Enforcement

### 8.1 Auth Store (Zustand)

**File:** [frontend/src/store/authStore.ts](../frontend/src/store/authStore.ts)

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
  roles?: string[];  // e.g., ['ADMIN'] | ['MANAGER'] | ['TECHNICIAN'] | ['VIEWER']
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearAuth: () => set({ user: null, isAuthenticated: false }),
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',   // localStorage key
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // Tokens NOT stored — they are in HttpOnly cookies
      }),
    }
  )
);
```

**What is stored in `localStorage`:**
- `user` object (profile info, roles, groups)
- `isAuthenticated` boolean

**What is NOT stored:**
- JWT access token (HttpOnly cookie only)
- Refresh token (HttpOnly cookie only)
- Module permission levels (not exposed to frontend)

> **Note on `permLevel`:** Module permission levels (`req.user.permLevel`) are set **server-side** by `checkPermission` on each request via a live DB query. They are not included in the JWT, not synced to the frontend auth store, and are unavailable to frontend JavaScript. UI decisions (e.g., conditionally showing an edit button) should be based on `user.roles` from the auth store, not on permission levels. The backend is always the authoritative enforcement point.

---

### 8.2 `ProtectedRoute` Component

**File:** [frontend/src/components/ProtectedRoute.tsx](../frontend/src/components/ProtectedRoute.tsx)

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;  // default: false
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuthStore();

  // 1. Not authenticated → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 2. Requires admin role → check
  if (requireAdmin) {
    const isAdmin = user?.roles?.includes('ADMIN');
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You don't have permission to access this page.</p>
          <p style={{ color: '#666' }}>
            Your current role: {user?.roles?.join(', ') || 'Unknown'}
          </p>
        </div>
      );
    }
  }

  // 3. Pass through
  return <>{children}</>;
};
```

**Usage in route definitions:**

```tsx
// Authenticated users only
<Route path="/inventory" element={
  <ProtectedRoute>
    <InventoryPage />
  </ProtectedRoute>
} />

// Admin-only
<Route path="/users" element={
  <ProtectedRoute requireAdmin={true}>
    <UsersPage />
  </ProtectedRoute>
} />
```

**Important limitation:** `ProtectedRoute` only enforces two states: authenticated vs. unauthenticated, and admin vs. non-admin. It does **not** check module permissions. A VIEWER can navigate to `/inventory` and the frontend will render it — but any API calls will return `403` from the backend if the user lacks `TECHNOLOGY:1`. Backend enforcement is always authoritative.

---

### 8.3 Frontend Route Protection Map

| Route | Requires Auth | Requires Admin | Notes |
|-------|:------------:|:--------------:|-------|
| `/login` | No | No | Public |
| `/dashboard` | Yes | No | All authenticated users |
| `/inventory` | Yes | No | Backend checks TECHNOLOGY ≥ 1 |
| `/disposed-equipment` | Yes | No | Backend checks TECHNOLOGY ≥ 1 |
| `/equipment-search` | Yes | No | Backend checks TECHNOLOGY ≥ 1 |
| `/my-equipment` | Yes | No | Backend checks TECHNOLOGY ≥ 1 |
| `/purchase-orders` | Yes | No | Backend checks REQUISITIONS ≥ 1 |
| `/purchase-orders/new` | Yes | No | Backend checks REQUISITIONS ≥ 2 |
| `/purchase-orders/:id` | Yes | No | Backend checks REQUISITIONS ≥ 1 |
| `/users` | Yes | **Yes** | ADMIN role required |
| `/supervisors` | Yes | **Yes** | ADMIN role required |
| `/reference-data` | Yes | **Yes** | ADMIN role required |
| `/admin/settings` | Yes | **Yes** | ADMIN role required |

---

## 9. API Route Permission Map

### Auth Routes (`/api/auth`)

| Method | Endpoint | Auth | Role | Module | Level | Notes |
|--------|----------|:----:|:----:|:------:|:-----:|-------|
| GET | `/auth/login` | — | — | — | — | Initiates OAuth flow |
| GET | `/auth/callback` | — | — | — | — | OAuth callback |
| POST | `/auth/refresh-token` | — | — | — | — | Refresh JWT |
| POST | `/auth/logout` | — | — | — | — | Clear cookies |
| GET | `/auth/me` | ✓ | — | — | — | Get current user |
| GET | `/auth/sync-users` | ✓ | ADMIN | — | — | Trigger Entra sync |

### User Management Routes (`/api/users`)

| Method | Endpoint | Auth | Role | Module | Level |
|--------|----------|:----:|:----:|:------:|:-----:|
| GET | `/users/search` | ✓ | — | TECHNOLOGY | 1 |
| GET | `/users` | ✓ | ADMIN | — | — |
| GET | `/users/supervisors/list` | ✓ | ADMIN | — | — |
| GET | `/users/permissions` | ✓ | ADMIN | — | — |
| GET | `/users/:id` | ✓ | ADMIN | — | — |
| GET | `/users/:userId/supervisors` | ✓ | ADMIN | — | — |
| POST | `/users/:userId/supervisors` | ✓ | ADMIN | — | — |
| DELETE | `/users/:userId/supervisors/:supervisorId` | ✓ | ADMIN | — | — |
| PUT | `/users/:id/role` | ✓ | ADMIN | — | — |
| PUT | `/users/:id/permissions` | ✓ | ADMIN | — | — |
| PUT | `/users/:id/toggle-status` | ✓ | ADMIN | — | — |

### Inventory Routes (`/api/inventory`)

| Method | Endpoint | Auth | Module | Level |
|--------|----------|:----:|:------:|:-----:|
| GET | `/inventory` | ✓ | TECHNOLOGY | 1 |
| GET | `/inventory/stats` | ✓ | TECHNOLOGY | 1 |
| GET | `/inventory/:id` | ✓ | TECHNOLOGY | 1 |
| GET | `/inventory/:id/history` | ✓ | TECHNOLOGY | 1 |
| POST | `/inventory` | ✓ | TECHNOLOGY | 2 |
| PUT | `/inventory/:id` | ✓ | TECHNOLOGY | 2 |
| DELETE | `/inventory/:id` | ✓ | TECHNOLOGY | 2 |
| POST | `/inventory/bulk-update` | ✓ | TECHNOLOGY | 2 |
| POST | `/inventory/export` | ✓ | TECHNOLOGY | 1 |
| POST | `/inventory/import` | ✓ | TECHNOLOGY | 3 |
| GET | `/inventory/import` | ✓ | TECHNOLOGY | 3 |
| GET | `/inventory/import/:jobId` | ✓ | TECHNOLOGY | 3 |

### Equipment Assignment Routes (`/api/equipment`)

| Method | Endpoint | Auth | Module | Level |
|--------|----------|:----:|:------:|:-----:|
| GET | `/equipment/:id/assignment-history` | ✓ | TECHNOLOGY | 1 |
| GET | `/equipment/:id/current-assignment` | ✓ | TECHNOLOGY | 1 |
| POST | `/equipment/:id/assign` | ✓ | TECHNOLOGY | 2 |
| POST | `/equipment/:id/assign-room` | ✓ | TECHNOLOGY | 2 |
| POST | `/equipment/:id/unassign` | ✓ | TECHNOLOGY | 2 |
| POST | `/equipment/:id/transfer` | ✓ | TECHNOLOGY | 2 |
| GET | `/users/:userId/assigned-equipment` | ✓ | TECHNOLOGY | 1 |
| GET | `/rooms/:roomId/assigned-equipment` | ✓ | TECHNOLOGY | 1 |
| POST | `/equipment/bulk-assign` | ✓ | TECHNOLOGY | 3 |

### Reference Data Routes

| Method | Endpoint | Auth | Module | Level |
|--------|----------|:----:|:------:|:-----:|
| GET | `/brands`, `/brands/:id` | ✓ | TECHNOLOGY | 1 |
| POST | `/brands` | ✓ | TECHNOLOGY | 2 |
| PUT | `/brands/:id` | ✓ | TECHNOLOGY | 2 |
| DELETE | `/brands/:id` | ✓ | TECHNOLOGY | 2 |
| GET | `/vendors`, `/vendors/:id` | ✓ | — | — (auth only) |
| POST/PUT/DELETE | `/vendors` | ✓ | TECHNOLOGY | 2 |
| GET | `/categories`, `/categories/:id` | ✓ | TECHNOLOGY | 1 |
| POST/PUT/DELETE | `/categories` | ✓ | TECHNOLOGY | 2 |
| GET | `/equipment-models` | ✓ | TECHNOLOGY | 1 |
| POST/PUT/DELETE | `/equipment-models` | ✓ | TECHNOLOGY | 2 |

### Funding Source Routes (`/api/funding-sources`)

| Method | Endpoint | Auth | Module | Level | Notes |
|--------|----------|:----:|:------:|:-----:|-------|
| GET | `/funding-sources` | ✓ | TECHNOLOGY | 1 | |
| GET | `/funding-sources/:id` | ✓ | TECHNOLOGY | 1 | |
| POST | `/funding-sources` | ✓ | TECHNOLOGY | 2 | |
| PUT | `/funding-sources/:id` | ✓ | TECHNOLOGY | 2 | |
| DELETE | `/funding-sources/:id` | ✓ | TECHNOLOGY | 3 | Soft delete |
| DELETE | `/funding-sources/:id/hard` | ✓ | ADMIN role | — | Hard delete |

### Purchase Order Routes (`/api/purchase-orders`)

| Method | Endpoint | Auth | Module | Level | Notes |
|--------|----------|:----:|:------:|:-----:|-------|
| GET | `/purchase-orders` | ✓ | REQUISITIONS | 1 | Level 1: own only; Level 2+: all |
| POST | `/purchase-orders` | ✓ | REQUISITIONS | 2 | Create draft |
| GET | `/purchase-orders/:id` | ✓ | REQUISITIONS | 1 | Level 1: own only  |
| PUT | `/purchase-orders/:id` | ✓ | REQUISITIONS | 2 | Edit draft |
| DELETE | `/purchase-orders/:id` | ✓ | REQUISITIONS | 2 | Delete draft only |
| POST | `/purchase-orders/:id/submit` | ✓ | REQUISITIONS | 2 | Submit for review |
| POST | `/purchase-orders/:id/approve` | ✓ | REQUISITIONS | 3 | Supervisor/purchasing/DOS |
| POST | `/purchase-orders/:id/reject` | ✓ | REQUISITIONS | 3 | Reject at any stage |
| POST | `/purchase-orders/:id/account` | ✓ | REQUISITIONS | 4 | Assign account code |
| POST | `/purchase-orders/:id/issue` | ✓ | REQUISITIONS | 5 | Issue PO number |
| GET | `/purchase-orders/:id/pdf` | ✓ | REQUISITIONS | 1 | Download PDF |
| GET | `/purchase-orders/:id/history` | ✓ | REQUISITIONS | 1 | Status history |

### Location & Room Routes

| Method | Endpoint | Auth | Role | Notes |
|--------|----------|:----:|:----:|-------|
| GET/POST/PUT/DELETE | `/locations/*` | ✓ | — | Auth only — no module check |
| GET/POST/PUT/DELETE | `/rooms/*` | ✓ | — | Auth only — no module check |

### Admin / Settings Routes

| Method | Endpoint | Auth | Role | Notes |
|--------|----------|:----:|:----:|-------|
| GET | `/admin/sync-status` | ✓ | ADMIN | Current sync state and role breakdown |
| POST | `/admin/sync-users/all` | ✓ | ADMIN | Sync all Entra users |
| POST | `/admin/sync-users/staff` | ✓ | ADMIN | Sync All Staff group only |
| POST | `/admin/sync-users/students` | ✓ | ADMIN | Sync All Students group only |
| POST | `/admin/sync-users/group/:groupId` | ✓ | ADMIN | Sync a specific Entra group by GUID |
| ALL | `/admin/*` | ✓ | ADMIN | Catch-all admin guard |
| GET | `/settings` | ✓ | ADMIN | |
| PUT | `/settings` | ✓ | ADMIN | |

### CSRF Token Endpoint

| Method | Endpoint | Auth | Notes |
|--------|----------|:----:|-------|
| GET | `/csrf-token` | — | Returns CSRF token in header + cookie |

---

## 10. Security Considerations

### OWASP Top 10 Alignment

| OWASP Category | Risk | Tech-V2 Mitigation |
|----------------|------|--------------------|
| **A01 Broken Access Control** | High | `checkPermission` DB-backed; `requireAdmin` role gate; deny-by-default (403 on no match); CSRF; row-level scoping via `permLevel` |
| **A02 Cryptographic Failures** | High | Tokens in HttpOnly cookies (not localStorage); JWT signed with `JWT_SECRET` from env; HTTPS enforced in production (`secure: true`); `crypto.timingSafeEqual` for CSRF comparison |
| **A03 Injection** | High | Prisma ORM with parameterized queries — no raw SQL; Zod schema validation on all inputs |
| **A05 Security Misconfiguration** | Medium | `helmet()` middleware; CORS configured to allowed origins; rate limiting on all routes |
| **A07 Identification & Auth Failures** | High | Short JWT expiry (1h) with refresh token rotation; MFA enforced via Entra ID at login; no sensitive data in JWT payload |
| **A09 Security Logging & Monitoring** | Medium | Structured logging with request IDs; `logger.warn` on permission denials and expired tokens; `logger.debug` on grants |

### Principle of Least Privilege

- Users default to `VIEWER` with **no** module permissions.
- Module permissions must be **explicitly granted** (via Entra sync or manual admin assignment).
- REQUISITIONS level 1 users can only see their own POs — not the organization's full PO list.
- Import/bulk operations require the highest TECHNOLOGY level 3.
- Hard-delete of funding sources requires ADMIN role (bypasses module system entirely).

### Token Security

| Concern | Implementation |
|---------|--------------|
| Token storage | HttpOnly cookies — inaccessible to JavaScript |
| Token transport | `SameSite=Strict` cookie prevents cross-site submission |
| CSRF protection | Custom-header CSRF token (httpOnly `XSRF-TOKEN` cookie + `X-CSRF-Token` response header) with `timingSafeEqual` comparison |
| Token expiry | Access token: 1 hour; refresh token: configurable |
| Token rotation | Refresh tokens are rotated on use |

### Permission Expiry

`UserPermission.expiresAt` allows time-limited grants. `checkPermission` validates expiry on **every request**. An expired permission returns `403 Forbidden` in most cases — with one edge case: if a user simultaneously holds an expired higher-level permission and a valid lower-level permission for the same module, the expired record may be selected first by `find()` (which has no explicit sort order), causing a false `403` even though a valid lower-level grant exists. See [Known Limitation in §7.4](#74-checkpermission-middleware) and the [FAQ entry below](#q-user-gets-403-even-though-they-have-a-valid-lower-level-permission-for-the-module). Expired permissions should be cleaned up promptly via `PUT /api/users/:id/permissions`.

### ADMIN Role Risk

The `ADMIN` role bypasses `checkPermission` entirely. ADMINs with full access must be:
- Protected with MFA via Entra ID
- Limited to the 3 Entra groups that map to ADMIN (`ENTRA_ADMIN_GROUP_ID`, `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID`, `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID`)
- Audited regularly for group membership

### Rate Limiting

| Endpoint Category | Limit |
|------------------|-------|
| General API | 500 requests / 15 min per IP |
| Auth endpoints (login) | 20 requests / 15 min per IP |

### Input Validation

`validateRequest` (Zod schema) runs **before** permission checks — invalid input is rejected early, before any DB query or permission DB lookup is performed.

---

## 11. Adding Permissions to New Features

### Step 1: Backend — Protect a New Route

```typescript
// 1. Import the middleware
import { authenticate, requireAdmin } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { validateCsrfToken } from '../middleware/csrf';
import { validateRequest } from '../middleware/validation';

// 2. Add to your route file
// Example: a new module for document management

// Read-only route — minimum level 1
// validateRequest runs BEFORE checkPermission: bad input is rejected before any DB query
router.get(
  '/documents',
  authenticate,
  validateRequest(GetDocumentsQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 1),   // change module/level as appropriate
  getDocuments
);

// Write route — minimum level 2 + CSRF
// Order: authenticate → validateCsrfToken → validateRequest → checkPermission → controller
router.post(
  '/documents',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateDocumentSchema, 'body'),
  checkPermission('TECHNOLOGY', 2),
  createDocument
);

// Admin-only route — use requireAdmin instead of checkPermission
router.delete(
  '/documents/:id/purge',
  authenticate,
  validateCsrfToken,
  validateRequest(DocumentIdParamSchema, 'params'),
  requireAdmin,
  purgeDocument
);
```

### Step 2: Backend — Use `permLevel` for Row-Level Scoping

```typescript
// In your controller
export const getDocuments = async (req: AuthRequest, res: Response) => {
  const permLevel = req.user!.permLevel!;

  // Level 1: own documents only
  // Level 2+: all documents
  const where = permLevel >= 2 ? {} : { ownerId: req.user!.id };

  const documents = await prisma.document.findMany({ where });
  res.json(documents);
};
```

### Step 3: Add a New Module (if required)

If your feature is a genuinely new functional domain, add a new module:

1. **Add to `PermissionModule` type** in `backend/src/middleware/permissions.ts`:

```typescript
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'REQUISITIONS'
  | 'DOCUMENTS'; // new module
```

2. **Update the shared type** in `shared/src/types.ts`:

```typescript
export type PermissionModule =
  | 'TECHNOLOGY'
  // ... existing ...
  | 'DOCUMENTS';
```

3. **Seed the new permission records** in `prisma/seed.ts`:

```typescript
const newPermissions = [
  { module: 'DOCUMENTS', level: 1, name: 'Viewer', description: 'View documents' },
  { module: 'DOCUMENTS', level: 2, name: 'Editor', description: 'Create and edit documents' },
  { module: 'DOCUMENTS', level: 3, name: 'Manager', description: 'Full document management' },
];

for (const perm of newPermissions) {
  await prisma.permission.upsert({
    where: { module_level: { module: perm.module, level: perm.level } },
    update: {},
    create: perm,
  });
}
```

4. **Update `UserSyncService.getRoleFromGroups()`** to include the new module in appropriate group bundles.

### Step 4: Frontend — Guard a New Page

```tsx
// In App.tsx or your router config
import { ProtectedRoute } from './components/ProtectedRoute';

// For any authenticated user (backend enforces module permission)
<Route
  path="/documents"
  element={
    <ProtectedRoute>
      <DocumentsPage />
    </ProtectedRoute>
  }
/>

// For admin-only pages
<Route
  path="/documents/admin"
  element={
    <ProtectedRoute requireAdmin={true}>
      <DocumentsAdminPage />
    </ProtectedRoute>
  }
/>
```

### Step 5: Frontend — Conditionally Show Features Based on Role

```tsx
// Use the auth store to read the user's role
import { useAuthStore } from '../store/authStore';

const DocumentsPage = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');

  return (
    <div>
      <DocumentList />
      {/* Only show admin controls for ADMIN role */}
      {isAdmin && <DocumentAdminPanel />}
    </div>
  );
};
```

> **Note:** Role-based UI hiding is a UX convenience. The backend always enforces the authoritative permission check. Never rely on frontend hiding for security.

### Step 6: Assign Permissions to Users for the New Feature

```bash
# Via the admin API (as ADMIN user)
PUT /api/users/:userId/permissions
Content-Type: application/json

{
  "permissions": [
    { "module": "DOCUMENTS", "level": 2 }
  ]
}
```

Or update the Entra group bundles in `UserSyncService` so users automatically receive the new permission on next login.

### Step 7: Testing Permissions

Test each permission boundary:

```typescript
// Example test cases for a new route
describe('GET /documents', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER with no module permissions', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', viewerTokenCookie);
    expect(res.status).toBe(403);
  });

  it('returns 200 for user with DOCUMENTS:1', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', documentsLevel1Cookie);
    expect(res.status).toBe(200);
  });

  it('returns 200 for ADMIN regardless of module permissions', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', adminTokenCookie);
    expect(res.status).toBe(200);
  });
});
```

---

## 12. Troubleshooting & FAQ

### Q: A user gets 403 but should have access — how do I diagnose?

1. **Check `UserPermission` records** via the admin UI (`/users` → select user → Permissions tab) or directly:
   ```sql
   SELECT p.module, p.level, p.name, up."expiresAt", up."grantedBy"
   FROM user_permissions up
   JOIN permissions p ON p.id = up."permissionId"
   WHERE up."userId" = '<user-uuid>';
   ```

2. **Check token expiry** — the user may need to log out and back in to pick up new permissions (the JWT caches the `groups` array; permissions are fetched DB-live but require authentication).

3. **Check `expiresAt`** — the permission may have expired. Null = permanent; a date in the past = expired.

4. **Check the user's role** — if they should be ADMIN, verify their Entra group membership includes the correct group ID set in `ENTRA_ADMIN_GROUP_ID`.

5. **Check the logs** — `checkPermission` logs `logger.warn('Permission denied', { userId, module, requiredLevel })` on every 403.

---

### Q: Why does an ADMIN get `permLevel = 5` even when the route only requires level 1?

By design — `ADMIN` bypasses the DB query entirely and receives the maximum `permLevel = 5`. This avoids the DB overhead and ensures system administrators are never blocked by missing `UserPermission` records.

---

### Q: Can a user have permissions in a module their group doesn't normally grant?

Yes. An admin can manually assign any `(module, level)` combination via `PUT /api/users/:id/permissions`. The Entra sync will reset permissions the **next time the user logs in** (if the user's groups haven't changed to match the new permissions). To make a manual grant permanent, the preferred approach is to add the user to the appropriate Entra group.

---

### Q: What happens if the `permissions` DB table is empty or a module has no records?

`checkPermission` queries `UserPermission`, which holds per-user grants. If there are no `Permission` catalogue records, admin seeding (`npm run prisma:seed`) is needed. Without the seed, `UserSyncService` cannot resolve permission IDs and `updatePermissions` will fail silently (no `UserPermission` records created).

---

### Q: The frontend shows the user as authenticated but API calls return 401.

The JWT cookie has expired. The frontend's `isAuthenticated` in Zustand (`localStorage`) persists across page reloads, but the actual cookie may have expired. The axios interceptor should catch the 401 and trigger a token refresh. If refresh also fails (refresh token expired), the user is redirected to `/login` and `clearAuth()` is called.

---

### Q: How do I grant a temporary permission (e.g., for a contractor)?

Use the admin permissions API and set `expiresAt`:

```bash
# Not directly exposed in the current API type, but the DB supports it.
# Temporary grants should be set via the admin UI or a direct DB update:
UPDATE user_permissions
SET "expiresAt" = '2026-04-01 00:00:00'
WHERE "userId" = '<user-uuid>'
  AND "permissionId" = (
    SELECT id FROM permissions WHERE module = 'TECHNOLOGY' AND level = 2
  );
```

The next `checkPermission` call for that user after the expiry date will return 403.

---

### Q: What is the difference between `roles` and `groups` in the JWT?

| Field | Content | Used By |
|-------|---------|---------|
| `roles` | Application role strings: `['ADMIN']` | `requireAdmin`, `checkPermission` ADMIN bypass, frontend `ProtectedRoute` |
| `groups` | Raw Entra Group GUIDs: `['abc-123', ...]` | `requireAdmin` fallback check (`requireGroup`) |

`roles` is the application's interpretation of group membership. `groups` is the raw Entra data and is used as a secondary check in `requireAdmin`.

---

### Q: CSRF errors on POST requests — how to fix?

1. Ensure the frontend fetches the CSRF token from `GET /api/csrf-token` (or reads `X-CSRF-Token` from a prior response header).
2. Ensure the token is sent as the `x-xsrf-token` request header on all `POST`/`PUT`/`PATCH`/`DELETE` requests.
3. Check the `XSRF-TOKEN` cookie is present in the browser. If it was cleared, a new GET request to any endpoint that uses `provideCsrfToken` will regenerate it.
4. In development, verify `sameSite` and `secure` cookie settings don't block the cookie on `http://localhost`.

---

### Q: How do I add a new Entra group to the role mapping?

1. Add the new group ID env variable to `.env`:
   ```
   ENTRA_NEW_GROUP_ID=<guid>
   ```

2. Add the mapping in `backend/src/services/userSync.service.ts` in `getRoleFromGroups()`, at the appropriate priority position.

3. Add the permission bundle for the new group to the `groupPermissions` map in the same function.

4. Update this documentation (Section 2 — Roles Catalogue).

---

### Q: User gets 403 even though they have a valid lower-level permission for the module

This is caused by the **expiry check ordering** in `checkPermission`. The initial `find()` gate does not filter by expiry before selecting a candidate record. If the user holds:

- `TECHNOLOGY:3` — **expired**
- `TECHNOLOGY:1` — **valid**

…and a route requires `TECHNOLOGY:1`, `find()` may return `TECHNOLOGY:3` first (the `findMany` result has no guaranteed order). The expiry check fires on that record and returns `403` before `TECHNOLOGY:1` is ever evaluated.

**Diagnosis:**
```sql
SELECT p.module, p.level, p.name, up."expiresAt"
FROM user_permissions up
JOIN permissions p ON p.id = up."permissionId"
WHERE up."userId" = '<user-uuid>'
  AND p.module = 'TECHNOLOGY'
ORDER BY p.level DESC;
```

If you see a higher-level record with a past `expiresAt` and a lower-level record with `NULL` or a future `expiresAt`, that is the cause.

**Fix:** Remove the expired record by resubmitting the full permission set without it:
```bash
PUT /api/users/:userId/permissions
{ "permissions": [{ "module": "TECHNOLOGY", "level": 1 }] }
```
The `PUT` endpoint uses an atomic delete + recreate transaction, which removes the stale higher-level record.

---

### Q: An admin granted a user new permissions, but the user still gets 403

Module permission records take effect **immediately** — `checkPermission` queries the DB live on every request. No re-login is required for changes to `UserPermission` records (module levels).

The exception is the **`role` field** (e.g., `ADMIN`, `MANAGER`). The application role is stored in the JWT and is only refreshed when the user logs in again. If an admin changes a user's Entra group membership (which controls the role), or manually updates `user.role` via `PUT /api/users/:id/role`, the user's JWT still carries the old role for up to 1 hour. In that window, `requireAdmin` and the ADMIN bypass in `checkPermission` will still use the stale role. The user must log out and back in for role changes to take effect in the JWT.

**Summary:**
| Change type | Takes effect |
|-------------|-------------|
| `UserPermission` record change (module levels) | Immediately — next API request |
| `user.role` field change | On next login (JWT expiry window, max 1 hour) |

---

*For broader system documentation, see [docs/MASTER_PLAN.md](MASTER_PLAN.md) and [docs/requisition_flow.md](requisition_flow.md).*

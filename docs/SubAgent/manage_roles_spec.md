# Manage Roles — Feature Specification

> **Document Type:** Research & Specification (Phase 1 SubAgent Output)
> **Feature:** Manage Roles / Permission Profiles admin page
> **Author:** Research SubAgent
> **Date:** 2026-03-12
> **Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Codebase Research Findings](#2-codebase-research-findings)
3. [Design Approach Selection](#3-design-approach-selection)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Backend API Specification](#5-backend-api-specification)
6. [Frontend Specification](#6-frontend-specification)
7. [Integration with Existing Systems](#7-integration-with-existing-systems)
8. [Security Considerations](#8-security-considerations)
9. [Data Migration & Seeding](#9-data-migration--seeding)
10. [File Change Summary](#10-file-change-summary)
11. [Research Sources & Best Practices](#11-research-sources--best-practices)

---

## 1. Executive Summary

### Feature Description

A **Manage Roles** admin page (`/admin/roles`) that allows ADMIN users to:
1. View all named permission profiles (e.g., "Principal", "Technology Admin", "All Staff")
2. Create new permission profiles with per-module permission levels
3. Edit existing profiles
4. Delete custom profiles
5. Apply a profile to a user from the Users page as a "quick-apply template"

### Chosen Approach: Option C — Permission Profiles + Core Role Reference

Tech-V2's permission model differs fundamentally from Manage1to1:
- Tech-V2 has 4 **fixed app roles** (`ADMIN`, `MANAGER`, `TECHNICIAN`, `VIEWER`) assigned from Entra ID groups — these are NOT editable
- Permissions are module-level integers (`TECHNOLOGY:1`, `REQUISITIONS:3`, etc.) rather than individual feature checkboxes
- The permission matrix is currently hardcoded in `UserSyncService` constructor

**The chosen approach** introduces a new `RoleProfile` concept: named permission **templates** (profiles) that:
- Are stored in the database (new `role_profiles` + `role_profile_permissions` tables)
- Can be created, edited, and deleted by admins
- Are seeded with pre-built profiles that match the existing Entra group → permission mappings
- Can be **applied to individual users** from the Users page (overrides their current permissions)
- Are shown on the Manage Roles list page in a format matching the Manage1to1 screenshots

**Why Option C over Option A or B:**

| Option | Problem |
|--------|---------|
| Option A: Edit default levels per app role | The 4 app roles are too coarse. Principals and Vice Principals share `MANAGER` role but might need different profiles. Modifying the sync service defaults is risky and not user-friendly. |
| Option B: Pure named custom roles only | No reference to the existing system. Admins lose context about what each profile maps to in the Entra → Role flow. |
| **Option C: Hybrid** | ✅ Profiles are standalone named templates. Seeded profiles mirror existing Entra group mappings. Admins can create custom profiles (e.g., "Librarian"). Profiles can be applied to users. No breakage to existing sync behavior. |

---

## 2. Codebase Research Findings

### 2.1 Backend Architecture

**Entry point:** `backend/src/server.ts`

**Route pattern:**
```typescript
router.use(authenticate);
router.use(requireAdmin);
router.use(validateCsrfToken);  // All state-mutating routes
router.get('/', validateRequest(QuerySchema, 'query'), controller.getAll);
router.post('/', validateRequest(BodySchema, 'body'), controller.create);
```

**Controller pattern:** Thin wrappers around service classes
```typescript
export const getAll = async (req: Request, res: Response) => {
  try {
    const result = await service.findAll();
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

**Service classes:** Injected with `PrismaClient` in constructor. Business logic lives here.

**Validators:** Zod schemas in `backend/src/validators/`, applied via `validateRequest` middleware.

**Error handling:** `handleControllerError(error, res)` from `utils/errorHandler.ts`

**Auth middleware:**
- `authenticate` — validates JWT from HttpOnly cookie, populates `req.user`
- `requireAdmin` — checks `req.user.roles[0] === 'ADMIN'`
- `validateCsrfToken` — validates `x-xsrf-token` header against cookie

### 2.2 Frontend Architecture

**Routing:** React Router v6 in `App.tsx`. Admin routes use `<ProtectedRoute requireAdmin>`.

**Data pattern:**
```
services/ (axios calls) → hooks/queries/ (useQuery) → pages/ (components)
                       → hooks/mutations/ (useMutation)
```

**Query keys:** Centralized in `frontend/src/lib/queryKeys.ts`.

**UI:** Mix of raw CSS classes (custom stylesheet) and MUI components. `AdminSettings.tsx` uses MUI throughout (Box, Card, Stack, TextField, Button). `Users.tsx` and `SupervisorManagement.tsx` use custom CSS. New admin pages should follow the MUI pattern established in `AdminSettings.tsx`.

**CSRF:** `api.ts` interceptor reads `X-CSRF-Token` response header and injects `x-xsrf-token` on mutating requests. All backend state changes via this axios instance are automatically CSRF-protected.

**Navigation:** `AppLayout.tsx` → `NAV_SECTIONS` array with `adminOnly: true` flag hides items for non-admins.

### 2.3 Permission System

**Existing tables:**
- `permissions` — 17 rows, catalogue of `(module, level)` pairs
- `user_permissions` — junction table: user ↔ permission (with `grantedBy`, `expiresAt`)
- `users.role` — the coarse-grained app role (ADMIN/MANAGER/TECHNICIAN/VIEWER)

**Sync flow:** `UserSyncService.getRoleFromGroups()` maps Entra group IDs → `{ role, permissions[] }`. Permissions are upserted at login/sync time. Currently hardcoded in service constructor.

**Key insight:** The 4 app roles + module permissions are **independent** axes. A user can have `role=VIEWER` but `REQUISITIONS:5` permission. The `RoleProfile` system lives entirely in the permission axis; it does not change the app role.

### 2.4 Existing Admin Pages Reviewed

| Page | Route | Auth | Pattern |
|------|-------|------|---------|
| `Users.tsx` | `/users` | `requireAdmin` | Custom CSS + modals for permissions/supervisors |
| `AdminSettings.tsx` | `/admin/settings` | `requireAdmin` | MUI Card/Stack/TextField with React Hook Form + Zod |
| `SupervisorManagement.tsx` | `/supervisors` | `requireAdmin` | Custom CSS + modals for location/supervisor management |
| `ReferenceDataManagement.tsx` | `/reference-data` | `requireAdmin` | Tabbed page with modals |

**New page should follow:** `AdminSettings.tsx` MUI pattern — clean, consistent with MUI ecosystem already imported.

---

## 3. Design Approach Selection

### 3.1 Data Model Concept

```
RoleProfile (e.g., "Principal")
  └── RoleProfilePermission[]
        ├── module: TECHNOLOGY,  level: 2
        ├── module: MAINTENANCE, level: 2
        ├── module: REQUISITIONS, level: 3
        └── module: PROFESSIONAL_DEV, level: 1
```

- A profile has **at most one entry per module** (enforced by `@@unique([profileId, module])`)
- Level `0` or no entry = no access to that module
- Applying a profile to a user calls `userService.updatePermissions()` with the profile's module/level pairs

### 3.2 UI Concept

**List Page (`/admin/roles`):**
```
┌─────────────────────────────────────────────────────────┐
│  Permission Profiles                       [+ Add Profile] │
│  ─────────────────────────────────────────────────────── │
│  Name             │ Description              │ Actions    │
│  ─────────────────┼──────────────────────────┼─────────── │
│  All Staff        │ Standard staff access... │ [Edit]     │
│  Principal        │ School principal...      │ [Edit][Del]│
│  Technology Admin │ Full tech department...  │ [Edit][Del]│
│  Finance Director │ Financial oversight...   │ [Edit][Del]│
│  Librarian        │ Custom profile           │ [Edit][Del]│
└─────────────────────────────────────────────────────────┘
```

System profiles (seeded) show [Edit] only (no delete). Custom admin-created profiles show [Edit][Delete].

**Create/Edit Dialog:**
```
┌────────────────────────────────────────────────────────────┐
│  Edit Profile: "Principal"                              [X] │
│  ──────────────────────────────────────────────────────── │
│  Name: [Principal                              ]           │
│  Description: [School principal permission set ]           │
│                                                            │
│  Module Permissions:                                       │
│                                                            │
│  TECHNOLOGY                                                │
│  ○ No Access  ● Level 1 - General User                    │
│               ○ Level 2 - Principal/School Tech            │
│               ○ Level 3 - Technology Department            │
│                                                            │
│  MAINTENANCE                                               │
│  ○ No Access  ○ Level 1 - General User                    │
│               ● Level 2 - Principal/School Maintenance     │
│               ○ Level 3 - Supervisor of Maintenance        │
│                                                            │
│  REQUISITIONS                                              │
│  ○ No Access  ○ Level 1 - Viewer                          │
│               ○ Level 2 - General User                     │
│               ● Level 3 - Supervisor                       │
│               ○ Level 4 - Purchasing Staff                 │
│               ○ Level 5 - Director of Services             │
│                                                            │
│  PROFESSIONAL_DEV                                          │
│  ○ No Access  ● Level 1 - Access                          │
│                                                            │
│  SPECIAL_ED                                                │
│  ● No Access  ○ Level 1 - Access                          │
│                                                            │
│  TRANSCRIPTS                                               │
│  ● No Access  ○ Level 1 - Access                          │
│                                                            │
│                           [Cancel]  [Save Changes]         │
└────────────────────────────────────────────────────────────┘
```

**Apply Profile (from Users page):**
- Existing permissions modal on Users page gets an "Apply Profile" button
- Clicking shows a dropdown of all active profiles
- Selecting a profile pre-populates the module checkboxes in the permission modal
- User clicks Save to apply

---

## 4. Database Schema Changes

### 4.1 New Prisma Models

Add to `backend/prisma/schema.prisma`:

```prisma
// ============================================================
// PERMISSION PROFILES — Named permission templates for quick-apply
// ============================================================

model RoleProfile {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  isActive    Boolean  @default(true)
  isSystem    Boolean  @default(false)  // true = seeded; cannot be deleted via API
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?  // userId of admin who created it (null for system profiles)

  permissions RoleProfilePermission[]

  @@index([isActive])
  @@map("role_profiles")
}

model RoleProfilePermission {
  id        String   @id @default(uuid())
  profileId String
  module    String   // e.g., 'TECHNOLOGY' — validated against PermissionModule enum
  level     Int      // 1-5 (0 = no access, omit entry instead)
  createdAt DateTime @default(now())

  profile   RoleProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, module])
  @@index([profileId])
  @@map("role_profile_permissions")
}
```

### 4.2 Migration

Generate and run migration:
```bash
cd backend
npx prisma migrate dev --name add_role_profiles
```

This creates tables:
- `role_profiles` — stores profile metadata
- `role_profile_permissions` — stores per-module level assignments per profile

### 4.3 Schema Notes

- `isSystem: true` profiles are seeded and **cannot be deleted** via the API (enforced in service layer)
- `level` is stored directly, not as FK to `permissions` table, to avoid coupling to the permissions catalogue
- `@@unique([profileId, module])` ensures one level per module per profile
- `createdBy` is nullable to support system-seeded profiles

---

## 5. Backend API Specification

### 5.1 New Route File

**File:** `backend/src/routes/roles.routes.ts`

```typescript
import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateCsrfToken } from '../middleware/csrf';
import { validateRequest } from '../middleware/validation';
import {
  RoleProfileIdParamSchema,
  CreateRoleProfileSchema,
  UpdateRoleProfileSchema,
  ApplyRoleProfileParamsSchema,
} from '../validators/roles.validators';
import {
  getRoleProfiles,
  getRoleProfileById,
  createRoleProfile,
  updateRoleProfile,
  deleteRoleProfile,
  applyRoleProfile,
} from '../controllers/roles.controller';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Apply CSRF protection to all state-changing routes
router.use(validateCsrfToken);

// GET /api/roles — list all profiles
router.get('/', getRoleProfiles);

// GET /api/roles/:id — get single profile with permissions
router.get('/:id', validateRequest(RoleProfileIdParamSchema, 'params'), getRoleProfileById);

// POST /api/roles — create new profile
router.post('/', validateRequest(CreateRoleProfileSchema, 'body'), createRoleProfile);

// PUT /api/roles/:id — update profile
router.put(
  '/:id',
  validateRequest(RoleProfileIdParamSchema, 'params'),
  validateRequest(UpdateRoleProfileSchema, 'body'),
  updateRoleProfile
);

// DELETE /api/roles/:id — delete profile (system profiles blocked in service)
router.delete('/:id', validateRequest(RoleProfileIdParamSchema, 'params'), deleteRoleProfile);

// POST /api/roles/:id/apply/:userId — apply profile to user
router.post(
  '/:id/apply/:userId',
  validateRequest(ApplyRoleProfileParamsSchema, 'params'),
  applyRoleProfile
);

export default router;
```

### 5.2 Validators

**File:** `backend/src/validators/roles.validators.ts`

```typescript
import { z } from 'zod';

const VALID_MODULES = [
  'TECHNOLOGY',
  'MAINTENANCE',
  'REQUISITIONS',
  'PROFESSIONAL_DEV',
  'SPECIAL_ED',
  'TRANSCRIPTS',
] as const;

export const RoleProfileIdParamSchema = z.object({
  id: z.string().uuid('Invalid profile ID format'),
});

export const ApplyRoleProfileParamsSchema = z.object({
  id: z.string().uuid('Invalid profile ID format'),
  userId: z.string().uuid('Invalid user ID format'),
});

const RoleProfilePermissionItemSchema = z.object({
  module: z.enum(VALID_MODULES),
  level: z.number().int().min(1).max(5),
});

export const CreateRoleProfileSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).optional(),
  permissions: z.array(RoleProfilePermissionItemSchema).max(6), // max 1 per module
});

export const UpdateRoleProfileSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(RoleProfilePermissionItemSchema).max(6).optional(),
});

// Exported TypeScript types
export type CreateRoleProfileBody = z.infer<typeof CreateRoleProfileSchema>;
export type UpdateRoleProfileBody = z.infer<typeof UpdateRoleProfileSchema>;
```

### 5.3 Service

**File:** `backend/src/services/roles.service.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';
import { UserService } from './user.service';

interface PermissionItem {
  module: string;
  level: number;
}

interface CreateProfileInput {
  name: string;
  description?: string;
  permissions: PermissionItem[];
  createdBy?: string;
}

interface UpdateProfileInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  permissions?: PermissionItem[];
}

export class RolesService {
  private userService: UserService;

  constructor(private prisma: PrismaClient) {
    this.userService = new UserService(prisma);
  }

  /**
   * Get all role profiles with their permissions
   */
  async findAll() {
    return this.prisma.roleProfile.findMany({
      include: {
        permissions: {
          orderBy: { module: 'asc' },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Get a single role profile by ID
   */
  async findById(id: string) {
    const profile = await this.prisma.roleProfile.findUnique({
      where: { id },
      include: {
        permissions: {
          orderBy: { module: 'asc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundError(`Role profile not found: ${id}`);
    }

    return profile;
  }

  /**
   * Create a new role profile
   */
  async create(input: CreateProfileInput) {
    // Validate no duplicate modules in input
    const modules = input.permissions.map((p) => p.module);
    const uniqueModules = new Set(modules);
    if (modules.length !== uniqueModules.size) {
      throw new ValidationError('Duplicate modules in permissions array');
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.roleProfile.create({
        data: {
          name: input.name,
          description: input.description,
          createdBy: input.createdBy,
          isSystem: false,
          permissions: {
            create: input.permissions.map((p) => ({
              module: p.module,
              level: p.level,
            })),
          },
        },
        include: {
          permissions: { orderBy: { module: 'asc' } },
        },
      });
    });
  }

  /**
   * Update a role profile
   */
  async update(id: string, input: UpdateProfileInput) {
    const existing = await this.findById(id);

    // Validate no duplicate modules in input
    if (input.permissions) {
      const modules = input.permissions.map((p) => p.module);
      const uniqueModules = new Set(modules);
      if (modules.length !== uniqueModules.size) {
        throw new ValidationError('Duplicate modules in permissions array');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // If permissions provided, replace them atomically
      if (input.permissions !== undefined) {
        await tx.roleProfilePermission.deleteMany({ where: { profileId: id } });
        await tx.roleProfilePermission.createMany({
          data: input.permissions.map((p) => ({
            profileId: id,
            module: p.module,
            level: p.level,
          })),
        });
      }

      return tx.roleProfile.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
        include: {
          permissions: { orderBy: { module: 'asc' } },
        },
      });
    });
  }

  /**
   * Delete a role profile.
   * System profiles (isSystem=true) cannot be deleted.
   */
  async delete(id: string) {
    const existing = await this.findById(id);

    if (existing.isSystem) {
      throw new ValidationError(
        'System profiles cannot be deleted. You may disable them by setting isActive=false.'
      );
    }

    // Cascade delete via Prisma relation
    return this.prisma.roleProfile.delete({ where: { id } });
  }

  /**
   * Apply a role profile to a user:
   * Replaces the user's UserPermission records with those from the profile.
   */
  async applyToUser(profileId: string, userId: string, adminUserId: string) {
    const profile = await this.findById(profileId);

    if (!profile.isActive) {
      throw new ValidationError('Cannot apply an inactive role profile');
    }

    // Convert profile permissions to the format expected by userService.updatePermissions
    const permissions = profile.permissions.map((p) => ({
      module: p.module,
      level: p.level,
    }));

    // Delegate to existing userService (which handles the atomic upsert)
    return this.userService.updatePermissions(userId, permissions, adminUserId);
  }
}
```

### 5.4 Controller

**File:** `backend/src/controllers/roles.controller.ts`

```typescript
import { Request, Response } from 'express';
import { RolesService } from '../services/roles.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const rolesService = new RolesService(prisma);

export const getRoleProfiles = async (req: Request, res: Response) => {
  try {
    const profiles = await rolesService.findAll();
    res.json({ profiles });
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getRoleProfileById = async (req: Request, res: Response) => {
  try {
    const profile = await rolesService.findById(req.params.id);
    res.json({ profile });
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const createRoleProfile = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.id || 'system';
    const profile = await rolesService.create({ ...req.body, createdBy: adminId });
    res.status(201).json({ profile });
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const updateRoleProfile = async (req: Request, res: Response) => {
  try {
    const profile = await rolesService.update(req.params.id, req.body);
    res.json({ profile });
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const deleteRoleProfile = async (req: Request, res: Response) => {
  try {
    await rolesService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const applyRoleProfile = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.id || 'system';
    const updatedUser = await rolesService.applyToUser(
      req.params.id,
      req.params.userId,
      adminId
    );
    res.json({ user: updatedUser });
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 5.5 Register Route in Server

**File:** `backend/src/server.ts` — add at the route registration block:

```typescript
import rolesRouter from './routes/roles.routes';
// ...
app.use('/api/roles', rolesRouter);
```

### 5.6 API Response Shapes

**GET /api/roles:**
```json
{
  "profiles": [
    {
      "id": "uuid",
      "name": "Principal",
      "description": "School principal permission set",
      "isActive": true,
      "isSystem": true,
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z",
      "createdBy": null,
      "permissions": [
        { "id": "uuid", "profileId": "uuid", "module": "MAINTENANCE",     "level": 2, "createdAt": "..." },
        { "id": "uuid", "profileId": "uuid", "module": "PROFESSIONAL_DEV","level": 1, "createdAt": "..." },
        { "id": "uuid", "profileId": "uuid", "module": "REQUISITIONS",    "level": 3, "createdAt": "..." },
        { "id": "uuid", "profileId": "uuid", "module": "TECHNOLOGY",      "level": 2, "createdAt": "..." }
      ]
    }
  ]
}
```

**POST /api/roles** (201 Created):
```json
{
  "profile": { /* same shape as above */ }
}
```

**PUT /api/roles/:id** (200 OK):
```json
{
  "profile": { /* updated profile */ }
}
```

**DELETE /api/roles/:id** (204 No Content)

**POST /api/roles/:id/apply/:userId** (200 OK):
```json
{
  "user": { /* full user object with updated permissions */ }
}
```

---

## 6. Frontend Specification

### 6.1 New Files

```
frontend/src/
├── pages/
│   └── ManageRoles.tsx              ← List page + create/edit dialog
├── services/
│   └── rolesService.ts              ← API calls
├── hooks/
│   ├── queries/
│   │   └── useRoles.ts              ← useQuery hooks
│   └── mutations/
│       └── useRoleMutations.ts      ← useMutation hooks
└── types/
    └── roles.types.ts               ← TypeScript interfaces
```

### 6.2 TypeScript Types

**File:** `frontend/src/types/roles.types.ts`

```typescript
export const PERMISSION_MODULES = [
  'TECHNOLOGY',
  'MAINTENANCE',
  'REQUISITIONS',
  'PROFESSIONAL_DEV',
  'SPECIAL_ED',
  'TRANSCRIPTS',
] as const;

export type PermissionModule = typeof PERMISSION_MODULES[number];

export const MODULE_LABELS: Record<PermissionModule, string> = {
  TECHNOLOGY: 'Technology',
  MAINTENANCE: 'Maintenance',
  REQUISITIONS: 'Requisitions',
  PROFESSIONAL_DEV: 'Professional Development',
  SPECIAL_ED: 'Special Education',
  TRANSCRIPTS: 'Transcripts',
};

// Maps module → available levels (in order)
// Level 0 is represented by "No Access" (no entry in permissions array)
export const MODULE_LEVELS: Record<PermissionModule, { level: number; name: string; description: string }[]> = {
  TECHNOLOGY: [
    { level: 1, name: 'General User', description: 'View-only technology access' },
    { level: 2, name: 'Principal / School Tech', description: 'School-level technology management' },
    { level: 3, name: 'Technology Department', description: 'Full technology administration' },
  ],
  MAINTENANCE: [
    { level: 1, name: 'General User', description: 'View maintenance orders; create basic requests' },
    { level: 2, name: 'Principal / School Maintenance', description: 'School-level maintenance management' },
    { level: 3, name: 'Supervisor of Maintenance', description: 'Full maintenance oversight' },
  ],
  REQUISITIONS: [
    { level: 1, name: 'Viewer', description: 'View own purchase orders only' },
    { level: 2, name: 'General User', description: 'Create and manage own purchase orders' },
    { level: 3, name: 'Supervisor', description: 'First-stage approval authority; sees all POs' },
    { level: 4, name: 'Purchasing Staff', description: 'Assign account codes' },
    { level: 5, name: 'Director of Services', description: 'Final approval and PO issuance' },
  ],
  PROFESSIONAL_DEV: [
    { level: 1, name: 'Access', description: 'Full professional development module access' },
  ],
  SPECIAL_ED: [
    { level: 1, name: 'Access', description: 'Full special education module access' },
  ],
  TRANSCRIPTS: [
    { level: 1, name: 'Access', description: 'Full transcript module access' },
  ],
};

export interface RoleProfilePermission {
  id: string;
  profileId: string;
  module: PermissionModule;
  level: number;
  createdAt: string;
}

export interface RoleProfile {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  permissions: RoleProfilePermission[];
}

export interface CreateRoleProfileInput {
  name: string;
  description?: string;
  permissions: Array<{ module: PermissionModule; level: number }>;
}

export interface UpdateRoleProfileInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  permissions?: Array<{ module: PermissionModule; level: number }>;
}

// Helper: convert permissions array to a map { module → level }
export function profileToModuleMap(profile: RoleProfile): Partial<Record<PermissionModule, number>> {
  const map: Partial<Record<PermissionModule, number>> = {};
  for (const p of profile.permissions) {
    map[p.module] = p.level;
  }
  return map;
}

// Helper: convert module map back to permissions array (omit entries with level=0 or undefined)
export function moduleMapToPermissions(
  map: Partial<Record<PermissionModule, number>>
): Array<{ module: PermissionModule; level: number }> {
  return Object.entries(map)
    .filter(([, level]) => level && level > 0)
    .map(([module, level]) => ({ module: module as PermissionModule, level: level! }));
}
```

### 6.3 Service

**File:** `frontend/src/services/rolesService.ts`

```typescript
import { api } from './api';
import {
  RoleProfile,
  CreateRoleProfileInput,
  UpdateRoleProfileInput,
} from '../types/roles.types';

export const rolesService = {
  getAll: async (): Promise<RoleProfile[]> => {
    const response = await api.get('/roles');
    return response.data.profiles;
  },

  getById: async (id: string): Promise<RoleProfile> => {
    const response = await api.get(`/roles/${id}`);
    return response.data.profile;
  },

  create: async (input: CreateRoleProfileInput): Promise<RoleProfile> => {
    const response = await api.post('/roles', input);
    return response.data.profile;
  },

  update: async (id: string, input: UpdateRoleProfileInput): Promise<RoleProfile> => {
    const response = await api.put(`/roles/${id}`, input);
    return response.data.profile;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/roles/${id}`);
  },

  applyToUser: async (profileId: string, userId: string): Promise<any> => {
    const response = await api.post(`/roles/${profileId}/apply/${userId}`);
    return response.data.user;
  },
};
```

### 6.4 Query Keys Extension

**File:** `frontend/src/lib/queryKeys.ts` — add:

```typescript
roles: {
  all: ['roles'] as const,
  lists: () => [...queryKeys.roles.all, 'list'] as const,
  list: () => [...queryKeys.roles.lists()] as const,
  details: () => [...queryKeys.roles.all, 'detail'] as const,
  detail: (id: string) => [...queryKeys.roles.details(), id] as const,
},
```

### 6.5 Query Hook

**File:** `frontend/src/hooks/queries/useRoles.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { rolesService } from '@/services/rolesService';
import { queryKeys } from '@/lib/queryKeys';

export function useRoleProfiles() {
  return useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: rolesService.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRoleProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.roles.detail(id),
    queryFn: () => rolesService.getById(id),
    enabled: !!id,
  });
}
```

### 6.6 Mutation Hooks

**File:** `frontend/src/hooks/mutations/useRoleMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesService } from '@/services/rolesService';
import { queryKeys } from '@/lib/queryKeys';
import {
  RoleProfile,
  CreateRoleProfileInput,
  UpdateRoleProfileInput,
} from '@/types/roles.types';

export function useCreateRoleProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleProfileInput) => rolesService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.lists() });
    },
  });
}

export function useUpdateRoleProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleProfileInput }) =>
      rolesService.update(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.detail(id) });
    },
  });
}

export function useDeleteRoleProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rolesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.lists() });
    },
  });
}

export function useApplyRoleProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, userId }: { profileId: string; userId: string }) =>
      rolesService.applyToUser(profileId, userId),
    onSuccess: (_, { userId }) => {
      // Invalidate user data to reflect new permissions
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    },
  });
}
```

### 6.7 Main Page Component

**File:** `frontend/src/pages/ManageRoles.tsx`

```typescript
/**
 * ManageRoles Page
 *
 * Admin page for managing named permission profiles (role templates).
 * ADMIN-only access.
 *
 * Features:
 *   1. List all role profiles with their module-level summaries
 *   2. Create new profiles via a dialog
 *   3. Edit existing profiles via the same dialog
 *   4. Delete custom profiles (system profiles cannot be deleted)
 *
 * Follows the AdminSettings.tsx MUI pattern.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LockIcon from '@mui/icons-material/Lock';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { useRoleProfiles } from '../hooks/queries/useRoles';
import {
  useCreateRoleProfile,
  useUpdateRoleProfile,
  useDeleteRoleProfile,
} from '../hooks/mutations/useRoleMutations';
import {
  RoleProfile,
  PermissionModule,
  PERMISSION_MODULES,
  MODULE_LABELS,
  MODULE_LEVELS,
  profileToModuleMap,
  moduleMapToPermissions,
} from '../types/roles.types';

// ─── Zod schema for dialog form ───────────────────────────────────────────────
const profileFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  // One field per module; value = '0' (no access) or '1','2','3','4','5'
  TECHNOLOGY: z.string(),
  MAINTENANCE: z.string(),
  REQUISITIONS: z.string(),
  PROFESSIONAL_DEV: z.string(),
  SPECIAL_ED: z.string(),
  TRANSCRIPTS: z.string(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// ─── Helper: build form defaults from a profile's permissions ─────────────────
function buildFormDefaults(profile?: RoleProfile): ProfileFormValues {
  const map = profile ? profileToModuleMap(profile) : {};
  return {
    name: profile?.name ?? '',
    description: profile?.description ?? '',
    TECHNOLOGY: String(map.TECHNOLOGY ?? 0),
    MAINTENANCE: String(map.MAINTENANCE ?? 0),
    REQUISITIONS: String(map.REQUISITIONS ?? 0),
    PROFESSIONAL_DEV: String(map.PROFESSIONAL_DEV ?? 0),
    SPECIAL_ED: String(map.SPECIAL_ED ?? 0),
    TRANSCRIPTS: String(map.TRANSCRIPTS ?? 0),
  };
}

// ─── Module permission summary chip ──────────────────────────────────────────
function ModuleSummaryChips({ profile }: { profile: RoleProfile }) {
  const map = profileToModuleMap(profile);
  const entries = Object.entries(map).filter(([, level]) => level && level > 0);
  if (entries.length === 0) return <Typography variant="caption" color="text.secondary">No permissions</Typography>;
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.5}>
      {entries.map(([module, level]) => (
        <Chip
          key={module}
          label={`${MODULE_LABELS[module as PermissionModule]}: L${level}`}
          size="small"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}

// ─── Per-module radio group ───────────────────────────────────────────────────
function ModulePermissionControl({
  module,
  control,
}: {
  module: PermissionModule;
  control: any;
}) {
  const levels = MODULE_LEVELS[module];
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {MODULE_LABELS[module]}
      </Typography>
      <Controller
        name={module}
        control={control}
        render={({ field }) => (
          <RadioGroup row {...field}>
            <FormControlLabel value="0" control={<Radio size="small" />} label="No Access" />
            {levels.map((l) => (
              <Tooltip key={l.level} title={l.description} arrow>
                <FormControlLabel
                  value={String(l.level)}
                  control={<Radio size="small" />}
                  label={`Level ${l.level} — ${l.name}`}
                />
              </Tooltip>
            ))}
          </RadioGroup>
        )}
      />
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ManageRoles() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RoleProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: profiles = [], isLoading, isError } = useRoleProfiles();
  const createMutation = useCreateRoleProfile();
  const updateMutation = useUpdateRoleProfile();
  const deleteMutation = useDeleteRoleProfile();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: buildFormDefaults(),
  });

  const openCreate = () => {
    setEditingProfile(null);
    reset(buildFormDefaults());
    setDialogOpen(true);
  };

  const openEdit = (profile: RoleProfile) => {
    setEditingProfile(profile);
    reset(buildFormDefaults(profile));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingProfile(null);
  };

  const onSubmit = async (values: ProfileFormValues) => {
    // Build permissions array from form values
    const permissions = PERMISSION_MODULES
      .map((mod) => ({
        module: mod,
        level: parseInt(values[mod], 10),
      }))
      .filter((p) => p.level > 0);

    const payload = {
      name: values.name,
      description: values.description || undefined,
      permissions,
    };

    if (editingProfile) {
      await updateMutation.mutateAsync({ id: editingProfile.id, input: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    closeDialog();
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">Failed to load permission profiles.</Alert>;
  }

  return (
    <Box maxWidth={1000} mx="auto" mt={3}>
      {/* Page header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5">Permission Profiles</Typography>
          <Typography variant="body2" color="text.secondary">
            Named permission templates that can be applied to users.
            System profiles (🔒) cannot be deleted.
          </Typography>
        </Box>
        <Button variant="contained" onClick={openCreate}>
          + Add Profile
        </Button>
      </Box>

      {/* Profiles table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Permissions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id} hover>
                  <TableCell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {profile.isSystem && (
                        <Tooltip title="System profile — cannot be deleted">
                          <LockIcon fontSize="small" color="action" />
                        </Tooltip>
                      )}
                      <Typography fontWeight={500}>{profile.name}</Typography>
                      {!profile.isActive && (
                        <Chip label="Inactive" size="small" color="default" />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {profile.description ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <ModuleSummaryChips profile={profile} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" gap={1}>
                      <Tooltip title="Edit profile">
                        <IconButton size="small" onClick={() => openEdit(profile)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!profile.isSystem && (
                        <Tooltip title="Delete profile">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteConfirmId(profile.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {profiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary" py={3}>
                      No profiles found. Click "+ Add Profile" to create one.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingProfile ? `Edit Profile: "${editingProfile.name}"` : 'Create Permission Profile'}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogContent dividers>
            <Stack spacing={3}>
              {/* Name & Description */}
              <Stack direction="row" spacing={2}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Profile Name"
                      required
                      error={!!errors.name}
                      helperText={errors.name?.message}
                      sx={{ flex: 1 }}
                    />
                  )}
                />
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Description"
                      error={!!errors.description}
                      helperText={errors.description?.message}
                      sx={{ flex: 2 }}
                    />
                  )}
                />
              </Stack>

              {/* Module permissions */}
              <Typography variant="subtitle1" fontWeight={600}>
                Module Permissions
              </Typography>
              {PERMISSION_MODULES.map((mod) => (
                <ModulePermissionControl key={mod} module={mod} control={control} />
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            {(createMutation.isError || updateMutation.isError) && (
              <Alert severity="error" sx={{ flex: 1, mr: 1 }}>
                {(createMutation.error || updateMutation.error) instanceof Error
                  ? (createMutation.error || updateMutation.error)?.message
                  : 'An error occurred. Please try again.'}
              </Alert>
            )}
            <Button onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving...'
                : editingProfile
                ? 'Save Changes'
                : 'Create Profile'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle>Delete Profile</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this permission profile?
            This cannot be undone. Users who were assigned permissions via this profile
            will not be affected — their current permissions remain unchanged.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

### 6.8 Routing (App.tsx)

Add to `App.tsx`:

```typescript
import ManageRoles from './pages/ManageRoles';
// ...
<Route
  path="/admin/roles"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <ManageRoles />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

### 6.9 Navigation (AppLayout.tsx)

Add to the `Admin` section in `NAV_SECTIONS`:

```typescript
{ label: 'Permission Profiles', icon: '🎭', path: '/admin/roles', adminOnly: true },
```

---

## 7. Integration with Existing Systems

### 7.1 Apply Profile from Users Page

The Users page (`Users.tsx`) already has a permission modal. Enhance it with an "Apply Profile" quick-select.

**Changes required in `Users.tsx`:**
1. Import `useRoleProfiles` query hook
2. Inside the permission modal, add a `Select` dropdown labeled "Apply from profile →"
3. When a profile is selected, call a handler that pre-fills the module permission fields
4. User can further adjust before saving (profile is a starting point, not a lock-in)

**Alternative — "Apply Profile" button on the user row:** Add a third action button on each user row in the table. Clicking opens a small dialog showing the profile list. On confirmation, calls `applyToUser(profileId, userId)`.

> **Recommended:** Add a button directly in the existing permissions modal for the cleanest UX. The mutation (`useApplyRoleProfile`) calls `POST /api/roles/:id/apply/:userId`, which internally calls `userService.updatePermissions()` — the same codepath already used.

### 7.2 No Changes to UserSyncService

The `UserSyncService` continues to hardcode group mappings. The `RoleProfile` system is **additive** — it provides a UI-managed template layer on top of the existing sync behavior. Admins can manually override any user's permissions at any time by applying a profile.

Future enhancement: add a `defaultProfileId` field to Entra group config (out of scope for this spec).

### 7.3 Permissions Catalogue (`GET /api/users/permissions`)

The existing endpoint returns the 17-row `Permission` catalogue (`{ [module]: Permission[] }`). The new `RoleProfile` system uses this same data as reference for level names/descriptions in the frontend's `MODULE_LEVELS` constant (already baked in at `types/roles.types.ts`). No changes needed.

---

## 8. Security Considerations

### 8.1 Authentication & Authorization

- All `/api/roles` routes are protected by `authenticate` + `requireAdmin` middleware (same as `/api/users`)
- Frontend routes use `<ProtectedRoute requireAdmin>` which redirects VIEWER/MANAGER/TECHNICIAN to `/dashboard`
- NavItems with `adminOnly: true` are hidden in the sidebar for non-admin users

### 8.2 CSRF Protection

- `validateCsrfToken` middleware is applied to the entire roles router
- Frontend `api.ts` interceptor automatically injects the `x-xsrf-token` header from the cached token on all POST/PUT/DELETE requests
- No additional CSRF configuration needed

### 8.3 Input Validation

- All request bodies validated by Zod schemas in `validators/roles.validators.ts` before reaching controllers
- `name`: max 100 chars, trimmed, required
- `description`: max 500 chars
- `module`: restricted to `z.enum(VALID_MODULES)` — prevents injection of arbitrary module strings
- `level`: `z.number().int().min(1).max(5)` — prevents out-of-range values
- `id` params: `z.string().uuid()` — prevents path traversal / injection

### 8.4 Business Logic Validation

In `RolesService`:
- `isSystem` check prevents deletion of seeded profiles via API
- Duplicate module detection prevents conflicting entries
- `findById` throws `NotFoundError` (400/404) if profile doesn't exist, preventing blind mutations

### 8.5 SQL Injection

Prisma ORM parameterizes all queries. No raw SQL is used. Safe by construction.

### 8.6 Mass Assignment

The controller only passes `req.body` to the service after Zod validation strips unknown fields. `isSystem` and `createdAt`/`updatedAt` cannot be set by clients.

### 8.7 Applying Profiles to Users

`applyRoleProfile` controller calls `rolesService.applyToUser(profileId, userId, adminId)` which delegates to `userService.updatePermissions()`. The `userService` independently validates the userId exists. An admin cannot apply a profile to themselves in a privilege-escalating way, because `requireAdmin` already means they have `permLevel=5` regardless.

---

## 9. Data Migration & Seeding

### 9.1 Seeded System Profiles

Add these profiles to `backend/prisma/seed.ts`. These mirror the existing Entra group → permission matrices defined in `UserSyncService`:

```typescript
const systemProfiles = [
  {
    name: 'All Staff',
    description: 'Standard staff member access — view technology, create maintenance requests, create own purchase orders',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',      level: 1 },
      { module: 'MAINTENANCE',     level: 1 },
      { module: 'REQUISITIONS',    level: 2 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
    ],
  },
  {
    name: 'All Students',
    description: 'Student access — view technology only',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY', level: 1 },
    ],
  },
  {
    name: 'Principal',
    description: 'School principal — school-level technology and maintenance management, requisition supervisor',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',      level: 2 },
      { module: 'MAINTENANCE',     level: 2 },
      { module: 'REQUISITIONS',    level: 3 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
    ],
  },
  {
    name: 'Vice Principal',
    description: 'Vice principal — same as Principal',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',      level: 2 },
      { module: 'MAINTENANCE',     level: 2 },
      { module: 'REQUISITIONS',    level: 3 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
    ],
  },
  {
    name: 'Technology Admin',
    description: 'Technology department staff — full technology administration, maintenance editing, requisition supervisor',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',   level: 3 },
      { module: 'MAINTENANCE',  level: 2 },
      { module: 'REQUISITIONS', level: 3 },
    ],
  },
  {
    name: 'Maintenance Admin',
    description: 'Maintenance department staff — school tech, full maintenance admin, requisition supervisor',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',   level: 2 },
      { module: 'MAINTENANCE',  level: 3 },
      { module: 'REQUISITIONS', level: 3 },
    ],
  },
  {
    name: 'Director of Finance',
    description: 'Finance director — school-level technology and maintenance, final PO approval authority',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',      level: 2 },
      { module: 'MAINTENANCE',     level: 2 },
      { module: 'REQUISITIONS',    level: 5 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
    ],
  },
  {
    name: 'Maintenance Director',
    description: 'Maintenance director — full maintenance oversight, requisition supervisor',
    isSystem: true,
    permissions: [
      { module: 'MAINTENANCE',  level: 3 },
      { module: 'REQUISITIONS', level: 3 },
    ],
  },
  {
    name: 'SPED Director',
    description: 'Special Education director — SPED access, requisition supervisor, professional development',
    isSystem: true,
    permissions: [
      { module: 'REQUISITIONS',    level: 3 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
      { module: 'SPECIAL_ED',      level: 1 },
    ],
  },
  {
    name: 'Director of Schools',
    description: 'Director of Schools — full administrative access to all modules',
    isSystem: true,
    permissions: [
      { module: 'TECHNOLOGY',      level: 2 },
      { module: 'MAINTENANCE',     level: 3 },
      { module: 'REQUISITIONS',    level: 5 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
      { module: 'SPECIAL_ED',      level: 1 },
      { module: 'TRANSCRIPTS',     level: 1 },
    ],
  },
  {
    name: 'Supervisor of Instruction',
    description: 'Academic supervisors — requisition supervisor, professional development access',
    isSystem: true,
    permissions: [
      { module: 'REQUISITIONS',    level: 3 },
      { module: 'PROFESSIONAL_DEV', level: 1 },
    ],
  },
];
```

**Seed logic (upsert pattern):**
```typescript
for (const profileData of systemProfiles) {
  const { permissions, ...data } = profileData;
  const profile = await prisma.roleProfile.upsert({
    where: { name: data.name },
    update: {}, // Don't overwrite if it exists
    create: { ...data },
  });

  // Upsert permissions
  for (const perm of permissions) {
    await prisma.roleProfilePermission.upsert({
      where: { profileId_module: { profileId: profile.id, module: perm.module } },
      update: { level: perm.level },
      create: { profileId: profile.id, ...perm },
    });
  }
}
```

---

## 10. File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/src/routes/roles.routes.ts` | Express router for `/api/roles` |
| `backend/src/controllers/roles.controller.ts` | Thin controller wrappers |
| `backend/src/services/roles.service.ts` | Business logic: CRUD + applyToUser |
| `backend/src/validators/roles.validators.ts` | Zod schemas for roles endpoints |
| `frontend/src/pages/ManageRoles.tsx` | List page + create/edit dialog |
| `frontend/src/services/rolesService.ts` | API service for roles |
| `frontend/src/hooks/queries/useRoles.ts` | TanStack Query hooks |
| `frontend/src/hooks/mutations/useRoleMutations.ts` | TanStack Mutation hooks |
| `frontend/src/types/roles.types.ts` | TypeScript interfaces + module level metadata |

### Modified Files

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `RoleProfile` + `RoleProfilePermission` models |
| `backend/prisma/seed.ts` | Add seeding logic for 11 system profiles |
| `backend/src/server.ts` | Register `/api/roles` router |
| `frontend/src/App.tsx` | Add `/admin/roles` route |
| `frontend/src/lib/queryKeys.ts` | Add `roles` query key factory |
| `frontend/src/components/layout/AppLayout.tsx` | Add "Permission Profiles" nav item |
| `frontend/src/pages/Users.tsx` | Add "Apply Profile" functionality to permission modal |

### Migration

| File | Purpose |
|------|---------|
| `backend/prisma/migrations/YYYYMMDD_add_role_profiles/` | Auto-generated by `prisma migrate dev` |

---

## 11. Research Sources & Best Practices

### 11.1 RBAC Management UI Patterns

**Pattern used:** Role-based permission profiles displayed as a table with inline actions, with a dialog-based editor for creating/updating profiles. This is the standard pattern used in:
- GitHub organization roles management (per-team permission matrices)
- Salesforce permission sets (named bundles of object/field permissions)
- Okta application role assignments
- Manage1to1 (the referenced competitor tool)

**Key principle:** Separating "what a profile contains" (the template) from "who has it" (user assignment). This allows bulk changes — updating a profile propagates to all users via re-apply, rather than requiring per-user edits.

### 11.2 MUI Table + Dialog Pattern

Following Material-UI v5 best practices:
- `Table` with `TableHead`/`TableBody`/`TableRow`/`TableCell` for the list
- `Dialog`/`DialogTitle`/`DialogContent`/`DialogActions` for create/edit
- `RadioGroup` with `FormControlLabel` for permission level selection
- `Chip` components for compact permission summary display
- This matches the pattern used in MUI documentation for admin data tables with CRUD operations

### 11.3 TanStack Query CRUD Pattern

Following the established project pattern (`useUserMutations.ts`):
- `useQuery` for read operations with appropriate `staleTime`
- `useMutation` with `onSuccess` → `invalidateQueries` for cache invalidation
- Optimistic updates only where beneficial (list ordering is stable enough that pessimistic updates are sufficient here)

### 11.4 Zod Validation Pattern

Following the project's `validators/user.validators.ts` pattern:
- Separate schema per operation (create vs. update)
- Enum validation for module names prevents injection
- Integer range validation (min/max) for levels
- UUID validation for all ID parameters

### 11.5 Atomic Permission Updates

Following the project's existing `updatePermissions` pattern in `UserService`:
- Use `prisma.$transaction` for delete + recreate operations
- This prevents partial state where old and new permissions coexist

### 11.6 System Profile Protection

**Best practice (from Salesforce, GitHub, Okta):** Seed protected "default" permission sets that admins can see but not delete. This:
- Provides a reference for what each Entra group maps to
- Reduces admin error (can't accidentally delete the "All Staff" template)
- Allows admins to clone/customize without touching the originals

Implemented via `isSystem: true` flag checked in `RolesService.delete()`.

---

## Appendix A: Data Flow Diagram

```
Admin Browser                 Backend API                      Database
─────────────                 ───────────                      ────────
GET /admin/roles
  │
  └──► rolesService.getAll()
          │
          └──► GET /api/roles ──────────────────► RolesService.findAll()
                                                       │
                                                       └──► SELECT role_profiles
                                                            + role_profile_permissions
                                                       │
                                                  ◄────┘
               ◄──── 200 { profiles: [...] } ────┘
  │
  ▼ renders table

[+ Add Profile] clicked
  │
  ▼ opens dialog (no API call)

[Save] clicked
  │
  └──► rolesService.create(input)
          │
          └──► POST /api/roles ──► validateCsrfToken
                                   validateRequest(CreateRoleProfileSchema)
                                       │
                                       └──► RolesService.create()
                                               │
                                               └──► $transaction{
                                                      INSERT role_profiles
                                                      INSERT role_profile_permissions[]
                                                    }
                                               │
                                          ◄────┘
               ◄──── 201 { profile } ─────┘
  │
  ▼ invalidateQueries(['roles','list'])
  ▼ table re-fetches + shows new profile

[Apply Profile] on Users page
  │
  └──► rolesService.applyToUser(profileId, userId)
          │
          └──► POST /api/roles/:id/apply/:userId
                   │
                   └──► RolesService.applyToUser()
                           │
                           └──► UserService.updatePermissions()
                                   │
                                   └──► $transaction{
                                          DELETE user_permissions WHERE userId
                                          INSERT user_permissions[] (from profile)
                                        }
                   │
               ◄────────── 200 { user } ──────────┘
  │
  ▼ invalidateQueries(['users','list'])
  ▼ user row updates with new permissions
```

---

## Appendix B: Module Level Quick Reference

| Module | Levels |
|--------|--------|
| TECHNOLOGY | 1=View, 2=Edit (School), 3=Admin (Department) |
| MAINTENANCE | 1=View+Create, 2=Edit, 3=Full Oversight |
| REQUISITIONS | 1=View Own, 2=Create Own, 3=Supervisor, 4=Purchasing, 5=Director |
| PROFESSIONAL_DEV | 1=Access |
| SPECIAL_ED | 1=Access |
| TRANSCRIPTS | 1=Access |

Binary modules (PROFESSIONAL_DEV, SPECIAL_ED, TRANSCRIPTS) show a single radio:
`● No Access  ○ Level 1 — Access`

---

*Spec complete. Ready for Implementation SubAgent (Phase 2).*

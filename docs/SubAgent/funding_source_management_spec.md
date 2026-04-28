# Funding Source Management — Research & Specification

**Date:** 2026-03-03  
**Project:** Tech-V2  
**Phase:** Research & Specification (Phase 1)

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Database Changes](#2-database-changes)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Migration Strategy](#5-migration-strategy)
6. [Security Considerations](#6-security-considerations)
7. [Implementation Steps (Ordered)](#7-implementation-steps-ordered)

---

## 1. Current State

### How `fundingSource` is stored today

`fundingSource` is a **plain `String?` field** on the `equipment` model — there is **no `FundingSource` model** and no FK relation.

**Prisma schema** (`backend/prisma/schema.prisma`, approximately line 56):
```prisma
model equipment {
  ...
  fundingSource  String?   // ← plain free-text string, no FK
  ...
}
```

**Backend validator** (`backend/src/validators/inventory.validators.ts`):
```typescript
// CreateInventorySchema (line 128) and UpdateInventorySchema (line 163):
fundingSource: z.string().max(100).optional().nullable(),
```

**Frontend type** (`frontend/src/types/inventory.types.ts`, line 181):
```typescript
export interface CreateInventoryRequest {
  ...
  fundingSource?: string | null;   // ← free-text string
  ...
}
```

**Frontend form** (`frontend/src/components/inventory/InventoryFormDialog.tsx`, lines 461–466):
```tsx
<TextField
  fullWidth
  label="Funding Source"
  value={formData.fundingSource}
  onChange={(e) => handleChange('fundingSource', e.target.value)}
  disabled={loading}
/>
```

### Related observations

- **No separate API endpoints exist** for brands, vendors, or categories either — there is a `// TODO: Add API endpoints for brands, vendors, categories, models` comment at `InventoryFormDialog.tsx` line 211. This system will be the **first dedicated reference-data management feature**.
- `vendorId`, `brandId`, `categoryId` fields exist in the form state and types but their dropdown data is never fetched (TODO still open).
- The `RoomManagement` page + `roomService` + `room.routes.ts` / `room.controller.ts` / `room.service.ts` / `room.validators.ts` is the **closest complete CRUD reference pattern** to follow.

---

## 2. Database Changes

### 2.1 New `FundingSource` model

Following the established pattern for reference tables (`brands`, `vendors`, `categories`, `rooms`):

```prisma
model FundingSource {
  id          String      @id @default(uuid())
  name        String      @unique
  description String?
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  equipment   equipment[]

  @@index([isActive])
  @@index([name])
  @@map("funding_sources")
}
```

### 2.2 Changes to the `equipment` model

Add a new optional FK relationship alongside the existing plain-string field (kept for backwards compatibility during transition):

```prisma
model equipment {
  ...
  fundingSource      String?         // legacy plain-text field — kept during migration
  fundingSourceId    String?         // NEW: FK to FundingSource table
  ...
  // NEW relation:
  fundingSourceRef   FundingSource?  @relation(fields: [fundingSourceId], references: [id])
  ...
  // NEW index:
  @@index([fundingSourceId])
}
```

> **Note on naming:** Using `fundingSourceRef` as the relation name avoids conflict with the existing scalar field `fundingSource`. Alternatively, after data migration is complete, the old `fundingSource String?` field can be removed and the relation renamed.

### 2.3 Migration plan

1. **Migration A** — `prisma migrate dev --name add_funding_sources`:
   - Creates `funding_sources` table.
   - Adds `fundingSourceId String?` column + FK constraint on `equipment`.
   - Adds index on `equipment.fundingSourceId`.

2. **Data seeding / back-fill** (optional, run as a one-off script):
   ```sql
   -- Insert distinct existing funding source strings as FundingSource records
   INSERT INTO funding_sources (id, name, "isActive", "createdAt", "updatedAt")
   SELECT gen_random_uuid(), "fundingSource", true, NOW(), NOW()
   FROM equipment
   WHERE "fundingSource" IS NOT NULL AND "fundingSource" <> ''
   GROUP BY "fundingSource";

   -- Update FK column
   UPDATE equipment e
   SET "fundingSourceId" = fs.id
   FROM funding_sources fs
   WHERE e."fundingSource" = fs.name;
   ```

3. **Migration B** (future, after frontend cutover is confirmed) — `prisma migrate dev --name remove_legacy_funding_source_string`:
   - Drops the old `fundingSource String?` scalar column from `equipment`.

---

## 3. Backend Architecture

The implementation follows the **Room CRUD pattern** exactly. All new files live under `backend/src/`.

### 3.1 File map

| File | Description |
|------|-------------|
| `prisma/schema.prisma` | Add `FundingSource` model + update `equipment` |
| `prisma/migrations/<timestamp>_add_funding_sources/` | Auto-generated migration |
| `src/validators/fundingSource.validators.ts` | Zod schemas |
| `src/services/fundingSource.service.ts` | Prisma query logic |
| `src/controllers/fundingSource.controller.ts` | HTTP handlers |
| `src/routes/fundingSource.routes.ts` | Express router |
| `src/server.ts` | Register new route file |

### 3.2 Zod validators — `fundingSource.validators.ts`

```typescript
import { z } from 'zod';

export const FundingSourceIdParamSchema = z.object({
  id: z.string().uuid('Invalid funding source ID format'),
});

export const GetFundingSourcesQuerySchema = z.object({
  page:     z.preprocess((v) => v ?? '1',  z.string().regex(/^\d+$/).transform(Number).refine(n => n > 0)).optional(),
  limit:    z.preprocess((v) => v ?? '50', z.string().regex(/^\d+$/).transform(Number).refine(n => n > 0 && n <= 1000)).optional(),
  search:   z.string().optional(),
  isActive: z.preprocess((v) => v === 'true' ? true : v === 'false' ? false : undefined, z.boolean().optional()),
  sortBy:   z.enum(['name', 'createdAt']).optional(),
  sortOrder:z.enum(['asc', 'desc']).optional(),
});

export const CreateFundingSourceSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional().default(true),
});

export const UpdateFundingSourceSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional(),
});

export type CreateFundingSourceDto = z.infer<typeof CreateFundingSourceSchema>;
export type UpdateFundingSourceDto = z.infer<typeof UpdateFundingSourceSchema>;
```

### 3.3 Service — `fundingSource.service.ts`

```typescript
import { PrismaClient, FundingSource, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface FundingSourceQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface FundingSourceListResponse {
  items: FundingSource[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class FundingSourceService {
  constructor(private prisma: PrismaClient) {}

  async findAll(query: FundingSourceQuery = {}): Promise<FundingSourceListResponse> {
    const { page = 1, limit = 50, search, isActive, sortBy = 'name', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.FundingSourceWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.fundingSource.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      this.prisma.fundingSource.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<FundingSource> {
    const fs = await this.prisma.fundingSource.findUnique({ where: { id } });
    if (!fs) throw new NotFoundError(`Funding source ${id} not found`);
    return fs;
  }

  async create(data: CreateFundingSourceDto): Promise<FundingSource> {
    const exists = await this.prisma.fundingSource.findUnique({ where: { name: data.name } });
    if (exists) throw new ValidationError(`Funding source "${data.name}" already exists`);
    return this.prisma.fundingSource.create({ data });
  }

  async update(id: string, data: UpdateFundingSourceDto): Promise<FundingSource> {
    await this.findById(id); // ensures existence
    if (data.name) {
      const exists = await this.prisma.fundingSource.findFirst({ where: { name: data.name, NOT: { id } } });
      if (exists) throw new ValidationError(`Funding source "${data.name}" already exists`);
    }
    return this.prisma.fundingSource.update({ where: { id }, data });
  }

  /** Soft delete: sets isActive = false */
  async softDelete(id: string): Promise<FundingSource> {
    await this.findById(id);
    return this.prisma.fundingSource.update({ where: { id }, data: { isActive: false } });
  }

  /** Hard delete: permanent removal (admin only) */
  async hardDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.fundingSource.delete({ where: { id } });
  }
}
```

### 3.4 Controller — `fundingSource.controller.ts`

```typescript
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FundingSourceService } from '../services/fundingSource.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const service = new FundingSourceService(prisma);

export const getFundingSources = async (req: AuthRequest, res: Response) => {
  try {
    const result = await service.findAll(req.query as any);
    res.json(result);
  } catch (error) { handleControllerError(error, res); }
};

export const getFundingSource = async (req: AuthRequest, res: Response) => {
  try {
    const item = await service.findById(req.params.id);
    res.json(item);
  } catch (error) { handleControllerError(error, res); }
};

export const createFundingSource = async (req: AuthRequest, res: Response) => {
  try {
    const item = await service.create(req.body);
    logger.info('Funding source created', { userId: req.user?.id, id: item.id, name: item.name });
    res.status(201).json(item);
  } catch (error) { handleControllerError(error, res); }
};

export const updateFundingSource = async (req: AuthRequest, res: Response) => {
  try {
    const item = await service.update(req.params.id, req.body);
    logger.info('Funding source updated', { userId: req.user?.id, id: item.id });
    res.json(item);
  } catch (error) { handleControllerError(error, res); }
};

export const deleteFundingSource = async (req: AuthRequest, res: Response) => {
  try {
    const permanent = req.query.permanent === 'true';
    if (permanent) {
      if (!req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'Only administrators can permanently delete funding sources' });
      }
      await service.hardDelete(req.params.id);
      res.json({ message: 'Funding source permanently deleted' });
    } else {
      const item = await service.softDelete(req.params.id);
      res.json({ message: 'Funding source deactivated', item });
    }
  } catch (error) { handleControllerError(error, res); }
};
```

### 3.5 Routes — `fundingSource.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { checkPermission } from '../middleware/permissions';
import {
  FundingSourceIdParamSchema,
  GetFundingSourcesQuerySchema,
  CreateFundingSourceSchema,
  UpdateFundingSourceSchema,
} from '../validators/fundingSource.validators';
import * as fsController from '../controllers/fundingSource.controller';

const router = Router();

router.use(authenticate);
router.use(validateCsrfToken);

// Read — TECHNOLOGY level 1+ (view)
router.get(
  '/funding-sources',
  validateRequest(GetFundingSourcesQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 1),
  fsController.getFundingSources
);

router.get(
  '/funding-sources/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 1),
  fsController.getFundingSource
);

// Write — TECHNOLOGY level 2+ (edit)
router.post(
  '/funding-sources',
  validateRequest(CreateFundingSourceSchema, 'body'),
  checkPermission('TECHNOLOGY', 2),
  fsController.createFundingSource
);

router.put(
  '/funding-sources/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  validateRequest(UpdateFundingSourceSchema, 'body'),
  checkPermission('TECHNOLOGY', 2),
  fsController.updateFundingSource
);

// Delete — TECHNOLOGY level 3 (admin) for soft delete; hard delete also requires ADMIN role
router.delete(
  '/funding-sources/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 3),
  fsController.deleteFundingSource
);

export default router;
```

### 3.6 Route registration — `server.ts`

Add after the `assignmentRoutes` import and registration:

```typescript
// In imports section:
import fundingSourceRoutes from './routes/fundingSource.routes';

// In route registration section (after assignmentRoutes):
app.use('/api', fundingSourceRoutes);
```

### 3.7 Inventory service + validator updates

**`inventory.validators.ts`** — add `fundingSourceId` fields alongside existing `fundingSource`:

```typescript
// In CreateInventorySchema:
fundingSourceId: z.string().uuid('Invalid funding source ID').optional().nullable(),
fundingSource:   z.string().max(100).optional().nullable(), // kept for backward compat

// In UpdateInventorySchema: same two lines
```

**`inventory.service.ts`** — update `create` and `update` to write `fundingSourceId` when provided:

```typescript
// In create():
fundingSourceId: data.fundingSourceId ?? undefined,
fundingSource:   data.fundingSource ?? undefined,  // legacy; remove after migration B

// In update(): same pattern
```

---

## 4. Frontend Architecture

### 4.1 Types — `frontend/src/types/fundingSource.types.ts` (new file)

```typescript
export interface FundingSource {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FundingSourceListResponse {
  items: FundingSource[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateFundingSourceRequest {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateFundingSourceRequest extends Partial<CreateFundingSourceRequest> {}

export interface FundingSourceQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
```

### 4.2 Service — `frontend/src/services/fundingSourceService.ts` (new file)

Follows `roomService.ts` pattern exactly:

```typescript
import { api } from './api';
import {
  FundingSource,
  FundingSourceListResponse,
  CreateFundingSourceRequest,
  UpdateFundingSourceRequest,
  FundingSourceQueryParams,
} from '../types/fundingSource.types';

export const fundingSourceService = {
  getAll: async (params?: FundingSourceQueryParams): Promise<FundingSourceListResponse> => {
    const q = new URLSearchParams();
    if (params?.page)     q.append('page', String(params.page));
    if (params?.limit)    q.append('limit', String(params.limit));
    if (params?.search)   q.append('search', params.search);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.sortBy)   q.append('sortBy', params.sortBy);
    if (params?.sortOrder)q.append('sortOrder', params.sortOrder);
    const res = await api.get<FundingSourceListResponse>(`/funding-sources?${q}`);
    return res.data;
  },

  getById: async (id: string): Promise<FundingSource> => {
    const res = await api.get<FundingSource>(`/funding-sources/${id}`);
    return res.data;
  },

  create: async (data: CreateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.post<FundingSource>('/funding-sources', data);
    return res.data;
  },

  update: async (id: string, data: UpdateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.put<FundingSource>(`/funding-sources/${id}`, data);
    return res.data;
  },

  delete: async (id: string, permanent = false): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`/funding-sources/${id}${permanent ? '?permanent=true' : ''}`);
    return res.data;
  },
};

export default fundingSourceService;
```

### 4.3 Management page — `frontend/src/pages/FundingSourceManagement.tsx` (new file)

Follow `RoomManagement.tsx` structural pattern:
- Standard `app-header` with navigate-back-to-dashboard button
- Page header with title + "Add Funding Source" button
- Search input + isActive filter
- MUI `Table` listing all funding sources with columns: Name, Description, Status, Actions
- Action buttons: Edit (pencil icon), Deactivate/Activate toggle, Delete (trash icon, admin only)
- `FundingSourceFormModal` component (inline or separate file) for create/edit — simple MUI dialog with name and description fields + isActive toggle; uses `fundingSourceService`

**Key state:**
```typescript
const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
const [loading, setLoading] = useState(false);
const [search, setSearch] = useState('');
const [showInactive, setShowInactive] = useState(false);
const [modalOpen, setModalOpen] = useState(false);
const [editing, setEditing] = useState<FundingSource | null>(null);
```

**Load pattern:**
```typescript
const loadFundingSources = async () => {
  setLoading(true);
  try {
    const result = await fundingSourceService.getAll({ search: search || undefined, isActive: showInactive ? undefined : true });
    setFundingSources(result.items);
  } finally {
    setLoading(false);
  }
};
useEffect(() => { loadFundingSources(); }, [search, showInactive]);
```

### 4.4 Navigation — Dashboard + App.tsx

**`frontend/src/pages/Dashboard.tsx`** — add a "Funding Sources" card button alongside the existing Inventory card:
```tsx
<button onClick={() => navigate('/funding-sources')} className="btn btn-primary" style={{ width: '100%' }}>
  Manage Funding Sources
</button>
```
This card should be visible to users with TECHNOLOGY ≥ 2 permissions (editor+).

**`frontend/src/App.tsx`** — add route:
```tsx
import FundingSourceManagement from './pages/FundingSourceManagement';
// ...inside <Routes>:
<Route
  path="/funding-sources"
  element={
    <ProtectedRoute>
      <FundingSourceManagement />
    </ProtectedRoute>
  }
/>
```

> Note: `ProtectedRoute` without `requireAdmin` is appropriate here — access control is enforced by backend `checkPermission('TECHNOLOGY', 2)`. Read-only users (TECHNOLOGY 1) can still view the list; the create/edit/delete actions will 403 if attempted without sufficient permissions.

### 4.5 InventoryFormDialog updates

**`frontend/src/types/inventory.types.ts`** — add `fundingSourceId` to `CreateInventoryRequest`:
```typescript
fundingSourceId?: string | null;   // NEW: FK to funding_sources
fundingSource?: string | null;     // KEPT: legacy fallback until Migration B
```

**`frontend/src/components/inventory/InventoryFormDialog.tsx`**:

1. Import fundingSourceService:
```tsx
import fundingSourceService from '../../services/fundingSourceService';
import type { FundingSource } from '../../types/fundingSource.types';
```

2. Add state for funding sources:
```tsx
const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
```

3. In `fetchDropdownOptions()` (line ~205), add fetch:
```tsx
const fsData = await fundingSourceService.getAll({ isActive: true, limit: 500, sortBy: 'name', sortOrder: 'asc' });
setFundingSources(fsData.items);
```

4. Update `formData` Zod schema to include `fundingSourceId`:
```tsx
fundingSourceId: z.string().optional().nullable(),
```

5. Update initial state to include `fundingSourceId: null`.

6. **Replace the plain `TextField` for Funding Source** (lines 461–466) with an MUI `Autocomplete`:
```tsx
<Autocomplete
  fullWidth
  options={fundingSources}
  getOptionLabel={(fs) => fs.name}
  isOptionEqualToValue={(opt, val) => opt.id === val.id}
  value={fundingSources.find((fs) => fs.id === formData.fundingSourceId) ?? null}
  onChange={(_e, selected) => handleChange('fundingSourceId', selected?.id ?? null)}
  disabled={loading}
  noOptionsText="No funding sources found"
  renderInput={(params) => (
    <TextField
      {...params}
      label="Funding Source"
      placeholder="Search funding sources..."
    />
  )}
/>
```

7. In `handleSubmit`, ensure `fundingSourceId` is sent in the request body. The old `fundingSource` string field can be omitted or also cleared.

---

## 5. Migration Strategy

### Context
`fundingSource` is currently a free-text field — production data may contain arbitrary string values (e.g., "General Fund", "Title I", "E-Rate", "Grant 2024").

### Recommended path: Parallel fields with back-fill

| Phase | Action |
|-------|--------|
| Phase A | Add `FundingSource` table + `fundingSourceId` FK column (nullable). Deploy backend + frontend. Old string field still works. |
| Phase B | Run back-fill script: parse distinct `fundingSource` strings → create `FundingSource` rows → populate `fundingSourceId` for matching equipment rows. |
| Phase C | UI cutover: InventoryFormDialog now writes `fundingSourceId` only. API validator still accepts old `fundingSource` string for import compatibility. |
| Phase D | After confirming all data is migrated and no legacy imports remain: drop `fundingSource String?` column from `equipment` model (second migration). |

**Risk mitigation:**
- Keep `fundingSource String?` nullable during Phase A–C so no existing records break.
- Deploy the inventory import pipeline to recognize both `fundingSource` (string) and `fundingSourceId` (UUID) so Excel imports continue to work during transition.
- Strings that don't match any existing `FundingSource` name during back-fill should be logged for manual review.

---

## 6. Security Considerations

### Permission mapping

| Action | Required Permission |
|--------|-------------------|
| List / read all funding sources (GET /api/funding-sources) | `checkPermission('TECHNOLOGY', 1)` — any tech user with view access |
| Create funding source (POST) | `checkPermission('TECHNOLOGY', 2)` — editors+ |
| Update funding source (PUT) | `checkPermission('TECHNOLOGY', 2)` — editors+ |
| Soft-delete / deactivate (DELETE, default) | `checkPermission('TECHNOLOGY', 3)` — tech admins only |
| Hard-delete (DELETE ?permanent=true) | `checkPermission('TECHNOLOGY', 3)` **AND** `req.user.roles.includes('ADMIN')` |

### CSRF protection
All state-changing routes (`POST`, `PUT`, `DELETE`) go through `validateCsrfToken` middleware — this is already applied via `router.use(validateCsrfToken)` in the route file, matching the existing room routes pattern.

### Authentication
All routes require the `authenticate` middleware (JWT validation via cookie or Authorization header), applied via `router.use(authenticate)`.

### Input validation
All request bodies and query params are validated by Zod schemas before reaching the controller, preventing injection of unexpected fields.

### Duplicate name constraint
The `@unique` constraint on `FundingSource.name` and service-level duplicate check prevent duplicate entries.

---

## 7. Implementation Steps (Ordered)

### Backend

1. **Schema update** — edit `backend/prisma/schema.prisma`:
   - Add `FundingSource` model with `@@map("funding_sources")`.
   - Add `fundingSourceId String?` + relation + index to `equipment` model.

2. **Run migration** — `cd backend && npx prisma migrate dev --name add_funding_sources`.

3. **Generate Prisma client** — `npx prisma generate` (auto-runs after migrate dev).

4. **Create validators** — `backend/src/validators/fundingSource.validators.ts`.

5. **Create service** — `backend/src/services/fundingSource.service.ts`.

6. **Create controller** — `backend/src/controllers/fundingSource.controller.ts`.

7. **Create routes** — `backend/src/routes/fundingSource.routes.ts`.

8. **Register routes** — update `backend/src/server.ts`: import + `app.use('/api', fundingSourceRoutes)`.

9. **Update inventory validators** — add `fundingSourceId` to `CreateInventorySchema` and `UpdateInventorySchema` in `backend/src/validators/inventory.validators.ts`.

10. **Update inventory service** — map `fundingSourceId` in `create()` and `update()` methods in `backend/src/services/inventory.service.ts`.

### Frontend

11. **Create types** — `frontend/src/types/fundingSource.types.ts`.

12. **Create service** — `frontend/src/services/fundingSourceService.ts`.

13. **Update inventory types** — add `fundingSourceId?: string | null` to `CreateInventoryRequest` in `frontend/src/types/inventory.types.ts`.

14. **Create management page** — `frontend/src/pages/FundingSourceManagement.tsx` (table + form modal).

15. **Register route** — update `frontend/src/App.tsx`: import + add `<Route path="/funding-sources" ...>`.

16. **Add Dashboard card** — update `frontend/src/pages/Dashboard.tsx` with "Funding Sources" navigation button.

17. **Update InventoryFormDialog** — `frontend/src/components/inventory/InventoryFormDialog.tsx`:
    - Import `fundingSourceService` and `FundingSource` type.
    - Add `fundingSources` state.
    - Fetch active funding sources in `fetchDropdownOptions()`.
    - Replace `TextField` (Funding Source) with MUI `Autocomplete` bound to `fundingSourceId`.
    - Add `fundingSourceId` to form state, Zod schema, initial state, and reset.

### Data migration (post-deploy)

18. **Run back-fill script** — execute the SQL back-fill (or a TypeScript Prisma script) to populate `FundingSource` rows from existing `equipment.fundingSource` strings and update `fundingSourceId` FK column.

19. **Verify** — confirm all equipment rows with a non-null `fundingSource` string now have a matching `fundingSourceId`.

20. **Schedule legacy field removal** — plan Migration B to drop the `fundingSource String?` column once the team confirms no dependency on the old field.

---

## Key Findings Summary

| Question | Answer |
|----------|--------|
| Does a `FundingSource` model already exist? | **No** — must be created |
| Is `fundingSource` a string or FK relation? | **Plain `String?` field** on `equipment` — no FK today |
| Pattern for other lookup tables? | `brands`, `vendors`, `categories` exist in schema but have **no standalone CRUD pages** (TODO comment in InventoryFormDialog). **`Room`** is the complete CRUD reference pattern to follow. |
| New migration needed? | **Yes** — new table + FK column on equipment |
| Permissions for managing vs reading? | Read: `TECHNOLOGY level 1+`; Write/Edit: `TECHNOLOGY level 2+`; Delete: `TECHNOLOGY level 3`; Hard-delete: `ADMIN role` |

---

*Spec written for Phase 2 (Implementation) hand-off.*

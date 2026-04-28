# Sprint C-2 Codebase Analysis: Purchase Orders / Requisitions

**Date:** 2026-03-10  
**Purpose:** Exploration findings to plan Sprint C-2 (Purchase Orders & Requisitions implementation)

---

## 1. Prisma Schema — Relevant Models

### `purchase_orders` model
```prisma
model purchase_orders {
  id            String     @id @default(uuid())
  poNumber      String     @unique
  type          String
  requestorId   String
  vendorId      String?
  description   String
  amount        Decimal    @db.Decimal(10, 2)
  status        String     @default("pending")
  accountCode   String?
  program       String?
  isApproved    Boolean    @default(false)
  approvedBy    String?
  approvedDate  DateTime?
  submittedDate DateTime   @default(now())
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  po_items      po_items[]
  User          User       @relation(fields: [requestorId], references: [id])
  vendors       vendors?   @relation(fields: [vendorId], references: [id])

  @@index([status])
  @@index([type])
}
```

**Key observations:**
- `status` is a plain `String` — not an enum. Values must be enforced at the service/validator layer.
- `type` is a plain `String` — refers to requisition category (e.g., equipment, supplies, etc.)
- `isApproved` is a Boolean flag; `approvedBy` stores user ID; `approvedDate` stores timestamp.
- `amount` is the total PO amount; individual line items live in `po_items`.
- `accountCode` and `program` map directly to legacy PHP fields `requisition_account_code` / `requisition_program_name`.
- No `fundingSourceId` FK yet — currently only `accountCode` (string). Can add FK later.
- `vendorId` is nullable (optional vendor association).
- **Missing fields vs. legacy** (see §6 for full list): `shipTo`, `vendorAddress`, `vendorPhone`, `vendorFax`, `notes/orderInfo`, `shipCost`, `requisition_school` equivalent (`officeLocationId`).

### `po_items` model
```prisma
model po_items {
  id              String          @id @default(uuid())
  poId            String
  description     String
  quantity        Int
  unitPrice       Decimal         @db.Decimal(10, 2)
  totalPrice      Decimal         @db.Decimal(10, 2)
  createdAt       DateTime        @default(now())
  purchase_orders purchase_orders @relation(fields: [poId], references: [id], onDelete: Cascade)
}
```

**Key observations:**
- Cascade delete from `purchase_orders`.
- `totalPrice` is stored redundantly (`quantity × unitPrice`) — service must compute and store it.
- No `lineNumber` field yet — could add for display ordering.
- No `model`/`partNumber` field — legacy PHP had `req_model`. Not yet in schema.

### `vendors` model
```prisma
model vendors {
  id              String            @id @default(uuid())
  name            String            @unique
  contactName     String?
  email           String?
  phone           String?
  address         String?
  city            String?
  state           String?
  zip             String?
  fax             String?
  website         String?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  purchase_orders purchase_orders[]
  equipment       equipment[]
}
```

**Key observations:**
- Full address modeled. Matches legacy `company` table.
- `fax` included. `website` included.
- Already linked to `equipment` and `purchase_orders`.

### `User` model (relevant fields)
```prisma
model User {
  id              String   @id @default(uuid())
  entraId         String   @unique
  email           String   @unique
  firstName       String
  lastName        String
  displayName     String?
  department      String?
  jobTitle        String?
  isActive        Boolean  @default(true)
  role            String   @default("VIEWER")
  officeLocation  String?  // text field, NOT FK
  purchase_orders purchase_orders[]
  ...
  @@map("users")
}
```

### `OfficeLocation` model
```prisma
model OfficeLocation {
  id        String   @id @default(uuid())
  name      String   @unique
  code      String?  @unique
  type      String
  address   String?
  phone     String?
  isActive  Boolean  @default(true)
  city      String?
  state     String?
  zip       String?
  ...
  @@map("office_locations")
}
```

---

## 2. Installed npm Packages

### Backend (`c:\Tech-V2\backend\package.json`)

| Package | Version | Relevance |
|---------|---------|-----------|
| `express` | ^5.2.1 | HTTP framework |
| `@prisma/client` | ^7.2.0 | ORM |
| `zod` | ^4.3.6 | Input validation |
| `jsonwebtoken` | ^9.0.3 | JWT auth |
| `multer` | ^2.0.2 | File uploads (available) |
| `winston` | ^3.19.0 | Logging |
| `node-cron` | ^4.2.1 | Scheduled jobs |
| `csv-parse` | ^6.1.0 | CSV parsing |
| `xlsx` | ^0.18.5 | Excel export |
| `uuid` | ^13.0.0 | UUID generation |
| `helmet` | ^8.1.0 | Security headers |
| `express-rate-limit` | ^8.2.1 | Rate limiting |
| `@azure/identity` | ^4.13.0 | Azure AD |
| `@microsoft/microsoft-graph-client` | ^3.0.7 | MS Graph API |

**❌ NOT installed: `nodemailer`** — No email package present. Must be added for approval notifications.  
**❌ NOT installed: `pdfkit`** — No PDF generation package. Must be added for PO PDF export.  
**✅ `multer` is installed** — Available for file attachment support.

### Frontend (`c:\Tech-V2\frontend\package.json`)

| Package | Version | Relevance |
|---------|---------|-----------|
| `@mui/material` | ^7.3.8 | UI components |
| `@mui/x-data-grid` | ^8.27.1 | Data table |
| `@tanstack/react-query` | ^5.90.16 | Server state management |
| `axios` | ^1.13.2 | HTTP client |
| `react-router-dom` | ^7.12.0 | Routing |
| `zod` | ^4.3.6 | Client-side validation |
| `zustand` | ^5.0.10 | Global state (auth store) |
| `@mui/lab` | ^7.0.1-beta.22 | MUI labs (DatePicker, etc.) |
| `react` | ^19.2.3 | React runtime |

---

## 3. Existing Backend Routes, Controllers, Services

### Routes (`c:\Tech-V2\backend\src\routes\`)
| File | Mount Point |
|------|-------------|
| `auth.routes.ts` | `/api/auth` |
| `user.routes.ts` | `/api/users` |
| `admin.routes.ts` | `/api/admin` |
| `location.routes.ts` | `/api` (→ `/api/locations`) |
| `room.routes.ts` | `/api` (→ `/api/rooms`) |
| `inventory.routes.ts` | `/api` (→ `/api/equipment`) |
| `assignment.routes.ts` | `/api` (→ `/api/assignments`) |
| `fundingSource.routes.ts` | `/api/funding-sources` |
| `referenceData.routes.ts` | `/api` (→ `/api/reference-data`) |

**No PO route exists yet.** Sprint C-2 will add: `purchaseOrder.routes.ts` → `/api/purchase-orders`

### Controllers (`c:\Tech-V2\backend\src\controllers\`)
- `assignment.controller.ts`
- `auth.controller.ts`
- `fundingSource.controller.ts`
- `inventory.controller.ts`
- `location.controller.ts`
- `referenceData.controller.ts`
- `room.controller.ts`
- `user.controller.ts`

**To add:** `purchaseOrder.controller.ts`

### Services (`c:\Tech-V2\backend\src\services\`)
- `assignment.service.ts`
- `cronJobs.service.ts`
- `fundingSource.service.ts`
- `inventory.service.ts`
- `inventoryImport.service.ts`
- `location.service.ts`
- `room.service.ts`
- `user.service.ts`
- `userSync.service.ts`

**To add:** `purchaseOrder.service.ts`, `vendor.service.ts` (if vendor management is in scope), `email.service.ts`

### Validators (`c:\Tech-V2\backend\src\validators\`)
- `assignment.validators.ts`
- `auth.validators.ts`
- `fundingSource.validators.ts`
- `inventory.validators.ts`
- `location.validators.ts`
- `referenceData.validators.ts`
- `room.validators.ts`
- `user.validators.ts`

**To add:** `purchaseOrder.validators.ts`

### Middleware (`c:\Tech-V2\backend\src\middleware\`)
- `auth.ts` — JWT cookie/header validation + `authenticate`, `requireAdmin` exports
- `csrf.ts` — CSRF token validation
- `permissions.ts` — `checkPermission(module, level)` middleware
- `requestLogger.ts` — Request ID + HTTP logging
- `validation.ts` — `validateRequest(schema, location)` middleware

---

## 4. Code Patterns

### Route Pattern (from `fundingSource.routes.ts`)
```typescript
import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { checkPermission } from '../middleware/permissions';
import { SchemaA, SchemaB } from '../validators/[feature].validators';
import * as controller from '../controllers/[feature].controller';

const router = Router();

router.use(authenticate);          // all routes require auth
router.use(validateCsrfToken);     // all state-changing routes get CSRF protection

// Read: checkPermission('TECHNOLOGY', 1)
router.get('/',
  validateRequest(QuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 1),
  controller.getAll,
);

// Write: checkPermission('TECHNOLOGY', 2)
router.post('/',
  validateRequest(CreateSchema, 'body'),
  checkPermission('TECHNOLOGY', 2),
  controller.create,
);

// Delete: checkPermission('TECHNOLOGY', 3)
router.delete('/:id',
  validateRequest(IdParamSchema, 'params'),
  checkPermission('TECHNOLOGY', 3),
  controller.softDelete,
);

// Hard-delete: requireAdmin
router.delete('/:id/hard',
  validateRequest(IdParamSchema, 'params'),
  requireAdmin,
  controller.hardDelete,
);

export default router;
```

### Controller Pattern (from `fundingSource.controller.ts`)
```typescript
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FeatureService } from '../services/[feature].service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { CreateSchema, UpdateSchema } from '../validators/[feature].validators';

const service = new FeatureService(prisma); // singleton

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = QuerySchema.parse(req.query);
    const result = await service.findAll(query);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateSchema.parse(req.body);
    const item = await service.create(data);
    res.status(201).json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### Service Pattern (from `fundingSource.service.ts`)
```typescript
import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../lib/logger';
import { CreateDto, UpdateDto } from '../validators/[feature].validators';

export class FeatureService {
  constructor(private prisma: PrismaClient) {}

  async findAll(query): Promise<ListResponse> {
    const { page = 1, limit = 50, search, ... } = query;
    const skip = (page - 1) * limit;
    const where = { /* build filters */ };
    const [items, total] = await Promise.all([
      this.prisma.feature.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.feature.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const record = await this.prisma.feature.findUnique({ where: { id } });
    if (!record) throw new NotFoundError(`Feature with ID ${id} not found`);
    return record;
  }

  async create(data: CreateDto) {
    // Duplicate check → ValidationError on conflict
    const record = await this.prisma.feature.create({ data });
    logger.info('Feature created', { id: record.id });
    return record;
  }

  async update(id: string, data: UpdateDto) {
    await this.findById(id); // 404 guard on every mutation
    const record = await this.prisma.feature.update({ where: { id }, data });
    logger.info('Feature updated', { id: record.id });
    return record;
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.feature.update({ where: { id }, data: { isActive: false } });
  }
}
```

### Validator Pattern (from `fundingSource.validators.ts`) — Zod v4
```typescript
import { z } from 'zod';

// ID param
export const FeatureIdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// GET query
export const GetFeaturesQuerySchema = z.object({
  page: z.preprocess(
    (val) => val ?? '1',
    z.string().regex(/^\d+$/).transform(Number).refine((v) => v > 0),
  ).optional(),
  limit: z.preprocess(
    (val) => val ?? '50',
    z.string().regex(/^\d+$/).transform(Number).refine((v) => v > 0 && v <= 1000),
  ).optional(),
  search: z.string().max(200).optional(),
  isActive: z.string().optional()
    .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined),
  sortBy: z.enum(['name', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// POST body
export const CreateFeatureSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

// PUT body (all optional)
export const UpdateFeatureSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

// TypeScript types inferred from schemas
export type CreateFeatureDto = z.infer<typeof CreateFeatureSchema>;
export type UpdateFeatureDto = z.infer<typeof UpdateFeatureSchema>;
```

### Error Classes (`c:\Tech-V2\backend\src\utils\errors.ts`)
```typescript
AppError           // base, 500
ValidationError    // 400, has field property
AuthenticationError // 401
AuthorizationError  // 403
NotFoundError       // 404
ExternalAPIError    // 502
```

### Auth Middleware
- `authenticate` — validates JWT from `access_token` cookie (falls back to Bearer header). Attaches `req.user = { id, entraId, email, name, roles, groups }`.
- `requireAdmin` — checks `req.user.roles[0] === 'ADMIN'`.
- `checkPermission(module, level)` — ADMIN bypasses; others checked via `UserPermission` table. Modules: `TECHNOLOGY | MAINTENANCE | TRANSPORTATION | NUTRITION | CURRICULUM | FINANCE`. Levels: 1=View, 2=Edit, 3=Admin.

### Permission Recommendation for PO Routes
- View POs: `checkPermission('TECHNOLOGY', 1)`
- Create/Edit POs: `checkPermission('TECHNOLOGY', 2)`
- Approve/Deny POs: `checkPermission('TECHNOLOGY', 2)` or new `FINANCE` module level 1+
- Delete/Admin: `checkPermission('TECHNOLOGY', 3)` / `requireAdmin`

---

## 5. Frontend Patterns

### Route Definitions (`c:\Tech-V2\frontend\src\App.tsx`)
```tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={
      <ProtectedRoute>
        <AppLayout><Dashboard /></AppLayout>
      </ProtectedRoute>
    } />
    <Route path="/inventory" element={
      <ProtectedRoute>           {/* no requireAdmin → any authenticated user */}
        <AppLayout><InventoryManagement /></AppLayout>
      </ProtectedRoute>
    } />
    <Route path="/users" element={
      <ProtectedRoute requireAdmin>  {/* admin-only */}
        <AppLayout><Users /></AppLayout>
      </ProtectedRoute>
    } />
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
</BrowserRouter>
```

**Sprint C-2 routes to add:**
```tsx
<Route path="/purchase-orders" element={
  <ProtectedRoute>
    <AppLayout><PurchaseOrders /></AppLayout>
  </ProtectedRoute>
} />
<Route path="/purchase-orders/:id" element={
  <ProtectedRoute>
    <AppLayout><PurchaseOrderDetail /></AppLayout>
  </ProtectedRoute>
} />
```

### Navigation Sidebar (`c:\Tech-V2\frontend\src\components\layout\AppLayout.tsx`)
```typescript
const NAV_SECTIONS: NavSection[] = [
  { items: [
    { label: 'Dashboard', icon: '🏠', path: '/dashboard' },
    { label: 'My Equipment', icon: '💻', path: '/my-equipment' },
  ]},
  { title: 'Inventory', items: [
    { label: 'Inventory', icon: '📦', path: '/inventory' },
    { label: 'Equipment Search', icon: '🔍', path: '/equipment-search' },
    { label: 'Disposed Equipment', icon: '🗑️', path: '/disposed-equipment' },
    { label: 'Reference Data', icon: '🏷️', path: '/reference-data', adminOnly: true },
  ]},
  { title: 'Operations', items: [
    { label: 'Purchase Orders', icon: '📋', disabled: true }, // ← ACTIVATE IN C-2
    { label: 'Maintenance', icon: '🔧', disabled: true },
  ]},
  { title: 'Admin', items: [
    { label: 'Users', icon: '👥', path: '/users', adminOnly: true },
    { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors', adminOnly: true },
    { label: 'Rooms', icon: '🚪', path: '/rooms', adminOnly: true },
  ]},
  { items: [{ label: 'Reports', icon: '📊', disabled: true }]},
];
```

**Sprint C-2 change:** In the `Operations` section, change the `Purchase Orders` item from `disabled: true` to `path: '/purchase-orders'`.

### Frontend Service Pattern (from `fundingSourceService.ts`)
```typescript
import { api } from './api';

const featureService = {
  getAll: async (params?) => {
    const q = new URLSearchParams();
    // append params...
    const res = await api.get<Response>(`/endpoint?${q.toString()}`);
    return res.data;
  },
  getById: async (id: string) => {
    const res = await api.get(`/endpoint/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/endpoint', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/endpoint/${id}`, data);
    return res.data;
  },
  softDelete: async (id) => {
    const res = await api.delete(`/endpoint/${id}`);
    return res.data;
  },
};
export default featureService;
```

The `api` instance (axios) auto-sends the JWT cookie via `withCredentials: true` and injects the CSRF token from the in-memory cache for POST/PUT/PATCH/DELETE requests.

### TanStack Query Hook Pattern

**Query hook** (`useInventory.ts` as example):
```typescript
import { useQuery, UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import service from '@/services/feature.service';
import { queryKeys } from '@/lib/queryKeys';

export function useFeatureList(page, pageSize, filters, options?) {
  return useQuery({
    queryKey: queryKeys.feature.list({ page, limit: pageSize, ...filters }),
    queryFn: () => service.getAll({ page, limit: pageSize, ...filters }),
    placeholderData: keepPreviousData, // prevents flash-of-empty on page change
    ...options,
  });
}

export function useFeatureStats(options?) {
  return useQuery({
    queryKey: queryKeys.feature.stats(),
    queryFn: () => service.getStats(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
```

**Mutation hook** (`useInventoryMutations.ts` as example):
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import service from '@/services/feature.service';
import { queryKeys } from '@/lib/queryKeys';

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => service.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feature.all });
    },
    onError: (error: Error) => {
      console.error('Failed to create:', error);
    },
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => service.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feature.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.feature.detail(id) });
    },
  });
}
```

### Existing Pages (`c:\Tech-V2\frontend\src\pages\`)
```
Dashboard.tsx
DisposedEquipment.tsx
EquipmentSearch.tsx
InventoryManagement.tsx
Login.tsx
MyEquipment.tsx
ReferenceDataManagement.tsx
RoomManagement.tsx
SupervisorManagement.tsx
Users.tsx
```

**Sprint C-2 pages to add:**
- `PurchaseOrders.tsx` — list / filter / search view
- `PurchaseOrderDetail.tsx` — create / edit / view / status workflow (can be modal or dedicated page)

---

## 6. Legacy PHP Business Logic Summary

### Source Files Analyzed
- `c:\wwwroot\newRequisition.php` — requisition submission
- `c:\wwwroot\approveReq.php` — supervisor/purchasing/DOS approval
- `c:\wwwroot\issuePO.php.old` — PO number issuance (final step)

### Legacy Workflow Status Codes

| Status Code | Meaning | Triggered By |
|-------------|---------|--------------|
| `1` | Submitted (awaiting supervisor approval) | Submitted by standard user |
| `2` | Supervisor Approved | Supervisor (reqLevel 7 or 4) or auto-approved if `reqLevel < 8` or self (`user == supervisor`) |
| `3` | Purchasing Approved | Purchasing staff (reqLevel 2) |
| `4` | DOS (Director of Services) Approved | DOS (reqLevel 1) |
| `5` | PO Issued | Finance/Admin (reqLevel ≤ 3) assigns PO number |

**Auto-approval rule:** If `$_SESSION['reqLevel'] < 8` OR `$_SESSION['username'] == $supervisor`, the req jumps directly to status 2 (supervisor-approved) without emailing the supervisor.

### Legacy Fields in `requisitions` table

| Field | Maps to Prisma | Notes |
|-------|---------------|-------|
| `requisition_number` | `id` (auto-inc in legacy) | UUID in new schema |
| `requisition_date_requested` | `submittedDate` | Auto-set |
| `requisition_first_name` / `_last_name` | (derived from `User`) | |
| `requisition_username` | `requestorId` | Foreign key to User |
| `requisition_school` | Not in schema yet | Should map to `officeLocationId` |
| `requisition_supervisor` | Not in schema yet | `approvedBy` or new field |
| `requisition_program_name` | `program` | ✅ Already in schema |
| `requisition_vendor_name` | `vendorId` (via vendors) | Vendor now normalized |
| `requisition_vendor_address` | `vendors.address` | Look up from vendor |
| `requisition_vendor_city/state/zip` | `vendors.city/state/zip` | Look up from vendor |
| `requisition_vendor_phone` | `vendors.phone` | Look up from vendor |
| `requisition_vendor_fax` | `vendors.fax` | Look up from vendor |
| `requisition_shipto` | **NOT in schema** | Should add `shipTo String?` |
| `requisition_ship_cost` | **NOT in schema** | Should add `shippingCost Decimal?` |
| `requisition_order_info` | **NOT in schema** | Should add `notes String?` or use `description` |
| `requisition_status` | `status` | String in new schema |
| `requisition_po` | `poNumber` | ✅ Already in schema |
| `requisition_date_supervisor` | **NOT in schema** | Add `supervisorApprovedDate DateTime?` |
| `requisition_date_purchasing` | **NOT in schema** | Add `purchasingApprovedDate DateTime?` |
| `requisition_date_dos` | **NOT in schema** | Add `dosApprovedDate DateTime?` |
| `requisition_date_issued` | **NOT in schema** | Add `issuedDate DateTime?` |
| `requisition_account_code` | `accountCode` | ✅ Already in schema |

**Legacy line items (`req` table):**

| Field | Maps to Prisma po_items |
|-------|------------------------|
| `req_requisition` | `poId` |
| `req_line` | Not in schema (add `lineNumber Int?`) |
| `req_model` | Not in schema (add `model String?`) |
| `req_description` | `description` ✅ |
| `req_quantity` | `quantity` ✅ |
| `req_price` | `unitPrice` ✅ |

### Legacy Email Notifications (PHPMailer)
- **Submission email:** Sent to supervisor when status = 1 (awaiting supervisor approval). Subject: "Requisition Approval".
- **Denial email:** Sent to requestor when supervisor denies. Subject: "Requisition Denial". Includes denial message.
- **PO Issued email:** Sent to requestor when status set to 5. Subject: "PO Issued". Includes PO number and optional message.
- SMTP config: Office365 SMTP, port 587, STARTTLS.

### Legacy Permission Levels (reqLevel)
| Level | Role |
|-------|------|
| 1 | DOS (Director of Services) — highest approval |
| 2 | Purchasing staff |
| 3 | Can issue POs (`issuePO.php.old`: `reqLevel > 3` → redirect to permission) |
| 4 | Supervisor (alternate) |
| 7 | Supervisor (can approve to status 2) |
| 8+ | Standard user (no approval rights) |

**New system mapping:**
- Standard requestor → `checkPermission('TECHNOLOGY', 1)` (can view/create)
- Supervisor approval → `checkPermission('TECHNOLOGY', 2)` or specific approval permission
- Admin/Issue PO → `checkPermission('TECHNOLOGY', 3)` or `requireAdmin`

---

## 7. Proposed Status Values for New System

Based on legacy analysis + modern workflow:

```typescript
type POStatus =
  | 'draft'          // saved but not submitted
  | 'pending'        // submitted, awaiting supervisor approval (legacy status 1)
  | 'supervisor_approved'  // legacy status 2
  | 'purchasing_approved'  // legacy status 3
  | 'dos_approved'   // legacy status 4
  | 'issued'         // PO number assigned (legacy status 5)
  | 'denied'         // rejected at any stage
  | 'cancelled';     // cancelled by requestor
```

Simplified 3-step workflow (if legacy approved/dos stages are collapsed):
```typescript
type POStatus = 'draft' | 'pending' | 'approved' | 'issued' | 'denied' | 'cancelled';
```

---

## 8. Email Infrastructure

**No email infrastructure exists** in the current `backend/src/` directory. No `nodemailer` package is installed.

### What must be built for Sprint C-2:
1. Install `nodemailer` and `@types/nodemailer`
2. Create `c:\Tech-V2\backend\src\services\email.service.ts` with:
   - SMTP configuration from environment variables
   - `sendRequisitionSubmittedEmail(to, poData)`
   - `sendApprovalNotificationEmail(to, poData, action)`
   - `sendPOIssuedEmail(to, poData)`
3. Add environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`

---

## 9. Schema Migration Gaps

The current `purchase_orders` and `po_items` schemas are functional but missing fields found in the legacy system. Recommended additions in a new migration:

### `purchase_orders` additions
```prisma
shipTo              String?          // delivery address
shippingCost        Decimal?         @db.Decimal(10, 2)
notes               String?          // order info / special instructions
officeLocationId    String?          // school/location FK
supervisorApprovedBy   String?
supervisorApprovedDate DateTime?
purchasingApprovedBy   String?
purchasingApprovedDate DateTime?
dosApprovedBy       String?
dosApprovedDate     DateTime?
issuedDate         DateTime?
deniedBy           String?
deniedDate         DateTime?
denialReason       String?
```

### `po_items` additions
```prisma
lineNumber    Int?             // display order
model         String?          // part/model number
```

---

## 10. Sprint C-2 Implementation Checklist

### Backend
- [ ] Create DB migration adding missing PO fields (see §9)
- [ ] Create `purchaseOrder.validators.ts` (Zod schemas)
- [ ] Create `purchaseOrder.service.ts` (CRUD + status transitions + validation)
- [ ] Create `purchaseOrder.controller.ts` (HTTP handlers)
- [ ] Create `purchaseOrder.routes.ts` (mount at `/api/purchase-orders`)
- [ ] Register route in `server.ts`
- [ ] Install `nodemailer` + create `email.service.ts`
- [ ] (Optional) Create `vendor.routes.ts/.controller.ts/.service.ts` for vendor CRUD if not handled through reference-data

### Frontend
- [ ] Create `purchaseOrderService.ts` in `src/services/`
- [ ] Create `usePurchaseOrders.ts` in `src/hooks/queries/`
- [ ] Create `usePurchaseOrderMutations.ts` in `src/hooks/mutations/`
- [ ] Create `PurchaseOrders.tsx` page (list view)
- [ ] Create `PurchaseOrderDetail.tsx` page or modal (create/edit/view/approve)
- [ ] Update `App.tsx` to add route `/purchase-orders` and `/purchase-orders/:id`
- [ ] Update `AppLayout.tsx` to activate "Purchase Orders" nav item (remove `disabled: true`, add `path`)
- [ ] Add PO-related TypeScript types in `src/types/`
- [ ] Add query keys for POs in `src/lib/queryKeys.ts`

---

## 11. Key Architectural Decisions Required

1. **Approval workflow depth:** Keep full 4-stage legacy workflow (pending → supervisor → purchasing → DOS → issued) or simplify to 3-stage (pending → approved → issued)?
2. **Vendor management:** Should vendors have their own CRUD pages or be managed inline within PO creation? (Vendors already exist in schema.)
3. **Email notifications:** Immediate send on status change or queue/retry?
4. **PDF export:** Generate PO PDF at issuance? `pdfkit` not yet installed.
5. **File attachments:** Attach quotes/invoices to POs? `multer` is already installed.
6. **Multi-approver:** Can multiple users approve at the same level or is it single-approver per stage?
7. **Draft mode:** Allow users to save POs as `draft` before submitting?

---

*Analysis document generated by Sprint C-2 Exploration Subagent.*  
*Document path: `c:\Tech-V2\docs\SubAgent\sprint_c2_codebase_analysis.md`*

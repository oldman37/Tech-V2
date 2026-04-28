# Sprint C-2 Backend Implementation Spec: Purchase Orders

**Date:** 2026-03-10  
**Author:** Specification Subagent  
**Status:** Ready for Implementation  
**Source:** Based on `sprint_c2_codebase_analysis.md` + live codebase pattern extraction

---

## Table of Contents
1. [Install Commands](#1-install-commands)
2. [Middleware Updates Required](#2-middleware-updates-required)
3. [Prisma Schema Changes](#3-prisma-schema-changes)
4. [Validators — `purchaseOrder.validators.ts`](#4-validators)
5. [Service — `purchaseOrder.service.ts`](#5-purchase-order-service)
6. [Email Service — `email.service.ts`](#6-email-service)
7. [PDF Service — `pdf.service.ts`](#7-pdf-service)
8. [Controller — `purchaseOrder.controller.ts`](#8-controller)
9. [Routes — `purchaseOrder.routes.ts`](#9-routes)
10. [server.ts Mount Line](#10-servert-mount-line)
11. [REQUISITIONS Permission Levels](#11-requisitions-permission-levels)
12. [Migration Command](#12-migration-command)

---

## 1. Install Commands

Run from `c:\Tech-V2\backend\`:

```bash
npm install nodemailer pdfkit
npm install -D @types/nodemailer @types/pdfkit
```

---

## 2. Middleware Updates Required

**Before implementing routes**, two changes must be made to `c:\Tech-V2\backend\src\middleware\permissions.ts`:

### 2a. Add `REQUISITIONS` to `PermissionModule`

```typescript
// CURRENT (line ~14):
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'TRANSPORTATION'
  | 'NUTRITION'
  | 'CURRICULUM'
  | 'FINANCE';

// CHANGE TO:
export type PermissionModule =
  | 'TECHNOLOGY'
  | 'MAINTENANCE'
  | 'TRANSPORTATION'
  | 'NUTRITION'
  | 'CURRICULUM'
  | 'FINANCE'
  | 'REQUISITIONS';
```

### 2b. Expand `PermissionLevel` to support levels 1–5

```typescript
// CURRENT (line ~22):
export type PermissionLevel = 1 | 2 | 3;

// CHANGE TO:
export type PermissionLevel = 1 | 2 | 3 | 4 | 5;
```

### 2c. Seed REQUISITIONS permissions in the database

After running the migration, insert permission records. Add to `c:\Tech-V2\backend\prisma\seed.ts` or run directly:

```sql
INSERT INTO permissions (id, module, level, name, description, "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'REQUISITIONS', 1, 'View Requisitions',    'Can view purchase orders',                         true, now(), now()),
  (gen_random_uuid(), 'REQUISITIONS', 2, 'Create Requisitions',  'Can create and edit own purchase orders',          true, now(), now()),
  (gen_random_uuid(), 'REQUISITIONS', 3, 'Approve Requisitions', 'Supervisor — can approve/reject at first stage',   true, now(), now()),
  (gen_random_uuid(), 'REQUISITIONS', 4, 'Purchasing Approval',  'Purchasing staff — assign account code + approve', true, now(), now()),
  (gen_random_uuid(), 'REQUISITIONS', 5, 'Issue PO',             'DOS/Director — final approval + issue PO number',  true, now(), now())
ON CONFLICT (module, level) DO NOTHING;
```

---

## 3. Prisma Schema Changes

### 3a. Modify `purchase_orders` model

The current model must receive the following additions. Fields are added after `updatedAt` and before the existing relations:

```prisma
model purchase_orders {
  id                String     @id @default(uuid())
  poNumber          String?    @unique              // CHANGED: String → String? (null until issuance)
  type              String
  requestorId       String
  vendorId          String?
  description       String                           // serves as PO title / description
  amount            Decimal    @db.Decimal(10, 2)
  status            String     @default("draft")     // CHANGED default: "pending" → "draft"
  accountCode       String?
  program           String?
  isApproved        Boolean    @default(false)
  approvedBy        String?
  approvedDate      DateTime?
  submittedDate     DateTime?                        // CHANGED: removed @default(now()); set by submitPurchaseOrder()
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  // Sprint C-2 additions
  shipTo            String?                          // delivery address
  shippingCost      Decimal?   @db.Decimal(10, 2)   // freight / shipping cost
  notes             String?                          // order info / special instructions
  officeLocationId  String?                          // FK: school / office location
  denialReason      String?                          // set when status = "denied"
  submittedAt       DateTime?                        // set by submitPurchaseOrder()
  approvedAt        DateTime?                        // set when dos_approved
  issuedAt          DateTime?                        // set by issuePurchaseOrder()

  // Relations
  po_items          po_items[]
  statusHistory     RequisitionStatusHistory[]
  User              User            @relation(fields: [requestorId], references: [id])
  vendors           vendors?        @relation(fields: [vendorId], references: [id])
  officeLocation    OfficeLocation? @relation("POOfficeLocation", fields: [officeLocationId], references: [id])

  @@index([status])
  @@index([type])
  @@index([requestorId])
  @@index([officeLocationId])
}
```

### 3b. Modify `po_items` model

Add `lineNumber` and `model` after `description`:

```prisma
model po_items {
  id              String          @id @default(uuid())
  poId            String
  description     String
  lineNumber      Int?                               // Sprint C-2: display ordering
  model           String?                            // Sprint C-2: part / model number
  quantity        Int
  unitPrice       Decimal         @db.Decimal(10, 2)
  totalPrice      Decimal         @db.Decimal(10, 2)
  createdAt       DateTime        @default(now())
  purchase_orders purchase_orders @relation(fields: [poId], references: [id], onDelete: Cascade)
}
```

### 3c. Add new model `RequisitionStatusHistory`

Insert AFTER the `po_items` model block and BEFORE `purchase_orders` (or anywhere — Prisma doesn't care about order):

```prisma
model RequisitionStatusHistory {
  id              String          @id @default(uuid())
  purchaseOrderId String
  fromStatus      String
  toStatus        String
  changedById     String
  changedAt       DateTime        @default(now())
  notes           String?

  purchaseOrder   purchase_orders @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  changedBy       User            @relation("POStatusChangedBy", fields: [changedById], references: [id])

  @@index([purchaseOrderId])
  @@index([changedById])
  @@index([changedAt])
  @@map("requisition_status_history")
}
```

### 3d. Add back-references on related models

**On `OfficeLocation` model** — add inside the model block (after existing relations):

```prisma
  purchase_orders purchase_orders[] @relation("POOfficeLocation")
```

**On `User` model** — add inside the model block (after existing relations):

```prisma
  poStatusHistory  RequisitionStatusHistory[] @relation("POStatusChangedBy")
```

---

## 4. Validators

**File:** `c:\Tech-V2\backend\src\validators\purchaseOrder.validators.ts`

```typescript
/**
 * Zod validation schemas for purchase order endpoints
 *
 * Follows the exact pattern of fundingSource.validators.ts.
 * All schemas exported individually; TypeScript types inferred via z.infer<>.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PO_VALID_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'purchasing_approved',
  'dos_approved',
  'po_issued',
  'denied',
] as const;

export type POStatus = (typeof PO_VALID_STATUSES)[number];

// ---------------------------------------------------------------------------
// ID param schema
// ---------------------------------------------------------------------------

export const PurchaseOrderIdParamSchema = z.object({
  id: z.string().uuid('Invalid purchase order ID format'),
});

// ---------------------------------------------------------------------------
// Line item sub-schema (used inside CreatePurchaseOrderSchema)
// ---------------------------------------------------------------------------

const PoItemSchema = z.object({
  description: z
    .string()
    .min(1, 'Item description is required')
    .max(500, 'Description must be 500 characters or less'),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than zero'),
  unitPrice: z
    .number({ invalid_type_error: 'Unit price must be a number' })
    .positive('Unit price must be greater than zero'),
  lineNumber: z.number().int().positive().optional(),
  model: z.string().max(200, 'Model must be 200 characters or less').optional().nullable(),
});

// ---------------------------------------------------------------------------
// GET /purchase-orders query schema
// ---------------------------------------------------------------------------

export const PurchaseOrderQuerySchema = z.object({
  page: z
    .preprocess(
      (val) => val ?? '1',
      z
        .string()
        .regex(/^\d+$/, 'Page must be a number')
        .transform(Number)
        .refine((v) => v > 0, 'Page must be greater than 0'),
    )
    .optional(),
  limit: z
    .preprocess(
      (val) => val ?? '25',
      z
        .string()
        .regex(/^\d+$/, 'Limit must be a number')
        .transform(Number)
        .refine((v) => v > 0 && v <= 200, 'Limit must be between 1 and 200'),
    )
    .optional(),
  status: z.enum(PO_VALID_STATUSES).optional(),
  search: z.string().max(200, 'Search query too long').optional(),
  dateFrom: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      'dateFrom must be a valid ISO date string',
    ),
  dateTo: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      'dateTo must be a valid ISO date string',
    ),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

// ---------------------------------------------------------------------------
// POST /purchase-orders — create
// ---------------------------------------------------------------------------

export const CreatePurchaseOrderSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  type: z.string().min(1).max(100).optional().default('general'),
  vendorId: z.string().uuid('Invalid vendor ID format').optional().nullable(),
  shipTo: z.string().max(500, 'Ship-to address must be 500 characters or less').optional().nullable(),
  shippingCost: z
    .number({ invalid_type_error: 'Shipping cost must be a number' })
    .min(0, 'Shipping cost cannot be negative')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  program: z.string().max(200, 'Program must be 200 characters or less').optional().nullable(),
  officeLocationId: z.string().uuid('Invalid location ID').optional().nullable(),
  items: z
    .array(PoItemSchema)
    .min(1, 'At least one line item is required')
    .max(100, 'Cannot exceed 100 line items'),
});

// ---------------------------------------------------------------------------
// PUT /purchase-orders/:id — update (all fields optional)
// ---------------------------------------------------------------------------

export const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial();

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/approve — approve at current stage
// ---------------------------------------------------------------------------

export const ApproveSchema = z.object({
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional().nullable(),
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/reject — reject / deny
// ---------------------------------------------------------------------------

export const RejectSchema = z.object({
  reason: z
    .string()
    .min(1, 'Denial reason is required')
    .max(1000, 'Reason must be 1000 characters or less'),
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/account — assign account code
// ---------------------------------------------------------------------------

export const AssignAccountSchema = z.object({
  accountCode: z
    .string()
    .min(1, 'Account code is required')
    .max(100, 'Account code must be 100 characters or less'),
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/issue — issue PO number
// ---------------------------------------------------------------------------

export const IssuePOSchema = z.object({
  poNumber: z
    .string()
    .min(1, 'PO number is required')
    .max(100, 'PO number must be 100 characters or less'),
});

// ---------------------------------------------------------------------------
// TypeScript DTO types
// ---------------------------------------------------------------------------

export type CreatePurchaseOrderDto = z.infer<typeof CreatePurchaseOrderSchema>;
export type UpdatePurchaseOrderDto = z.infer<typeof UpdatePurchaseOrderSchema>;
export type ApproveDto = z.infer<typeof ApproveSchema>;
export type RejectDto = z.infer<typeof RejectSchema>;
export type AssignAccountDto = z.infer<typeof AssignAccountSchema>;
export type IssuePODto = z.infer<typeof IssuePOSchema>;
export type PurchaseOrderQueryDto = z.infer<typeof PurchaseOrderQuerySchema>;
```

---

## 5. Purchase Order Service

**File:** `c:\Tech-V2\backend\src\services\purchaseOrder.service.ts`

```typescript
/**
 * Purchase Order Service
 *
 * Business logic for the full PO requisition workflow:
 *   draft → submitted → supervisor_approved → purchasing_approved → dos_approved → po_issued
 *   Any status → denied (via reject)
 *
 * Follows the FundingSourceService class pattern exactly.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors';
import { logger } from '../lib/logger';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApproveDto,
  RejectDto,
  AssignAccountDto,
  IssuePODto,
  PurchaseOrderQueryDto,
  POStatus,
} from '../validators/purchaseOrder.validators';
import { generatePurchaseOrderPdf } from './pdf.service';

// ---------------------------------------------------------------------------
// Workflow constants
// ---------------------------------------------------------------------------

const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
  3: { from: 'submitted',           to: 'supervisor_approved' },
  4: { from: 'supervisor_approved', to: 'purchasing_approved' },
  5: { from: 'purchasing_approved', to: 'dos_approved' },
};

// Statuses where the PO can still be edited or deleted by the requestor
const EDITABLE_STATUSES: POStatus[] = ['draft'];
const DELETABLE_STATUSES: POStatus[] = ['draft'];

// Statuses that can be rejected (all active workflow stages)
const REJECTABLE_STATUSES: POStatus[] = [
  'submitted',
  'supervisor_approved',
  'purchasing_approved',
  'dos_approved',
];

// ---------------------------------------------------------------------------
// Query / response interfaces
// ---------------------------------------------------------------------------

export interface PurchaseOrderListResponse {
  items: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class PurchaseOrderService {
  constructor(private prisma: PrismaClient) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Create a new purchase order in draft status.
   * PO + all items created atomically in a single transaction.
   * `amount` is computed as sum of (quantity × unitPrice) + shippingCost.
   */
  async createPurchaseOrder(
    data: CreatePurchaseOrderDto,
    requestorId: string,
  ) {
    const itemsTotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const totalAmount = itemsTotal + (data.shippingCost ?? 0);

    const po = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase_orders.create({
        data: {
          description:      data.title,
          type:             data.type ?? 'general',
          requestorId,
          vendorId:         data.vendorId ?? null,
          shipTo:           data.shipTo ?? null,
          shippingCost:     data.shippingCost != null ? new Prisma.Decimal(data.shippingCost) : null,
          notes:            data.notes ?? null,
          program:          data.program ?? null,
          officeLocationId: data.officeLocationId ?? null,
          amount:           new Prisma.Decimal(totalAmount),
          status:           'draft',
          po_items: {
            create: data.items.map((item, index) => ({
              description: item.description,
              lineNumber:  item.lineNumber ?? index + 1,
              model:       item.model ?? null,
              quantity:    item.quantity,
              unitPrice:   new Prisma.Decimal(item.unitPrice),
              totalPrice:  new Prisma.Decimal(item.quantity * item.unitPrice),
            })),
          },
        },
        include: {
          po_items:       { orderBy: { lineNumber: 'asc' } },
          User:           { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors:        { select: { id: true, name: true, email: true, phone: true, address: true, city: true, state: true, zip: true } },
          officeLocation: true,
        },
      });
      return record;
    });

    logger.info('Purchase order created', { id: po.id, requestorId, status: 'draft' });
    return po;
  }

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  /**
   * Return a paginated, filtered list of purchase orders.
   * permLevel 1 = can only see own POs; permLevel 2+ = can see all POs.
   */
  async getPurchaseOrders(
    filters: PurchaseOrderQueryDto,
    userId: string,
    permLevel: number,
  ): Promise<PurchaseOrderListResponse> {
    const { page = 1, limit = 25, status, search, dateFrom, dateTo, locationId } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.purchase_ordersWhereInput = {
      // Scope: level 1 sees only own POs; level 2+ sees all
      ...(permLevel < 2 && { requestorId: userId }),
      ...(status && { status }),
      ...(locationId && { officeLocationId: locationId }),
      ...(search && {
        OR: [
          { description: { contains: search, mode: 'insensitive' as const } },
          { poNumber:    { contains: search, mode: 'insensitive' as const } },
          { program:     { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo   && { lte: new Date(dateTo)   }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.purchase_orders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: { select: { id: true, name: true } },
          officeLocation: { select: { id: true, name: true, code: true } },
          _count:  { select: { po_items: true } },
        },
      }),
      this.prisma.purchase_orders.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // -------------------------------------------------------------------------
  // Get by ID
  // -------------------------------------------------------------------------

  /**
   * Return a single PO with full detail: items, history, requestor, vendor, location.
   * Level 1 users can only view their own PO.
   */
  async getPurchaseOrderById(id: string, userId: string, permLevel: number) {
    const po = await this.prisma.purchase_orders.findUnique({
      where: { id },
      include: {
        po_items:      { orderBy: { lineNumber: 'asc' } },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: {
            changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        User:           { select: { id: true, firstName: true, lastName: true, email: true, department: true, jobTitle: true } },
        vendors:        true,
        officeLocation: true,
      },
    });

    if (!po) {
      throw new NotFoundError('Purchase order', id);
    }

    if (permLevel < 2 && po.requestorId !== userId) {
      throw new AuthorizationError('You do not have permission to view this purchase order');
    }

    return po;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * Update a PO. Only allowed when status = 'draft'.
   * Requestor can edit own drafts; level 2+ can edit any draft.
   */
  async updatePurchaseOrder(
    id: string,
    data: UpdatePurchaseOrderDto,
    userId: string,
    permLevel: number,
  ) {
    const po = await this.getPurchaseOrderById(id, userId, permLevel);

    if (!EDITABLE_STATUSES.includes(po.status as POStatus)) {
      throw new ValidationError(
        `Purchase order cannot be edited in status "${po.status}". Only draft POs can be edited.`,
        'status',
      );
    }

    if (permLevel < 2 && po.requestorId !== userId) {
      throw new AuthorizationError('You can only edit your own purchase orders');
    }

    const itemsTotal = data.items
      ? data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      : Number(po.amount) - Number(po.shippingCost ?? 0);
    const totalAmount = itemsTotal + (data.shippingCost ?? Number(po.shippingCost ?? 0));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Replace items if provided
      if (data.items) {
        await tx.po_items.deleteMany({ where: { poId: id } });
        await tx.po_items.createMany({
          data: data.items.map((item, index) => ({
            poId:        id,
            description: item.description,
            lineNumber:  item.lineNumber ?? index + 1,
            model:       item.model ?? null,
            quantity:    item.quantity,
            unitPrice:   new Prisma.Decimal(item.unitPrice),
            totalPrice:  new Prisma.Decimal(item.quantity * item.unitPrice),
          })),
        });
      }

      return tx.purchase_orders.update({
        where: { id },
        data: {
          ...(data.title            !== undefined && { description:      data.title }),
          ...(data.type             !== undefined && { type:             data.type }),
          ...(data.vendorId         !== undefined && { vendorId:         data.vendorId }),
          ...(data.shipTo           !== undefined && { shipTo:           data.shipTo }),
          ...(data.shippingCost     !== undefined && { shippingCost:     data.shippingCost != null ? new Prisma.Decimal(data.shippingCost) : null }),
          ...(data.notes            !== undefined && { notes:            data.notes }),
          ...(data.program          !== undefined && { program:          data.program }),
          ...(data.officeLocationId !== undefined && { officeLocationId: data.officeLocationId }),
          ...(data.items            !== undefined && { amount:           new Prisma.Decimal(totalAmount) }),
        },
        include: {
          po_items:       { orderBy: { lineNumber: 'asc' } },
          User:           { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors:        true,
          officeLocation: true,
        },
      });
    });

    logger.info('Purchase order updated', { id, updatedBy: userId });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /**
   * Delete a PO. Only allowed when status = 'draft'.
   * Cascade deletes all po_items via Prisma relation.
   */
  async deletePurchaseOrder(id: string, userId: string, permLevel: number) {
    const po = await this.getPurchaseOrderById(id, userId, permLevel);

    if (!DELETABLE_STATUSES.includes(po.status as POStatus)) {
      throw new ValidationError(
        `Purchase order cannot be deleted in status "${po.status}". Only draft POs can be deleted.`,
        'status',
      );
    }

    if (permLevel < 2 && po.requestorId !== userId) {
      throw new AuthorizationError('You can only delete your own purchase orders');
    }

    await this.prisma.purchase_orders.delete({ where: { id } });
    logger.info('Purchase order deleted', { id, deletedBy: userId });
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  /**
   * Submit a draft PO for supervisor approval.
   * Transitions: draft → submitted.
   * Requestor can only submit their own PO.
   */
  async submitPurchaseOrder(id: string, userId: string) {
    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    if (po.requestorId !== userId) {
      throw new AuthorizationError('You can only submit your own purchase orders');
    }

    if (po.status !== 'draft') {
      throw new ValidationError(
        `Only draft purchase orders can be submitted. Current status: "${po.status}"`,
        'status',
      );
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase_orders.update({
        where: { id },
        data: {
          status:        'submitted',
          submittedAt:   now,
          submittedDate: now,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      'draft',
          toStatus:        'submitted',
          changedById:     userId,
          changedAt:       now,
        },
      });

      return record;
    });

    logger.info('Purchase order submitted', { id, submittedBy: userId });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Approve
  // -------------------------------------------------------------------------

  /**
   * Approve a PO at the appropriate stage based on the approver's permission level.
   *   permLevel 3 → submitted        → supervisor_approved
   *   permLevel 4 → supervisor_approved → purchasing_approved
   *   permLevel 5 → purchasing_approved → dos_approved
   */
  async approvePurchaseOrder(
    id: string,
    userId: string,
    permLevel: number,
    approveData?: ApproveDto,
  ) {
    const transition = APPROVAL_TRANSITIONS[permLevel];
    if (!transition) {
      throw new AuthorizationError(
        'Your permission level does not allow approving purchase orders',
      );
    }

    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    if (po.status !== transition.from) {
      throw new ValidationError(
        `Cannot approve: expected status "${transition.from}", current status is "${po.status}"`,
        'status',
      );
    }

    const now = new Date();

    // Build stage-specific update payload
    const stageUpdates: Prisma.purchase_ordersUpdateInput = {
      status: transition.to,
      ...(transition.to === 'dos_approved' && { approvedAt: now }),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase_orders.update({
        where: { id },
        data: stageUpdates,
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      transition.from,
          toStatus:        transition.to,
          changedById:     userId,
          changedAt:       now,
          notes:           approveData?.notes ?? null,
        },
      });

      return record;
    });

    logger.info('Purchase order approved', {
      id,
      approvedBy: userId,
      permLevel,
      newStatus: transition.to,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Reject / Deny
  // -------------------------------------------------------------------------

  /**
   * Reject a PO at any active workflow stage.
   * Transitions: any rejectable status → denied.
   * Sets denialReason on the PO record.
   */
  async rejectPurchaseOrder(id: string, userId: string, rejectData: RejectDto) {
    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    if (!REJECTABLE_STATUSES.includes(po.status as POStatus)) {
      throw new ValidationError(
        `Purchase order in status "${po.status}" cannot be rejected`,
        'status',
      );
    }

    const fromStatus = po.status as POStatus;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase_orders.update({
        where: { id },
        data: {
          status:       'denied',
          denialReason: rejectData.reason,
          isApproved:   false,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus,
          toStatus:        'denied',
          changedById:     userId,
          changedAt:       now,
          notes:           rejectData.reason,
        },
      });

      return record;
    });

    logger.info('Purchase order rejected', { id, rejectedBy: userId, reason: rejectData.reason });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Assign Account Code
  // -------------------------------------------------------------------------

  /**
   * Assign an account code to a PO.
   * Requires: status = purchasing_approved, permLevel >= 4.
   * (Route middleware enforces level 4; this method additionally guards on status.)
   */
  async assignAccountCode(
    id: string,
    accountData: AssignAccountDto,
    userId: string,
  ) {
    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    if (po.status !== 'purchasing_approved') {
      throw new ValidationError(
        `Account code can only be assigned when status is "purchasing_approved". Current: "${po.status}"`,
        'status',
      );
    }

    const updated = await this.prisma.purchase_orders.update({
      where: { id },
      data: { accountCode: accountData.accountCode },
      include: {
        User:    { select: { id: true, firstName: true, lastName: true, email: true } },
        vendors: true,
      },
    });

    logger.info('Account code assigned to purchase order', {
      id,
      accountCode: accountData.accountCode,
      assignedBy: userId,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Issue PO
  // -------------------------------------------------------------------------

  /**
   * Issue a PO number, finalizing the requisition.
   * Requires: status = dos_approved, accountCode must be set, permLevel 5.
   * Sets poNumber, issuedAt, status = po_issued, isApproved = true.
   */
  async issuePurchaseOrder(
    id: string,
    issueData: IssuePODto,
    userId: string,
  ) {
    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    if (po.status !== 'dos_approved') {
      throw new ValidationError(
        `PO can only be issued when status is "dos_approved". Current: "${po.status}"`,
        'status',
      );
    }

    if (!po.accountCode) {
      throw new ValidationError(
        'An account code must be assigned before issuing the PO',
        'accountCode',
      );
    }

    // Ensure po number is not already taken by another PO
    const existing = await this.prisma.purchase_orders.findFirst({
      where: { poNumber: issueData.poNumber, NOT: { id } },
    });
    if (existing) {
      throw new ValidationError(
        `PO number "${issueData.poNumber}" is already in use`,
        'poNumber',
      );
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase_orders.update({
        where: { id },
        data: {
          poNumber:    issueData.poNumber,
          status:      'po_issued',
          issuedAt:    now,
          isApproved:  true,
          approvedBy:  userId,
          approvedDate: now,
        },
        include: {
          po_items:       { orderBy: { lineNumber: 'asc' } },
          User:           { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors:        true,
          officeLocation: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus:      'dos_approved',
          toStatus:        'po_issued',
          changedById:     userId,
          changedAt:       now,
        },
      });

      return record;
    });

    logger.info('Purchase order issued', {
      id,
      poNumber: issueData.poNumber,
      issuedBy: userId,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Generate PDF
  // -------------------------------------------------------------------------

  /**
   * Generate a PDF for the purchase order.
   * Delegates all rendering to pdf.service.
   */
  async generatePOPdf(id: string): Promise<Buffer> {
    const po = await this.prisma.purchase_orders.findUnique({
      where: { id },
      include: {
        po_items:       { orderBy: { lineNumber: 'asc' } },
        User:           { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
        vendors:        true,
        officeLocation: true,
      },
    });

    if (!po) throw new NotFoundError('Purchase order', id);

    return generatePurchaseOrderPdf(po as any);
  }

  // -------------------------------------------------------------------------
  // Status History
  // -------------------------------------------------------------------------

  /**
   * Return the full status history for a PO, newest first.
   */
  async getPurchaseOrderHistory(id: string) {
    const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
    if (!po) throw new NotFoundError('Purchase order', id);

    return this.prisma.requisitionStatusHistory.findMany({
      where: { purchaseOrderId: id },
      orderBy: { changedAt: 'desc' },
      include: {
        changedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
```

---

## 6. Email Service

**File:** `c:\Tech-V2\backend\src\services\email.service.ts`

```typescript
/**
 * Email Service
 *
 * Nodemailer-based email notifications for the PO requisition workflow.
 * All sends are wrapped in try/catch — email failures are logged but never
 * thrown, because email is non-critical to workflow correctness.
 *
 * Environment variables required:
 *   SMTP_HOST     — SMTP server host (e.g., smtp.office365.com)
 *   SMTP_PORT     — SMTP server port (e.g., 587)
 *   SMTP_SECURE   — "true" for TLS, "false" for STARTTLS
 *   SMTP_USER     — SMTP auth username
 *   SMTP_PASS     — SMTP auth password
 *   SMTP_FROM     — From address (e.g., noreply@district.org)
 */

import nodemailer from 'nodemailer';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Transporter (singleton, created once on module load)
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM ?? 'noreply@district.org';

// ---------------------------------------------------------------------------
// Internal send helper
// ---------------------------------------------------------------------------

async function sendMail(options: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from:    FROM_ADDRESS,
      to:      options.to,
      subject: options.subject,
      html:    options.html,
    });
    logger.info('Email sent', { to: options.to, subject: options.subject });
  } catch (error) {
    logger.error('Failed to send email', {
      to:      options.to,
      subject: options.subject,
      error,
    });
    // Intentionally not re-throwing — email is non-critical
  }
}

// ---------------------------------------------------------------------------
// PO detail HTML snippet (shared across templates)
// ---------------------------------------------------------------------------

function poDetailHtml(po: {
  id:          string;
  description: string;
  poNumber?:   string | null;
  amount:      any;
  vendors?:    { name: string } | null;
}): string {
  return `
    <table style="border-collapse:collapse;width:100%;margin-top:16px;">
      <tr><td style="padding:4px 8px;font-weight:bold;">PO Title:</td>
          <td style="padding:4px 8px;">${po.description}</td></tr>
      ${po.poNumber ? `<tr><td style="padding:4px 8px;font-weight:bold;">PO Number:</td>
          <td style="padding:4px 8px;">${po.poNumber}</td></tr>` : ''}
      <tr><td style="padding:4px 8px;font-weight:bold;">Vendor:</td>
          <td style="padding:4px 8px;">${po.vendors?.name ?? 'N/A'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Total Amount:</td>
          <td style="padding:4px 8px;">$${Number(po.amount).toFixed(2)}</td></tr>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Public send functions
// ---------------------------------------------------------------------------

/**
 * Notify the supervisor that a new requisition is awaiting approval.
 * Called after submitPurchaseOrder().
 */
export async function sendRequisitionSubmitted(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Approval Required: ${po.description}`,
    html: `
      <h2 style="color:#1565C0;">New Purchase Requisition Awaiting Your Approval</h2>
      <p>A new purchase requisition has been submitted and requires your review.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">Please log in to the system to review and approve or deny this requisition.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO was approved at a workflow stage.
 * Called after approvePurchaseOrder().
 */
export async function sendRequisitionApproved(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
  stageName: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Approved (${stageName}): ${po.description}`,
    html: `
      <h2 style="color:#2E7D32;">Your Purchase Requisition Has Been Approved</h2>
      <p>Your requisition has advanced to the next stage: <strong>${stageName}</strong>.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">No action is required from you at this time.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO was rejected.
 * Called after rejectPurchaseOrder().
 */
export async function sendRequisitionRejected(
  po: { id: string; description: string; amount: any; vendors?: { name: string } | null },
  toEmail: string,
  reason: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `Requisition Denied: ${po.description}`,
    html: `
      <h2 style="color:#C62828;">Your Purchase Requisition Has Been Denied</h2>
      <p>We regret to inform you that your purchase requisition has been denied.</p>
      ${poDetailHtml(po)}
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${reason}
      </blockquote>
      <p style="margin-top:16px;">If you believe this decision was made in error, please contact your supervisor.</p>
    `,
  });
}

/**
 * Notify the requestor that their PO has been issued with a PO number.
 * Called after issuePurchaseOrder().
 */
export async function sendPOIssued(
  po: { id: string; description: string; poNumber?: string | null; amount: any; vendors?: { name: string } | null },
  toEmail: string,
): Promise<void> {
  await sendMail({
    to:      toEmail,
    subject: `PO Issued: ${po.poNumber} — ${po.description}`,
    html: `
      <h2 style="color:#1565C0;">Your Purchase Order Has Been Issued</h2>
      <p>Your purchase requisition has been approved and issued with the following PO number:</p>
      <p style="font-size:24px;font-weight:bold;color:#1565C0;">${po.poNumber}</p>
      ${poDetailHtml(po)}
      <p style="margin-top:24px;">Please reference this PO number when communicating with the vendor or making purchases.</p>
    `,
  });
}
```

---

## 7. PDF Service

**File:** `c:\Tech-V2\backend\src\services\pdf.service.ts`

```typescript
/**
 * PDF Service
 *
 * Generates purchase order PDF documents using pdfkit.
 * Returns a Promise<Buffer> suitable for streaming to the HTTP response.
 */

import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// Types (inline to avoid cross-service coupling)
// ---------------------------------------------------------------------------

interface POItem {
  lineNumber: number | null;
  description: string;
  model:       string | null;
  quantity:    number;
  unitPrice:   any;
  totalPrice:  any;
}

interface POForPdf {
  id:           string;
  poNumber:     string | null;
  description:  string;
  status:       string;
  amount:       any;
  accountCode:  string | null;
  program:      string | null;
  shipTo:       string | null;
  shippingCost: any | null;
  notes:        string | null;
  createdAt:    Date;
  issuedAt:     Date | null;
  po_items:     POItem[];
  User: {
    firstName: string;
    lastName:  string;
    email:     string;
    department?: string | null;
  } | null;
  vendors: {
    name:    string;
    address: string | null;
    city:    string | null;
    state:   string | null;
    zip:     string | null;
    phone:   string | null;
    fax:     string | null;
  } | null;
  officeLocation: {
    name:    string;
    code:    string | null;
    address: string | null;
    city:    string | null;
    state:   string | null;
    zip:     string | null;
    phone:   string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN   = 50;
const PAGE_W   = 612; // US Letter width in points
const COL_W    = PAGE_W - MARGIN * 2;
const FONT_REG = 'Helvetica';
const FONT_BLD = 'Helvetica-Bold';
const PRIMARY  = '#1565C0';
const LIGHT_BG = '#F5F5F5';

// ---------------------------------------------------------------------------
// Helper: draw a horizontal rule
// ---------------------------------------------------------------------------

function hRule(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#BDBDBD').lineWidth(0.5).stroke();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generatePurchaseOrderPdf(po: POForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data',  (chunk) => chunks.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---- Header --------------------------------------------------------
      doc
        .font(FONT_BLD)
        .fontSize(18)
        .fillColor(PRIMARY)
        .text('PURCHASE ORDER', MARGIN, MARGIN, { align: 'center' });

      doc
        .font(FONT_REG)
        .fontSize(10)
        .fillColor('#212121')
        .text('Technology Department', { align: 'center' });

      doc.moveDown(0.5);
      hRule(doc, doc.y);
      doc.moveDown(0.5);

      // ---- PO Number & Date row ------------------------------------------
      const poDate = po.issuedAt ?? po.createdAt;
      doc
        .font(FONT_BLD).fontSize(10)
        .text('PO Number:', MARGIN, doc.y, { continued: true, width: 80 })
        .font(FONT_REG)
        .text(po.poNumber ?? 'PENDING', { continued: false });

      doc
        .font(FONT_BLD)
        .text('Date:', MARGIN, doc.y, { continued: true, width: 80 })
        .font(FONT_REG)
        .text(poDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

      doc.moveDown(0.5);
      hRule(doc, doc.y);
      doc.moveDown(0.5);

      // ---- Two-column section: Requester | Vendor ------------------------
      const leftX  = MARGIN;
      const rightX = MARGIN + COL_W / 2 + 10;
      const colW   = (COL_W / 2) - 10;
      let sectionTop = doc.y;

      // Left: Requester info
      doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('REQUESTED BY', leftX, sectionTop);
      doc.moveDown(0.2);
      const reqY = doc.y;
      if (po.User) {
        doc.font(FONT_REG).fontSize(9).fillColor('#212121');
        doc.text(`${po.User.firstName} ${po.User.lastName}`, leftX, reqY, { width: colW });
        doc.text(po.User.email, leftX, doc.y, { width: colW });
        if (po.User.department) doc.text(po.User.department, leftX, doc.y, { width: colW });
      }
      if (po.officeLocation) {
        doc.text(po.officeLocation.name, leftX, doc.y, { width: colW });
      }

      // Right: Vendor info
      doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('VENDOR', rightX, sectionTop);
      doc.moveDown(0.2);
      if (po.vendors) {
        doc.font(FONT_REG).fontSize(9).fillColor('#212121');
        doc.text(po.vendors.name,                               rightX, reqY, { width: colW });
        if (po.vendors.address) doc.text(po.vendors.address,   rightX, doc.y, { width: colW });
        const csz = [po.vendors.city, po.vendors.state, po.vendors.zip].filter(Boolean).join(', ');
        if (csz) doc.text(csz,                                  rightX, doc.y, { width: colW });
        if (po.vendors.phone) doc.text(`Ph: ${po.vendors.phone}`, rightX, doc.y, { width: colW });
        if (po.vendors.fax)   doc.text(`Fax: ${po.vendors.fax}`, rightX, doc.y, { width: colW });
      }

      doc.moveDown(1.5);
      hRule(doc, doc.y);
      doc.moveDown(0.5);

      // ---- Ship To -------------------------------------------------------
      if (po.shipTo) {
        doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('SHIP TO');
        doc.font(FONT_REG).fontSize(9).fillColor('#212121').text(po.shipTo, { width: COL_W });
        doc.moveDown(0.5);
        hRule(doc, doc.y);
        doc.moveDown(0.5);
      }

      // ---- Line Items Table ---------------------------------------------
      doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('LINE ITEMS');
      doc.moveDown(0.3);

      // Table header
      const col = {
        line:  { x: MARGIN,       w: 30  },
        desc:  { x: MARGIN + 30,  w: 220 },
        model: { x: MARGIN + 250, w: 100 },
        qty:   { x: MARGIN + 350, w: 40  },
        price: { x: MARGIN + 390, w: 60  },
        total: { x: MARGIN + 450, w: 62  },
      };

      // Header background
      doc
        .rect(MARGIN, doc.y, COL_W, 16)
        .fillAndStroke(LIGHT_BG, '#E0E0E0');

      const headerY = doc.y + 4;
      doc.font(FONT_BLD).fontSize(8).fillColor('#212121');
      doc.text('#',           col.line.x,  headerY, { width: col.line.w  });
      doc.text('Description', col.desc.x,  headerY, { width: col.desc.w  });
      doc.text('Model',       col.model.x, headerY, { width: col.model.w });
      doc.text('Qty',         col.qty.x,   headerY, { width: col.qty.w   });
      doc.text('Unit Price',  col.price.x, headerY, { width: col.price.w });
      doc.text('Total',       col.total.x, headerY, { width: col.total.w });
      doc.moveDown(1);

      // Rows
      doc.font(FONT_REG).fontSize(8).fillColor('#212121');
      for (const item of po.po_items) {
        const rowY = doc.y;
        doc.text(String(item.lineNumber ?? ''),          col.line.x,  rowY, { width: col.line.w  });
        doc.text(item.description,                       col.desc.x,  rowY, { width: col.desc.w  });
        doc.text(item.model ?? '',                       col.model.x, rowY, { width: col.model.w });
        doc.text(String(item.quantity),                  col.qty.x,   rowY, { width: col.qty.w   });
        doc.text(`$${Number(item.unitPrice).toFixed(2)}`, col.price.x, rowY, { width: col.price.w });
        doc.text(`$${Number(item.totalPrice).toFixed(2)}`, col.total.x, rowY, { width: col.total.w });
        doc.moveDown(0.4);
        hRule(doc, doc.y);
        doc.moveDown(0.2);
      }

      // Totals
      doc.moveDown(0.3);
      const subtotal = po.po_items.reduce((s, i) => s + Number(i.totalPrice), 0);
      const shipping = Number(po.shippingCost ?? 0);
      const grandTotal = subtotal + shipping;

      doc.font(FONT_REG).fontSize(9);
      if (shipping > 0) {
        doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: 'right' });
        doc.text(`Shipping: $${shipping.toFixed(2)}`, { align: 'right' });
      }
      doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY);
      doc.text(`TOTAL: $${grandTotal.toFixed(2)}`, { align: 'right' });

      doc.moveDown(0.5);
      hRule(doc, doc.y);
      doc.moveDown(0.5);

      // ---- Account Code / Program ----------------------------------------
      if (po.accountCode || po.program) {
        doc.font(FONT_BLD).fontSize(9).fillColor('#212121');
        if (po.accountCode) doc.text(`Account Code: ${po.accountCode}`);
        if (po.program)     doc.text(`Program: ${po.program}`);
        doc.moveDown(0.5);
        hRule(doc, doc.y);
        doc.moveDown(0.5);
      }

      // ---- Notes ---------------------------------------------------------
      if (po.notes) {
        doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('NOTES / SPECIAL INSTRUCTIONS');
        doc.font(FONT_REG).fontSize(9).fillColor('#212121').text(po.notes, { width: COL_W });
        doc.moveDown(0.5);
        hRule(doc, doc.y);
        doc.moveDown(0.5);
      }

      // ---- Signature Lines -----------------------------------------------
      doc.moveDown(1);
      const sigY = doc.y;
      const sigLineW = 160;

      doc.font(FONT_REG).fontSize(9).fillColor('#212121');

      // Requestor signature
      doc.moveTo(MARGIN, sigY + 20).lineTo(MARGIN + sigLineW, sigY + 20).strokeColor('#212121').lineWidth(0.5).stroke();
      doc.text('Requested By', MARGIN, sigY + 24, { width: sigLineW });

      // Supervisor signature
      const mid = MARGIN + COL_W / 2 - sigLineW / 2;
      doc.moveTo(mid, sigY + 20).lineTo(mid + sigLineW, sigY + 20).strokeColor('#212121').lineWidth(0.5).stroke();
      doc.text('Supervisor Approval', mid, sigY + 24, { width: sigLineW });

      // Director signature
      const right = PAGE_W - MARGIN - sigLineW;
      doc.moveTo(right, sigY + 20).lineTo(right + sigLineW, sigY + 20).strokeColor('#212121').lineWidth(0.5).stroke();
      doc.text('Director Approval', right, sigY + 24, { width: sigLineW });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
```

---

## 8. Controller

**File:** `c:\Tech-V2\backend\src\controllers\purchaseOrder.controller.ts`

```typescript
/**
 * Purchase Order Controller
 *
 * HTTP handlers for the PO requisition workflow.
 * Follows the FundingSourceController pattern exactly:
 *   - Singleton service instance
 *   - try/catch with handleControllerError
 *   - Validates input via Zod schemas (schema already checked by validateRequest middleware)
 *   - Reads req.user.id for the authenticated user
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PurchaseOrderService } from '../services/purchaseOrder.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  PurchaseOrderQuerySchema,
  CreatePurchaseOrderSchema,
  UpdatePurchaseOrderSchema,
  ApproveSchema,
  RejectSchema,
  AssignAccountSchema,
  IssuePOSchema,
} from '../validators/purchaseOrder.validators';
import {
  sendRequisitionSubmitted,
  sendRequisitionApproved,
  sendRequisitionRejected,
  sendPOIssued,
} from '../services/email.service';

// ---------------------------------------------------------------------------
// Singleton service instance
// ---------------------------------------------------------------------------

const service = new PurchaseOrderService(prisma);

// ---------------------------------------------------------------------------
// Internal helper: get the user's effective REQUISITIONS permission level
// Returns 5 for ADMIN; otherwise the highest REQUISITIONS level granted.
// ---------------------------------------------------------------------------

async function getRequisitionsPermLevel(userId: string, userRole: string): Promise<number> {
  if (userRole === 'ADMIN') return 5;

  const up = await prisma.userPermission.findFirst({
    where: {
      userId,
      permission: { module: 'REQUISITIONS' },
    },
    include: { permission: true },
    orderBy: { permission: { level: 'desc' } },
  });

  return up?.permission.level ?? 1;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders
 */
export const getPurchaseOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query   = PurchaseOrderQuerySchema.parse(req.query);
    const userId  = req.user!.id;
    const role    = req.user!.roles?.[0] ?? 'VIEWER';
    const permLvl = await getRequisitionsPermLevel(userId, role);

    const result = await service.getPurchaseOrders(query, userId, permLvl);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders
 */
export const createPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreatePurchaseOrderSchema.parse(req.body);
    const po   = await service.createPurchaseOrder(data, req.user!.id);
    res.status(201).json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/purchase-orders/:id
 */
export const getPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId  = req.user!.id;
    const role    = req.user!.roles?.[0] ?? 'VIEWER';
    const permLvl = await getRequisitionsPermLevel(userId, role);

    const po = await service.getPurchaseOrderById(req.params.id as string, userId, permLvl);
    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * PUT /api/purchase-orders/:id
 */
export const updatePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data    = UpdatePurchaseOrderSchema.parse(req.body);
    const userId  = req.user!.id;
    const role    = req.user!.roles?.[0] ?? 'VIEWER';
    const permLvl = await getRequisitionsPermLevel(userId, role);

    const po = await service.updatePurchaseOrder(req.params.id as string, data, userId, permLvl);
    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * DELETE /api/purchase-orders/:id
 */
export const deletePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId  = req.user!.id;
    const role    = req.user!.roles?.[0] ?? 'VIEWER';
    const permLvl = await getRequisitionsPermLevel(userId, role);

    await service.deletePurchaseOrder(req.params.id as string, userId, permLvl);
    res.json({ message: 'Purchase order deleted' });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders/:id/submit
 */
export const submitPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const po = await service.submitPurchaseOrder(req.params.id as string, req.user!.id);

    // Fire-and-forget email to supervisor (if known)
    // For now, send to requestor's email as acknowledgement. Wire to supervisor lookup in future.
    if (po.User?.email) {
      sendRequisitionSubmitted(po as any, po.User.email).catch(() => {});
    }

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders/:id/approve
 */
export const approvePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data    = ApproveSchema.parse(req.body);
    const userId  = req.user!.id;
    const role    = req.user!.roles?.[0] ?? 'VIEWER';
    const permLvl = await getRequisitionsPermLevel(userId, role);

    const po = await service.approvePurchaseOrder(req.params.id as string, userId, permLvl, data);

    const stageLabels: Record<number, string> = {
      3: 'Supervisor Approved',
      4: 'Purchasing Approved',
      5: 'Director of Services Approved',
    };

    if (po.User?.email) {
      sendRequisitionApproved(
        po as any,
        po.User.email,
        stageLabels[permLvl] ?? 'Approved',
      ).catch(() => {});
    }

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders/:id/reject
 */
export const rejectPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = RejectSchema.parse(req.body);
    const po   = await service.rejectPurchaseOrder(req.params.id as string, req.user!.id, data);

    if (po.User?.email) {
      sendRequisitionRejected(po as any, po.User.email, data.reason).catch(() => {});
    }

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders/:id/account
 */
export const assignAccountCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = AssignAccountSchema.parse(req.body);
    const po   = await service.assignAccountCode(req.params.id as string, data, req.user!.id);
    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/purchase-orders/:id/issue
 */
export const issuePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = IssuePOSchema.parse(req.body);
    const po   = await service.issuePurchaseOrder(req.params.id as string, data, req.user!.id);

    if (po.User?.email) {
      sendPOIssued(po as any, po.User.email).catch(() => {});
    }

    res.json(po);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/purchase-orders/:id/pdf
 * Streams PDF as application/pdf download.
 */
export const getPurchaseOrderPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id     = req.params.id as string;
    const buffer = await service.generatePOPdf(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${id}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/purchase-orders/:id/history
 */
export const getPurchaseOrderHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await service.getPurchaseOrderHistory(req.params.id as string);
    res.json(history);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

## 9. Routes

**File:** `c:\Tech-V2\backend\src\routes\purchaseOrder.routes.ts`

```typescript
/**
 * Purchase Order Routes
 *
 * All routes require authentication via `authenticate`.
 * CSRF protection applied to all state-changing routes via router.use(validateCsrfToken).
 * Permission levels use the REQUISITIONS module:
 *   Level 1 — View  (any authenticated user with REQUISITIONS.1 grant)
 *   Level 2 — Create / Edit own POs
 *   Level 3 — Supervisor approval
 *   Level 4 — Purchasing: assign account code
 *   Level 5 — DOS: issue PO
 *
 * NOTE: ADMIN role bypasses all checkPermission checks (handled inside checkPermission).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { checkPermission } from '../middleware/permissions';
import {
  PurchaseOrderIdParamSchema,
  PurchaseOrderQuerySchema,
  CreatePurchaseOrderSchema,
  UpdatePurchaseOrderSchema,
  ApproveSchema,
  RejectSchema,
  AssignAccountSchema,
  IssuePOSchema,
} from '../validators/purchaseOrder.validators';
import * as purchaseOrderController from '../controllers/purchaseOrder.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CSRF protection for all state-changing routes
router.use(validateCsrfToken);

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders
 * List purchase orders (own only for level 1; all for level 2+)
 */
router.get(
  '/',
  validateRequest(PurchaseOrderQuerySchema, 'query'),
  checkPermission('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrders,
);

/**
 * POST /api/purchase-orders
 * Create a new draft purchase order
 */
router.post(
  '/',
  validateRequest(CreatePurchaseOrderSchema, 'body'),
  checkPermission('REQUISITIONS', 2),
  purchaseOrderController.createPurchaseOrder,
);

// ---------------------------------------------------------------------------
// Single-resource routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id
 * Get PO detail (own only for level 1; any for level 2+)
 */
router.get(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrder,
);

/**
 * PUT /api/purchase-orders/:id
 * Update a draft PO
 */
router.put(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(UpdatePurchaseOrderSchema, 'body'),
  checkPermission('REQUISITIONS', 2),
  purchaseOrderController.updatePurchaseOrder,
);

/**
 * DELETE /api/purchase-orders/:id
 * Delete a draft PO
 */
router.delete(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 2),
  purchaseOrderController.deletePurchaseOrder,
);

// ---------------------------------------------------------------------------
// Workflow action routes
// ---------------------------------------------------------------------------

/**
 * POST /api/purchase-orders/:id/submit
 * Submit a draft for supervisor approval
 */
router.post(
  '/:id/submit',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 2),
  purchaseOrderController.submitPurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/approve
 * Approve at the current workflow stage.
 * Level 3 = supervisor, level 4 = purchasing, level 5 = DOS.
 * Route requires level 3 minimum; service differentiates behavior by exact level.
 */
router.post(
  '/:id/approve',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(ApproveSchema, 'body'),
  checkPermission('REQUISITIONS', 3),
  purchaseOrderController.approvePurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/reject
 * Reject / deny at any workflow stage.
 */
router.post(
  '/:id/reject',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(RejectSchema, 'body'),
  checkPermission('REQUISITIONS', 3),
  purchaseOrderController.rejectPurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/account
 * Assign account code (purchasing staff; requires purchasing_approved status).
 */
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  checkPermission('REQUISITIONS', 4),
  purchaseOrderController.assignAccountCode,
);

/**
 * POST /api/purchase-orders/:id/issue
 * Issue PO number (DOS only; requires dos_approved + account code set).
 */
router.post(
  '/:id/issue',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(IssuePOSchema, 'body'),
  checkPermission('REQUISITIONS', 5),
  purchaseOrderController.issuePurchaseOrder,
);

// ---------------------------------------------------------------------------
// Export routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id/pdf
 * Download PO as PDF
 */
router.get(
  '/:id/pdf',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrderPdf,
);

/**
 * GET /api/purchase-orders/:id/history
 * View status change history
 */
router.get(
  '/:id/history',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrderHistory,
);

export default router;
```

---

## 10. server.ts Mount Line

In `c:\Tech-V2\backend\src\server.ts`, add the following:

### Import (with the other route imports, after line `import referenceDataRoutes from './routes/referenceData.routes';`):

```typescript
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
```

### Mount (after `app.use('/api', referenceDataRoutes);`):

```typescript
app.use('/api/purchase-orders', purchaseOrderRoutes);
```

### Full diff context showing exact placement:

```typescript
// EXISTING:
import fundingSourceRoutes from './routes/fundingSource.routes';
import referenceDataRoutes from './routes/referenceData.routes';
// ADD THIS LINE:
import purchaseOrderRoutes from './routes/purchaseOrder.routes';

// ...

// EXISTING:
app.use('/api/funding-sources', fundingSourceRoutes);
app.use('/api', referenceDataRoutes);
// ADD THIS LINE:
app.use('/api/purchase-orders', purchaseOrderRoutes);
```

---

## 11. REQUISITIONS Permission Levels

### Level Mapping

| Level | Role Name | Workflow Capability | Legacy Equivalent |
|-------|-----------|--------------------|--------------------|
| `1`   | Viewer / Staff | View own POs; view history; download PDF | reqLevel 8+ (read-only) |
| `2`   | Requestor | All level-1 actions + create, edit, submit, delete own draft POs | reqLevel 8+ (can submit) |
| `3`   | Supervisor | All level-2 actions + approve/reject at `submitted` → `supervisor_approved` | reqLevel 7 or 4 |
| `4`   | Purchasing Staff | All level-3 actions + approve at `supervisor_approved` → `purchasing_approved` + assign account code | reqLevel 2 |
| `5`   | Director of Services (DOS) | All level-4 actions + approve at `purchasing_approved` → `dos_approved` + issue PO number | reqLevel 1 |

### Workflow State Machine

```
[draft]
   │  POST /:id/submit (level 2, own PO only)
   ▼
[submitted]
   │  POST /:id/approve (level 3 — supervisor)
   ▼
[supervisor_approved]
   │  POST /:id/approve (level 4 — purchasing)
   ▼
[purchasing_approved]
   │  POST /:id/account (level 4 — assign account code)   ← can happen before or during approval
   │  POST /:id/approve (level 5 — DOS)
   ▼
[dos_approved]
   │  POST /:id/issue  (level 5 — issue PO number; requires accountCode set)
   ▼
[po_issued]  ← terminal success state


Any active state (submitted, supervisor_approved, purchasing_approved, dos_approved):
   │  POST /:id/reject (level 3+)
   ▼
[denied]     ← terminal failure state
```

### Notes on `checkPermission` behavior

- `checkPermission('REQUISITIONS', 3)` on the `/approve` route allows **levels 3, 4, AND 5** to reach that route (the middleware checks `level >= requiredLevel`). The service's `APPROVAL_TRANSITIONS` map then routes the correct transition based on the user's exact level.
- A level-4 or level-5 user calling `/approve` on a `submitted` PO will be handled by the service's transition logic for level 3, **not** their own level, because `APPROVAL_TRANSITIONS[4].from = 'supervisor_approved'`. If the PO is in `submitted` status, the service will throw a `ValidationError`. Each approver must approve only their own stage in sequence.

---

## 12. Migration Command

After editing `schema.prisma` as specified in §3, run from `c:\Tech-V2\backend\`:

```bash
npx prisma migrate dev --name add_purchase_order_workflow_fields
```

Then regenerate the Prisma client:

```bash
npx prisma generate
```

Then seed the REQUISITIONS permissions (§2c SQL or updated seed script).

---

## Implementation Checklist

```
Backend:
[ ] npm install nodemailer pdfkit && npm install -D @types/nodemailer @types/pdfkit
[ ] Update permissions.ts: add REQUISITIONS to PermissionModule, expand PermissionLevel to 1|2|3|4|5
[ ] Edit schema.prisma per §3 (modify purchase_orders, po_items, add RequisitionStatusHistory, add back-refs)
[ ] Run prisma migrate dev --name add_purchase_order_workflow_fields
[ ] Run prisma generate
[ ] Seed REQUISITIONS permissions (5 rows) into permissions table
[ ] Create backend/src/validators/purchaseOrder.validators.ts
[ ] Create backend/src/services/purchaseOrder.service.ts
[ ] Create backend/src/services/email.service.ts
[ ] Create backend/src/services/pdf.service.ts
[ ] Create backend/src/controllers/purchaseOrder.controller.ts
[ ] Create backend/src/routes/purchaseOrder.routes.ts
[ ] Edit server.ts: add import + app.use('/api/purchase-orders', purchaseOrderRoutes)
[ ] Add SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM to .env
```

---

*Specification complete. All TypeScript code matches the exact patterns in the codebase (FundingSource service/controller/route/validator pattern). No pseudo-code — every file section is copy-pasteable.*

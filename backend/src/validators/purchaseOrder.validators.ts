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
  'finance_director_approved',
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
    .number({ error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than zero'),
  unitPrice: z
    .number({ error: 'Unit price must be a number' })
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
  fiscalYear: z.string().max(20, 'Fiscal year filter too long').optional(),
  onlyMine: z.preprocess(
    (val) => val === 'true' || val === '1',
    z.boolean().optional(),
  ),
  pendingMyApproval: z.preprocess(
    (val) => val === 'true' || val === '1',
    z.boolean().optional(),
  ),
  workflowType: z.enum(['standard', 'food_service']).optional(),
});

// ---------------------------------------------------------------------------
// POST /purchase-orders — create
// ---------------------------------------------------------------------------

export const CreatePurchaseOrderSchema = z.object({
  title: z
    .string()
    .max(200, 'Title must be 200 characters or less')
    .optional()
    .default('Purchase Order'),
  type: z.string().min(1).max(100).optional().default('general'),
  vendorId: z.string().uuid('Invalid vendor ID format'),
  shipTo: z.string().max(500, 'Ship-to address must be 500 characters or less').optional().nullable(),
  shipToType: z.enum(['entity', 'my_office', 'custom']).optional().nullable(),
  shippingCost: z
    .number({ error: 'Shipping cost must be a number' })
    .min(0, 'Shipping cost cannot be negative')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  program: z.string().max(200, 'Program must be 200 characters or less').optional().nullable(),
  officeLocationId: z.string().uuid('Invalid location ID').optional().nullable(),
  entityType: z
    .enum(['SCHOOL', 'DEPARTMENT', 'PROGRAM'])
    .optional()
    .nullable(),
  items: z
    .array(PoItemSchema)
    .min(1, 'At least one line item is required')
    .max(100, 'Cannot exceed 100 line items'),
  workflowType: z.enum(['standard', 'food_service']).optional().default('standard'),
});

// ---------------------------------------------------------------------------
// PUT /purchase-orders/:id — update (all fields optional)
// workflowType is omitted — it is immutable after creation.
// ---------------------------------------------------------------------------

export const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial().omit({ workflowType: true });

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/approve — approve at current stage
// ---------------------------------------------------------------------------

export const ApproveSchema = z.object({
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional().nullable(),
  accountCode: z
    .string()
    .min(1, 'Account code must not be empty if provided')
    .max(100, 'Account code must be 100 characters or less')
    .optional()
    .nullable(),
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
    .min(1, 'PO number must not be empty if provided')
    .max(100, 'PO number must be 100 characters or less')
    .optional(),
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

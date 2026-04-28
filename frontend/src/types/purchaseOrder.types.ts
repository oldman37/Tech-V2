/**
 * TypeScript interfaces for the Purchase Order / Requisitions system.
 *
 * These mirror the Prisma model response shapes from the backend.
 * All `Decimal` DB fields arrive as strings over JSON; use Number() when displaying.
 */

// ---------------------------------------------------------------------------
// Enum / Constant types
// ---------------------------------------------------------------------------

export const PO_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
  'po_issued',
  'denied',
] as const;

export type POStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft:                       'Draft',
  submitted:                   'Submitted',
  supervisor_approved:         'Supervisor Approved',
  finance_director_approved:   'Finance Director Approved',
  dos_approved:                'Director of Schools Approved',
  po_issued:                   'PO Issued',
  denied:                      'Denied',
};

/**
 * Maps each status to an MUI Chip `color` prop.
 * Chips with 'default' render grey; 'info' = blue; 'warning' = orange;
 * 'success' = green; 'error' = red.
 */
export const PO_STATUS_CHIP_COLOR: Record<POStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  draft:                       'default',
  submitted:                   'info',
  supervisor_approved:         'warning',
  finance_director_approved:   'warning',
  dos_approved:                'warning',
  po_issued:                   'success',
  denied:                      'error',
};

export type ShipToType = 'entity' | 'my_office' | 'custom';

export type WorkflowType = 'standard' | 'food_service';

// ---------------------------------------------------------------------------
// Nested entity shapes (as returned by backend includes)
// ---------------------------------------------------------------------------

export interface PORequestor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: string | null;
  jobTitle?: string | null;
}

export interface POVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  fax?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
}

export interface POOfficeLocation {
  id: string;
  name: string;
  code?: string | null;
  type?: string | null;
  /** Primary supervisor for this location — included in detail view to gate the supervisor-stage approve button. */
  supervisors?: Array<{
    userId: string;
    supervisorType: string;
    user?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null;
  }> | null;
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  description: string;
  lineNumber?: number | null;
  model?: string | null;
  quantity: number;
  unitPrice: string;   // Decimal serialized as string
  totalPrice: string;  // Decimal serialized as string
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Status history
// ---------------------------------------------------------------------------

export interface PurchaseOrderStatusHistory {
  id: string;
  purchaseOrderId: string;
  fromStatus: string;
  toStatus: string;
  changedById: string;
  changedAt: string;
  notes?: string | null;
  changedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

// ---------------------------------------------------------------------------
// PurchaseOrder — summary shape (list endpoint)
// ---------------------------------------------------------------------------

export interface PurchaseOrderSummary {
  id: string;
  poNumber?: string | null;
  reqNumber?: string | null;
  type: string;
  description: string;   // The PO title (backend maps title → description)
  status: POStatus;
  amount: string;         // Decimal as string
  shippingCost?: string | null;
  shipTo?: string | null;
  shipToType?: ShipToType | null;
  program?: string | null;
  accountCode?: string | null;
  requestorId: string;
  vendorId?: string | null;
  officeLocationId?: string | null;
  entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | 'DISTRICT_OFFICE' | null;
  workflowType?: WorkflowType;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  submittedDate?: string | null;
  // Nested includes (from list endpoint)
  User: PORequestor;
  vendors?: Pick<POVendor, 'id' | 'name'> | null;
  officeLocation?: POOfficeLocation | null;
  _count?: { po_items: number };
}

// ---------------------------------------------------------------------------
// PurchaseOrder — full detail shape (single-item endpoint)
// ---------------------------------------------------------------------------

export interface PurchaseOrder extends PurchaseOrderSummary {
  notes?: string | null;
  denialReason?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  issuedAt?: string | null;
  approvedBy?: string | null;
  approvedDate?: string | null;
  po_items: PurchaseOrderItem[];
  statusHistory: PurchaseOrderStatusHistory[];
  vendors: POVendor | null;    // Full vendor in detail view
}

// ---------------------------------------------------------------------------
// List response
// ---------------------------------------------------------------------------

export interface PurchaseOrderListResponse {
  items: PurchaseOrderSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Stats (dashboard widget)
// ---------------------------------------------------------------------------

export interface PurchaseOrderStats {
  counts: Record<POStatus, number>;
  totalAmount: number;
  pendingApproval: number;  // submitted + supervisor_approved + finance_director_approved + dos_approved
}

// ---------------------------------------------------------------------------
// Request payloads (sent to backend)
// ---------------------------------------------------------------------------

export interface PurchaseOrderItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  lineNumber?: number;
  model?: string | null;
}

export interface CreatePurchaseOrderInput {
  title: string;
  type?: string;
  vendorId?: string | null;
  shipTo?: string | null;
  shipToType?: 'entity' | 'my_office' | 'custom' | null;
  shippingCost?: number | null;
  notes?: string | null;
  program?: string | null;
  officeLocationId?: string | null;
  entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | 'DISTRICT_OFFICE' | null;
  workflowType?: WorkflowType;
  items: PurchaseOrderItemInput[];
}

export type UpdatePurchaseOrderInput = Partial<CreatePurchaseOrderInput>;

export interface ApprovePOInput {
  notes?: string | null;
  accountCode?: string | null;   // Finance Director can optionally set this during their approval
}

export interface RejectPOInput {
  reason: string;
}

export interface AssignAccountCodeInput {
  accountCode: string;
}

export interface IssuePOInput {
  poNumber: string;
}

// ---------------------------------------------------------------------------
// Filter / query params
// ---------------------------------------------------------------------------

export interface PurchaseOrderFilters {
  status?: POStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
  fiscalYear?: string;
  workflowType?: WorkflowType;
  page?: number;
  limit?: number;
  onlyMine?: boolean;
  pendingMyApproval?: boolean;
}

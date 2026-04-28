# Sprint C-2 Frontend Implementation Spec: Purchase Orders

**Date:** 2026-03-10  
**Author:** Specification Subagent  
**Status:** Ready for Implementation  
**Source:** Based on `sprint_c2_codebase_analysis.md`, `sprint_c2_backend_spec.md`, and live codebase pattern extraction from 8 source files.

---

## Table of Contents

1. [Types — `purchaseOrder.types.ts`](#1-types)
2. [queryKeys additions — `lib/queryKeys.ts`](#2-querykeys-additions)
3. [Service — `purchaseOrder.service.ts`](#3-service)
4. [Query Hooks — `usePurchaseOrders.ts`](#4-query-hooks)
5. [Mutation Hooks — `usePurchaseOrderMutations.ts`](#5-mutation-hooks)
6. [Permission Helper — `useRequisitionsPermLevel`](#6-permission-helper)
7. [Page: PurchaseOrderList](#7-page-purchaseorderlist)
8. [Page: RequisitionWizard](#8-page-requisitionwizard)
9. [Page: PurchaseOrderDetail](#9-page-purchaseorderdetail)
10. [Barrel Exports — `index.ts`](#10-barrel-exports)
11. [App.tsx Changes](#11-apptsx-changes)
12. [AppLayout.tsx Changes](#12-applayouttsx-changes)

---

## 1. Types

**File:** `frontend/src/types/purchaseOrder.types.ts`

```typescript
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
  'purchasing_approved',
  'dos_approved',
  'po_issued',
  'denied',
] as const;

export type POStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft:                'Draft',
  submitted:            'Submitted',
  supervisor_approved:  'Supervisor Approved',
  purchasing_approved:  'Purchasing Approved',
  dos_approved:         'DOS Approved',
  po_issued:            'PO Issued',
  denied:               'Denied',
};

/**
 * Maps each status to an MUI Chip `color` prop.
 * Chips with 'default' render grey; 'info' = blue; 'warning' = orange;
 * 'success' = green; 'error' = red.
 */
export const PO_STATUS_CHIP_COLOR: Record<POStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  draft:                'default',
  submitted:            'info',
  supervisor_approved:  'warning',
  purchasing_approved:  'warning',
  dos_approved:         'success',
  po_issued:            'success',
  denied:               'error',
};

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
  type: string;
  description: string;   // The PO title (backend maps title → description)
  status: POStatus;
  amount: string;         // Decimal as string
  shippingCost?: string | null;
  shipTo?: string | null;
  program?: string | null;
  accountCode?: string | null;
  requestorId: string;
  vendorId?: string | null;
  officeLocationId?: string | null;
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
  pendingApproval: number;  // submitted + supervisor_approved + purchasing_approved + dos_approved
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
  shippingCost?: number | null;
  notes?: string | null;
  program?: string | null;
  officeLocationId?: string | null;
  items: PurchaseOrderItemInput[];
}

export type UpdatePurchaseOrderInput = Partial<CreatePurchaseOrderInput>;

export interface ApprovePOInput {
  notes?: string | null;
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
  page?: number;
  limit?: number;
}
```

---

## 2. queryKeys Additions

**File:** `frontend/src/lib/queryKeys.ts`

Add the following block inside the exported `queryKeys` object, after the `referenceData` block:

```typescript
  // Purchase Order queries
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    lists: () => [...queryKeys.purchaseOrders.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.purchaseOrders.lists(), params] as const,
    stats: () => [...queryKeys.purchaseOrders.all, 'stats'] as const,
    details: () => [...queryKeys.purchaseOrders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.purchaseOrders.details(), id] as const,
    history: (id: string) => [...queryKeys.purchaseOrders.all, 'history', id] as const,
  },
```

**Full diff context** (show the surrounding lines for the implementor):

```typescript
  referenceData: {
    brands: ['referenceData', 'brands'] as const,
    vendors: ['referenceData', 'vendors'] as const,
    categories: ['referenceData', 'categories'] as const,
    models: ['referenceData', 'models'] as const,
  },

  // ← ADD BELOW HERE
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    lists: () => [...queryKeys.purchaseOrders.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.purchaseOrders.lists(), params] as const,
    stats: () => [...queryKeys.purchaseOrders.all, 'stats'] as const,
    details: () => [...queryKeys.purchaseOrders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.purchaseOrders.details(), id] as const,
    history: (id: string) => [...queryKeys.purchaseOrders.all, 'history', id] as const,
  },
} as const;
```

---

## 3. Service

**File:** `frontend/src/services/purchaseOrder.service.ts`

Follows the `fundingSourceService.ts` object-literal pattern exactly. Uses the shared `api` axios instance (cookie auth + CSRF auto-injection).

```typescript
/**
 * Purchase Order Service
 *
 * Handles all API calls for the PO/Requisitions workflow.
 * Follows the fundingSourceService object-literal pattern.
 *
 * Base path: /api/purchase-orders
 * Authentication: HttpOnly JWT cookie (handled by api.ts interceptors)
 * CSRF: Injected automatically for POST/PUT/PATCH/DELETE by api.ts
 */

import { api } from './api';
import type {
  PurchaseOrder,
  PurchaseOrderSummary,
  PurchaseOrderListResponse,
  PurchaseOrderStats,
  PurchaseOrderStatusHistory,
  PurchaseOrderFilters,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ApprovePOInput,
  RejectPOInput,
  AssignAccountCodeInput,
  IssuePOInput,
} from '../types/purchaseOrder.types';

const BASE = '/purchase-orders';

const purchaseOrderService = {
  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  /**
   * GET /api/purchase-orders
   * Returns paginated list. Level-1 users receive only their own POs (backend enforces).
   */
  getAll: async (filters: PurchaseOrderFilters = {}): Promise<PurchaseOrderListResponse> => {
    const q = new URLSearchParams();
    if (filters.page !== undefined)       q.append('page',       String(filters.page));
    if (filters.limit !== undefined)      q.append('limit',      String(filters.limit));
    if (filters.status)                   q.append('status',     filters.status);
    if (filters.search)                   q.append('search',     filters.search);
    if (filters.dateFrom)                 q.append('dateFrom',   filters.dateFrom);
    if (filters.dateTo)                   q.append('dateTo',     filters.dateTo);
    if (filters.locationId)               q.append('locationId', filters.locationId);

    const qs = q.toString();
    const res = await api.get<PurchaseOrderListResponse>(
      `${BASE}${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Single PO Detail
  // -------------------------------------------------------------------------

  /**
   * GET /api/purchase-orders/:id
   * Full detail with po_items, statusHistory, vendor, requestor.
   */
  getById: async (id: string): Promise<PurchaseOrder> => {
    const res = await api.get<PurchaseOrder>(`${BASE}/${id}`);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * POST /api/purchase-orders
   * Creates a new PO in 'draft' status. Requires REQUISITIONS level 2.
   */
  create: async (data: CreatePurchaseOrderInput): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(BASE, data);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * PUT /api/purchase-orders/:id
   * Updates a draft PO. Only allowed while status = 'draft'.
   */
  update: async (id: string, data: UpdatePurchaseOrderInput): Promise<PurchaseOrder> => {
    const res = await api.put<PurchaseOrder>(`${BASE}/${id}`, data);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /**
   * DELETE /api/purchase-orders/:id
   * Hard-deletes a draft PO (cascade deletes po_items). Only allowed while status = 'draft'.
   */
  delete: async (id: string): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`${BASE}/${id}`);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Workflow actions
  // -------------------------------------------------------------------------

  /**
   * POST /api/purchase-orders/:id/submit
   * Transitions draft → submitted. Only requestor may call this.
   */
  submit: async (id: string): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(`${BASE}/${id}/submit`, {});
    return res.data;
  },

  /**
   * POST /api/purchase-orders/:id/approve
   * Approves at the caller's permission level:
   *   level 3 → submitted → supervisor_approved
   *   level 4 → supervisor_approved → purchasing_approved
   *   level 5 → purchasing_approved → dos_approved
   */
  approve: async (id: string, data: ApprovePOInput = {}): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(`${BASE}/${id}/approve`, data);
    return res.data;
  },

  /**
   * POST /api/purchase-orders/:id/reject
   * Denies the PO at any active stage. Requires REQUISITIONS level 3+.
   */
  reject: async (id: string, data: RejectPOInput): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(`${BASE}/${id}/reject`, data);
    return res.data;
  },

  /**
   * POST /api/purchase-orders/:id/account
   * Assigns account code. Requires level 4 + status = purchasing_approved.
   */
  assignAccountCode: async (id: string, data: AssignAccountCodeInput): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(`${BASE}/${id}/account`, data);
    return res.data;
  },

  /**
   * POST /api/purchase-orders/:id/issue
   * Issues PO number. Requires level 5 + status = dos_approved + accountCode set.
   */
  issue: async (id: string, data: IssuePOInput): Promise<PurchaseOrder> => {
    const res = await api.post<PurchaseOrder>(`${BASE}/${id}/issue`, data);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // History & PDF
  // -------------------------------------------------------------------------

  /**
   * GET /api/purchase-orders/:id/history
   * Returns full status change log for this PO.
   */
  getHistory: async (id: string): Promise<PurchaseOrderStatusHistory[]> => {
    const res = await api.get<PurchaseOrderStatusHistory[]>(`${BASE}/${id}/history`);
    return res.data;
  },

  /**
   * GET /api/purchase-orders/:id/pdf
   * Streams a PDF blob. Use responseType blob and create an object URL to download.
   */
  downloadPdf: async (id: string): Promise<void> => {
    const res = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PO-${id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // -------------------------------------------------------------------------
  // Stats (dashboard widget)
  // -------------------------------------------------------------------------

  /**
   * Derived from one getAll call with no filters at high limit.
   * The backend does not expose a /stats endpoint for POs yet (add if needed).
   *
   * NOTE: If the backend adds GET /api/purchase-orders/stats, replace this
   * implementation with a direct API call.
   */
  getStats: async (): Promise<PurchaseOrderStats> => {
    // Fetch all POs (large limit) to compute counts client-side.
    // This is acceptable at low PO volumes. For high-volume, add a dedicated
    // backend stats endpoint.
    const res = await purchaseOrderService.getAll({ limit: 1000 });
    const counts = {
      draft: 0, submitted: 0, supervisor_approved: 0,
      purchasing_approved: 0, dos_approved: 0, po_issued: 0, denied: 0,
    } as Record<string, number>;
    let totalAmount = 0;

    for (const po of res.items) {
      counts[po.status] = (counts[po.status] ?? 0) + 1;
      totalAmount += Number(po.amount);
    }

    const pendingApproval =
      counts['submitted'] +
      counts['supervisor_approved'] +
      counts['purchasing_approved'] +
      counts['dos_approved'];

    return {
      counts: counts as PurchaseOrderStats['counts'],
      totalAmount,
      pendingApproval,
    };
  },
};

export default purchaseOrderService;
```

---

## 4. Query Hooks

**File:** `frontend/src/hooks/queries/usePurchaseOrders.ts`

Follows the `useInventory.ts` pattern exactly.

```typescript
/**
 * TanStack Query v5 hooks for the Purchase Order / Requisitions system.
 *
 * Patterns:
 * - placeholderData: keepPreviousData  →  no flash-of-empty between page changes
 * - staleTime on stats               →  avoid redundant refetches on the same page
 * - enabled: !!id                    →  skip queries for undefined IDs
 */

import { useQuery, UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import purchaseOrderService from '@/services/purchaseOrder.service';
import { queryKeys } from '@/lib/queryKeys';
import type {
  PurchaseOrder,
  PurchaseOrderListResponse,
  PurchaseOrderStats,
  PurchaseOrderStatusHistory,
  PurchaseOrderFilters,
} from '@/types/purchaseOrder.types';

// ---------------------------------------------------------------------------
// usePurchaseOrderList
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated, filtered list of purchase orders.
 * Uses placeholderData so the previous page's rows stay visible
 * while the next page loads.
 */
export function usePurchaseOrderList(
  filters: PurchaseOrderFilters = {},
  options?: Omit<UseQueryOptions<PurchaseOrderListResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(filters as Record<string, unknown>),
    queryFn: () => purchaseOrderService.getAll(filters),
    placeholderData: keepPreviousData,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrder (single detail)
// ---------------------------------------------------------------------------

/**
 * Fetches a single PO with full detail (items, history, vendor, requestor).
 * Skips the query entirely when id is falsy.
 */
export function usePurchaseOrder(
  id: string | undefined,
  options?: Omit<UseQueryOptions<PurchaseOrder>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id ?? ''),
    queryFn: () => purchaseOrderService.getById(id!),
    enabled: !!id,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrderHistory
// ---------------------------------------------------------------------------

/**
 * Fetches the full status change log for a single PO.
 */
export function usePurchaseOrderHistory(
  id: string | undefined,
  options?: Omit<UseQueryOptions<PurchaseOrderStatusHistory[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.history(id ?? ''),
    queryFn: () => purchaseOrderService.getHistory(id!),
    enabled: !!id,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrderStats (dashboard widget)
// ---------------------------------------------------------------------------

/**
 * Fetches status counts for the dashboard widget.
 * staleTime: 5 minutes — stats don't need to be real-time.
 */
export function usePurchaseOrderStats(
  options?: Omit<UseQueryOptions<PurchaseOrderStats>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.stats(),
    queryFn: () => purchaseOrderService.getStats(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
```

---

## 5. Mutation Hooks

**File:** `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts`

Follows the `useInventoryMutations.ts` pattern exactly.

```typescript
/**
 * TanStack Query v5 mutation hooks for the Purchase Orders workflow.
 *
 * Cache invalidation strategy:
 *   - Any mutation that changes the list result: invalidate purchaseOrders.all
 *   - Mutations that only update one record's detail: also invalidate detail(id)
 *   - Workflow actions (approve/reject/etc.): invalidate both list and detail
 *   - Stats invalidated on list changes (because stats are derived from the list)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import purchaseOrderService from '@/services/purchaseOrder.service';
import { queryKeys } from '@/lib/queryKeys';
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ApprovePOInput,
  RejectPOInput,
  AssignAccountCodeInput,
  IssuePOInput,
} from '@/types/purchaseOrder.types';

// ---------------------------------------------------------------------------
// useCreatePurchaseOrder
// ---------------------------------------------------------------------------

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseOrderInput) =>
      purchaseOrderService.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },

    onError: (error: Error) => {
      console.error('Failed to create purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdatePurchaseOrder
// ---------------------------------------------------------------------------

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePurchaseOrderInput }) =>
      purchaseOrderService.update(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to update purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useDeletePurchaseOrder
// ---------------------------------------------------------------------------

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },

    onError: (error: Error) => {
      console.error('Failed to delete purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useSubmitPurchaseOrder
// ---------------------------------------------------------------------------

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.submit(id),

    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to submit purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useApprovePurchaseOrder
// ---------------------------------------------------------------------------

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: ApprovePOInput }) =>
      purchaseOrderService.approve(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to approve purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useRejectPurchaseOrder
// ---------------------------------------------------------------------------

export function useRejectPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RejectPOInput }) =>
      purchaseOrderService.reject(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to reject purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useAssignAccountCode
// ---------------------------------------------------------------------------

export function useAssignAccountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignAccountCodeInput }) =>
      purchaseOrderService.assignAccountCode(id, data),

    onSuccess: (_, { id }) => {
      // Account code assignment doesn't change the list status, only detail
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },

    onError: (error: Error) => {
      console.error('Failed to assign account code:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useIssuePurchaseOrder
// ---------------------------------------------------------------------------

export function useIssuePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IssuePOInput }) =>
      purchaseOrderService.issue(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to issue purchase order:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// useDownloadPOPdf
// ---------------------------------------------------------------------------

export function useDownloadPOPdf() {
  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.downloadPdf(id),

    onError: (error: Error) => {
      console.error('Failed to download PO PDF:', error);
    },
  });
}
```

---

## 6. Permission Helper

**File:** `frontend/src/hooks/queries/useRequisitionsPermLevel.ts`

### Why this hook is needed

The `useAuthStore` persists `user.roles` (e.g. `['ADMIN']`) but does **not** store granular permission levels. The backend enforces level via the `UserPermission` table. To show/hide action buttons conditionally, the frontend must either:

1. Call `GET /api/users/:id` which returns `permissions: UserPermission[]` (already exists in `userService.ts`)
2. Extend the auth store to include permissions (requires backend change to the `/auth/me` response)

**Recommended: Option 1** — fetch once per session via a query hook. This avoids modifying the auth store and reuses the existing `userService.getUserById` method.

```typescript
/**
 * useRequisitionsPermLevel
 *
 * Returns the current user's effective REQUISITIONS permission level (1–5).
 * ADMIN role always resolves to level 5 without a network call.
 * For all other users, fetches the user detail record (which includes permissions[]).
 *
 * Usage:
 *   const { permLevel, isLoading } = useRequisitionsPermLevel();
 *   if (permLevel >= 3) { /* show approve button *\/ }
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { userService } from '@/services/userService';
import { queryKeys } from '@/lib/queryKeys';

export interface RequisitionsPermResult {
  permLevel: number;       // 0 = unauthenticated, 1–5 = REQUISITIONS level
  isLoading: boolean;
  isAdmin: boolean;
}

export function useRequisitionsPermLevel(): RequisitionsPermResult {
  const { user } = useAuthStore();
  const isAdmin = !!(user?.roles?.includes('ADMIN'));

  // Skip network call for admins (they always have level 5)
  const { data: userDetail, isLoading } = useQuery({
    queryKey: queryKeys.users.detail(user?.id ?? ''),
    queryFn: () => userService.getUserById(user!.id),
    enabled: !!user?.id && !isAdmin,
    staleTime: 10 * 60 * 1000, // 10 minutes — permissions rarely change mid-session
  });

  if (!user) return { permLevel: 0, isLoading: false, isAdmin: false };
  if (isAdmin) return { permLevel: 5, isLoading: false, isAdmin: true };

  if (isLoading) return { permLevel: 0, isLoading: true, isAdmin: false };

  // Find the highest REQUISITIONS level this user has been granted
  const reqPerm = userDetail?.permissions
    ?.filter((p) => p.module === 'REQUISITIONS')
    ?.sort((a, b) => b.level - a.level)?.[0];

  const permLevel = reqPerm?.level ?? 0;
  return { permLevel, isLoading: false, isAdmin: false };
}
```

### Permission-to-action mapping (use in components)

```typescript
// Decision table for action button visibility in PurchaseOrderDetail:

// "Submit for Approval" button:
const canSubmit =
  po.status === 'draft' &&
  po.requestorId === user?.id &&
  permLevel >= 2;

// "Approve" button:
const APPROVE_REQUIRED_STATUS: Record<number, string> = {
  3: 'submitted',
  4: 'supervisor_approved',
  5: 'purchasing_approved',
};
const canApprove =
  permLevel >= 3 &&
  po.status === APPROVE_REQUIRED_STATUS[permLevel];

// "Reject" button:
const REJECTABLE = ['submitted', 'supervisor_approved', 'purchasing_approved', 'dos_approved'];
const canReject = permLevel >= 3 && REJECTABLE.includes(po.status);

// "Assign Account Code" button:
const canAssignAccount =
  permLevel >= 4 &&
  po.status === 'purchasing_approved';

// "Issue PO" button:
const canIssuePO =
  permLevel >= 5 &&
  po.status === 'dos_approved' &&
  !!po.accountCode;

// "Edit" button:
const canEdit =
  po.status === 'draft' &&
  (po.requestorId === user?.id || permLevel >= 2);

// "Download PDF": any authenticated user with level >= 1
const canDownloadPdf = permLevel >= 1;
```

---

## 7. Page: PurchaseOrderList

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

```typescript
/**
 * PurchaseOrderList
 *
 * Main list view for purchase orders/requisitions.
 * - Tabs filter by user context (All, My Requests, Pending Approval, Issued)
 * - Filter row with status select, date pickers, search
 * - MUI Table with status Chips and action buttons
 * - Pagination
 * - Shows "New Requisition" button only for level 2+
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography,
  Alert,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useAuthStore } from '@/store/authStore';
import { usePurchaseOrderList } from '@/hooks/queries/usePurchaseOrders';
import { useRequisitionsPermLevel } from '@/hooks/queries/useRequisitionsPermLevel';
import {
  PO_STATUSES,
  PO_STATUS_LABELS,
  PO_STATUS_CHIP_COLOR,
  type PurchaseOrderFilters,
  type POStatus,
} from '@/types/purchaseOrder.types';

// ─── Tab definitions ────────────────────────────────────────────────────────

type TabKey = 'all' | 'mine' | 'pending' | 'issued';

interface TabDef {
  key: TabKey;
  label: string;
  minPermLevel: number;
}

const TABS: TabDef[] = [
  { key: 'all',     label: 'All',                minPermLevel: 2 },
  { key: 'mine',    label: 'My Requests',         minPermLevel: 1 },
  { key: 'pending', label: 'Pending My Approval', minPermLevel: 3 },
  { key: 'issued',  label: 'Issued',              minPermLevel: 1 },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { permLevel } = useRequisitionsPermLevel();

  // Filter / pagination state
  const [tab, setTab] = useState<TabKey>('mine');
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Build API filters from tab + explicit filters
  const buildFilters = (): PurchaseOrderFilters => {
    const f: PurchaseOrderFilters = {
      page: page + 1,
      limit: rowsPerPage,
    };
    if (statusFilter) f.status = statusFilter;
    if (search.trim()) f.search = search.trim();
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    // Tab "pending" pre-sets status to submitted (backend will return
    // all statuses pending the caller's level approval — adjust if needed)
    // Tab "issued" filters to po_issued
    if (tab === 'issued' && !statusFilter) f.status = 'po_issued';
    return f;
  };

  const { data, isLoading, error } = usePurchaseOrderList(buildFilters());
  const rows = data?.items ?? [];
  const totalCount = data?.total ?? 0;

  // Visible tabs based on permission level
  const visibleTabs = TABS.filter((t) => permLevel >= t.minPermLevel);

  // Ensure selected tab is still visible after permission resolves
  const activeTab = visibleTabs.find((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key ?? 'mine';

  const handleTabChange = (_: React.SyntheticEvent, newTab: TabKey) => {
    setTab(newTab);
    setPage(0);
  };

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(e.target.value));
    setPage(0);
  };

  const formatCurrency = (val: string | number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Box sx={{ p: 3 }}>
      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Purchase Orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage requisitions and purchase orders
          </Typography>
        </Box>
        {permLevel >= 2 && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/purchase-orders/new')}
          >
            New Requisition
          </Button>
        )}
      </Box>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
        {visibleTabs.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      {/* ── Filters ── */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search PO#, title, program…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            }}
            sx={{ minWidth: 240 }}
          />
          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as POStatus | ''); setPage(0); }}
            displayEmpty
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {PO_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>{PO_STATUS_LABELS[s]}</MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            type="date"
            label="From"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          {(statusFilter || search || dateFrom || dateTo) && (
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setStatusFilter('');
                setSearch('');
                setDateFrom('');
                setDateTo('');
                setPage(0);
              }}
            >
              Clear Filters
            </Button>
          )}
        </Box>
      </Paper>

      {/* ── Error ── */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as any)?.response?.data?.message ?? 'Failed to load purchase orders'}
        </Alert>
      )}

      {/* ── Table ── */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PO #</TableCell>
              <TableCell>Title / Description</TableCell>
              <TableCell>Requested By</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              // Loading skeleton — 5 rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No purchase orders found.{' '}
                    {permLevel >= 2 && (
                      <Button size="small" onClick={() => navigate('/purchase-orders/new')}>
                        Create one
                      </Button>
                    )}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((po) => (
                <TableRow key={po.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {po.poNumber ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {po.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {po.User.firstName} {po.User.lastName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{po.vendors?.name ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={PO_STATUS_LABELS[po.status]}
                      color={PO_STATUS_CHIP_COLOR[po.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(po.createdAt)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatCurrency(po.amount)}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!isLoading && totalCount > 0 && (
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        )}
      </TableContainer>
    </Box>
  );
}
```

---

## 8. Page: RequisitionWizard

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

Multi-step form using MUI Stepper + controlled React state (no react-hook-form dependency needed; consistent with existing pages).

```typescript
/**
 * RequisitionWizard
 *
 * Multi-step form to create a new purchase order (saved as 'draft' initially).
 *
 * Steps:
 *   1. Details  — title, vendor, ship-to, notes, program, location
 *   2. Line Items — dynamic add/remove table of items with running total
 *   3. Review   — summary, total breakdown, Save as Draft or Submit buttons
 *
 * On success: navigates to /purchase-orders/:newId
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useCreatePurchaseOrder, useSubmitPurchaseOrder } from '@/hooks/mutations/usePurchaseOrderMutations';
import type { PurchaseOrderItemInput, CreatePurchaseOrderInput } from '@/types/purchaseOrder.types';
import { api } from '@/services/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VendorOption {
  id: string;
  name: string;
}

interface ItemRow extends PurchaseOrderItemInput {
  _key: number; // client-side unique key for React list
}

const STEPS = ['Details', 'Line Items', 'Review'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyItem(key: number): ItemRow {
  return { _key: key, description: '', quantity: 1, unitPrice: 0, model: '' };
}

function calcTotal(items: ItemRow[], shipping: number): number {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return subtotal + (shipping || 0);
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// ─── Component ──────────────────────────────────────────────────────────────

export default function RequisitionWizard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const createMutation = useCreatePurchaseOrder();
  const submitMutation = useSubmitPurchaseOrder();

  // Step state
  const [activeStep, setActiveStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 fields
  const [title, setTitle] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<VendorOption | null>(null);
  const [shipTo, setShipTo] = useState('');
  const [notes, setNotes] = useState('');
  const [program, setProgram] = useState('');
  const [shippingCost, setShippingCost] = useState<string>('');

  // Step 2 fields
  const [items, setItems] = useState<ItemRow[]>([emptyItem(0)]);
  const [nextKey, setNextKey] = useState(1);

  // Vendor autocomplete — uses existing reference data endpoint
  const { data: vendorData } = useQuery({
    queryKey: ['referenceData', 'vendors'],
    queryFn: async () => {
      const res = await api.get<{ vendors: VendorOption[] }>('/reference-data/vendors');
      return res.data.vendors ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
  const vendorOptions: VendorOption[] = vendorData ?? [];

  // ── Step 1 validation ──
  const step1Valid = title.trim().length > 0;

  // ── Step 2 validation ──
  const step2Valid =
    items.length > 0 &&
    items.every(
      (i) =>
        i.description.trim().length > 0 &&
        i.quantity > 0 &&
        i.unitPrice > 0
    );

  // ── Item mutations ──
  const addItem = () => {
    setItems((prev) => [...prev, emptyItem(nextKey)]);
    setNextKey((k) => k + 1);
  };

  const removeItem = (key: number) => {
    setItems((prev) => prev.filter((r) => r._key !== key));
  };

  const updateItem = (key: number, field: keyof Omit<ItemRow, '_key'>, value: string | number) => {
    setItems((prev) =>
      prev.map((r) =>
        r._key === key ? { ...r, [field]: value } : r
      )
    );
  };

  // ── Navigation ──
  const handleNext = () => setActiveStep((s) => s + 1);
  const handleBack = () => setActiveStep((s) => s - 1);

  // ── Build payload ──
  const buildPayload = (): CreatePurchaseOrderInput => ({
    title: title.trim(),
    vendorId: selectedVendor?.id ?? null,
    shipTo: shipTo.trim() || null,
    notes: notes.trim() || null,
    program: program.trim() || null,
    shippingCost: shippingCost ? Number(shippingCost) : null,
    items: items.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineNumber: index + 1,
      model: item.model?.trim() || null,
    })),
  });

  // ── Save as Draft ──
  const handleSaveDraft = () => {
    setSubmitError(null);
    createMutation.mutate(buildPayload(), {
      onSuccess: (po) => navigate(`/purchase-orders/${po.id}`),
      onError: (err: any) =>
        setSubmitError(err?.response?.data?.message ?? 'Failed to save draft'),
    });
  };

  // ── Save draft then immediately submit ──
  const handleSaveAndSubmit = () => {
    setSubmitError(null);
    createMutation.mutate(buildPayload(), {
      onSuccess: (po) => {
        submitMutation.mutate(po.id, {
          onSuccess: () => navigate(`/purchase-orders/${po.id}`),
          onError: (err: any) =>
            setSubmitError(err?.response?.data?.message ?? 'Failed to submit'),
        });
      },
      onError: (err: any) =>
        setSubmitError(err?.response?.data?.message ?? 'Failed to create requisition'),
    });
  };

  const isSaving = createMutation.isPending || submitMutation.isPending;

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const shipping = Number(shippingCost) || 0;
  const grandTotal = subtotal + shipping;

  // ── Render ──
  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate('/purchase-orders')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>New Requisition</Typography>
      </Box>

      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* ── Step 1: Details ── */}
      {activeStep === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Details</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Title / Description *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 200 }}
              helperText={`${title.length}/200`}
              error={title.length === 0}
            />
            <Autocomplete
              options={vendorOptions}
              getOptionLabel={(o) => o.name}
              value={selectedVendor}
              onChange={(_, v) => setSelectedVendor(v)}
              renderInput={(params) => (
                <TextField {...params} label="Vendor (optional)" fullWidth />
              )}
            />
            <TextField
              label="Ship To"
              value={shipTo}
              onChange={(e) => setShipTo(e.target.value)}
              fullWidth
              placeholder="Delivery address"
              inputProps={{ maxLength: 500 }}
            />
            <TextField
              label="Shipping Cost ($)"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              type="number"
              inputProps={{ min: 0, step: '0.01' }}
              sx={{ maxWidth: 200 }}
            />
            <TextField
              label="Program / Account"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              label="Notes / Special Instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              inputProps={{ maxLength: 2000 }}
              helperText={`${notes.length}/2000`}
            />
          </Box>
        </Paper>
      )}

      {/* ── Step 2: Line Items ── */}
      {activeStep === 1 && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Line Items</Typography>
            <Button startIcon={<AddIcon />} onClick={addItem} variant="outlined" size="small">
              Add Item
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Description *</TableCell>
                  <TableCell sx={{ width: 80 }}>Qty *</TableCell>
                  <TableCell sx={{ width: 120 }}>Unit Price *</TableCell>
                  <TableCell sx={{ width: 130 }}>Model / Part #</TableCell>
                  <TableCell align="right" sx={{ width: 110 }}>Line Total</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item._key}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={item.description}
                        onChange={(e) => updateItem(item._key, 'description', e.target.value)}
                        fullWidth
                        error={item.description.trim().length === 0}
                        inputProps={{ maxLength: 500 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item._key, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        inputProps={{ min: 1, style: { textAlign: 'right' } }}
                        fullWidth
                        error={item.quantity <= 0}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item._key, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                        inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
                        fullWidth
                        error={item.unitPrice <= 0}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={item.model ?? ''}
                        onChange={(e) => updateItem(item._key, 'model', e.target.value)}
                        fullWidth
                        inputProps={{ maxLength: 200 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{formatCurrency(item.quantity * item.unitPrice)}</Typography>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeItem(item._key)}
                        disabled={items.length === 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Running total */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Box sx={{ minWidth: 240 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                <Typography variant="body2">{formatCurrency(subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Shipping</Typography>
                <Typography variant="body2">{formatCurrency(shipping)}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" fontWeight={700}>Total</Typography>
                <Typography variant="body1" fontWeight={700}>{formatCurrency(grandTotal)}</Typography>
              </Box>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Step 3: Review ── */}
      {activeStep === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Review</Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Title</Typography>
              <Typography>{title}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Vendor</Typography>
              <Typography>{selectedVendor?.name ?? '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Ship To</Typography>
              <Typography>{shipTo || '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Program</Typography>
              <Typography>{program || '—'}</Typography>
            </Box>
            {notes && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="caption" color="text.secondary">Notes</Typography>
                <Typography whiteSpace="pre-line">{notes}</Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Items summary */}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Unit Price</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item._key}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.model || '—'}</TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.quantity * item.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Financial summary */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Box sx={{ minWidth: 280 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography color="text.secondary">Subtotal</Typography>
                <Typography>{formatCurrency(subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography color="text.secondary">Shipping</Typography>
                <Typography>{formatCurrency(shipping)}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1 }}>
                <Typography fontWeight={700} variant="h6">Grand Total</Typography>
                <Typography fontWeight={700} variant="h6">{formatCurrency(grandTotal)}</Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Requested by: {user?.name ?? user?.email}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* ── Navigation Buttons ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          onClick={activeStep === 0 ? () => navigate('/purchase-orders') : handleBack}
          disabled={isSaving}
          variant="outlined"
        >
          {activeStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {activeStep < 2 && (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={
                (activeStep === 0 && !step1Valid) ||
                (activeStep === 1 && !step2Valid)
              }
            >
              Next
            </Button>
          )}

          {activeStep === 2 && (
            <>
              <Button
                variant="outlined"
                onClick={handleSaveDraft}
                disabled={isSaving}
              >
                {isSaving ? <CircularProgress size={20} /> : 'Save as Draft'}
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveAndSubmit}
                disabled={isSaving}
              >
                {isSaving ? <CircularProgress size={20} /> : 'Submit for Approval'}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
```

---

## 9. Page: PurchaseOrderDetail

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

```typescript
/**
 * PurchaseOrderDetail
 *
 * Read-only detail view of a single PO with:
 * - Breadcrumb navigation
 * - PO header info + status chip
 * - Line items table
 * - Financial summary
 * - Status timeline (MUI Stepper in vertical orientation)
 * - Right-side action panel with permission-gated buttons
 * - Dialogs for: Reject, Assign Account Code, Issue PO
 *
 * Route: /purchase-orders/:id
 */

import { useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Link,
  Paper,
  Skeleton,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useAuthStore } from '@/store/authStore';
import { usePurchaseOrder } from '@/hooks/queries/usePurchaseOrders';
import { useRequisitionsPermLevel } from '@/hooks/queries/useRequisitionsPermLevel';
import {
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useAssignAccountCode,
  useIssuePurchaseOrder,
  useDownloadPOPdf,
} from '@/hooks/mutations/usePurchaseOrderMutations';
import {
  PO_STATUS_LABELS,
  PO_STATUS_CHIP_COLOR,
  type POStatus,
} from '@/types/purchaseOrder.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatCurrency = (val: string | number | null | undefined) =>
  val != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val))
    : '—';

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : '—';

// Ordered workflow stages for the timeline stepper
const WORKFLOW_STAGES: { status: POStatus; label: string }[] = [
  { status: 'draft',                label: 'Draft Created' },
  { status: 'submitted',            label: 'Submitted for Approval' },
  { status: 'supervisor_approved',  label: 'Supervisor Approved' },
  { status: 'purchasing_approved',  label: 'Purchasing Approved' },
  { status: 'dos_approved',         label: 'Director of Services Approved' },
  { status: 'po_issued',            label: 'PO Issued' },
];

// Statuses that can be rejected
const REJECTABLE = ['submitted', 'supervisor_approved', 'purchasing_approved', 'dos_approved'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { permLevel } = useRequisitionsPermLevel();

  // Data
  const { data: po, isLoading, error } = usePurchaseOrder(id);

  // Mutations
  const submitMutation  = useSubmitPurchaseOrder();
  const approveMutation = useApprovePurchaseOrder();
  const rejectMutation  = useRejectPurchaseOrder();
  const accountMutation = useAssignAccountCode();
  const issueMutation   = useIssuePurchaseOrder();
  const pdfMutation     = useDownloadPOPdf();

  // Dialog states
  const [approveDialogOpen, setApproveDialogOpen]   = useState(false);
  const [approveNotes, setApproveNotes]             = useState('');
  const [rejectDialogOpen, setRejectDialogOpen]     = useState(false);
  const [rejectReason, setRejectReason]             = useState('');
  const [accountDialogOpen, setAccountDialogOpen]   = useState(false);
  const [accountCode, setAccountCode]               = useState('');
  const [issueDialogOpen, setIssueDialogOpen]       = useState(false);
  const [poNumber, setPoNumber]                     = useState('');
  const [actionError, setActionError]               = useState<string | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1.5, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (error || !po) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {(error as any)?.response?.data?.message ?? 'Purchase order not found.'}
        </Alert>
        <Button onClick={() => navigate('/purchase-orders')} sx={{ mt: 2 }}>
          Back to List
        </Button>
      </Box>
    );
  }

  // ── Permission-derived visibility ──
  const APPROVE_REQUIRED_STATUS: Record<number, string> = {
    3: 'submitted',
    4: 'supervisor_approved',
    5: 'purchasing_approved',
  };

  const canSubmit   = po.status === 'draft' && po.requestorId === user?.id && permLevel >= 2;
  const canApprove  = permLevel >= 3 && po.status === APPROVE_REQUIRED_STATUS[permLevel];
  const canReject   = permLevel >= 3 && REJECTABLE.includes(po.status);
  const canAssign   = permLevel >= 4 && po.status === 'purchasing_approved';
  const canIssue    = permLevel >= 5 && po.status === 'dos_approved' && !!po.accountCode;
  const canEdit     = po.status === 'draft' && (po.requestorId === user?.id || permLevel >= 2);
  const canPdf      = permLevel >= 1;

  const isBusy =
    submitMutation.isPending || approveMutation.isPending ||
    rejectMutation.isPending || accountMutation.isPending ||
    issueMutation.isPending;

  // ── Action handlers ──
  const handleSubmit = () => {
    setActionError(null);
    submitMutation.mutate(po.id, {
      onError: (err: any) =>
        setActionError(err?.response?.data?.message ?? 'Failed to submit'),
    });
  };

  const handleApprove = () => {
    setActionError(null);
    approveMutation.mutate(
      { id: po.id, data: { notes: approveNotes || null } },
      {
        onSuccess: () => setApproveDialogOpen(false),
        onError: (err: any) =>
          setActionError(err?.response?.data?.message ?? 'Failed to approve'),
      },
    );
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    setActionError(null);
    rejectMutation.mutate(
      { id: po.id, data: { reason: rejectReason.trim() } },
      {
        onSuccess: () => { setRejectDialogOpen(false); setRejectReason(''); },
        onError: (err: any) =>
          setActionError(err?.response?.data?.message ?? 'Failed to reject'),
      },
    );
  };

  const handleAssignAccount = () => {
    if (!accountCode.trim()) return;
    setActionError(null);
    accountMutation.mutate(
      { id: po.id, data: { accountCode: accountCode.trim() } },
      {
        onSuccess: () => { setAccountDialogOpen(false); setAccountCode(''); },
        onError: (err: any) =>
          setActionError(err?.response?.data?.message ?? 'Failed to assign account code'),
      },
    );
  };

  const handleIssuePO = () => {
    if (!poNumber.trim()) return;
    setActionError(null);
    issueMutation.mutate(
      { id: po.id, data: { poNumber: poNumber.trim() } },
      {
        onSuccess: () => { setIssueDialogOpen(false); setPoNumber(''); },
        onError: (err: any) =>
          setActionError(err?.response?.data?.message ?? 'Failed to issue PO'),
      },
    );
  };

  // ── Compute active step for timeline ──
  const isDenied = po.status === 'denied';
  const activeStageIndex = isDenied
    ? -1
    : WORKFLOW_STAGES.findIndex((s) => s.status === po.status);

  // ── Render ──
  return (
    <Box sx={{ p: 3 }}>
      {/* ── Breadcrumbs ── */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/purchase-orders" underline="hover" color="inherit">
          Purchase Orders
        </Link>
        <Typography color="text.primary">
          {po.poNumber ?? `REQ-${po.id.slice(0, 8).toUpperCase()}`}
        </Typography>
      </Breadcrumbs>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ── Left column: main content ── */}
        <Grid item xs={12} md={8}>

          {/* PO Header */}
          <Paper sx={{ p: 3, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Box>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  {po.description}
                </Typography>
                {po.poNumber && (
                  <Typography variant="subtitle1" color="text.secondary" fontFamily="monospace">
                    PO# {po.poNumber}
                  </Typography>
                )}
              </Box>
              <Chip
                label={PO_STATUS_LABELS[po.status]}
                color={PO_STATUS_CHIP_COLOR[po.status]}
                sx={{ fontWeight: 600, fontSize: '0.875rem', px: 1 }}
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Requested By</Typography>
                <Typography variant="body2">{po.User.firstName} {po.User.lastName}</Typography>
                <Typography variant="caption" color="text.secondary">{po.User.email}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Vendor</Typography>
                <Typography variant="body2">{po.vendors?.name ?? '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Ship To</Typography>
                <Typography variant="body2">{po.shipTo ?? '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Date Created</Typography>
                <Typography variant="body2">{formatDate(po.createdAt)}</Typography>
              </Grid>
              {po.program && (
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Program</Typography>
                  <Typography variant="body2">{po.program}</Typography>
                </Grid>
              )}
              {po.accountCode && (
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Account Code</Typography>
                  <Typography variant="body2" fontFamily="monospace">{po.accountCode}</Typography>
                </Grid>
              )}
              {po.officeLocation && (
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Location</Typography>
                  <Typography variant="body2">{po.officeLocation.name}</Typography>
                </Grid>
              )}
            </Grid>

            {po.notes && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">Notes</Typography>
                <Typography variant="body2" whiteSpace="pre-line">{po.notes}</Typography>
              </>
            )}

            {po.denialReason && (
              <>
                <Divider sx={{ my: 2 }} />
                <Alert severity="error" sx={{ mt: 1 }}>
                  <Typography variant="subtitle2">Denial Reason</Typography>
                  <Typography variant="body2">{po.denialReason}</Typography>
                </Alert>
              </>
            )}
          </Paper>

          {/* Line Items Table */}
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Line Items</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Model / Part #</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {po.po_items.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.lineNumber ?? idx + 1}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.model ?? '—'}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.totalPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Financial Summary */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{ minWidth: 280 }}>
                {(() => {
                  const subtotal = po.po_items.reduce((s, i) => s + Number(i.totalPrice), 0);
                  const shipping = Number(po.shippingCost ?? 0);
                  const total = Number(po.amount);
                  return (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography color="text.secondary">Subtotal</Typography>
                        <Typography>{formatCurrency(subtotal)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography color="text.secondary">Shipping</Typography>
                        <Typography>{formatCurrency(shipping)}</Typography>
                      </Box>
                      <Divider sx={{ my: 0.5 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography fontWeight={700}>Total</Typography>
                        <Typography fontWeight={700}>{formatCurrency(total)}</Typography>
                      </Box>
                    </>
                  );
                })()}
              </Box>
            </Box>
          </Paper>

          {/* Status Timeline */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Status Timeline</Typography>

            {isDenied ? (
              <Alert severity="error">
                This requisition was denied.{po.denialReason ? ` Reason: ${po.denialReason}` : ''}
              </Alert>
            ) : (
              <Stepper activeStep={activeStageIndex} orientation="vertical">
                {WORKFLOW_STAGES.map((stage, idx) => {
                  // Find history entry for this stage transition
                  const historyEntry = po.statusHistory?.find(
                    (h) => h.toStatus === stage.status,
                  );
                  const completed = idx <= activeStageIndex;
                  return (
                    <Step key={stage.status} completed={completed}>
                      <StepLabel>
                        <Typography variant="body2" fontWeight={completed ? 600 : 400}>
                          {stage.label}
                        </Typography>
                      </StepLabel>
                      <StepContent>
                        {historyEntry && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(historyEntry.changedAt)} by{' '}
                              {historyEntry.changedBy.firstName} {historyEntry.changedBy.lastName}
                            </Typography>
                            {historyEntry.notes && (
                              <Typography variant="body2" sx={{ mt: 0.5 }} fontStyle="italic">
                                "{historyEntry.notes}"
                              </Typography>
                            )}
                          </Box>
                        )}
                      </StepContent>
                    </Step>
                  );
                })}
              </Stepper>
            )}
          </Paper>
        </Grid>

        {/* ── Right column: actions ── */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, position: 'sticky', top: 80 }}>
            <Typography variant="h6" gutterBottom>Actions</Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

              {/* Submit for Approval */}
              {canSubmit && (
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={handleSubmit}
                  disabled={isBusy}
                >
                  {submitMutation.isPending ? <CircularProgress size={20} /> : 'Submit for Approval'}
                </Button>
              )}

              {/* Approve */}
              {canApprove && (
                <Button
                  variant="contained"
                  color="success"
                  fullWidth
                  onClick={() => setApproveDialogOpen(true)}
                  disabled={isBusy}
                >
                  Approve
                </Button>
              )}

              {/* Reject */}
              {canReject && (
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={isBusy}
                >
                  Reject / Deny
                </Button>
              )}

              {/* Assign Account Code */}
              {canAssign && (
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => setAccountDialogOpen(true)}
                  disabled={isBusy}
                >
                  Assign Account Code
                </Button>
              )}

              {/* Issue PO */}
              {canIssue && (
                <Button
                  variant="contained"
                  color="secondary"
                  fullWidth
                  onClick={() => setIssueDialogOpen(true)}
                  disabled={isBusy}
                >
                  Issue PO Number
                </Button>
              )}

              {/* Separator */}
              {(canSubmit || canApprove || canReject || canAssign || canIssue) && (
                <Divider />
              )}

              {/* Edit (draft only) */}
              {canEdit && (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  fullWidth
                  onClick={() => navigate(`/purchase-orders/new?edit=${po.id}`)}
                >
                  Edit Draft
                </Button>
              )}

              {/* Download PDF */}
              {canPdf && (
                <Button
                  variant="text"
                  startIcon={<PictureAsPdfIcon />}
                  fullWidth
                  onClick={() => pdfMutation.mutate(po.id)}
                  disabled={pdfMutation.isPending}
                >
                  {pdfMutation.isPending ? <CircularProgress size={20} /> : 'Download PDF'}
                </Button>
              )}
            </Box>

            {/* PO Info summary */}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Total</Typography>
                <Typography variant="body2" fontWeight={600}>{formatCurrency(po.amount)}</Typography>
              </Box>
              {po.submittedDate && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Submitted</Typography>
                  <Typography variant="body2">
                    {new Date(po.submittedDate).toLocaleDateString()}
                  </Typography>
                </Box>
              )}
              {po.issuedAt && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Issued</Typography>
                  <Typography variant="body2">
                    {new Date(po.issuedAt).toLocaleDateString()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* ═══════════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════════ */}

      {/* ── Approve Dialog ── */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Requisition</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Approving: <strong>{po.description}</strong>
          </Typography>
          <TextField
            label="Notes (optional)"
            value={approveNotes}
            onChange={(e) => setApproveNotes(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 1000 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)} disabled={approveMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? <CircularProgress size={20} /> : 'Confirm Approval'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Requisition</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            This will deny the requisition. The requester will be notified.
          </Typography>
          <TextField
            label="Reason for Denial *"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ mt: 2 }}
            required
            error={rejectReason.trim().length === 0}
            helperText={rejectReason.trim().length === 0 ? 'A reason is required' : ''}
            inputProps={{ maxLength: 1000 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)} disabled={rejectMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleReject}
            disabled={rejectMutation.isPending || rejectReason.trim().length === 0}
          >
            {rejectMutation.isPending ? <CircularProgress size={20} /> : 'Confirm Rejection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Assign Account Code Dialog ── */}
      <Dialog open={accountDialogOpen} onClose={() => setAccountDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Account Code</DialogTitle>
        <DialogContent>
          <TextField
            label="Account Code *"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
            required
            error={accountCode.trim().length === 0}
            inputProps={{ maxLength: 100 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccountDialogOpen(false)} disabled={accountMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAssignAccount}
            disabled={accountMutation.isPending || accountCode.trim().length === 0}
          >
            {accountMutation.isPending ? <CircularProgress size={20} /> : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Issue PO Dialog ── */}
      <Dialog open={issueDialogOpen} onClose={() => setIssueDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Issue PO Number</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            This finalizes the purchase order. Assign a unique PO number.
          </Typography>
          <TextField
            label="PO Number *"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
            required
            error={poNumber.trim().length === 0}
            inputProps={{ maxLength: 100 }}
            autoFocus
            helperText="Example: PO-2026-001"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueDialogOpen(false)} disabled={issueMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleIssuePO}
            disabled={issueMutation.isPending || poNumber.trim().length === 0}
          >
            {issueMutation.isPending ? <CircularProgress size={20} /> : 'Issue PO'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

---

## 10. Barrel Exports

**File:** `frontend/src/pages/PurchaseOrders/index.ts`

```typescript
export { default as PurchaseOrderList }   from './PurchaseOrderList';
export { default as RequisitionWizard }   from './RequisitionWizard';
export { default as PurchaseOrderDetail } from './PurchaseOrderDetail';
```

---

## 11. App.tsx Changes

**File:** `frontend/src/App.tsx`

### Step A — Add imports (after existing page imports, before `ProtectedRoute`)

```tsx
// ADD after existing page imports:
import {
  PurchaseOrderList,
  RequisitionWizard,
  PurchaseOrderDetail,
} from './pages/PurchaseOrders';
```

### Step B — Add route entries (exact JSX diff)

The three PO routes must be added before the catch-all redirects. Insert them after the `/reference-data` route and before `<Route path="/" element={<Navigate to="/dashboard" replace />} />`.

```tsx
        // −−− EXISTING context above −−−
        <Route
          path="/reference-data"
          element={
            <ProtectedRoute requireAdmin>
              <AppLayout>
                <ReferenceDataManagement />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* ↓↓ ADD THESE THREE ROUTES ↓↓ */}
        <Route
          path="/purchase-orders"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PurchaseOrderList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/new"
          element={
            <ProtectedRoute>
              <AppLayout>
                <RequisitionWizard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PurchaseOrderDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        {/* ↑↑ END NEW ROUTES ↑↑ */}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        // −−− EXISTING context below −−−
```

> **Note:** The `/purchase-orders/new` route intentionally uses no `requireAdmin` — permission to *create* POs is enforced at the service layer (REQUISITIONS level 2). Any authenticated user who lacks level 2 will see an appropriate API error; the frontend additionally hides the "New Requisition" button in `PurchaseOrderList` for users with level < 2.

> **Note on route order:** `/purchase-orders/new` **must** appear before `/purchase-orders/:id` in the Routes definition, otherwise React Router v6 will match the literal string "new" as an `:id` param. React Router v6's `<Routes>` performs ranked matching but explicit paths always beat params — this is safe either way, but conventional ordering is recommended.

---

## 12. AppLayout.tsx Changes

**File:** `frontend/src/components/layout/AppLayout.tsx`

### Change location

In the `NAV_SECTIONS` constant, in the `Operations` section, the Purchase Orders item currently reads:

```typescript
      { label: 'Purchase Orders', icon: '📋', disabled: true },
```

### Replacement

Remove `disabled: true` and add `path: '/purchase-orders'`:

```typescript
      { label: 'Purchase Orders', icon: '📋', path: '/purchase-orders' },
```

### Full diff context (3 lines before and after for the implementor)

```typescript
  {
    title: 'Operations',
    items: [
      // BEFORE:
      // { label: 'Purchase Orders', icon: '📋', disabled: true },
      // AFTER:
      { label: 'Purchase Orders', icon: '📋', path: '/purchase-orders' },
      { label: 'Maintenance', icon: '🔧', disabled: true },
    ],
  },
```

No other changes needed in `AppLayout.tsx`. The existing rendering logic already handles the transition:

```typescript
// Existing logic in AppLayout (no change needed):
if (item.disabled) {
  return (
    <div key={item.label} className="nav-item nav-item--disabled">
      ...
      <span className="nav-soon">Soon</span>
    </div>
  );
}
return (
  <button
    key={item.label}
    className={`nav-item${isActive ? ' nav-item--active' : ''}`}
    onClick={() => item.path && navigate(item.path)}
  >
    ...
  </button>
);
```

Since we're removing `disabled: true` and adding `path`, the item will automatically render as the clickable `<button>` branch with active-state highlighting.

---

## Summary of all files to create / modify

| Action | File |
|--------|------|
| **CREATE** | `frontend/src/types/purchaseOrder.types.ts` |
| **MODIFY** | `frontend/src/lib/queryKeys.ts` — add `purchaseOrders` block |
| **CREATE** | `frontend/src/services/purchaseOrder.service.ts` |
| **CREATE** | `frontend/src/hooks/queries/usePurchaseOrders.ts` |
| **CREATE** | `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` |
| **CREATE** | `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` |
| **CREATE** | `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` |
| **CREATE** | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` |
| **CREATE** | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` |
| **CREATE** | `frontend/src/pages/PurchaseOrders/index.ts` |
| **MODIFY** | `frontend/src/App.tsx` — add 3 imports + 3 route entries |
| **MODIFY** | `frontend/src/components/layout/AppLayout.tsx` — activate PO nav item |

---

## Implementation Notes for the Implementor

### MUI Icons
The spec uses `AddIcon`, `SearchIcon`, `EditIcon`, `PictureAsPdfIcon`, `ArrowBackIcon`, `DeleteIcon`. Verify these are available from `@mui/icons-material`. If not installed, run:
```bash
npm install @mui/icons-material
```

### `@/` path alias
All imports use the `@/` alias (e.g., `@/services/api`). This alias is already configured in `vite.config.ts` (confirmed by `useInventory.ts` and `useInventoryMutations.ts` which use the same alias).

### Grid v2 vs v1
`frontend/package.json` lists `@mui/material ^7.3.8`. MUI v7 still ships the original `Grid` component. If a "Grid v2" migration is needed, use `Grid2` from `@mui/material/Unstable_Grid2`. The spec uses the standard `Grid` import.

### Edit mode in RequisitionWizard
The component spec navigates to `/purchase-orders/new?edit={id}` for draft edits. The initial implementation does not read this query param — that prefill feature can be added in a follow-up Sprint C-2 task once the basic create flow is confirmed working. The `useUpdatePurchaseOrder` mutation is already spec'd and ready for integration.

### Stats endpoint
The `getStats()` method in `purchaseOrder.service.ts` currently derives counts from a full list fetch. If PO volume grows, add `GET /api/purchase-orders/stats` to the backend (not in current backend spec) and replace the client-side derivation with a direct call.

### Vendor endpoint shape
The `RequisitionWizard` fetches vendors from `/reference-data/vendors`. The exact response shape for the vendors endpoint must be verified against `referenceDataService.ts`. Adjust the response destructuring (`res.data.vendors`) if the actual shape differs.

---

*Spec generated by Sprint C-2 Frontend Specification Subagent.*

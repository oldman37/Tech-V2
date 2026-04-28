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
    if (filters.fiscalYear)               q.append('fiscalYear', filters.fiscalYear);
    if (filters.workflowType)             q.append('workflowType', filters.workflowType);
    if (filters.onlyMine)                 q.append('onlyMine',   'true');
    if (filters.pendingMyApproval)        q.append('pendingMyApproval', 'true');

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
   *   level 5 → supervisor_approved → finance_director_approved
   *   level 6 → finance_director_approved → dos_approved
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
   * Assigns account code. Requires level 4 + status = dos_approved.
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
    const url = window.URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
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
   * NOTE: If the backend adds GET /api/purchase-orders/stats, replace this
   * implementation with a direct API call.
   */
  getStats: async (): Promise<PurchaseOrderStats> => {
    const res = await purchaseOrderService.getAll({ limit: 1000 });
    const counts: Record<string, number> = {
      draft: 0, submitted: 0, supervisor_approved: 0,
      finance_director_approved: 0, dos_approved: 0, po_issued: 0, denied: 0,
    };
    let totalAmount = 0;

    for (const po of res.items) {
      counts[po.status] = (counts[po.status] ?? 0) + 1;
      totalAmount += Number(po.amount);
    }

    const pendingApproval =
      (counts['submitted'] ?? 0) +
      (counts['supervisor_approved'] ?? 0) +
      (counts['finance_director_approved'] ?? 0) +
      (counts['dos_approved'] ?? 0);

    return {
      counts: counts as PurchaseOrderStats['counts'],
      totalAmount,
      pendingApproval,
    };
  },
};

export default purchaseOrderService;

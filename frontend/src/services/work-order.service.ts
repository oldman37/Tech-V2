/**
 * Work Order Service
 *
 * Handles all API calls for the unified work order system.
 * Follows the purchaseOrder.service.ts object-literal pattern exactly.
 *
 * Base path: /api/work-orders
 * Authentication: HttpOnly JWT cookie (handled by api.ts interceptors)
 * CSRF: Injected automatically for POST/PUT/PATCH/DELETE by api.ts
 */

import { api } from './api';
import type {
  WorkOrderDetail,
  WorkOrderListResponse,
  WorkOrderQuery,
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
} from '../types/work-order.types';

const BASE = '/work-orders';

const workOrderService = {
  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  getAll: async (filters: WorkOrderQuery = {}): Promise<WorkOrderListResponse> => {
    const q = new URLSearchParams();
    if (filters.page !== undefined)        q.append('page',             String(filters.page));
    if (filters.limit !== undefined)       q.append('limit',            String(filters.limit));
    if (filters.department)                q.append('department',       filters.department);
    if (filters.status)                    q.append('status',           filters.status);
    if (filters.priority)                  q.append('priority',         filters.priority);
    if (filters.officeLocationId)          q.append('officeLocationId', filters.officeLocationId);
    if (filters.roomId)                    q.append('roomId',           filters.roomId);
    if (filters.assignedToId)              q.append('assignedToId',     filters.assignedToId);
    if (filters.reportedById)              q.append('reportedById',     filters.reportedById);
    if (filters.fiscalYear)                q.append('fiscalYear',       filters.fiscalYear);
    if (filters.search)                    q.append('search',           filters.search);

    const qs = q.toString();
    const res = await api.get<WorkOrderListResponse>(`${BASE}${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Single Work Order Detail
  // -------------------------------------------------------------------------

  getById: async (id: string): Promise<WorkOrderDetail> => {
    const res = await api.get<WorkOrderDetail>(`${BASE}/${id}`);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  create: async (data: CreateWorkOrderDto): Promise<WorkOrderDetail> => {
    const res = await api.post<WorkOrderDetail>(BASE, data);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update: async (id: string, data: UpdateWorkOrderDto): Promise<WorkOrderDetail> => {
    const res = await api.put<WorkOrderDetail>(`${BASE}/${id}`, data);
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Status Transition
  // -------------------------------------------------------------------------

  updateStatus: async (id: string, status: string, notes?: string): Promise<WorkOrderDetail> => {
    const res = await api.put<WorkOrderDetail>(`${BASE}/${id}/status`, { status, notes });
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Assign
  // -------------------------------------------------------------------------

  assign: async (id: string, assignedToId: string | null): Promise<WorkOrderDetail> => {
    const res = await api.put<WorkOrderDetail>(`${BASE}/${id}/assign`, { assignedToId });
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Add Comment
  // -------------------------------------------------------------------------

  addComment: async (id: string, body: string, isInternal = false) => {
    const res = await api.post(`${BASE}/${id}/comments`, { body, isInternal });
    return res.data;
  },

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  delete: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats: async (params?: { officeLocationId?: string; department?: string; fiscalYear?: string }) => {
    const q = new URLSearchParams();
    if (params?.officeLocationId) q.append('officeLocationId', params.officeLocationId);
    if (params?.department)       q.append('department',       params.department);
    if (params?.fiscalYear)       q.append('fiscalYear',       params.fiscalYear);
    const qs = q.toString();
    const res = await api.get<Record<string, number>>(`${BASE}/stats/summary${qs ? `?${qs}` : ''}`);
    return res.data;
  },
};

export default workOrderService;

/**
 * Field Trip Frontend Service
 *
 * All API calls for the field trip workflow.
 * Follows the purchaseOrder.service.ts object-literal pattern exactly.
 * Authentication cookies and CSRF tokens are handled automatically by api.ts interceptors.
 */

import { api } from './api';
import type {
  FieldTripRequest,
  CreateFieldTripDto,
  UpdateFieldTripDto,
  ApproveTripDto,
  DenyTripDto,
} from '../types/fieldTrip.types';

const BASE = '/field-trips';

export const fieldTripService = {
  // ---------------------------------------------------------------------------
  // My requests
  // ---------------------------------------------------------------------------

  getMyRequests: async (): Promise<FieldTripRequest[]> => {
    const res = await api.get<FieldTripRequest[]>(`${BASE}/my-requests`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Pending approvals (for approvers)
  // ---------------------------------------------------------------------------

  getPendingApprovals: async (): Promise<FieldTripRequest[]> => {
    const res = await api.get<FieldTripRequest[]>(`${BASE}/pending-approvals`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Single record
  // ---------------------------------------------------------------------------

  getById: async (id: string): Promise<FieldTripRequest> => {
    const res = await api.get<FieldTripRequest>(`${BASE}/${id}`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Create / Update
  // ---------------------------------------------------------------------------

  create: async (data: CreateFieldTripDto): Promise<FieldTripRequest> => {
    const res = await api.post<FieldTripRequest>(BASE, data);
    return res.data;
  },

  update: async (id: string, data: UpdateFieldTripDto): Promise<FieldTripRequest> => {
    const res = await api.put<FieldTripRequest>(`${BASE}/${id}`, data);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Workflow actions
  // ---------------------------------------------------------------------------

  submit: async (id: string): Promise<FieldTripRequest> => {
    const res = await api.post<FieldTripRequest>(`${BASE}/${id}/submit`);
    return res.data;
  },

  approve: async (id: string, data?: ApproveTripDto): Promise<FieldTripRequest> => {
    const res = await api.post<FieldTripRequest>(`${BASE}/${id}/approve`, data ?? {});
    return res.data;
  },

  deny: async (id: string, data: DenyTripDto): Promise<FieldTripRequest> => {
    const res = await api.post<FieldTripRequest>(`${BASE}/${id}/deny`, data);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Date counts (calendar availability)
  // ---------------------------------------------------------------------------

  getDateCounts: async (from: string, to: string): Promise<Record<string, number>> => {
    const res = await api.get<Record<string, number>>(
      `${BASE}/date-counts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  delete: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};

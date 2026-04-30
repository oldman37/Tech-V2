/**
 * Field Trip Transportation Frontend Service
 *
 * All API calls for the Step 2 transportation workflow.
 * Returns null (not an error) when the transportation request does not yet exist (404).
 * Authentication cookies and CSRF tokens are handled by api.ts interceptors.
 */

import { isAxiosError } from 'axios';
import { api } from './api';
import type {
  FieldTripTransportationRequest,
  CreateTransportationDto,
  UpdateTransportationDto,
  ApproveTransportationDto,
  DenyTransportationDto,
} from '../types/fieldTrip.types';

const BASE = '/field-trips';

export const fieldTripTransportationService = {
  // ---------------------------------------------------------------------------
  // Get by field trip ID (returns null when not found)
  // ---------------------------------------------------------------------------

  getByTripId: async (fieldTripId: string): Promise<FieldTripTransportationRequest | null> => {
    try {
      const res = await api.get<FieldTripTransportationRequest>(
        `${BASE}/${fieldTripId}/transportation`,
      );
      return res.data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  },

  // ---------------------------------------------------------------------------
  // Create draft
  // ---------------------------------------------------------------------------

  create: async (
    fieldTripId: string,
    data: CreateTransportationDto,
  ): Promise<FieldTripTransportationRequest> => {
    const res = await api.post<FieldTripTransportationRequest>(
      `${BASE}/${fieldTripId}/transportation`,
      data,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Update draft
  // ---------------------------------------------------------------------------

  update: async (
    fieldTripId: string,
    data: UpdateTransportationDto,
  ): Promise<FieldTripTransportationRequest> => {
    const res = await api.put<FieldTripTransportationRequest>(
      `${BASE}/${fieldTripId}/transportation`,
      data,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Submit (DRAFT → PENDING_TRANSPORTATION)
  // ---------------------------------------------------------------------------

  submit: async (fieldTripId: string): Promise<FieldTripTransportationRequest> => {
    const res = await api.post<FieldTripTransportationRequest>(
      `${BASE}/${fieldTripId}/transportation/submit`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Approve Part C (Transportation Director)
  // ---------------------------------------------------------------------------

  approve: async (
    fieldTripId: string,
    data: ApproveTransportationDto,
  ): Promise<FieldTripTransportationRequest> => {
    const res = await api.post<FieldTripTransportationRequest>(
      `${BASE}/${fieldTripId}/transportation/approve`,
      data,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Deny Part C (Transportation Director)
  // ---------------------------------------------------------------------------

  deny: async (
    fieldTripId: string,
    data: DenyTransportationDto,
  ): Promise<FieldTripTransportationRequest> => {
    const res = await api.post<FieldTripTransportationRequest>(
      `${BASE}/${fieldTripId}/transportation/deny`,
      data,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // List pending Part C requests (Transportation Director queue)
  // ---------------------------------------------------------------------------

  listPending: async (): Promise<FieldTripTransportationRequest[]> => {
    const res = await api.get<FieldTripTransportationRequest[]>(
      `${BASE}/transportation/pending`,
    );
    return res.data;
  },
};

/**
 * Transportation Request Frontend Service
 *
 * All API calls for standalone transportation requests.
 * Authentication cookies and CSRF tokens handled by api.ts interceptors.
 */
import { api } from './api';
import type {
  TransportationRequest,
  CreateTransportationRequestDto,
  ApproveTransportationRequestDto,
  DenyTransportationRequestDto,
} from '../types/transportationRequest.types';

const BASE = '/transportation-requests';

export const transportationRequestService = {

  list: async (filters?: {
    status?: string;
    from?:   string;
    to?:     string;
  }): Promise<TransportationRequest[]> => {
    const res = await api.get<TransportationRequest[]>(BASE, { params: filters });
    return res.data;
  },

  getById: async (id: string): Promise<TransportationRequest> => {
    const res = await api.get<TransportationRequest>(`${BASE}/${id}`);
    return res.data;
  },

  create: async (data: CreateTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.post<TransportationRequest>(BASE, data);
    return res.data;
  },

  approve: async (id: string, data: ApproveTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.put<TransportationRequest>(`${BASE}/${id}/approve`, data);
    return res.data;
  },

  deny: async (id: string, data: DenyTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.put<TransportationRequest>(`${BASE}/${id}/deny`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};

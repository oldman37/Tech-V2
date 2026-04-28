/**
 * Funding Source Service
 *
 * Handles all API calls for FundingSource reference-data management.
 * Follows the roomService pattern.
 */

import { api } from './api';
import type {
  FundingSource,
  FundingSourceListResponse,
  CreateFundingSourceRequest,
  UpdateFundingSourceRequest,
  FundingSourceQueryParams,
} from '../types/fundingSource.types';

const fundingSourceService = {
  /**
   * Retrieve funding sources with optional filters and pagination.
   */
  getAll: async (params?: FundingSourceQueryParams): Promise<FundingSourceListResponse> => {
    const q = new URLSearchParams();
    if (params?.page !== undefined) q.append('page', String(params.page));
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    if (params?.search) q.append('search', params.search);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.sortBy) q.append('sortBy', params.sortBy);
    if (params?.sortOrder) q.append('sortOrder', params.sortOrder);

    const qs = q.toString();
    const res = await api.get<FundingSourceListResponse>(
      `/funding-sources${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  /**
   * Retrieve a single funding source by ID.
   */
  getById: async (id: string): Promise<FundingSource> => {
    const res = await api.get<FundingSource>(`/funding-sources/${id}`);
    return res.data;
  },

  /**
   * Create a new funding source.
   */
  create: async (data: CreateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.post<FundingSource>('/funding-sources', data);
    return res.data;
  },

  /**
   * Update an existing funding source.
   */
  update: async (id: string, data: UpdateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.put<FundingSource>(`/funding-sources/${id}`, data);
    return res.data;
  },

  /**
   * Soft-delete (deactivate) a funding source.
   */
  softDelete: async (id: string): Promise<{ message: string; item: FundingSource }> => {
    const res = await api.delete<{ message: string; item: FundingSource }>(
      `/funding-sources/${id}`,
    );
    return res.data;
  },

  /**
   * Hard-delete (permanently remove) a funding source.
   * Requires ADMIN role.
   */
  hardDelete: async (id: string): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`/funding-sources/${id}/hard`);
    return res.data;
  },
};

export default fundingSourceService;

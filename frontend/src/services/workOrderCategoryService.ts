/**
 * Work Order Category Service
 *
 * Handles all API calls for WorkOrderCategory reference-data management.
 * Follows the fundingSourceService pattern.
 */

import { api } from './api';
import type {
  WorkOrderCategory,
  WorkOrderCategoryListResponse,
  CreateWorkOrderCategoryDto,
  UpdateWorkOrderCategoryDto,
  WorkOrderCategoryQueryParams,
} from '../types/workOrderCategory.types';

const workOrderCategoryService = {
  /**
   * Retrieve work order categories with optional filters.
   */
  getAll: async (params?: WorkOrderCategoryQueryParams): Promise<WorkOrderCategoryListResponse> => {
    const q = new URLSearchParams();
    if (params?.page      !== undefined) q.append('page',      String(params.page));
    if (params?.limit     !== undefined) q.append('limit',     String(params.limit));
    if (params?.search)                  q.append('search',    params.search);
    if (params?.module)                  q.append('module',    params.module);
    if (params?.isActive  !== undefined) q.append('isActive',  String(params.isActive));
    if (params?.sortBy)                  q.append('sortBy',    params.sortBy);
    if (params?.sortOrder)               q.append('sortOrder', params.sortOrder);

    const qs = q.toString();
    const res = await api.get<WorkOrderCategoryListResponse>(
      `/work-order-categories${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  /**
   * Retrieve a single work order category by ID.
   */
  getById: async (id: string): Promise<WorkOrderCategory> => {
    const res = await api.get<WorkOrderCategory>(`/work-order-categories/${id}`);
    return res.data;
  },

  /**
   * Create a new work order category.
   */
  create: async (data: CreateWorkOrderCategoryDto): Promise<WorkOrderCategory> => {
    const res = await api.post<WorkOrderCategory>('/work-order-categories', data);
    return res.data;
  },

  /**
   * Update an existing work order category.
   */
  update: async (id: string, data: UpdateWorkOrderCategoryDto): Promise<WorkOrderCategory> => {
    const res = await api.put<WorkOrderCategory>(`/work-order-categories/${id}`, data);
    return res.data;
  },

  /**
   * Permanently delete a work order category.
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/work-order-categories/${id}`);
  },
};

export default workOrderCategoryService;

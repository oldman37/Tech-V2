/**
 * Reference Data Service
 * API calls for Brands, Vendors, Categories, and Models.
 */

import { api } from './api';

export interface Brand {
  id: string;
  name: string;
  description?: string | null;
  website?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  fax?: string | null;
  website?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  categories?: Category | null; // parent ref (from include)
  other_categories?: Category[]; // children (from include)
}

export interface EquipmentModel {
  id: string;
  name: string;
  brandId: string;
  modelNumber?: string | null;
  description?: string | null;
  specifications?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  brands?: { id: string; name: string };
}

export interface RefDataListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Brands ─────────────────────────────────────────────────────────────────

export const brandsService = {
  getAll: async (params?: { search?: string; isActive?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    const res = await api.get<RefDataListResponse<Brand>>(`/brands?${q}`);
    return res.data;
  },
  create: async (data: { name: string; description?: string | null; website?: string | null }) => {
    const res = await api.post<Brand>('/brands', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Brand>) => {
    const res = await api.put<Brand>(`/brands/${id}`, data);
    return res.data;
  },
  deactivate: async (id: string) => {
    const res = await api.delete<{ message: string; item: Brand }>(`/brands/${id}`);
    return res.data;
  },
};

// ─── Vendors ────────────────────────────────────────────────────────────────

export const vendorsService = {
  getAll: async (params?: { search?: string; isActive?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    const res = await api.get<RefDataListResponse<Vendor>>(`/vendors?${q}`);
    return res.data;
  },
  create: async (data: Omit<Vendor, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) => {
    const res = await api.post<Vendor>('/vendors', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Vendor>) => {
    const res = await api.put<Vendor>(`/vendors/${id}`, data);
    return res.data;
  },
  deactivate: async (id: string) => {
    const res = await api.delete<{ message: string; item: Vendor }>(`/vendors/${id}`);
    return res.data;
  },
};

// ─── Categories ─────────────────────────────────────────────────────────────

export const categoriesService = {
  getAll: async (params?: { search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    const res = await api.get<RefDataListResponse<Category>>(`/categories?${q}`);
    return res.data;
  },
  create: async (data: { name: string; description?: string | null; parentId?: string | null }) => {
    const res = await api.post<Category>('/categories', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Category>) => {
    const res = await api.put<Category>(`/categories/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete<{ message: string }>(`/categories/${id}`);
    return res.data;
  },
};

// ─── Equipment Models ────────────────────────────────────────────────────────

export const modelsService = {
  getAll: async (params?: { search?: string; brandId?: string; isActive?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.brandId) q.append('brandId', params.brandId);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    const res = await api.get<RefDataListResponse<EquipmentModel>>(`/equipment-models?${q}`);
    return res.data;
  },
  create: async (data: { name: string; brandId: string; modelNumber?: string | null; description?: string | null; specifications?: string | null }) => {
    const res = await api.post<EquipmentModel>('/equipment-models', data);
    return res.data;
  },
  update: async (id: string, data: Partial<EquipmentModel>) => {
    const res = await api.put<EquipmentModel>(`/equipment-models/${id}`, data);
    return res.data;
  },
  deactivate: async (id: string) => {
    const res = await api.delete<{ message: string; item: EquipmentModel }>(`/equipment-models/${id}`);
    return res.data;
  },
};

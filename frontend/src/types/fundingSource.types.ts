/**
 * TypeScript types for the FundingSource reference-data system.
 */

export interface FundingSource {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FundingSourceListResponse {
  items: FundingSource[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateFundingSourceRequest {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateFundingSourceRequest {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface FundingSourceQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

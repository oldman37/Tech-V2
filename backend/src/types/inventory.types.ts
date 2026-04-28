/**
 * TypeScript type definitions for Inventory Management System
 * 
 * Provides type-safe interfaces for inventory operations, queries, and responses
 */

import { equipment, Prisma } from '@prisma/client';

/**
 * Inventory item with all relations populated
 */
export interface InventoryItemWithRelations extends equipment {
  brand?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
  model?: {
    id: string;
    name: string;
    modelNumber?: string | null;
    brandId: string;
  } | null;
  category?: {
    id: string;
    name: string;
    description?: string | null;
    parentId?: string | null;
  } | null;
  location?: {
    id: string;
    buildingName: string;
    roomNumber: string;
  } | null;
  officeLocation?: {
    id: string;
    name: string;
    type: string;
    code?: string | null;
  } | null;
  vendor?: {
    id: string;
    name: string;
    contactName?: string | null;
  } | null;
  room?: {
    id: string;
    name: string;
    locationId: string;
    type?: string | null;
  } | null;
}

/**
 * Query parameters for inventory filtering, searching, and pagination
 */
export interface InventoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  officeLocationId?: string;
  roomId?: string;
  categoryId?: string;
  status?: string;
  isDisposed?: boolean;
  brandId?: string;
  vendorId?: string;
  modelId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minPrice?: number;
  maxPrice?: number;
  purchaseDateFrom?: Date;
  purchaseDateTo?: Date;
  disposedDateFrom?: Date;
  disposedDateTo?: Date;
}

/**
 * Paginated inventory response
 */
export interface InventoryListResponse {
  items: InventoryItemWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Inventory statistics for dashboard
 */
export interface InventoryStatistics {
  totalItems: number;
  totalValue: number;
  activeItems: number;
  disposedItems: number;
  itemsByStatus: Array<{
    status: string;
    count: number;
  }>;
  itemsByLocation: Array<{
    locationId: string;
    locationName: string;
    count: number;
    totalValue: number;
  }>;
  itemsByCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  recentItems: InventoryItemWithRelations[];
}

/**
 * DTO for creating new inventory item
 */
export interface CreateInventoryDto {
  assetTag: string;
  serialNumber?: string | null;
  name: string;
  description?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  locationId?: string | null;
  officeLocationId?: string | null;
  roomId?: string | null;
  assignedToUserId?: string | null;
  categoryId?: string | null;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
  fundingSource?: string | null;
  fundingSourceId?: string | null;
  poNumber?: string | null;
  vendorId?: string | null;
  status?: string;
  condition?: string | null;
  notes?: string | null;
}

/**
 * DTO for updating inventory item
 */
export interface UpdateInventoryDto extends Partial<CreateInventoryDto> {
  isDisposed?: boolean;
  disposedDate?: Date | null;
  disposedReason?: string | null;
  disposalDate?: Date | null;
}

/**
 * DTO for bulk update operations
 */
export interface BulkUpdateDto {
  itemIds: string[];
  updates: Partial<UpdateInventoryDto>;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  updated: number;
  failed: number;
  errors: Array<{
    itemId: string;
    error: string;
  }>;
}

/**
 * Import options for Excel import
 */
export interface ImportOptions {
  updateExisting?: boolean; // Update existing items by asset tag
  skipDuplicates?: boolean; // Skip rows with duplicate asset tags
  validateOnly?: boolean;   // Only validate without importing
  batchSize?: number;       // Batch size for processing
}

/**
 * Import validation error
 */
export interface ImportValidationError {
  row: number;
  field: string;
  value: any;
  message: string;
}

/**
 * Import job result
 */
export interface ImportJobResult {
  jobId: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  errors: ImportValidationError[];
  startedAt: Date;
  completedAt?: Date | null;
}

/**
 * Export filter options
 */
export interface ExportFilters {
  officeLocationId?: string;
  categoryId?: string;
  status?: string;
  isDisposed?: boolean;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

/**
 * Inventory change history entry (audit trail)
 */
export interface InventoryHistoryEntry {
  id: string;
  equipmentId: string;
  changeType: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
  changedByName: string;
  changedAt: Date;
  notes?: string | null;
}

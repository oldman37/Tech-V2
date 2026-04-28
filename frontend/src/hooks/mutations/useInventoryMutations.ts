import { useMutation, useQueryClient } from '@tanstack/react-query';
import inventoryService from '@/services/inventory.service';
import {
  UpdateInventoryRequest,
  CreateInventoryRequest,
  ExportOptions,
} from '@/types/inventory.types';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for disposing (soft-deleting) an inventory item.
 * Invalidates all inventory queries on success.
 */
export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inventoryService.deleteItem(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },

    onError: (error: Error) => {
      console.error('Failed to dispose item:', error);
    },
  });
}

/**
 * Mutation for updating an existing inventory item (includes reactivation).
 * Invalidates list and detail queries for the affected item on success.
 */
export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInventoryRequest }) =>
      inventoryService.updateItem(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.detail(id) });
    },

    onError: (error: Error) => {
      console.error('Failed to update item:', error);
    },
  });
}

/**
 * Mutation for creating a new inventory item.
 * Invalidates all inventory queries on success.
 */
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInventoryRequest) => inventoryService.createItem(data),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },

    onError: (error: Error) => {
      console.error('Failed to create item:', error);
    },
  });
}

/**
 * Mutation for exporting inventory to Excel/CSV.
 * Triggers a file download via blob — no cache invalidation needed (read-only).
 */
export function useExportInventory() {
  return useMutation({
    mutationFn: (options: ExportOptions) => inventoryService.exportInventory(options),

    onError: (error: Error) => {
      console.error('Failed to export inventory:', error);
    },
  });
}

/**
 * Mutation for bulk-updating multiple inventory items.
 * Invalidates all inventory queries on success.
 */
export function useBulkUpdateInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemIds, updates }: { itemIds: string[]; updates: UpdateInventoryRequest }) =>
      inventoryService.bulkUpdate(itemIds, updates),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },

    onError: (error: Error) => {
      console.error('Failed to bulk update items:', error);
    },
  });
}

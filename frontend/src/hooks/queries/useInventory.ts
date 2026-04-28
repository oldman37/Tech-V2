import { useQuery, UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import inventoryService from '@/services/inventory.service';
import {
  InventoryListResponse,
  InventoryStatistics,
  InventoryFilters,
} from '@/types/inventory.types';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching paginated inventory list.
 * Refetches automatically when page, pageSize, or filters change.
 * Uses placeholderData to prevent flash-of-empty during page transitions.
 */
export function useInventoryList(
  page: number,
  pageSize: number,
  filters: InventoryFilters,
  options?: Omit<UseQueryOptions<InventoryListResponse>, 'queryKey' | 'queryFn'>
) {
  const params = { page, limit: pageSize, ...filters };
  return useQuery({
    queryKey: queryKeys.inventory.list(params as Record<string, unknown>),
    queryFn: () => inventoryService.getInventory(params),
    placeholderData: keepPreviousData, // No flash-of-empty during page change
    ...options,
  });
}

/**
 * Hook for fetching inventory statistics.
 * Long staleTime — stats don't need to be fresh every 30s.
 * Shared cache with Dashboard.tsx (same query key).
 */
export function useInventoryStats(
  options?: Omit<UseQueryOptions<InventoryStatistics>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventory.stats(),
    queryFn: () => inventoryService.getStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes — matches Dashboard.tsx
    ...options,
  });
}

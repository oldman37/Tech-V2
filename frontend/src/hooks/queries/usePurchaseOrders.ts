/**
 * TanStack Query v5 hooks for the Purchase Order / Requisitions system.
 *
 * Patterns:
 * - placeholderData: keepPreviousData  →  no flash-of-empty between page changes
 * - staleTime on stats               →  avoid redundant refetches on the same page
 * - enabled: !!id                    →  skip queries for undefined IDs
 */

import { useQuery, type UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import purchaseOrderService from '@/services/purchaseOrder.service';
import { queryKeys } from '@/lib/queryKeys';
import type {
  PurchaseOrder,
  PurchaseOrderListResponse,
  PurchaseOrderStats,
  PurchaseOrderStatusHistory,
  PurchaseOrderFilters,
} from '@/types/purchaseOrder.types';

// ---------------------------------------------------------------------------
// usePurchaseOrderList
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated, filtered list of purchase orders.
 * Uses placeholderData so the previous page's rows stay visible
 * while the next page loads.
 */
export function usePurchaseOrderList(
  filters: PurchaseOrderFilters = {},
  options?: Omit<UseQueryOptions<PurchaseOrderListResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(filters as Record<string, unknown>),
    queryFn: () => purchaseOrderService.getAll(filters),
    placeholderData: keepPreviousData,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrder (single detail)
// ---------------------------------------------------------------------------

/**
 * Fetches a single PO with full detail (items, history, vendor, requestor).
 * Skips the query entirely when id is falsy.
 */
export function usePurchaseOrder(
  id: string | undefined,
  options?: Omit<UseQueryOptions<PurchaseOrder>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id ?? ''),
    queryFn: () => purchaseOrderService.getById(id!),
    enabled: !!id,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrderHistory
// ---------------------------------------------------------------------------

/**
 * Fetches the full status change log for a single PO.
 */
export function usePurchaseOrderHistory(
  id: string | undefined,
  options?: Omit<UseQueryOptions<PurchaseOrderStatusHistory[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.history(id ?? ''),
    queryFn: () => purchaseOrderService.getHistory(id!),
    enabled: !!id,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// usePurchaseOrderStats (dashboard widget)
// ---------------------------------------------------------------------------

/**
 * Fetches status counts for the dashboard widget.
 * staleTime: 5 minutes — stats don't need to be real-time.
 */
export function usePurchaseOrderStats(
  options?: Omit<UseQueryOptions<PurchaseOrderStats>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.stats(),
    queryFn: () => purchaseOrderService.getStats(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

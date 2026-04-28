/**
 * TanStack Query v5 mutation hooks for the unified work order system.
 *
 * Cache invalidation strategy:
 *   - Create / delete: invalidate workOrders.all (affects list + stats)
 *   - Status / assign / comment updates: invalidate detail(id) + lists
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import workOrderService from '@/services/work-order.service';
import { queryKeys } from '@/lib/queryKeys';
import type { CreateWorkOrderDto, UpdateWorkOrderDto } from '@/types/work-order.types';

// ---------------------------------------------------------------------------
// useCreateWorkOrder
// ---------------------------------------------------------------------------

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWorkOrderDto) => workOrderService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateWorkOrder
// ---------------------------------------------------------------------------

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkOrderDto }) =>
      workOrderService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateWorkOrderStatus
// ---------------------------------------------------------------------------

export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      workOrderService.updateStatus(id, status, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useAssignWorkOrder
// ---------------------------------------------------------------------------

export function useAssignWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string | null }) =>
      workOrderService.assign(id, assignedToId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useAddWorkOrderComment
// ---------------------------------------------------------------------------

export function useAddWorkOrderComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body, isInternal }: { id: string; body: string; isInternal?: boolean }) =>
      workOrderService.addComment(id, body, isInternal ?? false),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useDeleteWorkOrder
// ---------------------------------------------------------------------------

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => workOrderService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
  });
}

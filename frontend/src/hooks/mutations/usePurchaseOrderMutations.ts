/**
 * TanStack Query v5 mutation hooks for the Purchase Orders workflow.
 *
 * Cache invalidation strategy:
 *   - Any mutation that changes the list result: invalidate purchaseOrders.all
 *   - Mutations that only update one record's detail: also invalidate detail(id)
 *   - Workflow actions (approve/reject/etc.): invalidate both list and detail
 *   - Stats invalidated on list changes (because stats are derived from the list)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import purchaseOrderService from '@/services/purchaseOrder.service';
import { queryKeys } from '@/lib/queryKeys';
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ApprovePOInput,
  RejectPOInput,
  AssignAccountCodeInput,
  IssuePOInput,
} from '@/types/purchaseOrder.types';

// ---------------------------------------------------------------------------
// useCreatePurchaseOrder
// ---------------------------------------------------------------------------

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseOrderInput) =>
      purchaseOrderService.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdatePurchaseOrder
// ---------------------------------------------------------------------------

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePurchaseOrderInput }) =>
      purchaseOrderService.update(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useDeletePurchaseOrder
// ---------------------------------------------------------------------------

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useSubmitPurchaseOrder
// ---------------------------------------------------------------------------

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.submit(id),

    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useApprovePurchaseOrder
// ---------------------------------------------------------------------------

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: ApprovePOInput }) =>
      purchaseOrderService.approve(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useRejectPurchaseOrder
// ---------------------------------------------------------------------------

export function useRejectPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RejectPOInput }) =>
      purchaseOrderService.reject(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useAssignAccountCode
// ---------------------------------------------------------------------------

export function useAssignAccountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignAccountCodeInput }) =>
      purchaseOrderService.assignAccountCode(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useIssuePurchaseOrder
// ---------------------------------------------------------------------------

export function useIssuePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IssuePOInput }) =>
      purchaseOrderService.issue(id, data),

    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// useDownloadPOPdf
// ---------------------------------------------------------------------------

export function useDownloadPOPdf() {
  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.downloadPdf(id),
  });
}

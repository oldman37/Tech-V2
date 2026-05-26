import { useMutation, useQueryClient } from '@tanstack/react-query';
import inventoryAuditService from '@/services/inventoryAudit.service';
import {
  StartAuditSessionRequest,
  CompleteSessionRequest,
  UpdateAuditItemRequest,
  BulkUpdateAuditItemsRequest,
  ResolveAuditItemRequest,
  AddEquipmentToSessionRequest,
} from '@/types/inventoryAudit.types';
import { queryKeys } from '@/lib/queryKeys';

export function useStartAuditSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartAuditSessionRequest) =>
      inventoryAuditService.startSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.sessions() });
    },
  });
}

export function useCompleteAuditSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data?: CompleteSessionRequest;
    }) => inventoryAuditService.completeSession(sessionId, data),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.sessions() });
    },
  });
}

export function useAbandonAuditSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => inventoryAuditService.abandonSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.sessions() });
    },
  });
}

export function useUpdateAuditItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      itemId,
      data,
    }: {
      sessionId: string;
      itemId: string;
      data: UpdateAuditItemRequest;
    }) => inventoryAuditService.updateItem(sessionId, itemId, data),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.session(sessionId) });
    },
  });
}

export function useBulkUpdateAuditItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data: BulkUpdateAuditItemsRequest;
    }) => inventoryAuditService.bulkUpdateItems(sessionId, data),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.session(sessionId) });
    },
  });
}

export function useResolveAuditItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: ResolveAuditItemRequest;
    }) => inventoryAuditService.resolveItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.all });
    },
  });
}

export function useAddEquipmentToAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data: AddEquipmentToSessionRequest;
    }) => inventoryAuditService.addEquipmentToSession(sessionId, data),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.inventoryAudit.session(sessionId),
      });
    },
  });
}

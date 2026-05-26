import { useMutation, useQueryClient } from '@tanstack/react-query';
import inventoryAuditService from '@/services/inventoryAudit.service';
import {
  StartAuditSessionRequest,
  CompleteSessionRequest,
  UpdateAuditItemRequest,
  BulkUpdateAuditItemsRequest,
  ResolveAuditItemRequest,
  AddEquipmentToSessionRequest,
  StartFiscalYearAuditRequest,
  CompleteLocationRequest,
  CloseFiscalYearAuditRequest,
} from '@/types/inventoryAudit.types';
import { queryKeys } from '@/lib/queryKeys';

export function useStartAuditSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartAuditSessionRequest) =>
      inventoryAuditService.startSession(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.sessions() });
      // Use a 3-element prefix so all FY variants for this location are invalidated.
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.inventoryAudit.all, 'roomStatuses', variables.officeLocationId],
        exact: false,
      });
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
      // Abandoning a room frees it up — invalidate all room status cache entries.
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.inventoryAudit.all, 'roomStatuses'],
        exact: false,
      });
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

export function useStartFiscalYearAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StartFiscalYearAuditRequest) =>
      inventoryAuditService.startFiscalYearAudit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.fiscalYearAudits() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.activeFiscalYearAudit() });
    },
  });
}

export function useCompleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ auditId, data }: { auditId: string; data: CompleteLocationRequest }) =>
      inventoryAuditService.completeLocation(auditId, data),
    onSuccess: (_, { auditId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.fiscalYearAudit(auditId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.activeFiscalYearAudit() });
    },
  });
}

export function useCloseFiscalYearAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ auditId, data }: { auditId: string; data?: CloseFiscalYearAuditRequest }) =>
      inventoryAuditService.closeFiscalYearAudit(auditId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.fiscalYearAudits() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAudit.activeFiscalYearAudit() });
    },
  });
}

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import inventoryAuditService from '@/services/inventoryAudit.service';
import {
  AuditSession,
  AuditSessionsResponse,
  UnresolvedItemsResponse,
  CheckRecentResponse,
  AuditSessionFilters,
  UnresolvedFilters,
  EquipmentLookupResult,
  RoomStatusMap,
} from '@/types/inventoryAudit.types';
import { queryKeys } from '@/lib/queryKeys';

export function useAuditSessions(
  filters: AuditSessionFilters = {},
  options?: Omit<UseQueryOptions<AuditSessionsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.sessionList(filters as Record<string, unknown>),
    queryFn: () => inventoryAuditService.getSessions(filters),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAuditSession(
  sessionId: string,
  options?: Omit<UseQueryOptions<AuditSession>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.session(sessionId),
    queryFn: () => inventoryAuditService.getSession(sessionId),
    enabled: !!sessionId,
    ...options,
  });
}

export function useUnresolvedItems(
  filters: UnresolvedFilters = {},
  options?: Omit<UseQueryOptions<UnresolvedItemsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.unresolved(filters as Record<string, unknown>),
    queryFn: () => inventoryAuditService.getUnresolved(filters),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useCheckRecent(
  roomId: string,
  withinHours = 24,
  options?: Omit<UseQueryOptions<CheckRecentResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...queryKeys.inventoryAudit.checkRecent(roomId), withinHours],
    queryFn: () => inventoryAuditService.checkRecent(roomId, withinHours),
    enabled: !!roomId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useEquipmentLookup(
  sessionId: string,
  assetTag: string,
  options?: Omit<UseQueryOptions<EquipmentLookupResult>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.equipmentLookup(sessionId, assetTag),
    queryFn: () => inventoryAuditService.lookupEquipment(sessionId, assetTag),
    enabled: !!sessionId && assetTag.trim().length > 0,
    staleTime: 0,
    retry: false,
    ...options,
  });
}

export function useRoomStatuses(
  officeLocationId: string | null,
  fiscalYear?: string | null,
  options?: Omit<UseQueryOptions<RoomStatusMap>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.roomStatuses(officeLocationId, fiscalYear),
    queryFn: () => inventoryAuditService.getRoomStatuses(officeLocationId!, fiscalYear),
    enabled: !!officeLocationId,
    staleTime: 30_000,
    ...options,
  });
}

export function useFiscalYearAudits() {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.fiscalYearAudits(),
    queryFn: () => inventoryAuditService.getFiscalYearAudits(),
  });
}

export function useActiveFiscalYearAudit() {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.activeFiscalYearAudit(),
    queryFn: () => inventoryAuditService.getActiveFiscalYearAudit(),
    staleTime: 60_000,
  });
}

export function useFiscalYearAudit(auditId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventoryAudit.fiscalYearAudit(auditId ?? ''),
    queryFn: () => inventoryAuditService.getFiscalYearAudit(auditId!),
    enabled: !!auditId,
  });
}

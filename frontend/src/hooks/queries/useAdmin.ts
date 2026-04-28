import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { adminService, SyncStatus } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching sync status
 * Polls more frequently due to changing nature
 */
export function useSyncStatus(
  options?: Omit<UseQueryOptions<SyncStatus | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.admin.syncStatus(),
    queryFn: () => adminService.getSyncStatus().catch(() => null),
    
    // Sync status changes frequently, shorter cache
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
    
    // Ignore errors - sync status is not critical
    retry: 1,
    ...options,
  });
}

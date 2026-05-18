import { useQuery } from '@tanstack/react-query';
import { emailQueueAdminService, type EmailQueueListParams } from '@/services/emailQueueAdminService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching paginated email queue list
 */
export function useEmailQueueList(params?: EmailQueueListParams) {
  const hasActiveFilter = params?.status === 'pending' || params?.status === 'processing';

  return useQuery({
    queryKey: queryKeys.admin.emailQueueList(params as Record<string, unknown>),
    queryFn: () => emailQueueAdminService.getList(params),
    // Auto-refresh every 15s when viewing pending/processing
    refetchInterval: hasActiveFilter ? 15_000 : false,
  });
}

/**
 * Hook for fetching email queue stats (counts by status)
 */
export function useEmailQueueStats() {
  return useQuery({
    queryKey: queryKeys.admin.emailQueueStats(),
    queryFn: () => emailQueueAdminService.getStats(),
    staleTime: 10_000,
  });
}

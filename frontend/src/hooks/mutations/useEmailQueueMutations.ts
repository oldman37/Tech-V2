import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailQueueAdminService } from '@/services/emailQueueAdminService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for retrying a single failed email
 */
export function useRetryEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => emailQueueAdminService.retryEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.emailQueue() });
    },
  });
}

/**
 * Mutation for retrying all failed emails
 */
export function useRetryAllFailed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => emailQueueAdminService.retryAllFailed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.emailQueue() });
    },
  });
}

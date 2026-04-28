import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supervisorService } from '@/services/supervisorService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for adding a supervisor to a user
 */
export function useAddUserSupervisor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, supervisorId }: { userId: string; supervisorId: string }) =>
      supervisorService.addSupervisor(userId, { supervisorId }),

    onSuccess: (_, { userId }) => {
      // Invalidate user supervisors query
      queryClient.invalidateQueries({
        queryKey: queryKeys.supervisors.userSupervisors(userId),
      });
      
      // Also invalidate user details if cached
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.detail(userId),
      });
    },

    onError: (error: Error) => {
      console.error('Failed to add supervisor:', error);
    },
  });
}

/**
 * Mutation for removing a supervisor from a user
 */
export function useRemoveUserSupervisor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, supervisorId }: { userId: string; supervisorId: string }) =>
      supervisorService.removeSupervisor(userId, supervisorId),

    onSuccess: (_, { userId }) => {
      // Invalidate user supervisors query
      queryClient.invalidateQueries({
        queryKey: queryKeys.supervisors.userSupervisors(userId),
      });
      
      // Also invalidate user details if cached
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.detail(userId),
      });
    },

    onError: (error: Error) => {
      console.error('Failed to remove supervisor:', error);
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/userService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for updating user role
 * 
 * Features:
 * - Optimistic updates
 * - Automatic cache invalidation
 * - Error rollback
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      userService.updateUserRole(userId, role),

    // Optimistic update: Update UI before server responds
    onMutate: async ({ userId, role }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.users.lists() 
      });

      // Snapshot previous value for rollback
      const previousUsers = queryClient.getQueriesData({
        queryKey: queryKeys.users.lists()
      });

      // Optimistically update cache
      queryClient.setQueriesData(
        { queryKey: queryKeys.users.lists() },
        (old: any) => {
          if (!old?.users) return old;
          return {
            ...old,
            users: old.users.map((user: any) =>
              user.id === userId ? { ...user, role } : user
            ),
          };
        }
      );

      // Return context for rollback
      return { previousUsers };
    },

    // On error: Rollback optimistic update
    onError: (err, _, context) => {
      if (context?.previousUsers) {
        context.previousUsers.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Failed to update role:', err);
    },

    // On success: Invalidate related queries
    onSuccess: (_, { userId }) => {
      // Invalidate user lists to refetch with new data
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.lists() 
      });

      // Invalidate specific user detail
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.detail(userId) 
      });
    },
  });
}

/**
 * Mutation for toggling user active status
 */
export function useToggleUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      userService.toggleUserStatus(userId),

    // Optimistic update
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.users.lists() 
      });

      const previousUsers = queryClient.getQueriesData({
        queryKey: queryKeys.users.lists()
      });

      queryClient.setQueriesData(
        { queryKey: queryKeys.users.lists() },
        (old: any) => {
          if (!old?.users) return old;
          return {
            ...old,
            users: old.users.map((user: any) =>
              user.id === userId ? { ...user, isActive: !user.isActive } : user
            ),
          };
        }
      );

      return { previousUsers };
    },

    onError: (err, _, context) => {
      if (context?.previousUsers) {
        context.previousUsers.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Failed to toggle user status:', err);
    },

    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.lists() 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.detail(userId) 
      });
    },
  });
}

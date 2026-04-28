import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for syncing all users from Azure AD
 * Long-running operation
 */
export function useSyncAllUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.syncAllUsers(),

    onSuccess: (data) => {
      // Invalidate all user-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.all,
      });

      // Refresh sync status
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.syncStatus(),
      });

      console.log('Sync completed:', data.message);
    },

    onError: (error: Error) => {
      console.error('Sync failed:', error);
    },
  });
}

/**
 * Mutation for syncing staff users
 */
export function useSyncStaffUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.syncStaffUsers(),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.syncStatus(),
      });
      console.log('Staff sync completed:', data.message);
    },

    onError: (error: Error) => {
      console.error('Staff sync failed:', error);
    },
  });
}

/**
 * Mutation for syncing student users
 */
export function useSyncStudentUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.syncStudentUsers(),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.syncStatus(),
      });
      console.log('Student sync completed:', data.message);
    },

    onError: (error: Error) => {
      console.error('Student sync failed:', error);
    },
  });
}

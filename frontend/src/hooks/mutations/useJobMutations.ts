import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';
import type { UpdateSchedulePayload } from '@/services/adminService';

export function useSyncLocations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.syncLocations(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
    },
  });
}

export function useSyncSupervisors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.syncSupervisors(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobKey, payload }: { jobKey: string; payload: UpdateSchedulePayload }) =>
      adminService.updateJobSchedule(jobKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
    },
  });
}

export function useRunJobNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobKey: string) => adminService.runJobNow(jobKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    },
  });
}

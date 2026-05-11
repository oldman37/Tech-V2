import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

export function useJobSchedules() {
  return useQuery({
    queryKey: queryKeys.admin.jobSchedules(),
    queryFn: () => adminService.getJobSchedules(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    select: (data) => data.schedules,
  });
}

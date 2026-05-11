import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

export function useJobStatus() {
  return useQuery({
    queryKey: queryKeys.admin.jobStatus(),
    queryFn: () => adminService.getJobStatus(),
    staleTime: 30_000,
  });
}

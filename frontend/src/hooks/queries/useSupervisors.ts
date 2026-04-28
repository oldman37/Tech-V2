import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { supervisorService, Supervisor, PotentialSupervisor } from '@/services/supervisorService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching user supervisors
 */
export function useUserSupervisors(
  userId: string,
  options?: Omit<UseQueryOptions<Supervisor[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.supervisors.userSupervisors(userId),
    queryFn: () => supervisorService.getUserSupervisors(userId),
    enabled: !!userId,
    staleTime: 1 * 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Hook for searching supervisors
 */
export function useSearchSupervisors(
  userId: string,
  searchQuery: string,
  options?: Omit<UseQueryOptions<PotentialSupervisor[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.supervisors.search(userId, searchQuery),
    queryFn: () => supervisorService.searchPotentialSupervisors(userId, searchQuery),
    enabled: !!userId && searchQuery.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import locationService from '@/services/location.service';
import { OfficeLocationWithSupervisors } from '@/types/location.types';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook for fetching all locations with supervisors
 */
export function useLocations(
  options?: Omit<
    UseQueryOptions<OfficeLocationWithSupervisors[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: () => locationService.getAllLocations(),
    
    // Locations change infrequently, cache for 2 minutes
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook for fetching single location detail
 */
export function useLocation(
  locationId: string,
  options?: Omit<
    UseQueryOptions<OfficeLocationWithSupervisors>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.locations.detail(locationId),
    queryFn: () => locationService.getLocation(locationId),
    enabled: !!locationId,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

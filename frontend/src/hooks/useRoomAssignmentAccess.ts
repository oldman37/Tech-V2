import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import locationService from '@/services/location.service';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Determines whether the current user can access the Room Assignments feature.
 *
 * Access is granted if:
 * - The user is a System Admin (role = 'ADMIN'), OR
 * - The user is the primary supervisor of at least one office location
 */
export function useRoomAssignmentAccess() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;

  const { data: supervisedLocations = [], isLoading } = useQuery({
    queryKey: queryKeys.locations.supervisedByMe(),
    queryFn: () => locationService.getUserSupervisedLocations(user?.id ?? ''),
    enabled: !!user?.id && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const primarySupervisorLocationIds = supervisedLocations
    .filter((sl) => sl.isPrimary)
    .map((sl) => sl.locationId);

  const isPrimarySupervisor = primarySupervisorLocationIds.length > 0;
  const canAccess = isAdmin || isPrimarySupervisor;

  return {
    isAdmin,
    isPrimarySupervisor,
    primarySupervisorLocationIds,
    canAccess,
    isLoading: !isAdmin && isLoading,
  };
}

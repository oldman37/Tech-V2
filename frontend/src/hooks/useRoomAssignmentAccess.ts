import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import locationService from '@/services/location.service';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Determines whether the current user can access the Room Assignments feature.
 *
 * Access is granted if:
 * - The user is a System Admin (role = 'ADMIN'), OR
 * - The user is in the Principals or Vice Principals Entra group, OR
 * - The user is the primary supervisor of at least one office location
 */
export function useRoomAssignmentAccess() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;

  // Principals and Vice Principals get access to room assignments for their locations
  const principalsGroupId = import.meta.env.VITE_ENTRA_PRINCIPALS_GROUP_ID;
  const vicePrincipalsGroupId = import.meta.env.VITE_ENTRA_VICE_PRINCIPALS_GROUP_ID;
  const isPrincipalOrVP = !!(
    (principalsGroupId && user?.groups?.includes(principalsGroupId)) ||
    (vicePrincipalsGroupId && user?.groups?.includes(vicePrincipalsGroupId))
  );

  // Principals/VPs still query their supervised locations to auto-select
  const skipQuery = isAdmin;

  const { data: supervisedLocations = [], isLoading } = useQuery({
    queryKey: queryKeys.locations.supervisedByMe(),
    queryFn: () => locationService.getUserSupervisedLocations(user?.id ?? ''),
    enabled: !!user?.id && !skipQuery,
    staleTime: 5 * 60 * 1000,
  });

  const primarySupervisorLocationIds = supervisedLocations
    .filter((sl) => sl.isPrimary)
    .map((sl) => sl.locationId);

  const isPrimarySupervisor = primarySupervisorLocationIds.length > 0;
  const canAccess = isAdmin || isPrincipalOrVP || isPrimarySupervisor;

  return {
    isAdmin,
    isPrincipalOrVP,
    isPrimarySupervisor,
    primarySupervisorLocationIds,
    canAccess,
    isLoading: !skipQuery && isLoading,
  };
}

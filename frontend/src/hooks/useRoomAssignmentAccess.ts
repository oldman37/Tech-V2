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
 * - The user is the primary supervisor of at least one office location, OR
 * - The user is a Technology Assistant assigned to at least one office location
 */
export function useRoomAssignmentAccess() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;

  // Backend-computed flags — no group IDs needed on the frontend
  const isPrincipalOrVP = user?.isPrincipalOrVP ?? false;
  const isTechAssistant = user?.isTechAssistant ?? false;

  // Principals/VPs and Technology Assistants still query their supervised
  // locations to auto-select
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

  // A school can have more than one assigned Technology Assistant, so unlike
  // primary-supervisor scoping this does not filter on isPrimary.
  const techAssistantLocations = supervisedLocations.filter(
    (sl) => sl.supervisorType === 'TECHNOLOGY_ASSISTANT'
  );

  const isPrimarySupervisor = primarySupervisorLocationIds.length > 0;
  const canAccess =
    isAdmin ||
    isPrincipalOrVP ||
    isPrimarySupervisor ||
    (isTechAssistant && techAssistantLocations.length > 0);

  return {
    isAdmin,
    isPrincipalOrVP,
    isPrimarySupervisor,
    primarySupervisorLocationIds,
    isTechAssistant,
    techAssistantLocations,
    canAccess,
    isLoading: !skipQuery && isLoading,
  };
}

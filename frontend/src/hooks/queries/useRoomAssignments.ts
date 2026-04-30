import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { userRoomAssignmentService } from '@/services/userRoomAssignmentService';
import { queryKeys } from '@/lib/queryKeys';
import { LocationRoomAssignmentsParams } from '@/types/userRoomAssignment.types';

/**
 * Fetch all rooms for a location with their assigned users.
 */
export function useLocationRoomAssignments(
  locationId: string,
  params?: LocationRoomAssignmentsParams
) {
  return useQuery({
    queryKey: queryKeys.roomAssignments.byLocation(locationId),
    queryFn: () =>
      userRoomAssignmentService.getLocationRoomAssignments(locationId, params),
    enabled: !!locationId,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetch assignments for a single room.
 */
export function useRoomAssignments(roomId: string) {
  return useQuery({
    queryKey: queryKeys.roomAssignments.byRoom(roomId),
    queryFn: () => userRoomAssignmentService.getRoomAssignments(roomId),
    enabled: !!roomId,
    staleTime: 60 * 1000,
  });
}

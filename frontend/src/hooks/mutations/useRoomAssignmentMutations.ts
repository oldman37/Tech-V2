import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userRoomAssignmentService } from '@/services/userRoomAssignmentService';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Assign multiple users to a room.
 * On success, invalidates the location's room-assignment query.
 */
export function useAssignUsersToRoom(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      userIds,
      notes,
    }: {
      roomId: string;
      userIds: string[];
      notes?: string;
    }) =>
      userRoomAssignmentService.assignUsersToRoom(
        roomId,
        userIds,
        locationId,
        notes
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roomAssignments.byLocation(locationId),
      });
    },
  });
}

/**
 * Set or clear the primary room for a user. Admin only.
 * On success, invalidates the location and user room-assignment queries.
 */
export function useSetPrimaryRoom(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      roomId,
    }: {
      userId: string;
      roomId: string | null;
    }) => userRoomAssignmentService.setPrimaryRoom(userId, roomId),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roomAssignments.byLocation(locationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.roomAssignments.byUser(userId),
      });
    },
  });
}

/**
 * Remove a user from a room.
 * On success, invalidates the location's room-assignment query.
 */
export function useUnassignUserFromRoom(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      userId,
    }: {
      roomId: string;
      userId: string;
    }) =>
      userRoomAssignmentService.unassignUserFromRoom(roomId, userId, locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roomAssignments.byLocation(locationId),
      });
    },
  });
}

import { api } from './api';
import {
  LocationRoomAssignmentsResponse,
  AssignUsersResponse,
  RoomWithAssignments,
  LocationRoomAssignmentsParams,
} from '../types/userRoomAssignment.types';

/**
 * User-to-Room Assignment Service
 * All POST/DELETE requests rely on the CSRF token automatically injected
 * by the api axios interceptor (reads the in-memory csrfToken cache).
 */
export const userRoomAssignmentService = {
  /**
   * Get all rooms in a location with their assigned users.
   * GET /api/room-assignments/location/:locationId
   */
  getLocationRoomAssignments: async (
    locationId: string,
    params?: LocationRoomAssignmentsParams
  ): Promise<LocationRoomAssignmentsResponse> => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.includeInactive) qs.set('includeInactive', 'true');
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const response = await api.get<LocationRoomAssignmentsResponse>(
      `/room-assignments/location/${locationId}${query}`
    );
    return response.data;
  },

  /**
   * Get all users assigned to a specific room.
   * GET /api/room-assignments/room/:roomId
   */
  getRoomAssignments: async (roomId: string): Promise<RoomWithAssignments> => {
    const response = await api.get<RoomWithAssignments>(
      `/room-assignments/room/${roomId}`
    );
    return response.data;
  },

  /**
   * Assign one or more users to a room.
   * POST /api/room-assignments/room/:roomId/assign
   * CSRF token is injected automatically by the axios interceptor.
   */
  assignUsersToRoom: async (
    roomId: string,
    userIds: string[],
    locationId: string,
    notes?: string
  ): Promise<AssignUsersResponse> => {
    const response = await api.post<AssignUsersResponse>(
      `/room-assignments/room/${roomId}/assign`,
      { userIds, locationId, notes }
    );
    return response.data;
  },

  /**
   * Unassign a user from a room.
   * DELETE /api/room-assignments/room/:roomId/user/:userId
   * CSRF token is injected automatically by the axios interceptor.
   */
  unassignUserFromRoom: async (
    roomId: string,
    userId: string,
    locationId: string
  ): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(
      `/room-assignments/room/${roomId}/user/${userId}`,
      { params: { locationId } }
    );
    return response.data;
  },

  /**
   * Get all room assignments for a user (admin only).
   * GET /api/room-assignments/user/:userId
   */
  getUserRoomAssignments: async (userId: string) => {
    const response = await api.get(`/room-assignments/user/${userId}`);
    return response.data;
  },

  /**
   * Set or clear the primary room for a user. Admin only.
   * PUT /api/room-assignments/user/:userId/primary-room
   */
  setPrimaryRoom: async (
    userId: string,
    roomId: string | null
  ): Promise<void> => {
    await api.put(`/room-assignments/user/${userId}/primary-room`, { roomId });
  },
};

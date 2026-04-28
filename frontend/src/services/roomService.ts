import { api } from './api';
import {
  RoomWithLocation,
  CreateRoomRequest,
  UpdateRoomRequest,
  RoomsResponse,
  RoomsByLocationResponse,
  RoomQueryParams,
} from '../types/room.types';

/**
 * Room Service
 * Handles all room-related API calls
 */

export const roomService = {
  /**
   * Get all rooms with optional filters and pagination
   * Enhanced with pagination support for improved performance
   */
  getRooms: async (params?: RoomQueryParams): Promise<RoomsResponse> => {
    const queryParams = new URLSearchParams();
    
    // Pagination params
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    // Filter params
    if (params?.locationId) queryParams.append('locationId', params.locationId);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    // Sorting params
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await api.get<RoomsResponse>(`/rooms?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get rooms for a specific location
   */
  getRoomsByLocation: async (locationId: string, isActive?: boolean): Promise<RoomsByLocationResponse> => {
    const queryParams = new URLSearchParams();
    if (isActive !== undefined) queryParams.append('isActive', isActive.toString());

    const response = await api.get<RoomsByLocationResponse>(
      `/locations/${locationId}/rooms?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Get a specific room by ID
   */
  getRoom: async (id: string): Promise<RoomWithLocation> => {
    const response = await api.get<RoomWithLocation>(`/rooms/${id}`);
    return response.data;
  },

  /**
   * Create a new room
   */
  createRoom: async (data: CreateRoomRequest): Promise<RoomWithLocation> => {
    const response = await api.post<RoomWithLocation>('/rooms', data);
    return response.data;
  },

  /**
   * Update an existing room
   */
  updateRoom: async (id: string, data: UpdateRoomRequest): Promise<RoomWithLocation> => {
    const response = await api.put<RoomWithLocation>(`/rooms/${id}`, data);
    return response.data;
  },

  /**
   * Delete a room (soft delete by default)
   */
  deleteRoom: async (id: string, permanent: boolean = false): Promise<{ message: string }> => {
    const queryParams = permanent ? '?permanent=true' : '';
    const response = await api.delete<{ message: string }>(`/rooms/${id}${queryParams}`);
    return response.data;
  },

  /**
   * Get room statistics
   */
  getRoomStats: async (): Promise<{
    totalRooms: number;
    roomsByType: Array<{ type: string | null; _count: number }>;
    roomsByLocation: Array<{
      id: string;
      name: string;
      _count: { rooms: number };
    }>;
  }> => {
    const response = await api.get('/rooms/stats');
    return response.data;
  },
};

export default roomService;

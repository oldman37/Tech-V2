import { useQuery, keepPreviousData } from '@tanstack/react-query';
import roomService from '@/services/roomService';
import { queryKeys } from '@/lib/queryKeys';
import { RoomQueryParams, Room } from '@/types/room.types';

/**
 * Hook for fetching paginated rooms with filters
 * Follows pattern from useUsers.ts for consistency
 * 
 * Features:
 * - Automatic caching with React Query
 * - Keep previous data while fetching (smooth page transitions)
 * - Type-safe parameters and results
 * - Automatic refetching on parameter changes
 * 
 * @param params - Query parameters for filtering and pagination
 */
export function usePaginatedRooms(params?: RoomQueryParams) {
  return useQuery({
    queryKey: queryKeys.rooms.list(params),
    queryFn: () => roomService.getRooms(params),
    
    // Keep previous page data while loading next page
    // Prevents content flash and improves UX
    placeholderData: keepPreviousData,
    
    // Stale time: 2 minutes (rooms don't change frequently)
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook with convenience flags for pagination controls
 * Provides hasNextPage, hasPreviousPage, and placeholder data flag
 * 
 * @param params - Query parameters for filtering and pagination
 */
export function useRoomsWithPagination(params?: RoomQueryParams) {
  const query = usePaginatedRooms(params);
  
  return {
    ...query,
    // Convenience properties for pagination controls
    hasNextPage: (query.data?.pagination.page ?? 0) < (query.data?.pagination.totalPages ?? 0),
    hasPreviousPage: (query.data?.pagination.page ?? 1) > 1,
    isPlaceholderData: query.isPlaceholderData,
  };
}

/**
 * Hook for fetching single room by ID
 * 
 * @param roomId - Room ID to fetch
 */
export function useRoom(roomId: string) {
  return useQuery({
    queryKey: queryKeys.rooms.detail(roomId),
    queryFn: () => roomService.getRoom(roomId),
    enabled: !!roomId, // Only fetch if roomId exists
  });
}

/**
 * Hook for fetching rooms filtered to a specific location.
 * Used for location → room cascading dropdowns (e.g. NewWorkOrderPage).
 *
 * @param locationId - Only fetch when a location is selected
 */
export function useRoomsByLocation(locationId: string): { rooms: Room[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: [...queryKeys.rooms.lists(), { locationId }] as const,
    queryFn: () => roomService.getRoomsByLocation(locationId),
    enabled: !!locationId,
    staleTime: 2 * 60 * 1000,
  });
  return { rooms: query.data?.rooms ?? [], isLoading: query.isLoading };
}

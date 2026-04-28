import { useQuery } from '@tanstack/react-query';
import { userService } from '@/services/userService';
import { queryKeys } from '@/lib/queryKeys';

interface UserDefaultLocation {
  officeLocationId: string | null;
  roomId: string | null;
}

/**
 * Resolves the current user's default officeLocationId + roomId
 * for form pre-population.
 *
 * Priority:
 *   1. primaryRoom → room.locationId + room.id
 *   2. /users/me/office-location → resolved OfficeLocation.id (no room)
 *   3. null / null
 */
export function useUserDefaultLocation(): {
  data: UserDefaultLocation | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.users.defaultLocation(),
    queryFn: async (): Promise<UserDefaultLocation> => {
      const me = await userService.getMe();

      if (me.primaryRoom?.locationId && me.primaryRoom?.id) {
        return {
          officeLocationId: me.primaryRoom.locationId,
          roomId: me.primaryRoom.id,
        };
      }

      // Fallback: resolve officeLocation string → OfficeLocation record
      try {
        const resolved = await userService.getMyOfficeLocation();
        if (resolved?.id) {
          return { officeLocationId: resolved.id, roomId: null };
        }
      } catch {
        // 204 or error — no office location resolved
      }

      return { officeLocationId: null, roomId: null };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return { data: query.data ?? null, isLoading: query.isLoading };
}

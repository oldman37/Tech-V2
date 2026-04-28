import { useAuthStore } from '@/store/authStore';

export interface RequisitionsPermResult {
  permLevel: number;       // 0 = unauthenticated, 1–6 = REQUISITIONS level
  isLoading: boolean;
  isAdmin: boolean;
}

/**
 * Returns the current user's REQUISITIONS permission level.
 * Reads from permLevels included in the login response — no API call needed.
 */
export function useRequisitionsPermLevel(): RequisitionsPermResult {
  const { user } = useAuthStore();
  if (!user) {
    return { permLevel: 0, isLoading: false, isAdmin: false };
  }
  const isAdmin = !!(user.roles?.includes('ADMIN'));
  const permLevel = isAdmin ? 6 : (user.permLevels?.REQUISITIONS ?? 0);
  return { permLevel, isLoading: false, isAdmin };
}

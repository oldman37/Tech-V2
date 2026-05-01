import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  entraId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  groups: string[];
  roles?: string[];
  hasBaseAccess?: boolean;
  permLevels?: {
    TECHNOLOGY: number;
    MAINTENANCE: number;
    REQUISITIONS: number;
    FIELD_TRIPS: number;
    isFinanceDirectorApprover: boolean;
    isStrictFinanceDirector: boolean;
    isDosApprover: boolean;
    isPoEntryUser: boolean;
    isFoodServiceSupervisor: boolean;
    isFoodServicePoEntry: boolean;
    isTransportationSecretary: boolean;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      clearAuth: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),

      setLoading: (loading) =>
        set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // Tokens are in HttpOnly cookies, not stored in state
      }),
    }
  )
);

// No localStorage token sync needed - tokens are in HttpOnly cookies

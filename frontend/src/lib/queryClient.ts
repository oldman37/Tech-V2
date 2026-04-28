import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

/**
 * Global QueryClient instance with optimized defaults
 * 
 * Configuration Philosophy:
 * - Aggressive caching for better UX (5min cache)
 * - Moderate staleness for balance (30s)
 * - Automatic refetch on focus/reconnect
 * - Centralized error handling
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale Time: Data considered fresh for 30 seconds
      // Background refetch only happens after this
      staleTime: 30 * 1000, // 30 seconds

      // Cache Time (gcTime in v5): Keep unused data for 5 minutes
      // Data removed after this period of inactivity
      gcTime: 5 * 60 * 1000, // 5 minutes

      // Retry failed queries 3 times with exponential backoff
      // Never retry 403 (Forbidden) — these are permission errors, not transient
      retry: (failureCount, error) => {
        if ((error as any)?.response?.status === 403) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus (user returns to tab)
      refetchOnWindowFocus: true,

      // Refetch when network reconnects
      refetchOnReconnect: true,

      // Don't refetch on component mount if data is fresh
      refetchOnMount: true,

      // Type-safe error handling
      throwOnError: false,

      // Enable structural sharing for better performance
      structuralSharing: true,
    },
    mutations: {
      // Retry mutations only once (user-initiated actions)
      retry: 1,

      // Throw on error for mutations (explicit error handling)
      throwOnError: false,
    },
  },

  // Global Query Cache for centralized handling
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error(`Query Error [${query.queryKey.join(', ')}]:`, error);
      
      // Could add global toast notification here
      // toast.error(`Failed to load data: ${error.message}`);
    },
    onSuccess: (_, query) => {
      console.log(`Query Success [${query.queryKey.join(', ')}]`);
    },
  }),

  // Global Mutation Cache
  mutationCache: new MutationCache({
    onError: (error) => {
      console.error('Mutation Error:', error);
      // toast.error(`Action failed: ${error.message}`);
    },
    onSuccess: () => {
      console.log('Mutation Success');
      // toast.success('Action completed successfully');
    },
  }),
});

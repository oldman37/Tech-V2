import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getRequestBadgeCounts, markRequestSectionVisited } from '@/services/requestBadges.service';
import type { RequestSection } from '@/types/requestBadges.types';

/**
 * Requests-nav badge counts. Polls in the background and refetches on window
 * focus — the latter is what actually addresses "I stepped away and missed it".
 */
export function useRequestBadges() {
  return useQuery({
    queryKey: queryKeys.requestBadges.all,
    queryFn: getRequestBadgeCounts,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Marks a Requests-nav section visited, clearing its badge. */
export function useMarkSectionVisited() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (section: RequestSection) => markRequestSectionVisited(section),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requestBadges.all });
    },
  });
}

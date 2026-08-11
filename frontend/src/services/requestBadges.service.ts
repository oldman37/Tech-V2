/**
 * Requests-nav unread-count badges — count fetch and mark-visited.
 */

import { api } from './api';
import type { RequestBadgeCounts, RequestSection } from '../types/requestBadges.types';

export async function getRequestBadgeCounts(): Promise<RequestBadgeCounts> {
  const { data } = await api.get<RequestBadgeCounts>('/request-badges');
  return data;
}

export async function markRequestSectionVisited(section: RequestSection): Promise<void> {
  await api.post(`/request-badges/${section}/visited`);
}

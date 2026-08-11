/**
 * Request Badges Controller
 *
 * HTTP handlers for the Requests-nav unread-count badges. All routes require
 * authentication only — no requireModule gate, since every count is scoped
 * to the authenticated user's own data (see requestBadges.service.ts).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { handleControllerError } from '../utils/errorHandler';
import { getBadgeCounts, markSectionVisited } from '../services/requestBadges.service';
import { RequestSectionParamSchema } from '../validators/requestBadges.validators';

/**
 * GET /api/request-badges
 * Returns the unread-change count for each Requests-nav section, scoped to
 * the authenticated user.
 */
export const getRequestBadgeCounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId  = req.user!.id;
    const groups  = req.user!.groups ?? [];
    const isAdmin = req.user!.roles?.includes('ADMIN') ?? false;

    const counts = await getBadgeCounts(userId, groups, isAdmin);
    res.json(counts);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/request-badges/:section/visited
 * Marks a section visited now for the authenticated user, clearing its badge.
 */
export const markRequestSectionVisited = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { section } = RequestSectionParamSchema.parse(req.params);
    await markSectionVisited(req.user!.id, section);
    res.json({ section, count: 0 });
  } catch (error) {
    handleControllerError(error, res);
  }
};

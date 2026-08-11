/**
 * Request Badges Routes
 *
 * Read  : authenticate only — every count is scoped to the caller's own data.
 * Write : authenticate + validateCsrfToken (mark-visited is self-service).
 *
 * Mounted before inventoryAuditRoutes/roomCheckoutRoutes in app.ts —
 * see the comment there for why that ordering is load-bearing.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateCsrfToken } from '../middleware/csrf';
import * as requestBadgesController from '../controllers/requestBadges.controller';

const router = Router();

router.use(authenticate);

router.get('/', requestBadgesController.getRequestBadgeCounts);

router.post('/:section/visited', validateCsrfToken, requestBadgesController.markRequestSectionVisited);

export default router;

/**
 * Funding Source Routes
 *
 * All routes require authentication via the `authenticate` middleware.
 * Permission levels follow the pattern established for other TECHNOLOGY-module routes:
 *   - Read  : checkPermission('TECHNOLOGY', 1)
 *   - Write : checkPermission('TECHNOLOGY', 2)
 *   - Delete: checkPermission('TECHNOLOGY', 3)
 *   - Hard delete: requireAdmin (ADMIN role only)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  FundingSourceIdParamSchema,
  GetFundingSourcesQuerySchema,
  CreateFundingSourceSchema,
  UpdateFundingSourceSchema,
} from '../validators/fundingSource.validators';
import * as fundingSourceController from '../controllers/fundingSource.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply CSRF protection to all state-changing routes
router.use(validateCsrfToken);

// ---------------------------------------------------------------------------
// Read endpoints — TECHNOLOGY level 1+ (view)
// ---------------------------------------------------------------------------

router.get(
  '/',
  validateRequest(GetFundingSourcesQuerySchema, 'query'),
  requireModule('TECHNOLOGY', 1),
  fundingSourceController.getFundingSources,
);

router.get(
  '/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  requireModule('TECHNOLOGY', 1),
  fundingSourceController.getFundingSource,
);

// ---------------------------------------------------------------------------
// Write endpoints — TECHNOLOGY level 2+ (edit)
// ---------------------------------------------------------------------------

router.post(
  '/',
  validateRequest(CreateFundingSourceSchema, 'body'),
  requireModule('TECHNOLOGY', 2),
  fundingSourceController.createFundingSource,
);

router.put(
  '/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  validateRequest(UpdateFundingSourceSchema, 'body'),
  requireModule('TECHNOLOGY', 2),
  fundingSourceController.updateFundingSource,
);

// ---------------------------------------------------------------------------
// Delete endpoints
// ---------------------------------------------------------------------------

// Soft delete — TECHNOLOGY level 3+
router.delete(
  '/:id',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  requireModule('TECHNOLOGY', 3),
  fundingSourceController.deleteFundingSource,
);

// Hard (permanent) delete — ADMIN role only
router.delete(
  '/:id/hard',
  validateRequest(FundingSourceIdParamSchema, 'params'),
  requireAdmin,
  fundingSourceController.hardDeleteFundingSource,
);

export default router;

/**
 * Settings Routes
 *
 * All routes require authentication + admin role (requireAdmin from auth middleware).
 * CSRF protection applied to state-changing routes.
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { UpdateSettingsSchema, StartNewFiscalYearSchema } from '../validators/settings.validators';
import * as settingsController from '../controllers/settings.controller';

const router = Router();

// All settings routes require authentication
router.use(authenticate);

// Fiscal years list — accessible by all authenticated users (not admin-only)
router.get('/fiscal-years', settingsController.getDistinctFiscalYears);

// Work order fiscal years list — accessible by all authenticated users
router.get('/work-order-fiscal-years', settingsController.getDistinctWorkOrderFiscalYears);

// Current fiscal year info — accessible by all authenticated users
router.get('/current', settingsController.getCurrentSettings);

// Remaining routes require ADMIN role
router.use(requireAdmin);

/**
 * GET /api/settings
 * Returns the singleton system settings row.
 */
router.get('/', settingsController.getSettings);

/**
 * PUT /api/settings
 * Partial-update system settings.
 * All fields optional — only sent fields are updated.
 */
router.put(
  '/',
  validateCsrfToken,
  validateRequest(UpdateSettingsSchema, 'body'),
  settingsController.updateSettings,
);

/**
 * GET /api/settings/fiscal-year-summary
 * Returns current fiscal year state, in-progress PO counts, and suggested next year.
 */
router.get('/fiscal-year-summary', settingsController.getFiscalYearSummary);

/**
 * GET /api/settings/work-order-year-summary
 * Returns work order count by status/department for current fiscal year. Admin only.
 */
router.get('/work-order-year-summary', settingsController.getWorkOrderYearSummary);

/**
 * POST /api/settings/new-fiscal-year
 * Perform the fiscal year rollover (admin only).
 */
router.post(
  '/new-fiscal-year',
  validateCsrfToken,
  validateRequest(StartNewFiscalYearSchema, 'body'),
  settingsController.startNewFiscalYear,
);

export default router;

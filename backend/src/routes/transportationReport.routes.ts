/**
 * Transportation Report Routes
 * Mounted at /api/transportation/reports
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  MonthlyReportQuerySchema,
  DateRangeQuerySchema,
  SendReportBodySchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/transportationReport.controller';

const router = Router();

// GET /api/transportation/reports/monthly-fuel
router.get(
  '/monthly-fuel',
  authenticate,
  validateRequest(MonthlyReportQuerySchema, 'query'),
  requireModule('TRANSPORTATION', 2),
  controller.getMonthlyFuelReport,
);

// GET /api/transportation/reports/fuel-by-unit
router.get(
  '/fuel-by-unit',
  authenticate,
  validateRequest(DateRangeQuerySchema, 'query'),
  requireModule('TRANSPORTATION', 2),
  controller.getFuelByUnit,
);

// GET /api/transportation/reports/fuel-by-user
router.get(
  '/fuel-by-user',
  authenticate,
  validateRequest(DateRangeQuerySchema, 'query'),
  requireModule('TRANSPORTATION', 2),
  controller.getFuelByUser,
);

// GET /api/transportation/reports/dot-status
router.get(
  '/dot-status',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getDotStatusReport,
);

// POST /api/transportation/reports/monthly-fuel/send
router.post(
  '/monthly-fuel/send',
  authenticate,
  validateCsrfToken,
  validateRequest(SendReportBodySchema),
  requireModule('TRANSPORTATION', 3),
  controller.sendMonthlyReport,
);

export default router;

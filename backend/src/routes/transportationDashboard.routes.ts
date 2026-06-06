/**
 * Transportation Dashboard Routes
 * Mounted at /api/transportation/dashboard
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireModule } from '../utils/groupAuth';
import * as controller from '../controllers/transportationDashboard.controller';

const router = Router();

// GET /api/transportation/dashboard
router.get(
  '/',
  authenticate,
  requireModule('TRANSPORTATION', 1),
  controller.getDashboard,
);

export default router;

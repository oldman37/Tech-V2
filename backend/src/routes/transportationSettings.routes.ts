/**
 * Transportation Settings Routes
 * Mounted at /api/transportation/settings
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import { UpdateTransportationSettingsSchema } from '../validators/transportation.validators';
import * as controller from '../controllers/transportationSettings.controller';

const router = Router();

// GET /api/transportation/settings
router.get(
  '/',
  authenticate,
  requireModule('TRANSPORTATION', 3),
  controller.get,
);

// GET /api/transportation/settings/suggested-emails
router.get(
  '/suggested-emails',
  authenticate,
  requireModule('TRANSPORTATION', 3),
  controller.getSuggestedEmails,
);

// PUT /api/transportation/settings
router.put(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(UpdateTransportationSettingsSchema),
  requireModule('TRANSPORTATION', 3),
  controller.update,
);

export default router;

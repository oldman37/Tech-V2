/**
 * Fuel Consumption Entry Routes
 * Mounted at /api/fuel-entries
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  CreateFuelEntrySchema,
  UpdateFuelEntrySchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/fuelConsumption.controller';

const router = Router();

// GET /api/fuel-entries
router.get(
  '/',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getAll,
);

// GET /api/fuel-entries/my-entries
router.get(
  '/my-entries',
  authenticate,
  requireModule('TRANSPORTATION', 1),
  controller.getMyEntries,
);

// GET /api/fuel-entries/:id
router.get(
  '/:id',
  authenticate,
  requireModule('TRANSPORTATION', 1),
  controller.getById,
);

// POST /api/fuel-entries
router.post(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateFuelEntrySchema),
  requireModule('TRANSPORTATION', 1),
  controller.create,
);

// PUT /api/fuel-entries/:id
router.put(
  '/:id',
  authenticate,
  validateCsrfToken,
  validateRequest(UpdateFuelEntrySchema),
  requireModule('TRANSPORTATION', 2),
  controller.update,
);

// DELETE /api/fuel-entries/:id
router.delete(
  '/:id',
  authenticate,
  validateCsrfToken,
  requireModule('TRANSPORTATION', 3),
  controller.deleteEntry,
);

export default router;

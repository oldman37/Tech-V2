/**
 * Transportation Fuel Station Routes
 * Mounted at /api/transportation/fuel-stations
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  CreateFuelStationSchema,
  UpdateFuelStationSchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/transportationFuelStation.controller';

const router = Router();

// GET /api/transportation/fuel-stations
router.get(
  '/',
  authenticate,
  requireModule('TRANSPORTATION', 1),
  controller.getAll,
);

// GET /api/transportation/fuel-stations/available-locations
router.get(
  '/available-locations',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getAvailableLocations,
);

// POST /api/transportation/fuel-stations
router.post(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateFuelStationSchema),
  requireModule('TRANSPORTATION', 2),
  controller.create,
);

// PUT /api/transportation/fuel-stations/:id
router.put(
  '/:id',
  authenticate,
  validateCsrfToken,
  validateRequest(UpdateFuelStationSchema),
  requireModule('TRANSPORTATION', 2),
  controller.update,
);

// DELETE /api/transportation/fuel-stations/:id
router.delete(
  '/:id',
  authenticate,
  validateCsrfToken,
  requireModule('TRANSPORTATION', 3),
  controller.remove,
);

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateCsrfToken } from '../middleware/csrf';
import { validateRequest } from '../middleware/validation';
import { requireModule } from '../utils/groupAuth';
import {
  TankIdParamSchema,
  StationIdParamSchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/fuelTank.controller';

export const stationTankRouter = Router({ mergeParams: true });
export const tankRouter        = Router({ mergeParams: true });

// ---- Station-scoped routes (/api/transportation/stations/:stationId/tanks) ----

stationTankRouter.get(
  '/',
  authenticate,
  validateRequest(StationIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 1),
  controller.getTanksByStation,
);

stationTankRouter.post(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(StationIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 2),
  controller.createTank,
);

// ---- Tank-scoped routes (/api/transportation/tanks/:tankId) ----

tankRouter.put(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(TankIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 2),
  controller.updateTank,
);

tankRouter.delete(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(TankIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 2),
  controller.deleteTank,
);

tankRouter.get(
  '/level',
  authenticate,
  validateRequest(TankIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 1),
  controller.getCurrentLevel,
);

tankRouter.post(
  '/deliveries',
  authenticate,
  validateCsrfToken,
  validateRequest(TankIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 2),
  controller.recordDelivery,
);

tankRouter.get(
  '/deliveries',
  authenticate,
  validateRequest(TankIdParamSchema, 'params'),
  requireModule('TRANSPORTATION', 1),
  controller.getDeliveriesByTank,
);

/**
 * DOT Physical Routes
 * Mounted at /api/dot-physicals
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  CreateDotPhysicalSchema,
  UpdateDotPhysicalSchema,
  ListDotPhysicalsQuerySchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/dotPhysical.controller';

const router = Router();

// GET /api/dot-physicals
router.get(
  '/',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getAll,
);

// GET /api/dot-physicals/expiring
router.get(
  '/expiring',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  validateRequest(ListDotPhysicalsQuerySchema),
  controller.getExpiring,
);

// GET /api/dot-physicals/driver/:userId
router.get(
  '/driver/:userId',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getByDriver,
);

// GET /api/dot-physicals/:id
router.get(
  '/:id',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getById,
);

// POST /api/dot-physicals
router.post(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateDotPhysicalSchema),
  requireModule('TRANSPORTATION', 2),
  controller.create,
);

// PUT /api/dot-physicals/:id
router.put(
  '/:id',
  authenticate,
  validateCsrfToken,
  validateRequest(UpdateDotPhysicalSchema),
  requireModule('TRANSPORTATION', 2),
  controller.update,
);

// DELETE /api/dot-physicals/:id
router.delete(
  '/:id',
  authenticate,
  validateCsrfToken,
  requireModule('TRANSPORTATION', 2),
  controller.deletePhysical,
);

export default router;

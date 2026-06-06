/**
 * Transportation Unit Routes
 * Mounted at /api/transportation-units
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  ListTransportationUnitsQuerySchema,
  CreateTransportationUnitSchema,
  UpdateTransportationUnitSchema,
  CreateAssignmentSchema,
} from '../validators/transportation.validators';
import * as controller from '../controllers/transportationUnit.controller';
import { UserService } from '../services/user.service';
import { prisma } from '../lib/prisma';

const router = Router();
const userService = new UserService(prisma);

// GET /api/transportation-units/user-search?q=&limit=
// User search for driver assignment — requires TRANSPORTATION level 2
router.get(
  '/user-search',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const q = String(req.query['q'] ?? '').trim();
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 50);
      const users = await userService.searchForAutocomplete(q, limit, undefined, true);
      res.json(users);
    } catch {
      res.status(500).json({ error: 'User search failed' });
    }
  },
);

// GET /api/transportation-units
router.get(
  '/',
  authenticate,
  validateRequest(ListTransportationUnitsQuerySchema, 'query'),
  requireModule('TRANSPORTATION', 2),
  controller.getAll,
);

// GET /api/transportation-units/my-unit
router.get(
  '/my-unit',
  authenticate,
  requireModule('TRANSPORTATION', 1),
  controller.getMyUnit,
);

// GET /api/transportation-units/:id
router.get(
  '/:id',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getById,
);

// POST /api/transportation-units
router.post(
  '/',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateTransportationUnitSchema),
  requireModule('TRANSPORTATION', 2),
  controller.create,
);

// PUT /api/transportation-units/:id
router.put(
  '/:id',
  authenticate,
  validateCsrfToken,
  validateRequest(UpdateTransportationUnitSchema),
  requireModule('TRANSPORTATION', 2),
  controller.update,
);

// DELETE /api/transportation-units/:id
router.delete(
  '/:id',
  authenticate,
  validateCsrfToken,
  requireModule('TRANSPORTATION', 3),
  controller.deactivate,
);

// GET /api/transportation-units/:id/assignments
router.get(
  '/:id/assignments',
  authenticate,
  requireModule('TRANSPORTATION', 2),
  controller.getAssignments,
);

// POST /api/transportation-units/:id/assignments
router.post(
  '/:id/assignments',
  authenticate,
  validateCsrfToken,
  validateRequest(CreateAssignmentSchema),
  requireModule('TRANSPORTATION', 2),
  controller.assignUser,
);

// DELETE /api/transportation-units/:id/assignments/:assignmentId
router.delete(
  '/:id/assignments/:assignmentId',
  authenticate,
  validateCsrfToken,
  requireModule('TRANSPORTATION', 2),
  controller.unassignUser,
);

export default router;

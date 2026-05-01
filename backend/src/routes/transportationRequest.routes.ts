/**
 * Transportation Request Routes
 *
 * All routes require authentication via `authenticate`.
 * CSRF protection applied to all state-changing routes.
 * Permission levels use the TRANSPORTATION_REQUESTS module:
 *   Level 1 — All staff: create and view own requests
 *   Level 2 — Transportation Secretary: view all, approve, deny
 *
 * NOTE: ADMIN role bypasses all requireModule checks.
 */
import { Router }            from 'express';
import { authenticate }      from '../middleware/auth';
import { validateRequest }   from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule }     from '../utils/groupAuth';
import {
  CreateTransportationRequestSchema,
  ApproveTransportationRequestSchema,
  DenyTransportationRequestSchema,
  TransportationRequestIdParamSchema,
  ListTransportationRequestsQuerySchema,
} from '../validators/transportationRequest.validators';
import * as ctrl from '../controllers/transportationRequest.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CSRF protection for state-changing routes
router.use(validateCsrfToken);

// GET /api/transportation-requests — list (own for level 1; all for level 2+)
router.get(
  '/',
  validateRequest(ListTransportationRequestsQuerySchema, 'query'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.list,
);

// POST /api/transportation-requests — create new request
router.post(
  '/',
  validateRequest(CreateTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.create,
);

// GET /api/transportation-requests/:id — get single request
router.get(
  '/:id',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.getById,
);

// PUT /api/transportation-requests/:id/approve — secretary only
router.put(
  '/:id/approve',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  validateRequest(ApproveTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 2),
  ctrl.approve,
);

// PUT /api/transportation-requests/:id/deny — secretary only
router.put(
  '/:id/deny',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  validateRequest(DenyTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 2),
  ctrl.deny,
);

// DELETE /api/transportation-requests/:id — own PENDING requests only
router.delete(
  '/:id',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.remove,
);

export default router;

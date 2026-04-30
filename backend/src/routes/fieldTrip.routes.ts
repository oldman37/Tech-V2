/**
 * Field Trip Routes
 *
 * All routes require authentication via `authenticate`.
 * CSRF protection applied to all state-changing routes via router.use(validateCsrfToken).
 * Permission levels use the FIELD_TRIPS module:
 *   Level 2 — All staff: create, submit, view own requests
 *   Level 3 — Supervisors: approve/deny at PENDING_SUPERVISOR stage; view all
 *   Level 4 — Asst. Director of Schools: approve/deny at PENDING_ASST_DIRECTOR stage
 *   Level 5 — Director of Schools: approve/deny at PENDING_DIRECTOR stage
 *   Level 6 — Finance Director / Admin: approve/deny at PENDING_FINANCE_DIRECTOR stage
 *
 * NOTE: ADMIN role bypasses all requireModule checks (handled inside requireModule).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  FieldTripIdParamSchema,
  CreateFieldTripSchema,
  UpdateFieldTripSchema,
  ApproveTripSchema,
  DenyTripSchema,
} from '../validators/fieldTrip.validators';
import * as fieldTripController from '../controllers/fieldTrip.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CSRF protection for all state-changing routes
router.use(validateCsrfToken);

// ---------------------------------------------------------------------------
// Collection routes (before /:id to avoid conflicts)
// ---------------------------------------------------------------------------

/**
 * GET /api/field-trips/my-requests
 * List the current user's own field trip requests (all statuses).
 */
router.get(
  '/my-requests',
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.getMyRequests,
);

/**
 * GET /api/field-trips/date-counts
 * Returns a map of { 'YYYY-MM-DD': count } for submitted trips within from/to range.
 * Used by the calendar date picker to show availability.
 */
router.get(
  '/date-counts',
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.getDateCounts,
);

/**
 * GET /api/field-trips/pending-approvals
 * List field trip requests pending at the stages the current user can approve.
 */
router.get(
  '/pending-approvals',
  requireModule('FIELD_TRIPS', 3),
  fieldTripController.getPendingApprovals,
);

/**
 * POST /api/field-trips
 * Create a new field trip request in DRAFT status.
 */
router.post(
  '/',
  validateRequest(CreateFieldTripSchema, 'body'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.create,
);

// ---------------------------------------------------------------------------
// Single-resource routes
// ---------------------------------------------------------------------------

/**
 * GET /api/field-trips/:id
 * Get field trip detail. Own requests visible to level 2+; all others need level 3+.
 */
router.get(
  '/:id',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.getById,
);

/**
 * PUT /api/field-trips/:id
 * Update a draft field trip request. Only the submitter may edit a DRAFT.
 */
router.put(
  '/:id',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(UpdateFieldTripSchema, 'body'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.update,
);

/**
 * DELETE /api/field-trips/:id
 * Delete a draft field trip request. Only the submitter may delete a DRAFT.
 */
router.delete(
  '/:id',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.deleteTrip,
);

// ---------------------------------------------------------------------------
// Workflow action routes
// ---------------------------------------------------------------------------

/**
 * POST /api/field-trips/:id/submit
 * Submit a draft for supervisor approval (or asst. director if no supervisor).
 */
router.post(
  '/:id/submit',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.submit,
);

/**
 * POST /api/field-trips/:id/approve
 * Approve the field trip at the current pending stage.
 * Minimum level 3 (supervisor) required; service validates exact level for the stage.
 */
router.post(
  '/:id/approve',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(ApproveTripSchema, 'body'),
  requireModule('FIELD_TRIPS', 3),
  fieldTripController.approve,
);

/**
 * POST /api/field-trips/:id/deny
 * Deny the field trip at the current pending stage.
 * Minimum level 3 required; service validates exact level for the stage.
 */
router.post(
  '/:id/deny',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(DenyTripSchema, 'body'),
  requireModule('FIELD_TRIPS', 3),
  fieldTripController.deny,
);

export default router;

/**
 * Assignment Routes
 * 
 * Defines all API endpoints for equipment assignment operations including
 * assigning to users/rooms, unassigning, transferring, and viewing history.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  EquipmentIdParamSchema,
  UserIdParamSchema,
  RoomIdParamSchema,
  AssignToUserSchema,
  AssignToRoomSchema,
  UnassignSchema,
  TransferSchema,
  BulkAssignSchema,
  AssignmentHistoryQuerySchema,
} from '../validators/assignment.validators';
import * as assignmentController from '../controllers/assignment.controller';

const router = Router();

// ============================================
// AUTHENTICATION & CSRF PROTECTION
// ============================================

// All routes require authentication
router.use(authenticate);

// Apply CSRF protection to state-changing routes (POST, PUT, DELETE)
router.use(validateCsrfToken);

// ============================================
// EQUIPMENT ASSIGNMENT ROUTES
// ============================================

/**
 * POST /api/equipment/:equipmentId/assign
 * Assign equipment to a user
 * Permission: TECHNOLOGY level 2+ (write access)
 */
router.post(
  '/equipment/:equipmentId/assign',
  validateRequest(AssignToUserSchema.shape.params, 'params'),
  validateRequest(AssignToUserSchema.shape.body, 'body'),
  requireModule('TECHNOLOGY', 2),
  assignmentController.assignEquipmentToUser
);

/**
 * POST /api/equipment/:equipmentId/assign-room
 * Assign equipment to a room
 * Permission: TECHNOLOGY level 2+ (write access)
 */
router.post(
  '/equipment/:equipmentId/assign-room',
  validateRequest(AssignToRoomSchema.shape.params, 'params'),
  validateRequest(AssignToRoomSchema.shape.body, 'body'),
  requireModule('TECHNOLOGY', 2),
  assignmentController.assignEquipmentToRoom
);

/**
 * POST /api/equipment/:equipmentId/unassign
 * Unassign equipment
 * Permission: TECHNOLOGY level 2+ (write access)
 */
router.post(
  '/equipment/:equipmentId/unassign',
  validateRequest(UnassignSchema.shape.params, 'params'),
  validateRequest(UnassignSchema.shape.body, 'body'),
  requireModule('TECHNOLOGY', 2),
  assignmentController.unassignEquipment
);

/**
 * POST /api/equipment/:equipmentId/transfer
 * Transfer equipment between users
 * Permission: TECHNOLOGY level 2+ (write access)
 */
router.post(
  '/equipment/:equipmentId/transfer',
  validateRequest(TransferSchema.shape.params, 'params'),
  validateRequest(TransferSchema.shape.body, 'body'),
  requireModule('TECHNOLOGY', 2),
  assignmentController.transferEquipment
);

/**
 * GET /api/equipment/:equipmentId/assignment-history
 * Get assignment history for equipment
 * Permission: TECHNOLOGY level 1+ (read access)
 */
router.get(
  '/equipment/:equipmentId/assignment-history',
  validateRequest(EquipmentIdParamSchema, 'params'),
  validateRequest(AssignmentHistoryQuerySchema, 'query'),
  requireModule('TECHNOLOGY', 1),
  assignmentController.getAssignmentHistory
);

/**
 * GET /api/equipment/:equipmentId/current-assignment
 * Get current assignment for equipment
 * Permission: TECHNOLOGY level 1+ (read access)
 */
router.get(
  '/equipment/:equipmentId/current-assignment',
  validateRequest(EquipmentIdParamSchema, 'params'),
  requireModule('TECHNOLOGY', 1),
  assignmentController.getCurrentAssignment
);

/**
 * GET /api/users/:userId/assigned-equipment
 * Get equipment assigned to a specific user
 * Permission: TECHNOLOGY level 1+ (read access)
 */
router.get(
  '/users/:userId/assigned-equipment',
  validateRequest(UserIdParamSchema, 'params'),
  requireModule('TECHNOLOGY', 1),
  assignmentController.getUserAssignedEquipment
);

/**
 * GET /api/rooms/:roomId/assigned-equipment
 * Get equipment assigned to a specific room
 * Permission: TECHNOLOGY level 1+ (read access)
 */
router.get(
  '/rooms/:roomId/assigned-equipment',
  validateRequest(RoomIdParamSchema, 'params'),
  requireModule('TECHNOLOGY', 1),
  assignmentController.getRoomAssignedEquipment
);

/**
 * POST /api/equipment/bulk-assign
 * Bulk assign equipment to user or room
 * Permission: TECHNOLOGY level 3+ (admin access)
 */
router.post(
  '/equipment/bulk-assign',
  validateRequest(BulkAssignSchema.shape.body, 'body'),
  requireModule('TECHNOLOGY', 3),
  assignmentController.bulkAssignEquipment
);

/**
 * GET /api/my-equipment
 * Get equipment assigned to the current user
 * Permission: Authenticated users (no specific technology permission required)
 */
router.get(
  '/my-equipment',
  assignmentController.getMyEquipment
);

export default router;

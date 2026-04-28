/**
 * Zod validation schemas for equipment assignment endpoints
 * 
 * Provides runtime validation of incoming requests for assignment operations.
 */

import { z } from 'zod';

/**
 * Validation schema for equipment ID parameter
 */
export const EquipmentIdParamSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID format'),
});

/**
 * Validation schema for user ID parameter
 */
export const UserIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

/**
 * Validation schema for room ID parameter
 */
export const RoomIdParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format'),
});

/**
 * Validation schema for assigning equipment to a user
 */
export const AssignToUserSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid('Invalid equipment ID format'),
  }),
  body: z.object({
    userId: z.string().uuid('Invalid user ID format'),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
  }),
});

/**
 * Validation schema for assigning equipment to a room
 */
export const AssignToRoomSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid('Invalid equipment ID format'),
  }),
  body: z.object({
    roomId: z.string().uuid('Invalid room ID format'),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
  }),
});

/**
 * Validation schema for unassigning equipment
 */
export const UnassignSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid('Invalid equipment ID format'),
  }),
  body: z.object({
    unassignType: z.enum(['user', 'room', 'all'], {
      message: 'Unassign type must be "user", "room", or "all"',
    }),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
  }),
});

/**
 * Validation schema for transferring equipment between users
 */
export const TransferSchema = z.object({
  params: z.object({
    equipmentId: z.string().uuid('Invalid equipment ID format'),
  }),
  body: z.object({
    fromUserId: z.string().uuid('Invalid from user ID format'),
    toUserId: z.string().uuid('Invalid to user ID format'),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
  }),
});

/**
 * Validation schema for bulk assignment operations
 */
export const BulkAssignSchema = z.object({
  body: z.object({
    equipmentIds: z.array(z.string().uuid('Invalid equipment ID format'))
      .min(1, 'At least one equipment ID is required')
      .max(100, 'Cannot assign more than 100 items at once'),
    assignmentType: z.enum(['user', 'room'], {
      message: 'Assignment type must be "user" or "room"',
    }),
    assignedToId: z.string().uuid('Invalid assigned to ID format'),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
  }),
});

/**
 * Validation schema for assignment history query parameters
 */
export const AssignmentHistoryQuerySchema = z.object({
  limit: z.preprocess(
    (val) => val ?? '50',
    z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
  ).optional(),
  offset: z.preprocess(
    (val) => val ?? '0',
    z.string()
      .regex(/^\d+$/, 'Offset must be a number')
      .transform(Number)
      .refine((val) => val >= 0, 'Offset must be 0 or greater')
  ).optional(),
  assignmentType: z.enum(['user', 'room', 'location']).optional(),
});

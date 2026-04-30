/**
 * Zod validation schemas for user room assignment endpoints
 */

import { z } from 'zod';

export const LocationIdParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
});

export const RoomIdParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format'),
});

export const RoomUserParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format'),
  userId: z.string().uuid('Invalid user ID format'),
});

export const UserIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

export const AssignUsersToRoomSchema = z.object({
  userIds: z
    .array(z.string().uuid('Invalid user ID format'))
    .min(1, 'At least one user required')
    .max(100, 'Maximum 100 users per request'),
  notes: z.string().max(500).optional(),
});

export const LocationRoomAssignmentsQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().max(200).optional(),
});

export const SetPrimaryRoomSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format').nullable(),
});

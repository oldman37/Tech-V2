/**
 * Zod validation schemas for room management endpoints
 * 
 * These schemas provide runtime validation of incoming requests for room operations.
 * TypeScript types are automatically inferred from these schemas using z.infer<>.
 */

import { z } from 'zod';

/**
 * Valid room types in the system
 */
const RoomType = z.enum([
  'CLASSROOM',
  'OFFICE',
  'CONFERENCE_ROOM',
  'LAB',
  'LIBRARY',
  'CAFETERIA',
  'GYM',
  'STORAGE',
  'RESTROOM',
  'HALLWAY',
  'OTHER'
]);

/**
 * Validation schema for room ID parameter
 */
export const RoomIdParamSchema = z.object({
  id: z.string().uuid('Invalid room ID format'),
});

/**
 * Validation schema for location ID parameter in room routes
 */
export const RoomLocationIdParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
});

/**
 * Validation schema for get rooms query parameters
 * Enhanced with pagination support following inventory.validators.ts pattern
 */
export const GetRoomsQuerySchema = z.object({
  // Pagination parameters
  page: z.preprocess(
    (val) => val ?? '1',
    z.string()
      .regex(/^\d+$/, 'Page must be a number')
      .transform(Number)
      .refine((val) => val > 0, 'Page must be greater than 0')
  ).optional(),
  
  limit: z.preprocess(
    (val) => val ?? '50',
    z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine((val) => val > 0 && val <= 1000, 'Limit must be between 1 and 1000')
  ).optional(),
  
  // Filter parameters (existing)
  locationId: z.string().uuid('Invalid location ID format').optional(),
  type: RoomType.optional(),
  isActive: z.string()
    .optional()
    .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined),
  search: z.string().max(200, 'Search query too long').optional(),
  
  // Sorting parameters
  sortBy: z.enum(['name', 'location', 'type', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Validation schema for creating a new room
 */
export const CreateRoomSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
  name: z.string().min(1, 'Room name is required').max(200),
  type: z.string().max(50).optional().nullable(),
  building: z.string().max(100).optional().nullable(),
  floor: z.union([
    z.string().regex(/^\d+$/, 'Floor must be a number').transform(Number),
    z.number()
  ]).optional().nullable(),
  capacity: z.union([
    z.string().regex(/^\d+$/, 'Capacity must be a number').transform(Number),
    z.number()
  ]).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * Validation schema for updating a room
 * All fields are optional for partial updates
 */
export const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().max(50).optional().nullable(),
  building: z.string().max(100).optional().nullable(),
  floor: z.union([
    z.string().regex(/^\d+$/, 'Floor must be a number').transform(Number),
    z.number()
  ]).optional().nullable(),
  capacity: z.union([
    z.string().regex(/^\d+$/, 'Capacity must be a number').transform(Number),
    z.number()
  ]).optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * TypeScript type exports (inferred from schemas)
 */
export type RoomIdParam = z.infer<typeof RoomIdParamSchema>;
export type GetRoomsQuery = z.infer<typeof GetRoomsQuerySchema>;
export type CreateRoom = z.infer<typeof CreateRoomSchema>;
export type UpdateRoom = z.infer<typeof UpdateRoomSchema>;

/**
 * Zod validation schemas for location management endpoints
 * 
 * These schemas provide runtime validation of incoming requests for location operations.
 * TypeScript types are automatically inferred from these schemas using z.infer<>.
 */

import { z } from 'zod';

/**
 * Valid office location types in the system
 */
const LocationType = z.enum(['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT', 'PROGRAM']);

/**
 * Valid supervisor types in the system
 */
const SupervisorType = z.enum([
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'DIRECTOR_OF_SCHOOLS',
  'FINANCE_DIRECTOR',
  'SPED_DIRECTOR',
  'MAINTENANCE_DIRECTOR',
  'TRANSPORTATION_DIRECTOR',
  'TECHNOLOGY_DIRECTOR',
  'AFTERSCHOOL_DIRECTOR',
  'NURSE_DIRECTOR',
  'CTE_DIRECTOR',
  'PRE_K_DIRECTOR',
  'TECHNOLOGY_ASSISTANT',
  'MAINTENANCE_WORKER',
  'FOOD_SERVICES_SUPERVISOR',
]);

/**
 * Validation schema for location ID parameter
 */
export const LocationIdParamSchema = z.object({
  id: z.string().uuid('Invalid location ID format'),
});

/**
 * Validation schema for location ID and supervisor parameters
 */
export const LocationSupervisorParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
  userId: z.string().uuid('Invalid user ID format'),
  supervisorType: SupervisorType,
});

/**
 * Validation schema for user supervised locations parameter
 */
export const UserSupervisedLocationsParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

/**
 * Validation schema for supervisor type parameter
 */
export const SupervisorTypeParamSchema = z.object({
  type: SupervisorType,
});

/**
 * Validation schema for location supervisor routing parameter
 */
export const LocationSupervisorRoutingParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
  supervisorType: SupervisorType,
});

/**
 * Validation schema for creating a new office location
 */
export const CreateOfficeLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  code: z.string().max(50).optional(),
  type: LocationType,
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2, 'State must be 2 characters').optional(),
  zip: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
});

/**
 * Validation schema for updating an office location
 * All fields are optional for partial updates
 */
export const UpdateOfficeLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).optional(),
  type: LocationType.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2, 'State must be a 2-letter state code').optional(),
  zip: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Validation schema for assigning a supervisor to a location
 */
export const AssignSupervisorSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  supervisorType: SupervisorType,
  isPrimary: z.boolean().optional().default(false),
});

/**
 * TypeScript type exports (inferred from schemas)
 */
export type LocationIdParam = z.infer<typeof LocationIdParamSchema>;
export type CreateOfficeLocation = z.infer<typeof CreateOfficeLocationSchema>;
export type UpdateOfficeLocation = z.infer<typeof UpdateOfficeLocationSchema>;
export type AssignSupervisor = z.infer<typeof AssignSupervisorSchema>;

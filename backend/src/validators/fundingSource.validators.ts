/**
 * Zod validation schemas for funding source management endpoints
 *
 * These schemas provide runtime validation of incoming requests for funding
 * source CRUD operations. TypeScript types are inferred via z.infer<>.
 */

import { z } from 'zod';

/**
 * Validation schema for funding source ID parameter
 */
export const FundingSourceIdParamSchema = z.object({
  id: z.string().uuid('Invalid funding source ID format'),
});

/**
 * Validation schema for GET /funding-sources query parameters
 */
export const GetFundingSourcesQuerySchema = z.object({
  // Pagination
  page: z.preprocess(
    (val) => val ?? '1',
    z
      .string()
      .regex(/^\d+$/, 'Page must be a number')
      .transform(Number)
      .refine((val) => val > 0, 'Page must be greater than 0'),
  ).optional(),
  limit: z.preprocess(
    (val) => val ?? '50',
    z
      .string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine((val) => val > 0 && val <= 1000, 'Limit must be between 1 and 1000'),
  ).optional(),

  // Filters
  search: z.string().max(200, 'Search query too long').optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),

  // Sorting
  sortBy: z.enum(['name', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Validation schema for creating a new funding source
 */
export const CreateFundingSourceSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

/**
 * Validation schema for updating a funding source
 * All fields are optional for partial updates
 */
export const UpdateFundingSourceSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type CreateFundingSourceDto = z.infer<typeof CreateFundingSourceSchema>;
export type UpdateFundingSourceDto = z.infer<typeof UpdateFundingSourceSchema>;
export type GetFundingSourcesQueryDto = z.infer<typeof GetFundingSourcesQuerySchema>;

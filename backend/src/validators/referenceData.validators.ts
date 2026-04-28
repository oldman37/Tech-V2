/**
 * Reference Data Validators
 * Zod schemas for Brands, Vendors, Categories, and Models.
 */

import { z } from 'zod';

// ─── Shared ────────────────────────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ─── Brands ────────────────────────────────────────────────────────────────

export const GetBrandsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
  search: z.string().optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const CreateBrandSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).nullish(),
  website: z.string().url('Must be a valid URL').max(500).nullish().or(z.literal('')).transform((v) => v || null),
});

export const UpdateBrandSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  website: z.string().url('Must be a valid URL').max(500).nullish().or(z.literal('')).transform((v) => v || null),
  isActive: z.boolean().optional(),
});

export type CreateBrandDto = z.infer<typeof CreateBrandSchema>;
export type UpdateBrandDto = z.infer<typeof UpdateBrandSchema>;
export type GetBrandsQuery = z.infer<typeof GetBrandsQuerySchema>;

// ─── Vendors ───────────────────────────────────────────────────────────────

export const GetVendorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(5000).default(50),
  search: z.string().optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const CreateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  contactName: z.string().max(100).nullish(),
  email: z.string().email('Must be a valid email').max(200).nullish().or(z.literal('')).transform((v) => v || null),
  phone: z.string().max(30).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(50).nullish(),
  zip: z.string().max(20).nullish(),
  fax: z.string().max(30).nullish(),
  website: z.string().url('Must be a valid URL').max(500).nullish().or(z.literal('')).transform((v) => v || null),
});

export const UpdateVendorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  contactName: z.string().max(100).nullish(),
  email: z.string().email().max(200).nullish().or(z.literal('')).transform((v) => v || null),
  phone: z.string().max(30).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(50).nullish(),
  zip: z.string().max(20).nullish(),
  fax: z.string().max(30).nullish(),
  website: z.string().url().max(500).nullish().or(z.literal('')).transform((v) => v || null),
  isActive: z.boolean().optional(),
});

export type CreateVendorDto = z.infer<typeof CreateVendorSchema>;
export type UpdateVendorDto = z.infer<typeof UpdateVendorSchema>;
export type GetVendorsQuery = z.infer<typeof GetVendorsQuerySchema>;

// ─── Categories ────────────────────────────────────────────────────────────

export const GetCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(500),
  search: z.string().optional(),
  parentId: z.string().uuid().nullish(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).nullish(),
  parentId: z.string().uuid('Must be a valid category ID').nullish(),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  parentId: z.string().uuid().nullish(),
});

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
export type GetCategoriesQuery = z.infer<typeof GetCategoriesQuerySchema>;

// ─── Models ────────────────────────────────────────────────────────────────

export const GetModelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
  search: z.string().optional(),
  brandId: z.string().uuid().optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const CreateModelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  brandId: z.string().uuid('Brand ID is required'),
  modelNumber: z.string().max(100).nullish(),
  description: z.string().max(500).nullish(),
  specifications: z.string().max(2000).nullish(),
});

export const UpdateModelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  brandId: z.string().uuid().optional(),
  modelNumber: z.string().max(100).nullish(),
  description: z.string().max(500).nullish(),
  specifications: z.string().max(2000).nullish(),
  isActive: z.boolean().optional(),
});

export type CreateModelDto = z.infer<typeof CreateModelSchema>;
export type UpdateModelDto = z.infer<typeof UpdateModelSchema>;
export type GetModelsQuery = z.infer<typeof GetModelsQuerySchema>;

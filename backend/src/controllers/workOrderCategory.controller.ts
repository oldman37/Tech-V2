/**
 * Work Order Category Controller
 *
 * HTTP handlers for WorkOrderCategory CRUD operations.
 * Follows the FundingSourceController pattern exactly.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { WorkOrderCategoryService } from '../services/workOrderCategory.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  GetWorkOrderCategoriesQuerySchema,
  CreateWorkOrderCategorySchema,
  UpdateWorkOrderCategorySchema,
} from '../validators/workOrderCategory.validators';

// ---------------------------------------------------------------------------
// Singleton service instance
// ---------------------------------------------------------------------------

const service = new WorkOrderCategoryService(prisma);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/work-order-categories
 * Returns a paginated, optionally-filtered list of work order categories.
 */
export const list = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = GetWorkOrderCategoriesQuerySchema.parse(req.query);
    const result = await service.findAll(query);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/work-order-categories/:id
 * Returns a single work order category by ID.
 */
export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await service.findById(req.params.id as string);
    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/work-order-categories
 * Creates a new work order category.
 */
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateWorkOrderCategorySchema.parse(req.body);
    const item = await service.create(data);
    res.status(201).json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * PUT /api/work-order-categories/:id
 * Updates an existing work order category.
 */
export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateWorkOrderCategorySchema.parse(req.body);
    const item = await service.update(req.params.id as string, data);
    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * DELETE /api/work-order-categories/:id
 * Permanently deletes a work order category (admin only).
 */
export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await service.delete(req.params.id as string);
    res.json({ message: 'Work order category deleted' });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Funding Source Controller
 *
 * HTTP handlers for FundingSource CRUD operations.
 * Follows the RoomController pattern exactly.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FundingSourceService } from '../services/fundingSource.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  GetFundingSourcesQuerySchema,
  CreateFundingSourceSchema,
  UpdateFundingSourceSchema,
} from '../validators/fundingSource.validators';

// ---------------------------------------------------------------------------
// Singleton service instance
// ---------------------------------------------------------------------------

const service = new FundingSourceService(prisma);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/funding-sources
 * Returns a paginated, optionally-filtered list of funding sources.
 */
export const getFundingSources = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = GetFundingSourcesQuerySchema.parse(req.query);
    const result = await service.findAll(query);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/funding-sources/:id
 * Returns a single funding source by ID.
 */
export const getFundingSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await service.findById(req.params.id as string);
    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/funding-sources
 * Creates a new funding source.
 */
export const createFundingSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateFundingSourceSchema.parse(req.body);
    const item = await service.create(data);
    res.status(201).json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * PUT /api/funding-sources/:id
 * Updates an existing funding source.
 */
export const updateFundingSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateFundingSourceSchema.parse(req.body);
    const item = await service.update(req.params.id as string, data);
    res.json(item);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * DELETE /api/funding-sources/:id
 * Soft-deletes (deactivates) a funding source.
 * Requires TECHNOLOGY level 3 permission (enforced by route middleware).
 */
export const deleteFundingSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await service.softDelete(req.params.id as string);
    res.json({ message: 'Funding source deactivated', item });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * DELETE /api/funding-sources/:id/hard
 * Permanently deletes a funding source.
 * Requires ADMIN role (enforced by route middleware).
 */
export const hardDeleteFundingSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await service.hardDelete(req.params.id as string);
    res.json({ message: 'Funding source permanently deleted' });
  } catch (error) {
    handleControllerError(error, res);
  }
};

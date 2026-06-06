/**
 * Fuel Consumption Entry Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FuelConsumptionService } from '../services/fuelConsumption.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  ListFuelEntriesQuerySchema,
  CreateFuelEntrySchema,
  UpdateFuelEntrySchema,
} from '../validators/transportation.validators';

const service = new FuelConsumptionService(prisma);

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = ListFuelEntriesQuerySchema.parse(req.query);
    const result = await service.getAll(
      query,
      req.user!.id,
      req.user!.permLevel ?? 1,
    );
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getMyEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = ListFuelEntriesQuerySchema.parse(req.query);
    const result = await service.getMyEntries(req.user!.id, query);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entry = await service.getById(
      req.params['id'] as string,
      req.user!.id,
      req.user!.permLevel ?? 1,
    );
    res.json(entry);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateFuelEntrySchema.parse(req.body);
    const entry = await service.create(data, req.user!.id, req.user!.permLevel ?? 1);
    res.status(201).json(entry);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateFuelEntrySchema.parse(req.body);
    const entry = await service.update(req.params['id'] as string, data, req.user!.permLevel ?? 1);
    res.json(entry);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const deleteEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await service.delete(req.params['id'] as string);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};

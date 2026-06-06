/**
 * Transportation Fuel Station Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TransportationFuelStationService } from '../services/transportationFuelStation.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  ListFuelStationsQuerySchema,
  CreateFuelStationSchema,
  UpdateFuelStationSchema,
} from '../validators/transportation.validators';

const service = new TransportationFuelStationService(prisma);

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = ListFuelStationsQuerySchema.parse(req.query);
    const stations = await service.getAll(query.isActive);
    res.json(stations);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getAvailableLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const locations = await service.getAvailableLocations();
    res.json(locations);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateFuelStationSchema.parse(req.body);
    const station = await service.create(data, req.user!.id);
    res.status(201).json(station);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateFuelStationSchema.parse(req.body);
    const station = await service.update(req.params['id'] as string, data);
    res.json(station);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await service.remove(req.params['id'] as string);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};

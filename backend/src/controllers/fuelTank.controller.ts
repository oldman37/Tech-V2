/**
 * Fuel Tank Controller
 *
 * Handles tank management and fuel delivery endpoints.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FuelTankService } from '../services/fuelTank.service';
import { FuelTankDeliveryService } from '../services/fuelTankDelivery.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  CreateFuelTankSchema,
  UpdateFuelTankSchema,
  RecordDeliverySchema,
} from '../validators/transportation.validators';

const tankService     = new FuelTankService(prisma);
const deliveryService = new FuelTankDeliveryService(prisma);

// ---------------------------------------------------------------------------
// Tank endpoints
// ---------------------------------------------------------------------------

export const getTanksByStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tanks = await tankService.getTanksByStation(req.params['stationId'] as string);
    res.json(tanks);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const createTank = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data  = CreateFuelTankSchema.parse(req.body);
    const tank  = await tankService.createTank(
      req.params['stationId'] as string,
      data,
      req.user!.id,
    );
    res.status(201).json(tank);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const updateTank = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateFuelTankSchema.parse(req.body);
    const tank = await tankService.updateTank(req.params['tankId'] as string, data);
    res.json(tank);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const deleteTank = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await tankService.deleteTank(req.params['tankId'] as string);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getCurrentLevel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const level = await tankService.calculateCurrentLevel(req.params['tankId'] as string);
    res.json(level);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// ---------------------------------------------------------------------------
// Delivery endpoints
// ---------------------------------------------------------------------------

export const recordDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data     = RecordDeliverySchema.parse(req.body);
    const delivery = await deliveryService.recordDelivery(
      req.params['tankId'] as string,
      data,
      req.user!.id,
    );
    res.status(201).json(delivery);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getDeliveriesByTank = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deliveries = await deliveryService.getDeliveriesByTank(req.params['tankId'] as string);
    res.json(deliveries);
  } catch (error) {
    handleControllerError(error, res);
  }
};

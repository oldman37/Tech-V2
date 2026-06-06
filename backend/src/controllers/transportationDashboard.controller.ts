/**
 * Transportation Dashboard Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TransportationDashboardService } from '../services/transportationDashboard.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';

const service = new TransportationDashboardService(prisma);

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await service.getDashboard(req.user!.id, req.user!.permLevel ?? 1);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

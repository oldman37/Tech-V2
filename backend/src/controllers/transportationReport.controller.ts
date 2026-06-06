/**
 * Transportation Report Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TransportationReportService } from '../services/transportationReport.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  MonthlyReportQuerySchema,
  DateRangeQuerySchema,
  SendReportBodySchema,
} from '../validators/transportation.validators';

const service = new TransportationReportService(prisma);

export const getMonthlyFuelReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month } = MonthlyReportQuerySchema.parse(req.query);
    const report = await service.getMonthlyFuelReport(month);
    res.json(report);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getFuelByUnit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = DateRangeQuerySchema.parse(req.query);
    const result = await service.getFuelByUnit(from ?? '', to ?? '');
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getFuelByUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = DateRangeQuerySchema.parse(req.query);
    const result = await service.getFuelByUser(from ?? '', to ?? '');
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getDotStatusReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const report = await service.getDotStatusReport();
    res.json(report);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const sendMonthlyReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month } = SendReportBodySchema.parse(req.body);
    const result = await service.sendMonthlyReportEmail(month, req.user!.id);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

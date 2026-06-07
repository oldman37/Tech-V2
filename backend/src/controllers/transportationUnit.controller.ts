/**
 * Transportation Unit Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TransportationUnitService } from '../services/transportationUnit.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import {
  ListTransportationUnitsQuerySchema,
  CreateTransportationUnitSchema,
  UpdateTransportationUnitSchema,
  CreateAssignmentSchema,
} from '../validators/transportation.validators';

const service = new TransportationUnitService(prisma);

export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = ListTransportationUnitsQuerySchema.parse(req.query);
    const result = await service.getAll(query);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const unit = await service.getById(req.params['id'] as string);
    res.json(unit);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getMyUnit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const assignment = await service.getMyUnit(req.user!.id);
    res.json(assignment ?? null);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateTransportationUnitSchema.parse(req.body);
    const unit = await service.create(data, req.user!.id);
    res.status(201).json(unit);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateTransportationUnitSchema.parse(req.body);
    const unit = await service.update(req.params['id'] as string, data);
    res.json(unit);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const deactivate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const unit = await service.deactivate(req.params['id'] as string);
    res.json(unit);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getAssignments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const assignments = await service.getAssignments(req.params['id'] as string);
    res.json(assignments);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const assignUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateAssignmentSchema.parse(req.body);
    const assignment = await service.assignUser(req.params['id'] as string, data, req.user!.id);
    res.status(201).json(assignment);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const unassignUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await service.unassignUser(req.params['id'] as string, req.params['assignmentId'] as string, req.user!.id);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const getActiveForFuel = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const units = await service.getActiveForFuel();
    res.json(units);
  } catch (error) {
    handleControllerError(error, res);
  }
};

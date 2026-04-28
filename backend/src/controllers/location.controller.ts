import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { LocationService } from '../services/location.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';

/**
 * Location and Supervisor Management Controller
 */

// Instantiate service
const locationService = new LocationService(prisma);

/**
 * Get all office locations
 * Supports optional `types` query param: comma-separated list of location types to filter by.
 * Example: GET /api/locations?types=SCHOOL,DEPARTMENT,PROGRAM
 */
export const getOfficeLocations = async (req: Request, res: Response) => {
  try {
    const { types } = req.query;
    const typeList: string[] | undefined = types
      ? (Array.isArray(types) ? (types as string[]) : String(types).split(',').map((t) => t.trim()))
      : undefined;
    const locations = await locationService.findAll(typeList ? { types: typeList } : undefined);
    res.json(locations);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get a specific office location with its supervisors
 */
export const getOfficeLocation = async (req: Request, res: Response) => {
  try {
    const location = await locationService.findById(req.params.id as string);
    res.json(location);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Create a new office location
 */
export const createOfficeLocation = async (req: Request, res: Response) => {
  try {
    const { name, code, type, address, city, state, zip, phone } = req.body;

    // Validate required fields
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const location = await locationService.create({
      name,
      code,
      type,
      address,
      city,
      state,
      zip,
      phone,
    });

    res.status(201).json(location);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Update an office location
 */
export const updateOfficeLocation = async (req: Request, res: Response) => {
  try {
    const location = await locationService.update(req.params.id as string, req.body);
    res.json(location);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Assign a supervisor to a location
 */
export const assignSupervisor = async (req: AuthRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string;
    const { userId, supervisorType, isPrimary = false } = req.body;
    const currentUserId = req.user?.id;

    // Validate required fields
    if (!userId || !supervisorType) {
      return res.status(400).json({
        error: 'userId and supervisorType are required',
      });
    }

    const assignment = await locationService.assignSupervisor(locationId, {
      userId,
      supervisorType,
      isPrimary,
      assignedBy: currentUserId,
    });

    res.status(201).json(assignment);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Remove a supervisor assignment
 */
export const removeSupervisor = async (req: Request, res: Response) => {
  try {
    const locationId = req.params.locationId as string;
    const userId = req.params.userId as string;
    const supervisorType = req.params.supervisorType as string;
    await locationService.removeSupervisor(locationId, userId, supervisorType);
    res.json({ message: 'Supervisor assignment removed successfully' });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get all locations supervised by a specific user
 */
export const getUserSupervisedLocations = async (req: Request, res: Response) => {
  try {
    const assignments = await locationService.getSupervisedLocations(req.params.userId as string);
    res.json(assignments);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get supervisors by type (e.g., all principals)
 */
export const getSupervisorsByType = async (req: Request, res: Response) => {
  try {
    const supervisors = await locationService.getSupervisorsByType(req.params.type as string);
    res.json(supervisors);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get the appropriate supervisor for routing (e.g., for work orders)
 */
export const getLocationSupervisorForRouting = async (
  req: Request,
  res: Response
) => {
  try {
    const locationId = req.params.locationId as string;
    const supervisorType = req.params.supervisorType as string;
    const supervisor = await locationService.getPrimarySupervisorForRouting(
      locationId,
      supervisorType
    );
    res.json(supervisor);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Delete an office location (soft delete - set isActive to false)
 */
export const deleteOfficeLocation = async (req: Request, res: Response) => {
  try {
    const location = await locationService.delete(req.params.id as string);
    res.json({
      message: 'Location deleted successfully',
      location,
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};

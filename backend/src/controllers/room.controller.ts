import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { RoomService } from '../services/room.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { GetRoomsQuerySchema } from '../validators/room.validators';
import { z } from 'zod';

/**
 * Room Management Controller
 * Handles CRUD operations for rooms within office locations
 */

// Instantiate service
const roomService = new RoomService(prisma);

/**
 * Get all rooms (with optional filters and pagination)
 * Enhanced with Zod validation and pagination support
 */
export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    // Validate query parameters with Zod
    const validatedQuery = GetRoomsQuerySchema.parse(req.query);

    const result = await roomService.findAll(validatedQuery);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues,
      });
    }
    handleControllerError(error, res);
  }
};

/**
 * Get rooms for a specific location
 */
export const getRoomsByLocation = async (req: Request, res: Response) => {
  try {
    const locationId = req.params.locationId as string;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const result = await roomService.findByLocation(locationId, isActive);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get a specific room
 */
export const getRoom = async (req: Request, res: Response) => {
  try {
    const room = await roomService.findById(req.params.id as string);
    res.json(room);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Create a new room
 */
export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { locationId, name, type, building, floor, capacity, notes } = req.body;

    // Validate required fields
    if (!locationId || !name) {
      return res.status(400).json({ error: 'Location ID and room name are required' });
    }

    const room = await roomService.create({
      locationId,
      name,
      type,
      building,
      floor: floor ? parseInt(floor) : undefined,
      capacity: capacity ? parseInt(capacity) : undefined,
      notes,
      createdBy: req.user?.id,
    });

    res.status(201).json(room);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Update a room
 */
export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    const { name, type, building, floor, capacity, isActive, notes } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (building !== undefined) updateData.building = building;
    if (floor !== undefined) updateData.floor = floor ? parseInt(floor) : null;
    if (capacity !== undefined) updateData.capacity = capacity ? parseInt(capacity) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (notes !== undefined) updateData.notes = notes;

    const room = await roomService.update(roomId, updateData);
    res.json(room);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Delete a room (soft delete by default)
 */
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    const permanent = req.query.permanent === 'true';

    if (permanent) {
      // Hard delete - only for admins
      if (!req.user?.roles?.includes('ADMIN')) {
        return res.status(403).json({
          error: 'Only administrators can permanently delete rooms',
        });
      }
      await roomService.delete(roomId, false);
      res.json({ message: 'Room permanently deleted' });
    } else {
      // Soft delete - deactivate
      await roomService.delete(roomId, true);
      res.json({ message: 'Room deactivated' });
    }
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get room statistics
 */
export const getRoomStats = async (req: Request, res: Response) => {
  try {
    const stats = await roomService.getStatistics();
    res.json(stats);
  } catch (error) {
    handleControllerError(error, res);
  }
};

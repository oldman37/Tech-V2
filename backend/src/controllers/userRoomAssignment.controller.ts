import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserRoomAssignmentService } from '../services/userRoomAssignment.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { AuthorizationError, NotFoundError } from '../utils/errors';
import {
  LocationRoomAssignmentsQuerySchema,
  AssignUsersToRoomSchema,
  SetPrimaryRoomSchema,
} from '../validators/userRoomAssignment.validators';
import { z } from 'zod';

const logger = createLogger('UserRoomAssignmentController');
const service = new UserRoomAssignmentService(prisma);

/**
 * Check if the requesting user is an admin or the primary supervisor of a location.
 * Returns the resolved locationId on success, throws AuthorizationError on failure.
 */
async function assertAdminOrPrimarySupervisor(
  req: AuthRequest,
  locationId: string
): Promise<void> {
  if (!req.user) {
    throw new AuthorizationError('Authentication required');
  }

  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
  const isAdmin =
    req.user.roles.includes('ADMIN') ||
    (adminGroupId != null && req.user.groups.includes(adminGroupId));

  if (isAdmin) return;

  const record = await prisma.locationSupervisor.findFirst({
    where: {
      locationId,
      userId: req.user.id,
      isPrimary: true,
      user: { isActive: true },
    },
  });

  if (!record) {
    logger.warn('Forbidden: user is not primary supervisor', {
      requesterId: req.user.id,
      targetLocationId: locationId,
      action: 'room-assignment',
    });
    throw new AuthorizationError(
      'You are not the primary supervisor of this location'
    );
  }
}

/**
 * GET /api/room-assignments/location/:locationId
 * Get all rooms + assigned users for a location.
 * Auth enforced via requireAdminOrPrimarySupervisor middleware on the route.
 */
export const getAssignmentsByLocation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const locationId = req.params.locationId as string;

    const queryResult = LocationRoomAssignmentsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: queryResult.error.issues,
      });
    }

    const result = await service.getAssignmentsByLocation(locationId, {
      includeInactive: queryResult.data.includeInactive,
      search: queryResult.data.search,
    });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/room-assignments/room/:roomId
 * Get all users assigned to a specific room.
 * Performs inline supervisor scope check using the room's locationId.
 */
export const getAssignmentsByRoom = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const roomId = req.params.roomId as string;

    // Resolve room to get its locationId for the scope check
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { locationId: true },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    await assertAdminOrPrimarySupervisor(req, room.locationId);

    const result = await service.getAssignmentsByRoom(roomId);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/room-assignments/user/:userId
 * Get all room assignments for a user. Admin only.
 */
export const getUserRoomAssignments = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.params.userId as string;
    const result = await service.getUserRoomAssignments(userId);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/room-assignments/room/:roomId/assign
 * Assign users to a room. Body: { userIds: string[], locationId: string, notes?: string }
 * Performs inline supervisor scope check.
 */
export const assignUsersToRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.roomId as string;

    const bodyResult = AssignUsersToRoomSchema.extend({
      locationId: z.string().uuid('Invalid location ID format'),
    }).safeParse(req.body);

    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: bodyResult.error.issues,
      });
    }

    const { userIds, locationId, notes } = bodyResult.data;

    await assertAdminOrPrimarySupervisor(req, locationId);

    // Verify the room actually belongs to the claimed locationId
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { locationId: true },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    if (room.locationId !== locationId) {
      throw new AuthorizationError(
        'The specified room does not belong to the provided location'
      );
    }

    const result = await service.assignUsersToRoom(
      roomId,
      userIds,
      req.user!.id,
      notes
    );

    res.status(201).json({
      ...result,
      message: `${result.assignedCount} user(s) assigned, ${result.alreadyAssignedCount} already assigned`,
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * DELETE /api/room-assignments/room/:roomId/user/:userId
 * Remove a user from a room. Query: { locationId: string }
 * Performs inline supervisor scope check.
 */
export const unassignUserFromRoom = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const roomId = req.params.roomId as string;
    const userId = req.params.userId as string;

    const queryResult = z
      .object({ locationId: z.string().uuid('Invalid location ID format') })
      .safeParse(req.query);

    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'locationId query parameter is required and must be a valid UUID',
        details: queryResult.error.issues,
      });
    }

    const { locationId } = queryResult.data;

    await assertAdminOrPrimarySupervisor(req, locationId);

    // Verify the room belongs to the claimed locationId
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { locationId: true },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    if (room.locationId !== locationId) {
      throw new AuthorizationError(
        'The specified room does not belong to the provided location'
      );
    }

    await service.unassignUserFromRoom(roomId, userId);
    res.json({ message: 'User unassigned from room successfully' });
  } catch (error) {
    handleControllerError(error, res);
  }
};
/**
 * PUT /api/room-assignments/user/:userId/primary-room
 * Set or clear the primary room for a user. Admin only.
 */
export const setPrimaryRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const bodyResult = SetPrimaryRoomSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: bodyResult.error.issues,
      });
    }

    const { roomId } = bodyResult.data;

    const result = await service.setPrimaryRoom(userId, roomId);

    res.json({
      userId: result.id,
      primaryRoomId: result.primaryRoomId,
      primaryRoom: result.primaryRoom
        ? {
            id: result.primaryRoom.id,
            name: result.primaryRoom.name,
            locationName: result.primaryRoom.location.name,
          }
        : null,
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};
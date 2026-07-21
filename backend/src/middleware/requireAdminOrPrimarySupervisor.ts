import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { loggers } from '../lib/logger';
import { isTechAssistant } from '../utils/groupAuth';


type LocationIdSource = 'body' | 'params' | 'query';

/**
 * Middleware factory that allows access only to:
 * 1. System Admins (role = 'ADMIN' or in the admin Entra group), OR
 * 2. The primary supervisor of the location specified in the request
 *
 * @param source - Where to find locationId in the request (body, params, or query)
 */
export const requireAdminOrPrimarySupervisor = (
  source: LocationIdSource = 'params'
) => {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Admins bypass the location scope check
    const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
    const principalsGroupId = process.env.ENTRA_PRINCIPALS_GROUP_ID;
    const vicePrincipalsGroupId = process.env.ENTRA_VICE_PRINCIPALS_GROUP_ID;
    const isAdmin =
      req.user.roles.includes('ADMIN') ||
      (adminGroupId != null && req.user.groups.includes(adminGroupId));

    // Principals and Vice Principals also get access (scoped to their own location via primary supervisor)
    const isPrincipalOrVP =
      (principalsGroupId != null && req.user.groups.includes(principalsGroupId)) ||
      (vicePrincipalsGroupId != null && req.user.groups.includes(vicePrincipalsGroupId));

    if (isAdmin || isPrincipalOrVP) {
      next();
      return;
    }

    // Resolve the locationId from the specified request source
    const locationId = (req[source] as Record<string, unknown>)
      ?.locationId as string | undefined;

    if (!locationId) {
      res
        .status(400)
        .json({ error: 'Bad Request', message: 'locationId is required' });
      return;
    }

    // Technology Assistants can manage room assignments for schools they are assigned to
    // support, regardless of which of that school's assistants is flagged "primary".
    if (isTechAssistant(req.user.groups)) {
      try {
        const techAssistantRecord = await prisma.locationSupervisor.findFirst({
          where: {
            locationId,
            userId: req.user.id,
            supervisorType: 'TECHNOLOGY_ASSISTANT',
            user: { isActive: true },
          },
        });

        if (!techAssistantRecord) {
          loggers.accessControl.warn('Forbidden: technology assistant is not assigned to requested location', {
            requesterId: req.user.id,
            targetLocationId: locationId,
            action: 'room-assignment',
          });
          res.status(403).json({
            error: 'Forbidden',
            message: 'You are not an assigned Technology Assistant for this location',
          });
          return;
        }

        next();
        return;
      } catch (error) {
        loggers.accessControl.error('Error checking technology assistant assignment', {
          requesterId: req.user.id,
          targetLocationId: locationId,
          error,
        });
        res
          .status(500)
          .json({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
        return;
      }
    }

    try {
      const record = await prisma.locationSupervisor.findFirst({
        where: {
          locationId,
          userId: req.user.id,
          isPrimary: true,
          user: { isActive: true },
        },
      });

      if (!record) {
        loggers.accessControl.warn('Forbidden: not primary supervisor', {
          requesterId: req.user.id,
          targetLocationId: locationId,
          action: 'room-assignment',
        });
        res.status(403).json({
          error: 'Forbidden',
          message: 'You are not the primary supervisor of this location',
        });
        return;
      }

      next();
    } catch (error) {
      loggers.accessControl.error('Error checking primary supervisor status', {
        requesterId: req.user.id,
        targetLocationId: locationId,
        error,
      });
      res
        .status(500)
        .json({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
    }
  };
};

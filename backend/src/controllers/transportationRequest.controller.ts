/**
 * Transportation Request Controller
 *
 * HTTP handlers for standalone transportation requests.
 * Follows the fieldTripTransportation.controller.ts pattern exactly.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { transportationRequestService } from '../services/transportationRequest.service';
import {
  CreateTransportationRequestSchema,
  ApproveTransportationRequestSchema,
  DenyTransportationRequestSchema,
  ListTransportationRequestsQuerySchema,
} from '../validators/transportationRequest.validators';
import {
  fetchGroupEmails,
  sendTransportationRequestSubmitted,
  sendTransportationRequestApproved,
  sendTransportationRequestDenied,
} from '../services/email.service';
import { handleControllerError } from '../utils/errorHandler';

// POST /api/transportation-requests
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data      = CreateTransportationRequestSchema.parse(req.body);
    const userId    = req.user!.id;
    const userEmail = req.user!.email;

    const result = await transportationRequestService.create(userId, userEmail, data);

    // Non-blocking: notify Transportation Secretary group
    const secretaryGroupId = process.env.ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID;
    if (secretaryGroupId) {
      fetchGroupEmails(secretaryGroupId)
        .then((emails) => {
          if (emails.length === 0) return;
          return sendTransportationRequestSubmitted(emails, result, req.user!.name);
        })
        .catch((err: unknown) => {
          logger.error('Failed to notify transportation secretary', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    res.status(201).json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// GET /api/transportation-requests
export const list = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query     = ListTransportationRequestsQuerySchema.parse(req.query);
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;

    const results = await transportationRequestService.list(userId, permLevel, query);
    res.json(results);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// GET /api/transportation-requests/:id
export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;
    const id        = req.params['id'] as string;

    const result = await transportationRequestService.getById(id, userId, permLevel);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// PUT /api/transportation-requests/:id/approve
export const approve = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data   = ApproveTransportationRequestSchema.parse(req.body);
    const userId = req.user!.id;
    const id     = req.params['id'] as string;

    const result = await transportationRequestService.approve(id, userId, data);

    // Non-blocking: notify submitter
    sendTransportationRequestApproved(result.submitterEmail, result)
      .catch((err: unknown) => {
        logger.error('Failed to send transportation approval email', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// PUT /api/transportation-requests/:id/deny
export const deny = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data   = DenyTransportationRequestSchema.parse(req.body);
    const userId = req.user!.id;
    const id     = req.params['id'] as string;

    const result = await transportationRequestService.deny(id, userId, data);

    // Non-blocking: notify submitter
    sendTransportationRequestDenied(result.submitterEmail, result, data.denialReason)
      .catch((err: unknown) => {
        logger.error('Failed to send transportation denial email', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// DELETE /api/transportation-requests/:id
export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id     = req.params['id'] as string;

    await transportationRequestService.delete(id, userId);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};

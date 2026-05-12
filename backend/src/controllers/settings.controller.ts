/**
 * Settings Controller
 *
 * HTTP handlers for system settings.
 * Follows the FundingSourceController pattern exactly:
 *   - Singleton service instance
 *   - try/catch with handleControllerError
 */

import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { UpdateSettingsSchema, StartNewFiscalYearSchema } from '../validators/settings.validators';
import { AuthRequest } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Singleton service instance
// ---------------------------------------------------------------------------

const service = new SettingsService(prisma);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/settings
 * Returns the singleton settings row (creates with defaults if absent).
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await service.getSettings();
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * PUT /api/settings
 * Partial-update the singleton settings row.
 * Only fields sent in the body are updated (undefined fields are ignored).
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const data     = UpdateSettingsSchema.parse(req.body);
    const settings = await service.updateSettings(data);
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/fiscal-year-summary
 * Returns current fiscal year state, in-progress PO counts, and suggested next year.
 */
export const getFiscalYearSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await service.getFiscalYearSummary();
    res.json(summary);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * POST /api/settings/new-fiscal-year
 * Perform the fiscal year rollover (admin only).
 */
export const startNewFiscalYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await service.startNewFiscalYear(req.body, req.user!.id);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/fiscal-years
 * Returns distinct fiscal years from purchase orders (all authenticated users).
 */
export const getDistinctFiscalYears = async (req: Request, res: Response): Promise<void> => {
  try {
    const years = await service.getDistinctFiscalYears();
    res.json(years);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/work-order-year-summary
 * Returns work order count summary grouped by status and department for the current fiscal year.
 * Admin only.
 */
export const getWorkOrderYearSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await service.getWorkOrderYearSummary();
    res.json(summary);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/work-order-fiscal-years
 * Returns distinct fiscal years from work orders (all authenticated users).
 */
export const getDistinctWorkOrderFiscalYears = async (req: Request, res: Response): Promise<void> => {
  try {
    const years = await service.getDistinctWorkOrderFiscalYears();
    res.json(years);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/current
 * Returns a subset of settings safe for all authenticated users:
 * currentFiscalYear, fiscalYearStart, fiscalYearEnd.
 */
export const getCurrentSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await service.getSettings();
    res.json({
      currentFiscalYear: settings.currentFiscalYear,
      fiscalYearStart: settings.fiscalYearStart,
      fiscalYearEnd: settings.fiscalYearEnd,
    });
  } catch (error) {
    handleControllerError(error, res);
  }
};

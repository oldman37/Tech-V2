/**
 * Work Order Category Routes
 *
 * Read  : authenticate only (all staff need categories for the work order form)
 * Write : authenticate + validateCsrfToken + requireAdmin (admin-only reference data)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import {
  WorkOrderCategoryIdParamSchema,
  GetWorkOrderCategoriesQuerySchema,
  CreateWorkOrderCategorySchema,
  UpdateWorkOrderCategorySchema,
} from '../validators/workOrderCategory.validators';
import * as workOrderCategoryController from '../controllers/workOrderCategory.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Read endpoints — all authenticated staff (level 1 equivalent)
// ---------------------------------------------------------------------------

router.get(
  '/',
  validateRequest(GetWorkOrderCategoriesQuerySchema, 'query'),
  workOrderCategoryController.list,
);

router.get(
  '/:id',
  validateRequest(WorkOrderCategoryIdParamSchema, 'params'),
  workOrderCategoryController.getById,
);

// ---------------------------------------------------------------------------
// Write endpoints — admin only
// ---------------------------------------------------------------------------

router.post(
  '/',
  validateCsrfToken,
  requireAdmin,
  validateRequest(CreateWorkOrderCategorySchema, 'body'),
  workOrderCategoryController.create,
);

router.put(
  '/:id',
  validateCsrfToken,
  requireAdmin,
  validateRequest(WorkOrderCategoryIdParamSchema, 'params'),
  validateRequest(UpdateWorkOrderCategorySchema, 'body'),
  workOrderCategoryController.update,
);

router.delete(
  '/:id',
  validateCsrfToken,
  requireAdmin,
  validateRequest(WorkOrderCategoryIdParamSchema, 'params'),
  workOrderCategoryController.remove,
);

export default router;

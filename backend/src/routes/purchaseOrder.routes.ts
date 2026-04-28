/**
 * Purchase Order Routes
 *
 * All routes require authentication via `authenticate`.
 * CSRF protection applied to all state-changing routes via router.use(validateCsrfToken).
 * Permission levels use the REQUISITIONS module:
 *   Level 1 — View  (any authenticated user with REQUISITIONS.1 grant)
 *   Level 2 — Create / Edit own POs
 *   Level 3 — Supervisor approval: submitted → supervisor_approved
 *   Level 4 — PO Entry: issue final PO number after Director of Schools approval (dos_approved)
 *   Level 5 — Finance Director: supervisor_approved → finance_director_approved; assigns account code
 *   Level 6 — Director of Schools: finance_director_approved → dos_approved
 *
 * NOTE: ADMIN role bypasses all checkPermission checks (handled inside checkPermission).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  PurchaseOrderIdParamSchema,
  PurchaseOrderQuerySchema,
  CreatePurchaseOrderSchema,
  UpdatePurchaseOrderSchema,
  ApproveSchema,
  RejectSchema,
  AssignAccountSchema,
  IssuePOSchema,
} from '../validators/purchaseOrder.validators';
import * as purchaseOrderController from '../controllers/purchaseOrder.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CSRF protection for all state-changing routes
router.use(validateCsrfToken);

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders
 * List purchase orders (own only for levels 1–2; location-scoped for level 3 supervisors; all for levels 4+)
 */
router.get(
  '/',
  validateRequest(PurchaseOrderQuerySchema, 'query'),
  requireModule('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrders,
);

/**
 * POST /api/purchase-orders
 * Create a new draft purchase order
 */
router.post(
  '/',
  validateRequest(CreatePurchaseOrderSchema, 'body'),
  requireModule('REQUISITIONS', 2),
  purchaseOrderController.createPurchaseOrder,
);

// ---------------------------------------------------------------------------
// Single-resource routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id
 * Get PO detail (own only for levels 1-2; location-scoped for level 3 supervisors; all for levels 4+)
 */
router.get(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  requireModule('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrder,
);

/**
 * PUT /api/purchase-orders/:id
 * Update a draft PO
 */
router.put(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(UpdatePurchaseOrderSchema, 'body'),
  requireModule('REQUISITIONS', 2),
  purchaseOrderController.updatePurchaseOrder,
);

/**
 * DELETE /api/purchase-orders/:id
 * Delete a draft PO
 */
router.delete(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  requireModule('REQUISITIONS', 2),
  purchaseOrderController.deletePurchaseOrder,
);

// ---------------------------------------------------------------------------
// Workflow action routes
// ---------------------------------------------------------------------------

/**
 * POST /api/purchase-orders/:id/submit
 * Submit a draft for supervisor approval
 */
router.post(
  '/:id/submit',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  requireModule('REQUISITIONS', 2),
  purchaseOrderController.submitPurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/approve
 * Approve at the current workflow stage (role-aware).
 * Level 3 = Supervisor (submitted → supervisor_approved).
 * Level 5 = Finance Director (supervisor_approved → finance_director_approved).
 * Level 6 = Director of Schools (finance_director_approved → dos_approved).
 * Route requires level 3 minimum; service differentiates behavior by exact level.
 */
router.post(
  '/:id/approve',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(ApproveSchema, 'body'),
  requireModule('REQUISITIONS', 3),
  purchaseOrderController.approvePurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/reject
 * Reject / deny at any workflow stage.
 */
router.post(
  '/:id/reject',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(RejectSchema, 'body'),
  requireModule('REQUISITIONS', 3),
  purchaseOrderController.rejectPurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/account
 * Assign account code (Finance Director or above; requires supervisor_approved or later status).
 * Food Service POs: FS Supervisor (level 3). Standard POs: Finance Director (level 5).
 * Controller enforces group-based authorization.
 */
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  requireModule('REQUISITIONS', 3),
  purchaseOrderController.assignAccountCode,
);

/**
 * POST /api/purchase-orders/:id/issue
 * Issue PO number (PO Entry, level 4+; requires dos_approved status + account code set).
 */
router.post(
  '/:id/issue',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(IssuePOSchema, 'body'),
  requireModule('REQUISITIONS', 4),
  purchaseOrderController.issuePurchaseOrder,
);

// ---------------------------------------------------------------------------
// Export routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id/pdf
 * Download PO as PDF
 */
router.get(
  '/:id/pdf',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  requireModule('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrderPdf,
);

/**
 * GET /api/purchase-orders/:id/history
 * View status change history
 */
router.get(
  '/:id/history',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  requireModule('REQUISITIONS', 1),
  purchaseOrderController.getPurchaseOrderHistory,
);

export default router;

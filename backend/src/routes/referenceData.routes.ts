/**
 * Reference Data Routes
 * CRUD routes for Brands, Vendors, Categories, and Models.
 * All routes require TECHNOLOGY >= 1 to read, >= 2 to write.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateCsrfToken } from '../middleware/csrf';
import { requireModule } from '../utils/groupAuth';
import {
  getBrands, getBrand, createBrand, updateBrand, deleteBrand,
  getVendors, getVendor, createVendor, updateVendor, deleteVendor,
  getCategories, getCategory, createCategory, updateCategory, deleteCategory,
  getModels, getModel, createModel, updateModel, deleteModel,
} from '../controllers/referenceData.controller';

const router = Router();

router.use(authenticate);
router.use(validateCsrfToken);

// ─── Brands ────────────────────────────────────────────────────────────────
router.get('/brands',       requireModule('TECHNOLOGY', 1), getBrands);
router.get('/brands/:id',   requireModule('TECHNOLOGY', 1), getBrand);
router.post('/brands',      requireModule('TECHNOLOGY', 2), createBrand);
router.put('/brands/:id',   requireModule('TECHNOLOGY', 2), updateBrand);
router.delete('/brands/:id', requireModule('TECHNOLOGY', 2), deleteBrand);

// ─── Vendors ───────────────────────────────────────────────────────────────
// GET routes require only authentication — vendors are lookup data used across
// multiple modules (REQUISITIONS, equipment forms, etc.), not TECHNOLOGY-only.
router.get('/vendors',       getVendors);
router.get('/vendors/:id',   getVendor);
router.post('/vendors',      requireModule('TECHNOLOGY', 2), createVendor);
router.put('/vendors/:id',   requireModule('TECHNOLOGY', 2), updateVendor);
router.delete('/vendors/:id', requireModule('TECHNOLOGY', 2), deleteVendor);

// ─── Categories ────────────────────────────────────────────────────────────
router.get('/categories',       requireModule('TECHNOLOGY', 1), getCategories);
router.get('/categories/:id',   requireModule('TECHNOLOGY', 1), getCategory);
router.post('/categories',      requireModule('TECHNOLOGY', 2), createCategory);
router.put('/categories/:id',   requireModule('TECHNOLOGY', 2), updateCategory);
router.delete('/categories/:id', requireModule('TECHNOLOGY', 2), deleteCategory);

// ─── Models ────────────────────────────────────────────────────────────────
router.get('/equipment-models',       requireModule('TECHNOLOGY', 1), getModels);
router.get('/equipment-models/:id',   requireModule('TECHNOLOGY', 1), getModel);
router.post('/equipment-models',      requireModule('TECHNOLOGY', 2), createModel);
router.put('/equipment-models/:id',   requireModule('TECHNOLOGY', 2), updateModel);
router.delete('/equipment-models/:id', requireModule('TECHNOLOGY', 2), deleteModel);

export default router;

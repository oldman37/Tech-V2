import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { requireDeviceManagementAccess } from '../utils/groupAuth';
import { BarcodePdfQuerySchema } from '../validators/barcodePdf.validators';
import * as controller from '../controllers/barcodePdf.controller';

const router = Router();

router.use(authenticate);

router.get(
  '/pdf',
  requireDeviceManagementAccess(),
  validateRequest(BarcodePdfQuerySchema, 'query'),
  controller.generatePdf,
);

export default router;

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateCsrfToken } from '../middleware/csrf';
import * as provisioning from '../controllers/provisioning.controller';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/status',                         provisioning.getStatus);
router.post('/run',                           validateCsrfToken, provisioning.runProvisioning);
router.get('/audit',                          provisioning.getAuditLog);
router.get('/config',                         provisioning.getConfig);
router.patch('/config',                       validateCsrfToken, provisioning.updateConfig);
router.get('/domains',                        provisioning.getDomains);
router.get('/disable-batches',                provisioning.listDisableBatches);
router.get('/disable-batches/history',        provisioning.listDisableBatchHistory);
router.post('/disable-batches/:id/approve',   validateCsrfToken, provisioning.approveDisableBatch);
router.post('/disable-batches/:id/reject',    validateCsrfToken, provisioning.rejectDisableBatch);

export default router;

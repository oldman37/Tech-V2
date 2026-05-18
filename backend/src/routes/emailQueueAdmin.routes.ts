import express from 'express';
import {
  getEmailQueueList,
  getEmailQueueStats,
  retryEmail,
  retryAllFailed,
} from '../controllers/emailQueueAdmin.controller';

const router = express.Router();

// GET /api/admin/email-queue — paginated list
router.get('/', getEmailQueueList);

// GET /api/admin/email-queue/stats — status counts
router.get('/stats', getEmailQueueStats);

// POST /api/admin/email-queue/:id/retry — retry single
router.post('/:id/retry', retryEmail);

// POST /api/admin/email-queue/retry-all-failed — bulk retry
router.post('/retry-all-failed', retryAllFailed);

export default router;

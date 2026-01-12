import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/login', authController.login);
router.get('/callback', authController.callback);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.get('/sync-users', authenticate, requireAdmin, authController.syncUsers);

export default router;

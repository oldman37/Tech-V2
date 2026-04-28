import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import { OAuthCallbackQuerySchema, LoginQuerySchema } from '../validators/auth.validators';

const router = Router();

// Public routes
router.get('/login', validateQuery(LoginQuerySchema), authController.login);
router.get('/callback', validateQuery(OAuthCallbackQuerySchema), authController.callback);
// No body validation — refresh token comes from HttpOnly cookie, not request body
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.get('/sync-users', authenticate, requireAdmin, authController.syncUsers);

export default router;

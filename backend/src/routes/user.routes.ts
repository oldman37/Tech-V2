import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { requireModule } from '../utils/groupAuth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import {
  GetUsersQuerySchema,
  UserIdParamSchema,
  UserIdParamSchema2,
  SupervisorIdParamSchema,
  UpdateUserRoleSchema,
  AddUserSupervisorSchema,
  SearchUsersQuerySchema,
} from '../validators/user.validators';
import {
  getUsers,
  getUserById,
  getMe,
  getMyOfficeLocation,
  getAdminContacts,
  updateUserRole,
  toggleUserStatus,
  getSupervisorUsers,
  getUserSupervisors,
  addUserSupervisor,
  removeUserSupervisor,
  searchPotentialSupervisors,
  searchUsers,
} from '../controllers/user.controller';

const router = express.Router();

// User search for autocomplete — accessible to authenticated TECHNOLOGY permission holders (not admin-only)
// Must be declared BEFORE router.use(requireAdmin) to bypass the admin gate
router.get(
  '/search',
  authenticate,
  validateRequest(SearchUsersQuerySchema, 'query'),
  requireModule('TECHNOLOGY', 1),
  searchUsers
);

// Current user's own record (including permissions) — any authenticated user
router.get('/me', authenticate, getMe);

// Current user's resolved office location — any authenticated user
router.get('/me/office-location', authenticate, getMyOfficeLocation);

// IT admin contacts — any authenticated user (for permission-denied pages)
router.get('/admin-contacts', authenticate, getAdminContacts);

// All remaining routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Apply CSRF protection to all state-changing routes
router.use(validateCsrfToken);

// Get all users
router.get('/', validateRequest(GetUsersQuerySchema, 'query'), getUsers);

// Get users who are supervisors
router.get('/supervisors/list', getSupervisorUsers);

// Get user by ID
router.get('/:id', validateRequest(UserIdParamSchema, 'params'), getUserById);

// User supervisor management routes
router.get('/:userId/supervisors', validateRequest(UserIdParamSchema2, 'params'), getUserSupervisors);
router.post('/:userId/supervisors', validateRequest(UserIdParamSchema2, 'params'), validateRequest(AddUserSupervisorSchema, 'body'), addUserSupervisor);
router.delete('/:userId/supervisors/:supervisorId', validateRequest(SupervisorIdParamSchema, 'params'), removeUserSupervisor);
router.get('/:userId/supervisors/search', validateRequest(UserIdParamSchema2, 'params'), searchPotentialSupervisors);

// Update user role
router.put('/:id/role', validateRequest(UserIdParamSchema, 'params'), validateRequest(UpdateUserRoleSchema, 'body'), updateUserRole);

// Toggle user active status
router.put('/:id/toggle-status', validateRequest(UserIdParamSchema, 'params'), toggleUserStatus);

export default router;

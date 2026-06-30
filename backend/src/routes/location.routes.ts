import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import {
  LocationIdParamSchema,
  LocationSupervisorParamSchema,
  UserSupervisedLocationsParamSchema,
  SupervisorTypeParamSchema,
  LocationSupervisorRoutingParamSchema,
  CreateOfficeLocationSchema,
  UpdateOfficeLocationSchema,
  AssignSupervisorSchema,
  CreateDelegationSchema,
  DelegationParamSchema,
} from '../validators/location.validators';
import * as locationController from '../controllers/location.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply CSRF protection to all state-changing routes
router.use(validateCsrfToken);

// Office Location routes
router.get('/locations', locationController.getOfficeLocations);
router.get('/locations/:id', validateRequest(LocationIdParamSchema, 'params'), locationController.getOfficeLocation);
router.post('/locations', validateRequest(CreateOfficeLocationSchema, 'body'), locationController.createOfficeLocation);
router.put('/locations/:id', validateRequest(LocationIdParamSchema, 'params'), validateRequest(UpdateOfficeLocationSchema, 'body'), locationController.updateOfficeLocation);
router.delete('/locations/:id', validateRequest(LocationIdParamSchema, 'params'), locationController.deleteOfficeLocation);

// Supervisor assignment routes
router.post('/locations/:locationId/supervisors', validateRequest(AssignSupervisorSchema, 'body'), locationController.assignSupervisor);
router.delete(
  '/locations/:locationId/supervisors/:userId/:supervisorType',
  validateRequest(LocationSupervisorParamSchema, 'params'),
  locationController.removeSupervisor
);

// Supervisor query routes
router.get('/location-supervisors/user/:userId', validateRequest(UserSupervisedLocationsParamSchema, 'params'), locationController.getUserSupervisedLocations);
router.get('/supervisors/type/:type', validateRequest(SupervisorTypeParamSchema, 'params'), locationController.getSupervisorsByType);
router.get(
  '/locations/:locationId/supervisor/:supervisorType',
  validateRequest(LocationSupervisorRoutingParamSchema, 'params'),
  locationController.getLocationSupervisorForRouting
);

// Temporary supervisor delegation routes (admin only)
// Note: :locationId param is not pre-validated here (consistent with assignSupervisor);
// the service throws NotFoundError if the location doesn't exist.
router.get(
  '/locations/:locationId/delegations',
  requireAdmin,
  locationController.getDelegations,
);
router.post(
  '/locations/:locationId/delegations',
  validateRequest(CreateDelegationSchema, 'body'),
  requireAdmin,
  locationController.createDelegation,
);
router.delete(
  '/locations/:locationId/delegations/:delegationId',
  validateRequest(DelegationParamSchema, 'params'),
  requireAdmin,
  locationController.revokeDelegation,
);

export default router;

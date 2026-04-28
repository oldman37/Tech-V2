import { Router } from 'express';
import { authenticate } from '../middleware/auth';
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
router.get('/users/:userId/supervised-locations', validateRequest(UserSupervisedLocationsParamSchema, 'params'), locationController.getUserSupervisedLocations);
router.get('/supervisors/type/:type', validateRequest(SupervisorTypeParamSchema, 'params'), locationController.getSupervisorsByType);
router.get(
  '/locations/:locationId/supervisor/:supervisorType',
  validateRequest(LocationSupervisorRoutingParamSchema, 'params'),
  locationController.getLocationSupervisorForRouting
);

export default router;

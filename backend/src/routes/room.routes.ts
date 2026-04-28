import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import {
  RoomIdParamSchema,
  RoomLocationIdParamSchema,
  GetRoomsQuerySchema,
  CreateRoomSchema,
  UpdateRoomSchema,
} from '../validators/room.validators';
import * as roomController from '../controllers/room.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply CSRF protection to all state-changing routes
router.use(validateCsrfToken);

// Room routes
router.get('/rooms', validateRequest(GetRoomsQuerySchema, 'query'), roomController.getRooms);
router.get('/rooms/stats', roomController.getRoomStats);
router.get('/rooms/:id', validateRequest(RoomIdParamSchema, 'params'), roomController.getRoom);
router.post('/rooms', validateRequest(CreateRoomSchema, 'body'), roomController.createRoom);
router.put('/rooms/:id', validateRequest(RoomIdParamSchema, 'params'), validateRequest(UpdateRoomSchema, 'body'), roomController.updateRoom);
router.delete('/rooms/:id', validateRequest(RoomIdParamSchema, 'params'), roomController.deleteRoom);

// Location-specific room routes
router.get('/locations/:locationId/rooms', validateRequest(RoomLocationIdParamSchema, 'params'), roomController.getRoomsByLocation);

export default router;

/**
 * TypeScript type definitions for Equipment Assignment System
 * 
 * Provides type-safe interfaces for assignment operations, queries, and responses
 */

import { EquipmentAssignmentHistory, User, Room } from '@prisma/client';

/**
 * Assignment with related entities populated
 */
export interface AssignmentHistoryWithRelations extends EquipmentAssignmentHistory {
  user?: {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
  };
}

/**
 * DTO for assigning equipment to user
 */
export interface AssignToUserDto {
  userId: string;
  notes?: string;
}

/**
 * DTO for assigning equipment to room
 */
export interface AssignToRoomDto {
  roomId: string;
  notes?: string;
}

/**
 * DTO for unassigning equipment
 */
export interface UnassignDto {
  unassignType: 'user' | 'room' | 'all';
  notes?: string;
}

/**
 * DTO for transferring equipment between users
 */
export interface TransferDto {
  fromUserId: string;
  toUserId: string;
  notes?: string;
}

/**
 * DTO for bulk assignment operations
 */
export interface BulkAssignDto {
  equipmentIds: string[];
  assignmentType: 'user' | 'room';
  assignedToId: string;
  notes?: string;
}

/**
 * Bulk assignment result
 */
export interface BulkAssignmentResult {
  success: number;
  failed: number;
  errors: Array<{
    equipmentId: string;
    error: string;
  }>;
}

/**
 * Query parameters for assignment history
 */
export interface AssignmentHistoryQuery {
  limit?: number;
  offset?: number;
  assignmentType?: 'user' | 'room' | 'location';
}

/**
 * Assignment history response
 */
export interface AssignmentHistoryResponse {
  history: AssignmentHistoryWithRelations[];
  total: number;
}

/**
 * User context for assignment operations
 */
export interface AssignmentUserContext {
  id: string;
  email: string;
  displayName: string | null;
  firstName: string;
  lastName: string;
}

/**
 * Assignment Type Definitions
 * Type-safe interfaces for equipment assignment operations
 */

export interface EquipmentAssignment {
  equipmentId: string;
  assignedToUserId?: string;
  assignedToUser?: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    email: string;
  };
  roomId?: string;
  room?: {
    id: string;
    name: string;
    officeLocationId: string;
    location?: {
      name: string;
    };
  };
  officeLocationId?: string;
  officeLocation?: {
    id: string;
    name: string;
    code: string;
  };
  notes?: string;
  assignedAt: string;
  assignedBy: {
    id: string;
    displayName?: string | null;
    firstName?: string;
    lastName?: string;
  };
}

export interface AssignmentHistory {
  id: string;
  equipmentId: string;
  assignmentType: 'user' | 'room' | 'location' | 'unassign';
  assignedToId?: string;
  assignedToType?: string;
  assignedToName: string;
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
  unassignedAt?: string | null;
  notes?: string;
  equipmentName: string;
  equipmentTag: string;
  user?: {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
  };
}

export interface AssignmentHistoryResponse {
  history: AssignmentHistory[];
  total: number;
}

export interface AssignmentFormData {
  assignmentType: 'user' | 'room' | 'both';
  userId?: string;
  roomId?: string;
  notes?: string;
}

export interface AssignToUserRequest {
  userId: string;
  notes?: string;
}

export interface AssignToRoomRequest {
  roomId: string;
  notes?: string;
}

export interface UnassignRequest {
  unassignType: 'user' | 'room' | 'all';
  notes?: string;
}

export interface TransferRequest {
  fromUserId: string;
  toUserId: string;
  notes?: string;
}

export interface BulkAssignRequest {
  equipmentIds: string[];
  assignmentType: 'user' | 'room';
  assignedToId: string;
  notes?: string;
}

export interface BulkAssignmentResult {
  success: number;
  failed: number;
  errors: Array<{
    equipmentId: string;
    error: string;
  }>;
}

export interface AssignmentHistoryQuery {
  limit?: number;
  offset?: number;
  assignmentType?: 'user' | 'room' | 'location';
}

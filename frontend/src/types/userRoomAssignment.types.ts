/**
 * TypeScript types for User-to-Room Assignment feature
 */

export type AssignmentSource = 'primary' | 'assignment';

export interface AssignedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  primaryRoomId: string | null;
}

export interface MergedAssignment {
  id: string | null;
  userId: string;
  roomId: string;
  source: AssignmentSource;
  assignedAt: string | null;
  assignedBy: string | null;
  notes: string | null;
  user: AssignedUser;
  assignedByUser: {
    id: string;
    displayName: string | null;
  } | null;
}

export interface UserRoomAssignment {
  id: string;
  userId: string;
  roomId: string;
  assignedAt: string;
  assignedBy: string;
  notes: string | null;
  user: AssignedUser;
  assignedByUser: {
    id: string;
    displayName: string | null;
  };
}

export interface RoomWithAssignments {
  id: string;
  name: string;
  type: string | null;
  building: string | null;
  floor: number | null;
  capacity: number | null;
  isActive: boolean;
  notes: string | null;
  locationId: string;
  assignedUsers: MergedAssignment[];
}

export interface LocationRoomAssignmentsResponse {
  location: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  };
  rooms: RoomWithAssignments[];
  totalRooms: number;
  totalAssignments: number;
}

export interface AssignUsersResponse {
  assignedCount: number;
  totalRequested: number;
  alreadyAssignedCount: number;
  message: string;
}

export interface LocationRoomAssignmentsParams {
  search?: string;
  includeInactive?: boolean;
}

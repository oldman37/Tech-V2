/**
 * TypeScript types for Rooms
 * Use these types in your frontend application
 */

export type RoomType =
  | 'CLASSROOM'
  | 'OFFICE'
  | 'GYM'
  | 'CAFETERIA'
  | 'LIBRARY'
  | 'LAB'
  | 'MAINTENANCE'
  | 'SPORTS'
  | 'MUSIC'
  | 'MEDICAL'
  | 'CONFERENCE'
  | 'TECHNOLOGY'
  | 'TRANSPORTATION'
  | 'SPECIAL_ED'
  | 'GENERAL'
  | 'OTHER';

export interface Room {
  id: string;
  locationId: string;
  name: string;
  type: RoomType | null;
  building: string | null;
  floor: number | null;
  capacity: number | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

// With nested location relationship
export interface RoomWithLocation extends Room {
  location: {
    id: string;
    name: string;
    type: string;
  };
}

// Request types for API calls
export interface CreateRoomRequest {
  locationId: string;
  name: string;
  type?: RoomType;
  building?: string;
  floor?: number;
  capacity?: number;
  notes?: string;
}

export interface UpdateRoomRequest {
  name?: string;
  type?: RoomType;
  building?: string;
  floor?: number;
  capacity?: number;
  isActive?: boolean;
  notes?: string;
}

// Response types from API

/**
 * Pagination metadata for paginated responses
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response from GET /api/rooms with pagination
 */
export interface RoomsResponse {
  rooms: RoomWithLocation[];
  pagination: PaginationMetadata;
  total: number; // Maintained for backward compatibility
}

/**
 * Query parameters for room filtering and pagination
 */
export interface RoomQueryParams {
  page?: number;
  limit?: number;
  locationId?: string;
  type?: RoomType;
  isActive?: boolean;
  search?: string;
  sortBy?: 'name' | 'location' | 'type' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface RoomsByLocationResponse {
  locationId: string;
  locationName: string;
  rooms: Room[];
  total: number;
}

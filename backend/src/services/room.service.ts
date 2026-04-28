import { PrismaClient, Room, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';

/**
 * Query parameters for finding rooms
 * Enhanced with pagination and sorting parameters
 */
export interface RoomQuery {
  // Filter parameters
  locationId?: string;
  type?: string;
  isActive?: boolean;
  search?: string;
  
  // Pagination parameters
  page?: number;       // 1-indexed page number (default: 1)
  limit?: number;      // Items per page (default: 50, max: 1000)
  
  // Sorting parameters
  sortBy?: 'name' | 'location' | 'type' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Data transfer object for creating a room
 */
export interface CreateRoomDto {
  locationId: string;
  name: string;
  type?: string;
  building?: string;
  floor?: number;
  capacity?: number;
  notes?: string;
  createdBy?: string;
}

/**
 * Data transfer object for updating a room
 */
export interface UpdateRoomDto
  extends Partial<Omit<CreateRoomDto, 'locationId' | 'createdBy'>> {
  isActive?: boolean;
}

/**
 * Room with location details
 */
export interface RoomWithLocation extends Room {
  location: {
    id: string;
    name: string;
    type: string;
  };
}

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
 * Paginated room response
 */
export interface PaginatedRoomsResponse {
  rooms: RoomWithLocation[];
  pagination: PaginationMetadata;
  total: number; // Maintained for backward compatibility
}

/**
 * Room statistics aggregations
 */
export interface RoomStatistics {
  totalRooms: number;
  roomsByType: Array<{
    type: string | null;
    count: number;
  }>;
  roomsByLocation: Array<{
    locationId: string;
    locationName: string;
    roomCount: number;
  }>;
}

/**
 * Service for managing room operations
 * Handles all room CRUD operations within office locations
 */
export class RoomService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get rooms with filters and pagination
   * Enhanced with server-side pagination for improved performance
   * @param query - Query parameters for filtering and pagination
   * @returns Paginated rooms with location details and metadata
   */
  async findAll(query: RoomQuery): Promise<PaginatedRoomsResponse> {
    // Extract and set defaults for pagination parameters
    const {
      page = 1,
      limit = 50,
      search,
      locationId,
      type,
      isActive,
      sortBy = 'name',
      sortOrder = 'asc',
    } = query;

    // Build where clause for filtering
    const where: Prisma.RoomWhereInput = {};

    if (locationId) {
      where.locationId = locationId;
    }

    if (type) {
      where.type = type;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { building: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause for sorting
    let orderBy: Prisma.RoomOrderByWithRelationInput[] = [];
    
    switch (sortBy) {
      case 'location':
        orderBy = [
          { location: { name: sortOrder } },
          { name: 'asc' }, // Secondary sort by room name
        ];
        break;
      case 'type':
        orderBy = [
          { type: sortOrder },
          { name: 'asc' },
        ];
        break;
      case 'createdAt':
        orderBy = [{ createdAt: sortOrder }];
        break;
      case 'name':
      default:
        // Default: Group by location, then sort by room name
        orderBy = [
          { location: { name: 'asc' } },
          { name: sortOrder },
        ];
    }

    // Calculate pagination offset (skip)
    const skip = (page - 1) * limit;

    // Execute paginated query with total count
    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          location: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.room.count({ where }),
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return {
      rooms,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      total, // Maintained for backward compatibility
    };
  }

  /**
   * Get rooms for specific location
   * @param locationId - Location ID
   * @param isActive - Optional filter by active status
   * @returns Rooms for the location with metadata
   * @throws {NotFoundError} If location not found
   */
  async findByLocation(
    locationId: string,
    isActive?: boolean
  ): Promise<{
    locationId: string;
    locationName: string;
    rooms: Room[];
    total: number;
  }> {
    // Validate location exists
    const location = await this.prisma.officeLocation.findUnique({
      where: { id: locationId },
      select: { id: true, name: true },
    });

    if (!location) {
      throw new NotFoundError('Office location', locationId);
    }

    // Build where clause
    const where: Prisma.RoomWhereInput = { locationId };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Query rooms for location
    const rooms = await this.prisma.room.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return {
      locationId: location.id,
      locationName: location.name,
      rooms,
      total: rooms.length,
    };
  }

  /**
   * Get room by ID
   * @param roomId - Room ID
   * @returns Room with location details
   * @throws {NotFoundError} If room not found
   */
  async findById(roomId: string): Promise<RoomWithLocation> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    return room;
  }

  /**
   * Create new room
   * @param data - Room creation data
   * @returns Created room with location
   * @throws {NotFoundError} If location not found
   * @throws {ValidationError} If duplicate room name at location
   */
  async create(data: CreateRoomDto): Promise<RoomWithLocation> {
    // Validate location exists
    const location = await this.prisma.officeLocation.findUnique({
      where: { id: data.locationId },
    });

    if (!location) {
      throw new NotFoundError('Office location', data.locationId);
    }

    // Check for duplicate room name at same location
    const existing = await this.prisma.room.findUnique({
      where: {
        locationId_name: {
          locationId: data.locationId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new ValidationError(
        `Room "${data.name}" already exists at ${location.name}`,
        'name'
      );
    }

    // Create room
    const room = await this.prisma.room.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        type: data.type || null,
        building: data.building || null,
        floor: data.floor || null,
        capacity: data.capacity || null,
        notes: data.notes || null,
        isActive: true,
        createdBy: data.createdBy || null,
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return room;
  }

  /**
   * Update room
   * @param roomId - Room ID
   * @param data - Update data
   * @returns Updated room with location
   * @throws {NotFoundError} If room not found
   * @throws {ValidationError} If duplicate name at location
   */
  async update(roomId: string, data: UpdateRoomDto): Promise<RoomWithLocation> {
    // Validate room exists
    const existingRoom = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!existingRoom) {
      throw new NotFoundError('Room', roomId);
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existingRoom.name) {
      const duplicate = await this.prisma.room.findUnique({
        where: {
          locationId_name: {
            locationId: existingRoom.locationId,
            name: data.name,
          },
        },
      });

      if (duplicate) {
        const location = await this.prisma.officeLocation.findUnique({
          where: { id: existingRoom.locationId },
          select: { name: true },
        });
        
        throw new ValidationError(
          `Room "${data.name}" already exists at ${location?.name || 'this location'}`,
          'name'
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.building !== undefined) updateData.building = data.building;
    if (data.floor !== undefined) updateData.floor = data.floor;
    if (data.capacity !== undefined) updateData.capacity = data.capacity;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Update room
    const room = await this.prisma.room.update({
      where: { id: roomId },
      data: updateData,
      include: {
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return room;
  }

  /**
   * Delete room (soft or hard delete)
   * @param roomId - Room ID
   * @param soft - If true, performs soft delete (set isActive = false), otherwise hard delete
   * @throws {NotFoundError} If room not found
   */
  async delete(roomId: string, soft: boolean = true): Promise<void> {
    try {
      if (soft) {
        // Soft delete - set isActive = false
        await this.prisma.room.update({
          where: { id: roomId },
          data: { isActive: false },
        });
      } else {
        // Hard delete
        await this.prisma.room.delete({
          where: { id: roomId },
        });
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundError('Room', roomId);
      }
      throw error;
    }
  }

  /**
   * Get room statistics
   * @returns Aggregated statistics about rooms
   */
  async getStatistics(): Promise<RoomStatistics> {
    // Count total active rooms
    const totalRooms = await this.prisma.room.count({
      where: { isActive: true },
    });

    // Count rooms by type
    const roomsByTypeRaw = await this.prisma.room.groupBy({
      by: ['type'],
      where: { isActive: true },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const roomsByType = roomsByTypeRaw.map((item) => ({
      type: item.type,
      count: item._count.id,
    }));

    // Count rooms by location
    const roomsByLocationRaw = await this.prisma.room.groupBy({
      by: ['locationId'],
      where: { isActive: true },
      _count: {
        id: true,
      },
    });

    // Fetch location names
    const locationIds = roomsByLocationRaw.map((item) => item.locationId);
    const locations = await this.prisma.officeLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true },
    });

    const locationMap = new Map(locations.map((loc) => [loc.id, loc.name]));

    const roomsByLocation = roomsByLocationRaw
      .map((item) => ({
        locationId: item.locationId,
        locationName: locationMap.get(item.locationId) || 'Unknown',
        roomCount: item._count.id,
      }))
      .sort((a, b) => b.roomCount - a.roomCount);

    return {
      totalRooms,
      roomsByType,
      roomsByLocation,
    };
  }
}

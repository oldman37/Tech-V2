/**
 * Transportation Unit Service
 *
 * Manages the fleet registry (buses and vehicles).
 */
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { sanitizeText } from '../utils/redact';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import type {
  CreateTransportationUnitDto,
  UpdateTransportationUnitDto,
  CreateAssignmentDto,
} from '../validators/transportation.validators';

const log = createLogger('TransportationUnitService');

const UNIT_INCLUDE_BASE = {
  assignments: {
    where: { unassignedAt: null },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } },
    },
    orderBy: { assignedAt: 'desc' as const },
  },
};

export class TransportationUnitService {
  constructor(private prisma: PrismaClient) {}

  async getAll(filters: {
    type?: string;
    fuelType?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 25;
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.type)     where['type']     = filters.type;
    if (filters.fuelType) where['fuelType'] = filters.fuelType;
    if (filters.isActive !== undefined) where['isActive'] = filters.isActive;
    if (filters.search) {
      where['OR'] = [
        { unitNumber: { contains: filters.search, mode: 'insensitive' } },
        { make:       { contains: filters.search, mode: 'insensitive' } },
        { model:      { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.transportationUnit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { unitNumber: 'asc' },
        include: UNIT_INCLUDE_BASE,
      }),
      this.prisma.transportationUnit.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string) {
    const unit = await this.prisma.transportationUnit.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            user:         { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } },
            assignedBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
            unassignedBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
          },
        },
        fuelEntries: {
          orderBy: { entryDate: 'desc' },
          take: 5,
          include: {
            enteredBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
            fuelStation: { include: { officeLocation: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundError('TransportationUnit', id);
    return unit;
  }

  async create(data: CreateTransportationUnitDto, _createdById: string) {
    log.info('Creating transportation unit', { unitNumber: data.unitNumber });
    return this.prisma.transportationUnit.create({
      data: {
        unitNumber:    sanitizeText(data.unitNumber),
        type:          data.type,
        fuelType:      data.fuelType,
        vin:           data.vin           ? sanitizeText(data.vin)           : null,
        year:          data.year          ?? null,
        make:          data.make          ? sanitizeText(data.make)          : null,
        model:         data.model         ? sanitizeText(data.model)         : null,
        capacity:      data.capacity      ?? null,
        licensePlate:  data.licensePlate  ? sanitizeText(data.licensePlate)  : null,
        currentMileage: data.currentMileage ?? 0,
        notes:         data.notes         ? sanitizeText(data.notes)         : null,
      },
    });
  }

  async update(id: string, data: UpdateTransportationUnitDto) {
    const existing = await this.prisma.transportationUnit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('TransportationUnit', id);

    const updateData: Record<string, unknown> = {};
    if (data.unitNumber    !== undefined) updateData['unitNumber']    = sanitizeText(data.unitNumber!);
    if (data.type          !== undefined) updateData['type']          = data.type;
    if (data.fuelType      !== undefined) updateData['fuelType']      = data.fuelType;
    if (data.vin           !== undefined) updateData['vin']           = data.vin ? sanitizeText(data.vin) : null;
    if (data.year          !== undefined) updateData['year']          = data.year;
    if (data.make          !== undefined) updateData['make']          = data.make ? sanitizeText(data.make) : null;
    if (data.model         !== undefined) updateData['model']         = data.model ? sanitizeText(data.model) : null;
    if (data.capacity      !== undefined) updateData['capacity']      = data.capacity;
    if (data.licensePlate  !== undefined) updateData['licensePlate']  = data.licensePlate ? sanitizeText(data.licensePlate) : null;
    if (data.currentMileage !== undefined) updateData['currentMileage'] = data.currentMileage;
    if (data.notes         !== undefined) updateData['notes']         = data.notes ? sanitizeText(data.notes) : null;

    return this.prisma.transportationUnit.update({ where: { id }, data: updateData });
  }

  async deactivate(id: string) {
    const existing = await this.prisma.transportationUnit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('TransportationUnit', id);

    // 409 if unit has fuel entries in current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthEntries = await this.prisma.fuelConsumptionEntry.count({
      where: { transportationUnitId: id, reportingMonth: currentMonth },
    });
    if (currentMonthEntries > 0) {
      throw new ConflictError(
        `Cannot deactivate unit — it has ${currentMonthEntries} fuel entries in the current month (${currentMonth}).`,
        { entriesCount: currentMonthEntries, reportingMonth: currentMonth },
      );
    }

    return this.prisma.transportationUnit.update({ where: { id }, data: { isActive: false } });
  }

  async getMyUnit(userId: string) {
    return this.prisma.transportationUnitAssignment.findFirst({
      where: { userId, unassignedAt: null },
      include: {
        unit: true,
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async getAssignments(unitId: string) {
    const existing = await this.prisma.transportationUnit.findUnique({ where: { id: unitId } });
    if (!existing) throw new NotFoundError('TransportationUnit', unitId);

    return this.prisma.transportationUnitAssignment.findMany({
      where: { transportationUnitId: unitId },
      orderBy: { assignedAt: 'desc' },
      include: {
        user:         { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } },
        assignedBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
        unassignedBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
  }

  async assignUser(unitId: string, data: CreateAssignmentDto, assignedById: string) {
    const unit = await this.prisma.transportationUnit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundError('TransportationUnit', unitId);

    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    if (!user.isActive) throw new ValidationError('Cannot assign an inactive user to a unit');

    // Check for existing active assignment for this user to this unit
    const existingActive = await this.prisma.transportationUnitAssignment.findFirst({
      where: { transportationUnitId: unitId, userId: data.userId, unassignedAt: null },
    });
    if (existingActive) {
      throw new ConflictError('This user is already actively assigned to this unit');
    }

    return this.prisma.transportationUnitAssignment.create({
      data: {
        transportationUnitId: unitId,
        userId:      data.userId,
        isPrimary:   data.isPrimary ?? true,
        assignedById,
        notes:       data.notes ? sanitizeText(data.notes) : null,
      },
      include: {
        user:       { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
  }

  async unassignUser(unitId: string, assignmentId: string, unassignedById: string) {
    const assignment = await this.prisma.transportationUnitAssignment.findFirst({
      where: { id: assignmentId, transportationUnitId: unitId },
    });
    if (!assignment) throw new NotFoundError('TransportationUnitAssignment', assignmentId);
    if (assignment.unassignedAt) throw new ConflictError('This assignment is already inactive');

    return this.prisma.transportationUnitAssignment.update({
      where: { id: assignmentId },
      data: { unassignedAt: new Date(), unassignedById },
    });
  }
}

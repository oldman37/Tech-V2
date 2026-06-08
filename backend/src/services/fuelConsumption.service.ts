/**
 * Fuel Consumption Entry Service
 *
 * Handles logging and retrieval of fuel consumption entries.
 * Level 1 users can only see and create their own entries.
 * Level 2+ users have full read access.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { sanitizeText } from '../utils/redact';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { FuelTankService } from './fuelTank.service';
import { FuelLowAlertService } from './fuelLowAlert.service';
import type {
  CreateFuelEntryDto,
  UpdateFuelEntryDto,
} from '../validators/transportation.validators';

const log = createLogger('FuelConsumptionService');

function toReportingMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class FuelConsumptionService {
  constructor(private prisma: PrismaClient) {}

  async getAll(
    filters: {
      unitId?: string;
      userId?: string;
      fuelStationId?: string;
      reportingMonth?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    requestingUserId: string,
    requestingPermLevel: number,
  ) {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 25;
    const skip  = (page - 1) * limit;

    const where: Prisma.FuelConsumptionEntryWhereInput = {};

    // Level 1 can only see own entries
    if (requestingPermLevel < 2) {
      where.enteredById = requestingUserId;
    } else if (filters.userId) {
      where.enteredById = filters.userId;
    }

    if (filters.unitId)         where.transportationUnitId = filters.unitId;
    if (filters.fuelStationId)  where.fuelStationId = filters.fuelStationId;
    if (filters.reportingMonth) where.reportingMonth = filters.reportingMonth;
    if (filters.from || filters.to) {
      where.entryDate = {};
      if (filters.from) where.entryDate.gte = new Date(filters.from);
      if (filters.to)   where.entryDate.lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.fuelConsumptionEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: 'desc' },
        include: {
          unit:        { select: { id: true, unitNumber: true, type: true, fuelType: true } },
          enteredBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
          fuelStation: {
            include: { officeLocation: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.fuelConsumptionEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getMyEntries(
    userId: string,
    filters: {
      reportingMonth?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 25;
    const skip  = (page - 1) * limit;

    const where: Prisma.FuelConsumptionEntryWhereInput = { enteredById: userId };
    if (filters.reportingMonth) where.reportingMonth = filters.reportingMonth;
    if (filters.from || filters.to) {
      where.entryDate = {};
      if (filters.from) where.entryDate.gte = new Date(filters.from);
      if (filters.to)   where.entryDate.lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.fuelConsumptionEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: 'desc' },
        include: {
          unit:        { select: { id: true, unitNumber: true, type: true, fuelType: true } },
          fuelStation: {
            include: { officeLocation: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.fuelConsumptionEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string, requestingUserId: string, requestingPermLevel: number) {
    const entry = await this.prisma.fuelConsumptionEntry.findUnique({
      where: { id },
      include: {
        unit:        { select: { id: true, unitNumber: true, type: true, fuelType: true } },
        enteredBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
        fuelStation: {
          include: { officeLocation: { select: { id: true, name: true } } },
        },
      },
    });

    // Return 404 for non-existent OR unauthorised (level 1 can't see others' entries)
    if (!entry || (requestingPermLevel < 2 && entry.enteredById !== requestingUserId)) {
      throw new NotFoundError('FuelConsumptionEntry', id);
    }

    return entry;
  }

  async create(
    data: CreateFuelEntryDto,
    requestingUserId: string,
    requestingPermLevel: number,
  ) {
    // For level 1 users: if they have an active assignment, the unit must match it
    if (requestingPermLevel < 2) {
      const activeAssignment = await this.prisma.transportationUnitAssignment.findFirst({
        where: { userId: requestingUserId, unassignedAt: null },
      });
      if (activeAssignment && activeAssignment.transportationUnitId !== data.transportationUnitId) {
        throw new ValidationError(
          'You may only log fuel for your assigned unit',
          'transportationUnitId',
        );
      }
    }

    // Validate the fuel station exists and is active
    const station = await this.prisma.transportationFuelStation.findUnique({
      where: { id: data.fuelStationId },
    });
    if (!station || !station.isActive) {
      throw new ValidationError('The selected fuel station is not available', 'fuelStationId');
    }

    const entryDate = data.entryDate ? new Date(data.entryDate) : new Date();
    const reportingMonth = toReportingMonth(entryDate);

    // Auto-compute totalCost when not supplied
    let totalCost: number | null = data.totalCost ?? null;
    if (totalCost === null && data.costPerUnit != null && data.fuelAmount != null) {
      totalCost = parseFloat((data.costPerUnit * data.fuelAmount).toFixed(2));
    }

    const entry = await this.prisma.fuelConsumptionEntry.create({
      data: {
        transportationUnitId: data.transportationUnitId,
        enteredById:          requestingUserId,
        fuelStationId:        data.fuelStationId,
        tankId:               data.tankId ?? null,
        entryDate,
        fuelAmount:      data.fuelAmount,
        fuelUnit:        data.fuelUnit ?? 'gallons',
        mileageAtFueling: data.mileageAtFueling,
        costPerUnit:     data.costPerUnit ?? null,
        totalCost:       totalCost !== null ? totalCost : null,
        reportingMonth,
        notes: data.notes ? sanitizeText(data.notes) : null,
      },
    });

    // Decrement tank fill level if a tank is linked
    if (data.tankId) {
      const tankService = new FuelTankService(this.prisma);
      try {
        const fuelGallons = data.fuelUnit === 'liters'
          ? data.fuelAmount * 0.264172  // convert to gallons
          : data.fuelAmount;            // gallons or kWh (kWh tanks unlikely but safe)
        await tankService.adjustFill(data.tankId, -fuelGallons);
      } catch (err) {
        log.error('Failed to adjust tank fill on consumption entry', {
          entryId: data.tankId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Fire-and-forget low-fuel alert check
      const alertService = new FuelLowAlertService(this.prisma);
      alertService.checkAndSendAlerts(data.tankId).catch((err: unknown) => {
        log.error('Failed to check/send fuel low alert', {
          tankId: data.tankId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Update unit currentMileage if higher
    const unit = await this.prisma.transportationUnit.findUnique({
      where: { id: data.transportationUnitId },
      select: { currentMileage: true },
    });
    if (unit && data.mileageAtFueling > unit.currentMileage) {
      await this.prisma.transportationUnit.update({
        where: { id: data.transportationUnitId },
        data: { currentMileage: data.mileageAtFueling },
      });
    }

    log.info('Fuel entry created', {
      entryId: entry.id,
      unitId: data.transportationUnitId,
      userId: requestingUserId,
      reportingMonth,
    });

    return entry;
  }

  async update(id: string, data: UpdateFuelEntryDto, requestingPermLevel: number) {
    if (requestingPermLevel < 2) {
      throw new ConflictError('Only level 2+ users may edit fuel entries');
    }

    const existing = await this.prisma.fuelConsumptionEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FuelConsumptionEntry', id);

    const updateData: Record<string, unknown> = {};
    if (data.transportationUnitId !== undefined) updateData['transportationUnitId'] = data.transportationUnitId;
    if (data.fuelStationId !== undefined) {
      // Re-validate fuel station is active when it changes
      const station = await this.prisma.transportationFuelStation.findUnique({
        where: { id: data.fuelStationId },
      });
      if (!station || !station.isActive) {
        throw new ValidationError('Fuel station is not active', 'fuelStationId');
      }
      updateData['fuelStationId'] = data.fuelStationId;
    }
    if (data.fuelAmount !== undefined)           updateData['fuelAmount'] = data.fuelAmount;
    if (data.fuelUnit !== undefined)             updateData['fuelUnit'] = data.fuelUnit;
    if (data.mileageAtFueling !== undefined)     updateData['mileageAtFueling'] = data.mileageAtFueling;
    if (data.costPerUnit !== undefined)          updateData['costPerUnit'] = data.costPerUnit;
    if (data.totalCost !== undefined)            updateData['totalCost'] = data.totalCost;
    if (data.notes !== undefined)                updateData['notes'] = data.notes ? sanitizeText(data.notes) : null;

    if (data.entryDate !== undefined) {
      const newDate = new Date(data.entryDate);
      updateData['entryDate'] = newDate;
      updateData['reportingMonth'] = toReportingMonth(newDate);
    }

    return this.prisma.fuelConsumptionEntry.update({ where: { id }, data: updateData });
  }

  async delete(id: string) {
    const existing = await this.prisma.fuelConsumptionEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FuelConsumptionEntry', id);
    await this.prisma.fuelConsumptionEntry.delete({ where: { id } });
  }
}

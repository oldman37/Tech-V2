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
  UpsertFuelMileageBaselineDto,
} from '../validators/transportation.validators';

const log = createLogger('FuelConsumptionService');

function toReportingMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Local midnight of the 1st of the given YYYY-MM month. */
function monthStartDate(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/**
 * Parses an entryDate value as a local calendar date rather than UTC, so
 * reportingMonth reflects the day the user actually picked regardless of the
 * server's UTC offset. `new Date('2026-09-01')` parses as UTC midnight,
 * which in a UTC-negative timezone (e.g. America/Chicago) reads back as the
 * evening of the previous day — misclassifying reportingMonth specifically
 * for the 1st of every month. A full ISO timestamp (has a "T") is left as-is.
 */
function parseEntryDate(value?: string): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
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

  /**
   * Monthly summary for My Fuel History: one row per (user, vehicle) for the
   * given month, with total fuel and miles driven. Miles driven chains
   * consecutive fill-ups — previousMileage is the reading from the fill-up
   * immediately before the latest one, whether that's earlier in the same
   * month or the most recent fill-up before this month started (used when
   * this month has only one fill-up so far — no matter how many months back
   * that prior fill-up was, so a skipped month doesn't break the chain).
   */
  async getMonthlySummary(
    filters: { reportingMonth?: string; unitId?: string; userId?: string },
    requestingUserId: string,
    requestingPermLevel: number,
  ) {
    const reportingMonth = filters.reportingMonth ?? toReportingMonth(new Date());

    const where: Prisma.FuelConsumptionEntryWhereInput = { reportingMonth };
    if (requestingPermLevel < 2) {
      where.enteredById = requestingUserId;
    } else if (filters.userId) {
      where.enteredById = filters.userId;
    }
    if (filters.unitId) where.transportationUnitId = filters.unitId;

    const entries = await this.prisma.fuelConsumptionEntry.findMany({
      where,
      orderBy: { entryDate: 'asc' },
      include: {
        unit:        { select: { id: true, unitNumber: true, type: true, fuelType: true } },
        enteredBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
        fuelStation: {
          include: { officeLocation: { select: { id: true, name: true } } },
        },
      },
    });

    if (entries.length === 0) return [];

    type Entry = (typeof entries)[number];
    const groups = new Map<string, {
      userId: string;
      userName: string;
      unitId: string;
      unitNumber: string;
      totalFuelAmount: number;
      fuelUnit: string;
      entries: Entry[]; // chronological — `entries` is ordered by entryDate asc
    }>();

    for (const entry of entries) {
      const key = `${entry.enteredById}::${entry.transportationUnitId}`;
      let group = groups.get(key);
      if (!group) {
        const userName = entry.enteredBy.displayName
          ?? (`${entry.enteredBy.firstName ?? ''} ${entry.enteredBy.lastName ?? ''}`.trim() || '—');
        group = {
          userId: entry.enteredById,
          userName,
          unitId: entry.transportationUnitId,
          unitNumber: entry.unit.unitNumber,
          totalFuelAmount: 0,
          fuelUnit: entry.fuelUnit,
          entries: [],
        };
        groups.set(key, group);
      }
      group.totalFuelAmount += Number(entry.fuelAmount);
      group.entries.push(entry);
    }

    // Bulk-fetch, for (user, unit) pairs that only have one fill-up this
    // month, the single most recent reading from *before* this month —
    // however many months back that was — used as the fallback previous
    // reading. `distinct` (Postgres DISTINCT ON under the hood) combined
    // with a descending order gets exactly one row per pair in one query.
    const userIds = [...new Set(entries.map((e) => e.enteredById))];
    const unitIds = [...new Set(entries.map((e) => e.transportationUnitId))];
    const priorEntries = await this.prisma.fuelConsumptionEntry.findMany({
      where: {
        entryDate: { lt: monthStartDate(reportingMonth) },
        enteredById: { in: userIds },
        transportationUnitId: { in: unitIds },
      },
      distinct: ['enteredById', 'transportationUnitId'],
      orderBy: { entryDate: 'desc' },
      select: { enteredById: true, transportationUnitId: true, mileageAtFueling: true },
    });

    const priorLastByKey = new Map<string, number>();
    for (const e of priorEntries) {
      priorLastByKey.set(`${e.enteredById}::${e.transportationUnitId}`, e.mileageAtFueling);
    }

    // Fall back further to a manually-entered starting mileage (see
    // FuelMileageBaseline) for pairs with no real fuel history before this
    // month at all — e.g. a driver who didn't use this system last month.
    const baselines = await this.prisma.fuelMileageBaseline.findMany({
      where: {
        userId: { in: userIds },
        transportationUnitId: { in: unitIds },
      },
      select: { userId: true, transportationUnitId: true, mileage: true },
    });
    const baselineByKey = new Map<string, number>();
    for (const b of baselines) {
      baselineByKey.set(`${b.userId}::${b.transportationUnitId}`, b.mileage);
    }

    const rows = Array.from(groups.entries()).map(([key, g]) => {
      const latest = g.entries[g.entries.length - 1]!;
      const latestMileage = latest.mileageAtFueling;
      // Chain to the fill-up right before the latest one — earlier this
      // month if there is one, otherwise the most recent reading before
      // this month started (real entry, then manual baseline), regardless
      // of how far back it was.
      const previousMileage = g.entries.length > 1
        ? g.entries[g.entries.length - 2]!.mileageAtFueling
        : priorLastByKey.get(key) ?? baselineByKey.get(key) ?? null;
      const milesDriven = previousMileage !== null ? latestMileage - previousMileage : null;
      return {
        userId: g.userId,
        userName: g.userName,
        unitId: g.unitId,
        unitNumber: g.unitNumber,
        reportingMonth,
        totalFuelAmount: parseFloat(g.totalFuelAmount.toFixed(3)),
        fuelUnit: g.fuelUnit,
        previousMileage,
        latestMileage,
        milesDriven,
        entries: g.entries,
      };
    });

    rows.sort((a, b) => a.userName.localeCompare(b.userName) || a.unitNumber.localeCompare(b.unitNumber));
    return rows;
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

  /**
   * For level 1 users: if they have an active assignment, `unitId` must
   * match it — unless the selected unit is marked county-wide, which any
   * driver may act on regardless of their own assignment.
   */
  private async assertUnitAccessibleToDriver(unitId: string, requestingUserId: string, message: string) {
    const activeAssignment = await this.prisma.transportationUnitAssignment.findFirst({
      where: { userId: requestingUserId, unassignedAt: null },
    });
    if (activeAssignment && activeAssignment.transportationUnitId !== unitId) {
      const selectedUnit = await this.prisma.transportationUnit.findUnique({
        where: { id: unitId },
        select: { isCountyWide: true },
      });
      if (!selectedUnit?.isCountyWide) {
        throw new ValidationError(message, 'transportationUnitId');
      }
    }
  }

  async create(
    data: CreateFuelEntryDto,
    requestingUserId: string,
    requestingPermLevel: number,
  ) {
    if (requestingPermLevel < 2) {
      await this.assertUnitAccessibleToDriver(
        data.transportationUnitId,
        requestingUserId,
        'You may only log fuel for your assigned unit or a county-wide vehicle',
      );
    }

    // Validate the fuel station exists and is active
    const station = await this.prisma.transportationFuelStation.findUnique({
      where: { id: data.fuelStationId },
    });
    if (!station || !station.isActive) {
      throw new ValidationError('The selected fuel station is not available', 'fuelStationId');
    }

    const entryDate = parseEntryDate(data.entryDate);
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
      const newDate = parseEntryDate(data.entryDate);
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

  /**
   * Sets (or replaces) the one-time starting mileage baseline for a
   * (user, unit) pair — see FuelMileageBaseline. Level 1 users may only set
   * their own, for their assigned unit or a county-wide vehicle; level 2+
   * may set it on behalf of any user.
   */
  async upsertMileageBaseline(
    data: UpsertFuelMileageBaselineDto,
    requestingUserId: string,
    requestingPermLevel: number,
  ) {
    const targetUserId = requestingPermLevel >= 2 && data.userId ? data.userId : requestingUserId;

    if (requestingPermLevel < 2) {
      await this.assertUnitAccessibleToDriver(
        data.transportationUnitId,
        requestingUserId,
        'You may only set a starting mileage for your assigned unit or a county-wide vehicle',
      );
    }

    return this.prisma.fuelMileageBaseline.upsert({
      where: {
        transportationUnitId_userId: {
          transportationUnitId: data.transportationUnitId,
          userId: targetUserId,
        },
      },
      update: {
        mileage:     data.mileage,
        asOfMonth:   data.asOfMonth,
        enteredById: requestingUserId,
      },
      create: {
        transportationUnitId: data.transportationUnitId,
        userId:                targetUserId,
        mileage:               data.mileage,
        asOfMonth:             data.asOfMonth,
        enteredById:           requestingUserId,
      },
    });
  }
}

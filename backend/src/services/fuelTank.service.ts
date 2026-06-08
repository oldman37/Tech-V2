/**
 * Fuel Tank Service
 *
 * CRUD operations for FuelTank records attached to TransportationFuelStations.
 * Also maintains the denormalized currentFillGallons field: it is incremented
 * on delivery and decremented on fuel consumption entry (handled in callers).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { sanitizeText } from '../utils/redact';
import { NotFoundError } from '../utils/errors';
import type { CreateFuelTankDto, UpdateFuelTankDto } from '../validators/transportation.validators';

const log = createLogger('FuelTankService');

export class FuelTankService {
  constructor(private prisma: PrismaClient) {}

  async getTanksByStation(stationId: string) {
    const station = await this.prisma.transportationFuelStation.findUnique({
      where: { id: stationId },
    });
    if (!station) throw new NotFoundError('TransportationFuelStation', stationId);

    const tanks = await this.prisma.fuelTank.findMany({
      where: { stationId },
      include: {
        deliveries: {
          orderBy: { deliveryDate: 'desc' },
          take: 1,
          select: {
            id: true,
            deliveryDate: true,
            gallonsDelivered: true,
            vendorName: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (tanks.length === 0) return tanks;

    // Compute live fill levels for all tanks in two groupBy queries (avoids
    // relying solely on the denormalized currentFillGallons which may be stale
    // after edits or deletes of consumption entries).
    const tankIds = tanks.map((t) => t.id);
    const [deliverySums, consumptionByUnit] = await Promise.all([
      this.prisma.fuelTankDelivery.groupBy({
        by:    ['tankId'],
        where: { tankId: { in: tankIds } },
        _sum:  { gallonsDelivered: true },
      }),
      this.prisma.fuelConsumptionEntry.groupBy({
        by:    ['tankId', 'fuelUnit'],
        where: { tankId: { in: tankIds } },
        _sum:  { fuelAmount: true },
      }),
    ]);

    const deliveredMap = new Map<string, number>(
      deliverySums.map((r) => [r.tankId, Number(r._sum.gallonsDelivered ?? 0)]),
    );
    const consumedMap = new Map<string, number>();
    for (const row of consumptionByUnit) {
      const tid = row.tankId!;
      const amt = Number(row._sum.fuelAmount ?? 0);
      const gallons = row.fuelUnit === 'liters' ? amt * 0.264172 : amt;
      consumedMap.set(tid, (consumedMap.get(tid) ?? 0) + gallons);
    }

    return tanks.map((tank) => {
      const delivered = deliveredMap.get(tank.id) ?? 0;
      const consumed  = consumedMap.get(tank.id) ?? 0;
      const cap       = Number(tank.capacityGallons);
      const initial   = Number(tank.initialFillGallons ?? 0);
      const liveFill  = Math.max(0, Math.min(cap, initial + delivered - consumed));
      return { ...tank, currentFillGallons: liveFill as unknown as Prisma.Decimal };
    });
  }

  async getById(tankId: string) {
    const tank = await this.prisma.fuelTank.findUnique({
      where: { id: tankId },
      include: {
        station: {
          include: {
            officeLocation: { select: { id: true, name: true, city: true } },
          },
        },
      },
    });
    if (!tank) throw new NotFoundError('FuelTank', tankId);
    return tank;
  }

  async createTank(stationId: string, data: CreateFuelTankDto, createdById: string) {
    const station = await this.prisma.transportationFuelStation.findUnique({
      where: { id: stationId },
    });
    if (!station) throw new NotFoundError('TransportationFuelStation', stationId);

    log.info('Creating fuel tank', { stationId, fuelType: data.fuelType });

    // Default initialFillGallons to capacityGallons (tank starts full) if not
    // explicitly provided. This ensures the live level calculation starts from
    // the correct baseline rather than treating the tank as empty.
    const initialFill = data.initialFillGallons !== undefined
      ? data.initialFillGallons
      : data.capacityGallons;

    return this.prisma.fuelTank.create({
      data: {
        stationId,
        createdById,
        fuelType:              data.fuelType,
        label:                 data.label ? sanitizeText(data.label) : null,
        capacityGallons:       data.capacityGallons,
        initialFillGallons:    initialFill,
        currentFillGallons:    initialFill,
        alertThresholdPercent: data.alertThresholdPercent ?? 30,
        alertEnabled:          data.alertEnabled ?? true,
        isActive:              true,
        sortOrder:             data.sortOrder ?? 0,
        notes:                 data.notes ? sanitizeText(data.notes) : null,
      },
    });
  }

  async updateTank(tankId: string, data: UpdateFuelTankDto) {
    const existing = await this.prisma.fuelTank.findUnique({ where: { id: tankId } });
    if (!existing) throw new NotFoundError('FuelTank', tankId);

    const updateData: Prisma.FuelTankUpdateInput = {};
    if (data.label              !== undefined) updateData.label              = data.label ? sanitizeText(data.label) : null;
    if (data.fuelType           !== undefined) updateData.fuelType           = data.fuelType;
    if (data.capacityGallons    !== undefined) updateData.capacityGallons    = data.capacityGallons;
    if (data.initialFillGallons !== undefined) updateData.initialFillGallons = data.initialFillGallons;
    if (data.alertThresholdPercent !== undefined) updateData.alertThresholdPercent = data.alertThresholdPercent;
    if (data.alertEnabled       !== undefined) updateData.alertEnabled       = data.alertEnabled;
    if (data.isActive           !== undefined) updateData.isActive           = data.isActive;
    if (data.sortOrder          !== undefined) updateData.sortOrder          = data.sortOrder;
    if (data.notes              !== undefined) updateData.notes              = data.notes ? sanitizeText(data.notes) : null;

    log.info('Updating fuel tank', { tankId });
    return this.prisma.fuelTank.update({ where: { id: tankId }, data: updateData });
  }

  async deleteTank(tankId: string) {
    const existing = await this.prisma.fuelTank.findUnique({ where: { id: tankId } });
    if (!existing) throw new NotFoundError('FuelTank', tankId);

    // Soft delete — keeps history intact
    log.info('Soft-deleting fuel tank', { tankId });
    return this.prisma.fuelTank.update({
      where: { id: tankId },
      data:  { isActive: false },
    });
  }

  /**
   * Returns the current fill level computed from live aggregate queries over
   * deliveries and consumption entries. This avoids relying solely on the
   * denormalized `currentFillGallons` field and ensures accuracy regardless of
   * any update/delete operations on related records.
   */
  async calculateCurrentLevel(tankId: string): Promise<{
    gallonsCurrent: number;
    gallonsCapacity: number;
    percentFull: number;
  }> {
    const tank = await this.prisma.fuelTank.findUnique({
      where: { id: tankId },
      select: { capacityGallons: true, initialFillGallons: true },
    });
    if (!tank) throw new NotFoundError('FuelTank', tankId);

    const [deliverySum, consumptionByUnit] = await Promise.all([
      this.prisma.fuelTankDelivery.aggregate({
        where: { tankId },
        _sum:  { gallonsDelivered: true },
      }),
      this.prisma.fuelConsumptionEntry.groupBy({
        by:    ['fuelUnit'],
        where: { tankId },
        _sum:  { fuelAmount: true },
      }),
    ]);

    const totalDelivered = Number(deliverySum._sum.gallonsDelivered ?? 0);
    // Convert each entry's fuelAmount to gallons before summing.
    // fuelAmount is stored in the original unit (gallons, liters, or kWh).
    const totalConsumed  = consumptionByUnit.reduce((acc, row) => {
      const amt = Number(row._sum.fuelAmount ?? 0);
      return acc + (row.fuelUnit === 'liters' ? amt * 0.264172 : amt);
    }, 0);
    const gallonsCapacity = Number(tank.capacityGallons);
    const initialFill     = Number(tank.initialFillGallons ?? 0);
    const gallonsCurrent  = Math.max(0, Math.min(gallonsCapacity, initialFill + totalDelivered - totalConsumed));
    const percentFull     = gallonsCapacity > 0
      ? Math.max(0, Math.min(100, (gallonsCurrent / gallonsCapacity) * 100))
      : 0;

    return { gallonsCurrent, gallonsCapacity, percentFull };
  }

  /**
   * Adjusts the cached `currentFillGallons` field by `delta` using a Prisma
   * transaction with read-clamp-write (no raw SQL).
   * A positive delta = delivery/addition; negative delta = consumption.
   * Clamps to [0, capacityGallons].
   */
  async adjustFill(tankId: string, delta: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const tank = await tx.fuelTank.findUnique({
        where:  { id: tankId },
        select: { currentFillGallons: true, capacityGallons: true },
      });
      if (!tank) return;
      const newFill = Math.max(
        0,
        Math.min(
          Number(tank.capacityGallons),
          Number(tank.currentFillGallons) + delta,
        ),
      );
      await tx.fuelTank.update({
        where: { id: tankId },
        data:  { currentFillGallons: newFill },
      });
    });
  }
}

/**
 * Fuel Tank Delivery Service
 *
 * Records fuel deliveries to a tank and increments currentFillGallons.
 */
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { sanitizeText } from '../utils/redact';
import { NotFoundError } from '../utils/errors';
import { FuelTankService } from './fuelTank.service';
import type { RecordDeliveryDto } from '../validators/transportation.validators';

const log = createLogger('FuelTankDeliveryService');

export class FuelTankDeliveryService {
  private tankService: FuelTankService;

  constructor(private prisma: PrismaClient) {
    this.tankService = new FuelTankService(prisma);
  }

  async recordDelivery(tankId: string, data: RecordDeliveryDto, enteredById: string) {
    const tank = await this.prisma.fuelTank.findUnique({ where: { id: tankId } });
    if (!tank || !tank.isActive) throw new NotFoundError('FuelTank', tankId);

    const deliveryDate = data.deliveryDate ? new Date(data.deliveryDate) : new Date();

    // Auto-compute totalCost if not provided
    let totalCost = data.totalCost ?? null;
    if (totalCost === null && data.costPerGallon != null) {
      totalCost = parseFloat((data.costPerGallon * data.gallonsDelivered).toFixed(2));
    }

    const delivery = await this.prisma.fuelTankDelivery.create({
      data: {
        tankId,
        enteredById,
        deliveryDate,
        gallonsDelivered: data.gallonsDelivered,
        vendorName:       data.vendorName   ? sanitizeText(data.vendorName)   : null,
        invoiceNumber:    data.invoiceNumber ? sanitizeText(data.invoiceNumber) : null,
        costPerGallon:    data.costPerGallon ?? null,
        totalCost:        totalCost,
        notes:            data.notes ? sanitizeText(data.notes) : null,
      },
    });

    // Increment the maintained fill level
    await this.tankService.adjustFill(tankId, data.gallonsDelivered);

    log.info('Fuel delivery recorded', {
      deliveryId: delivery.id,
      tankId,
      gallonsDelivered: data.gallonsDelivered,
    });

    return delivery;
  }

  async getDeliveriesByTank(tankId: string) {
    const tank = await this.prisma.fuelTank.findUnique({ where: { id: tankId } });
    if (!tank) throw new NotFoundError('FuelTank', tankId);

    return this.prisma.fuelTankDelivery.findMany({
      where: { tankId },
      include: {
        enteredBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
      orderBy: { deliveryDate: 'desc' },
    });
  }
}

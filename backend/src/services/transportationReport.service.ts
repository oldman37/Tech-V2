/**
 * Transportation Report Service
 *
 * Generates fuel consumption and DOT status reports.
 * Also handles the monthly report scheduled job.
 */
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { DotPhysicalService } from './dotPhysical.service';
import {
  sendMonthlyFuelReportEmail,
  sendGasThresholdAlertEmail,
} from './email.service';

const log = createLogger('TransportationReportService');

export class TransportationReportService {
  constructor(private prisma: PrismaClient) {}

  async getMonthlyFuelReport(month: string) {
    const entries = await this.prisma.fuelConsumptionEntry.findMany({
      where: { reportingMonth: month },
      include: {
        unit:        { select: { id: true, unitNumber: true, type: true, fuelType: true } },
        enteredBy:   { select: { id: true, firstName: true, lastName: true, displayName: true } },
        fuelStation: {
          include: { officeLocation: { select: { id: true, name: true } } },
        },
      },
      orderBy: { entryDate: 'asc' },
    });

    const settings = await this.prisma.transportationSettings.findUnique({
      where: { id: 'singleton' },
    });

    // Aggregate by unit
    const byUnit: Record<string, { unitId: string; unitNumber: string; fuelType: string; totalGallons: number; totalCost: number; entryCount: number }> = {};
    // Aggregate by user
    const byUser: Record<string, { userId: string; displayName: string; totalGallons: number; totalCost: number; entryCount: number }> = {};

    let totalGallons = 0;
    let totalGasGallons = 0;
    let totalCost = 0;

    for (const entry of entries) {
      const gallons = Number(entry.fuelAmount);
      const cost    = Number(entry.totalCost ?? 0);

      totalGallons += gallons;
      totalCost    += cost;
      if (entry.unit.fuelType === 'GASOLINE') totalGasGallons += gallons;

      // By unit
      const uk = entry.unit.id;
      if (!byUnit[uk]) {
        byUnit[uk] = { unitId: entry.unit.id, unitNumber: entry.unit.unitNumber, fuelType: entry.unit.fuelType, totalGallons: 0, totalCost: 0, entryCount: 0 };
      }
      byUnit[uk].totalGallons += gallons;
      byUnit[uk].totalCost    += cost;
      byUnit[uk].entryCount   += 1;

      // By user
      const uu = entry.enteredBy.id;
      if (!byUser[uu]) {
        byUser[uu] = { userId: entry.enteredBy.id, displayName: entry.enteredBy.displayName ?? `${entry.enteredBy.firstName} ${entry.enteredBy.lastName}`, totalGallons: 0, totalCost: 0, entryCount: 0 };
      }
      byUser[uu].totalGallons += gallons;
      byUser[uu].totalCost    += cost;
      byUser[uu].entryCount   += 1;
    }

    // Top gas user
    let topGasUser: { displayName: string; gallons: number } | null = null;
    for (const entry of entries) {
      if (entry.unit.fuelType !== 'GASOLINE') continue;
      const uu = byUser[entry.enteredBy.id];
      if (!topGasUser || uu.totalGallons > topGasUser.gallons) {
        topGasUser = { displayName: uu.displayName, gallons: uu.totalGallons };
      }
    }

    const thresholdGallons = settings?.gasFuelThresholdEnabled && settings.gasFuelThresholdGallons != null
      ? Number(settings.gasFuelThresholdGallons)
      : null;

    return {
      month,
      totalEntries:     entries.length,
      totalGallons:     parseFloat(totalGallons.toFixed(3)),
      totalGasGallons:  parseFloat(totalGasGallons.toFixed(3)),
      totalCost:        parseFloat(totalCost.toFixed(2)),
      byUnit:           Object.values(byUnit).sort((a, b) => b.totalGallons - a.totalGallons),
      byUser:           Object.values(byUser).sort((a, b) => b.totalGallons - a.totalGallons),
      topGasUser,
      thresholdExceeded: thresholdGallons != null ? totalGasGallons > thresholdGallons : false,
      thresholdGallons,
      entries,
    };
  }

  async getFuelByUnit(from: string, to: string) {
    const entries = await this.prisma.fuelConsumptionEntry.findMany({
      where: {
        entryDate: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      include: {
        unit: { select: { id: true, unitNumber: true, type: true, fuelType: true } },
      },
    });

    const byUnit: Record<string, { unitId: string; unitNumber: string; fuelType: string; totalGallons: number; totalCost: number; entryCount: number }> = {};
    for (const entry of entries) {
      const uk = entry.unit.id;
      if (!byUnit[uk]) {
        byUnit[uk] = { unitId: entry.unit.id, unitNumber: entry.unit.unitNumber, fuelType: entry.unit.fuelType, totalGallons: 0, totalCost: 0, entryCount: 0 };
      }
      byUnit[uk].totalGallons += Number(entry.fuelAmount);
      byUnit[uk].totalCost    += Number(entry.totalCost ?? 0);
      byUnit[uk].entryCount   += 1;
    }

    return Object.values(byUnit).sort((a, b) => b.totalGallons - a.totalGallons);
  }

  async getFuelByUser(from: string, to: string) {
    const entries = await this.prisma.fuelConsumptionEntry.findMany({
      where: {
        entryDate: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      include: {
        enteredBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });

    const byUser: Record<string, { userId: string; displayName: string; totalGallons: number; totalCost: number; entryCount: number }> = {};
    for (const entry of entries) {
      const uu = entry.enteredBy.id;
      if (!byUser[uu]) {
        byUser[uu] = {
          userId: entry.enteredBy.id,
          displayName: entry.enteredBy.displayName ?? `${entry.enteredBy.firstName} ${entry.enteredBy.lastName}`,
          totalGallons: 0, totalCost: 0, entryCount: 0,
        };
      }
      byUser[uu].totalGallons += Number(entry.fuelAmount);
      byUser[uu].totalCost    += Number(entry.totalCost ?? 0);
      byUser[uu].entryCount   += 1;
    }

    return Object.values(byUser).sort((a, b) => b.totalGallons - a.totalGallons);
  }

  async getDotStatusReport() {
    const dotSvc = new DotPhysicalService(this.prisma);
    const physicals = await this.prisma.dotPhysical.findMany({
      where: { isActive: true },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, displayName: true, email: true, jobTitle: true } },
      },
      orderBy: { expirationDate: 'asc' },
    });

    return physicals.map((p) => ({
      ...p,
      status: dotSvc.computeStatus(p.expirationDate),
    }));
  }

  async sendMonthlyReportEmail(month: string, triggeredById: string) {
    const reportData = await this.getMonthlyFuelReport(month);
    const settings = await this.prisma.transportationSettings.findUnique({
      where: { id: 'singleton' },
    });

    const recipientEmail = settings?.financeDirectorEmail;
    if (!recipientEmail) {
      log.warn('Cannot send monthly report — financeDirectorEmail not configured');
      return { sent: false, reason: 'financeDirectorEmail not configured' };
    }

    await sendMonthlyFuelReportEmail({
      recipientEmail,
      month,
      reportData,
    });

    log.info('Monthly fuel report email sent', { month, triggeredById, recipientEmail });
    return { sent: true, month, recipientEmail };
  }

  /**
   * Scheduled job handler: generate and send the monthly fuel report.
   * Called by scheduler.service.ts as transportation-monthly-report.
   */
  async runMonthlyReportJob(): Promise<Record<string, unknown>> {
    const settings = await this.prisma.transportationSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (settings && !settings.monthlyFuelReportEnabled) {
      log.info('Monthly fuel report disabled — skipping job');
      return { skipped: true, reason: 'monthlyFuelReportEnabled=false' };
    }

    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    const reportData = await this.getMonthlyFuelReport(month);

    // Threshold alert
    if (
      settings?.gasFuelThresholdEnabled &&
      settings.gasFuelThresholdGallons != null &&
      reportData.totalGasGallons > Number(settings.gasFuelThresholdGallons)
    ) {
      const dosEmail = settings.directorOfSchoolsEmail;
      if (dosEmail) {
        await sendGasThresholdAlertEmail({
          recipientEmail: dosEmail,
          month,
          totalGasGallons: reportData.totalGasGallons,
          threshold: Number(settings.gasFuelThresholdGallons),
          topUser: reportData.topGasUser,
        });
      }
    }

    // Monthly report
    const financeEmail = settings?.financeDirectorEmail;
    if (financeEmail) {
      await sendMonthlyFuelReportEmail({
        recipientEmail: financeEmail,
        month,
        reportData,
      });
    }

    log.info('Monthly fuel report job complete', { month, totalEntries: reportData.totalEntries });
    return { month, totalEntries: reportData.totalEntries, totalGallons: reportData.totalGallons };
  }
}

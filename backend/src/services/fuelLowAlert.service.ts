/**
 * Fuel Low Alert Service
 *
 * Checks whether a tank's fill level is at or below its alert threshold
 * and enqueues email notifications to transportation secretary recipients.
 */
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger';
import { enqueueEmail } from './emailQueue.service';
import { FuelTankService } from './fuelTank.service';

const log = createLogger('FuelLowAlertService');

// ---------------------------------------------------------------------------
// Per-tank alert cooldown (in-memory, acceptable for a single-process server)
// ---------------------------------------------------------------------------
const lastAlertSent   = new Map<string, Date>();
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Escape helper for HTML email content
// ---------------------------------------------------------------------------
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

export class FuelLowAlertService {
  private tankService: FuelTankService;

  constructor(private prisma: PrismaClient) {
    this.tankService = new FuelTankService(prisma);
  }

  /**
   * Check whether the tank is at or below its alert threshold and, if so,
   * enqueue one email per configured transportation secretary recipient.
   *
   * Designed to be called fire-and-forget after a consumption entry is saved.
   */
  async checkAndSendAlerts(tankId: string): Promise<void> {
    // Cooldown guard — suppress duplicate alerts within the cooldown window
    const last = lastAlertSent.get(tankId);
    if (last && Date.now() - last.getTime() < ALERT_COOLDOWN_MS) {
      return;
    }

    // Fetch tank + parent station with location name
    const tank = await this.prisma.fuelTank.findUnique({
      where: { id: tankId },
      include: {
        station: {
          include: {
            officeLocation: { select: { name: true } },
          },
        },
      },
    });

    if (!tank || !tank.isActive || !tank.alertEnabled) return;

    const { gallonsCurrent, gallonsCapacity, percentFull } =
      await this.tankService.calculateCurrentLevel(tankId);

    if (percentFull > tank.alertThresholdPercent) {
      // Level is fine — no alert needed
      return;
    }

    // Fetch alert recipients from TransportationSettings singleton
    const settings = await this.prisma.transportationSettings.findUnique({
      where: { id: 'singleton' },
      select: { transportationSecretaryEmails: true },
    });

    const recipients = settings?.transportationSecretaryEmails ?? [];
    if (recipients.length === 0) {
      log.warn('Fuel low alert triggered but no recipients configured', { tankId });
      return;
    }

    const stationName = tank.station.officeLocation.name;
    const fuelType    = tank.fuelType;
    const threshold   = tank.alertThresholdPercent;

    const subject = `[Fuel Alert] ${fuelType} tank at ${stationName} is at ${percentFull.toFixed(1)}%`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background-color:#C62828;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;">
    <h2 style="margin:0;">⛽ Low Fuel Alert</h2>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
    <p>A fuel tank has dropped to or below its configured alert threshold.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background-color:#f5f5f5;">
        <td style="padding:8px 12px;font-weight:bold;width:40%;">Station</td>
        <td style="padding:8px 12px;">${escapeHtml(stationName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:bold;">Fuel Type</td>
        <td style="padding:8px 12px;">${escapeHtml(fuelType)}</td>
      </tr>
      <tr style="background-color:#f5f5f5;">
        <td style="padding:8px 12px;font-weight:bold;">Current Level</td>
        <td style="padding:8px 12px;color:#C62828;font-weight:bold;">
          ${gallonsCurrent.toFixed(1)} / ${gallonsCapacity.toFixed(1)} gal
          &nbsp;(${percentFull.toFixed(1)}%)
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:bold;">Alert Threshold</td>
        <td style="padding:8px 12px;">${threshold}%</td>
      </tr>
    </table>
    <p style="color:#666;font-size:12px;">
      This alert was triggered automatically when a fuel consumption entry reduced
      the tank level to or below the configured threshold.
    </p>
  </div>
</body>
</html>`.trim();

    // Enqueue one email per recipient
    for (const recipient of recipients) {
      await enqueueEmail({
        to:             recipient,
        subject,
        html,
        priority:       'high',
        context:        'fuel_low_alert',
        relatedEntityId: tankId,
      });
    }

    log.info('Fuel low alert enqueued', {
      tankId,
      stationName,
      fuelType,
      percentFull: percentFull.toFixed(1),
      recipientCount: recipients.length,
    });

    // Record send time for cooldown
    lastAlertSent.set(tankId, new Date());
  }
}

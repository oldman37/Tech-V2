import cron from 'node-cron';
import { loggers } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { msalClient } from '../config/entraId';
import { Client } from '@microsoft/microsoft-graph-client';
import { LocationSyncService } from './locationSync.service';

class CronJobsService {
  private jobs: Map<string, ReturnType<typeof cron.schedule>> = new Map();

  /**
   * Initialize all cron jobs
   */
  start() {
    loggers.cron.info('Starting cron jobs');

    // Supervisor sync job - runs daily at 2 AM
    this.scheduleSupervisorSync();

    loggers.cron.info('Cron jobs initialized successfully');
  }

  /**
   * Schedule supervisor assignment sync
   * Default: Every day at 2:00 AM
   * Can be customized via SUPERVISOR_SYNC_SCHEDULE env variable
   */
  private scheduleSupervisorSync() {
    // Cron format: second minute hour day month weekday
    // Default: 0 2 * * * = Every day at 2:00 AM
    const schedule = process.env.SUPERVISOR_SYNC_SCHEDULE || '0 2 * * *';

    const job = cron.schedule(
      schedule,
      async () => {
        loggers.cron.info('Scheduled supervisor sync started', {
          schedule,
          timestamp: new Date().toISOString(),
        });
        
        try {
          await this.runSupervisorSync();
          loggers.cron.info('Scheduled supervisor sync completed successfully');
        } catch (error) {
          loggers.cron.error('Scheduled supervisor sync failed', {
            error,
          });
        }
      },
      {
        timezone: process.env.TZ || 'America/Chicago' // Default to Central Time
      }
    );

    this.jobs.set('supervisorSync', job);
    loggers.cron.info('Supervisor sync scheduled', {
      schedule,
      timezone: process.env.TZ || 'America/Chicago',
    });
  }

  /**
   * Run the supervisor sync via the LocationSyncService (direct service call)
   */
  private async runSupervisorSync(): Promise<void> {
    const authResult = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });

    const graphClient = Client.init({
      authProvider: (done) => {
        done(null, authResult?.accessToken ?? '');
      },
    });

    const syncService = new LocationSyncService(prisma, graphClient);
    const result = await syncService.syncSupervisorAssignments();

    loggers.cron.info('Supervisor assignment sync complete', {
      assignmentsCreated: result.assignmentsCreated,
      assignmentsSkipped: result.assignmentsSkipped,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  }

  /**
   * Manually trigger supervisor sync (can be called from admin endpoint)
   */
  async triggerSupervisorSync(): Promise<void> {
    loggers.cron.info('Manual supervisor sync triggered');
    await this.runSupervisorSync();
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    loggers.cron.info('Stopping cron jobs');
    this.jobs.forEach((job, name) => {
      job.stop();
      loggers.cron.debug('Cron job stopped', { jobName: name });
    });
    this.jobs.clear();
    loggers.cron.info('All cron jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status: any[] = [];
    
    this.jobs.forEach((job, name) => {
      status.push({
        name,
        running: true,
        nextRun: this.getNextRunTime(name)
      });
    });

    return status;
  }

  /**
   * Get next scheduled run time for a job
   */
  private getNextRunTime(jobName: string): string | null {
    // This is a simplified version - node-cron doesn't expose next run time directly
    // You could implement a more sophisticated tracker if needed
    if (jobName === 'supervisorSync') {
      const schedule = process.env.SUPERVISOR_SYNC_SCHEDULE || '0 2 * * *';
      return `Next run: ${schedule} (check cron schedule)`;
    }
    return null;
  }
}

// Export singleton instance
export const cronJobsService = new CronJobsService();

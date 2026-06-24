import cron from 'node-cron';
import { loggers } from '../lib/logger';
import { prisma } from '../lib/prisma';

class CronJobsService {
  private jobs: Map<string, ReturnType<typeof cron.schedule>> = new Map();

  start() {
    loggers.cron.info('Starting cron jobs');
    this.scheduleRefreshTokenCleanup();
    loggers.cron.info('Cron jobs initialized successfully');
  }

  private scheduleRefreshTokenCleanup() {
    const job = cron.schedule(
      '0 3 * * *',
      async () => {
        try {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const { count } = await prisma.refreshToken.deleteMany({
            where: {
              OR: [
                { revokedAt: { not: null, lte: cutoff } },
                { expiresAt: { lte: cutoff } },
              ],
            },
          });
          if (count > 0) {
            loggers.cron.info('Expired/revoked refresh tokens cleaned up', { count });
          }
        } catch (error) {
          loggers.cron.error('Refresh token cleanup failed', { error });
        }
      },
      { timezone: process.env.TZ || 'America/Chicago' },
    );
    this.jobs.set('refreshTokenCleanup', job);
  }

  stop() {
    loggers.cron.info('Stopping cron jobs');
    this.jobs.forEach((job, name) => {
      job.stop();
      loggers.cron.debug('Cron job stopped', { jobName: name });
    });
    this.jobs.clear();
    loggers.cron.info('All cron jobs stopped');
  }
}

export const cronJobsService = new CronJobsService();

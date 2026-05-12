import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { CronExpressionParser } from 'cron-parser';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // System settings singleton
  console.log('Creating system settings...');
  await prisma.systemSettings.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: {
      id:                      'singleton',
      nextReqNumber:           1,
      reqNumberPrefix:         'REQ',
      supervisorBypassEnabled: true,
    },
  });
  console.log('✅ System settings created (singleton)');

  // Seed default job schedules (all disabled — admin must enable explicitly)
  console.log('Creating default job schedules...');
  const TIMEZONE = process.env.TZ || 'America/Chicago';

  function computeNextRun(cronExpr: string): Date {
    return CronExpressionParser.parse(cronExpr, { tz: TIMEZONE }).next().toDate();
  }

  const defaultSchedules = [
    { jobKey: 'sync-staff',       cronExpr: '0 3 * * *', enabled: false },
    { jobKey: 'sync-students',    cronExpr: '0 3 * * *', enabled: false },
    { jobKey: 'sync-locations',   cronExpr: '0 4 * * 1', enabled: false },
    { jobKey: 'sync-supervisors', cronExpr: '0 4 * * 1', enabled: false },
  ];

  for (const schedule of defaultSchedules) {
    await prisma.jobSchedule.upsert({
      where:  { jobKey: schedule.jobKey },
      update: {},  // Never overwrite admin-configured settings on re-seed
      create: {
        ...schedule,
        nextRunAt: computeNextRun(schedule.cronExpr),
      },
    });
  }
  console.log('✅ Job schedules seeded (all disabled by default)');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

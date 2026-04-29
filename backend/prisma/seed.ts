import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
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
      nextPoNumber:            1,
      poNumberPrefix:          'PO',
      supervisorBypassEnabled: true,
    },
  });
  console.log('✅ System settings created (singleton)');

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

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Fix: bump counter past existing max
  await prisma.systemSettings.update({ where: { id: 'singleton' }, data: { nextReqNumber: 10566 } });

  const settings = await prisma.systemSettings.findUnique({
    where: { id: 'singleton' },
    select: { nextReqNumber: true, reqNumberPrefix: true },
  });
  console.log('Updated counter:', JSON.stringify(settings));

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);

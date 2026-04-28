import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.locationSupervisor.updateMany({
    where: { supervisorType: 'FOOD_SERVICES_SUPERVISOR' },
    data: { isPrimary: true },
  });
  console.log(`Updated ${result.count} FOOD_SERVICES_SUPERVISOR records to isPrimary=true`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

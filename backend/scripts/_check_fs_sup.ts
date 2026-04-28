import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
  const sups = await p.locationSupervisor.findMany({
    where: { supervisorType: 'FOOD_SERVICES_SUPERVISOR' },
    select: {
      isPrimary: true,
      supervisorType: true,
      location: { select: { name: true } },
      user: { select: { displayName: true } },
    },
    take: 5,
  });
  console.log(JSON.stringify(sups, null, 2));
}

main().finally(() => p.$disconnect());

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'lcrigger@ocboe.com' },
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('=== USER RECORD ===');
  console.log(`id:        ${user.id}`);
  console.log(`email:     ${user.email}`);
  console.log(`role:      ${user.role}`);
  console.log(`isActive:  ${user.isActive}`);
  console.log(`groups:    ${JSON.stringify(user.groups)}`);

  const locSups = await prisma.locationSupervisor.findMany({
    where: { userId: user.id },
    include: { location: { select: { name: true, type: true } } },
  });

  console.log('\n=== LOCATION SUPERVISOR RECORDS ===');
  if (locSups.length === 0) {
    console.log('  (none)');
  } else {
    for (const ls of locSups) {
      console.log(`  ${ls.location.name} | type: ${ls.supervisorType} | isPrimary: ${ls.isPrimary}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

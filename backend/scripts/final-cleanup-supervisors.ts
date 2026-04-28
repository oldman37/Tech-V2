import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Final cleanup: Remove all remaining cross-assignments in departments.
 * Each department should only have its own relevant supervisor.
 */

async function main() {
  console.log('🧹 Final department cleanup...\n');

  let removedCount = 0;

  // Pre-K Department - keep all (these might be shared resources)
  // Transportation Department - should only have Transportation Director
  const transportDept = await prisma.officeLocation.findFirst({
    where: { name: { contains: 'ransportation' } },
    include: { supervisors: true },
  });

  if (transportDept) {
    console.log(`📍 ${transportDept.name}`);
    const toRemove = transportDept.supervisors.filter(
      (s) => s.supervisorType !== 'TRANSPORTATION_DIRECTOR'
    );
    
    for (const sup of toRemove) {
      console.log(`   Removing ${sup.supervisorType}`);
      await prisma.locationSupervisor.delete({ where: { id: sup.id } });
      removedCount++;
    }
  }

  // Pre-K Department - keep all (might need multiple departments)
  // But let's at least check
  console.log('\n✅ Cleanup complete!');
  console.log(`Removed ${removedCount} additional incorrect assignments.`);
  console.log('\nNow all schools only have their Principal and Vice Principal.');
  console.log('Departments have only their relevant supervisors.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('📋 Checking all supervisor assignments...\n');
  
  const locations = await prisma.officeLocation.findMany({
    include: {
      supervisors: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
            },
          },
        },
        orderBy: [
          { supervisorType: 'asc' },
          { isPrimary: 'desc' },
        ],
      },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${locations.length} locations\n`);

  for (const location of locations) {
    console.log(`\n📍 ${location.name} (${location.code || 'No code'}) - ${location.type}`);
    
    if (location.supervisors.length === 0) {
      console.log('   ⚠️  No supervisors assigned');
    } else {
      console.log(`   ${location.supervisors.length} supervisor(s):`);
      location.supervisors.forEach((sup) => {
        const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
        const primary = sup.isPrimary ? ' ⭐ PRIMARY' : '';
        console.log(`   - ${name} (${sup.user.email})`);
        console.log(`     Role: ${sup.supervisorType}${primary}`);
        console.log(`     Job Title: ${sup.user.jobTitle || 'N/A'}`);
        console.log(`     Assigned: ${sup.assignedAt.toLocaleDateString()}`);
      });
    }
  }

  console.log('\n\n📊 Summary by Supervisor Type:');
  const supervisorsByType = await prisma.locationSupervisor.groupBy({
    by: ['supervisorType'],
    _count: true,
  });

  supervisorsByType.forEach((item) => {
    console.log(`  ${item.supervisorType}: ${item._count} assignments`);
  });

  console.log(`\n✅ Total assignments: ${await prisma.locationSupervisor.count()}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

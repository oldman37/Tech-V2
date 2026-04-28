import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Script to view all supervisor assignments
 */

async function main() {
  console.log('👥 Current Supervisor Assignments\n');
  console.log('='.repeat(80));

  const locations = await prisma.officeLocation.findMany({
    where: { isActive: true },
    include: {
      supervisors: {
        include: {
          user: {
            select: {
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

  for (const location of locations) {
    console.log(`\n📍 ${location.name} (${location.code})`);
    console.log(`   Type: ${location.type}`);
    
    if (location.supervisors.length === 0) {
      console.log('   ⚠️  No supervisors assigned');
    } else {
      console.log('   Supervisors:');
      
      const groupedByType = location.supervisors.reduce((acc, sup) => {
        if (!acc[sup.supervisorType]) {
          acc[sup.supervisorType] = [];
        }
        acc[sup.supervisorType].push(sup);
        return acc;
      }, {} as Record<string, typeof location.supervisors>);

      for (const [type, supervisors] of Object.entries(groupedByType)) {
        console.log(`\n   ${type}:`);
        supervisors.forEach(sup => {
          const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
          const primary = sup.isPrimary ? '⭐ PRIMARY' : '';
          const title = sup.user.jobTitle ? ` - ${sup.user.jobTitle}` : '';
          console.log(`     • ${name} (${sup.user.email})${title} ${primary}`);
        });
      }
    }
    console.log('-'.repeat(80));
  }

  // Summary by supervisor type
  console.log('\n\n📊 Summary by Role\n');
  console.log('='.repeat(80));

  const allSupervisors = await prisma.locationSupervisor.findMany({
    include: {
      user: {
        select: {
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
        },
      },
      location: {
        select: {
          name: true,
          code: true,
        },
      },
    },
    orderBy: [
      { supervisorType: 'asc' },
      { user: { lastName: 'asc' } },
    ],
  });

  const byType = allSupervisors.reduce((acc, sup) => {
    if (!acc[sup.supervisorType]) {
      acc[sup.supervisorType] = [];
    }
    acc[sup.supervisorType].push(sup);
    return acc;
  }, {} as Record<string, typeof allSupervisors>);

  for (const [type, supervisors] of Object.entries(byType)) {
    console.log(`\n${type} (${supervisors.length}):`);
    supervisors.forEach(sup => {
      const name = sup.user.displayName || `${sup.user.firstName} ${sup.user.lastName}`;
      console.log(`  • ${name} → ${sup.location.name}`);
    });
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

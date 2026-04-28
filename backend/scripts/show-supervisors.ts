import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function showSupervisors() {
  try {
    console.log('👥 SUPERVISOR ASSIGNMENTS\n');
    console.log('='.repeat(100));

    // Get all locations with their supervisors
    const locations = await prisma.officeLocation.findMany({
      where: { isActive: true },
      include: {
        supervisors: {
          include: {
            user: {
              select: {
                displayName: true,
                email: true,
                jobTitle: true
              }
            }
          },
          orderBy: [
            { supervisorType: 'asc' },
            { isPrimary: 'desc' }
          ]
        }
      },
      orderBy: { name: 'asc' }
    });

    for (const location of locations) {
      console.log(`\n📍 ${location.name} (${location.code}) - ${location.type}`);
      console.log('   ' + '-'.repeat(96));
      
      if (location.supervisors.length === 0) {
        console.log('   ⚠️  No supervisors assigned');
      } else {
        // Group supervisors by type
        const byType = location.supervisors.reduce((acc, sup) => {
          if (!acc[sup.supervisorType]) {
            acc[sup.supervisorType] = [];
          }
          acc[sup.supervisorType].push(sup);
          return acc;
        }, {} as Record<string, typeof location.supervisors>);

        for (const [type, supervisors] of Object.entries(byType)) {
          console.log(`\n   ${type}:`);
          for (const sup of supervisors) {
            const primary = sup.isPrimary ? ' ⭐ PRIMARY' : '';
            console.log(`      • ${sup.user.displayName || 'Unknown'} (${sup.user.email})${primary}`);
            if (sup.user.jobTitle) {
              console.log(`        ${sup.user.jobTitle}`);
            }
          }
        }
      }
      console.log('');
    }

    console.log('='.repeat(100));
    console.log('\n📊 SUMMARY BY SUPERVISOR TYPE\n');

    const summary = await prisma.locationSupervisor.groupBy({
      by: ['supervisorType'],
      _count: true,
      orderBy: {
        _count: {
          supervisorType: 'desc'
        }
      }
    });

    for (const item of summary) {
      console.log(`   ${item.supervisorType.padEnd(35)} ${item._count} assignments`);
    }

    const total = await prisma.locationSupervisor.count();
    console.log(`\n   ${'TOTAL'.padEnd(35)} ${total} assignments`);

    console.log('\n' + '='.repeat(100));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

showSupervisors();

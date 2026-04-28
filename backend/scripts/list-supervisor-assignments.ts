import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function listAllSupervisorAssignments() {
  try {
    console.log('\nFetching all office locations with supervisor assignments...\n');

    // Get all office locations with their administrators and user counts
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
            { isPrimary: 'desc' },
            { supervisorType: 'asc' }
          ]
        }
      },
      orderBy: { name: 'asc' }
    });

    console.log('='.repeat(100));
    console.log('SUPERVISOR ASSIGNMENTS BY LOCATION');
    console.log('='.repeat(100));

    for (const location of locations) {
      // Count users at this location
      const userCount = await prisma.user.count({
        where: {
          officeLocation: location.name,
          email: { endsWith: '@ocboe.com' },
          isActive: true
        }
      });

      console.log(`\n${location.name} (${location.type})`);
      console.log(`  Address: ${location.address || 'Not set'}, ${location.city || ''}, ${location.state || ''} ${location.zip || ''}`);
      console.log(`  Active Users at Location: ${userCount}`);
      
      if (location.supervisors.length === 0) {
        console.log(`  ⚠️  No supervisors assigned`);
      } else {
        console.log(`  Supervisors (${location.supervisors.length}):`);
        location.supervisors.forEach((sup) => {
          const badge = sup.isPrimary ? '⭐' : '  ';
          console.log(`    ${badge} ${sup.user.displayName}`);
          console.log(`       Type: ${sup.supervisorType}`);
          console.log(`       Email: ${sup.user.email}`);
          console.log(`       Title: ${sup.user.jobTitle || 'Not set'}`);
        });
      }
      console.log('-'.repeat(100));
    }

    // Summary statistics
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY STATISTICS');
    console.log('='.repeat(100));

    const totalLocations = locations.length;
    const locationsWithSupervisors = locations.filter(loc => loc.supervisors.length > 0).length;
    const locationsWithoutSupervisors = totalLocations - locationsWithSupervisors;

    const totalUserSupervisorAssignments = await prisma.userSupervisor.count();
    const usersWithSupervisors = await prisma.user.count({
      where: {
        email: { endsWith: '@ocboe.com' },
        isActive: true,
        supervisedUsers: {
          some: {}
        }
      }
    });

    const usersWithoutSupervisors = await prisma.user.count({
      where: {
        email: { endsWith: '@ocboe.com' },
        isActive: true,
        supervisedUsers: {
          none: {}
        }
      }
    });

    console.log(`Total Active Locations: ${totalLocations}`);
    console.log(`  - With Administrators: ${locationsWithSupervisors}`);
    console.log(`  - Without Administrators: ${locationsWithoutSupervisors}`);
    console.log(`\nTotal @ocboe.com Users with Supervisors: ${usersWithSupervisors}`);
    console.log(`Total @ocboe.com Users without Supervisors: ${usersWithoutSupervisors}`);
    console.log(`Total User-Supervisor Assignments: ${totalUserSupervisorAssignments}`);
    console.log('='.repeat(100) + '\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
listAllSupervisorAssignments();

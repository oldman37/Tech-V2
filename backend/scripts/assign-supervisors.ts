import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Script to assign supervisors to office locations
 * 
 * Supervisor Types:
 * - PRINCIPAL: School principal
 * - MAINTENANCE_ADMIN: Maintenance supervisor for a building
 * - TECH_ADMIN: Technology supervisor for a building
 * - DIRECTOR_OF_SCHOOLS: District-level oversight
 * - DIRECTOR_OF_FINANCE: Financial oversight
 */

async function main() {
  console.log('👥 Assigning Supervisors to Locations...\n');

  // Example assignments - customize based on your actual users and locations
  const assignments = [
    // Principal assignments (one per school)
    {
      locationName: 'Elementary School 1',
      userEmail: 'principal.es1@example.com', // Replace with actual email
      supervisorType: 'PRINCIPAL',
      isPrimary: true,
    },
    {
      locationName: 'Elementary School 2',
      userEmail: 'principal.es2@example.com',
      supervisorType: 'PRINCIPAL',
      isPrimary: true,
    },
    {
      locationName: 'Middle School',
      userEmail: 'principal.ms@example.com',
      supervisorType: 'PRINCIPAL',
      isPrimary: true,
    },
    {
      locationName: 'High School',
      userEmail: 'principal.hs@example.com',
      supervisorType: 'PRINCIPAL',
      isPrimary: true,
    },
    
    // Maintenance Admin - can be assigned to multiple buildings
    {
      locationName: 'Elementary School 1',
      userEmail: 'maintenance.admin@example.com',
      supervisorType: 'MAINTENANCE_ADMIN',
      isPrimary: true,
    },
    {
      locationName: 'Elementary School 2',
      userEmail: 'maintenance.admin@example.com',
      supervisorType: 'MAINTENANCE_ADMIN',
      isPrimary: true,
    },
    
    // Tech Admin - can oversee all buildings
    {
      locationName: 'District Office',
      userEmail: 'tech.admin@example.com',
      supervisorType: 'TECH_ADMIN',
      isPrimary: true,
    },
    
    // Director of Schools - oversees all schools
    {
      locationName: 'District Office',
      userEmail: 'director.schools@example.com',
      supervisorType: 'DIRECTOR_OF_SCHOOLS',
      isPrimary: true,
    },
    
    // Director of Finance
    {
      locationName: 'District Office',
      userEmail: 'director.finance@example.com',
      supervisorType: 'DIRECTOR_OF_FINANCE',
      isPrimary: true,
    },
  ];

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const assignment of assignments) {
    try {
      // Find the location
      const location = await prisma.officeLocation.findUnique({
        where: { name: assignment.locationName },
      });

      if (!location) {
        console.log(`⚠️  Location not found: ${assignment.locationName}`);
        skipCount++;
        continue;
      }

      // Find the user
      const user = await prisma.user.findUnique({
        where: { email: assignment.userEmail },
      });

      if (!user) {
        console.log(`⚠️  User not found: ${assignment.userEmail}`);
        skipCount++;
        continue;
      }

      // Create the assignment
      const supervisor = await prisma.locationSupervisor.upsert({
        where: {
          locationId_userId_supervisorType: {
            locationId: location.id,
            userId: user.id,
            supervisorType: assignment.supervisorType,
          },
        },
        update: {
          isPrimary: assignment.isPrimary,
        },
        create: {
          locationId: location.id,
          userId: user.id,
          supervisorType: assignment.supervisorType,
          isPrimary: assignment.isPrimary,
        },
      });

      console.log(
        `✅ Assigned ${user.displayName || user.email} as ${assignment.supervisorType} for ${location.name}`
      );
      successCount++;
    } catch (error) {
      console.error(`❌ Error assigning ${assignment.userEmail}:`, error);
      errorCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ⚠️  Skipped: ${skipCount}`);
  console.log(`  ❌ Errors: ${errorCount}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error assigning supervisors:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

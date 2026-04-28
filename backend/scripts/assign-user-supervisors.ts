import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function assignSupervisorsToUsers() {
  try {
    console.log('Starting supervisor assignment for @ocboe.com users...\n');

    // 1. Get all users with @ocboe.com email domain
    const ocboeUsers = await prisma.user.findMany({
      where: {
        email: {
          endsWith: '@ocboe.com'
        },
        isActive: true
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        officeLocation: true
      }
    });

    console.log(`Found ${ocboeUsers.length} active @ocboe.com users\n`);

    let assigned = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of ocboeUsers) {
      try {
        // Skip if office location is null or contains "district"
        if (!user.officeLocation) {
          console.log(`⏭️  Skipping ${user.displayName || user.email} - No office location`);
          skipped++;
          continue;
        }

        const lowerLocation = user.officeLocation.toLowerCase();
        if (lowerLocation.includes('district')) {
          console.log(`⏭️  Skipping ${user.displayName || user.email} - District location (${user.officeLocation})`);
          skipped++;
          continue;
        }

        // Find matching office location
        const officeLocation = await prisma.officeLocation.findFirst({
          where: {
            name: {
              equals: user.officeLocation,
              mode: 'insensitive'
            },
            isActive: true
          },
          include: {
            supervisors: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    email: true
                  }
                }
              }
            }
          }
        });

        if (!officeLocation) {
          console.log(`⚠️  No office location found for: ${user.officeLocation} (User: ${user.displayName || user.email})`);
          skipped++;
          continue;
        }

        if (officeLocation.supervisors.length === 0) {
          console.log(`⚠️  No supervisors assigned to ${officeLocation.name} (User: ${user.displayName || user.email})`);
          skipped++;
          continue;
        }

        // Assign only building-level supervisors (principals and vice principals)
        // District-level supervisors should not be assigned to individual users
        let userAssignedCount = 0;
        for (const locationSupervisor of officeLocation.supervisors) {
          // Skip if user is their own supervisor
          if (locationSupervisor.userId === user.id) {
            continue;
          }

          // Only assign PRINCIPAL and VICE_PRINCIPAL - skip district-level supervisors
          if (locationSupervisor.supervisorType !== 'PRINCIPAL' && locationSupervisor.supervisorType !== 'VICE_PRINCIPAL') {
            continue;
          }

          // Check if assignment already exists
          const existingAssignment = await prisma.userSupervisor.findFirst({
            where: {
              userId: user.id,
              supervisorId: locationSupervisor.userId
            }
          });

          if (existingAssignment) {
            continue; // Already assigned
          }

          // Create the assignment
          await prisma.userSupervisor.create({
            data: {
              userId: user.id,
              supervisorId: locationSupervisor.userId,
              locationId: officeLocation.id,
              isPrimary: locationSupervisor.isPrimary,
              assignedBy: 'SYSTEM',
              notes: `Auto-assigned based on office location: ${officeLocation.name}`
            }
          });

          userAssignedCount++;
        }

        if (userAssignedCount > 0) {
          console.log(`✅ Assigned ${userAssignedCount} supervisor(s) to ${user.displayName || user.email} (${officeLocation.name})`);
          assigned++;
        } else {
          console.log(`⏭️  No new supervisors to assign for ${user.displayName || user.email} (already assigned or self-supervision)`);
          skipped++;
        }

      } catch (error) {
        console.error(`❌ Error processing user ${user.email}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  Total users processed: ${ocboeUsers.length}`);
    console.log(`  Users with supervisors assigned: ${assigned}`);
    console.log(`  Users skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
assignSupervisorsToUsers();

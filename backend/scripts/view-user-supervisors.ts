import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function viewUserSupervisors() {
  try {
    const email = process.argv[2];

    if (!email) {
      console.log('Usage: npx tsx scripts/view-user-supervisors.ts <email>');
      console.log('Example: npx tsx scripts/view-user-supervisors.ts jdoe@ocboe.com');
      return;
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        officeLocation: true,
        supervisors: {
          include: {
            supervisor: {
              select: {
                displayName: true,
                email: true,
                jobTitle: true,
                officeLocation: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      console.log(`User not found: ${email}`);
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('USER INFORMATION');
    console.log('='.repeat(80));
    console.log(`Name: ${user.displayName}`);
    console.log(`Email: ${user.email}`);
    console.log(`Office Location: ${user.officeLocation || 'Not set'}`);
    console.log(`\nSupervisors (${user.supervisors.length}):`);
    console.log('-'.repeat(80));

    if (user.supervisors.length === 0) {
      console.log('No supervisors assigned');
    } else {
      user.supervisors.forEach((assignment: any, index: number) => {
        console.log(`\n${index + 1}. ${assignment.supervisor.displayName}`);
        console.log(`   Email: ${assignment.supervisor.email}`);
        console.log(`   Title: ${assignment.supervisor.jobTitle || 'Not set'}`);
        console.log(`   Office: ${assignment.supervisor.officeLocation || 'Not set'}`);
        console.log(`   Primary: ${assignment.isPrimary ? 'Yes' : 'No'}`);
        console.log(`   Assigned: ${assignment.assignedAt.toLocaleDateString()}`);
        if (assignment.notes) {
          console.log(`   Notes: ${assignment.notes}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
viewUserSupervisors();

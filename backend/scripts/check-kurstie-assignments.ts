import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkKurstieAssignments() {
  try {
    // Find Kurstie Hill
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: 'khill@ocboe.com',
          mode: 'insensitive'
        }
      },
      include: {
        supervisors: {
          include: {
            supervisor: {
              select: {
                displayName: true,
                email: true,
                officeLocation: true
              }
            }
          },
          orderBy: {
            assignedAt: 'desc'
          }
        }
      }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log(`User: ${user.displayName}`);
    console.log(`Office Location: ${user.officeLocation}`);
    console.log(`Total supervisor assignments: ${user.supervisors.length}\n`);
    
    console.log('All Supervisors:');
    for (const assignment of user.supervisors) {
      console.log(`  - ${assignment.supervisor.displayName} (${assignment.supervisor.email})`);
      console.log(`    Office: ${assignment.supervisor.officeLocation}`);
      console.log(`    Location ID: ${assignment.locationId}`);
      console.log(`    Assigned: ${assignment.assignedAt.toISOString()}`);
      console.log(`    Notes: ${assignment.notes || 'None'}`);
      console.log();
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkKurstieAssignments();

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function check() {
  try {
    console.log('\n=== Checking Transportation and Nurse Directors ===\n');
    
    // Check if they exist in location_supervisors
    const supervisors = await prisma.locationSupervisor.findMany({
      where: {
        supervisorType: {
          in: ['TRANSPORTATION_DIRECTOR', 'NURSE_DIRECTOR']
        }
      },
      include: {
        user: {
          select: {
            email: true,
            displayName: true,
            jobTitle: true,
            officeLocation: true
          }
        },
        location: {
          select: {
            name: true,
            code: true
          }
        }
      }
    });

    console.log(`Found ${supervisors.length} Transportation/Nurse Director assignments:`);
    supervisors.forEach(s => {
      console.log(`  - ${s.user.displayName} (${s.user.email})`);
      console.log(`    Type: ${s.supervisorType}`);
      console.log(`    Location: ${s.location.name}`);
      console.log(`    Office: ${s.user.officeLocation}`);
      console.log('');
    });

    // Check all users with ADMIN/MANAGER roles to see potential supervisors
    const potentialSupervisors = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true
      },
      select: {
        email: true,
        displayName: true,
        jobTitle: true,
        officeLocation: true,
        role: true
      },
      orderBy: {
        email: 'asc'
      }
    });

    console.log(`\n=== All ADMIN/MANAGER users (${potentialSupervisors.length}) ===\n`);
    potentialSupervisors.forEach(u => {
      console.log(`${u.displayName || u.email}`);
      console.log(`  Email: ${u.email}`);
      console.log(`  Job: ${u.jobTitle || 'N/A'}`);
      console.log(`  Office: ${u.officeLocation || 'N/A'}`);
      console.log(`  Role: ${u.role}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

check();

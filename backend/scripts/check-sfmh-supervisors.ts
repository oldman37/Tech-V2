import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkSFMHSupervisors() {
  try {
    // Find South Fulton Middle/High School location
    const location = await prisma.officeLocation.findFirst({
      where: {
        name: {
          equals: 'South Fulton Middle/High School',
          mode: 'insensitive'
        }
      },
      include: {
        supervisors: {
          include: {
            user: {
              select: {
                displayName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!location) {
      console.log('Location not found');
      return;
    }

    console.log(`Location: ${location.name}`);
    console.log(`Total supervisors: ${location.supervisors.length}\n`);
    console.log('Supervisors:');
    for (const sup of location.supervisors) {
      console.log(`  - ${sup.user.displayName} (${sup.user.email}) - ${sup.supervisorType} - Primary: ${sup.isPrimary}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkSFMHSupervisors();

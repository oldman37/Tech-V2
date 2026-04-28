import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('👥 Seeding Supervisor Assignments...\n');

  // Find some non-student users (staff/admin) to use as supervisors
  const staff = await prisma.user.findMany({
    where: {
      AND: [
        { email: { not: { contains: '@students.' } } },
        { role: { in: ['ADMIN', 'VIEWER'] } }
      ]
    },
    take: 20,
    orderBy: { email: 'asc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      firstName: true,
      lastName: true,
      jobTitle: true
    }
  });

  console.log(`Found ${staff.length} staff members to use as supervisors\n`);

  if (staff.length === 0) {
    console.log('⚠️  No staff members found. All users appear to be students.');
    console.log('You can still assign supervisors manually through the UI.\n');
    return;
  }

  // Display available staff
  console.log('Available staff:');
  staff.forEach((s, i) => {
    const name = s.displayName || `${s.firstName} ${s.lastName}`;
    console.log(`  ${i + 1}. ${name} (${s.email}) - ${s.jobTitle || 'No title'}`);
  });

  // Get all locations
  const locations = await prisma.officeLocation.findMany({
    orderBy: { name: 'asc' }
  });

  console.log(`\n📍 Found ${locations.length} locations\n`);

  // Example assignments - you can modify these based on your actual staff
  const assignments = [
    // Assign the first staff member as a principal for each school
    ...locations
      .filter(l => l.type === 'SCHOOL')
      .map((location, i) => ({
        locationName: location.name,
        userId: staff[Math.min(i, staff.length - 1)].id,
        supervisorType: 'PRINCIPAL' as const,
        isPrimary: true
      })),
    
    // Assign maintenance admin to schools
    ...locations
      .filter(l => l.type === 'SCHOOL')
      .slice(0, Math.min(3, staff.length))
      .map((location, i) => ({
        locationName: location.name,
        userId: staff[Math.min(i + 1, staff.length - 1)].id,
        supervisorType: 'MAINTENANCE_ADMIN' as const,
        isPrimary: false
      })),
  ];

  console.log('Creating supervisor assignments...\n');

  for (const assignment of assignments) {
    try {
      const location = await prisma.officeLocation.findFirst({
        where: { name: assignment.locationName }
      });

      if (!location) {
        console.log(`❌ Location not found: ${assignment.locationName}`);
        continue;
      }

      const user = await prisma.user.findUnique({
        where: { id: assignment.userId },
        select: { displayName: true, firstName: true, lastName: true, email: true }
      });

      const supervisor = await prisma.locationSupervisor.create({
        data: {
          locationId: location.id,
          userId: assignment.userId,
          supervisorType: assignment.supervisorType,
          isPrimary: assignment.isPrimary
        }
      });

      const userName = user?.displayName || `${user?.firstName} ${user?.lastName}`;
      console.log(`✅ Assigned ${userName} as ${assignment.supervisorType} for ${location.name}${assignment.isPrimary ? ' (Primary)' : ''}`);
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`⚠️  Assignment already exists for ${assignment.locationName}`);
      } else {
        console.error(`❌ Error assigning supervisor for ${assignment.locationName}:`, error.message);
      }
    }
  }

  const finalCount = await prisma.locationSupervisor.count();
  console.log(`\n✨ Complete! Total supervisor assignments: ${finalCount}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding supervisors:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

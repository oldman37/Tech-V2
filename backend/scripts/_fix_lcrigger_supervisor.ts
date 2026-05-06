import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔧 Fix: Assign lcrigger@ocboe.com as primary PRINCIPAL supervisor for Lake Road Elementary\n');

  // 1. Look up the user
  const user = await prisma.user.findFirst({
    where: { email: 'lcrigger@ocboe.com' },
  });
  if (!user) {
    throw new Error('User lcrigger@ocboe.com not found in the database.');
  }
  console.log(`✅ Found user: ${user.firstName} ${user.lastName} (id: ${user.id}, isActive: ${user.isActive})`);

  // 2. Look up the location
  const location = await prisma.officeLocation.findFirst({
    where: { name: { contains: 'Lake Road', mode: 'insensitive' } },
  });
  if (!location) {
    throw new Error('No OfficeLocation found with name containing "Lake Road".');
  }
  console.log(`✅ Found location: ${location.name} (id: ${location.id})`);

  // 3. Demote any existing isPrimary=true supervisor for this location (so there is only one primary)
  const existingPrimary = await prisma.locationSupervisor.findFirst({
    where: { locationId: location.id, isPrimary: true },
    include: { user: true },
  });
  if (existingPrimary && existingPrimary.userId !== user.id) {
    await prisma.locationSupervisor.update({
      where: { id: existingPrimary.id },
      data: { isPrimary: false },
    });
    console.log(`⚠️  Demoted existing primary supervisor: ${existingPrimary.user.email} (id: ${existingPrimary.userId}) → isPrimary = false`);
  } else if (existingPrimary && existingPrimary.userId === user.id) {
    console.log('ℹ️  lcrigger@ocboe.com is already the primary supervisor — will ensure record is correct.');
  }

  // 4. Upsert the LocationSupervisor record for Linda
  const record = await prisma.locationSupervisor.upsert({
    where: {
      locationId_userId_supervisorType: {
        locationId: location.id,
        userId: user.id,
        supervisorType: 'PRINCIPAL',
      },
    },
    update: {
      isPrimary: true,
    },
    create: {
      locationId: location.id,
      userId: user.id,
      supervisorType: 'PRINCIPAL',
      isPrimary: true,
    },
  });

  console.log(`\n✅ SUCCESS: LocationSupervisor record upserted.`);
  console.log(`   id:             ${record.id}`);
  console.log(`   locationId:     ${record.locationId}  (${location.name})`);
  console.log(`   userId:         ${record.userId}  (lcrigger@ocboe.com)`);
  console.log(`   supervisorType: ${record.supervisorType}`);
  console.log(`   isPrimary:      ${record.isPrimary}`);
}

main()
  .catch((err) => {
    console.error('\n❌ Script failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

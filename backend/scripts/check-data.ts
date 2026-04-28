import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('📊 Checking database data...\n');
  
  const userCount = await prisma.user.count();
  console.log(`Total users: ${userCount}`);
  
  const users = await prisma.user.findMany({ 
    take: 10, 
    orderBy: { lastName: 'asc' },
    select: { 
      id: true, 
      email: true, 
      firstName: true, 
      lastName: true, 
      displayName: true, 
      jobTitle: true, 
      role: true 
    } 
  });
  
  console.log('\nSample users:');
  users.forEach(u => {
    const name = u.displayName || `${u.firstName} ${u.lastName}`;
    const title = u.jobTitle || 'No title';
    console.log(`  - ${name} (${u.email})`);
    console.log(`    Job: ${title} | Role: ${u.role}`);
  });
  
  const locationCount = await prisma.officeLocation.count();
  console.log(`\nTotal locations: ${locationCount}`);
  
  const locations = await prisma.officeLocation.findMany({ 
    take: 10,
    orderBy: { name: 'asc' }
  });
  console.log('\nLocations:');
  locations.forEach(l => {
    console.log(`  - ${l.name} (${l.code || 'No code'}) - ${l.type}`);
  });
  
  const supervisorCount = await prisma.locationSupervisor.count();
  console.log(`\nTotal supervisor assignments: ${supervisorCount}`);
  
  if (supervisorCount === 0) {
    console.log('\n⚠️  No supervisors assigned yet!');
    console.log('You can assign supervisors using:');
    console.log('1. The UI (edit a location and add supervisors)');
    console.log('2. Run: npx tsx scripts/seed-supervisors.ts');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

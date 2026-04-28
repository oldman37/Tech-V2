import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🏫 Seeding Office Locations...\n');

  // Create office locations
  const locations = [
    {
      name: 'District Office',
      code: 'DO',
      type: 'DISTRICT_OFFICE',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Elementary School 1',
      code: 'ES1',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Elementary School 2',
      code: 'ES2',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Middle School',
      code: 'MS',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'High School',
      code: 'HS',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Alternative School',
      code: 'AS',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Pre-K Center',
      code: 'PK',
      type: 'SCHOOL',
      address: 'Add your address here',
      phone: 'Add your phone here',
    },
    {
      name: 'Technology Department',
      code: 'TECH',
      type: 'DEPARTMENT',
      address: 'District Office',
      phone: 'Add your phone here',
    },
    {
      name: 'Maintenance Department',
      code: 'MAINT',
      type: 'DEPARTMENT',
      address: 'District Office',
      phone: 'Add your phone here',
    },
  ];

  for (const location of locations) {
    const created = await prisma.officeLocation.upsert({
      where: { name: location.name },
      update: location,
      create: location,
    });
    console.log(`✅ Created/Updated: ${created.name} (${created.code})`);
  }

  console.log('\n✨ Office locations seeded successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding office locations:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

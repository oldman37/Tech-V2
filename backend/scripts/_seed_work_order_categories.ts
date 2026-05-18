/**
 * Seed script — Work Order Categories
 *
 * Seeds the initial Technology and Maintenance category values derived from
 * the legacy hardcoded TECH_CATEGORIES / MAINT_CATEGORIES arrays.
 *
 * Run with:
 *   cd C:\Tech-V2\backend
 *   npx tsx scripts/_seed_work_order_categories.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const techCategories = [
  { name: 'Hardware Failure',       module: 'TECHNOLOGY' as const, sortOrder: 1 },
  { name: 'Software Issue',         module: 'TECHNOLOGY' as const, sortOrder: 2 },
  { name: 'Network / Connectivity', module: 'TECHNOLOGY' as const, sortOrder: 3 },
  { name: 'Printing',               module: 'TECHNOLOGY' as const, sortOrder: 4 },
  { name: 'Projector / Display',    module: 'TECHNOLOGY' as const, sortOrder: 5 },
  { name: 'Chromebook',             module: 'TECHNOLOGY' as const, sortOrder: 6 },
  { name: 'Device Setup',           module: 'TECHNOLOGY' as const, sortOrder: 7 },
  { name: 'Password Reset',         module: 'TECHNOLOGY' as const, sortOrder: 8 },
  { name: 'Account Access',         module: 'TECHNOLOGY' as const, sortOrder: 9 },
  { name: 'Other',                  module: 'TECHNOLOGY' as const, sortOrder: 10 },
];

const maintCategories = [
  { name: 'Plumbing',       module: 'MAINTENANCE' as const, sortOrder: 1 },
  { name: 'Electrical',     module: 'MAINTENANCE' as const, sortOrder: 2 },
  { name: 'HVAC — Heating', module: 'MAINTENANCE' as const, sortOrder: 3 },
  { name: 'HVAC — Cooling', module: 'MAINTENANCE' as const, sortOrder: 4 },
  { name: 'Carpentry',      module: 'MAINTENANCE' as const, sortOrder: 5 },
  { name: 'Painting',       module: 'MAINTENANCE' as const, sortOrder: 6 },
  { name: 'Flooring',       module: 'MAINTENANCE' as const, sortOrder: 7 },
  { name: 'Pest Control',   module: 'MAINTENANCE' as const, sortOrder: 8 },
  { name: 'Cleaning',       module: 'MAINTENANCE' as const, sortOrder: 9 },
  { name: 'Door / Lock',    module: 'MAINTENANCE' as const, sortOrder: 10 },
  { name: 'Window',         module: 'MAINTENANCE' as const, sortOrder: 11 },
  { name: 'Roof',           module: 'MAINTENANCE' as const, sortOrder: 12 },
  { name: 'Grounds',        module: 'MAINTENANCE' as const, sortOrder: 13 },
  { name: 'Other',          module: 'MAINTENANCE' as const, sortOrder: 14 },
];

async function main() {
  const all = [...techCategories, ...maintCategories];
  let created = 0;
  let skipped = 0;

  for (const cat of all) {
    const result = await prisma.workOrderCategory.upsert({
      where: { name_module: { name: cat.name, module: cat.module } },
      update: {},
      create: {
        name:      cat.name,
        module:    cat.module,
        sortOrder: cat.sortOrder,
        isActive:  true,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`Work order categories seed complete: ${created} created, ${skipped} already existed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Seed missing office locations from room.csv
 * This script ensures all schools/locations in the CSV exist in the database
 * 
 * Usage: npx tsx scripts/seed-locations-from-csv.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function parseCsvForLocations(filePath: string): Promise<Set<string>> {
  const locations = new Set<string>();
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [schoolName] = line.split(',').map(s => s.trim());
    
    if (schoolName) {
      locations.add(schoolName);
    }
  }

  return locations;
}

async function seedLocations() {
  console.log('🏫 Seeding Office Locations from CSV...\n');

  try {
    // Get CSV file path
    const csvPath = path.join(__dirname, '../../docs/room.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    console.log(`📄 Reading CSV file: ${csvPath}`);
    
    // Parse CSV for unique locations
    const csvLocations = await parseCsvForLocations(csvPath);
    console.log(`✓ Found ${csvLocations.size} unique locations in CSV\n`);

    // Get existing locations
    const existingLocations = await prisma.officeLocation.findMany({
      select: { name: true }
    });
    
    const existingNames = new Set(existingLocations.map(l => l.name));
    console.log(`✓ Found ${existingNames.size} existing locations in database\n`);

    // Find missing locations
    const missingLocations = Array.from(csvLocations).filter(
      name => !existingNames.has(name)
    );

    if (missingLocations.length === 0) {
      console.log('✅ All locations already exist in the database!');
      return;
    }

    console.log(`📝 Creating ${missingLocations.length} missing locations:\n`);

    let created = 0;
    for (const locationName of missingLocations) {
      try {
        // Determine location type based on name
        let type = 'SCHOOL';
        if (locationName.includes('District') || locationName.includes('County Schools')) {
          type = 'DISTRICT_OFFICE';
        } else if (locationName.includes('Dept') || locationName.includes('Department')) {
          type = 'DEPARTMENT';
        } else if (locationName.includes('Transportation')) {
          type = 'DEPARTMENT';
        } else if (locationName.includes('Maintenance')) {
          type = 'DEPARTMENT';
        } else if (locationName.includes('Technology') || locationName.includes('Career')) {
          type = 'DEPARTMENT';
        }

        await prisma.officeLocation.create({
          data: {
            name: locationName,
            type: type,
            isActive: true
          }
        });

        console.log(`  ✓ Created: ${locationName} (${type})`);
        created++;
      } catch (error: any) {
        console.error(`  ✗ Failed to create ${locationName}: ${error.message}`);
      }
    }

    console.log(`\n✅ Created ${created} new office locations!`);

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedLocations()
  .then(() => {
    console.log('\n✨ Location seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Location seeding failed:', error);
    process.exit(1);
  });

/**
 * Import rooms from CSV file into the database
 * This script reads room.csv and creates Room records linked to OfficeLocations
 * 
 * Usage: npx tsx scripts/import-rooms.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface RoomCSVRow {
  Schools: string;
  Rooms: string;
}

// Classify room type based on room name keywords
function classifyRoomType(roomName: string): string {
  const nameLower = roomName.toLowerCase();

  const typeKeywords: Record<string, string[]> = {
    'OFFICE': ['office', 'principal', 'guidance', 'bookkeeper', 'secretary', 'director', 'asst', 'assistant'],
    'CLASSROOM': ['room', 'e-', 'n-', 's-', 'w-'],
    'GYM': ['gym', 'fieldhouse', 'weight room', 'locker room'],
    'CAFETERIA': ['cafeteria', 'kitchen', 'food service'],
    'LIBRARY': ['library'],
    'LAB': ['lab', 'computer'],
    'MAINTENANCE': ['maintenance', 'closet', 'storage', 'shop', 'warehouse'],
    'SPORTS': ['football', 'basketball', 'varsity', 'coach', 'concession'],
    'MUSIC': ['band', 'music', 'choir'],
    'MEDICAL': ['nurse', 'clinic'],
    'CONFERENCE': ['conference', 'workroom'],
    'TECHNOLOGY': ['server', 'networking', 'wiring', 'data closet', 'mpb'],
    'TRANSPORTATION': ['bus', 'truck'],
    'SPECIAL_ED': ['special ed', 'sped', 'resource', 'speech', 'chapter'],
    'OTHER': ['mobile', 'ag', 'cte', 'green house']
  };

  // Check keywords
  for (const [roomType, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some(keyword => nameLower.includes(keyword))) {
      return roomType;
    }
  }

  // Check if it's a numbered room (likely classroom)
  const cleanedName = roomName.replace(/[-\s]/g, '');
  if (/^\d+$/.test(cleanedName) || /^[A-Z]\d+$/i.test(cleanedName)) {
    return 'CLASSROOM';
  }

  return 'GENERAL';
}

// Main import function
async function importRooms() {
  console.log('🏫 Starting room import from CSV...\n');

  try {
    // Get CSV file path
    const csvPath = path.join(__dirname, '../../docs/room.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    console.log(`📄 Reading CSV file: ${csvPath}`);
    
    // Parse CSV using csv-parse
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as RoomCSVRow[];

    console.log(`✓ Parsed ${records.length} room entries from CSV\n`);

    // Get all office locations from database
    console.log('🔍 Fetching office locations from database...');
    const locations = await prisma.officeLocation.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });

    // Create a map for quick lookup (case-insensitive)
    const locationMap = new Map<string, string>();
    locations.forEach(loc => locationMap.set(loc.name.toLowerCase(), loc.id));
    
    console.log(`✓ Found ${locations.length} active office locations:`);
    locations.forEach(loc => console.log(`  - ${loc.name}`));
    console.log('');

    // Track statistics
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const missingLocations = new Set<string>();

    console.log('💾 Importing rooms...');

    // Process each room
    for (const row of records) {
      const schoolName = row.Schools?.trim();
      const roomName = row.Rooms?.trim();

      // Skip empty rows
      if (!schoolName || !roomName) {
        skipped++;
        continue;
      }

      // Check if location exists (case-insensitive)
      const locationId = locationMap.get(schoolName.toLowerCase());
      
      if (!locationId) {
        missingLocations.add(schoolName);
        skipped++;
        continue;
      }

      // Classify room type
      const roomType = classifyRoomType(roomName);

      try {
        // Upsert room (insert or update if exists)
        const room = await prisma.room.upsert({
          where: {
            locationId_name: {
              locationId,
              name: roomName
            }
          },
          create: {
            locationId,
            name: roomName,
            type: roomType,
            isActive: true
          },
          update: {
            type: roomType,
            isActive: true,
            updatedAt: new Date()
          }
        });

        // Check if created vs updated based on timestamps
        const timeDiff = room.updatedAt.getTime() - room.createdAt.getTime();
        if (timeDiff < 1000) { // Within 1 second means it was just created
          inserted++;
        } else {
          updated++;
        }

      } catch (error: any) {
        errors.push(`Failed to import room "${roomName}" at "${schoolName}": ${error.message}`);
      }

      // Progress indicator
      const total = inserted + updated + skipped;
      if (total % 50 === 0) {
        process.stdout.write(`\r  Processed: ${total}/${records.length}`);
      }
    }

    process.stdout.write(`\r  Processed: ${records.length}/${records.length}\n`);
    console.log('✅ Import completed!\n');

    // Display summary
    console.log('═══════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`✓ Rooms inserted: ${inserted}`);
    console.log(`↻ Rooms updated:  ${updated}`);
    console.log(`⊘ Rows skipped:   ${skipped}`);
    console.log(`✗ Errors:         ${errors.length}`);
    console.log('═══════════════════════════════════════\n');

    // Display missing locations
    if (missingLocations.size > 0) {
      console.log('⚠️  MISSING OFFICE LOCATIONS:');
      console.log('These locations were in the CSV but not found in the database:');
      missingLocations.forEach(loc => console.log(`  • ${loc}`));
      console.log('\n💡 Tip: Create these locations in OfficeLocation table first.\n');
    }

    // Display errors
    if (errors.length > 0) {
      console.log('❌ ERRORS:');
      errors.slice(0, 10).forEach(err => console.log(`  • ${err}`));
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors\n`);
      }
    }

    // Display room type distribution
    console.log('📈 ROOM TYPE DISTRIBUTION:');
    const typeCounts = await prisma.room.groupBy({
      by: ['type'],
      _count: true,
      orderBy: {
        _count: {
          type: 'desc'
        }
      }
    });

    typeCounts.forEach(({ type, _count }) => {
      console.log(`  ${type?.padEnd(20)} : ${_count}`);
    });
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Fatal error during import:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the import
importRooms()
  .then(() => {
    console.log('✨ Room import script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Room import script failed:', error);
    process.exit(1);
  });

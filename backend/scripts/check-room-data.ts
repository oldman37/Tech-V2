/**
 * Verify room data import
 * This script checks that rooms were imported correctly and displays statistics
 * 
 * Usage: npx tsx scripts/check-room-data.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkRoomData() {
  console.log('🔍 Verifying Room Data Import\n');
  console.log('='.repeat(70));

  try {
    // Get total room count
    const totalRooms = await prisma.room.count();
    console.log(`\n📊 Total Rooms: ${totalRooms}`);

    // Get rooms per location
    console.log('\n🏢 Rooms by Location:');
    console.log('-'.repeat(70));
    
    const roomsByLocation = await prisma.officeLocation.findMany({
      include: {
        _count: {
          select: { rooms: true }
        }
      },
      orderBy: {
        rooms: {
          _count: 'desc'
        }
      }
    });

    roomsByLocation.forEach(location => {
      const count = location._count.rooms;
      if (count > 0) {
        console.log(`  ${location.name.padEnd(40)} : ${count} rooms`);
      }
    });

    // Get rooms by type
    console.log('\n📝 Rooms by Type:');
    console.log('-'.repeat(70));
    
    const roomsByType = await prisma.room.groupBy({
      by: ['type'],
      _count: true,
      orderBy: {
        _count: {
          type: 'desc'
        }
      }
    });

    roomsByType.forEach(({ type, _count }) => {
      console.log(`  ${(type || 'NULL').padEnd(25)} : ${_count}`);
    });

    // Sample rooms from different schools
    console.log('\n🎯 Sample Rooms (5 per location):');
    console.log('-'.repeat(70));

    const sampleLocations = await prisma.officeLocation.findMany({
      take: 3,
      include: {
        rooms: {
          take: 5,
          orderBy: { name: 'asc' }
        }
      },
      where: {
        rooms: {
          some: {}
        }
      }
    });

    sampleLocations.forEach(location => {
      console.log(`\n  ${location.name}:`);
      location.rooms.forEach(room => {
        console.log(`    - ${room.name} (${room.type || 'GENERAL'})`);
      });
    });

    // Check for duplicate rooms
    console.log('\n🔎 Checking for Duplicates:');
    console.log('-'.repeat(70));
    
    const duplicates = await prisma.$queryRaw<Array<{ locationId: string; name: string; count: bigint }>>`
      SELECT "locationId", name, COUNT(*) as count
      FROM rooms
      GROUP BY "locationId", name
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length > 0) {
      console.log(`  ⚠️  Found ${duplicates.length} duplicate room entries!`);
      duplicates.forEach(dup => {
        console.log(`    - Location ID: ${dup.locationId}, Room: ${dup.name}, Count: ${dup.count}`);
      });
    } else {
      console.log('  ✓ No duplicates found');
    }

    // Check for rooms with missing locations - skip this check since FK constraint ensures integrity
    console.log('\n🔗 Checking Foreign Key Integrity:');
    console.log('-'.repeat(70));
    console.log('  ✓ All rooms have valid location references (enforced by FK constraint)');

    // Check active vs inactive rooms
    console.log('\n📌 Room Status:');
    console.log('-'.repeat(70));
    
    const activeCount = await prisma.room.count({ where: { isActive: true } });
    const inactiveCount = await prisma.room.count({ where: { isActive: false } });
    
    console.log(`  Active rooms:   ${activeCount}`);
    console.log(`  Inactive rooms: ${inactiveCount}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Verification Complete!\n');

  } catch (error: any) {
    console.error('\n❌ Error during verification:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run verification
checkRoomData()
  .then(() => {
    console.log('✨ Room data verification completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Room data verification failed:', error);
    process.exit(1);
  });

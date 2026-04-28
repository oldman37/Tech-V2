import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkLocationMismatch() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          LOCATION DATA VERIFICATION                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Check Brenna Ray's data
    const user = await prisma.user.findUnique({
      where: { email: 'bray1@ocboe.com' },
      select: {
        email: true,
        displayName: true,
        officeLocation: true
      }
    });

    if (user) {
      console.log('👤 User Data:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Display Name: ${user.displayName}`);
      console.log(`   Office Location (stored): "${user.officeLocation}"`);
      console.log(`   Length: ${user.officeLocation?.length || 0} characters\n`);
    }

    // Check all locations in database
    console.log('📍 All Office Locations in Database:\n');
    const locations = await prisma.officeLocation.findMany({
      where: { isActive: true },
      select: {
        name: true,
        code: true,
        type: true
      },
      orderBy: { name: 'asc' }
    });

    locations.forEach(loc => {
      console.log(`   • ${loc.name} (${loc.code || 'no code'}) - ${loc.type}`);
      console.log(`     Length: ${loc.name.length} characters`);
    });

    // Check for similar matches
    if (user?.officeLocation) {
      console.log(`\n🔍 Looking for matches for: "${user.officeLocation}"`);
      
      const exactMatch = locations.find(loc => loc.name === user.officeLocation);
      if (exactMatch) {
        console.log(`   ✅ Exact match found: "${exactMatch.name}"`);
      } else {
        console.log(`   ❌ No exact match found`);
        
        // Check for partial matches
        const partial = locations.filter(loc => 
          loc.name.toLowerCase().includes(user.officeLocation!.toLowerCase()) ||
          user.officeLocation!.toLowerCase().includes(loc.name.toLowerCase())
        );
        
        if (partial.length > 0) {
          console.log(`\n   ⚠️  Possible matches found:`);
          partial.forEach(loc => {
            console.log(`      • "${loc.name}"`);
          });
        }
      }
    }

    // Show all unique office locations from users
    console.log('\n\n📊 All unique officeLocation values from users:\n');
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'] }
      },
      select: {
        officeLocation: true
      }
    });

    const uniqueLocations = [...new Set(users.map(u => u.officeLocation).filter(Boolean))].sort();
    
    uniqueLocations.forEach(loc => {
      const match = locations.find(l => l.name === loc);
      const status = match ? '✅' : '❌';
      console.log(`   ${status} "${loc}"`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkLocationMismatch();

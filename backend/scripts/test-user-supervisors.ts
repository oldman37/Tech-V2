import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function getUserSupervisors(userEmail: string) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          USER SUPERVISOR LOOKUP TEST                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Find the user
    console.log(`🔍 Looking up user: ${userEmail}`);
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        officeLocation: true,
        jobTitle: true,
        role: true,
        isActive: true
      }
    });

    if (!user) {
      console.log(`❌ User not found: ${userEmail}\n`);
      return null;
    }

    console.log(`✅ Found user: ${user.displayName || `${user.firstName} ${user.lastName}`}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Job Title: ${user.jobTitle || 'N/A'}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Office Location: ${user.officeLocation || 'Not set'}`);
    console.log(`   Status: ${user.isActive ? 'Active' : 'Inactive'}\n`);

    if (!user.officeLocation) {
      console.log(`⚠️  User has no office location set - cannot determine supervisors\n`);
      return null;
    }

    // Step 2: Find the office location
    console.log(`📍 Looking up office location: "${user.officeLocation}"`);
    const location = await prisma.officeLocation.findFirst({
      where: {
        name: user.officeLocation,
        isActive: true
      },
      include: {
        supervisors: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                displayName: true,
                jobTitle: true
              }
            }
          },
          orderBy: [
            { isPrimary: 'desc' },
            { supervisorType: 'asc' }
          ]
        }
      }
    });

    if (!location) {
      console.log(`❌ Office location "${user.officeLocation}" not found in database`);
      console.log(`   This location needs to be created first\n`);
      return null;
    }

    console.log(`✅ Found location: ${location.name}`);
    console.log(`   Type: ${location.type}`);
    console.log(`   Code: ${location.code || 'N/A'}`);
    console.log(`   Address: ${location.address || 'N/A'}`);
    if (location.city && location.state) {
      console.log(`   ${location.city}, ${location.state} ${location.zip || ''}`);
    }

    // Step 3: Display supervisors
    console.log(`\n👥 SUPERVISORS for ${user.displayName || user.email}:`);
    console.log(`   (Based on office location: ${location.name})\n`);

    if (location.supervisors.length === 0) {
      console.log(`   ⚠️  No supervisors assigned to this location yet\n`);
      return { user, location, supervisors: [] };
    }

    console.log(`   Found ${location.supervisors.length} supervisor(s):\n`);

    // Group by type
    const supervisorsByType: Record<string, any[]> = {};
    for (const assignment of location.supervisors) {
      if (!supervisorsByType[assignment.supervisorType]) {
        supervisorsByType[assignment.supervisorType] = [];
      }
      supervisorsByType[assignment.supervisorType].push(assignment);
    }

    // Display grouped supervisors
    for (const [type, assignments] of Object.entries(supervisorsByType)) {
      const typeLabel = getTypeLabel(type);
      console.log(`   ${typeLabel}:`);
      
      for (const assignment of assignments) {
        const supervisor = assignment.user;
        const isPrimary = assignment.isPrimary ? ' (PRIMARY)' : '';
        console.log(`      • ${supervisor.displayName || `${supervisor.firstName} ${supervisor.lastName}`}${isPrimary}`);
        console.log(`        ${supervisor.email}`);
        if (supervisor.jobTitle) {
          console.log(`        ${supervisor.jobTitle}`);
        }
        console.log('');
      }
    }

    console.log('─────────────────────────────────────────────────────────────');
    console.log('✅ Test Complete: User-Supervisor relationship working!\n');

    return { user, location, supervisors: location.supervisors };

  } catch (error) {
    console.error('\n❌ Error:', error);
    return null;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'PRINCIPAL': '🏫 Principal',
    'VICE_PRINCIPAL': '👔 Vice Principal',
    'DIRECTOR_OF_SCHOOLS': '👑 Director of Schools',
    'FINANCE_DIRECTOR': '💰 Finance Director',
    'SPED_DIRECTOR': '🎓 SPED Director',
    'MAINTENANCE_DIRECTOR': '🔧 Maintenance Director',
    'TRANSPORTATION_DIRECTOR': '🚌 Transportation Director',
    'TECHNOLOGY_DIRECTOR': '💻 Technology Director',
    'AFTERSCHOOL_DIRECTOR': '⏰ Afterschool Director',
    'NURSE_DIRECTOR': '🏥 Nurse Director',
    'SUPERVISORS_OF_INSTRUCTION': '📚 Supervisor of Instruction',
    'CTE_SUPERVISOR': '🏗️ CTE Supervisor',
    'PREK_SUPERVISOR': '👶 Pre-K Supervisor',
  };
  return labels[type] || type;
}

// Get user email from command line or use default
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('\n⚠️  Usage: npx tsx scripts/test-user-supervisors.ts <user-email>');
  console.log('   Example: npx tsx scripts/test-user-supervisors.ts bray1@ocboe.com\n');
  process.exit(1);
}

getUserSupervisors(userEmail);

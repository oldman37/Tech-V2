import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Initialize Microsoft Graph client
const credential = new ClientSecretCredential(
  process.env.ENTRA_TENANT_ID!,
  process.env.ENTRA_CLIENT_ID!,
  process.env.ENTRA_CLIENT_SECRET!
);

const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await credential.getToken('https://graph.microsoft.com/.default');
      return token.token;
    }
  }
});

interface SupervisorGroupConfig {
  groupId: string;
  supervisorType: string;
  name: string;
  isPrimary: boolean;
  /** If set, assign to this department code instead of the user's officeLocation */
  departmentCode?: string;
}

const supervisorGroups: SupervisorGroupConfig[] = [
  {
    groupId: process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID!,
    supervisorType: 'DIRECTOR_OF_SCHOOLS',
    name: 'Director of Schools',
    isPrimary: true,
    departmentCode: 'DO'
  },
  {
    groupId: process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID!,
    supervisorType: 'FINANCE_DIRECTOR',
    name: 'Finance Director',
    isPrimary: true,
    departmentCode: 'FD'
  },
  {
    groupId: process.env.ENTRA_SPED_DIRECTOR_GROUP_ID!,
    supervisorType: 'SPED_DIRECTOR',
    name: 'SPED Director',
    isPrimary: false,
    departmentCode: 'SPED'
  },
  {
    groupId: process.env.ENTRA_PRINCIPALS_GROUP_ID!,
    supervisorType: 'PRINCIPAL',
    name: 'Principals',
    isPrimary: true
  },
  {
    groupId: process.env.ENTRA_VICE_PRINCIPALS_GROUP_ID!,
    supervisorType: 'VICE_PRINCIPAL',
    name: 'Vice Principals',
    isPrimary: false
  },
  {
    groupId: process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID!,
    supervisorType: 'MAINTENANCE_DIRECTOR',
    name: 'Maintenance Director',
    isPrimary: true,
    departmentCode: 'MAINT'
  },
  {
    groupId: process.env.ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID!,
    supervisorType: 'TRANSPORTATION_DIRECTOR',
    name: 'Transportation Director',
    isPrimary: true,
    departmentCode: 'TD'
  },
  {
    groupId: process.env.ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID!,
    supervisorType: 'TECHNOLOGY_DIRECTOR',
    name: 'Technology Director',
    isPrimary: true,
    departmentCode: 'TECH'
  },
  {
    groupId: process.env.ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID!,
    supervisorType: 'AFTERSCHOOL_DIRECTOR',
    name: 'Afterschool Director',
    isPrimary: false,
    departmentCode: 'AS'
  },
  {
    groupId: process.env.ENTRA_NURSE_DIRECTOR_GROUP_ID!,
    supervisorType: 'NURSE_DIRECTOR',
    name: 'Nurse Director',
    isPrimary: false,
    departmentCode: 'ND'
  },
  {
    groupId: process.env.ENTRA_CTE_DIRECTOR_GROUP_ID!,
    supervisorType: 'CTE_DIRECTOR',
    name: 'CTE Director',
    isPrimary: true,
    departmentCode: 'CTE'
  },
  {
    groupId: process.env.ENTRA_PRE_K_DIRECTOR_GROUP_ID!,
    supervisorType: 'PRE_K_DIRECTOR',
    name: 'Pre-K Director',
    isPrimary: true,
    departmentCode: 'PreK'
  },
  {
    groupId: process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID!,
    supervisorType: 'FOOD_SERVICES_SUPERVISOR',
    name: 'Food Services Supervisor',
    isPrimary: false,
    departmentCode: 'FS'
  }
];

// Location mapping - normalize variations
const locationMapping: Record<string, { code: string; type: 'SCHOOL' | 'DEPARTMENT' | 'DISTRICT_OFFICE' | 'PROGRAM' }> = {
  'District Office': { code: 'DO', type: 'DISTRICT_OFFICE' },
  'Assigned To District': { code: 'DO', type: 'DISTRICT_OFFICE' },
  'Assigned to District': { code: 'DO', type: 'DISTRICT_OFFICE' },
  'Transportation Department': { code: 'TD', type: 'DEPARTMENT' },
  'Tansportation Department': { code: 'TD', type: 'DEPARTMENT' },
  'Maintenance Department': { code: 'MAINT', type: 'DEPARTMENT' },
  'Technology Department': { code: 'TECH', type: 'DEPARTMENT' },
  'Obion County Central High School': { code: 'OCCHS', type: 'SCHOOL' },
  'Central High School': { code: 'OCCHS', type: 'SCHOOL' },
  'Obion County Middle School': { code: 'OCMS', type: 'SCHOOL' },
  'Hillcrest Elementary': { code: 'HES', type: 'SCHOOL' },
  'Lake Road Elementary': { code: 'LRES', type: 'SCHOOL' },
  'Ridgemont Elementary': { code: 'OCMS', type: 'SCHOOL' },  // renamed to Obion County Middle School
  'South Fulton Elementary': { code: 'SFEL', type: 'SCHOOL' },
  'South Fulton Middle/High School': { code: 'SFMHS', type: 'SCHOOL' },
  'South Fulton Middle High School': { code: 'SFMHS', type: 'SCHOOL' },
  'Food Service': { code: 'FS', type: 'DEPARTMENT' },
  'Afterschool': { code: 'AS', type: 'PROGRAM' },
  'Pre-K': { code: 'PreK', type: 'DEPARTMENT' },
  'CTE': { code: 'CTE', type: 'DEPARTMENT' },
  'Nurse Director': { code: 'ND', type: 'DEPARTMENT' },
  'Finance Director': { code: 'FD', type: 'DEPARTMENT' },
  'Sped Department': { code: 'SPED', type: 'DEPARTMENT' },
};

async function getOrCreateLocation(locationName: string) {
  if (!locationName) return null;

  const mapping = locationMapping[locationName];
  if (!mapping) {
    console.log(`   ⚠️  No mapping for location: "${locationName}"`);
    return null;
  }

  // Try finding by code first
  let location = await prisma.officeLocation.findFirst({
    where: { code: mapping.code, isActive: true }
  });

  // Fallback: find by name (handles cases where code differs or isActive is false)
  if (!location) {
    const standardName = Object.keys(locationMapping).find(
      key => locationMapping[key].code === mapping.code && 
             !key.toLowerCase().includes('assigned')
    ) || locationName;

    location = await prisma.officeLocation.findFirst({
      where: { name: standardName }
    });

    if (location) {
      // Update code/type/isActive if needed
      if (location.code !== mapping.code || !location.isActive) {
        location = await prisma.officeLocation.update({
          where: { id: location.id },
          data: { code: mapping.code, type: mapping.type, isActive: true }
        });
      }
    } else {
      location = await prisma.officeLocation.create({
        data: {
          name: standardName,
          code: mapping.code,
          type: mapping.type,
          isActive: true
        }
      });
      console.log(`   ➕ Created location: ${standardName} (${mapping.code})`);
    }
  }

  return location;
}

async function getGroupMembers(groupId: string): Promise<Set<string>> {
  const members = new Set<string>();
  
  try {
    let nextLink: string | undefined = `/groups/${groupId}/members`;
    
    while (nextLink) {
      const response = await graphClient.api(nextLink).get();
      
      for (const member of response.value) {
        if (member['@odata.type'] === '#microsoft.graph.user') {
          members.add(member.id);
        }
      }
      
      nextLink = response['@odata.nextLink'];
    }
  } catch (error) {
    console.error(`   ❌ Error fetching group members:`, error);
  }

  return members;
}

async function getUserDetails(userId: string) {
  try {
    const user = await graphClient
      .api(`/users/${userId}`)
      .select('id,mail,displayName,givenName,surname,officeLocation,jobTitle,accountEnabled')
      .get();
    
    return {
      entraId: user.id,
      email: user.mail,
      displayName: user.displayName,
      firstName: user.givenName || '',
      lastName: user.surname || '',
      officeLocation: user.officeLocation,
      jobTitle: user.jobTitle,
      isActive: user.accountEnabled !== false
    };
  } catch (error) {
    console.error(`   ❌ Error fetching user ${userId}:`, error);
    return null;
  }
}

async function syncSupervisorAssignments() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     SUPERVISOR ASSIGNMENT SYNC JOB                        ║');
  console.log('║     ' + new Date().toLocaleString().padEnd(55) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let stats = {
    groupsProcessed: 0,
    usersUpdated: 0,
    assignmentsAdded: 0,
    assignmentsRemoved: 0,
    usersDeactivated: 0,
    locationsChanged: 0,
    errors: 0
  };

  try {
    // Step 1: Get all current supervisor assignments
    console.log('📋 Step 1: Loading current supervisor assignments...');
    const currentAssignments = await prisma.locationSupervisor.findMany({
      include: {
        user: { select: { entraId: true, email: true, officeLocation: true } },
        location: { select: { name: true, code: true } }
      }
    });
    console.log(`   Found ${currentAssignments.length} existing assignments\n`);

    // Step 2: Process each supervisor group
    console.log('🔄 Step 2: Processing supervisor groups from Entra ID...\n');
    
    const validSupervisorEntraIds = new Set<string>();
    
    for (const group of supervisorGroups) {
      console.log(`📂 Processing: ${group.name}`);
      stats.groupsProcessed++;

      // Get current group members from Entra
      const groupMembers = await getGroupMembers(group.groupId);
      console.log(`   Found ${groupMembers.size} members in Entra group`);

      for (const entraId of groupMembers) {
        validSupervisorEntraIds.add(entraId);
        
        // Get user details from Entra
        const entraUser = await getUserDetails(entraId);
        if (!entraUser) continue;

        // Skip service accounts / shared mailboxes without an email
        if (!entraUser.email) {
          console.log(`   ⚠️  Skipping ${entraUser.displayName}: no email address`);
          continue;
        }

        // Find or update user in database
        let dbUser = await prisma.user.findUnique({
          where: { entraId }
        });

        if (!dbUser) {
          console.log(`   ➕ New supervisor: ${entraUser.displayName}`);
          dbUser = await prisma.user.create({
            data: {
              entraId: entraUser.entraId,
              email: entraUser.email,
              firstName: entraUser.firstName,
              lastName: entraUser.lastName,
              displayName: entraUser.displayName,
              officeLocation: entraUser.officeLocation,
              jobTitle: entraUser.jobTitle,
              role: 'MANAGER',
              isActive: entraUser.isActive,
              lastSync: new Date()
            }
          });
          stats.usersUpdated++;
        } else {
          // Check if office location changed
          const locationChanged = dbUser.officeLocation !== entraUser.officeLocation;
          
          // Update user info
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              email: entraUser.email,
              firstName: entraUser.firstName,
              lastName: entraUser.lastName,
              displayName: entraUser.displayName,
              officeLocation: entraUser.officeLocation,
              jobTitle: entraUser.jobTitle,
              isActive: entraUser.isActive,
              lastSync: new Date()
            }
          });

          if (locationChanged) {
            console.log(`   📍 ${entraUser.displayName}: location changed`);
            console.log(`      From: ${dbUser.officeLocation || 'None'}`);
            console.log(`      To: ${entraUser.officeLocation || 'None'}`);
            stats.locationsChanged++;
            stats.usersUpdated++;
          }
        }

        // Resolve target location: use departmentCode override or user's officeLocation
        let location;
        if (group.departmentCode) {
          // Department/director roles → assign to their specific department
          location = await prisma.officeLocation.findFirst({
            where: { code: group.departmentCode, isActive: true }
          });
          if (!location) {
            console.log(`   ⚠️  Department not found for code: "${group.departmentCode}"`);
          }
        } else {
          // School-level roles → assign based on user's office location from Entra
          location = await getOrCreateLocation(entraUser.officeLocation || '');
        }
        
        if (location) {

          // Check if assignment already exists
          const existingAssignment = await prisma.locationSupervisor.findUnique({
            where: {
              locationId_userId_supervisorType: {
                locationId: location.id,
                userId: dbUser.id,
                supervisorType: group.supervisorType
              }
            }
          });

          if (!existingAssignment) {
            await prisma.locationSupervisor.create({
              data: {
                locationId: location.id,
                userId: dbUser.id,
                supervisorType: group.supervisorType,
                isPrimary: group.isPrimary
              }
            });
            console.log(`   ✅ Assigned ${entraUser.displayName} to ${location.name} as ${group.name}`);
            stats.assignmentsAdded++;
          }
        }
      }

      console.log('');
    }

    // Step 3: Remove assignments for users no longer in groups or deactivated
    console.log('🧹 Step 3: Cleaning up stale assignments...\n');
    
    for (const assignment of currentAssignments) {
      const userStillValid = validSupervisorEntraIds.has(assignment.user.entraId);
      
      if (!userStillValid) {
        await prisma.locationSupervisor.delete({
          where: { id: assignment.id }
        });
        console.log(`   🗑️  Removed: ${assignment.user.email} from ${assignment.location.name}`);
        console.log(`      Reason: No longer in supervisor group`);
        stats.assignmentsRemoved++;
      }
    }

    // Step 4: Deactivate users no longer in any group
    console.log('\n👤 Step 4: Checking for users to deactivate...\n');
    
    const supervisorsToCheck = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true
      }
    });

    for (const user of supervisorsToCheck) {
      if (!validSupervisorEntraIds.has(user.entraId)) {
        const hasAssignments = await prisma.locationSupervisor.count({
          where: { userId: user.id }
        });

        if (hasAssignments === 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { isActive: false }
          });
          console.log(`   ⏸️  Deactivated: ${user.displayName || user.email}`);
          stats.usersDeactivated++;
        }
      }
    }

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    SYNC SUMMARY                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║ Supervisor Groups Processed: ${stats.groupsProcessed.toString().padStart(27)} ║`);
    console.log(`║ Users Updated:               ${stats.usersUpdated.toString().padStart(27)} ║`);
    console.log(`║ Location Changes:            ${stats.locationsChanged.toString().padStart(27)} ║`);
    console.log(`║ Assignments Added:           ${stats.assignmentsAdded.toString().padStart(27)} ║`);
    console.log(`║ Assignments Removed:         ${stats.assignmentsRemoved.toString().padStart(27)} ║`);
    console.log(`║ Users Deactivated:           ${stats.usersDeactivated.toString().padStart(27)} ║`);
    console.log(`║ Errors:                      ${stats.errors.toString().padStart(27)} ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('✨ Sync completed successfully!\n');

  } catch (error) {
    console.error('\n❌ SYNC FAILED:', error);
    stats.errors++;
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  return stats;
}

// Run if called directly
if (require.main === module) {
  syncSupervisorAssignments()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { syncSupervisorAssignments };

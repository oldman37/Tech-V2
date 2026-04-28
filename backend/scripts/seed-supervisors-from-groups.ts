import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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

interface GroupConfig {
  groupId: string;
  supervisorType: 'PRINCIPAL' | 'MAINTENANCE_ADMIN' | 'TECH_ADMIN' | 'DIRECTOR_OF_SCHOOLS' | 'DIRECTOR_OF_FINANCE';
  description: string;
}

async function getGroupMembers(groupId: string): Promise<any[]> {
  try {
    const members = await graphClient
      .api(`/groups/${groupId}/members`)
      .select('id,mail,displayName,jobTitle')
      .get();
    return members.value || [];
  } catch (error: any) {
    console.error(`Error fetching group members for ${groupId}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('👥 Seeding Supervisors from Entra ID Groups...\n');

  // Define group mappings
  const groupConfigs = [
    {
      groupId: process.env.ENTRA_PRINCIPALS_GROUP_ID!,
      supervisorType: 'PRINCIPAL' as const,
      description: 'Principals'
    },
    {
      groupId: process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID!,
      supervisorType: 'MAINTENANCE_DIRECTOR' as const,
      description: 'Maintenance Directors'
    },
    {
      groupId: process.env.ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID!,
      supervisorType: 'TECHNOLOGY_DIRECTOR' as const,
      description: 'Technology Directors'
    },
    {
      groupId: process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID!,
      supervisorType: 'DIRECTOR_OF_SCHOOLS' as const,
      description: 'Director of Schools'
    },
    {
      groupId: process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID!,
      supervisorType: 'FINANCE_DIRECTOR' as const,
      description: 'Finance Directors'
    }
  ].filter(config => config.groupId && config.groupId.trim() !== '');

  // Get all locations
  const locations = await prisma.officeLocation.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  const schools = locations.filter(l => l.type === 'SCHOOL');
  const districtOffice = locations.find(l => l.type === 'DISTRICT_OFFICE');
  
  console.log(`📍 Found ${locations.length} locations (${schools.length} schools)\n`);

  let totalAssignments = 0;

  // Process each group
  for (const config of groupConfigs) {
    console.log(`\n📋 Processing ${config.description} (${config.supervisorType})...`);
    
    const groupMembers = await getGroupMembers(config.groupId);
    console.log(`   Found ${groupMembers.length} members in Entra ID group`);

    if (groupMembers.length === 0) {
      console.log(`   ⚠️  No members found, skipping...`);
      continue;
    }

    // Match group members with database users
    for (const member of groupMembers) {
      if (!member.mail) continue;

      const user = await prisma.user.findUnique({
        where: { email: member.mail.toLowerCase() }
      });

      if (!user) {
        console.log(`   ⚠️  User not found in database: ${member.mail}`);
        continue;
      }

      // Determine which locations to assign based on supervisor type
      let locationsToAssign: typeof locations = [];

      switch (config.supervisorType) {
        case 'PRINCIPAL':
          // Principals get assigned to schools
          // For now, assign each principal to all schools (you can customize this)
          locationsToAssign = schools;
          break;

        case 'MAINTENANCE_DIRECTOR':
          // Maintenance directors get assigned to all locations
          locationsToAssign = locations;
          break;

        case 'TECHNOLOGY_DIRECTOR':
          // Technology directors get assigned to all locations
          locationsToAssign = locations;
          break;

        case 'DIRECTOR_OF_SCHOOLS':
          // Director of Schools gets assigned to all schools + district office
          locationsToAssign = [...schools];
          if (districtOffice) locationsToAssign.push(districtOffice);
          break;

        case 'FINANCE_DIRECTOR':
          // Finance Director gets assigned to district office
          if (districtOffice) locationsToAssign = [districtOffice];
          break;
      }

      // Create assignments
      for (const location of locationsToAssign) {
        try {
          // Check if assignment already exists
          const existing = await prisma.locationSupervisor.findFirst({
            where: {
              locationId: location.id,
              userId: user.id,
              supervisorType: config.supervisorType
            }
          });

          if (existing) {
            console.log(`   ⏭️  ${user.displayName || user.firstName + ' ' + user.lastName} already assigned to ${location.name}`);
            continue;
          }

          // Determine if this should be primary
          // For directors, make them primary. For principals, make first one primary
          const isPrimary = 
            config.supervisorType === 'DIRECTOR_OF_SCHOOLS' || 
            config.supervisorType === 'FINANCE_DIRECTOR';

          await prisma.locationSupervisor.create({
            data: {
              locationId: location.id,
              userId: user.id,
              supervisorType: config.supervisorType,
              isPrimary: isPrimary
            }
          });

          console.log(`   ✅ Assigned ${user.displayName || user.firstName + ' ' + user.lastName} to ${location.name}${isPrimary ? ' (Primary)' : ''}`);
          totalAssignments++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`   ⚠️  Duplicate assignment skipped`);
          } else {
            console.error(`   ❌ Error:`, error.message);
          }
        }
      }
    }
  }

  const finalCount = await prisma.locationSupervisor.count();
  console.log(`\n✨ Complete!`);
  console.log(`   New assignments created: ${totalAssignments}`);
  console.log(`   Total supervisor assignments: ${finalCount}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding supervisors:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

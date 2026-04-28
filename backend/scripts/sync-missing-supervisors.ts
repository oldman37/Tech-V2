import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { UserSyncService } from '../src/services/userSync.service';

const { Pool } = pg;
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

async function syncSupervisorGroups() {
  try {
    console.log('\n=== Syncing Missing Supervisor Groups ===\n');

    const syncService = new UserSyncService(prisma, graphClient);

    const groupsToSync = [
      { 
        id: process.env.ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID!, 
        name: 'Transportation Director' 
      },
      { 
        id: process.env.ENTRA_NURSE_DIRECTOR_GROUP_ID!, 
        name: 'Nurse Director' 
      },
      { 
        id: process.env.ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID!, 
        name: 'Afterschool Director' 
      },
      { 
        id: process.env.ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID!, 
        name: 'Supervisors of Instruction' 
      },
    ];

    for (const group of groupsToSync) {
      console.log(`\nSyncing ${group.name}...`);
      try {
        const users = await syncService.syncGroupUsers(group.id);
        console.log(`✅ Synced ${users.length} users from ${group.name}`);
        users.forEach(u => {
          console.log(`   - ${u.displayName || u.email} (${u.role})`);
        });
      } catch (error) {
        console.error(`❌ Error syncing ${group.name}:`, error);
      }
    }

    console.log('\n✨ Sync complete!\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

syncSupervisorGroups();

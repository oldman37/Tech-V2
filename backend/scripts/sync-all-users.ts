import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { UserSyncService } from '../src/services/userSync.service.js';
import { prisma } from '../src/lib/prisma.js';

async function syncAllUsers() {
  console.log('🔄 Starting user sync from Entra ID...\n');
  
  // Initialize Graph Client
  const credential = new ClientSecretCredential(
    process.env.ENTRA_TENANT_ID!,
    process.env.ENTRA_CLIENT_ID!,
    process.env.ENTRA_CLIENT_SECRET!
  );
  
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  
  const graphClient = Client.initWithMiddleware({ authProvider });
  
  const userSyncService = new UserSyncService(prisma, graphClient);
  
  try {
    const users = await userSyncService.syncAllUsers();
    
    console.log('\n✅ User sync completed successfully!');
    console.log(`📊 Total users synced: ${users.length}`);
    
    if (users.length > 0) {
      console.log('\n📝 User Details:');
      users.forEach(user => {
        console.log(`  - ${user.displayName} (${user.email})`);
        console.log(`    Role: ${user.role}`);
        console.log(`    Location: ${user.officeLocation || 'Not set'}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncAllUsers();

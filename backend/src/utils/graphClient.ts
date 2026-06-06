/**
 * Shared Microsoft Graph API client factory.
 *
 * Creates an app-only (client credentials) Graph client using the MSAL
 * singleton from config/entraId. Re-use across routes/services to avoid
 * duplicating the token-acquisition logic.
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { msalClient } from '../config/entraId';
import { loggers } from '../lib/logger';

export async function createGraphClient(): Promise<Client> {
  try {
    const authResult = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });

    return Client.init({
      authProvider: (done) => {
        done(null, authResult?.accessToken ?? '');
      },
    });
  } catch (error) {
    loggers.admin.error('Failed to get Graph token', { error });
    throw new Error('Failed to authenticate with Microsoft Graph');
  }
}

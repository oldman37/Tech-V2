import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// MSAL Configuration for backend
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
    clientSecret: process.env.ENTRA_CLIENT_SECRET!,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) {
          console.log(`[MSAL] ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 'Info',
    },
  },
};

export const msalClient = new ConfidentialClientApplication(msalConfig);

// Microsoft Graph API client setup
const credential = new ClientSecretCredential(
  process.env.ENTRA_TENANT_ID!,
  process.env.ENTRA_CLIENT_ID!,
  process.env.ENTRA_CLIENT_SECRET!
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

export const graphClient = Client.initWithMiddleware({ authProvider });

// Scopes for authentication
export const loginScopes = {
  scopes: ['user.read', 'profile', 'openid', 'email'],
};

export const graphScopes = {
  scopes: ['https://graph.microsoft.com/.default'],
};

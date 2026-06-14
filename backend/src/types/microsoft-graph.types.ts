/**
 * Microsoft Graph API Type Definitions
 * 
 * These types define the structure of responses from Microsoft Graph API endpoints.
 * Based on Microsoft Graph REST API v1.0 specification.
 * 
 * @see https://learn.microsoft.com/en-us/graph/api/resources/user
 * @see https://learn.microsoft.com/en-us/graph/api/resources/group
 */

/**
 * Microsoft Graph User object
 * Represents an Azure AD user account
 */
export interface GraphUser {
  /** Unique identifier for the user (Azure AD Object ID) */
  id: string;
  
  /** User's display name */
  displayName: string;
  
  /** User principal name (email format) */
  userPrincipalName: string;
  
  /** Primary email address */
  mail: string | null;
  
  /** User's first name */
  givenName: string | null;
  
  /** User's last name */
  surname: string | null;
  
  /** Job title */
  jobTitle: string | null;
  
  /** Department name */
  department: string | null;

  /** Whether the account is enabled in Azure AD */
  accountEnabled?: boolean;

  /** Office location (used for room/location mapping) */
  officeLocation?: string | null;

  /** Legacy office location field (some tenants use this instead of officeLocation) */
  physicalDeliveryOfficeName?: string | null;

  /** Usage location (ISO country code, e.g. 'US') */
  usageLocation?: string | null;
}

/**
 * Microsoft Graph Group object
 * Represents an Azure AD security group or distribution group
 */
export interface GraphGroup {
  /** Unique identifier for the group (Azure AD Object ID) */
  id: string;
  
  /** Group display name */
  displayName: string;
  
  /** Group description */
  description?: string | null;
  
  /** Group mail address */
  mail?: string | null;
}

/**
 * Microsoft Graph collection response wrapper
 * All list endpoints return data in this format
 */
export interface GraphCollectionResponse<T> {
  /** Array of items of type T */
  value: T[];
  
  /** OData next link for pagination (optional) */
  '@odata.nextLink'?: string;
  
  /** OData context (optional) */
  '@odata.context'?: string;
}

/**
 * Type alias for common user collection responses
 */
export type GraphUserCollection = GraphCollectionResponse<GraphUser>;

/**
 * Type alias for common group collection responses
 */
export type GraphGroupCollection = GraphCollectionResponse<GraphGroup>;

/**
 * Type guard to check if a value is a valid GraphUser
 */
export function isGraphUser(value: unknown): value is GraphUser {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const user = value as Record<string, unknown>;
  
  return (
    typeof user.id === 'string' &&
    typeof user.displayName === 'string' &&
    typeof user.userPrincipalName === 'string'
  );
}

/**
 * Type guard to check if a value is a valid GraphGroup
 */
export function isGraphGroup(value: unknown): value is GraphGroup {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const group = value as Record<string, unknown>;
  
  return (
    typeof group.id === 'string' &&
    typeof group.displayName === 'string'
  );
}

/**
 * Type guard to check if a value is a valid GraphCollectionResponse
 */
export function isGraphCollection<T>(
  value: unknown,
  itemGuard: (item: unknown) => item is T
): value is GraphCollectionResponse<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const collection = value as Record<string, unknown>;
  
  if (!Array.isArray(collection.value)) {
    return false;
  }
  
  // Optionally validate all items (can be expensive for large collections)
  // For production, might want to just check first item
  return collection.value.length === 0 || itemGuard(collection.value[0]);
}

/**
 * Microsoft Graph Intune Managed Device
 * @see https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice
 */
export interface IntuneDevice {
  id: string;
  deviceName: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  complianceState: string | null;
  lastSyncDateTime: string | null;
  enrolledDateTime: string | null;
  managedDeviceOwnerType: string | null;
  /** Azure AD device ID — used to look up the Entra device object for removeEntra */
  azureADDeviceId: string | null;
  model: string | null;
  manufacturer: string | null;
  userDisplayName: string | null;
  userPrincipalName: string | null;
}

/**
 * Microsoft Graph Windows Autopilot Device Identity
 * @see https://learn.microsoft.com/en-us/graph/api/resources/intune-enrollment-windowsautopilotdeviceidentity
 */
export interface AutopilotDevice {
  id: string;
  serialNumber: string | null;
  azureActiveDirectoryDeviceId: string | null;
  managedDeviceId: string | null;
  displayName: string | null;
}

/**
 * Microsoft Graph $batch request item
 */
export interface BatchRequestItem {
  id: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Microsoft Graph $batch response item
 */
export interface BatchResponseItem {
  id: string;
  status: number;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export type IntuneDeviceCollection = GraphCollectionResponse<IntuneDevice>;
export type AutopilotDeviceCollection = GraphCollectionResponse<AutopilotDevice>;

/**
 * Microsoft Graph BitLocker recovery key object.
 * The `key` field is only present when fetching a single key with ?$select=key.
 * @see https://learn.microsoft.com/en-us/graph/api/resources/bitlockerrecoverykey
 */
export interface GraphBitLockerKey {
  id: string;
  createdDateTime: string | null;
  volumeType: string | null;
  deviceId: string | null;
  key?: string;
}
export type GraphBitLockerKeyCollection = GraphCollectionResponse<GraphBitLockerKey>;

# Intune Bulk Device Actions — Implementation Specification

**Feature:** Mass device action execution via Microsoft Graph (Intune), scoped by device model or individual device  
**Spec Date:** 2026-06-12  
**Status:** Ready for Implementation  
**Source Plan:** `.github/docs/INTUNE_BULK_DEVICE_ACTIONS_PLAN.md`

---

## 1. Current State Analysis

### 1.1 Graph Infrastructure

**`backend/src/config/entraId.ts`**
- Exports `graphClient` — a singleton `Client` instance using `ClientSecretCredential` + `TokenCredentialAuthenticationProvider` with scope `https://graph.microsoft.com/.default`
- Also exports `msalClient` (MSAL `ConfidentialClientApplication`) used by the `createGraphClient()` factory

**`backend/src/utils/graphClient.ts`**
- Exports `createGraphClient()` — factory function that calls `msalClient.acquireTokenByClientCredential` and returns a fresh `Client` instance
- **This is the pattern new services must use** — do not import `graphClient` directly from `entraId.ts`
- Uses `@microsoft/microsoft-graph-client` v3.0.7 and `@azure/msal-node` v5.1.5

**`backend/src/types/microsoft-graph.types.ts`**
- Contains `GraphUser`, `GraphGroup`, `GraphCollectionResponse<T>`, type guards `isGraphUser`, `isGraphGroup`
- Does NOT yet contain Intune device types — these must be added

### 1.2 Relevant Prisma Models

**`equipment`** — key fields for matching:
- `id` (UUID), `assetTag` (unique), `serialNumber` (nullable, string)
- `modelId` (FK → `models.id`), `status`, `isDisposed`

**`models`**
- `id` (UUID), `name` (string), `brandId` (FK → `brands.id`), `isActive`
- `brands` relation → `brands.name` — both are needed for the Intune filter (by model name)

**`brands`**
- `id`, `name` (unique)

**`User`**  
- `id` (UUID), `email`, `displayName`, `firstName`, `lastName`
- Has ~30+ existing relations — the `IntuneActionLog` relation must be added as the last block before `@@index`
- `@@map("users")` — PostgreSQL table is `users`

### 1.3 Auth / Permission Middleware

**`authenticate`** — validates JWT from `access_token` cookie, populates `req.user` with `{ id, entraId, email, name, roles, groups }`. Returns 401 if missing or invalid.

**`requireDeviceManagementAccess()`** — checks user's Entra group memberships against `ENTRA_ADMIN_GROUP_ID`, `ENTRA_TECH_ASSISTANTS_GROUP_ID`, `ENTRA_OCBOE_LIBRARIANS_GROUP_ID`. Returns 403 if none match. Returns a middleware function (called with `()`).

**`validateCsrfToken`** — required on all write routes (POST/PUT/DELETE). Must be placed before `requireDeviceManagementAccess()` in the middleware chain to match the pattern in `deviceAssignment.routes.ts`.

**`validateRequest(schema, target?)`** — Zod validation middleware. Default target is `'body'`. For `'query'` and `'params'`, pass the target string as second argument.

### 1.4 Existing Patterns Summary

**Route file pattern:**
```typescript
router.use(authenticate);
router.get('/path', requireDeviceManagementAccess(), validateRequest(Schema, 'query'), controller.fn);
router.post('/path', validateCsrfToken, requireDeviceManagementAccess(), validateRequest(Schema), controller.fn);
```

**Controller pattern:**
```typescript
export const fn = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await service.fn(req.body, req.user!.id);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

**Service pattern:**
- Imports `prisma` from `'../lib/prisma'`
- Imports `createLogger` from `'../lib/logger'`
- Imports `NotFoundError`, `AppError` from `'../utils/errors'`
- Uses `const log = createLogger('ServiceName')`

**Frontend service pattern:**
```typescript
import { api } from './api';
export const intuneService = {
  getByModel: (modelId: string): Promise<DeviceModelPreviewResponse> =>
    api.get(`/intune/devices/by-model/${modelId}`).then((r) => r.data),
};
```

---

## 2. New Files to Create (Exact Paths)

### Backend
| File | Purpose |
|------|---------|
| `backend/src/services/intuneDevice.service.ts` | Graph queries, serial matching, batch execution, audit logging |
| `backend/src/controllers/intuneDevice.controller.ts` | Thin controllers delegating to service |
| `backend/src/routes/intuneDevice.routes.ts` | Route definitions behind `requireDeviceManagementAccess()` |
| `backend/src/validators/intuneDevice.validators.ts` | Zod schemas for all request shapes |
| `backend/prisma/migrations/20260612000000_add_intune_action_log/migration.sql` | DDL for `intune_action_logs` table |

### Shared
| File | Purpose |
|------|---------|
| `shared/src/intune.types.ts` | All shared Intune types and interfaces |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/services/intuneService.ts` | API client for Intune routes |
| `frontend/src/pages/IntuneDeviceActions.tsx` | Main page: model picker, action selector, results table |
| `frontend/src/components/DeviceActionConfirmDialog.tsx` | Confirmation dialog for High/Critical actions |

---

## 3. Files to Modify (Exact Paths and Changes)

| File | Change |
|------|--------|
| `backend/src/app.ts` | Add import of `intuneDeviceRoutes` and `app.use('/api/intune', intuneDeviceRoutes)` |
| `backend/prisma/schema.prisma` | Add `IntuneActionLog` model; add `intuneActionLogs` relation to `User` model |
| `backend/src/types/microsoft-graph.types.ts` | Add `IntuneDevice` and `AutopilotDevice` interfaces |
| `shared/src/index.ts` | Add `export * from './intune.types'` |

---

## 4. Complete Type Definitions

### `shared/src/intune.types.ts`

```typescript
/**
 * Shared types for Intune Bulk Device Actions feature.
 * Used by both backend service and frontend.
 */

export type IntuneAction =
  | 'syncDevice'
  | 'rebootNow'
  | 'retire'
  | 'wipe'
  | 'cleanWindowsDevice'
  | 'deleteDevice'
  | 'removeAutopilot'
  | 'removeEntra'
  | 'fullDecommission';

export type ActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Risk level for each action — used by frontend for colour coding and
 * confirmation requirement logic.
 */
export const INTUNE_ACTION_RISK: Record<IntuneAction, ActionRiskLevel> = {
  syncDevice:          'low',
  rebootNow:           'medium',
  retire:              'high',
  wipe:                'critical',
  cleanWindowsDevice:  'high',
  deleteDevice:        'critical',
  removeAutopilot:     'critical',
  removeEntra:         'critical',
  fullDecommission:    'critical',
};

/**
 * Human-readable labels for each action.
 */
export const INTUNE_ACTION_LABELS: Record<IntuneAction, string> = {
  syncDevice:          'Sync Device',
  rebootNow:           'Reboot Now',
  retire:              'Retire',
  wipe:                'Wipe (Factory Reset)',
  cleanWindowsDevice:  'Fresh Start (Clean Windows)',
  deleteDevice:        'Delete from Intune',
  removeAutopilot:     'Remove from Autopilot',
  removeEntra:         'Remove from Entra ID',
  fullDecommission:    'Full Decommission',
};

/**
 * Per-device result for a single action execution.
 */
export interface DeviceActionResult {
  /** Serial number from inventory DB (source of truth) */
  serialNumber: string;
  /** Asset tag from inventory DB */
  assetTag: string | null;
  /** Intune managed device ID (null if not enrolled) */
  intuneDeviceId: string | null;
  /** Autopilot identity ID (populated for removeAutopilot / fullDecommission steps) */
  autopilotDeviceId: string | null;
  /** Entra device object ID (populated for removeEntra / fullDecommission steps) */
  entraDeviceId: string | null;
  /**
   * Overall status:
   * - success: action completed successfully
   * - not_enrolled: device not found in Intune (skipped)
   * - failed: action attempted but Graph returned an error
   * - partial: fullDecommission where some but not all steps succeeded
   */
  status: 'success' | 'not_enrolled' | 'failed' | 'partial';
  /**
   * Step-level results for fullDecommission. Absent for non-decommission actions.
   */
  stepResults?: {
    deleteDevice?: 'success' | 'failed' | 'skipped';
    removeAutopilot?: 'success' | 'failed' | 'skipped' | 'not_found';
    removeEntra?: 'success' | 'failed' | 'skipped' | 'not_found';
  };
  /** Error message if status is 'failed' or a step failed */
  error?: string;
}

/**
 * Request body for a bulk action (scoped to a device model).
 */
export interface BulkDeviceActionRequest {
  modelId: string;
  action: IntuneAction;
  /** Must be true for High/Critical risk actions — validated server-side */
  confirm: boolean;
  /** Only applies to cleanWindowsDevice */
  keepUserData?: boolean;
  /** Must be 'DECOMMISSION' (exact string) for fullDecommission — validated server-side */
  confirmText?: string;
}

/**
 * Request body for a single-device action.
 * Provide either serialNumber or intuneDeviceId (at least one required).
 */
export interface SingleDeviceActionRequest {
  serialNumber?: string;
  intuneDeviceId?: string;
  action: IntuneAction;
  confirm: boolean;
  keepUserData?: boolean;
  confirmText?: string;
}

/**
 * Response from a bulk or single device action.
 */
export interface BulkDeviceActionResponse {
  action: IntuneAction;
  modelId: string | null;
  modelName: string | null;
  total: number;
  succeeded: number;
  notEnrolled: number;
  failed: number;
  partial: number;
  results: DeviceActionResult[];
  /** ID of the IntuneActionLog record written to the database */
  logId: string;
}

/**
 * A single device's enrollment preview — returned by the by-model preview endpoint.
 */
export interface IntuneDevicePreview {
  /** From inventory DB */
  serialNumber: string;
  /** From inventory DB */
  assetTag: string | null;
  /** Intune managed device ID (null if not enrolled) */
  intuneDeviceId: string | null;
  displayName: string | null;
  operatingSystem: string | null;
  complianceState: string | null;
  lastSyncDateTime: string | null;
  enrolledDateTime: string | null;
  managedDeviceOwnerType: string | null;
  /** Azure AD device ID from Intune record — used for removeEntra lookup */
  azureADDeviceId: string | null;
  enrollmentStatus: 'enrolled' | 'not_enrolled';
}

/**
 * Response from GET /api/intune/devices/by-model/:modelId
 */
export interface DeviceModelPreviewResponse {
  modelId: string;
  modelName: string;
  brandName: string;
  totalInInventory: number;
  enrolledCount: number;
  notEnrolledCount: number;
  devices: IntuneDevicePreview[];
}

/**
 * A single device's full Intune + Autopilot + Entra status.
 * Returned by GET /api/intune/devices/:serialNumber/status
 */
export interface DeviceStatusResponse {
  serialNumber: string;
  assetTag: string | null;
  intune: {
    enrolled: boolean;
    intuneDeviceId: string | null;
    displayName: string | null;
    operatingSystem: string | null;
    complianceState: string | null;
    lastSyncDateTime: string | null;
    azureADDeviceId: string | null;
  };
  autopilot: {
    enrolled: boolean;
    autopilotDeviceId: string | null;
  };
  entra: {
    exists: boolean;
    entraObjectId: string | null;
  };
}

/**
 * Audit log entry returned by GET /api/intune/logs
 */
export interface IntuneActionLogEntry {
  id: string;
  performedBy: string;
  performedByName: string | null;
  action: IntuneAction;
  modelId: string | null;
  modelName: string | null;
  totalDevices: number;
  successCount: number;
  failedCount: number;
  notEnrolledCount: number;
  results: DeviceActionResult[];
  createdAt: string;
}

export interface IntuneActionLogsResponse {
  items: IntuneActionLogEntry[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}
```

### `backend/src/types/microsoft-graph.types.ts` — Additions

Add the following interfaces to the existing file after the `GraphGroupCollection` type alias:

```typescript
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
```

---

## 5. Complete Prisma Schema Addition

### New model — add at the end of `schema.prisma` (before the closing of any domain grouping, after `RefreshToken`):

```prisma
// ============================================
// INTUNE DEVICE ACTION AUDIT LOG
// ============================================

model IntuneActionLog {
  id               String   @id @default(uuid())
  performedBy      String
  performedByUser  User     @relation("IntuneActionLogPerformedBy", fields: [performedBy], references: [id])
  action           String
  modelId          String?
  modelName        String?
  totalDevices     Int
  successCount     Int
  failedCount      Int
  notEnrolledCount Int
  results          Json

  createdAt        DateTime @default(now())

  @@index([performedBy])
  @@index([createdAt])
  @@map("intune_action_logs")
}
```

### Addition to `User` model — add inside the `User` model block, after the `driverLicensesUploaded` line and before `refreshTokens`:

```prisma
  intuneActionLogs             IntuneActionLog[] @relation("IntuneActionLogPerformedBy")
```

> **Note:** The full `User` model block ends with `@@index([employeeId])` and `@@map("users")`. The new relation goes on the line directly before `refreshTokens RefreshToken[]`.

---

## 6. Complete Migration SQL

**File path:** `backend/prisma/migrations/20260612000000_add_intune_action_log/migration.sql`

```sql
-- CreateTable
CREATE TABLE "intune_action_logs" (
    "id"               TEXT NOT NULL,
    "performedBy"      TEXT NOT NULL,
    "action"           TEXT NOT NULL,
    "modelId"          TEXT,
    "modelName"        TEXT,
    "totalDevices"     INTEGER NOT NULL,
    "successCount"     INTEGER NOT NULL,
    "failedCount"      INTEGER NOT NULL,
    "notEnrolledCount" INTEGER NOT NULL,
    "results"          JSONB NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intune_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intune_action_logs_performedBy_idx" ON "intune_action_logs"("performedBy");

-- CreateIndex
CREATE INDEX "intune_action_logs_createdAt_idx" ON "intune_action_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "intune_action_logs"
    ADD CONSTRAINT "intune_action_logs_performedBy_fkey"
    FOREIGN KEY ("performedBy")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
```

---

## 7. Complete Service Implementation Spec

**File:** `backend/src/services/intuneDevice.service.ts`

### Imports

```typescript
import { createGraphClient } from '../utils/graphClient';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { AppError } from '../utils/errors';
import type { IntuneDevice, AutopilotDevice, IntuneDeviceCollection, AutopilotDeviceCollection, BatchRequestItem, BatchResponseItem } from '../types/microsoft-graph.types';
import type {
  IntuneAction,
  DeviceActionResult,
  BulkDeviceActionResponse,
  DeviceModelPreviewResponse,
  DeviceStatusResponse,
  IntuneActionLogsResponse,
} from '@mgspe/shared-types';

const log = createLogger('IntuneDeviceService');
```

### `getDevicesByModel(modelId: string): Promise<DeviceModelPreviewResponse>`

1. Query `prisma.models.findUnique({ where: { id: modelId }, include: { brands: true, equipment: { where: { isDisposed: false }, select: { assetTag: true, serialNumber: true } } } })`
2. Throw `AppError` (404) if model not found
3. Extract serials from equipment: `const serials = equipment.map(e => e.serialNumber).filter(Boolean)`
4. If no serials, return response with all `enrollmentStatus: 'not_enrolled'`
5. Call internal `queryIntuneByModel(modelName, brandName)` to get all Intune devices for that model — see below
6. Build a map `serialToIntuneDevice: Map<string, IntuneDevice>` keyed by `serialNumber.toLowerCase()`
7. Map over the inventory equipment list, joining each to Intune data
8. Return `DeviceModelPreviewResponse`

### `queryIntuneByModel(modelName: string): Promise<IntuneDevice[]>`

> Internal helper — not exported

1. Create Graph client: `const client = await createGraphClient()`
2. Encode filter: `$filter=model eq '${modelName}'`
3. Use Graph client with `$select` to fetch only needed fields:
   ```
   GET /deviceManagement/managedDevices
     ?$filter=model eq '{modelName}'
     &$select=id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model,manufacturer,userDisplayName,userPrincipalName
     &$top=999
   ```
4. Handle pagination: if `@odata.nextLink` is present, follow it until all pages are fetched
5. Return flat array of `IntuneDevice[]`

> **Important:** Intune's `model` field may not always match exactly the `models.name` in the DB. The preview step surfaces mismatches so the user can see them before executing.

### `getDeviceBySerial(serialNumber: string): Promise<IntuneDevice | null>`

> Internal helper — not exported

1. `const client = await createGraphClient()`
2. Filter:
   ```
   GET /deviceManagement/managedDevices
     ?$filter=serialNumber eq '{serialNumber}'
     &$select=id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model
     &$top=1
   ```
3. Return first result or `null`

### `getAutopilotIdentity(serialNumber: string): Promise<AutopilotDevice | null>`

1. `const client = await createGraphClient()`
2. **Important:** Use `contains` filter (not `eq`) because Autopilot serial may have whitespace padding in some tenants:
   ```
   GET /deviceManagement/windowsAutopilotDeviceIdentities
     ?$filter=contains(serialNumber, '{serialNumber}')
     &$top=1
   ```
3. Return first result or `null`

### `getEntraDeviceObjectId(azureADDeviceId: string): Promise<string | null>`

> Internal helper — not exported

1. `const client = await createGraphClient()`
2. The `azureADDeviceId` from the Intune record is the device's `deviceId` property in Entra (NOT the Entra object `id`)
3. Query:
   ```
   GET /devices?$filter=deviceId eq '{azureADDeviceId}'&$select=id,deviceId&$top=1
   ```
4. Return the first result's `id` (Entra object ID) or `null`

### `getDeviceStatus(serialNumber: string): Promise<DeviceStatusResponse>`

> Used by `GET /api/intune/devices/:serialNumber/status`

1. Look up equipment in DB by serialNumber for assetTag
2. Call `getDeviceBySerial(serialNumber)` to get Intune data
3. If enrolled, call `getAutopilotIdentity(serialNumber)` and `getEntraDeviceObjectId(intuneDevice.azureADDeviceId)` in parallel (`Promise.all`)
4. Return `DeviceStatusResponse` shape

### `executeBulkAction(...): Promise<BulkDeviceActionResponse>`

**Signature:**
```typescript
export async function executeBulkAction(
  modelId: string,
  action: IntuneAction,
  options: { keepUserData?: boolean; confirm: boolean; confirmText?: string },
  performedBy: string,
): Promise<BulkDeviceActionResponse>
```

**Steps:**
1. Validate preconditions (these are also enforced by Zod/route but must be checked in service too):
   - `options.confirm` must be `true` for High/Critical actions
   - `options.confirmText` must be `'DECOMMISSION'` for `fullDecommission`
2. Fetch model + inventory equipment (same query as `getDevicesByModel`)
3. Call `queryIntuneByModel(modelName)` to get Intune devices
4. Build `serialToIntuneDevice` map
5. For each equipment item, resolve to `IntuneDevice | null`
6. Separate into `enrolledDevices` and `notEnrolledItems`
7. Execute actions on `enrolledDevices` using the appropriate strategy (see Batching below)
8. Aggregate results
9. Write `IntuneActionLog` record via Prisma
10. Return `BulkDeviceActionResponse`

### `executeSingleAction(...): Promise<{ result: DeviceActionResult }>`

**Signature:**
```typescript
export async function executeSingleAction(
  query: { serialNumber?: string; intuneDeviceId?: string },
  action: IntuneAction,
  options: { keepUserData?: boolean; confirm: boolean; confirmText?: string },
  performedBy: string,
): Promise<{ result: DeviceActionResult }>
```

**Steps:**
1. Validate preconditions
2. Resolve device: if `intuneDeviceId` provided, use it directly; if `serialNumber` provided, call `getDeviceBySerial`
3. Look up `assetTag` from inventory DB by serialNumber (if available)
4. Execute `executeActionOnDevice(intuneDevice, action, options)`
5. Write `IntuneActionLog` with `totalDevices: 1`
6. Return result

### `executeActionOnDevice(device: IntuneDevice, action: IntuneAction, options): Promise<DeviceActionResult>`

> Central dispatch — called by both bulk and single flows

```typescript
switch (action) {
  case 'syncDevice':
    // POST /deviceManagement/managedDevices/{id}/syncDevice (no body)
    break;
  case 'rebootNow':
    // POST /deviceManagement/managedDevices/{id}/rebootNow (no body)
    break;
  case 'retire':
    // POST /deviceManagement/managedDevices/{id}/retire (no body)
    break;
  case 'wipe':
    // POST /deviceManagement/managedDevices/{id}/wipe (no body needed for standard wipe)
    break;
  case 'cleanWindowsDevice':
    // OS guard: device.operatingSystem must start with 'Windows'
    // if not: return { status: 'failed', error: 'cleanWindowsDevice requires a Windows device' }
    // POST /deviceManagement/managedDevices/{id}/cleanWindowsDevice
    // Body: { keepUserData: options.keepUserData ?? false }
    break;
  case 'deleteDevice':
    // DELETE /deviceManagement/managedDevices/{id}
    break;
  case 'removeAutopilot':
    // 1. getAutopilotIdentity(device.serialNumber)
    // 2. if null → return { ..., autopilotDeviceId: null, stepResults: { removeAutopilot: 'not_found' }, status: 'success' }
    // 3. DELETE /deviceManagement/windowsAutopilotDeviceIdentities/{autopilotId}
    break;
  case 'removeEntra':
    // 1. getEntraDeviceObjectId(device.azureADDeviceId)
    // 2. if null → return { ..., entraDeviceId: null, stepResults: { removeEntra: 'not_found' }, status: 'success' }
    // 3. DELETE /devices/{entraObjectId}
    break;
  case 'fullDecommission':
    // Sequential: see fullDecommission flow below
    break;
}
```

### `fullDecommission` Step-by-Step Flow

Each step is attempted independently. A step failure does NOT abort subsequent steps.

```
Step 1: deleteDevice
  - DELETE /deviceManagement/managedDevices/{intuneDeviceId}
  - On 204: stepResults.deleteDevice = 'success'
  - On error: stepResults.deleteDevice = 'failed'; capture error message

Step 2: removeAutopilot
  - getAutopilotIdentity(device.serialNumber)
  - If null: stepResults.removeAutopilot = 'not_found' (soft — not a failure)
  - Else: DELETE /deviceManagement/windowsAutopilotDeviceIdentities/{autopilotId}
    - On 204: stepResults.removeAutopilot = 'success'
    - On error: stepResults.removeAutopilot = 'failed'

Step 3: removeEntra
  - getEntraDeviceObjectId(device.azureADDeviceId)
  - If null or azureADDeviceId is null: stepResults.removeEntra = 'not_found' (soft)
  - Else: DELETE /devices/{entraObjectId}
    - On 204: stepResults.removeEntra = 'success'
    - On error: stepResults.removeEntra = 'failed'

Determine overall status:
  - All steps success/not_found → status: 'success'
  - Any step 'failed' and at least one step 'success' → status: 'partial'
  - All attempted steps 'failed' → status: 'failed'
```

### Batching Strategy

**Actions that can use `$batch`:** `syncDevice`, `rebootNow`, `retire`, `wipe`

For these, split enrolled devices into groups of 20 and send each group as a Graph `$batch` request:
```
POST /$batch
Body: {
  requests: [
    { id: "1", method: "POST", url: "/deviceManagement/managedDevices/{id1}/syncDevice", headers: { "Content-Type": "application/json" } },
    { id: "2", method: "POST", url: "/deviceManagement/managedDevices/{id2}/syncDevice", ... },
    ...up to 20
  ]
}
```
- Response is `{ responses: [{ id, status, body }] }`  
- Status 204 = success; any other status = failed
- Process each batch sequentially (await before next) to avoid overwhelming Intune

**Actions that CANNOT use `$batch`:** `cleanWindowsDevice`, `deleteDevice`, `removeAutopilot`, `removeEntra`, `fullDecommission`

For these, execute each device serially using `executeActionOnDevice`. Reasoning:
- `cleanWindowsDevice` has a body with per-device `keepUserData`
- `deleteDevice`, `removeAutopilot`, `removeEntra`, `fullDecommission` involve different base paths and multi-step flows that are impractical to batch

**Graph throttling:** If Graph returns 429, read the `Retry-After` header and delay the corresponding number of seconds before retrying. Use a helper:
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T>
```

### `getActionLogs(params): Promise<IntuneActionLogsResponse>`

```typescript
const { page = 1, limit = 50 } = params;
const skip = (page - 1) * limit;
const [items, totalCount] = await prisma.$transaction([
  prisma.intuneActionLog.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    include: {
      performedByUser: { select: { id: true, displayName: true, firstName: true, lastName: true } },
    },
  }),
  prisma.intuneActionLog.count(),
]);
```

---

## 8. API Routes Specification

**File:** `backend/src/routes/intuneDevice.routes.ts`

```
GET  /api/intune/devices/by-model/:modelId
     - Auth: authenticate + requireDeviceManagementAccess()
     - Validator: ModelIdParamSchema ('params')
     - Controller: controller.getDevicesByModel

GET  /api/intune/devices/:serialNumber/status
     - Auth: authenticate + requireDeviceManagementAccess()
     - Validator: SerialNumberParamSchema ('params')
     - Controller: controller.getDeviceStatus

POST /api/intune/actions/bulk
     - Auth: validateCsrfToken + authenticate + requireDeviceManagementAccess()
     - Validator: BulkActionSchema ('body')
     - Controller: controller.executeBulkAction

POST /api/intune/actions/single
     - Auth: validateCsrfToken + authenticate + requireDeviceManagementAccess()
     - Validator: SingleActionSchema ('body')
     - Controller: controller.executeSingleAction

GET  /api/intune/logs
     - Auth: authenticate + requireDeviceManagementAccess()
     - Validator: ActionLogsQuerySchema ('query')
     - Controller: controller.getActionLogs
```

**Route registration in `backend/src/app.ts`:**

Add import:
```typescript
import intuneDeviceRoutes from './routes/intuneDevice.routes';
```

Add mount after the `dmRollover` line:
```typescript
app.use('/api/intune', intuneDeviceRoutes);
```

> Place it near the other device management routes (`device-assignments`, `device-carts`) for logical grouping.

---

## 9. Zod Validator Shapes

**File:** `backend/src/validators/intuneDevice.validators.ts`

```typescript
import { z } from 'zod';

const IntuneActionSchema = z.enum([
  'syncDevice',
  'rebootNow',
  'retire',
  'wipe',
  'cleanWindowsDevice',
  'deleteDevice',
  'removeAutopilot',
  'removeEntra',
  'fullDecommission',
]);

export const ModelIdParamSchema = z.object({
  modelId: z.string().uuid('Invalid model ID'),
});

export const SerialNumberParamSchema = z.object({
  serialNumber: z.string().min(1).max(200),
});

export const BulkActionSchema = z.object({
  modelId: z.string().uuid('Invalid model ID'),
  action: IntuneActionSchema,
  confirm: z.boolean(),
  keepUserData: z.boolean().optional(),
  /** Must be 'DECOMMISSION' when action is fullDecommission — enforced in service */
  confirmText: z.string().max(50).optional(),
});

export const SingleActionSchema = z.object({
  serialNumber: z.string().min(1).max(200).optional(),
  intuneDeviceId: z.string().min(1).max(200).optional(),
  action: IntuneActionSchema,
  confirm: z.boolean(),
  keepUserData: z.boolean().optional(),
  confirmText: z.string().max(50).optional(),
}).refine(
  (d) => !!(d.serialNumber || d.intuneDeviceId),
  { message: 'Either serialNumber or intuneDeviceId is required' }
);

export const ActionLogsQuerySchema = z.object({
  page: z.preprocess(
    (v) => v ?? '1',
    z.string().regex(/^\d+$/).transform(Number).refine((n) => n > 0)
  ).optional(),
  limit: z.preprocess(
    (v) => v ?? '50',
    z.string().regex(/^\d+$/).transform(Number).refine((n) => n > 0 && n <= 100)
  ).optional(),
  action: IntuneActionSchema.optional(),
});
```

> **Zod 4 note:** The installed version is `4.3.6`. Zod 4 changed `z.preprocess` — use `z.preprocess(fn, schema)` as shown above. The `.refine()` API is unchanged.

---

## 10. Frontend Implementation Spec

### `frontend/src/services/intuneService.ts`

```typescript
import { api } from './api';
import type {
  DeviceModelPreviewResponse,
  DeviceStatusResponse,
  BulkDeviceActionRequest,
  SingleDeviceActionRequest,
  BulkDeviceActionResponse,
  IntuneActionLogsResponse,
} from '@mgspe/shared-types';

const BASE = '/intune';

export const intuneService = {
  getByModel: (modelId: string): Promise<DeviceModelPreviewResponse> =>
    api.get(`${BASE}/devices/by-model/${modelId}`).then((r) => r.data),

  getDeviceStatus: (serialNumber: string): Promise<DeviceStatusResponse> =>
    api.get(`${BASE}/devices/${encodeURIComponent(serialNumber)}/status`).then((r) => r.data),

  executeBulkAction: (data: BulkDeviceActionRequest): Promise<BulkDeviceActionResponse> =>
    api.post(`${BASE}/actions/bulk`, data).then((r) => r.data),

  executeSingleAction: (data: SingleDeviceActionRequest): Promise<BulkDeviceActionResponse> =>
    api.post(`${BASE}/actions/single`, data).then((r) => r.data),

  getLogs: (params?: { page?: number; limit?: number; action?: string }): Promise<IntuneActionLogsResponse> =>
    api.get(`${BASE}/logs`, { params }).then((r) => r.data),
};
```

### `frontend/src/pages/IntuneDeviceActions.tsx`

**Page structure:**

```
<IntuneDeviceActions>
  ├── Header: "Intune Device Actions"
  ├── Section 1: Model Selection
  │   ├── Autocomplete/Select — populated from existing models endpoint
  │   └── "Preview Devices" button
  ├── Section 2: Device Preview Table (shown after model selected)
  │   ├── Columns: Asset Tag | Serial | OS | Enrollment Status | Last Sync | Compliance
  │   ├── Chip badges: enrolled (green) / not_enrolled (grey)
  │   └── Summary: "X enrolled, Y not enrolled"
  ├── Section 3: Action Selection (shown when enrolled devices exist)
  │   ├── Select dropdown for IntuneAction
  │   │   └── Each option shows risk chip (Low=green, Medium=amber, High=orange, Critical=red)
  │   ├── Conditional: keepUserData toggle (only for cleanWindowsDevice)
  │   └── "Execute Action" button (disabled until action selected)
  ├── Confirmation Step (handled by DeviceActionConfirmDialog)
  └── Section 4: Results Table (shown after execution)
      ├── Columns: Asset Tag | Serial | Status | Steps (for fullDecommission) | Error
      └── Status chips: success (green) | not_enrolled (grey) | failed (red) | partial (orange)
</IntuneDeviceActions>
```

**State:**
```typescript
const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
const [preview, setPreview] = useState<DeviceModelPreviewResponse | null>(null);
const [selectedAction, setSelectedAction] = useState<IntuneAction | null>(null);
const [keepUserData, setKeepUserData] = useState(false);
const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
const [results, setResults] = useState<BulkDeviceActionResponse | null>(null);
```

**Data fetching:** Use TanStack Query (`useQuery`) for the model list and preview. Use `useMutation` for action execution.

### `frontend/src/components/DeviceActionConfirmDialog.tsx`

**Props:**
```typescript
interface DeviceActionConfirmDialogProps {
  open: boolean;
  action: IntuneAction;
  modelName: string;
  enrolledCount: number;
  keepUserData?: boolean;
  onConfirm: (confirmText?: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}
```

**Behaviour by risk level:**

| Risk | Confirmation Required | confirmText Required |
|------|-----------------------|----------------------|
| low | None — dialog just for awareness | No |
| medium | Checkbox "I understand this will reboot devices" | No |
| high | Type action name (e.g. `RETIRE`) | Yes — action name uppercase |
| critical (non-decommission) | Type action name (e.g. `WIPE`, `DELETE`) | Yes — action name uppercase |
| fullDecommission | Type `DECOMMISSION` | Yes — literal `'DECOMMISSION'` |

**Dialog contents:**
- Warning header with risk-level colour
- Summary of what will happen (description from `INTUNE_ACTION_LABELS`)
- Count of devices that will be affected
- For `fullDecommission`: checklist showing exactly what will be removed (Intune record, Autopilot identity, Entra object)
- Confirm button disabled until input matches required text

---

## 11. Route Registration

**`backend/src/app.ts`** — exact addition:

### Import addition (after `dmRolloverRoutes` import line):
```typescript
import intuneDeviceRoutes from './routes/intuneDevice.routes';
```

### Mount addition (after the `app.use('/api/device-management/rollover', dmRolloverRoutes)` line):
```typescript
app.use('/api/intune', intuneDeviceRoutes);
```

---

## 12. Security Considerations

### Authorization
- All 5 routes are behind `authenticate` + `requireDeviceManagementAccess()`
- Groups with access: `ENTRA_ADMIN_GROUP_ID`, `ENTRA_TECH_ASSISTANTS_GROUP_ID`, `ENTRA_OCBOE_LIBRARIANS_GROUP_ID`
- All authorization checks are in the backend — the frontend uses permission flags for display only
- Never expose raw Graph payloads, Entra group IDs, or `azureADDeviceId` to the frontend unless strictly necessary

### Confirmation Enforcement (Server-Side)
The service layer enforces these checks independently of Zod validation:

| Condition | Error |
|-----------|-------|
| High/Critical action + `confirm !== true` | 400 `CONFIRMATION_REQUIRED` |
| `fullDecommission` + `confirmText !== 'DECOMMISSION'` | 400 `DECOMMISSION_CONFIRMATION_REQUIRED` |
| `cleanWindowsDevice` on non-Windows device | Per-device `status: 'failed'` with descriptive error (not a 400) |

### CSRF
- POST routes (`/actions/bulk`, `/actions/single`) include `validateCsrfToken` middleware
- GET routes do not require CSRF tokens

### Audit Logging
- Every execution (bulk or single) writes an `IntuneActionLog` record before returning
- Log includes: `performedBy` (User.id from JWT), `action`, `modelId`, `modelName`, `totalDevices`, per-count fields, full `results` JSON
- This is written regardless of whether the action succeeded or failed
- Audit log is accessible via `GET /api/intune/logs` to `requireDeviceManagementAccess()` users

### Input Sanitisation
- `serialNumber` and `modelName` values passed to Graph API filters are embedded in OData `$filter` strings
- These must be escaped before inclusion: single quotes (`'`) in values must be doubled (`''`) to prevent OData injection
- Example: `serialNumber.replace(/'/g, "''")`

### Error Responses
- Do NOT include raw Graph error payloads in API responses — they may contain internal tenant information
- Map Graph errors to `{ error: 'GRAPH_ERROR', message: 'Action failed: ...' }` with sanitised message
- Log full Graph errors server-side using `log.error`

---

## 13. Graph API Endpoint Reference

All endpoints use the Graph v1.0 API (`https://graph.microsoft.com/v1.0/`).

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| syncDevice | POST | `/deviceManagement/managedDevices/{id}/syncDevice` | none |
| rebootNow | POST | `/deviceManagement/managedDevices/{id}/rebootNow` | none |
| retire | POST | `/deviceManagement/managedDevices/{id}/retire` | none |
| wipe | POST | `/deviceManagement/managedDevices/{id}/wipe` | none |
| cleanWindowsDevice | POST | `/deviceManagement/managedDevices/{id}/cleanWindowsDevice` | `{ "keepUserData": boolean }` |
| deleteDevice | DELETE | `/deviceManagement/managedDevices/{id}` | none |
| removeAutopilot step 1 | GET | `/deviceManagement/windowsAutopilotDeviceIdentities?$filter=contains(serialNumber, '{serial}')&$top=1` | n/a |
| removeAutopilot step 2 | DELETE | `/deviceManagement/windowsAutopilotDeviceIdentities/{autopilotId}` | none |
| removeEntra step 1 | GET | `/devices?$filter=deviceId eq '{azureADDeviceId}'&$select=id,deviceId&$top=1` | n/a |
| removeEntra step 2 | DELETE | `/devices/{entraObjectId}` | none |
| $batch | POST | `/$batch` | `{ requests: BatchRequestItem[] }` |

### Permissions Required (must be granted in Azure Portal)
| Permission | Grants |
|------------|--------|
| `DeviceManagementManagedDevices.ReadWrite.All` | Wipe, retire, reboot, sync, delete from Intune |
| `DeviceManagementManagedDevices.Read.All` | List and query managed devices |
| `DeviceManagementManagedDevices.PrivilegedOperations.All` | `cleanWindowsDevice` (Fresh Start) |
| `DeviceManagementServiceConfig.ReadWrite.All` | Remove device from Autopilot |
| `Device.ReadWrite.All` | Delete device object from Entra ID |

> The existing `graphClient` uses `https://graph.microsoft.com/.default` scope, which inherits all granted app permissions automatically. No code changes are needed in `entraId.ts` or `graphClient.ts`.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Wrong devices acted on | Model-scoped preview step before execution; per-device result reporting |
| Serial mismatch between DB and Intune | "Not enrolled" devices are reported, not silently ignored |
| Graph throttling (429) | Read `Retry-After` header; `withRetry` helper with max 3 attempts |
| `cleanWindowsDevice` on non-Windows | `operatingSystem` OS guard in `executeActionOnDevice` |
| Autopilot identity not found | Treated as `not_found` (soft skip), not a hard failure |
| Entra device object not found | Same — `not_found` soft result |
| fullDecommission partial failure | Each step is independent; per-step results in response; admin can retry |
| Admin consent not granted | Service catches Graph 403 and returns `{ error: 'INSUFFICIENT_GRAPH_PERMISSIONS', message: '...' }` |
| OData injection via serial/model | Escape single quotes in all filter values before interpolation |
| Devices offline during action | Intune queues the action; Graph returns 204 = reported as success |

---

## 15. Implementation Order

Implement in this order to enable incremental testing:

1. **Migration SQL** — create the migration file
2. **`schema.prisma`** — add `IntuneActionLog` model + `User` relation
3. **`backend/src/types/microsoft-graph.types.ts`** — add Intune type interfaces
4. **`shared/src/intune.types.ts`** — create shared types file
5. **`shared/src/index.ts`** — export new types
6. **`backend/src/validators/intuneDevice.validators.ts`** — create validators
7. **`backend/src/services/intuneDevice.service.ts`** — create service (heaviest work)
8. **`backend/src/controllers/intuneDevice.controller.ts`** — create controller
9. **`backend/src/routes/intuneDevice.routes.ts`** — create routes
10. **`backend/src/app.ts`** — register route
11. **`frontend/src/services/intuneService.ts`** — create frontend service
12. **`frontend/src/components/DeviceActionConfirmDialog.tsx`** — create dialog
13. **`frontend/src/pages/IntuneDeviceActions.tsx`** — create page

**Build validation order:** shared → backend → frontend (matches Docker build order).

# Intune Bulk Device Actions — Plan of Action

**Feature:** Mass device action execution via Microsoft Graph (Intune), scoped by device model or individual device
**Status:** Planning
**Date:** 2026-06-12

---

## Overview

Allow Tech Department staff to select a device model (or individual device) from inventory and execute MDM actions against matching Intune-enrolled devices. Supported actions include: sync, reboot, retire, wipe, Fresh Start (`cleanWindowsDevice`), delete from Intune, remove from Autopilot, and remove from Entra ID. A full decommission workflow combines the last three into a single operation. The Graph connection infrastructure already exists in the codebase; this feature adds Intune-specific permissions, a new service layer, and a frontend UI.

---

## Prerequisites (Non-Code — Must Complete First)

### 1. Azure App Registration — Add Intune Permissions

A **tenant administrator** must add the following **Application permissions** (not Delegated) to the Entra app registration (`ENTRA_CLIENT_ID = 34e6cfc0-23f6-420a-a789-775bae343a2a`) and grant admin consent:

| Permission | Purpose |
|---|---|
| `DeviceManagementManagedDevices.ReadWrite.All` | Execute wipe, retire, reboot, sync, delete from Intune |
| `DeviceManagementManagedDevices.Read.All` | List and query managed devices |
| `DeviceManagementManagedDevices.PrivilegedOperations.All` | Fresh Start (`cleanWindowsDevice`) |
| `DeviceManagementServiceConfig.ReadWrite.All` | Remove device from Autopilot |
| `Device.ReadWrite.All` | Delete device object from Entra ID |

> No code changes are needed to pick up these permissions — the existing `graphClient` uses `https://graph.microsoft.com/.default` scope, which inherits all granted app permissions automatically.

**Steps:**
1. Azure Portal → Entra ID → App registrations → find `ENTRA_CLIENT_ID`
2. API permissions → Add a permission → Microsoft Graph → Application permissions
3. Search and add both permissions above
4. Click **Grant admin consent for [tenant]**

### 2. Verify Intune Serial Numbers Match Inventory

Before implementing the match logic, manually verify that `serialNumber` values in Intune match those stored in the `equipment` table. Discrepancies are expected and the service must handle them gracefully (report unmatched devices rather than failing).

---

## Technical Design

### Data Flow

```
User selects model → Backend queries equipment by modelId (serialNumbers)
                   → Backend queries Intune: GET /deviceManagement/managedDevices?$filter=model eq '{modelName}'
                   → Match on serialNumber
                   → Execute action via POST /deviceManagement/managedDevices/{id}/{action}
                   → Return per-device results (matched / not found in Intune / action failed)
```

### Device Matching Strategy

- **Primary key:** `serialNumber` (equipment ↔ Intune `managedDevice.serialNumber`)
- **Secondary:** `model` field on Intune device for initial filter to reduce result set
- Devices in your DB but not in Intune → reported as "not enrolled"
- Devices in Intune not in your DB → ignored (out of scope)

### Supported Actions

| Action | Graph Endpoint | Scope | Risk |
|---|---|---|---|
| `syncDevice` | `POST .../syncDevice` | Bulk or single | Low — forces MDM policy sync |
| `rebootNow` | `POST .../rebootNow` | Bulk or single | Medium — reboots immediately |
| `retire` | `POST .../retire` | Bulk or single | High — removes corporate data, unenrolls from Intune |
| `wipe` | `POST .../wipe` | Bulk or single | **Critical** — full factory reset, unenrolls |
| `cleanWindowsDevice` | `POST .../cleanWindowsDevice` | Bulk or single | **High** — reinstalls Windows; stays enrolled; Windows only |
| `deleteDevice` | `DELETE /deviceManagement/managedDevices/{id}` | Bulk or single | **Critical** — removes device record from Intune |
| `removeAutopilot` | `DELETE /deviceManagement/windowsAutopilotDeviceIdentities/{id}` | Bulk or single | **Critical** — removes device from Autopilot provisioning |
| `removeEntra` | `DELETE /devices/{id}` | Bulk or single | **Critical** — deletes device object from Entra ID |
| `fullDecommission` | All three deletes above, sequenced | Bulk or single | **Critical** — complete removal from Intune + Autopilot + Entra |

All actions rated High or Critical require a secondary confirmation step in the UI. `fullDecommission` requires the user to type the word "DECOMMISSION" before execution.

### Action Comparison — Destructive Operations

| Action | Unenrolls Intune | Removes Autopilot | Removes Entra Object | Reinstalls Windows | Keeps user files |
|---|---|---|---|---|---|
| `retire` | Yes | No | No | No | Yes |
| `wipe` | Yes | No | No | Yes | No |
| `cleanWindowsDevice` | **No** | No | No | Yes | Optional (`keepUserData`) |
| `deleteDevice` | Yes (record removed) | No | No | No | N/A |
| `removeAutopilot` | No | **Yes** | No | No | N/A |
| `removeEntra` | No | No | **Yes** | No | N/A |
| `fullDecommission` | Yes | Yes | Yes | No | N/A |

> **Note:** `cleanWindowsDevice` (Fresh Start) is **Windows only**. The service must check `operatingSystem` on the Intune device record and skip or reject non-Windows devices when this action is selected.

> **Note:** `fullDecommission` calls three separate Graph APIs in sequence: delete managedDevice → delete Autopilot identity → delete Entra device object. Each step is attempted independently; partial failures are reported per step.

### Batch Strategy

Microsoft Graph supports `$batch` requests (up to 20 per batch). For large model groups (e.g. 200+ devices of the same model), actions are split into batches of 20 and executed sequentially. Results are aggregated before returning to the frontend.

---

## Implementation Plan

### Phase 1 — Backend

**Files to create:**

| File | Responsibility |
|---|---|
| `backend/src/services/intuneDevice.service.ts` | Graph queries, serial matching, batch action execution |
| `backend/src/controllers/intuneDevice.controller.ts` | Thin controller, delegates to service |
| `backend/src/routes/intuneDevice.routes.ts` | Routes behind `requireDeviceManagementAccess()` |

**API Routes:**

```
GET  /api/intune/devices/by-model/:modelId      — list matched Intune devices for a model
GET  /api/intune/devices/:intuneDeviceId        — get a single device's Intune details
POST /api/intune/devices/action                 — execute bulk action (by model)
     Body: { modelId: string, action: IntuneAction, confirm: boolean, keepUserData?: boolean }
POST /api/intune/devices/:intuneDeviceId/action — execute single-device action
     Body: { action: IntuneAction, confirm: boolean, keepUserData?: boolean }
```

**Shared Types** (`shared/src/`):

```typescript
type IntuneAction =
  | 'syncDevice'
  | 'rebootNow'
  | 'retire'
  | 'wipe'
  | 'cleanWindowsDevice'
  | 'deleteDevice'
  | 'removeAutopilot'
  | 'removeEntra'
  | 'fullDecommission';

interface BulkDeviceActionRequest {
  modelId: string;
  action: IntuneAction;
  confirm: boolean;        // required true for High/Critical actions
  keepUserData?: boolean;  // only applies to cleanWindowsDevice
}

interface DeviceActionResult {
  serialNumber: string;
  assetTag: string | null;
  intuneDeviceId: string | null;
  autopilotDeviceId: string | null;  // populated for removeAutopilot / fullDecommission
  entraDeviceId: string | null;      // populated for removeEntra / fullDecommission
  status: 'success' | 'not_enrolled' | 'failed' | 'partial'; // partial = some steps of fullDecommission failed
  stepResults?: {
    deleteDevice?: 'success' | 'failed' | 'skipped';
    removeAutopilot?: 'success' | 'failed' | 'skipped' | 'not_found';
    removeEntra?: 'success' | 'failed' | 'skipped' | 'not_found';
  };
  error?: string;
}

interface BulkDeviceActionResponse {
  action: IntuneAction;
  modelName: string;
  total: number;
  succeeded: number;
  notEnrolled: number;
  failed: number;
  results: DeviceActionResult[];
}
```

### Phase 2 — Frontend

**Files to create/modify:**

| File | Responsibility |
|---|---|
| `frontend/src/pages/IntuneDeviceActions.tsx` | Main page — model picker, action selector, results table |
| `frontend/src/services/intuneService.ts` | API client for intune routes |
| `frontend/src/components/DeviceActionConfirmDialog.tsx` | Confirmation dialog for High/Critical actions |

**UI Flow:**
1. Select device model from dropdown (populated from existing models endpoint) **or** navigate to a single device and trigger from its detail page
2. Preview matched devices — table showing asset tag, serial, OS, Intune enrollment status, Autopilot status, Entra object status
3. Select action from dropdown (with risk labels color-coded: Low=green, Medium=amber, High=orange, Critical=red)
4. `cleanWindowsDevice`: additional toggle for "Keep user files"
5. `fullDecommission`: confirmation dialog requiring user to type **DECOMMISSION**; shows exactly what will be removed
6. All other High/Critical actions: confirmation dialog requiring user to type the action name
7. Execute → per-device progress display (especially important for `fullDecommission` multi-step) → results table with per-device/per-step status

---

## Authorization

This feature sits behind the existing `requireDeviceManagementAccess()` middleware. No new permission groups are needed. The CLAUDE.md constraint applies: all authorization checks live in the backend; the frontend only uses permission flags for display purposes.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Wipe / decommission executed on wrong devices | Double-confirmation UI; `fullDecommission` requires typing "DECOMMISSION"; action logged to DB with actor + timestamp |
| Serial number mismatch between DB and Intune | Dry-run preview step before execution; unmatched devices shown explicitly |
| Graph throttling on large batches | Respect `Retry-After` header; batch size capped at 20 per Graph `$batch` limit |
| Admin consent not granted | Service detects 403/insufficient scope from Graph and returns a clear error message identifying which permission is missing |
| Devices offline during action | Intune queues the action; reported as `success` from the API perspective (Graph returns 204) |
| `cleanWindowsDevice` sent to non-Windows device | Service checks `operatingSystem` field on Intune record; rejects non-Windows before calling Graph |
| Autopilot identity not found for a device | Treated as `not_found` (skipped step), not a failure; reported in `stepResults` |
| Entra device object not found | Same as above — `not_found` is a soft result, not a hard failure |
| Partial `fullDecommission` (e.g. Intune deleted but Entra delete fails) | Each step logged independently; UI shows per-step result; admin can retry failed steps individually |

---

## Audit Logging

Each bulk action execution should write a record to the database:

```prisma
model IntuneActionLog {
  id          String   @id @default(uuid())
  performedBy String   // User.id
  action      String
  modelId     String
  modelName   String
  totalDevices    Int
  successCount    Int
  failedCount     Int
  notEnrolledCount Int
  results     Json     // DeviceActionResult[]
  createdAt   DateTime @default(now())
}
```

This log is accessible to admins and provides an audit trail for destructive actions.

---

## Effort Summary

| Component | Complexity |
|---|---|
| Azure permission grant (admin) | Low — one-time (5 permissions total) |
| Backend service: MDM actions (sync, reboot, retire, wipe, Fresh Start) | Medium |
| Backend service: delete from Intune | Low — `DELETE` endpoint, no body |
| Backend service: remove from Autopilot (lookup + delete) | Medium — must first query Autopilot identities by serial to get identity ID |
| Backend service: remove from Entra (lookup + delete) | Medium — must first query Entra `devices` by `deviceId` from Intune record |
| Backend service: `fullDecommission` orchestration + partial failure handling | Medium-High |
| Shared types | Low |
| Frontend UI (model picker, single-device trigger, action selector) | Medium |
| Confirmation dialogs (risk-tiered, typed confirmation for Critical) | Medium |
| Audit log model + migration | Low |
| Edge case handling (OS guard, not_found, throttling, partial failure) | Medium |

**Total estimated effort: ~3–4 days** once Azure admin consent is in place.

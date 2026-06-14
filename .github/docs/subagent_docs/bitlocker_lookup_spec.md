# Spec: BitLocker Recovery Key Lookup (Tier 2 — Item 4)

**Phase 1 — Research & Specification**
**Date:** 2026-06-13
**Feature:** `bitlocker_lookup`

---

## 1. Current State Analysis

The `IntuneDeviceActionsPage` currently has four tabs (0–3):
- **Tab 0** — By Device Model (bulk Intune actions)
- **Tab 1** — Scan / Search by Name (scan wizard)
- **Tab 2** — History (localStorage-backed action history)
- **Tab 3** — Reconciliation (Intune ↔ Inventory report)

The backend `GET /intune/devices/:serialNumber/status` already resolves:
- Serial number → Intune device (`azureADDeviceId`)
- `azureADDeviceId` → Entra object ID (`getEntraDeviceObjectId`)

These helpers are private to the service layer and can be reused directly.

No BitLocker functionality exists today.

---

## 2. Problem Definition

Help-desk staff encounter BitLocker lockouts daily (student/staff forgot their PIN, device rebooted into recovery). Today they must navigate to the Entra / Intune portal, find the device, and locate the recovery key — several clicks with no serial-number search shortcut.

This feature replaces that with a two-click lookup: type the serial number → get the recovery key(s).

---

## 3. Graph API — BitLocker Recovery Keys

**Reference:** https://learn.microsoft.com/en-us/graph/api/resources/bitlockerrecoverykey

### Endpoints (v1.0)

```
# List all BitLocker keys for a device (by Entra object ID)
GET /informationProtection/bitlocker/recoveryKeys
    ?$filter=deviceId eq '{entraObjectId}'
    &$select=id,createdDateTime,volumeType,deviceId

# Get the actual key value for a specific key ID
GET /informationProtection/bitlocker/recoveryKeys/{keyId}?$select=key
```

**Important:**
- The list endpoint returns key metadata only — the `key` value is always absent.
- The individual GET with `$select=key` is the only way to retrieve the 48-digit recovery key.
- Every individual key retrieval is **automatically audit-logged** by Microsoft in the Azure AD audit log. This cannot be disabled.
- `deviceId` in the BitLocker response is the Entra device **object ID** (`id` from `/devices`), NOT the `azureADDeviceId` (hardware GUID from Intune / `deviceId` property on the Entra device object). The existing `getEntraDeviceObjectId()` function already performs this conversion.

### Permission Required

| Permission | Type | Notes |
|---|---|---|
| `BitLockerKey.Read.All` | Application | **Not yet granted — requires admin consent** |

The app already uses `acquireTokenByClientCredential` with scope `https://graph.microsoft.com/.default`, so once `BitLockerKey.Read.All` is added to the Entra app registration and admin consent is granted, no code change is needed for token acquisition.

### Response shapes

```json
// List response (no key value)
{
  "value": [
    {
      "id": "b465e4e8-...",
      "createdDateTime": "2021-09-01T01:37:00Z",
      "deviceId": "<entra-object-id>",
      "volumeType": "operatingSystemVolume"
    }
  ]
}

// Individual key GET
{
  "id": "b465e4e8-...",
  "key": "123456-234567-345678-456789-567890-678901"
}
```

### Volume types
`operatingSystemVolume` | `fixedDataVolume` | `removableDriveVolume` | `unknownFutureValue`

---

## 4. Architecture

### Backend Flow

```
GET /intune/bitlocker/:serialNumber
  └─ authenticate
  └─ requireDeviceManagementAccess()
  └─ validateRequest(SerialNumberParamSchema, 'params')  ← already exists
  └─ controller.getBitLockerKeys
       └─ service.getBitLockerKeys(serialNumber, requestedBy)
            1. getDeviceBySerial(serialNumber)  → IntuneDevice | null
            2. getEntraDeviceObjectId(azureADDeviceId)  → entraObjectId | null
            3. GET /informationProtection/bitlocker/recoveryKeys?$filter=deviceId eq '{entraObjectId}'
               → array of { id, createdDateTime, volumeType }
            4. For each keyId: GET .../recoveryKeys/{keyId}?$select=key  → { key }
            5. log.info('BitLocker keys accessed', { requestedBy, serialNumber, keyCount })
            6. Return BitLockerKeyResponse
```

**Error handling:**
- Device not found in Intune → `keys: []`, `intuneDeviceId: null`
- Device found but not in Entra → `keys: []`, `entraObjectId: null`
- 403 from Graph → `AppError` with code `BITLOCKER_PERMISSION_DENIED` → HTTP 503 (upstream permission issue, not a client error)
- 0 keys returned → valid response, `keys: []` (not Windows, or BitLocker not enabled)

**No Prisma migration.** All existing schema fields are sufficient; access logging goes to application logger only (Graph auto-logs key reads in Azure audit log).

**No new npm dependencies.**

### Shared Types (additions to `shared/src/intune.types.ts`)

```typescript
export interface BitLockerKeyEntry {
  id: string;
  createdDateTime: string | null;
  volumeType: string | null;
  key: string;
}

export interface BitLockerKeyResponse {
  serialNumber: string;
  assetTag: string | null;
  deviceName: string | null;
  intuneDeviceId: string | null;
  entraObjectId: string | null;
  keys: BitLockerKeyEntry[];
}
```

### Graph Internal Types (addition to `backend/src/types/microsoft-graph.types.ts`)

```typescript
export interface GraphBitLockerKey {
  id: string;
  createdDateTime: string | null;
  volumeType: string | null;
  deviceId: string | null;
  key?: string;
}
export type GraphBitLockerKeyCollection = GraphCollectionResponse<GraphBitLockerKey>;
```

---

## 5. Files to Modify

| File | Change |
|---|---|
| `shared/src/intune.types.ts` | Add `BitLockerKeyEntry`, `BitLockerKeyResponse` |
| `backend/src/types/microsoft-graph.types.ts` | Add `GraphBitLockerKey`, `GraphBitLockerKeyCollection` |
| `backend/src/services/intuneDevice.service.ts` | Add `getBitLockerKeys()` |
| `backend/src/controllers/intuneDevice.controller.ts` | Add `getBitLockerKeys` controller |
| `backend/src/routes/intuneDevice.routes.ts` | Add `GET /bitlocker/:serialNumber` in read block |
| `frontend/src/services/intuneService.ts` | Add `getBitLockerKeys()` |
| `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` | Add Tab 4 "BitLocker" |

No new files needed (spec and review docs aside).

---

## 6. Frontend — Tab 4 "BitLocker"

- Tab index: **4** (widens `tab` type to `0 | 1 | 2 | 3 | 4`)
- State: `bitlockerSerial` (text input), `bitlockerResult` (query data), `revealedKeys` (Set\<string\> of key IDs the user has clicked "Reveal" on)
- Fetch pattern: `useMutation` (same pattern as other lookups — not `useQuery` since this is explicitly user-triggered and should never re-fetch automatically)
- No `enabled: false` pattern needed since `useMutation` only runs on explicit call

**UX flow:**
1. User types serial number → clicks "Look Up Keys"
2. Loading state while Graph resolves
3. Result card shows: device name, asset tag, Intune ID, Entra ID, OS
4. Per key: ID, created date, volume type, plus a "Reveal Key" button (initially blurred)
5. On "Reveal Key" click: adds key ID to `revealedKeys` set → shows the 48-digit key in a `<code>` block
6. Copy-to-clipboard button next to the revealed key
7. Clear permission warning banner: "Each key retrieval is audit-logged in Azure AD."

**Error handling:**
- 503 / 403 → "BitLocker key lookup requires `BitLockerKey.Read.All` permission. Ask your Azure administrator to grant it on the Entra app registration."
- Device not found (0 keys, null entraObjectId) → "No BitLocker keys found. The device may not be Windows or BitLocker may not be enabled."
- Generic error → standard error Alert

---

## 7. Dependencies

No new npm packages. The existing `@microsoft/microsoft-graph-client`, `@mgspe/shared-types`, MUI v7, and TanStack Query v5 are all that's needed.

**Prerequisite (out of band):** Admin must grant `BitLockerKey.Read.All` on the Entra app registration and consent before the endpoint will work. The spec calls this out explicitly; the implementation should gracefully surface this as a clear user-facing error.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `BitLockerKey.Read.All` not yet granted → 403 | Backend maps 403 to HTTP 503 with code `BITLOCKER_PERMISSION_DENIED`; frontend shows admin-action message |
| Key value exposed in application logs | Service logs only `{ requestedBy, serialNumber, keyCount }` — never the actual key string |
| Device has multiple BitLocker volumes | Service fetches all keys from the list endpoint, then fetches each individually — all returned to the frontend |
| Non-Windows device / BitLocker not enabled | Graph returns empty list → valid `keys: []` response, frontend shows informational message |
| OData injection via serial number | `escapeOdata()` already defined in service — applied consistently on all filter strings |

---

## 9. Validation Commands

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1`

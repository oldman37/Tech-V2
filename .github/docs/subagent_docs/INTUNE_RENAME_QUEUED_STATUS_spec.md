# INTUNE_RENAME_QUEUED_STATUS — Specification

**Phase 1 — Research & Specification**
**Date:** 2026-08-19
**Scope decision (user, 2026-08-19):** Items 1 + 2 only. The post-hoc verification pass
(re-reading `deviceActionResults` into the audit log) is explicitly **out of scope** —
it would require an `IntuneActionLog` schema change and migration.

---

## 1. Current State Analysis

### Reported symptom

A bulk rename run reported **297 succeeded**. Inspection of the Intune admin center showed
only a handful of devices actually renamed.

### Where the number comes from

`executeRenameDevices` (`backend/src/services/intuneDevice.service.ts:1853-1951`) POSTs
`setDeviceName` per device and treats a non-throwing call as a completed rename:

```ts
await withRetry(() =>
  client.api(`/deviceManagement/managedDevices/${item.intuneDeviceId}/setDeviceName`)
    .version('beta').post({ deviceName: item.newDeviceName }),
);
results.push({ ..., status: 'success' });          // line 1903
```

That count flows out as `RenameDevicesResponse.succeeded`
(`shared/src/intune.types.ts:510-517`) → `IntuneScanWizardTab.handleRenamed`
(`frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx:363-375`) → the History tab
chip `✓ {n} succeeded` (`frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx:825`,
compact variant at `:774`). That chip is what the user read.

### Preview path

`previewRenameItems` (`:1740-1832`) resolves each row to a managed device via
`getDeviceBySerial` (`:118-132`) or `getDeviceByName` (`:134-…`), builds the `OCS-<tag>`
name, and marks the row `valid` unless the device is unenrolled, has no tag, or the name
fails `validateIntuneDeviceName`. It performs **no capability check** on the device.

`getDeviceBySerial` / `getDeviceByName` currently query **Graph v1.0** — `createGraphClient`
(`backend/src/utils/graphClient.ts:19-23`) calls `Client.init` without `defaultVersion`, and
neither lookup calls `.version('beta')`. Their `$select` lists include no join-type field.

---

## 2. Problem Definition

Two distinct defects, one hiding the other.

### Defect A — HTTP 204 is reported as a completed rename

`setDeviceName` is an **asynchronous Intune device action**. Per the Graph reference the
success response is `204 No Content`, meaning the command was *accepted and queued*.
`managedDevice.deviceName` is documented read-only; it changes only after the device applies
the rename and reports back. On Windows the rename is delivered through the Accounts CSP and
requires a restart to take effect. A device that is powered off or off-network keeps the
action pending indefinitely.

So `succeeded: 297` is an accurate count of *commands queued* mislabelled as *devices renamed*.
Any device that has not checked in since the run is legitimately still pending, not renamed —
and that distinction is invisible in the current UI.

### Defect B — hybrid Entra joined devices are queued despite being unsupported

Microsoft states plainly that renaming Microsoft Entra hybrid joined devices from Intune is
**not supported**, and that the admin-center bulk rename action is unavailable for hybrid
joined and co-managed devices. Graph nevertheless accepts `setDeviceName` for such a device
and returns 204; the action later resolves server-side to a non-applied state.

The preview cannot currently detect this because join type is never fetched. For a
predominantly domain-joined fleet this alone accounts for a near-total miss rate, which
matches the reported 297 → "a few" ratio.

### Consequence

The operator has no way to distinguish "queued, will apply on next check-in" from "queued,
will never apply". Both are reported identically as success.

---

## 3. Proposed Solution Architecture

Two changes, both confined to the rename path.

### 3.1 Report the true terminal state — "queued", not "succeeded"

The backend cannot know whether a rename applied at the moment it returns, and this spec
deliberately does not add polling. The honest terminal state for a `setDeviceName` call that
returned 204 is **queued**. Rename the state accordingly end-to-end and correct every
rename-specific string that currently promises immediacy.

The generic `IntuneActionLog.successCount` column and the generic `IntuneHistoryEntry.succeeded`
field are shared with every other Intune action and are **left structurally unchanged** — the
queued count is written into them as before. Only the *rendering* becomes action-aware, keyed
off the `action` / `entry.action` discriminator both already carry.

### 3.2 Block hybrid-joined devices at preview time

Fetch `managedDevice.joinType` during preview and hard-block
`joinType === 'hybridAzureADJoined'` so those rows are never queued.

`joinType` is **beta-only** — absent from the v1.0 `managedDevice` resource, present in beta
with enum `unknown | azureADJoined | azureADRegistered | hybridAzureADJoined`. The two lookup
helpers must therefore be pinned to `.version('beta')`. Every field already in their `$select`
lists (`id, deviceName, serialNumber, operatingSystem, complianceState, lastSyncDateTime,
enrolledDateTime, managedDeviceOwnerType, azureADDeviceId, model, manufacturer,
userDisplayName, userPrincipalName`) also exists on the beta resource, and `$filter` on
`serialNumber` / `deviceName` is supported there, so this is a version pin with no field-level
fallout. `setDeviceName` in this same service already calls `.version('beta')`, so beta is an
established pattern in this file.

Additionally surface a **non-blocking warning** for devices whose `lastSyncDateTime` is older
than a stale threshold — these are supported but will not apply the rename until they come
back online. Advisory only; the row stays executable.

### 3.3 Shared blocker helper

The frontend's `isRowReady` (`IntuneBulkRenameDialog.tsx:51-55`) currently ignores the
backend's `issue` field entirely — it only checks `intuneDeviceId` plus name validity, because
names are user-editable in the preview grid. A hybrid device would therefore still render as
"Ready" even with `valid: false` from the backend.

Rather than have the component reason about Graph enums, add a shared pure helper alongside the
existing `validateIntuneDeviceName`, which exists precisely so backend and frontend validation
cannot drift (`shared/src/intune.types.ts:66-81`):

```ts
export function getRenameBlocker(
  device: { intuneDeviceId: string | null; joinType: string | null },
): string | null;
```

Returns a human-readable blocking reason, or `null` if the device can be renamed. Consumed by
`previewRenameItems` (to set `issue` / `valid`) and by `isRowReady` / `getRowIssue` in the
bulk dialog.

### 3.4 Deliberate non-goal — no re-check inside `executeRenameDevices`

`executeRenameDevices` re-validates the device **name** as defense-in-depth (`:1875-1886`)
because the frontend allows free-text editing. It will **not** re-fetch join type per device:
that would add one Graph GET per row (up to `INTUNE_RENAME_MAX_ROWS` = 300) to every run, and
the failure mode being guarded against is a queued no-op — not a security or data-integrity
issue. Authorization and name validation remain enforced backend-side. Recorded here so review
does not flag it as an oversight.

---

## 4. Implementation Steps

### Step 1 — `shared/src/intune.types.ts`

1. Add `INTUNE_RENAME_STALE_SYNC_DAYS = 30`, commented as advisory-only and distinct from the
   reconciliation report's 60/90-day thresholds (`:368-372`).
2. Add `getRenameBlocker(...)` per §3.3, documented as the single source of truth shared by
   preview and the bulk dialog.
3. `RenamePreviewItem`: add `joinType: string | null`, `lastSyncDateTime: string | null`, and
   `warning: string | null` (advisory; does not affect `valid`).
4. `RenameDeviceResult.status`: `'success' | 'failed'` → `'queued' | 'failed'`, with a doc
   comment stating 204 means the command was accepted by Intune, not applied by the device.
5. `RenameDevicesResponse`: rename `succeeded` → `queued`.

**Verify:** `shared` compiles; consumers of the renamed field fail loudly at compile time —
that is how Step 4's call sites are enumerated.

### Step 2 — `backend/src/types/microsoft-graph.types.ts`

Add `joinType: string | null` to `IntuneDevice` (`:154-169`), commented as beta-only and used
to detect hybrid-joined devices.

**Verify:** backend `tsc` inside the image build.

### Step 3 — `backend/src/services/intuneDevice.service.ts`

1. `getDeviceBySerial` (`:118-132`) and `getDeviceByName` (`:134-…`): add `joinType` to the
   `$select` string and chain `.version('beta')` on each request.
2. `previewRenameItems` (`:1740-1832`):
   - populate `joinType` and `lastSyncDateTime` on each `RenamePreviewItem`;
   - use `getRenameBlocker(...)` for the device-capability branch, keeping the existing
     no-tag and `validateIntuneDeviceName` branches in their current order;
   - set `warning` when `lastSyncDateTime` is older than `INTUNE_RENAME_STALE_SYNC_DAYS`.
3. `executeRenameDevices` (`:1853-1951`):
   - push `status: 'queued'` instead of `'success'` (`:1903`);
   - rename the local `succeeded` count to `queued`; keep writing it to
     `IntuneActionLog.successCount` (no schema change);
   - return `queued` in place of `succeeded`;
   - update the completion log line (`:1937`) to say commands were queued.

**Verify:** backend image build compiles; no `'success'` literal remains in the rename path.

### Step 4 — Frontend

- `frontend/src/components/IntuneBulkRenameDialog.tsx`
  - `isRowReady` / `getRowIssue`: consult `getRenameBlocker(r)` before the name checks.
  - Surface `r.warning` in the Status cell (warning-coloured chip; row stays executable).
  - Replace the confirm alert text (`:251-256`) — "This takes effect immediately" is factually
    wrong; state that Intune queues the rename and applies it on next device check-in
    (Windows requires a restart).
- `frontend/src/components/IntuneRenameDeviceDialog.tsx`
  - Replace the `This takes effect immediately in Intune.` alert (`:74-76`) with the same
    queued wording.
- `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx`
  - `handleRenamed` (`:363-375`): `succeeded: result.queued`; in-place displayName patch match
    `r.status === 'success'` → `r.status === 'queued'`.
- `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx`
  - History chips at `:774` and `:825`: when `entry.action === 'setDeviceName'`, label the count
    `queued` rather than `succeeded`.

**Verify:** frontend image build (`tsc` + `vite build`) compiles.

### Step 5 — Phase 6 preflight

`scripts/preflight.ps1` — backend then frontend Docker image builds, fail-fast, exit 0.

---

## 5. Dependencies

**No new dependencies.** All changes use packages already exercised in these files:
`@microsoft/microsoft-graph-client` (`.version('beta')` already used by `setDeviceName` at
`:1893`), MUI v7 `Chip` / `Alert`, TanStack Query v5.

**No configuration changes.** `DeviceManagementManagedDevices.PrivilegedOperations.All` already
covers `setDeviceName`; reading `joinType` needs no scope beyond the managed-device read
permission the preview already uses.

**No Prisma schema change and therefore no migration file** — the queued count reuses the
existing generic `IntuneActionLog.successCount` column.

---

## 6. Risks and Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Pinning the two lookups to `beta` changes response shape for other callers of `getDeviceBySerial` / `getDeviceByName` | Every `$select`-ed field exists on the beta resource and `$filter` on `serialNumber` / `deviceName` is supported there; the service already calls beta for `setDeviceName`. Compile-time types are unchanged apart from the added `joinType`. |
| 2 | `joinType` returns `unknown` for some devices | `getRenameBlocker` blocks **only** the explicit `hybridAzureADJoined` value. `unknown` stays executable — fail-open, preserving today's behaviour rather than newly blocking rows. |
| 3 | Renaming `RenameDevicesResponse.succeeded` breaks an unnoticed consumer | Deliberate compile-time break. `tsc` in the frontend image build enumerates every call site. Grep confirms two (`IntuneScanWizardTab.tsx:370`, and the `status === 'success'` match at `:373-375`). |
| 4 | Operators read "queued" as failure | Alert copy states explicitly that queued is the expected outcome and that Intune applies the rename on next device check-in. |
| 5 | Blocking hybrid devices removes an action operators relied on | It never worked for those devices — the calls were silent no-ops. The blocking reason names the limitation. |
| 6 | 30-day stale-sync threshold is arbitrary | Advisory only; it sets `warning`, never `valid`. No row becomes unexecutable because of it. |

---

## 7. Success Criteria

1. A bulk rename of N devices reports **"N queued"**, never "N succeeded", in the dialog and in
   both History tab renderings.
2. A preview row whose device is `joinType === 'hybridAzureADJoined'` renders as blocked with a
   reason naming the Intune limitation, and is excluded from the execute payload.
3. A preview row whose device last synced more than `INTUNE_RENAME_STALE_SYNC_DAYS` ago renders
   a warning and remains executable.
4. No rename-path string claims the change "takes effect immediately".
5. `scripts/preflight.ps1` exits 0.

---

## 8. Sources

1. [setDeviceName action — Microsoft Graph beta](https://learn.microsoft.com/en-us/graph/api/intune-devices-manageddevice-setdevicename?view=graph-rest-beta) — success is `204 No Content`; permission `DeviceManagementManagedDevices.PrivilegedOperations.All`.
2. [Device Action: Rename Device — Microsoft Intune](https://learn.microsoft.com/en-us/intune/device-management/actions/rename) — "Renaming Microsoft Entra hybrid joined devices from Intune is not supported"; supported platforms; naming rules.
3. [managedDevice resource type — Graph beta](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice?view=graph-rest-beta) — `joinType` enum; `deviceName` read-only; `deviceActionResults`.
4. [managedDevice resource type — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice?view=graph-rest-1.0) — confirms `joinType` is absent from v1.0, forcing the beta pin.
5. [Accounts CSP — Windows client management](https://learn.microsoft.com/en-us/windows/client-management/mdm/accounts-csp) — the CSP that delivers the Windows rename; restart required.
6. [Microsoft Q&A — rename hybrid Entra joined Autopilot device via Graph](https://learn.microsoft.com/en-us/answers/questions/754619/can-rename-of-hybrid-azure-ad-autopilot-device-usi) — Graph cannot rename hybrid-joined endpoints.
7. [Peter van der Woude — Using bulk actions for renaming Windows devices](https://petervanderwoude.nl/post/using-bulk-actions-for-renaming-windows-devices/) — bulk rename unavailable for hybrid joined and co-managed devices.
8. [MSEndpointMgr — How to rename Windows 10 devices in Intune using PowerShell](https://msendpointmgr.com/2020/03/02/how-to-rename-windows-10-devices-in-intune-using-powershell/) — rename passes to Intune as pending and applies on device check-in.

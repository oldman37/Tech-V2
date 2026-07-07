# Intune Device Rename — Feature Specification

Roadmap item: `.github/docs/intune-actions-roadmap.md` Tier 2 #6 ("Reassign primary user / rename device").
This spec covers **rename only** (not primary-user reassignment).

## 1. Current State Analysis

The Intune Device Actions page (`frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx`)
already exposes a generic action-dispatch pattern:

- `IntuneAction` union (`shared/src/intune.types.ts`) drives a `Select` dropdown (`ACTIONS` const)
  used by both the "By Device Model" and "Scan / Search by Name" tabs.
- Backend dispatch: `executeActionOnDevice()` (single switch) in
  `backend/src/services/intuneDevice.service.ts`, invoked by `executeBulkAction`,
  `executeSingleAction`, and `executeDeviceListAction`. All of these apply **one uniform
  action + uniform options** (e.g. `keepUserData`) to every device in the batch.
- Audit trail: `intune_action_logs` table (`IntuneActionLog` Prisma model) — `action` and
  `results` are a plain `String` / `Json` column respectively, so **no migration is needed**
  to log a new action type.
- Existing device naming convention across the fleet: `OCS-<assetTag>` (e.g. `OCS-56538`),
  confirmed by the regex `/^OCS-(\d+)$/i` used in reconciliation, scan search, and
  reconciliation-to-inventory code throughout `intuneDevice.service.ts`.
- Excel/CSV upload precedent: `backend/src/services/inventoryImport.service.ts` +
  `backend/src/routes/inventory.routes.ts` use `multer` (memory storage, 10MB limit,
  xlsx/xls/csv mime+extension filter) → `ExcelJS` parsing → row validation. This request
  follows the same shape but is intentionally **not** wired through the shared inventory
  importer (different domain, different validation rules — see §7 Simplicity note).
- Graph auth: `backend/src/utils/graphClient.ts` uses **app-only client-credentials**
  (`scopes: ['https://graph.microsoft.com/.default']`) — whatever Graph permissions are
  consented on the Entra app registration are what's available. No code change needed
  there; the SDK's `.version('beta')` per-request override (confirmed against
  `@microsoft/microsoft-graph-client@3.0.7` docs) is used only for the rename call.

## 2. Problem Definition

Add two new rename workflows to the existing Intune Device Actions page:

1. **Single-device rename** — enter a serial number, look it up, review/edit the proposed
   new name, execute.
2. **Mass rename via Excel upload** — upload a 2-column spreadsheet (Serial Number, Tag
   Number), preview the resolved Intune device + proposed name for every row, execute in
   bulk.

Both must use Microsoft Graph's `setDeviceName` action and write to the existing audit log.

## 3. Dependency / API Verification (per CLAUDE.md policy)

Verified 2026-07-06 against Microsoft Learn:

- **Endpoint**: `POST /deviceManagement/managedDevices/{id}/setDeviceName`
- **API version**: **beta only** — no v1.0 page exists (confirmed: the `view=graph-rest-1.0`
  query param still resolved to the beta doc with the "recommend v1.0 when possible" banner,
  and Microsoft's own `/beta` Reference links page for the Rename action links only to the
  beta doc). The call must use `client.api(path).version('beta').post(...)`.
- **Request body**: `{ "deviceName": "<string>" }` → **204 No Content** on success.
- **Permissions**: Delegated or Application — `DeviceManagementManagedDevices.PrivilegedOperations.All`
  (least-privileged option for this action). **This is a new permission — not currently
  used anywhere else in this codebase** (confirmed via grep of `backend/src/`). User has
  confirmed they can add it to the Entra app registration and grant admin consent.
- **Platform support**: Android Enterprise (COBO/COSU/COPE), iOS/iPadOS (supervised), macOS
  (corporate-owned), Windows (corporate-owned). **Not supported for Microsoft Entra hybrid-
  joined Windows devices** — fine here since this fleet uses Autopilot/Entra-joined Windows
  devices (confirmed by existing Autopilot integration in `removeAutopilot`/`fullDecommission`).
- **Windows device name rules** (applied as validation before calling Graph): ≤ 63 chars,
  non-empty, no spaces, letters/numbers/hyphens only (a specific disallowed-character set
  from Microsoft docs — hyphens are explicitly allowed), must not be all-numeric. The
  `OCS-<tag>` format always satisfies this.

Sources: [setDeviceName action](https://learn.microsoft.com/en-us/graph/api/intune-devices-manageddevice-setdevicename?view=graph-rest-beta), [Device Action: Rename Device](https://learn.microsoft.com/en-us/intune/device-management/actions/rename), [Use the Microsoft Graph SDKs with the beta API](https://learn.microsoft.com/en-us/graph/sdks/use-beta).

## 4. Decisions (confirmed with user)

- **Admin consent**: user will add `DeviceManagementManagedDevices.PrivilegedOperations.All`
  (Application permission) to the Entra app registration and grant admin consent. This is an
  **external prerequisite** — the Docker build will succeed regardless, but the feature will
  return `403`/`GRAPH_ERROR` at runtime until consent is granted. Flagged again in §9 Risks.
- **Naming convention**: new device name is always auto-built as `OCS-<tag>` (existing fleet
  convention). If a tag number already has an `OCS-` prefix (user error in the spreadsheet or
  manual entry), it is stripped before re-prefixing to avoid `OCS-OCS-1234`.

## 5. Proposed Solution Architecture

### Why not reuse the generic `IntuneAction` dispatch as-is

The generic dispatch (`executeActionOnDevice`, `executeBulkAction`, `executeDeviceListAction`)
applies **one uniform value** to a batch (e.g. `keepUserData`). Rename needs a **distinct new
name per device**, sourced from an external spreadsheet that is the authoritative source of
truth (it may deliberately differ from whatever asset tag is currently cached in the inventory
DB — e.g. correcting a mistagged device). Forcing this into the generic template would either
(a) require templating against inventory data (wrong — the whole point is the spreadsheet
overrides that), or (b) silently appear in the existing "By Model"/"Scan by Name" dropdowns
where it would fail (those flows don't collect a per-device name). So rename gets its own
tab + endpoints, while still reusing: the Graph client, retry helper, audit log table, and
`ResponsiveTable`/results-panel UI conventions already in the file.

### Flow: parse/lookup → preview (editable) → confirm → execute

Mirrors the existing "By Device Model" tab's search → review → execute shape already in the
page, so the UX is consistent with what help-desk staff already know.

```
Single-device mode:
  [Serial Number input] → POST /api/intune/devices/rename/preview (JSON, 1 item)
    → preview row (current name, proposed "OCS-<tag>", editable) → Confirm → execute

Bulk mode:
  [Upload .xlsx/.xls/.csv] → POST /api/intune/devices/rename/preview-file (multipart)
    → parses rows + resolves Intune device + proposed name per row in one round trip
    → preview table (each row editable/removable) → Confirm → execute

Execute (shared by both modes):
  POST /api/intune/actions/rename  { items: [{ intuneDeviceId, serialNumber, newDeviceName }] }
    → calls setDeviceName per device (beta endpoint) → writes intune_action_logs
      (action: 'setDeviceName') → returns per-row results
```

### 5.1 Shared types — `shared/src/intune.types.ts`

```ts
// Extend existing unions (low risk — no confirm required, unlike destructive actions)
IntuneAction: add 'setDeviceName'
INTUNE_ACTION_RISK.setDeviceName = 'low'
INTUNE_ACTION_LABELS.setDeviceName = 'Rename Device'

export interface RenamePreviewItem {
  rowNumber?: number;              // present for file-parsed rows only
  serialNumber: string;
  tagNumber: string | null;        // from Excel column or manual input; null if resolved from inventory
  tagSource: 'input' | 'inventory' | null;
  intuneDeviceId: string | null;
  currentDeviceName: string | null;
  proposedDeviceName: string | null; // null if no tag could be resolved at all
  enrollmentStatus: 'enrolled' | 'not_enrolled';
  valid: boolean;
  issue: string | null;            // e.g. "Not enrolled in Intune", "No tag number available", "Name exceeds 63 characters"
}

export interface RenamePreviewResponse {
  total: number;
  validCount: number;
  invalidCount: number;
  items: RenamePreviewItem[];
  parseErrors?: Array<{ rowNumber: number; message: string }>; // e.g. row with no serial number at all
}

export interface RenamePreviewRequest {
  items: Array<{ serialNumber: string; tagNumber?: string }>;
}

export interface RenameDeviceRequestItem {
  intuneDeviceId: string;
  serialNumber: string;
  newDeviceName: string;
}

export interface RenameDevicesRequest {
  items: RenameDeviceRequestItem[];
}

export interface RenameDeviceResult {
  serialNumber: string;
  assetTag: string | null;
  intuneDeviceId: string | null;
  previousDeviceName: string | null;
  newDeviceName: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface RenameDevicesResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: RenameDeviceResult[];
  logId: string;
}

/** Server-enforced cap on rows per preview/execute request (bounds Graph call volume/time). */
export const INTUNE_RENAME_MAX_ROWS = 300;
```

### 5.2 Backend service — `backend/src/services/intuneDevice.service.ts`

New private helpers (same file, reuses existing `getDeviceBySerial`, `createGraphClient`,
`withRetry`, `escapeOdata`):

- `buildProposedDeviceName(tag: string): string` — trims, strips a leading `OCS-`
  (case-insensitive) if present, returns `OCS-${cleaned}`.
- `validateDeviceName(name: string): string | null` — returns an issue string or `null`.
  Checks: non-empty, ≤ 63 chars, `/^[A-Za-z0-9-]+$/` (letters/digits/hyphens only — a safe
  subset satisfying both the Windows rule and the simpler iOS/macOS/Android rule), and not
  all-digits.
- `parseRenameExcelRows(buffer: Buffer, fileName: string): { rows: {rowNumber, serialNumber, tagNumber}[]; parseErrors: {rowNumber, message}[] }`
  — small local ExcelJS parser (header row + one data pass), **not** shared with
  `inventoryImport.service.ts` (different columns/validation; extracting a shared util for
  a single additional consumer would be premature — see CLAUDE.md Simplicity principle).
  Accepts CSV via `csv-parse/sync` the same way `inventoryImport.service.ts` does, for
  consistency with what users are already used to uploading.
  Header matching (case-insensitive, first match wins): Serial → `"Serial Number"`, `"Serial"`;
  Tag → `"Tag Number"`, `"Tag#"`, `"Tag"`, `"Asset Tag"`.
  A row missing a serial number is dropped into `parseErrors`; a row missing a tag number is
  kept (tag will be resolved from inventory in the preview step, consistent with single-device
  mode).

New exported functions:

- `previewRenameItems(items: {serialNumber, tagNumber?}[]): Promise<RenamePreviewResponse>`
  - Concurrency-limited (5, matching `searchDevicesByNames`) Graph lookup per serial via
    existing `getDeviceBySerial`.
  - If `tagNumber` omitted, falls back to `prisma.equipment.findFirst({ where: { serialNumber } })`
    for `assetTag` (same lookup pattern already used in `executeSingleAction`/`getDeviceStatus`).
  - Computes `proposedDeviceName` via `buildProposedDeviceName`, runs `validateDeviceName`,
    sets `valid`/`issue` accordingly (not enrolled, no tag available, or name-rule violation).
- `previewRenameFromFile(buffer, fileName): Promise<RenamePreviewResponse>` — calls
  `parseRenameExcelRows` then `previewRenameItems`, merging `parseErrors` into the response.
- `executeRenameDevices(items: RenameDeviceRequestItem[], performedBy: string): Promise<RenameDevicesResponse>`
  - For each item: `client.api(\`/deviceManagement/managedDevices/${id}/setDeviceName\`).version('beta').post({ deviceName })`
    wrapped in `withRetry`. Captures the device's current name first (already available from
    the preview step's `currentDeviceName` is NOT re-fetched here — the frontend passes
    exactly what was shown; execute trusts its input, matching how `executeDeviceListAction`
    already trusts caller-supplied IDs).
  - On per-item failure, catches and records `status: 'failed'`, `error: message` — same
    try/catch shape as `executeActionOnDevice`.
  - Writes one `intuneActionLog` row (`action: 'setDeviceName'`, `totalDevices`,
    `successCount`, `failedCount`, `results`) — identical shape to existing bulk actions, so
    it shows up in the existing History/Logs tab automatically.
  - Sequential execution (not `$batch`) because `setDeviceName` isn't in `BATCHABLE_ACTIONS`
    and batching offers little benefit at the row counts involved (≤ 300).

### 5.3 Validators — `backend/src/validators/intuneDevice.validators.ts`

```ts
// Add to the local IntuneActionSchema enum so GET /logs ?action=setDeviceName filtering works
'setDeviceName' added to IntuneActionSchema

export const RenamePreviewSchema = z.object({
  items: z.array(z.object({
    serialNumber: z.string().min(1).max(200),
    tagNumber: z.string().max(50).optional(),
  })).min(1).max(INTUNE_RENAME_MAX_ROWS),
});

export const RenameExecuteSchema = z.object({
  items: z.array(z.object({
    intuneDeviceId: z.string().min(1).max(300),
    serialNumber:   z.string().min(1).max(200),
    newDeviceName:  z.string().min(1).max(63),
  })).min(1).max(INTUNE_RENAME_MAX_ROWS),
});
```

### 5.4 Controller — `backend/src/controllers/intuneDevice.controller.ts`

Three thin handlers following the exact existing pattern (`try/catch` →
`handleControllerError`): `previewRename`, `previewRenameFile` (reads `req.file.buffer`/`req.file.originalname`
from multer), `executeRename`.

### 5.5 Routes — `backend/src/routes/intuneDevice.routes.ts`

```ts
// multer config identical to inventory.routes.ts (memory storage, 10MB, xlsx/xls/csv filter)
router.post('/devices/rename/preview',      validateCsrfToken, requireDeviceManagementAccess(), validateRequest(RenamePreviewSchema), controller.previewRename);
router.post('/devices/rename/preview-file', validateCsrfToken, requireDeviceManagementAccess(), upload.single('file'), controller.previewRenameFile);
router.post('/actions/rename',              validateCsrfToken, requireDeviceManagementAccess(), validateRequest(RenameExecuteSchema), controller.executeRename);
```

Permission check ordering matches the existing `/inventory/import` route (CSRF first, then
group-auth `requireDeviceManagementAccess()`, before multer parses the body — the existing
codebase actually places the permission check before multer specifically to avoid unprivileged
uploads consuming memory; this feature follows that ordering too, but CSRF must run first
since it also reads the body/cookie before multer touches it — same order as existing routes).

### 5.6 Frontend service — `frontend/src/services/intuneService.ts`

```ts
previewRename: (items) => api.post(`${BASE}/devices/rename/preview`, { items }).then(r => r.data),
previewRenameFile: (file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return api.post(`${BASE}/devices/rename/preview-file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
},
executeRename: (items) => api.post(`${BASE}/actions/rename`, { items }).then(r => r.data),
```

### 5.7 Frontend UI — `IntuneDeviceActionsPage.tsx`

- Add a 6th tab: **"Rename Devices"**.
- Two sections inside the tab (Paper cards, matching existing visual style):
  1. **Single device** — serial number `TextField` + "Look Up" button → calls
     `previewRename` with one item → shows a single preview row with an editable
     "New Name" `TextField` (pre-filled with the proposed name) → "Rename" button.
  2. **Bulk upload** — file input (reuse the drag/drop pattern already established in
     `ImportInventoryDialog.tsx`, inlined rather than a dialog since this page doesn't use
     dialogs for its other tabs) → calls `previewRenameFile` → renders a `ResponsiveTable`
     of `RenamePreviewItem[]` with columns: Row, Serial, Current Name, New Name (editable
     inline), Status (chip: valid/issue text) → checkbox to exclude invalid/unwanted rows
     (same exclude-by-selection pattern already used in the "By Model" tab) → "Rename N
     Devices" button.
- Both sections funnel into a shared lightweight confirm step (simple `Alert`/button, not the
  full `DeviceActionConfirmDialog` — that component is reserved for High/Critical actions
  requiring typed confirmation; rename is `low` risk) then call `executeRename`.
- Results panel: reuse the existing shared `results`/`ResponsiveTable` block style (chips for
  succeeded/failed counts + a table of `RenameDeviceResult`).
- **Excluded from the generic dropdowns**: change
  `const ACTIONS = Object.keys(INTUNE_ACTION_LABELS) as IntuneAction[];` to filter out
  `'setDeviceName'` — otherwise it would appear as a selectable action in the "By Device
  Model" and "Scan / Search by Name" tabs' generic `ActionSelector`, where selecting it would
  fail (those flows don't collect a per-device name). One-line change; also automatically
  excludes it from the History tab's per-card re-run selector, which is correct since
  re-running a rename from history without new tag numbers doesn't make sense.

## 6. Implementation Steps

1. `shared/src/intune.types.ts` — extend `IntuneAction`/risk/labels, add new Rename* types
   and `INTUNE_RENAME_MAX_ROWS` (Phase 2 rebuild note: `shared` must be rebuilt before backend/
   frontend Docker builds pick up the new types — handled automatically by the Docker image
   build chain per `CLAUDE.md` Build Layout Constraints).
2. `backend/src/validators/intuneDevice.validators.ts` — add `'setDeviceName'` to the enum,
   add `RenamePreviewSchema`/`RenameExecuteSchema`.
3. `backend/src/services/intuneDevice.service.ts` — add helpers + 3 exported functions.
4. `backend/src/controllers/intuneDevice.controller.ts` — add 3 handlers.
5. `backend/src/routes/intuneDevice.routes.ts` — add multer config (mirroring
   `inventory.routes.ts`) + 3 routes.
6. `frontend/src/services/intuneService.ts` — add 3 client methods.
7. `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` — add "Rename Devices"
   tab (single + bulk sections, preview table, confirm, results) and the `ACTIONS` filter fix.

No Prisma schema or migration changes are required (audit log table already generic).

## 7. Dependencies

- `exceljs` (already a backend dependency, `^4.4.0`) — reused for the new parser, no version
  change.
- `csv-parse/sync` (already a backend dependency via `inventoryImport.service.ts`) — reused
  for CSV uploads.
- `multer` (already a backend dependency) — reused, same config shape as `inventory.routes.ts`.
- No new npm packages on either side.

## 8. Configuration Changes

- **Entra app registration**: add Microsoft Graph **Application permission**
  `DeviceManagementManagedDevices.PrivilegedOperations.All`, grant admin consent. **User-owned
  action, outside this repo** — required before the feature works at runtime; the Docker
  build gate (Phase 6) cannot verify this since it doesn't call live Graph.
- No env vars, no Prisma schema changes.

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Admin consent not yet granted when feature ships | Runtime calls return Graph `403`; service already maps unexpected Graph errors to a `502 GRAPH_ERROR` via existing `AppError` pattern (mirrors `getBitLockerKeys`'s explicit 403→503 handling for its own new-permission case) — surfaced as a clear error in the UI, not a silent failure. Documented as a known blocking prerequisite in the final summary. |
| Spreadsheet has malformed/duplicate serials | Preview step surfaces `not_enrolled`/`issue` per row before execution; user can deselect bad rows. Duplicate serials simply produce two preview rows resolving to the same device — both attempt rename (last one wins), no special-cased dedup added (Simplicity: not asked for, and harmless). |
| Large file (300+ rows) preview takes a while | Capped at `INTUNE_RENAME_MAX_ROWS = 300` server-side (validator rejects larger payloads with a clear message); concurrency-5 lookups keep worst-case preview time in the same ballpark as the existing reconciliation report (documented as "10–30s" in the UI already). |
| Accidentally renaming a hybrid-joined Windows device (unsupported by Graph) | Graph itself rejects the call; the per-row `catch` in `executeRenameDevices` records it as `status: 'failed'` with the Graph error message, not a silent no-op. |
| `setDeviceName` accidentally selectable in unrelated generic dropdowns | `ACTIONS` filter (see §5.7) explicitly excludes it from those dropdowns. |

## 10. Out of Scope

- Reassigning the primary user (separate roadmap item, not requested here).
- Any "rename to a random string" / Autopilot-profile name templates (Microsoft's own bulk
  rename feature supports `{{rand:x}}`) — not requested; only the explicit serial→tag mapping
  workflow is built.

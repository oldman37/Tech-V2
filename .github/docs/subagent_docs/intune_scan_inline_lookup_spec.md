# Spec: Intune Scan — Inline Per-Device Lookup

**Feature:** `intune_scan_inline_lookup`  
**Date:** 2026-06-15  
**Status:** Phase 1 — Specification

---

## 1. Current State

`IntuneScanWizardTab.tsx` implements a 4-step wizard:

| Step | Label | What happens |
|------|-------|--------------|
| 0 | Stage Devices | User scans/types device names; they accumulate as chips. No Intune query yet. |
| 1 | Look Up in Intune | User clicks button; **one bulk** `POST /intune/devices/search` call for all staged names. Shows spinner. |
| 2 | Choose Action | User selects an action; dry-run toggle. |
| 3 | Results | Per-device action outcomes. |

**Problem:** Between Step 0 and Step 1 there is a "black box" — the user cannot tell whether a scanned device is enrolled in Intune until the bulk lookup completes. If they scanned the wrong device name, or a device is not enrolled, they only find out after staging the entire batch.

---

## 2. Problem Definition

The user wants **immediate feedback per scan**: as each device name is entered, look it up in Intune right away and display the Intune status (enrolled, not enrolled, not found) inline in a list row. The user should never need to "click Look Up" — the lookup is automatic and continuous as they scan.

---

## 3. Proposed Solution

### 3.1 Merge Steps 0 and 1 into a single "Scan & Verify" step

New wizard steps (3 total, down from 4):

| Step | Label | What happens |
|------|-------|--------------|
| 0 | Scan & Verify | Scan/type a name → immediate Intune lookup → row appears in table below showing live status |
| 1 | Choose Action | Same as current Step 2 |
| 2 | Results | Same as current Step 3 |

### 3.2 Per-device lookup mechanics

- Each time the user commits a name (Enter / Tab / paste), call `intuneService.searchDevices({ deviceNames: [name] })` immediately.
- This reuses the existing `POST /intune/devices/search` endpoint — no backend change needed.
- The row appears instantly with a spinner while the Graph API call is in-flight.
- On response the row updates to one of three states:
  - **Enrolled** (green chip) — `device.enrollmentStatus === 'enrolled'`
  - **Not Enrolled** (grey chip) — device found in Intune but not enrolled
  - **Not Found** (red chip) — name returned in `notFound[]`
- Multiple scans can be in-flight concurrently; each updates its own row independently.

### 3.3 State shape

Replace `stagedNames: string[]` + `searchMutation` + `lookupResult` with:

```typescript
interface ScannedEntry {
  id:     string;              // unique key — name + '-' + timestamp
  name:   string;              // the input string
  status: 'pending' | 'found' | 'not_found';
  device?: IntuneDevicePreview;
}
const [scannedEntries, setScannedEntries] = useState<ScannedEntry[]>([]);
```

Derived values (no new state):
```typescript
const foundDevices  = scannedEntries.filter(e => e.status === 'found').map(e => e.device!);
const hasPending    = scannedEntries.some(e => e.status === 'pending');
const notFoundNames = scannedEntries.filter(e => e.status === 'not_found').map(e => e.name);
```

### 3.4 Deduplication

Skip adding a name that is already in `scannedEntries` (case-insensitive comparison).

### 3.5 "Next" / "Choose Action" gate

The "Choose Action" button is disabled while `hasPending || foundDevices.length === 0`.  
Show a helper note: "Waiting for X lookup(s)…" if `hasPending`.

### 3.6 Row table columns

| Scanned Name | Intune Status | Device Name (Intune) | Model | Serial | Asset Tag | Remove |
|---|---|---|---|---|---|---|

- While pending: spinner in Intune Status, other cells blank
- On found: status chip (Enrolled / Not Enrolled), then populate other cells from `IntuneDevicePreview`
- On not found: red "Not Found" chip, other cells "—"; row still removable

### 3.7 initialLookupResult (history tab)

When `initialLookupResult` is supplied (loaded from history), pre-populate `scannedEntries`:
- `initialLookupResult.devices` → status `'found'`
- `initialLookupResult.notFound` → status `'not_found'`
- Start at step 1 (Choose Action)

### 3.8 handleReset

Same as current but clears `scannedEntries` to `[]`, resets to step 0.

### 3.9 deviceListMutation input

`deviceListMutation` currently uses `lookupResult.devices`. Replace with `foundDevices` (derived above).

---

## 4. Implementation Steps

1. Define `ScannedEntry` interface inside the component file.
2. Replace `stagedNames` + `searchMutation` + `lookupResult` state with `scannedEntries`.
3. Write `addAndLookup(rawName: string)` async function — dedup check, append pending row, call service, update row.
4. Wire `addAndLookup` to `handleScanKeyDown`, `handleScanPaste`, and `addToStaging` (or inline directly).
5. Change `WIZARD_STEPS` to `['Scan & Verify', 'Choose Action', 'Results']` and all `activeStep` types/values from `0|1|2|3` to `0|1|2`.
6. Rebuild Step 0 UI: scan input at top + results table below.
7. Remove Step 1 panel (the old "Look Up in Intune" loading panel) entirely.
8. Renumber Step 2 → Step 1 (Choose Action) and Step 3 → Step 2 (Results).
9. Update `initialLookupResult` → pre-populate `scannedEntries`, start at step 1.
10. Update `handleReset` — clear `scannedEntries`.
11. Update `deviceListMutation` to reference `foundDevices`.
12. Update Confirm dialog `enrolledCount` / `modelName` to use `foundDevices.length`.

---

## 5. Dependencies

No new dependencies. No backend changes. No shared-types changes.

Only file changed: `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx`

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Graph API rate limiting if user scans fast | `searchDevicesByNames` already has `withRetry`; backend handles one name at a time (no batching concern) |
| Race condition: entry updated with result from wrong call | Each entry has a unique `id`; closure over `id` in the async handler guarantees the correct row is updated |
| User proceeds before a pending scan resolves | "Choose Action" button disabled while `hasPending`; helper text explains why |
| `initialLookupResult` compatibility | Explicitly convert to `ScannedEntry[]` on mount; jump to step 1 |

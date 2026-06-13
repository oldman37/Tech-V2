# Intune Dry Run / Test Mode — Feature Specification

**Feature:** Dry Run / Test Mode toggle for Intune Device Actions  
**Scope:** Frontend only — `IntuneDeviceActionsPage.tsx`, `IntuneScanWizardTab.tsx`, `DeviceActionConfirmDialog.tsx`  
**No backend changes.** No shared-types changes. No new API endpoints.

---

## 1. Current State Analysis

### IntuneDeviceActionsPage.tsx (Tab 0 — By Device Model)

**Component:** `IntuneDeviceActionsPage` (default export)

**Relevant state variables:**
```typescript
const [selectedAction,    setSelectedAction]    = useState<IntuneAction | ''>('');
const [keepUserData,      setKeepUserData]      = useState(false);
const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
const [results,           setResults]           = useState<BulkDeviceActionResponse | null>(null);
const [batchProgress,     setBatchProgress]     = useState<{ current: number; total: number } | null>(null);
```

**Device list for Tab 0:**
```typescript
const modelSearchDevices = modelSearchMutation.data?.devices ?? [];  // IntuneDevicePreview[]
const modelEnrolledCount = modelSearchDevices.length;
```

**Execution path:**
1. User clicks "Execute Action" in `ActionSelector` → `setConfirmDialogOpen(true)`
2. `DeviceActionConfirmDialog` opens
3. User confirms → `onConfirm={(confirmText) => modelActionMutation.mutate(confirmText)}`
4. `modelActionMutation.mutationFn` chunks enrolled device IDs and calls `intuneService.executeDeviceListAction(...)` in sequential batches
5. `mergeBatchResults()` aggregates → `setResults(data)`
6. Results rendered in a `<Paper>` block below the tabs

**Step 3 "Select Action" rendering location (Tab 0):**
```tsx
{modelEnrolledCount > 0 && (
  <Paper sx={{ p: 2, mb: 2 }}>
    <Typography variant="h6" gutterBottom>3. Select Action</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      The action will be applied to all {modelEnrolledCount} device...
    </Typography>
    <ActionSelector ... />
    {batchProgress && (...)}
    {modelActionMutation.isError && (...)}
  </Paper>
)}
```

**`ActionSelector` component (local, lines ~170-230):**  
Renders `<Select>` + optional "Keep user files" `<Switch>` + "Execute Action" `<Button>`.  
Props: `selectedAction`, `setSelectedAction`, `keepUserData`, `setKeepUserData`, `canExecute`, `isPending`, `onExecute`.

**Confirm dialog (Tab 0), at end of return:**
```tsx
{!!selectedAction && (
  <DeviceActionConfirmDialog
    open={confirmDialogOpen}
    action={selectedAction as IntuneAction}
    modelName={modelDisplayName}
    enrolledCount={modelEnrolledCount}
    keepUserData={keepUserData}
    onConfirm={(confirmText) => modelActionMutation.mutate(confirmText)}
    onCancel={() => setConfirmDialogOpen(false)}
    isLoading={modelActionMutation.isPending}
  />
)}
```

---

### IntuneScanWizardTab.tsx (Tab 1 — Scan/Search by Name)

**Component:** `IntuneScanWizardTab` (default export)

**Relevant state variables:**
```typescript
const [activeStep,       setActiveStep]       = useState<0 | 1 | 2 | 3>(initialLookupResult ? 2 : 0);
const [selectedAction,   setSelectedAction]   = useState<IntuneAction | ''>(initialAction ?? '');
const [keepUserData,     setKeepUserData]      = useState(false);
const [confirmDialogOpen,setConfirmDialogOpen] = useState(false);
const [actionResults,    setActionResults]     = useState<BulkDeviceActionResponse | null>(null);
```

**Device list for Tab 1:**
```typescript
const [lookupResult, setLookupResult] = useState<{
  devices:  IntuneDevicePreview[];
  notFound: string[];
} | null>(initialLookupResult ?? null);
// Enrolled devices = lookupResult.devices (all already enrolled — the search only returns enrolled)
```

**Execution path:**
1. User is on Step 2 ("Choose Action") → clicks "Execute Action" → `setConfirmDialogOpen(true)`
2. `DeviceActionConfirmDialog` opens
3. User confirms → `onConfirm={(confirmText) => deviceListMutation.mutate(confirmText)}`
4. `deviceListMutation.mutationFn` calls `intuneService.executeDeviceListAction(...)` once (no batching in Tab 1)
5. `onSuccess`: `saveToHistory(...)`, `setActionResults(data)`, `setActiveStep(3)`
6. Step 3 renders results table + "Start Over" button

**Step 2 "Choose Action" rendering location (Tab 1):**
```tsx
{activeStep === 2 && (
  <Paper sx={{ p: 2 }}>
    <Typography variant="h6" gutterBottom>Choose Action</Typography>
    <Alert severity="info" sx={{ mb: 2 }}>
      Ready to act on <strong>{lookupResult?.devices.length ?? 0} device(s)</strong>.
    </Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end" flexWrap="wrap" sx={{ mb: 2 }}>
      <Select .../>
      {selectedAction === 'cleanWindowsDevice' && <FormControlLabel .../>}
    </Stack>
    <Stack direction="row" spacing={1}>
      <Button variant="outlined" onClick={() => setActiveStep(1)}>Back</Button>
      <Button variant="contained" color="error" startIcon={<PlayArrowIcon />} disabled={!selectedAction} onClick={() => setConfirmDialogOpen(true)}>
        Execute Action
      </Button>
    </Stack>
    {deviceListMutation.isError && <Alert severity="error" .../>}
  </Paper>
)}
```

**Confirm dialog (Tab 1), at end of return:**
```tsx
{!!selectedAction && (
  <DeviceActionConfirmDialog
    open={confirmDialogOpen}
    action={selectedAction as IntuneAction}
    modelName={`${lookupResult?.devices.length ?? 0} scanned device(s)`}
    enrolledCount={lookupResult?.devices.length ?? 0}
    keepUserData={keepUserData}
    onConfirm={(confirmText) => deviceListMutation.mutate(confirmText)}
    onCancel={() => setConfirmDialogOpen(false)}
    isLoading={deviceListMutation.isPending}
  />
)}
```

**History save guard (Tab 1):**  
`saveToHistory(...)` is called inside `deviceListMutation.onSuccess`. Dry-run results MUST NOT be saved to history. Guard with `data.logId !== 'DRY_RUN'`.

---

### DeviceActionConfirmDialog.tsx

**Current props interface:**
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

The dialog body says: `"You are about to perform {label} on {enrolledCount} enrolled device(s) in model {modelName}."`  
Confirmation requirements are risk-based: low → no confirmation, medium → checkbox, high/critical → typed text.

---

## 2. Problem Definition

Users can accidentally execute destructive MDM actions (wipe, retire, decommission) during testing or setup. There is currently no safe "rehearsal" mode. A Dry Run / Test Mode toggle that:
1. Is ON by default (safe)
2. Intercepts execution and returns a synthetic result instead of calling the API
3. Makes the dry-run state visually unambiguous at every step

---

## 3. Proposed Solution Architecture

**Frontend-only change** — no new API calls, no schema changes.

The implementation intercepts execution at the `mutationFn` level in both `modelActionMutation` (Tab 0) and `deviceListMutation` (Tab 1). When `isDryRun` is `true`, the mutation function short-circuits immediately and returns a synthetic `BulkDeviceActionResponse` built from the already-loaded `IntuneDevicePreview[]` array.

The intercept point (inside `mutationFn`) is correct because:
- The confirm dialog still opens and must be dismissed first (user sees what they're about to do)
- All existing error-handling, batch-progress, and results-display code paths remain unchanged
- No mutation signature changes are needed — the synthetic result flows through the identical `onSuccess` path

---

## 4. State Additions

### 4.1 IntuneDeviceActionsPage.tsx — new state variable

**Add after the existing shared action state block** (after `const [results, setResults] = ...`):

```typescript
// ── Dry run / test mode ────────────────────────────────────────────────────
const [isDryRun, setIsDryRun] = useState(true); // default ON — safe
```

**Reset on tab change** — add `setIsDryRun(true)` inside the `<Tabs onChange>` handler so the toggle always starts ON when the user navigates away and back:

```typescript
// Current:
onChange={(_, v) => {
  if (v === 1 || v === 2) setHistoryEntries(loadHistory());
  setTab(v as 0 | 1 | 2);
  setResults(null);
}}

// After:
onChange={(_, v) => {
  if (v === 1 || v === 2) setHistoryEntries(loadHistory());
  setTab(v as 0 | 1 | 2);
  setResults(null);
  setIsDryRun(true); // reset to safe default on every tab switch
}}
```

### 4.2 IntuneScanWizardTab.tsx — new state variable

**Add after the `actionResults` state declaration** (after `const [actionResults, setActionResults] = ...`):

```typescript
// Dry run mode — default ON for safety; reset to true on every handleReset()
const [isDryRun, setIsDryRun] = useState(true);
```

**Reset on "Start Over"** — add `setIsDryRun(true)` to `handleReset()`:

```typescript
const handleReset = () => {
  setActiveStep(0);
  setScanInput('');
  setStagedNames([]);
  setLookupResult(null);
  setSelectedAction('');
  setKeepUserData(false);
  setConfirmDialogOpen(false);
  setActionResults(null);
  setIsDryRun(true); // ← add this
  searchMutation.reset();
  deviceListMutation.reset();
};
```

---

## 5. Helper Function: `buildDryRunResult`

Define this **once** in `IntuneScanWizardTab.tsx` at module scope (after the constants, before the `DeviceTable` component). Export it so `IntuneDeviceActionsPage.tsx` can import it.

```typescript
/**
 * Builds a synthetic BulkDeviceActionResponse for dry-run / test mode.
 * Every enrolled device → success; every not-enrolled device → not_enrolled.
 * The logId 'DRY_RUN' signals downstream rendering to show the DRY RUN banner.
 */
export function buildDryRunResult(
  devices: IntuneDevicePreview[],
  action: IntuneAction,
): BulkDeviceActionResponse {
  const results: DeviceActionResult[] = devices.map((d) => {
    const isEnrolled = d.enrollmentStatus === 'enrolled';
    return {
      serialNumber:      d.serialNumber,
      assetTag:          d.assetTag,
      intuneDeviceId:    d.intuneDeviceId,
      autopilotDeviceId: null,
      entraDeviceId:     null,
      status:            isEnrolled ? 'success' : 'not_enrolled',
      ...(action === 'fullDecommission' && isEnrolled
        ? {
            stepResults: {
              deleteDevice:    'success',
              removeAutopilot: 'success',
              removeEntra:     'success',
            },
          }
        : {}),
    };
  });

  const enrolled = results.filter((r) => r.status === 'success').length;

  return {
    action,
    modelId:     null,
    modelName:   null,
    total:       devices.length,
    succeeded:   enrolled,
    notEnrolled: devices.length - enrolled,
    failed:      0,
    partial:     0,
    results,
    logId:       'DRY_RUN',
  };
}
```

**Import in `IntuneDeviceActionsPage.tsx`** — update the existing import line:

```typescript
// Before:
import IntuneScanWizardTab, { type IntuneHistoryEntry, loadHistory } from './IntuneScanWizardTab';

// After:
import IntuneScanWizardTab, { type IntuneHistoryEntry, loadHistory, buildDryRunResult } from './IntuneScanWizardTab';
```

---

## 6. Mutation Function Modifications

### 6.1 Tab 0 — `modelActionMutation` in `IntuneDeviceActionsPage.tsx`

The `mutationFn` captures `isDryRun` from the component's render closure. TanStack Query v5 calls the latest version of `mutationFn` at mutation time, so the closure value will be current.

```typescript
const modelActionMutation = useMutation({
  mutationFn: async (confirmText?: string) => {
    // ── Dry run short-circuit ───────────────────────────────────────────────
    if (isDryRun) {
      return buildDryRunResult(modelSearchDevices, selectedAction as IntuneAction);
    }
    // ── Real execution (unchanged below) ──────────────────────────────────
    const ids = modelSearchDevices.map((d) => d.intuneDeviceId!).filter(Boolean);
    const groups = chunk(ids, INTUNE_DEVICE_ACTION_BATCH_SIZE);
    const responses: BulkDeviceActionResponse[] = [];
    for (let i = 0; i < groups.length; i++) {
      setBatchProgress({ current: i + 1, total: groups.length });
      const res = await intuneService.executeDeviceListAction({
        intuneDeviceIds: groups[i],
        action:          selectedAction as IntuneAction,
        confirm:         true,
        keepUserData:    selectedAction === 'cleanWindowsDevice' ? keepUserData : undefined,
        confirmText,
      });
      responses.push(res);
    }
    return mergeBatchResults(responses, selectedAction as IntuneAction);
  },
  onSuccess: (data) => {
    setResults(data);
    setConfirmDialogOpen(false);
    setBatchProgress(null);
  },
  onError: () => { setBatchProgress(null); },
});
```

### 6.2 Tab 1 — `deviceListMutation` in `IntuneScanWizardTab.tsx`

```typescript
const deviceListMutation = useMutation({
  mutationFn: (confirmText?: string) => {
    // ── Dry run short-circuit ───────────────────────────────────────────────
    if (isDryRun) {
      return Promise.resolve(
        buildDryRunResult(lookupResult!.devices, selectedAction as IntuneAction),
      );
    }
    // ── Real execution (unchanged below) ──────────────────────────────────
    return intuneService.executeDeviceListAction({
      intuneDeviceIds: lookupResult!.devices.map((d) => d.intuneDeviceId!),
      action:          selectedAction as IntuneAction,
      confirm:         true,
      keepUserData:    selectedAction === 'cleanWindowsDevice' ? keepUserData : undefined,
      confirmText,
    });
  },
  onSuccess: (data) => {
    if (lookupResult && data.logId !== 'DRY_RUN') {
      // Do NOT save dry-run results to history
      saveToHistory({
        id:          data.logId,
        timestamp:   new Date().toISOString(),
        action:      selectedAction as IntuneAction,
        actionLabel: INTUNE_ACTION_LABELS[selectedAction as IntuneAction],
        deviceCount: lookupResult.devices.length,
        succeeded:   data.succeeded,
        failed:      data.failed,
        partial:     data.partial,
        devices: lookupResult.devices.map((d) => ({
          intuneDeviceId:  d.intuneDeviceId ?? '',
          displayName:     d.displayName,
          serialNumber:    d.serialNumber,
          assetTag:        d.assetTag,
          operatingSystem: d.operatingSystem,
        })),
      });
      onActionComplete?.();
    }
    setActionResults(data);
    setConfirmDialogOpen(false);
    setActiveStep(3);
  },
});
```

---

## 7. Toggle UI Component (exact JSX to add in each location)

### 7.1 Toggle snippet (reused in both files)

```tsx
{/* Dry Run / Test Mode toggle */}
<Alert
  severity={isDryRun ? 'info' : 'warning'}
  sx={{ mb: 2 }}
  action={
    <FormControlLabel
      control={
        <Switch
          checked={isDryRun}
          onChange={(e) => setIsDryRun(e.target.checked)}
          size="small"
          color={isDryRun ? 'primary' : 'warning'}
        />
      }
      label={
        <Typography variant="body2" fontWeight={600}>
          {isDryRun ? 'Test Mode ON' : 'Test Mode OFF'}
        </Typography>
      }
      labelPlacement="start"
      sx={{ mr: 0, ml: 0 }}
    />
  }
>
  {isDryRun
    ? 'Test Mode is ON — No actions will be performed'
    : 'Test Mode is OFF — Actions WILL be performed on real devices'}
</Alert>
```

### 7.2 Exact placement — Tab 0 (`IntuneDeviceActionsPage.tsx`, Step 3 Paper)

Insert the toggle **after the `<Typography>` description and before the `<ActionSelector>`**:

```tsx
{modelEnrolledCount > 0 && (
  <Paper sx={{ p: 2, mb: 2 }}>
    <Typography variant="h6" gutterBottom>3. Select Action</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      The action will be applied to all {modelEnrolledCount} device
      {modelEnrolledCount !== 1 ? 's' : ''}, processed in batches of{' '}
      {INTUNE_DEVICE_ACTION_BATCH_SIZE}.
    </Typography>

    {/* ← INSERT DRY RUN TOGGLE HERE (before ActionSelector) */}
    <Alert severity={isDryRun ? 'info' : 'warning'} sx={{ mb: 2 }} action={...}>
      ...
    </Alert>

    <ActionSelector
      selectedAction={selectedAction}
      setSelectedAction={setSelectedAction}
      keepUserData={keepUserData}
      setKeepUserData={setKeepUserData}
      canExecute={canExecuteModel}
      isPending={modelActionMutation.isPending}
      onExecute={() => setConfirmDialogOpen(true)}
    />
    ...
  </Paper>
)}
```

### 7.3 Exact placement — Tab 1 (`IntuneScanWizardTab.tsx`, Step 2 Paper)

Insert the toggle **after the "Ready to act on N device(s)" Alert and before the action-selector Stack**:

```tsx
{activeStep === 2 && (
  <Paper sx={{ p: 2 }}>
    <Typography variant="h6" gutterBottom>Choose Action</Typography>

    <Alert severity="info" sx={{ mb: 2 }}>
      Ready to act on <strong>{lookupResult?.devices.length ?? 0} device(s)</strong>.
    </Alert>

    {/* ← INSERT DRY RUN TOGGLE HERE */}
    <Alert severity={isDryRun ? 'info' : 'warning'} sx={{ mb: 2 }} action={...}>
      ...
    </Alert>

    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end" flexWrap="wrap" sx={{ mb: 2 }}>
      <Select ... />
      {selectedAction === 'cleanWindowsDevice' && <FormControlLabel .../>}
    </Stack>

    <Stack direction="row" spacing={1}>
      <Button variant="outlined" onClick={() => setActiveStep(1)}>Back</Button>
      <Button
        variant="contained"
        color="error"
        startIcon={<PlayArrowIcon />}
        disabled={!selectedAction}
        onClick={() => setConfirmDialogOpen(true)}
      >
        Execute Action
      </Button>
    </Stack>
    ...
  </Paper>
)}
```

---

## 8. DeviceActionConfirmDialog — DRY RUN note

### 8.1 Prop addition

Add `isDryRun?: boolean` to the interface:

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
  isDryRun?: boolean;           // ← new
}
```

Add to destructured props:
```typescript
export default function DeviceActionConfirmDialog({
  open,
  action,
  modelName,
  enrolledCount,
  keepUserData,
  onConfirm,
  onCancel,
  isLoading = false,
  isDryRun = false,             // ← new
}: DeviceActionConfirmDialogProps) {
```

### 8.2 DRY RUN note in dialog body

Insert **at the top of `<DialogContent>`**, before all existing content:

```tsx
<DialogContent dividers>
  {isDryRun && (
    <Alert severity="info" sx={{ mb: 2 }}>
      <strong>DRY RUN</strong> — No actions will be performed. This is a simulation only.
      Toggle "Test Mode" OFF to execute for real.
    </Alert>
  )}

  <Typography variant="body1" gutterBottom>
    You are about to perform <strong>{label}</strong> on{' '}
    {/* ... existing content unchanged ... */}
  </Typography>
  {/* ... rest of existing content unchanged ... */}
</DialogContent>
```

### 8.3 Pass `isDryRun` prop from callers

**Tab 0 (`IntuneDeviceActionsPage.tsx`):**
```tsx
<DeviceActionConfirmDialog
  open={confirmDialogOpen}
  action={selectedAction as IntuneAction}
  modelName={modelDisplayName}
  enrolledCount={modelEnrolledCount}
  keepUserData={keepUserData}
  onConfirm={(confirmText) => modelActionMutation.mutate(confirmText)}
  onCancel={() => setConfirmDialogOpen(false)}
  isLoading={modelActionMutation.isPending}
  isDryRun={isDryRun}           {/* ← add */}
/>
```

**Tab 1 (`IntuneScanWizardTab.tsx`):**
```tsx
<DeviceActionConfirmDialog
  open={confirmDialogOpen}
  action={selectedAction as IntuneAction}
  modelName={`${lookupResult?.devices.length ?? 0} scanned device(s)`}
  enrolledCount={lookupResult?.devices.length ?? 0}
  keepUserData={keepUserData}
  onConfirm={(confirmText) => deviceListMutation.mutate(confirmText)}
  onCancel={() => setConfirmDialogOpen(false)}
  isLoading={deviceListMutation.isPending}
  isDryRun={isDryRun}           {/* ← add */}
/>
```

---

## 9. Results — DRY RUN Banner

### 9.1 Tab 0 results (`IntuneDeviceActionsPage.tsx`)

The results paper is currently:
```tsx
{results && (
  <Paper sx={{ p: 2 }}>
    <Typography variant="h6" gutterBottom>Results</Typography>
    <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} flexWrap="wrap">
      ...chips...
    </Stack>
    ...
```

Insert **after `<Typography variant="h6">Results</Typography>`** and before the chips Stack:
```tsx
{results?.logId === 'DRY_RUN' && (
  <Alert severity="info" sx={{ mb: 2 }}>
    <strong>DRY RUN — No actions were performed.</strong> These are simulated results based
    on current enrollment status. Toggle "Test Mode" OFF and re-execute to apply for real.
  </Alert>
)}
```

### 9.2 Tab 1 results (Step 3 in `IntuneScanWizardTab.tsx`)

The Step 3 results paper is:
```tsx
{activeStep === 3 && actionResults && (
  <Paper sx={{ p: 2 }}>
    <Alert severity="success" sx={{ mb: 2 }}>
      Completed: <strong>{INTUNE_ACTION_LABELS[selectedAction as IntuneAction]}</strong>
    </Alert>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      Audit log ID: {actionResults.logId}
    </Typography>
    ...
```

Replace the existing `<Alert severity="success">` with a conditional block:
```tsx
{activeStep === 3 && actionResults && (
  <Paper sx={{ p: 2 }}>
    {actionResults.logId === 'DRY_RUN' ? (
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>DRY RUN — No actions were performed.</strong> These are simulated results
        based on current enrollment status. Toggle "Test Mode" OFF and re-execute to apply for real.
      </Alert>
    ) : (
      <Alert severity="success" sx={{ mb: 2 }}>
        Completed:{' '}
        <strong>{INTUNE_ACTION_LABELS[selectedAction as IntuneAction]}</strong>
      </Alert>
    )}
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      Audit log ID: {actionResults.logId}
    </Typography>
    ...
```

---

## 10. MUI Components Reference

All components used are already imported in both files. Verify presence before implementation:

| Component        | Already imported in Actions page? | Already imported in Wizard? | Already imported in Dialog? |
|-----------------|-----------------------------------|-----------------------------|------------------------------|
| `Alert`         | ✅ yes                            | ✅ yes                       | ❌ needs adding              |
| `Switch`        | ✅ yes                            | ✅ yes                       | —                            |
| `FormControlLabel` | ✅ yes                         | ✅ yes                       | ✅ yes                       |
| `Typography`    | ✅ yes                            | ✅ yes                       | ✅ yes                       |

**`DeviceActionConfirmDialog.tsx` needs `Alert` added to its MUI import block.**

---

## 11. Implementation Steps (ordered)

1. **`IntuneScanWizardTab.tsx`**
   - Add `buildDryRunResult` helper at module scope (after constants, before `DeviceTable`)
   - Export it: `export function buildDryRunResult(...)`
   - Add `isDryRun` state variable (after `actionResults`)
   - Add `setIsDryRun(true)` to `handleReset()`
   - Modify `deviceListMutation.mutationFn` (add dry-run short-circuit at top)
   - Add `data.logId !== 'DRY_RUN'` guard around `saveToHistory(...)` + `onActionComplete?.()` in `onSuccess`
   - Add dry-run toggle JSX in Step 2 paper (after the "Ready to act" Alert)
   - Replace the Step 3 `<Alert severity="success">` with conditional success/dry-run banner
   - Add `isDryRun={isDryRun}` prop to `<DeviceActionConfirmDialog>` at wizard bottom
   - Add `Alert` to MUI import if not present (it already is)

2. **`IntuneDeviceActionsPage.tsx`**
   - Update import line to include `buildDryRunResult`
   - Add `isDryRun` state variable (after `results`)
   - Add `setIsDryRun(true)` to the `<Tabs onChange>` handler
   - Modify `modelActionMutation.mutationFn` (add dry-run short-circuit at top)
   - Add dry-run toggle JSX in Tab 0 Step 3 paper (after the description, before `<ActionSelector>`)
   - Add dry-run banner in the results paper (after `<Typography>Results</Typography>`)
   - Add `isDryRun={isDryRun}` prop to `<DeviceActionConfirmDialog>` at page bottom

3. **`DeviceActionConfirmDialog.tsx`**
   - Add `Alert` to MUI import
   - Add `isDryRun?: boolean` to `DeviceActionConfirmDialogProps`
   - Add `isDryRun = false` to destructured props
   - Add `{isDryRun && <Alert>...}` at the top of `<DialogContent>` (before existing content)

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `isDryRun` closure stale in `mutationFn` | TanStack Query v5 stores the latest `mutationFn` ref internally; state will be current at call time. If issues arise, use `useRef` mirroring the state. |
| Dry-run result saved to history | Guarded by `data.logId !== 'DRY_RUN'` check in `onSuccess` |
| User confused by `logId: 'DRY_RUN'` in results table | The results table shows "Audit log ID: DRY_RUN" which is clearly synthetic; the banner reinforces it |
| `buildDryRunResult` not handling all `DeviceActionResult` fields | All required fields are supplied; optional `stepResults` is added for `fullDecommission` only; `error` is absent (omitted = no error, correct) |
| Toggle persists across model searches within same Tab 0 session | Acceptable — user explicitly set the toggle; it only resets when navigating between tabs or on page load |
| MUI `Alert` `action` prop may cause awkward layout on mobile | `Alert` with `action` is standard MUI pattern; tested acceptable on mobile in existing codebase uses |

---

## 13. Files to Modify (Phase 2 will edit exactly these)

1. `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx`
2. `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx`
3. `frontend/src/components/DeviceActionConfirmDialog.tsx`

No other files require changes.

---

## 14. Build Validation Command

```powershell
# Phase 6 — frontend image build only (this feature touches only frontend files)
docker compose -f docker-compose.dev.yml build frontend
```

The backend image does not need rebuilding (no backend changes).

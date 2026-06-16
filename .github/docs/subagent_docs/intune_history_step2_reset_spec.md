# Spec: History Action — Clear Preloaded State After Action Completes

**Feature:** `intune_history_step2_reset`
**Date:** 2026-06-15

---

## Problem

When a user clicks "Run on these devices" from the History tab, `handleLoadFromHistory`
in `IntuneDeviceActionsPage` sets `preloadedDevices` and `preloadedAction` in parent
state and bumps `reloadKey`. This mounts `IntuneScanWizardTab` at step 1 (Choose Action)
with the devices and action pre-selected.

After the action completes the wizard shows Results (step 2). However, `preloadedDevices`
and `preloadedAction` are **never cleared** from parent state. If the user navigates away
from Tab 1 (Scan / Search by Name) and back, the wizard remounts with the stale
`initialLookupResult` / `initialAction` and starts at Choose Action again instead of
presenting a fresh Scan & Verify step.

## Solution

In the `onActionComplete` callback prop passed to `<IntuneScanWizardTab>`, clear both
`preloadedDevices` (→ `null`) and `preloadedAction` (→ `undefined`).

The currently-mounted wizard continues to show Results without interruption because
`reloadKey` is not changed. Only the **next** mount (after the user navigates away) will
receive `initialLookupResult = undefined` and start fresh at step 0 (Scan & Verify).

## Implementation

Single change in `IntuneDeviceActionsPage.tsx`:

```tsx
onActionComplete={() => {
  setHistoryEntries(loadHistory());
  setHistoryActions({});
  setPreloadedDevices(null);      // ADD
  setPreloadedAction(undefined);  // ADD
}}
```

## Files

- `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` only
  — no backend, no shared types, no new dependencies

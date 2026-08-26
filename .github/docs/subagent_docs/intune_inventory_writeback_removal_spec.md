# Spec: "Delete from Intune" silently disposes the linked inventory item

## Current state analysis
`backend/src/services/intuneDevice.service.ts`:
- `writeInventoryDisposals(results, action, logId)` (line 489) marks matching `equipment`
  rows `isDisposed: true, status: 'disposed'` with
  `disposedReason: "Decommissioned via Intune — IntuneActionLog/<id>"`.
- Its guard (line 494) is `if (action !== 'fullDecommission' && action !== 'deleteDevice')
  return;` — so **both** actions trigger the write-back.
- Called non-fatally via `.catch()` from all three entry points: `executeBulkAction`
  (line 745), `executeSingleAction` (line 863), `executeDeviceListAction` (line 1205).
  All three call it unconditionally; the branching lives inside the helper.

What each action actually does, read from source rather than inferred from naming:
- `deleteDevice` (line 276): a single `DELETE /deviceManagement/managedDevices/{id}` —
  removes one Intune enrollment record. Nothing else.
- `fullDecommission` (line 330): delegates to `executeFullDecommission`, which removes the
  Intune managed-device record, the Autopilot identity, and the Entra device object.

Frontend: `frontend/src/components/DeviceActionConfirmDialog.tsx` shows "Equipment marked
as disposed in inventory" (line 146) inside a block gated on `action === 'fullDecommission'`
(line 118). There is no inventory warning on the `deleteDevice` confirmation.

Reverse coupling: `grep` for `graph|Graph|intune|Intune` in
`backend/src/services/inventory.service.ts` returns nothing — the inventory module never
calls out to Intune. The coupling is strictly one-directional.

## Problem definition
Running "Delete from Intune" silently disposes the matching inventory record — a side
effect the action does not imply and the confirmation dialog does not warn about. Users
reported laptops disappearing from inventory.

For `fullDecommission` the write-back is correct and deliberate (added 2026-06-13); it is
part of what "retire this asset for good" means, and the dialog says so explicitly.

## Proposed solution architecture
Narrow the guard to `fullDecommission` only, and collapse the now-single-branch
`isSuccessful` check. Call sites are not touched — the branching already lives in the
helper. `fullDecommission` behaviour, including the `partial` +
`stepResults.deleteDevice === 'success'` case, must be identical before and after.

## Implementation steps
1. Change the guard to `if (action !== 'fullDecommission') return;`. -> verify: `deleteDevice`
   no longer reaches any `equipment.updateMany`.
2. Simplify `isSuccessful` to the unconditional fullDecommission expression. -> verify: the
   partial-success condition is preserved verbatim.
3. Update the section comment to record the scoping rule and why. -> verify: present in diff.
4. Backend image build. -> verify: exits 0.

Not changed: all three call sites; `DeviceActionConfirmDialog.tsx` (its warning is still
accurate, shown only for `fullDecommission`); `IntuneActionLog` writes; every other action
(`retire`, `wipe`, `cleanWindowsDevice`, `removeAutopilot`, `removeEntra`, `syncDevice`,
`rebootNow`) — none ever wrote to inventory.

## Dependencies
None. No schema change — `isDisposed`/`disposedDate`/`disposedReason`/`status` are untouched
and still used by the inventory page's own dispose/permanent-delete flow.

## Configuration changes
None. No new env var, MSAL scope, or Graph permission.

## Risks and mitigations
- Risk: over-correcting and also stripping `fullDecommission`'s write-back. Mitigation:
  diff must show `fullDecommission`'s success predicate preserved exactly.
- **Known, accepted gap:** equipment rows already disposed by `deleteDevice` runs *before*
  this fix are NOT reverted. Restoring them (via `IntuneActionLog` rows where
  `action = 'deleteDevice'` cross-referenced against
  `equipment.disposedReason LIKE 'Decommissioned via Intune%'`) is separate data-correction
  work the user must request explicitly.

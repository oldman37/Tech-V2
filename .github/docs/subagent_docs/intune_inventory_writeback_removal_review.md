# Review: Intune inventory write-back scoping

## Files reviewed
- `backend/src/services/intuneDevice.service.ts` (11 insertions, 11 deletions, entirely
  inside/above `writeInventoryDisposals`)

## Findings
- **Spec compliance**: guard is now `if (action !== 'fullDecommission') return;`.
  `deleteDevice` can no longer reach either `prisma.equipment.updateMany` call.
- **`fullDecommission` unchanged**: its success predicate is preserved verbatim —
  `r.status === 'success' || (r.status === 'partial' && r.stepResults?.deleteDevice ===
  'success')`. Behaviour is identical before and after, including the partial-success case.
- **Call sites untouched**: all three (`executeBulkAction` :745, `executeSingleAction` :863,
  `executeDeviceListAction` :1205) still call the helper unconditionally, matching the
  existing pattern. No restructuring was needed once the guard itself was corrected.
- **Frontend untouched and still accurate**: `DeviceActionConfirmDialog.tsx`'s "Equipment
  marked as disposed in inventory" line sits inside an `action === 'fullDecommission'`
  block, so it correctly describes post-fix behaviour. Zero net diff on that file.
- **Reverse coupling confirmed absent**: `inventory.service.ts` contains no
  Graph/Intune reference — the inventory module's own dispose/delete never calls Intune.
  Reported rather than "fixed", as it is not a defect.
- **Security**: narrows a destructive side effect; no auth, CSRF, or response-shape change.
  No Entra group IDs or raw Graph payloads introduced.
- **Performance**: strictly fewer database writes.

## Build & test validation
`powershell -File scripts/preflight.ps1` -> **EXIT=0**
- 1/3 backend image build (shared tsc -> prisma generate -> backend tsc): pass
- 2/3 frontend image build (tsc + vite build): pass
- 3/3 backend integration tests: **Test Files 9 passed (9) / Tests 67 passed (67)**,
  including `inventory-permanent-delete.test.ts` — confirming the legitimate
  dispose/permanent-delete path is untouched.
- `All preflight checks passed.`

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS

## Known, accepted gap
Equipment rows already marked `isDisposed: true` by `deleteDevice` runs *before* this fix
are **not** reverted. This stops the incorrect behaviour going forward only. Restoring
historical rows is separate data-correction work requiring explicit user request.

## Not independently verified
A live click-through running "Delete from Intune" vs. "Full Decommission" against a real
Intune tenant and observing the inventory row. Build/test validation confirms the guard
logic and compilation, not an end-to-end Graph-connected run.

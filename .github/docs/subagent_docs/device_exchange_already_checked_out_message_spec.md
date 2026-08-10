# Spec: Surface "already checked out" errors on the Device Exchange checkout step

## Current State Analysis

The user asked to audit every device-checkout entry point in Device Management and confirm
each one properly tells the tech when a device is already checked out to someone else.

Checkout entry points identified and their handling of a 409 `DEVICE_CHECKED_OUT` /
`Device already has an active checkout` response:

| Page / Component | Flow | Already-checked-out handling |
|---|---|---|
| `frontend/src/pages/DeviceManagement/CheckoutScanPage.tsx` | Single-device scan → checkout or check-in | ✅ Proactive — scan result shows "Currently assigned to: X since Y" and routes to `CheckinForm` instead of `CheckoutForm` whenever `scanResult.activeAssignment` is set. The checkout form is unreachable for an already-checked-out device. |
| `frontend/src/components/DeviceManagement/CheckoutForm.tsx` | Checkout submission (used by `CheckoutScanPage`) | ✅ Reactive — catches the 409 and renders `err.response.data.message` in an `Alert`. |
| `frontend/src/pages/DeviceManagement/BulkCheckoutPage.tsx` | Multi-device checkout to one user | ✅ Proactive — scans the device first; if `scanResult.activeAssignment` exists it sets `scanError` to `Device X is already checked out to Y` before attempting checkout. Also has a reactive fallback that surfaces the backend `message` on any checkout failure. |
| `frontend/src/pages/DeviceManagement/QuickCheckPage.tsx` | Scan → checkout or check-in (single flow, mode toggle) | ✅ Proactive — in checkout mode, renders a red `Alert` "Device X is already checked out to Y" and hides the Check Out button whenever `scanResultData.activeAssignment` is set. |
| `frontend/src/pages/DeviceManagement/CartAssignmentWizardPage.tsx` (Step 2 "Add Devices") | Scan devices into a checkout cart | ✅ Reactive — `scanMutation.onError` renders `err.message`. As of commit `2978a5e` (`fix(frontend): surface backend error messages instead of generic text`), the shared `api.ts` response interceptor rewrites `err.message` to the backend's real message body (e.g. "Device is currently checked out") before it reaches any `.catch`/`onError`, so this now works correctly. |
| `frontend/src/pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx` ("Check Out Replacement Device" panel, part of the Damage Incident wizard) | Check in a broken device + check out a replacement in one transaction (`deviceExchangeService.exchange`) | ❌ **Gap** — `exchangeMutation.onError` is hard-coded to always render the same generic string regardless of cause: `"Device exchange failed. The incident record is saved — please complete check-in/out manually if needed."` It never reads the response body, so when the backend rejects the replacement device because it's already checked out to someone else (`deviceAssignment.service.ts` / `damageIncident.service.ts:550` → `AppError('Device already has an active checkout', 409, 'CONFLICT')`), the tech only sees the generic sentence and has no idea *why* it failed or that they need to pick a different device. |
| `frontend/src/pages/DeviceManagement/RoomCheckoutPage.tsx` | Bulk-assign inventory items to a room | N/A — this is a location/room reassignment tool, not a user checkout; there is no "already checked out to a user" concept here. |

## Problem Definition

`WizardStep4DeviceExchange.tsx` is the one checkout surface in Device Management that
suppresses the backend's actual error message. A tech picking a replacement device that
turns out to already be checked out to another student/staff member gets a generic,
uninformative failure message instead of being told the device is unavailable.

## Proposed Solution

Match the existing, established per-file pattern already used by sibling components in
`frontend/src/components/DeviceManagement/` (e.g. `EditAssignmentDialog.tsx`,
`AssignChargerDialog.tsx`, `QuickFixDialog.tsx`, `EditCartDialog.tsx`,
`ReturnCartItemDialog.tsx`) — a small local `getApiErrorMessage(error): string | undefined`
helper that reads `error.response.data.message`, with the existing generic sentence kept
as the fallback (it still adds real value: it clarifies the incident record was saved even
though the exchange step failed).

No new dependencies, no shared/exported utility (consistent with the existing
copy-per-file convention already used four times over in this same directory), no backend
changes — the backend already returns the correct message and status code.

## Implementation Steps

1. In `frontend/src/pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx`, add the
   same `getApiErrorMessage` helper used elsewhere in `DeviceManagement/`.
2. Change `exchangeMutation`'s `onError` handler from `onError: () => { setApiError('...') }`
   to `onError: (err) => { setApiError(getApiErrorMessage(err) ?? '<original generic text>'); }`.
3. No other files require changes — every other checkout surface already surfaces the
   backend message (either proactively via a pre-checkout scan, or reactively via
   `err.response.data.message` / the now-fixed `err.message`).

## Dependencies

None — no new packages, no version-sensitive API usage. Pure frontend error-handling change
using the existing Axios error shape already relied on throughout this codebase.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Losing the "incident record is saved" context that the current generic message
  conveys. **Mitigation:** Keep it as the fallback string when the backend doesn't provide a
  `message` (network failure, unparseable body) — same behavior other components use for
  their own generic fallback text.
- **Risk:** Scope creep into unrelated files. **Mitigation:** Every other checkout page was
  verified during Phase 1 research and already handles this correctly; only
  `WizardStep4DeviceExchange.tsx` is touched.

## Build/Test Commands Approved for Phase 3

- `docker compose -f docker-compose.dev.yml build frontend` (this is a frontend-only,
  UI-only change — per CLAUDE.md, dependency/documentation verification is not required,
  and no backend build is needed since no backend files change).

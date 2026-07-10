# Block checkout of a device with an open repair ticket

Status: APPROVED — proceeding to implementation

## Problem

A tech can scan a device's barcode/asset tag and check it out to a student/staff member even while that device has an open `RepairTicket` (`status: 'sent_to_vendor'`, i.e. sent to the vendor and never marked returned). `deviceAssignment.service.ts::checkout` fetches `equipment.status` but never validates it (confirmed — `status: true` is selected at line 125 but no guard exists). Devices in this state don't appear in the two *searched* checkout flows (`DeviceSearchPanel.tsx`, `WizardStep4DeviceExchange.tsx` — both filter `status: 'active'`), but they are fully selectable via the two *scan*-based flows (`CheckoutScanPage.tsx` → `CheckoutForm.tsx`, and `BulkCheckoutPage.tsx`'s inlined scan+checkout), since scanning bypasses any status filter.

## Requested behavior (user's 3 steps)

1. At checkout time, check whether the scanned device has an open repair ticket (sent to vendor, not yet returned).
2. If it's already been marked returned (or never had one), proceed to checkout normally.
3. If it's still `sent_to_vendor`, block checkout and show a dialog requiring the tech to mark it returned (which also updates the linked `DamageIncident`) before continuing.

Confirmed with user: apply this to **both** scan-based checkout flows (single-device scan page and bulk-checkout page), not just the primary one.

## Design

### Lookup
No existing helper returns "the active repair ticket for an equipmentId" — reuse the existing list endpoint: `GET /repair-tickets?equipmentId=X&status=sent_to_vendor&limit=1` (`repairTicketService.getAll`), which already supports both filters (`ListRepairTicketsQuerySchema`).

### Resolving ("mark returned")
No new plumbing needed for the "update the linked incident" part of the request — `repairTicketService.updateStatus(ticketId, { status: 'returned' })` already:
- only requires `status` (all other fields optional, confirmed in `UpdateRepairStatusSchema`),
- flips `Equipment.status` back to `'active'` server-side (`repairTicket.service.ts` line 142),
- and — from the earlier incident-workflow fix — already auto-advances/closes the linked `DamageIncident.workflowStep` as a transactional side effect when no other active ticket remains for that equipment (`repairTicket.service.ts` lines 152–187).

So the new dialog only needs to call the existing `updateStatus` mutation with no extra fields; everything the user asked for ("update the incident tied to that device") already happens automatically.

### New shared component
`frontend/src/components/DeviceManagement/DeviceOutForRepairDialog.tsx` — modeled on `DeviceActionConfirmDialog.tsx`'s warning-dialog structure (not `CreateInvoiceDialog.tsx`'s form structure, since no form fields are required). Props: `open`, `equipmentLabel` (asset tag / name for the message), `repairTicket: { id, ticketNumber }`, `onResolved: () => void`, `onCancel: () => void`. Single "Mark Returned & Continue" button runs the `updateStatus` mutation; on success calls `onResolved()`.

### Wiring — single-device scan page
`CheckoutScanPage.tsx`: once `scanResult` loads with no `activeAssignment`, query for an active ticket (`enabled: !!scanResult && !scanResult.activeAssignment`). If found, render `DeviceOutForRepairDialog` in place of `CheckoutForm`; `onResolved` clears the ticket-query cache entry and falls through to `CheckoutForm`; `onCancel` behaves like the existing "Cancel" (`setScanResult(null)`).

### Wiring — bulk checkout page
`BulkCheckoutPage.tsx::handleBarcodeScan`: after the existing `scanResult.activeAssignment` check and before calling `checkout()`, look up the active ticket for `scanResult.equipment.id`. If found, stash the pending scan in state, open `DeviceOutForRepairDialog`, and return without checking out. On `onResolved`, resume and complete the checkout for that same device with the same already-collected `selectedUser`/`checkoutCondition`/`locationId`. On `onCancel`, clear pending state and let the tech rescan.

**Adjacent one-line bug fix (directly relevant to this change):** `BulkCheckoutPage.tsx`'s catch block reads `err.response.data.error` (the machine error *code*, e.g. `"CONFLICT"`) into the displayed message instead of `err.response.data.message` (the human-readable text) — confirmed against `errorHandler.ts`'s response shape (`{ error: code, code, message }`). This pre-existing bug would make the new backend guard's message (and the existing "already checked out" conflict) display as the literal string `"CONFLICT"` instead of a useful sentence. Fixing it to read `.message` first is a one-line, low-risk fix required for the new error case (and the existing one) to actually read correctly in this flow.

### Backend defense-in-depth
Frontend checks are convenience only — the actual rule must be enforced server-side too, per project conventions (business rules always enforced backend-side; frontend is display convenience). Add the same guard to both places that create a `DeviceAssignment`:
- `deviceAssignment.service.ts::checkout` (the path both UI flows above call).
- `damageIncident.service.ts`'s inlined "checkout replacement device" block inside `deviceExchange` (already indirectly protected today because its device search filters to `status: 'active'`, but the backend itself has the identical unguarded gap, so add it there too for consistency/defense-in-depth).

Guard (in both places, after the existing `isDisposed` check):
```ts
const activeRepairTicket = await tx.repairTicket.findFirst({
  where:  { equipmentId: <id>, status: 'sent_to_vendor' },
  select: { id: true, ticketNumber: true },
});
if (activeRepairTicket) {
  throw new ConflictError(
    `This device is still out for repair (ticket ${activeRepairTicket.ticketNumber}) and must be marked returned before it can be checked out.`,
    { code: 'DEVICE_IN_REPAIR', repairTicketId: activeRepairTicket.id, ticketNumber: activeRepairTicket.ticketNumber },
  );
}
```
Uses the existing `ConflictError` class (already imported pattern elsewhere, e.g. `deviceCart.service.ts`) rather than the generic `AppError(...,409,'CONFLICT')` calls already in these functions, so the response carries structured `meta` — consistent with how other conflict cases in the codebase that want machine-readable detail already do it.

## Files to change
- `backend/src/services/deviceAssignment.service.ts` — add guard in `checkout`.
- `backend/src/services/damageIncident.service.ts` — add matching guard in `deviceExchange`'s checkout block.
- `frontend/src/components/DeviceManagement/DeviceOutForRepairDialog.tsx` — new shared dialog.
- `frontend/src/pages/DeviceManagement/CheckoutScanPage.tsx` — wire in the pre-check + dialog.
- `frontend/src/pages/DeviceManagement/BulkCheckoutPage.tsx` — wire in the pre-check + dialog, fix the `.error`/`.message` read bug.

**Post-ship correction:** live testing surfaced a fourth checkout entry point missed in the original research/spec — `frontend/src/pages/DeviceManagement/QuickCheckPage.tsx`, a combined checkin/checkout single-scan page with its own inline `checkoutMutation`. Confirmed via `grep` for every frontend caller of `deviceAssignmentService.checkout` that this was the only remaining gap (`BulkCheckinPage.tsx` also matched the grep but is checkin-only, calls `scan`/`checkin` never `checkout`). Same pre-check + `DeviceOutForRepairDialog` wiring added there, gated on `mode === 'checkout'`.

## Risk
Low. No schema/migration changes. Reuses existing, already-tested `updateStatus` endpoint and its existing incident side-effects. Backend guard only tightens an existing, already-fetched-but-unchecked field.

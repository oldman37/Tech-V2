# Spec: Recreate three upstream bug fixes (4 sub-fixes)

## Source

Three fix write-ups supplied by the user, each documenting a bug found and
fixed in a separate local test copy of this app, with a "recreate upstream"
prompt aimed at this repo:

1. `Bug_work-order-badge-missed-autoassign-notification.md`
2. `Bug_inventory-permanent-delete-cascade-dialog.md`
3. `Bug_incident-wizard-checkout-return-and-search-autofocus.md` (two
   independent sub-fixes)

This spec covers all four sub-fixes together since they were reviewed and
implemented in one pass; each is independently scoped and touches disjoint
files, so they'll ship as separate commits (Phase 7).

## Current-state verification (Phase 1 recon)

Read directly against this repo before writing this spec — all four bugs are
confirmed present exactly as described:

- `backend/src/services/requestBadges.service.ts` `countWorkOrders()`
  (lines 70-113): `ownTickets` query selects only `{ id, assignedToId }`, no
  `createdAt`. Two signals only — non-system comment, and a system comment
  matching `"Work order assigned to"`. No third signal for tickets
  auto-assigned at creation with no comments yet.
- `frontend/src/pages/incidents/IncidentWizardPage.tsx`: passes both
  `onClose={goBack}` and `onCreated={(incident) => navigate(...)}`.
  `IncidentWizard.tsx:493,506` calls `onCreated?.(inc); handleClose();` in
  that order on Finish — `onCreated` is optional
  (`onCreated?: (incident: DamageIncident) => void;` at line 134), so it's
  safe to drop at the call site without touching `IncidentWizard.tsx`.
- `frontend/src/pages/DeviceManagement/CheckoutPage.tsx`: does not import or
  call `useAutoFocusSearch`; the shared hook already exists unchanged at
  `frontend/src/hooks/useAutoFocusSearch.ts` and is used by other list pages
  (e.g. `InventoryManagement.tsx`).
- `backend/src/services/inventory.service.ts` `delete()` (lines 714-792):
  `permanent` branch counts `_count` across
  `deviceAssignments/repairTickets/damageIncidents/tickets/auditItems/cartItems/importJobs`
  and throws `ConflictError` if any are non-zero — blocking hard delete for
  almost any real item. `frontend/src/pages/InventoryManagement.tsx`
  `handlePermanentDelete` (line 110) uses `window.confirm(...)` /
  `alert(...)`. Existing test file
  `backend/src/__tests__/inventory-permanent-delete.test.ts` test 2 asserts
  the current blocking behavior — that assertion is replaced (opposite of
  the new behavior).

Schema relation audit for the equipment table (`backend/prisma/schema.prisma`),
confirming nullability of each FK to `equipment`/`id`:

| Relation | FK column | Nullable? | Cascades today? |
|---|---|---|---|
| `DeviceAssignment.equipmentId` | required | No | No (default restrict) |
| `ChargerAssignment` | via `deviceAssignmentId` (required, not equipment-direct) | No (transitively) | No |
| `RepairTicket.equipmentId` | required | No | No |
| `InventoryAuditItem.equipmentId` | required | No | No |
| `DeviceCartItem.equipmentId` | required | No | No |
| `DamageIncident.equipmentId` | `String?` | **Yes** | No |
| `DamageIncident.assignmentId` / `chargerAssignmentId` | `String?` | Yes | No |
| `Ticket.equipmentId` (`"TicketEquipment"` relation) | `String?` | **Yes** | No |
| `InventoryImportItem.equipmentId` | `String?` | **Yes** | No |
| `DamageInvoice.damageIncidentId` | required | No | No — but `DamageInvoice` → `InvoicePayment`/`DamageInvoiceLineItem` already `onDelete: Cascade` |
| `RepairTicket.damageIncidentId` | `String?` | Yes | No |
| `inventory_changes`, `EquipmentAttachment`, `MaintenanceHistory`, `EquipmentAssignmentHistory` | required, all `onDelete: Cascade` already | — | Yes (unaffected by this change) |

`TicketComment` (`backend/prisma/schema.prisma:1150`) has `isSystem Boolean`
and cascades on `ticket` delete — used for the system note appended to a
preserved work order.

This confirms the same required/nullable split the source doc describes:
`DeviceAssignment`, `ChargerAssignment` (transitively), `RepairTicket`,
`InventoryAuditItem`, `DeviceCartItem` must be deleted outright in all modes;
`DamageIncident` (+ its `DamageInvoice`s), `Ticket`, `InventoryImportItem`
can survive.

## Problem definition

1. **Work order badge**: tickets auto-assigned at creation (no comment ever
   written for that path — `createWorkOrder()` sets `assignedToId` directly
   in `tx.ticket.create()`) never trip the badge for the assignee.
2. **Inventory permanent delete**: blocked for nearly every real item;
   confirmation uses native `window.confirm`/`alert`, inconsistent with the
   app's dialog system.
3. **Incident wizard finish**: `onCreated` pushes `/incidents/<id>` right
   before `goBack()` pops one entry, landing the user back on
   `/incidents/new` (a fresh wizard) instead of the Checkouts page.
4. **Checkouts search autofocus**: `CheckoutPage.tsx` was missed when
   `useAutoFocusSearch` was rolled out to other list pages.

## Proposed solution

### Fix 1 — Work order badge auto-assign signal

In `countWorkOrders()`: widen the `ownTickets` `select` to include
`createdAt`; add a third signal — a ticket currently assigned to the caller
whose `createdAt > since` — added into the same `changed` `Set<string>`.
No schema change (`Ticket.createdAt` already exists). Update the function's
doc comment to describe the new branch (matching the source doc's diff).

### Fix 2 — Inventory permanent delete: force-delete cascade + dialog

**Backend** (`inventory.service.ts`): add `purgeAll: boolean = false` param
to `delete()`. Replace the guard-and-throw branch with a private
`hardDeleteWithRelations(id, purgeAll, user)` that runs the full cascade in
one `this.prisma.$transaction(...)`:

1. Look up `DeviceAssignment` ids for this equipment.
2. Look up `ChargerAssignment` ids for those assignment ids.
3. Look up `DamageIncident` ids reachable via `equipmentId`, `assignmentId`,
   or `chargerAssignmentId` on this equipment/its assignments.
4. Damage incidents:
   - `purgeAll = true`: null `RepairTicket.damageIncidentId` for those
     incidents (repair tickets themselves are deleted in step 6 if tied to
     this equipment directly — this null-out only matters for the rare case
     a repair ticket references the incident but a different equipment),
     delete `DamageInvoice` rows for those incidents (cascades to
     `InvoicePayment`/`DamageInvoiceLineItem`), delete the `DamageIncident`
     rows (cascades to `DamageIncidentPhoto`).
   - `purgeAll = false`: for each `DamageIncident`, `update` — null
     `equipmentId`/`assignmentId`/`chargerAssignmentId`, append
     `"[System] Linked equipment "<assetTag>" was permanently deleted on <date>."`
     to `description` (no comment-thread model on `DamageIncident`).
5. Delete `ChargerAssignment` rows (their FK to `DeviceAssignment` is
   required — cannot survive).
6. Delete `DeviceCartItem`, `RepairTicket`, `InventoryAuditItem` rows for
   this `equipmentId` (all required FKs).
7. `InventoryImportItem`: delete rows if `purgeAll`, else set
   `equipmentId: null`.
8. For each `Ticket` with this `equipmentId`: create a system
   `TicketComment` (`isSystem: true`, body:
   `"[System] Linked inventory item "<assetTag>" was permanently deleted."`),
   then set `Ticket.equipmentId = null`. Tickets are never deleted in either
   mode — they're independent records (title/status/assignee/own comment
   thread), not equipment-history.
9. Delete `DeviceAssignment` rows for this equipment.
10. Delete the `equipment` row (existing cascading relations —
    `inventory_changes`, `EquipmentAttachment`, `MaintenanceHistory`,
    `EquipmentAssignmentHistory` — are unaffected, already `onDelete: Cascade`).

Keep the existing `_count` lookup only for logging/audit context if useful;
it's no longer used to block. Log line
`'Inventory item permanently deleted'` keeps its current shape.

`backend/src/controllers/inventory.controller.ts` `deleteInventoryItem`:
read `purgeAll = req.query.purgeAll === 'true'` (same pattern as the
existing `permanent` read) and pass through to `inventoryService.delete(id,
permanent, user, purgeAll)`. No change to the authorization gate (admin OR
Tech Assistant) or the `INVENTORY_PERMANENT_DELETE` audit log call.

**Frontend**:

- New `frontend/src/components/inventory/InventoryPermanentDeleteDialog.tsx`
  — MUI `Dialog`, following `frontend/src/components/DeviceActionConfirmDialog.tsx`'s
  existing pattern (critical-red `PaperProps` top border via the same
  `RISK_COLOURS`-style approach — this dialog isn't keyed off `IntuneAction`
  so it hardcodes the "critical" red `#c62828`, `WarningAmberIcon`,
  `Alert severity="error"` for inline mutation errors instead of `alert()`).
  Props: `open`, `itemName`, `assetTag`, `onConfirm(purgeAll: boolean)`,
  `onCancel()`, `isLoading?`, `errorMessage?`. Body: a `RadioGroup` with two
  `FormControlLabel`s —
  - `"preserve"` (default/pre-selected): "Remove item, keep related records"
    — helper text listing what's preserved-and-unlinked (damage incidents/
    invoices, linked work orders, import records) vs. what's deleted outright
    regardless (checkout records, repair tickets, audit records, cart items).
  - `"purge"`: "Remove completely" — helper text noting damage incidents and
    their invoices are also deleted.
  A required acknowledgement `Checkbox` (matching `DeviceActionConfirmDialog`'s
  high/critical-risk pattern) gates the confirm `Button`
  (`color="error"`, disabled until checked).
- `frontend/src/pages/InventoryManagement.tsx`: replace
  `handlePermanentDelete`'s `window.confirm` with opening the new dialog
  (`setPermanentDeleteItem(item)`); add `confirmPermanentDelete(purgeAll:
  boolean)` that calls the mutation with `{ id, purgeAll }` and routes
  `onError` into dialog-local error state instead of `alert()`. Render the
  dialog near the other item-scoped dialogs in this file.
- `frontend/src/hooks/mutations/useInventoryMutations.ts`:
  `usePermanentlyDeleteInventoryItem`'s `mutationFn` signature changes from
  `(id: string) => inventoryService.deleteItem(id, true)` to
  `({ id, purgeAll }: { id: string; purgeAll: boolean }) =>
  inventoryService.deleteItem(id, true, purgeAll)`.
- `frontend/src/services/inventory.service.ts` (frontend):
  `deleteItem(id: string, permanent = false, purgeAll = false)` appends
  `&purgeAll=true` to the query string when `permanent && purgeAll`.

**Tests** — rewrite
`backend/src/__tests__/inventory-permanent-delete.test.ts` (same file,
same `describe` block, following the existing `getTestPrisma` /
`createTestUser` / `signTestAccessToken` / `csrfPair` conventions already
used in this file and in `request-badges.test.ts`):

- Remove test 2 (409-blocked) — opposite of new behavior.
- A clean delete still succeeds in both `purgeAll` values (admin).
- A delete succeeds despite an existing `DeviceAssignment` — the assignment
  row is gone afterward, for both modes.
- A linked `Ticket` survives with `equipmentId: null` and gains a system
  `TicketComment`.
- `purgeAll=true` deletes a `DamageIncident` + its `DamageInvoice`;
  `purgeAll=false` preserves the `DamageIncident` with `equipmentId: null`
  and the note appended to `description`.
- Tech Assistant (non-admin) can still permanently delete.
- Non-admin/non-Tech-Assistant still gets 403.
- The soft-delete (dispose) path is unchanged (keep existing test 5,
  renumbered).

### Fix 3a — Incident wizard: stop double-navigating on Finish

`frontend/src/pages/incidents/IncidentWizardPage.tsx`: remove the
`onCreated` prop and its now-unused `navigate`/`useNavigate`/
`DamageIncident` imports. `onClose={goBack}` remains the only navigation
IncidentWizard triggers on Finish. No change to `IncidentWizard.tsx` or
`IncidentDetailPage.tsx` (already doesn't pass `onCreated`).

### Fix 3b — Checkouts page search autofocus

`frontend/src/pages/DeviceManagement/CheckoutPage.tsx`: import
`useAutoFocusSearch` from `../../hooks/useAutoFocusSearch` (relative import,
matching this file's existing import style — it does not use the `@/` alias
elsewhere), call it once near the top of the component
(`const searchRef = useAutoFocusSearch();`), attach `inputRef={searchRef}`
to the desktop search `TextField` (around line 373). The `MobileFilterBar`
search input is untouched.

## Dependencies

None — all four fixes use only in-repo patterns and existing dependencies
(MUI v7 `Dialog`/`RadioGroup`, Prisma 7 `$transaction`, existing hooks).
Dependency & Documentation Policy's research step is not required per its
own exemption list (internal changes, no new dependency).

## Configuration changes

None. No new env vars, no Prisma schema change (no new columns/models —
`purgeAll` is a request-time boolean, not persisted).

## Risks and mitigations

- **Cascade correctness (Fix 2)**: wrong deletion order could FK-violate
  mid-transaction. Mitigated by ordering deletes child-before-parent
  (chargers before assignments, damage-incident dependents before the
  incident, everything before the equipment row) and running the whole
  cascade inside one `$transaction` so a violation rolls back cleanly rather
  than leaving partial state.
- **Test-data flakiness**: new backend tests create their own equipment/
  assignment/incident/invoice/ticket rows scoped with `TEST-` prefixes and
  clean up in `afterAll`, matching the existing file's pattern — no shared
  fixture mutation.
- **Live UX unverified**: none of these fixes can be click-through-verified
  in this environment (no browser automation). Build/typecheck and the
  backend test suite (real Postgres via preflight) are the available
  verification; this will be stated explicitly in the review and in the
  final summary to the user, per source docs' own caveat.

## Implementation steps

1. Fix 1 — `requestBadges.service.ts`.
2. Fix 3a — `IncidentWizardPage.tsx`.
3. Fix 3b — `CheckoutPage.tsx`.
4. Fix 2 — backend (`inventory.service.ts`, `inventory.controller.ts`),
   frontend (`InventoryPermanentDeleteDialog.tsx` new,
   `InventoryManagement.tsx`, `useInventoryMutations.ts`,
   `inventory.service.ts` frontend), then rewrite the backend test file.
5. Phase 3 review of all four.
6. Phase 6 preflight (`scripts/preflight.ps1`).
7. Phase 7 — separate commit messages per fix (disjoint file sets).

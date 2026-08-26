# Spec: Standalone "Create Ticket" repair form asks for raw UUIDs

## Current state analysis
`frontend/src/pages/DeviceManagement/RepairTicketsPage.tsx` — the "Create Repair Ticket"
dialog (lines ~261-323) collects, as free-text fields:
- Equipment ID (UUID), typed by hand
- Damage Incident ID (optional), typed by hand
- Vendor ID (optional), typed by hand
- Expected Return Date, Repair Notes, Internal Notes

Its `createMutation` (line 85) calls `repairTicketService.create(form)` directly with the
raw `CreateRepairTicketData` shape. `emptyForm` (line 38) mirrors that shape.

Devices that **are** checked out get a repair ticket through the Create Incident wizard,
which walks a tech through device search, user search, and damage details. There is no
equivalent for a device **not** checked out to anyone.

### Patterns to copy (all read from source)
- Device autocomplete: `frontend/src/pages/DeviceManagement/wizard/WizardStep1LinkAndDate.tsx`
  lines 88-120 — `Autocomplete<InventoryItem>`, `getEquipLabel` (line 22), backed by
  `inventoryService.getInventory({ search, limit: 50, isDisposed: false })` gated on
  `equipSearch.length >= 2` with `staleTime: 30_000`.
- Date of Damage: same file lines 134-147 — plain `type="date"` with `inputProps={{ max:
  today }}`, where `today` (line 79) is built from **local** date components, not
  `toISOString()`.
- Damage Type / Severity / Description:
  `frontend/src/pages/DeviceManagement/wizard/WizardStep2DamageDetails.tsx` — `DAMAGE_TYPES`
  (line 19, 7 options) and `SEVERITIES` (line 29, 4 options) as `Select`s; Description as a
  `multiline` `TextField` with `maxLength: 2000`.
- Submit sequence: `frontend/src/components/incidents/IncidentWizard.tsx`
  `accidentalSubmitMutation` lines 197-232 — `damageIncidentService.create(...)` ->
  `repairTicketService.create({ equipmentId, damageIncidentId })` ->
  `damageIncidentService.updateWorkflowStep(inc.id, { workflowStep: 'PENDING_REPAIR' })`.
  Its `onSuccess` invalidates both `['damage-incidents']` and `['repair-tickets']`.
  Note the `T12:00:00` local-noon append (line 211) with its explaining comment.

### No backend change needed — verified
`backend/src/validators/damageIncident.validators.ts:31-34` —
`.refine((d) => !!d.equipmentId || !!d.userId)`. An equipment-only, user-less incident is
already valid. `CreateRepairTicketSchema` and `UpdateIncidentWorkflowStepSchema` are
untouched.

## Problem definition
Nobody has UUIDs memorized, so the only standalone repair-ticket entry point is effectively
unusable.

## Proposed solution architecture
Rework the same dialog into a device-only damage-report form mirroring the incident wizard's
device search and damage-details fields, **minus the user field** (this form is specifically
for devices not checked out), wired through the same
DamageIncident -> RepairTicket -> workflow-step sequence — **without** the wizard's Device
Exchange step (there is no assignment to exchange) and without an intent selector or invoice
step (this covers only the plain accidental, device-only case).

### Field mapping
| New field | Source |
|---|---|
| Device (autocomplete by asset tag / name) | WizardStep1 equipment `Autocomplete` |
| Date of Damage (defaults today, not future-datable) | WizardStep1 date field |
| Damage Type (Select) | WizardStep2 `DAMAGE_TYPES` |
| Severity (Select) | WizardStep2 `SEVERITIES` |
| Description (multiline, 2000 max) | WizardStep2 description field |

Dropped: `damageIncidentId` (now created internally), `vendorId` and `expectedReturnDate`
(both are set later on the repair ticket detail page in the incident flow too — matching
what the wizard's own `repairTicketService.create` call actually passes), `repairNotes` and
`internalNotes` (not part of the wizard's creation call either).

Local form state becomes:
```ts
interface NewTicketForm {
  equipmentId: string;
  damageDate:  string;
  damageType:  DamageType;
  severity:    DamageSeverity;
  description: string;
}
```

A `resetForm()` helper clears all four pieces of dialog-local state (form, equipOption,
equipSearch, equipInputValue), called from Cancel and from the dialog's `onClose`.

A one-line note under the dialog title points techs at the right tool: "For a device that
isn't currently checked out to anyone. For a device checked out to a user, use the Create
Incident workflow instead."

## Implementation steps
1. Replace `emptyForm`/`CreateRepairTicketData` state with `NewTicketForm`; add
   `DAMAGE_TYPES`/`SEVERITIES` constants and the device-search state. -> verify: typechecks.
2. Replace `createMutation` with the three-call sequence; invalidate both query keys.
3. Replace the dialog body with the five new fields plus the helper note.
4. Extend the Save `disabled` condition to require `equipmentId` **and** `damageDate`.
5. Frontend image build. -> verify: exits 0.

## Dependencies
None new. `inventoryService`, `damageIncidentService`, `repairTicketService` all already
exist; `Autocomplete` is added to the existing MUI import block.

## Configuration changes
None. No backend, schema, or migration change.

## Risks and mitigations
- Risk: date rolling back a day. Mitigation: `T12:00:00` local-noon append and a
  locally-computed `today` cap — both copied from the wizard along with its comment.
- Risk: orphaned imports/state after replacing the form shape. Mitigation: remove
  `CreateRepairTicketData` import if it becomes unused; verify via `tsc` in the build.

## Known limitation (documented, not fixed)
The device picker cannot filter to "not currently checked out". Checked-out status is
tracked via `assignedToUserId` on the inventory record, not via `EquipmentStatus` (which has
no checked-out value), and neither `GetInventoryQuerySchema` nor `InventorySearchQuerySchema`
filters on assignment. Adding it would require a backend query-schema and service change —
out of scope for an otherwise frontend-only fix, and not a regression (the old UUID field
had no such guard either). The search shows every non-disposed device.

## Scope decisions (carried from the source session, already user-confirmed)
1. Keep a Date of Damage field — yes, matches the incident wizard.
2. Drop Vendor / Expected Return Date from creation — yes, matches the incident wizard,
   where both are set later on the ticket detail page.

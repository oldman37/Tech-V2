# Incident Wizard — Remove "Send to Repair" Step Spec

## Current State Analysis

The "Create Incident" wizard (`frontend/src/components/incidents/IncidentWizard.tsx`) has two
intent-based branches, driven by `getStepLabels(intent)`:

- **Accidental**: `Link & Date → Damage Details → Send to Repair → Device Exchange` (4 steps)
- **Intentional**: `Link & Date → Damage Details → Create Invoice → Device Exchange` (4 steps)

For the accidental branch, step index 2 ("Send to Repair", rendered by
`frontend/src/pages/DeviceManagement/wizard/WizardStep3aRepair.tsx`) collects `vendorId`,
`expectedReturnDate`, and `repairNotes`, and its Submit button
(`handleAccidentalSubmit` → `accidentalSubmitMutation`) does all of the following in one shot:

1. `damageIncidentService.create(...)` — creates the `DamageIncident`.
2. `repairTicketService.create(...)` — creates a `RepairTicket` linked to the incident, using the
   vendor/return-date/notes just entered.
3. `repairTicketService.updateStatus(repairTicket.id, { status: 'sent_to_vendor' })` — immediately
   marks the ticket as sent to a vendor.
4. `damageIncidentService.updateWorkflowStep(inc.id, { workflowStep: 'PENDING_REPAIR' })`.

On success, `setActiveStep(3)` moves to Device Exchange (the final step).

## Problem Definition

The front-line tech filling out the wizard does not decide when/whether a device is sent to a
vendor — that decision belongs to the tech director, made later via the existing
`RepairTicketDetailPage.tsx` (which already supports assigning a vendor and progressing
`pending → sent_to_vendor → in_repair → returned/unrepairable/cancelled`, confirmed by
`RepairTicketsPage.tsx`'s `STATUSES` list and `RepairStatusStepper` component). Forcing the tech
to fill in vendor/return-date and having the wizard auto-mark the ticket `sent_to_vendor` is
incorrect: it misrepresents a ticket as sent when it hasn't been, and asks the tech for
information they don't have.

The repair ticket itself must still be created at incident-creation time, since that's how a
damaged device lands in the director's repair queue for triage.

## Proposed Solution

Remove the dedicated "Send to Repair" step from the accidental branch of the wizard. The
accidental branch becomes 3 steps: `Link & Date → Damage Details → Device Exchange`. The
intentional branch (`Link & Date → Damage Details → Create Invoice → Device Exchange`) is
unchanged.

Submission for the accidental branch moves to the end of step 1 ("Damage Details"): once
`Step2Schema` validates, the wizard calls `accidentalSubmitMutation` directly (no repair-detail
form in between) and advances straight to Device Exchange.

`accidentalSubmitMutation`'s mutation function changes to:

1. `damageIncidentService.create(...)` — unchanged, still `autoCreateRepairTicket: false`.
2. `repairTicketService.create({ equipmentId, damageIncidentId })` only — **no** `vendorId`,
   `expectedReturnDate`, or `repairNotes` (all optional per
   `backend/src/validators/repairTicket.validators.ts:3-10`). The ticket is created with its
   Prisma-default `status: "pending"` (`backend/prisma/schema.prisma:1441`).
3. **Removed**: the `repairTicketService.updateStatus(..., { status: 'sent_to_vendor' })` call.
4. `damageIncidentService.updateWorkflowStep(inc.id, { workflowStep: 'PENDING_REPAIR' })` —
   unchanged; this already correctly means "ticket created, not yet sent" per the
   `IncidentWorkflowStep` doc comment in `shared/src/types.ts:222`.

No backend, Prisma, or shared-type changes are required — this is a frontend-only change. The
repair ticket detail/list pages are untouched; the director continues to assign a vendor and mark
tickets `sent_to_vendor` there exactly as today.

### Files to change

- `frontend/src/components/incidents/IncidentWizard.tsx`
  - `getStepLabels`: accidental case returns `['Link & Date', 'Damage Details', 'Device Exchange']`.
  - `getInitialStep`: becomes intent-aware — for resuming an incident, `PENDING_REPAIR` /
    `IN_REPAIR` / `REPAIR_COMPLETE` / `DEVICE_EXCHANGE` map to the Device Exchange index, which is
    now `2` for accidental and stays `3` for intentional. `INVOICED` stays mapped to `3`
    (intentional only — this workflow step is never reached by the accidental path).
  - `accidentalSubmitMutation`: drop `s3` usage, drop the `updateStatus('sent_to_vendor')` call,
    trim the `repairTicketService.create` payload to `{ equipmentId, damageIncidentId }`. On
    success, `setActiveStep(2)` (was `3`) since Device Exchange is now index 2 for this branch.
  - `handleNextStep1`: for the accidental branch, call `accidentalSubmitMutation.mutate()` directly
    after `Step2Schema` validates (instead of advancing to a now-nonexistent step 2). For the
    intentional branch, behavior is unchanged (`setActiveStep(2)`).
  - Remove `handleAccidentalSubmit`, `state.step3a`/`errors3a` reducer slots, `Step3aRepairSchema`
    validation, and the `WizardStep3aRepair` import/usage — no longer reachable.
  - `renderStepContent`/`renderActions`: re-key the `switch (activeStep)` so that index 2 renders
    the invoice-review content when `isIntentional` and Device Exchange when not; index 3 renders
    Device Exchange only for the intentional branch. The "no actions row" check (currently
    `activeStep === 3`) becomes "activeStep equals the Device Exchange index for the current
    branch" (`isIntentional ? 3 : 2`).
  - **3+ incident consultation gate preservation**: this threshold check (`thresholdWarning` JSX +
    "Notify Building Admin"/"Verify Consultation" buttons, currently rendered once at step index 2
    ahead of the intent branch, gating both the repair-submit and invoice-submit buttons) must keep
    gating submission for both branches. Since the accidental branch's submit action moves to step
    index 1, extract the existing JSX into a small render helper (e.g. `renderThresholdWarning()`)
    and render it in both places: under `WizardStep2DamageDetails` on step 1 (gating the new
    Submit button, accidental only) and in its current spot on step 2 (gating "Submit & Create
    Invoice", intentional only, unchanged). No change to the underlying `incidentSummary` query,
    `notifyAdminMutation`, or the 3-incident/5-minute-rate-limit logic itself.
  - Button label on step 1: for the accidental branch this is now the final submit action, so the
    label reads "Submit"/"Submitting..." there (mirroring the removed step's copy) instead of
    "Next"/"Creating...". Intentional branch keeps "Next".

- `frontend/src/pages/DeviceManagement/wizard/WizardStep3aRepair.tsx` — delete (no longer
  referenced by any route or component after this change). Confirm with a repo-wide grep before
  deleting that nothing else imports it.
- `frontend/src/pages/DeviceManagement/wizard/wizardSchemas.ts` — remove `Step3aRepairSchema` and
  `Step3aValues` (no longer used anywhere once `WizardStep3aRepair.tsx` is removed).

### Out of scope / unchanged

- `IncidentDetailPage.tsx`'s progress stepper (`WORKFLOW_STEPS`/`INTENTIONAL_STEPS`) — user
  confirmed only the creation wizard is in scope.
- `RepairTicketDetailPage.tsx`, `RepairTicketsPage.tsx`, `RepairStatusStepper.tsx` — the director's
  existing tooling for assigning vendors and progressing ticket status is untouched.
- Backend routes/controllers/services/validators — no change; `repairTicketService.create`
  already treats `vendorId`/`expectedReturnDate`/`repairNotes` as optional.
- Intentional (invoice) branch of the wizard — unchanged end-to-end.

## Dependencies

None — no new packages, no version-sensitive API usage introduced. Purely internal frontend
component logic using patterns already present in this file (TanStack Query mutations, Zod
schemas already in `wizardSchemas.ts`).

## Configuration Changes

None. No env vars, Prisma schema, or MSAL/Graph scope changes.

## Risks and Mitigations

- **Risk**: Removing the repair-detail step also silently drops the 3+ incident consultation gate
  for the accidental branch (since that gate's JSX currently lives inside the step being
  restructured).
  **Mitigation**: Explicitly preserve it via a shared render helper rendered at the new gating
  point (step 1 for accidental), as detailed above. Verified manually in Phase 3 review by
  exercising the flow with a test user who has 3+ incidents.
- **Risk**: `getInitialStep` resume logic silently breaks for in-flight incidents that already
  reached `PENDING_REPAIR`/`IN_REPAIR` under the old 4-step accidental flow, if the index mapping
  isn't updated to match the new 3-step layout.
  **Mitigation**: Explicit intent-aware mapping described above; verified by resuming incidents at
  each `workflowStep` value during Phase 3 review.
- **Risk**: Orphaned imports/dead code after removing `WizardStep3aRepair.tsx` usage.
  **Mitigation**: Grep for remaining references before deleting the file and the now-unused Zod
  schema/type in `wizardSchemas.ts`.

## Addendum: pre-existing `onCreated` premature-navigation bug

Discovered during live testing of this change (dev server): `IncidentWizardPage.tsx:23` wires
`onCreated={(incident) => navigate('/incidents/${incident.id}')}`. `accidentalSubmitMutation`'s
`onSuccess` in `IncidentWizard.tsx` called `onCreated?.(incident)` immediately after creating the
incident — before the wizard advances to Device Exchange. For the full-page route (the only place
`IncidentWizard` is used to *create* a new incident), that navigation unmounts the wizard, so
Device Exchange never renders for the accidental branch. This call existed at the same relative
point in the pre-change code too (right after the old "Send to Repair" step submitted), so it is
not something this refactor introduced — it was simply never reached/noticed before, since it
required completing the full accidental flow through to what used to be step 4.

**Fix**: removed the `onCreated?.(incident)` call from `accidentalSubmitMutation`'s `onSuccess`.
`onCreated` now fires exactly once for both branches — from `WizardStep4DeviceExchange`'s
`onFinish`, which is the actual end of the flow — matching how the intentional branch already
behaved. Query-cache invalidation (`damage-incidents`, `repair-tickets`) in that same `onSuccess`
handler is untouched, so list views still refresh immediately on incident creation.

## Build/Validation Commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build frontend` (frontend `tsc` + `vite build` —
  sufficient on its own since this is a frontend-only change, but Phase 6 preflight runs both
  images regardless)
- `scripts/preflight.ps1` (Phase 6 gate — runs both backend and frontend image builds)

No FORBIDDEN COMMANDS are needed; no database, migration, or live Graph/Entra calls are involved.

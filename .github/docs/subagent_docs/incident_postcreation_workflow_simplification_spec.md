# Incident Post-Creation Workflow — Simplification Spec

Status: **APPROVED — proceeding to Phase 2 implementation of Fix A, B, and C**

## 0. Decisions locked in with user

- **Fix A/B/C are all in scope for this pass** (user chose "include now" for Fix C rather than deferring it).
- **Device Exchange never closes the incident by itself** when a repair is still outstanding — confirmed this is already true today (the `deviceExchange` handler's `hasActiveRepair` check), and Fix A does not change it. Fix A only adds a new closing trigger from the repair-ticket side.
- **A repaired device returns to the spare pool, not back to the original student** (confirmed with user) — so there is no "second exchange" to wait for. Once the repair ticket resolves and no other active ticket remains for that equipment, it is safe to close/advance the incident immediately.
- **`unrepairable` handling:** user's direction was to eventually stop using `unrepairable` by deciding total-loss at incident creation time instead — but the specifics of that redesign (whether the wizard should skip repair-ticket creation for `severity: total_loss`) were not confirmed (got sidetracked before a clean answer). **Decision for this pass: treat `unrepairable` the same as `returned`/`cancelled` in Fix A's closing trigger** (safe, low-risk, no schema/UI removal). The total-loss-at-creation redesign is noted as a **separate follow-up item, not implemented now** — do not remove the "Mark Unrepairable" button or change wizard repair-ticket auto-creation logic in this pass.
- **"3+ incidents → intervention stage" is explicitly out of scope for this spec.** Confirmed by reading the code that no such feature exists today (`grep -r intervention` → zero matches). What exists is only an in-wizard, non-persistent 2-click gate (`IncidentWizard.tsx` `thresholdWarning`, `damageIncident.service.ts` `getUserIncidentSummary`/`resolveBuildingAdmin`). This is tracked as a future, separate spec — not touched here.

## 1. Current state analysis

### Two parallel UIs for one resource
The domain model is `DamageIncident`, but it has two independent frontend experiences:

| | New/unified | Legacy |
|---|---|---|
| List | `/incidents` → `IncidentsPage.tsx` | `/device-management/incidents` → `DamageIncidentsPage.tsx` |
| Detail | `/incidents/:id` → `IncidentDetailPage.tsx` | `/device-management/incidents/:id` → `DamageIncidentDetailPage.tsx` |
| Driven by | `workflowStep` enum + stepper | legacy `status` enum + plain dropdown |
| Photo upload/view | **absent** | present (`PhotoUploadGrid`) |
| Sidebar nav | ✅ only this one | ❌ (route still live, but orphaned from nav) |

Both routes are live in `frontend/src/App.tsx` (lines ~485, ~495 for the legacy pair). Nothing links to the legacy list page anymore, but `RepairTicketDetailPage.tsx:232` still navigates to the **legacy** detail route (`/device-management/incidents/${id}`) via its "View Incident" button — so a tech following that link lands on a different page than the one linked from the sidebar, with a different status control and no photo access from the new page.

### Two decoupled state machines
`DamageIncident` carries both a legacy `status` field (`reported|invoiced|in_repair|resolved|waived`, driven only by the legacy page's dropdown + `PATCH /:id/status`) and a newer `workflowStep` field (`DAMAGE_REPORTED → PENDING_REPAIR → IN_REPAIR → REPAIR_COMPLETE → INVOICED → DEVICE_EXCHANGE → CLOSED`, driven by the wizard + `PATCH /:id/workflow-step`, guarded by `VALID_TRANSITIONS` in `backend/src/services/damageIncident.service.ts:376-385`). Nothing keeps the two in sync — depending which page was used last, one can say "reported" while the other says "CLOSED."

### The core friction: RepairTicket and DamageIncident don't talk to each other
`RepairTicket` has its own `status` enum (`pending|sent_to_vendor|in_repair|returned|unrepairable|cancelled`), managed entirely on a separate page (`RepairTicketDetailPage.tsx` → `PATCH /repair-tickets/:id/status`). Per `backend/src/services/repairTicket.service.ts`, none of those status transitions ever touch the parent `DamageIncident` — confirmed no reference to `workflowStep` or `damageIncident` writes anywhere in that service.

For a typical accidental, device-linked incident, this produces a **6+ click, 3-screen** sequence just to reach `CLOSED`:

1. Wizard creates the incident, auto-creates a `RepairTicket` at `pending` (always — not user-optional), PATCHes `workflowStep = PENDING_REPAIR`.
2. Wizard auto-advances to its embedded Device Exchange step. Tech completes or skips check-in/check-out.
3. Backend's `deviceExchange` handler (`damageIncident.service.ts:579-599`) recomputes `hasActiveRepair` by querying for any `RepairTicket` still in `pending|sent_to_vendor|in_repair` for that equipment. Since the ticket from step 1 is still `pending`, this is always true at this point — **so the incident cannot close here**, no matter what the tech picked. It's left at `workflowStep = DEVICE_EXCHANGE`.
4. Tech must separately navigate to **Repair Tickets → this ticket** (an unrelated page) and click through its own buttons (`Send to Vendor` → `Mark In Repair` → `Mark Returned`/`Unrepairable`) — none of which touch the incident.
5. Tech must go back to `/incidents/:id`, click **"Continue Workflow"**, which reopens the **entire multi-step creation wizard** (`IncidentWizard.tsx`, resumed via `getInitialStep()` at line 87), re-tick the same skip checkboxes, and click "Skip Exchange & Close Incident" again — only *now*, with the repair ticket resolved, does `deviceExchange` finally set `workflowStep = CLOSED`.

The button is literally labeled "Skip Exchange & Close Incident" (`WizardStep4DeviceExchange.tsx`), which tells us the product intent was always for this to be a single action — it just doesn't work that way today because of the repair-ticket coupling gap.

### Secondary friction points (lower priority)
- `IncidentDetailPage.tsx` has no photo upload/view UI at all — only reachable via the legacy page.
- "Continue Workflow" always reopens the *entire* creation wizard (including the "3+ incidents" consultation gate, which re-renders even on a mid-repair incident being resumed), rather than a lightweight, targeted action for whatever step is actually pending.
- `autoCreateRepairTicket` / `autoCreateInvoice` flags exist on the create endpoint/validator but are dead from the UI's perspective (wizard always sends `false` and creates these itself via separate calls) — unused complexity, no behavior change needed but worth noting for anyone reading that code.

## 2. Problem definition

Once an incident is created, closing it out for the common device-repair case requires bouncing between two unrelated screens multiple times, because the repair ticket's lifecycle and the incident's `workflowStep` are not linked, and "continuing" an incident always means re-running the full creation wizard rather than taking one targeted action. This is what reads as "clunky" — not the creation step itself, which the user already likes.

## 3. Proposed solution architecture

**Clarified requirement (confirmed with user):** completing the Device Exchange step must never by itself close the incident when a repair is still outstanding — its purpose is only to get the student a working device while the original goes for repair. This is already how the existing `deviceExchange` handler behaves (it checks for an active repair ticket and stays at `DEVICE_EXCHANGE` if one exists) and Fix A does not change that. Fix A only adds a new, separate closing trigger from the repair-ticket side — when the ticket resolves and no device swap-back is needed (confirmed: a repaired device returns to the spare pool, not back to the original student, so no second exchange is owed), that's what closes the incident. The exchange action itself still never performs the close.

### Fix A (primary, highest leverage): Link RepairTicket status changes back to the incident
When `repairTicketService.updateStatus` transitions a ticket to a terminal state (`returned`, `unrepairable`, or `cancelled`) **and** that ticket has a `damageIncidentId`, re-run the same "any other active repair ticket for this equipment?" check that `deviceExchange` already does, and if none remain:
- If the incident's `workflowStep` is already `DEVICE_EXCHANGE` → auto-transition it to `CLOSED` (stamping `resolvedAt`/`resolvedBy` with the acting user), the same side effect `deviceExchange` performs today.
- If the incident's `workflowStep` is still `PENDING_REPAIR`/`IN_REPAIR` (device exchange hasn't happened yet) → advance it to `REPAIR_COMPLETE` so the incident detail page reflects reality without a human copying status by hand.

This removes step 4→5 of the walkthrough entirely: closing the repair ticket closes the incident (when nothing else is pending), with no return trip to the wizard.

### Fix B: Replace "Continue Workflow" with a targeted action bar
On `IncidentDetailPage.tsx`, instead of reopening the full `IncidentWizard` for every remaining step, show only the action(s) valid for the incident's current `workflowStep` (per `VALID_TRANSITIONS`) — e.g., if `workflowStep = DEVICE_EXCHANGE` and both check-in/out are already done, show a single "Close Incident" button that calls `deviceExchange` with no payload, rather than reopening the 3-step dialog. Reserve the full wizard dialog for genuinely multi-field actions (e.g., the device exchange form itself, when it hasn't been run yet).

### Fix C: Retire the legacy incident pages

**Additional findings from feature-parity audit (confirmed by reading both pages):**
- `DamageIncidentsPage.tsx`'s own "Report Damage" button (line 253) navigates to `/device-management/incidents/new` — **a route that does not exist anywhere in `App.tsx`**. The page's entire embedded creation `Dialog`/`createMutation`/form state is already dead, unreachable code — the legacy page's own primary action is already broken today. This further supports retiring it rather than maintaining it.
- `DeviceDetailPage.tsx` (a page we are **not** retiring) reads the legacy `status` field directly: `latestIncident = ...find(i => i.status !== 'resolved' && i.status !== 'waived')` (line 153) to decide which incident to show as "active" for a device, and renders `incident.status` in a table Chip (line 373). Since `status` is **only ever written by the page we're deleting** (`updateWorkflowStep` and `deviceExchange` never touch it), once the legacy status-editing UI is gone, `status` will stay frozen at its creation-time default (`'reported'`) for every future incident — silently breaking this "active incident" lookup on the Device detail page. **This must be migrated to `workflowStep !== 'CLOSED'` as part of Fix C**, not left as-is.
- Feature parity check confirms `IncidentDetailPage.tsx` is missing only two things the legacy page has that are worth carrying over: photo upload/view (`PhotoUploadGrid`) and a standalone "Create Invoice" button (`CreateInvoiceDialog`) for cases outside the wizard's own invoice step. Both source components already work against the same `getById` response `IncidentDetailPage` already fetches (`photos` is already included in the backend's `detailInclude` and already typed on the frontend `DamageIncident` type) — no backend change needed to port them.
- `RepairTicketDetailPage.tsx:232` ("View Incident" button) must be repointed from `/device-management/incidents/${id}` to `/incidents/${id}`.

**Plan:**
1. Port `PhotoUploadGrid` and a "Create Invoice" button (+ `CreateInvoiceDialog`) into `IncidentDetailPage.tsx`.
2. Fix `DeviceDetailPage.tsx`'s active-incident filter and status Chip to use `workflowStep` instead of the legacy `status` field.
3. Repoint `RepairTicketDetailPage.tsx`'s "View Incident" link to `/incidents/${id}`.
4. Remove `DamageIncidentsPage.tsx`, `DamageIncidentDetailPage.tsx`, and their two routes (`/device-management/incidents`, `/device-management/incidents/:id`) from `App.tsx`.
5. Remove the now-orphaned frontend `damageIncidentService.updateStatus` method (its only caller is the page being deleted).
6. **Leave the backend `PATCH /:id/status` endpoint, controller, service function, and the `status` DB column untouched** — removing API surface and schema is a larger, separate decision not needed to achieve the user's goal; it becomes unreachable from the UI but stays available if anything else needs it later. This will be called out in the implementation summary as now-unused-from-the-UI, not deleted.

This eliminates the dual-state-machine confusion in the UI permanently, while keeping the backend/schema change surface minimal.

## 4. Recommendation

Fix A alone removes the worst of the "so many steps" problem (the wizard round-trip) with a small, contained backend change. Fix B is a moderate frontend change that makes remaining steps feel lighter. Fix C is a larger cleanup (removes a whole page + route + dead status field from the UI) that's worth doing but is separable and riskier (need to confirm nothing else reads `DamageIncident.status`).

**Suggested sequencing: A, then B, then C as a follow-up** — each is independently shippable and testable, and A+B together directly address what the user described.

## 5. Implementation steps (for Fix A + B, pending user go-ahead)

**Fix A (backend):**
1. In `backend/src/services/repairTicket.service.ts`, in `updateStatus`, after a transition to `returned`/`unrepairable`/`cancelled` on a ticket with `damageIncidentId`, query for remaining active tickets for the same `equipmentId` (reuse the same `status: { in: ['pending','sent_to_vendor','in_repair'] }` filter used in `damageIncident.service.ts:582-588`).
2. If none remain, update the linked `DamageIncident.workflowStep`: → `CLOSED` (+ `resolvedAt`/`resolvedBy`) if currently `DEVICE_EXCHANGE`; → `REPAIR_COMPLETE` if currently `PENDING_REPAIR`/`IN_REPAIR`. Otherwise no incident change.
3. Wrap the ticket update + incident update in the same Prisma transaction already used in that function (verify current tx usage first).
4. No schema change needed (`workflowStep` already exists) — no migration required.

**Fix B (frontend):**
1. In `IncidentDetailPage.tsx`, compute the incident's valid next actions instead of a static "Continue Workflow" button: if `workflowStep === 'DEVICE_EXCHANGE'` and the last device exchange call already handled check-in/out, show a single "Close Incident" button (calls `PATCH /:id/device-exchange` with an empty body, same as today's "Skip Exchange & Close Incident").
2. Only fall back to opening `IncidentWizard` as a dialog for steps that genuinely need the multi-field form (initial device exchange itself, invoice creation for intentional incidents).
3. No backend change required for this piece — reuses existing endpoints.

## 6. Dependencies

None — both fixes use only in-repo patterns (Prisma transactions, existing Zod validators, existing MUI components already used elsewhere in these files). No new external library.

## 7. Risks and mitigations

- **Risk:** Auto-closing an incident from the repair-ticket side could surprise a tech who expected to review it first. *Mitigation:* this only fires when there's no other active repair ticket left AND the incident was already at `DEVICE_EXCHANGE` (i.e., the device swap already happened) — it's completing an action the UI already labels as automatic ("Skip Exchange & Close Incident"), not inventing new behavior.
- **Risk:** `unrepairable` tickets currently leave `equipment.status` as `in_repair` with an explicit TODO in `repairTicket.service.ts` ("team to decide final disposition") — auto-closing the incident in that case may be premature if a device is never actually resolved. *Mitigation:* confirm with user whether `unrepairable` should trigger incident auto-close/advance, or only `returned`/`cancelled` should.
- **Risk (Fix C only, not in this pass):** need to confirm nothing else in the app (reports, dashboards) reads `DamageIncident.status` before removing its UI surface.

## 8. Open questions for the user

1. Should an `unrepairable` repair ticket auto-advance/close the linked incident the same way `returned` does, or should that case always require a human decision on the incident?
2. Do you want Fix C (retiring the legacy `/device-management/incidents` pages) scoped into this work now, or tracked separately after A+B ship and prove out?

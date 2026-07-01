# PO Finance Director Double-Approval Skip (District Office / Finance Department) — Spec

## Current State Analysis

The standard PO approval chain is `submitted -> supervisor_approved -> finance_director_approved ->
dos_approved -> po_issued` (`getApprovalRequirements`, `backend/src/services/purchaseOrder.service.ts:145-152`).
A previously-shipped fix added `skipFinanceDirectorApproval` (boolean, cached at creation time on
`purchase_orders`) which, when true, swaps in `getFinanceDirectorSkipApprovalRequirements()`
(`purchaseOrder.service.ts:160-167`): `submitted -> supervisor_approved -> dos_approved`. Today it is
only set true when the requestor is themselves a Finance Director (FD) group member
(`purchaseOrder.service.ts:210-213`).

Two live location categories put the FD in the **supervisor**-stage seat, not because they requested
the PO, but because of how the location is configured:

1. **`District Office` (entityType `DISTRICT_OFFICE`)** — hardcoded routing skips the
   `LocationSupervisor` lookup entirely and requires FD group membership to approve at the
   `submitted` stage (`purchaseOrder.service.ts:770-798` for `submitPurchaseOrder`,
   `purchaseOrder.service.ts:1183-1204` for `approvePurchaseOrder`). Confirmed live: the
   `location_supervisors` row for this location lists `DIRECTOR_OF_SCHOOLS` (Timothy Watkins) as
   primary, but the PO code ignores it and forces FD approval regardless.
2. **`Finance Department`** (DEPARTMENT type, code `FD`, renamed live from "Finance Director") —
   ordinary `LocationSupervisor` routing (`purchaseOrder.service.ts:1205-1223`): its primary
   supervisor record has `supervisorType = 'FINANCE_DIRECTOR'` (Linda Carney, confirmed live via
   `location_supervisors` query), so she approves at the `submitted` stage through the normal
   per-location supervisor path — no hardcoding needed there, it already works correctly.

In both cases, once the PO reaches `supervisor_approved`, the standard chain still requires a
**second**, separate FD-group approval at `finance_director_approved`. Since Linda Carney is the
only FD, this second approval is blocked by the existing "no double-stage approval" guard
(`purchaseOrder.service.ts:1086-1105`: a user who already approved a PO at one stage cannot approve
it again at a later stage). Result: the PO is permanently stuck at `supervisor_approved` — the exact
same failure mode the original `skipFinanceDirectorApproval` fix solved for FD's own requests, just
triggered by location routing instead of requestor identity.

Verified via a read-only query against the live `tech_v2` database: no PO is currently stuck in this
state (`status IN ('submitted','supervisor_approved') AND (entityType = 'DISTRICT_OFFICE' OR
officeLocation.name = 'Finance Department')` returns 0 rows), so no live-data backfill is required
for this change — but see Risks for future POs created before deploy.

### Why the fix is smaller than it looks

`skipFinanceDirectorApproval` is already read generically (not "was requestor the FD") everywhere
downstream:
- `approvePurchaseOrder`'s `skipFd` (`purchaseOrder.service.ts:1029`) — chain selection.
- Controller notification routing after supervisor approval, both submit and approve paths
  (`purchaseOrder.controller.ts:184`, `:252`) — already keys off `po.skipFinanceDirectorApproval`.
- Pending-approval queue: FD's own queue already excludes `skipFinanceDirectorApproval: true`
  (`purchaseOrder.service.ts:384`); DoS's queue already includes it (`purchaseOrder.service.ts:398`).
- Frontend `PurchaseOrderList.tsx:249` pending-label ternary already keys off
  `po.skipFinanceDirectorApproval` generically.
- Frontend `PurchaseOrderDetail.tsx` — `isFdSkip` (line 172), `canActAtFdStage` (line 271, already
  gated by `!isFdSkip`), and `canActAtDosStage` (lines 272-274, already branches on `isFdSkip`) are
  all generic and require no changes.
- Stage-1 (supervisor) visibility and approval authority for `Finance Department` already work
  correctly today — driven by Linda Carney's real `LocationSupervisor` record, not by group
  membership, so nothing needs to change there.

So the **only** functional gap is: the flag is never set to `true` for these two location cases at
creation time. Expanding the condition that computes `skipFinanceDirectorApproval` is sufficient for
every backend consumer.

The one place that does need direct edits is `PurchaseOrderDetail.tsx`'s District-Office-specific
label maps, which currently assume (matching today's buggy behavior) that FD approves *twice* for
District Office POs — see Implementation Steps.

## Problem Definition

When a PO's `submitted`-stage approver resolves to the Finance Director — either because the PO's
entity location is `DISTRICT_OFFICE`, or because the PO's location has a primary `LocationSupervisor`
of type `FINANCE_DIRECTOR` (currently only the `Finance Department` location) — the PO must skip the
`finance_director_approved` stage, exactly as already happens when the FD is the requestor, so it
does not get stuck behind the "no double-stage approval" guard after she approves once as supervisor.
The `PurchaseOrderDetail.tsx` District Office label maps must also stop advertising a second,
unreachable FD approval step.

## Proposed Solution

Extend the existing `skipFinanceDirectorApproval` computation in `createPurchaseOrder` to also
evaluate true for the two location-driven cases, reusing the already-shipped downstream mechanism
(`getFinanceDirectorSkipApprovalRequirements`, notification routing, pending-queue clauses, frontend
`isFdSkip`) rather than building a parallel "skip the supervisor stage" mechanism. No schema change —
`skipFinanceDirectorApproval` already exists as a `Boolean @default(false)` column; only the
computation of its value changes. No new migration file is needed.

Condition (evaluated once, at PO creation, from data already resolved earlier in the function):

```
skipFinanceDirectorApproval =
  workflowType !== 'food_service' &&
  (
    resolvedEntityType === 'DISTRICT_OFFICE' ||
    (primary LocationSupervisor for data.officeLocationId has supervisorType === 'FINANCE_DIRECTOR') ||
    (fdGroupId && userGroups.includes(fdGroupId))   // existing: requestor is themselves FD
  )
```

The `LocationSupervisor` lookup only runs when `data.officeLocationId` is set and the location isn't
already `DISTRICT_OFFICE` (avoids a redundant query). This mirrors the exact same
`supervisorType === 'FINANCE_DIRECTOR'` value already used and confirmed in the live
`location_supervisors` table for `Finance Department`, and the exact same `entityType ===
'DISTRICT_OFFICE'` check already used for routing at the `submitted` stage elsewhere in this file.

`PurchaseOrderDetail.tsx`: the `DISTRICT_OFFICE_WORKFLOW_STAGES` / `STAGE_WAITING_LABEL` /
`APPROVE_ACTION_LABEL` maps for `isDistrictOfficePO` currently list a second FD-approval step
(`supervisor_approved -> 'Awaiting Finance Director Approval'` / `'Approve as Finance Director'`,
plus a standalone `finance_director_approved` stage) that will now never be reached — District Office
POs will *always* carry `skipFinanceDirectorApproval = true` going forward (the condition is purely
entityType-based, no exceptions). Update these three maps for the `isDistrictOfficePO` branch so
`supervisor_approved` reads "Awaiting Director of Schools Approval" / "Approve as Director of
Schools", and drop the now-unreachable `finance_director_approved` row from the stage list and
labels — mirroring the shape already used by `FD_SKIP_WORKFLOW_STAGES` but keeping the
District-Office-specific "Approve as Finance Director" wording for the `submitted` stage (that part
is correct today and unchanged). `Finance Department` POs need no equivalent edit — they already fall
through to the existing generic `isFdSkip` branch, which is already correct.

## Implementation Steps

### Backend — `purchaseOrder.service.ts`

- `createPurchaseOrder` (around line 206-213): after `resolvedEntityType` is known, add a
  `supervisorIsFinanceDirector` lookup (`this.prisma.locationSupervisor.findFirst({ where: {
  locationId: data.officeLocationId, isPrimary: true, supervisorType: 'FINANCE_DIRECTOR' } })`,
  skipped when there's no `officeLocationId` or `resolvedEntityType === 'DISTRICT_OFFICE'`) and widen
  the `skipFinanceDirectorApproval` boolean to the OR'd condition above.
- Update the doc comment above `skipFinanceDirectorApproval`'s computation and the field comment in
  `schema.prisma` (currently says "Set at creation when the requestor is themselves a Finance
  Director group member") to also mention the two location-driven triggers.
- No changes needed to `approvePurchaseOrder`, `submitPurchaseOrder`, `getPurchaseOrders`, or the
  controller — all already consume the flag generically (see "Why the fix is smaller than it looks").

### Backend — schema

- No column change. `skipFinanceDirectorApproval` already exists
  (`backend/prisma/migrations/20260701120000_add_po_skip_finance_director_approval/migration.sql`).
  Only its doc comment in `schema.prisma` is touched, matching the service comment update above.

### Frontend — `PurchaseOrderDetail.tsx`

- `DISTRICT_OFFICE_WORKFLOW_STAGES` (line 96-102): remove the `finance_director_approved` row;
  relabel the list to `draft / submitted / supervisor_approved ("Finance Director Approved") /
  dos_approved / po_issued`.
- `STAGE_WAITING_LABEL` isDistrictOfficePO branch (lines 188-194): change `'supervisor_approved'`
  from `'Awaiting Finance Director Approval'` to `'Awaiting Director of Schools Approval'`; drop the
  `'finance_director_approved'` entry (unreachable for these POs going forward).
- `APPROVE_ACTION_LABEL` isDistrictOfficePO branch (lines 214-219): change `'supervisor_approved'`
  from `'Approve as Finance Director'` to `'Approve as Director of Schools'`; drop the
  `'finance_director_approved'` entry.
- No changes to `canActAtFdStage`, `canActAtDosStage`, `canActAtDistrictOfficeSupStage`, `canApprove`,
  `canReject`, `canIssue` — all already derive correctly from `isFdSkip`/`isDistrictOfficePO` once the
  backend sets the flag.

### Frontend — `PurchaseOrderList.tsx`, `purchaseOrder.types.ts`

- No changes — both already key off `po.skipFinanceDirectorApproval` generically.

## Dependencies

None — no new packages, no schema/migration change, no new external API usage. Reuses
already-reviewed Prisma 7 query patterns (`locationSupervisor.findFirst`) already used elsewhere in
this same file.

## Risks and Mitigations

- **Flag is creation-time-only**: exactly like the original fix, any PO already sitting in
  `submitted`/`supervisor_approved` for these two locations at deploy time would keep
  `skipFinanceDirectorApproval = false` and stay stuck. Verified live: **zero** such POs exist right
  now, so no backfill is required for this deploy. Flagging for awareness only, not a required
  action.
- **`Finance Department` supervisor changes in the future**: the trigger is keyed off
  `supervisorType === 'FINANCE_DIRECTOR'` on the primary `LocationSupervisor` record, not off Entra
  group membership of that specific user. If a future admin assigns a `FINANCE_DIRECTOR`-typed
  supervisor to a *different* location, that location's POs would also skip the second FD gate. This
  matches the existing precedent (`DISTRICT_OFFICE` is also a blanket, unconditional rule) and is the
  intended generalization — not treated as a bug.
- **District Office self-request + self-supervise gap**: already documented as out-of-scope in the
  prior spec (`po_fd_self_approval_skip_spec.md`) — if the FD requests her own District-Office/Finance
  Department PO, she's blocked at the very first stage by the requestor-self-approval guard
  (`purchaseOrder.service.ts:1075`), a separate, pre-existing gap untouched by this change.

## Build/Test Commands (approved for Phase 3/6)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (runs both of the above)

No other commands are in scope. No FORBIDDEN COMMANDS are used. No database-write commands are used
for this change (the read-only verification queries above were run outside this workflow, ahead of
spec-writing, and are not part of implementation).

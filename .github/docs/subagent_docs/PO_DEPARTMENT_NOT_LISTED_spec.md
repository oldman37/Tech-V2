# PO_DEPARTMENT_NOT_LISTED — Spec

## Current State Analysis

- `RequisitionWizard.tsx` Step 1 has a Department/Program/School/District Office `Select`
  (`officeLocationId`, an FK to a real `OfficeLocation` row) grouped by entity type, populated
  from `GET /locations?types=SCHOOL,DEPARTMENT,PROGRAM,DISTRICT_OFFICE`
  (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx:736-773`).
- `officeLocationId` is now required to advance past Step 1 (`handleStep1Next`, added in the
  prior change in this session) — there is currently no way to submit a requisition for a
  requesting entity that isn't in that list.
- The shared schema (`shared/src/schemas/purchaseOrder.schema.ts`) already has a `program`
  field — `optional().nullable()`, `max(200)` — that is fully plumbed through the type system,
  defaulted to `null` in the wizard's `defaultValues`, and even rendered read-only on
  `PurchaseOrderDetail.tsx:551-555` ("Program" caption) — but **no UI in the wizard currently
  writes to it**. This is exactly the free-text field needed for a manually-entered
  department/program/funding-source name.
- Backend routing in `submitPurchaseOrder()` (`backend/src/services/purchaseOrder.service.ts`)
  already has a well-defined behavior for `officeLocationId === null`: it skips the
  `LocationSupervisor` lookup entirely and falls through to "PRIORITY 2: Personal supervisor
  fallback" (lines ~903-914 in the pre-change file), routing to the requestor's own supervisor.
  This is exactly the routing behavior wanted for a "Not Listed" entity — no code change needed
  there.
- The prior change in this session added a backend gate requiring `po.officeLocationId` at
  submit time. That gate must be relaxed to also accept the "Not Listed" path.

## Problem Definition

Some requesting departments/programs/funding sources aren't in the `OfficeLocation` table (and
won't be added — e.g. a one-off grant or a temporary committee). Users need a way to say "not
listed" and type the name manually, without that name being saved as a reusable location. Since
there's no location record, there's also no address to auto-fill, so ship-to must be supplied
directly (a school pick or a custom address) rather than left blank.

## Proposed Solution

### Frontend (`RequisitionWizard.tsx`)

1. Add a sentinel constant `NOT_LISTED_VALUE = '__not_listed__'` and a new
   `isNotListed` boolean state (`useState`, not a form field — it's UI-only and toggles which
   inputs are shown/required).
2. Add a new `<ListSubheader>Other</ListSubheader>` + `<MenuItem value={NOT_LISTED_VALUE}>`
   at the bottom of the existing grouped `Select`.
3. The `Select`'s `value` becomes `isNotListed ? NOT_LISTED_VALUE : (watchedOfficeLocationId ?? '')`;
   `onChange` calls the existing `handleEntityLocationChange`, now widened to accept the raw
   string value (`''`, `NOT_LISTED_VALUE`, or a real location UUID) and branch three ways:
   - `NOT_LISTED_VALUE` → `isNotListed = true`, `officeLocationId/entityType` cleared to `null`,
     `shipToType` reset to `'custom'`, `shipTo` cleared (there's no entity address to prefill).
   - real id → existing behavior unchanged (`isNotListed = false`, `program` cleared to `null`
     since it no longer applies).
   - `''` → existing "cleared" behavior unchanged (`isNotListed = false`, `program` cleared).
   All three branches clear any stale `officeLocationId` / `program` / `shipTo` manual errors
   and dismiss the two department-related `submitError` banner messages.
4. When `isNotListed`, render a new required `TextField` (via `Controller`, bound to `program`)
   labeled **"Department / Program / Funding Source *"**, with helper text noting it isn't saved
   to the location list. Wrapped in a `ref` (`programFieldRef`) for scroll-into-view on a failed
   Next.
5. Ship-to: no new branch needed — `officeLocationId` stays `null` for "Not Listed", so the
   Ship To radio group already renders its existing "no entity" variant (School / Custom only,
   no "entity address" option) at `RequisitionWizard.tsx:863-907`. That `FormControl` gets a
   `ref` (`shipToRef`) for the same scroll-into-view purpose.
6. `handleStep1Next` gains two checks, evaluated after the existing vendor `trigger`:
   - If nothing is selected (`!isNotListed && !watchedOfficeLocationId`): existing behavior
     (unchanged from the prior change).
   - If `isNotListed`: require `program` (trimmed, non-empty) **and** `shipTo` (trimmed,
     non-empty). Missing either sets a manual RHF error on that field, shows a banner, and
     scrolls to whichever is missing (program takes priority if both are missing).
7. Step 3 Review: the "Department / School / Program" block shows `watchedProgram` (with a
   "Not Listed" chip) instead of the location name when `isNotListed`, so the user can confirm
   what they typed before submitting.
8. No schema change, no new dependency.

### Backend (`purchaseOrder.service.ts`)

Relax the `officeLocationId` submit gate added in the prior change: when `officeLocationId` is
null, accept it **if** `program` and `shipTo` are both present (mirroring the frontend's Not
Listed requirement); otherwise reject as before.

```ts
if (!po.officeLocationId) {
  if (!po.program?.trim()) {
    throw new ValidationError(
      'A Department / Program / School / District Office is required before submitting this requisition',
      'officeLocationId',
    );
  }
  if (!po.shipTo?.trim()) {
    throw new ValidationError(
      'A ship-to address or school is required when no department/program is on file',
      'shipTo',
    );
  }
}
```

No change needed to the routing logic below it — it already treats `officeLocationId === null`
correctly (personal-supervisor fallback).

## Implementation Steps

1. `backend/src/services/purchaseOrder.service.ts` — widen the existing `officeLocationId` gate
   in `submitPurchaseOrder()` as above.
2. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`:
   - add `NOT_LISTED_VALUE`, `NOT_LISTED_INCOMPLETE_MESSAGE` constants
   - add `isNotListed` state, `programFieldRef`/`shipToRef` refs, `watchedProgram` watch
   - add a `clearDepartmentBanner` helper (dismisses either department-related banner message)
   - widen `handleEntityLocationChange` to a 3-way branch on the raw select value
   - add the "Other / Not Listed" menu group
   - add the conditional Program `TextField`
   - attach `ref={shipToRef}` to the no-entity Ship To `FormControl`
   - update `handleStep1Next` with the Not Listed validation
   - update Step 3 Review's department block

## Dependencies

None — reuses `react-hook-form` APIs already in use in this file (`setError`, `clearErrors`,
`Controller`) and the existing `program` schema field. No Prisma migration.

## Risks and Mitigations

- **Risk:** A typed department name could collide in spirit with a real, un-selected location
  (typo instead of genuine "not listed"). **Mitigation:** out of scope — same trust level as
  any other free-text field on this form (e.g. Notes); no dedupe/validation against the
  locations list is implied by the request.
- **Risk:** Backend gate divergence from frontend (bypass via direct API call with
  `officeLocationId: null` and no `program`). **Mitigation:** backend gate mirrors the frontend
  rule exactly, so a direct call still needs `program` + `shipTo` to succeed.
- **Risk:** Existing drafts/POs with `officeLocationId: null` and no `program` (created before
  this feature, if any) would still correctly fail the submit gate — this is desired, not a
  regression, since such POs were never submittable per the immediately prior change.

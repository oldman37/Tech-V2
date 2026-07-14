# PO_DEPARTMENT_REQUIRED — Spec

## Current State Analysis

- The Purchase Order request form (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`) collects the
  requesting entity in a field labeled **"Department / Program / School / District Office"**
  (form field name: `officeLocationId`, Step 1 of 3, `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx:714-751`).
- `officeLocationId` is `optional().nullable()` in the shared Zod schema
  (`shared/src/schemas/purchaseOrder.schema.ts:85-89`), used by both the frontend `zodResolver`
  and (indirectly, via `CreatePurchaseOrderInput`) the backend create path.
- Step 1 → Step 2 navigation (`handleStep1Next`, line 364) only validates `vendorId`.
  The "Submit for Approval" button (Step 3, line 1149) calls `handleSaveAndSubmit`, which runs
  `handleSubmit(...)` (schema validation only — `officeLocationId` currently always passes) and
  then creates + submits the PO with no client-side department check.
- The backend already has one precedent for a submit-time-only required field: `accountCode` is
  optional at creation but gated in `backend/src/services/purchaseOrder.service.ts` inside
  `submitPurchaseOrder()` (lines 816-824), which throws a `ValidationError('...', 'accountCode')`
  when the requestor is a Finance Director and no account code was captured. This is the correct
  pattern to mirror — `officeLocationId` stays optional on **draft** creation/save, but is
  required to **submit**.
- Confirmed via `backend/src/services/purchaseOrder.service.ts:832-914` that `officeLocationId`
  is genuinely optional today at the routing level (there is a personal-supervisor fallback for
  POs with no entity location) — so this is a new business rule, not a bug fix for broken routing.

## Problem Definition

Users can currently submit a purchase order requisition without selecting a Department / Program /
School / District Office. The business requirement is: **department must be selected before the
requisition can be submitted for approval** (draft save is unaffected). If a user clicks
"Submit for Approval" without one selected, they must be taken to the missing field (Step 1) and
shown a visible error there, rather than silently failing or submitting incorrectly-routed data.

## Proposed Solution

### Frontend (`RequisitionWizard.tsx`)

1. Destructure `setError` and `clearErrors` from `useForm()` (react-hook-form) alongside the
   existing `control, register, handleSubmit, watch, setValue, trigger`.
2. Add a `useRef<HTMLDivElement>` (`officeLocationRef`) attached to the `FormControl` that wraps
   the Department/Program/School/District Office `Select` (line 714), so it can be scrolled into
   view programmatically.
3. Add `useEffect`/`useRef`-based scroll: a `scrollToOfficeLocation` boolean state flag; when
   `activeStep` becomes `0` and the flag is set, scroll `officeLocationRef.current` into view
   (`block: 'center', behavior: 'smooth'`) and clear the flag.
4. In `handleSaveAndSubmit`, before running the existing `handleSubmit(...)` submission logic,
   check `watchedOfficeLocationId`. If falsy:
   - `setError('officeLocationId', { type: 'manual', message: 'Select a Department / Program / School / District Office before submitting' })`
   - `setSubmitError('Please select a Department / Program / School / District Office before submitting.')`
   - `setActiveStep(0)` and set the scroll-to flag
   - return without creating/submitting the PO (no wasted draft creation)
5. Clear the manual error as soon as a location is chosen: add `clearErrors('officeLocationId')`
   inside `handleEntityLocationChange` when `locId` is truthy.
6. No change to `handleSaveDraft` — saving a draft without a department stays allowed, matching
   the "required to submit" requirement (not "required to save").
7. No change to the submit button's `disabled` state (it stays gated only on `isSaving` /
   `accountCodeMissing` as today) — per the request, clicking Submit is what triggers the
   redirect-to-field behavior, rather than a silently disabled button.

### Backend (`purchaseOrder.service.ts`)

Add a submit-time gate in `submitPurchaseOrder()`, immediately after the existing `accountCode`
gate (after line 824), mirroring its shape:

```ts
if (!po.officeLocationId) {
  throw new ValidationError(
    'A Department / Program / School / District Office is required before submitting this requisition',
    'officeLocationId',
  );
}
```

This is defense-in-depth server-side enforcement (per CLAUDE.md: authorization/validation must
not rely on the frontend alone) and requires no schema/migration changes since `officeLocationId`
is an existing column already read into `po` above.

## Implementation Steps

1. `shared/src/schemas/purchaseOrder.schema.ts` — **no change** (officeLocationId stays optional
   for draft create/update).
2. `backend/src/services/purchaseOrder.service.ts` — add the `officeLocationId` gate in
   `submitPurchaseOrder()`.
3. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`:
   - import `useEffect`, `useRef` from `react`
   - destructure `setError`, `clearErrors` from `useForm()`
   - add `officeLocationRef`, `scrollToOfficeLocation` state, and the scroll `useEffect`
   - attach `ref={officeLocationRef}` to the Department FormControl
   - add the pre-submit department check in `handleSaveAndSubmit`
   - add `clearErrors('officeLocationId')` in `handleEntityLocationChange`

## Dependencies

None — uses only `react` (`useEffect`, `useRef`, already-installed) and `react-hook-form`
(`setError`, `clearErrors`, already in use elsewhere in this file). No new packages, no Prisma
schema change, no migration required.

## Configuration Changes

None.

## Risks & Mitigations

- **Risk:** Blocking submit for existing draft POs that predate this rule and have no
  `officeLocationId`. **Mitigation:** They can still open the draft, pick a department on Step 1,
  and submit — no data migration needed since the field already exists and is nullable.
- **Risk:** Client-side-only enforcement could be bypassed by calling the submit API directly.
  **Mitigation:** Backend gate added in `submitPurchaseOrder()` closes this gap.
- **Risk:** Manual `setError` could persist stale after a valid resubmission cycle.
  **Mitigation:** `clearErrors('officeLocationId')` fires whenever a location is (re)selected.

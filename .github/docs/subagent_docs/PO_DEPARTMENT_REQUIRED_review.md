# PO_DEPARTMENT_REQUIRED — Review

## Spec Compliance

Implementation matches the spec exactly:

- Backend gate added in `submitPurchaseOrder()` (`backend/src/services/purchaseOrder.service.ts`),
  immediately after the existing `accountCode` gate, throwing `ValidationError` with field
  `'officeLocationId'` when `!po.officeLocationId`. Mirrors the existing pattern precisely.
- `officeLocationId` remains optional in `shared/src/schemas/purchaseOrder.schema.ts` — draft
  create/save is unaffected, as required.
- Frontend (`RequisitionWizard.tsx`):
  - `handleSaveAndSubmit` is now a plain function that checks `watchedOfficeLocationId` first.
    If missing: sets a manual RHF error on `officeLocationId`, sets a page-level `Alert` via
    `setSubmitError`, jumps to Step 1 (`setActiveStep(0)`), and flags a scroll-into-view.
    If present: delegates to `submitPO` (the original `handleSubmit(...)`-wrapped submit logic,
    renamed but otherwise untouched).
  - A `useEffect` scrolls `officeLocationRef` into view once `activeStep === 0` and the scroll
    flag is set, then clears the flag — avoids scrolling before the Step 1 panel is mounted.
  - `clearErrors('officeLocationId')` is called in `handleEntityLocationChange` whenever a
    location is chosen, so the manual error doesn't linger after the user fixes it.
  - The Department `FormControl` (already wired to `errors.officeLocationId` for its `error`/
    `FormHelperText` display) now also holds `ref={officeLocationRef}` — no visual/behavioral
    change to that field besides displaying the new error when applicable.
  - Save as Draft (`handleSaveDraft`) is untouched — department stays optional for drafts.

## Best Practices / Consistency

- Directly mirrors the existing `accountCode` "required-to-submit-only" pattern already in this
  same service method and component — same shape of `ValidationError`, same
  `errors.<field>`-driven display convention already used throughout the form.
- No new dependencies; `useEffect`/`useRef` and `setError`/`clearErrors` are already
  idiomatic React / react-hook-form APIs used elsewhere in this codebase.

## Completeness

- Client-side UX requirement satisfied: clicking Submit with no department jumps to Step 1,
  highlights the field with an inline error, shows a page-level alert, and scrolls it into view.
- Server-side enforcement closes the gap where a direct API call could bypass the frontend check
  (per CLAUDE.md: authorization/validation must not rely on the frontend alone).

## Security

- No new attack surface. The added backend check is a stricter validation gate, not a relaxation.
- No Entra group IDs / raw Graph payloads touched.

## Performance

- No N+1 queries introduced — the new check reads `po.officeLocationId`, already loaded by the
  existing `findUnique` call at the top of `submitPurchaseOrder`.

## Build Validation

Per CLAUDE.md, `docker compose -f docker-compose.dev.yml build backend` and `build frontend`
are the only approved build commands (host has no `node_modules`). Results captured in
`PO_DEPARTMENT_REQUIRED_review_final.md` after Phase 6 preflight runs (same command, so no
separate build step run here to avoid duplicating Phase 6).

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |

**Overall Grade: A (100%)** — pending Phase 6 preflight (Docker build) confirmation.

## Returns

- PASS (build validation deferred to Phase 6 preflight, per CLAUDE.md to avoid duplicate builds)

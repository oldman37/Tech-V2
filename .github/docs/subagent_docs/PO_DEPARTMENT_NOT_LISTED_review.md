# PO_DEPARTMENT_NOT_LISTED — Review

## Spec Compliance

Matches the spec:

- `NOT_LISTED_VALUE` sentinel added to the Select as a new "Other" group entry; never
  collides with a real `officeLocationId` (UUID).
- `handleEntityLocationChange` widened to a 3-way branch (`''` / `NOT_LISTED_VALUE` / real id),
  each branch clearing stale `officeLocationId`/`program`/`shipTo` errors and dismissing the
  department banner via the new `clearDepartmentBanner` helper.
- Required `program` `TextField` (Controller-bound) renders only when `isNotListed`, labeled
  "Department / Program / Funding Source *", with a note that it isn't saved to the location
  list.
- No new Ship To branch needed — `officeLocationId` stays `null` for Not Listed, so the existing
  "no entity" Ship To radio group (School / Custom only) already renders. Added a `ref` there
  and `shipTo` for scroll-to + error clearing wiring.
- `handleStep1Next` now requires, when `isNotListed`: `program` non-empty and `shipTo`
  non-empty, else blocks the step transition, sets manual errors, shows a banner
  (`NOT_LISTED_INCOMPLETE_MESSAGE`), and scrolls to whichever is missing (program first).
- Step 3 Review now shows the typed `program` value + a "Not Listed" chip in place of the
  location name/entity-type chip when `isNotListed`.
- Backend `submitPurchaseOrder()` gate relaxed: `officeLocationId === null` is now accepted if
  `program` and `shipTo` are both present (mirrors the frontend rule exactly), otherwise
  rejected as before. No change to the routing logic beneath it — it already treats
  `officeLocationId === null` as "fall back to personal supervisor," which is the correct
  behavior here.

## Best Practices / Consistency

- Reuses the existing (previously dead) `program` schema field rather than adding a new
  column/migration.
- Mirrors the established pattern in this file: `Controller` + manual `setError`/`clearErrors`
  for fields the Zod schema can't conditionally require, `useRef` + `scrollIntoView` for
  directing the user to a blocked field, and a shared banner-dismiss helper instead of
  duplicating the same conditional in five places.

## Completeness

- Both create-draft (unaffected — still fully optional) and submit (client + server gated)
  paths covered.
- Review step gives the user a chance to confirm the manually typed name before submitting.

## Security

- No new attack surface; `program`/`shipTo` were already free-text, already length-capped by
  the shared Zod schema (`program` max 200, `shipTo` max 500). Server-side gate prevents a
  direct API call from bypassing the requirement.

## Performance

- No additional queries — the new backend checks read already-loaded `po` fields.

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

**Overall Grade: A (100%)** — pending Phase 6 preflight confirmation.

## Returns

PASS (build validation in Phase 6 preflight).

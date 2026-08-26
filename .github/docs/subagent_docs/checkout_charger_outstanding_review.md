# Review: Charger-outstanding checkout row

## Files reviewed
- `backend/src/services/deviceAssignment.service.ts` — `getActiveAssignments` restructured,
  new `checkinCharger`
- `backend/src/controllers/deviceAssignment.controller.ts` — `checkinCharger` passthrough
- `backend/src/routes/deviceAssignment.routes.ts` — `POST /:id/charger/checkin`
- `frontend/src/services/deviceAssignment.service.ts` — `checkinCharger` client method
- `frontend/src/pages/DeviceManagement/CheckoutPage.tsx` — helper, status chip, actions,
  mutation, confirm dialog

## Findings
- **Spec compliance**: all five implementation steps landed as specified.
- **Filter composition preserved**: all six pre-existing filters (`userId`, `equipmentId`,
  `assigneeType`, `cartId` via `sourceType` x2, `locationId` via `campusId`,
  `user.gradeLevel`) remain top-level `where` keys, ANDed implicitly by Prisma with
  `where.AND`. Verified line by line against the pre-change source.
- **The two-OR hazard is explicitly handled**: the search clause is `andConditions.push(...)`,
  not `where.OR =`, so neither assignment can silently overwrite the other. A code comment
  records why.
- **Bug 2 fixed for free**: the charger-serial clause was already present in the search `OR`;
  it simply never ran. No search-query change was made or needed.
- **`checkin()` untouched**: its unconditional device-side close, equipment reset, and 409
  re-checkin guard are all byte-identical. The 409 is exactly why `checkinCharger` exists.
- **New endpoint matches the sibling exactly**: `validateCsrfToken`,
  `requireDeviceManagementAccess()`, `validateRequest(AssignmentIdParamSchema, 'params')` —
  the same stack as `POST /:id/charger`. **No new permission tier, no CSRF bypass.**
  No new Zod body schema (empty body); `AssignmentIdParamSchema` was already imported.
- **Service correctness**: 404 when no charger assignment exists, 409 when already returned,
  and a single transaction marking it returned + freeing the physical charger. Returns the
  refreshed parent with full relations (verified `location` and `checkedOutByUser` relations
  exist on `DeviceAssignment` in the schema before including them).
- **Frontend correctness**: `isChargerOutstandingOnly` gates both the warning `Chip` and the
  single "Check In Charger" action, so the device-targeting buttons — which would 409 —
  cannot be reached for those rows. `chargerCheckinMutation` invalidates
  `['device-assignments', 'active']`, matching the existing `checkinMutation` pattern.
  `Chip` was already imported; `DialogActions`/`DialogTitle` added as the only new imports.
- **Performance**: the widened predicate adds a nested relation condition on
  `ChargerAssignment.returnedAt`, which carries `@@index([returnedAt])` in the schema.
- **Security**: no response-shape leak, no Graph payload, mutating route is CSRF-protected
  and authorization-gated in the backend.

## Build & test validation
- `docker compose ... build backend` -> **EXIT=0**, `Image tech-v2-backend Built`.
- `docker compose ... build frontend` -> **EXIT=0**, `Image tech-v2-frontend Built`.
- `docker compose ... --profile test run --build --rm backend-test` -> **EXIT=0**,
  **Test Files 9 passed (9) / Tests 67 passed (67)**. `db-test` torn down.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS

## Confirmed: no schema change needed
`ChargerAssignment.returnedAt` / `returnedBy` already exist in `schema.prisma`. **No Prisma
schema edit and no migration file** are part of this change.

## Not independently verified
A live click-through: checking a device in with "charger returned? No", confirming the row
persists with the warning chip, searching the charger serial, and closing it out via the new
button. There is no automated test covering `getActiveAssignments`.

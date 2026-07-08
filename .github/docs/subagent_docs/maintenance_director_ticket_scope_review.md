# Review: Maintenance Director Ticket Scope Fix

## Scope Reviewed
- `backend/src/utils/groupAuth.ts` — `isMaintenanceDirector()`
- `backend/src/controllers/work-orders.controller.ts` — `getMaintenanceRole()`
- `backend/src/services/work-orders.service.ts` — `MaintenanceRole` type, `assertTicketAccess()`,
  `getWorkOrders()`
- `backend/src/__tests__/helpers/db.ts` — `createTestWorkOrder()` department override
- `backend/src/__tests__/workorders-maintenance-director-scope.test.ts` — new regression test

## Findings

1. **Specification Compliance** — Implementation matches
   `maintenance_director_ticket_scope_spec.md` exactly: `isMaintenanceDirector()` added,
   `getMaintenanceRole()` extended with `'director'`, both `getWorkOrders()` (baseWhere +
   permLevel-4 scope) and `assertTicketAccess()` (permLevel-4 branch) updated to grant
   district-wide `department === 'MAINTENANCE'` access with no location restriction, mirroring
   the existing `county_wide` pattern.
2. **Security** — Access widening is correctly bounded: a Director can now see every MAINTENANCE
   ticket district-wide, but `assertTicketAccess` still explicitly denies (403) any ticket where
   `department !== 'MAINTENANCE'`, so a Director cannot use this change to reach Technology
   tickets outside their supervised locations. No new fields exposed to the frontend; this is a
   backend-only authorization change.
3. **Consistency** — New code follows the exact structural pattern of the pre-existing
   `county_wide` branches (same comment style, same "district-wide because baseWhere already
   forces department" reasoning applied one level down at permLevel 4).
4. **Completeness** — Both code paths that enforce ticket visibility (`getWorkOrders` list,
   `assertTicketAccess` single-ticket, which gates `getWorkOrderById`/`updateWorkOrder`/
   `updateStatus`/`assignWorkOrder`/`deleteWorkOrder`) were updated; nothing was missed.
5. **Regression risk** — `createTestWorkOrder`'s new `department` param is optional and defaults
   to the prior hardcoded `'TECHNOLOGY'`, so the three existing callers in
   `workorders-scope.test.ts` are unaffected.
6. **Test coverage** — New test file covers: (a) list includes the MAINTENANCE ticket despite no
   `LocationSupervisor` row for the Director (reproducing the exact pre-fix failure mode), (b)
   list excludes a TECHNOLOGY ticket at the same location, (c) direct GET succeeds for the
   MAINTENANCE ticket, (d) direct GET is denied (403) for the TECHNOLOGY ticket.
7. **Known accepted edge case** (documented in spec §7, not a defect requiring a fix): if a real
   user were simultaneously in `ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID` and
   `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID`, `getMaintenanceRole()`'s fixed check order returns
   `'county_wide'` first, so the permLevel-4 scope branch would take the location-restricted path
   instead of the director's unrestricted path — `baseWhere.department` is still forced to
   `MAINTENANCE` either way, so no ticket outside Maintenance ever leaks; visibility would just be
   narrower than intended in this specific dual-membership scenario. No such user is known to
   exist in the configured groups.

## Build Validation

Phase 6 Preflight caught a real gap this review's initial pass missed: `docker compose -f
docker-compose.dev.yml --profile test run --rm backend-test` does not rebuild the image by
default, so the first preflight run silently executed against a stale cached image and never ran
the new test file at all (5 test files reported instead of 6). After forcing an image rebuild, the
new tests ran and 2 of 3 failed with 403 — because the `backend-test` service's `environment:`
block in `docker-compose.dev.yml` never defined `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID`, so
`requireModule('WORK_ORDERS', 1)` denied the request before the new authorization logic was ever
reached. Fixed by adding `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID: test-maintenance-director-group-id`
to that block. A clean full preflight run afterward (`scripts/preflight.ps1`, both Docker image
builds + Dockerized vitest run) passed end-to-end: **6 test files, 38 tests, all passing**,
including all 3 new Maintenance Director scope tests.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A (one fewer DB query on the director path) |
| Consistency | 100% | A |
| Build Success | 100% (6/6 files, 38/38 tests) | A |

**Overall Grade: A**

## Result: PASS

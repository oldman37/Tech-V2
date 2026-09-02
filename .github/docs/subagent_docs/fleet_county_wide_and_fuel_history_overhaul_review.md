# Fleet Management: County-Wide Vehicles + Fuel History Overhaul — Review

## Scope Reviewed

All files listed under "Modified Files" in the commit message below, against the spec at
`.github/docs/subagent_docs/fleet_county_wide_and_fuel_history_overhaul_spec.md`.

## Findings

### Specification Compliance
Implementation matches the spec's four sections 1:1 — `isCountyWide` flag (schema, migration,
validators, service, unit form/table), county-wide-aware Log Fuel vehicle select, removal of the
automated monthly cron trigger, and the aggregated `getMonthlySummary` My Fuel History rewrite
(month default/search, mileage-based miles driven, one row per user+vehicle+month, CSV export,
expand-to-delete dialog in place of a per-row delete).

### Best Practices / API Currency
- Prisma 7: additive column + index via a hand-written migration file (no `prisma migrate dev`),
  consistent with the project's Docker-only workflow.
- Zod 4: new schemas (`isCountyWide`, `MonthlySummaryQuerySchema`) use the same idioms
  (`.optional()`, `.regex()`) as every existing schema in the file — no deprecated patterns.
- Express 5 / route ordering: `/summary` and `/my-summary` are registered before the existing
  `/:id` param route, matching the pattern already used for `/my-entries`.

### Functionality
- **Build**: `docker compose -f docker-compose.dev.yml build backend` and `build frontend` both
  pass (see Build Result below; one issue was found and fixed — see Refinement Note).
- **Migrations**: both new migration files were exercised for real by
  `docker compose --profile test run --build --rm backend-test`, which runs
  `prisma migrate deploy` against a disposable Postgres test container before the test suite —
  they applied cleanly.
- **Tests**: the full existing vitest suite (11 files / 71 tests) passed unchanged — no
  regressions in unrelated modules.
- Miles-driven math verified by inspection: `latestMileage` is the max mileage reading within the
  target month per (user, unit); `previousMileage` is the max reading for the same pair in the
  prior month, fetched in one bulk query; `milesDriven = latestMileage - previousMileage`, `null`
  when there's no prior-month reading — matches the user-confirmed calculation.

### Code Quality
- `getMonthlySummary` avoids N+1 queries: exactly two `findMany` calls (current month, then a
  bulk previous-month lookup scoped to the user/unit ids actually present), with grouping/joining
  done in memory — matches the project's performance guidance for Prisma usage.
- Orphaned code created by this change was removed rather than left behind: the now-unreachable
  `TransportationReportService.runMonthlyReportJob()` and its now-unused
  `sendGasThresholdAlertEmail` import, the `scheduler.service.ts` `TransportationReportService`
  import, the frontend `Chip` import in `FuelEntryPage.tsx`, and the `seed.ts` entry for the
  removed job key.
- No unrelated refactors — every changed line traces to one of the seven requested items.

### Security
- New `GET /api/fuel-entries/summary` requires `requireModule('TRANSPORTATION', 2)`; `GET
  /api/fuel-entries/my-summary` requires level 1 and always self-scopes
  (`getMonthlySummary(..., 1)` regardless of the caller's actual level), mirroring the existing
  `getMyEntries` pattern — a level-1 caller cannot see another user's fuel data through either
  route.
- `isCountyWide` create/update stays behind the existing `requireModule('TRANSPORTATION', 2)`
  gate on the unit routes — no new write surface was added.
- No Entra group IDs or raw Graph payloads are exposed by any new endpoint or type.
- Both new GET routes are reads with no CSRF exposure, consistent with every other GET route in
  the file (CSRF is only applied to the existing POST/PUT/DELETE fuel-entry routes, unchanged).

### Performance
No N+1s introduced (see Code Quality). The aggregated queries are scoped to one reporting month
at a time and, for level 1, to one user — bounded by a single driver's/vehicle's fill-up volume
per month.

### Consistency
- Frontend: new page code follows the existing page-local patterns exactly — `useFilterParams`
  for URL-backed filters, `@tanstack/react-query` for data fetching/mutations, `ResponsiveTable`
  for the summary grid, and a page-local CSV export function copied from the established
  `ReportsPage.tsx` pattern rather than inventing a shared util.
- Backend: new service method, routes, and controller actions mirror the existing
  `getAll`/`getMyEntries` shapes and middleware chains line for line.

### Build Success
- Backend image build: **PASS** (after one fix — see below).
- Frontend image build: **PASS**.
- Full preflight (`scripts/preflight.ps1`, all 3 steps including migration deploy + vitest): **PASS**.

## Refinement Note (resolved inline, not a separate cycle)

First backend build attempt failed:
```
src/services/fuelConsumption.service.ts(183,26): error TS5076: '??' and '||' operations cannot be mixed without parentheses.
```
Fixed by parenthesizing the `||` fallback inside the `??` expression in `getMonthlySummary`'s
`userName` computation. Backend image rebuilt clean on the next attempt, and the full preflight
run (builds + migration deploy + vitest) subsequently passed end to end, so this is reported
as part of the initial review rather than a separate Phase 4/5 cycle.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 98% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99.75%)**

## Result: PASS

Proceeding to Phase 6 Preflight (already exercised above via `scripts/preflight.ps1`) and Phase 7.

## Post-Review Addendum (found via live dev-server testing)

The user logged a real test entry on the running dev deployment and it did not appear under My
Fuel History. Investigation (read-only `psql` query against the dev `tech_v2` database) found the
entry's `reportingMonth` was `2026-08` even though `entryDate` was `2026-09-01`. Root cause,
confirmed by reproducing it directly in the backend container (`node -e "new
Date('2026-09-01').getMonth()"` → `7`, i.e. August): `fuelConsumption.service.ts` parsed the
date-only `entryDate` string with `new Date(str)`, which JS parses as UTC midnight; the backend
container runs with `TZ=America/Chicago`, and `toReportingMonth()` reads local date components —
so UTC midnight on the 1st of a month reads back as ~6–7pm local time on the *last day of the
previous month*, misclassifying `reportingMonth` specifically for entries dated the 1st. This bug
pre-dates this feature (same `new Date(data.entryDate)` call existed in the prior `create()`), but
was invisible before because the old page had no month-filtered aggregation for level 1 users to
expose it.

A second, related gap was also found while investigating: `create()`'s level-1 authorization check
still required the selected unit to exactly match the caller's assignment, with no exception for
`isCountyWide` units — meaning item 7 (Log Fuel offering county-wide vehicles) was only wired up
on the frontend; a driver actually submitting a different, county-wide unit would have been
rejected server-side with a 400.

**Fixes applied** (`backend/src/services/fuelConsumption.service.ts`):
- New `parseEntryDate()` helper parses a date-only `YYYY-MM-DD` string as a local calendar date
  (`new Date(y, m-1, d)`) instead of UTC midnight; used by both `create()` and `update()` in place
  of the raw `new Date(data.entryDate)` calls. Full ISO timestamps (containing `T`) are unaffected.
- `create()`'s level-1 unit-match check now allows the selected unit through when
  `transportationUnit.isCountyWide` is true, matching the frontend's county-wide picker.

Re-ran the full preflight (`scripts/preflight.ps1`) after both fixes: backend build, frontend
build, migration deploy, and all 71 existing tests — all passed, no regressions.

- The `a43dbb05-75f8-4e98-bc9c-f3d748c61e28` test row's `reportingMonth` was corrected from
  `2026-08` to `2026-09` via a direct, user-approved `UPDATE` against the dev database.
- The fix is only in the rebuilt image; the *running* dev containers still have the old code until
  redeployed (`docker compose -f docker-compose.dev.yml up -d backend`), which is the user's call
  per project rules, not something run automatically here.

## Second Post-Review Addendum (found via a second round of live testing)

The user logged a second entry for the same vehicle in the same month and reported that
"Previous Mileage"/"Miles Driven" still didn't populate. Root cause: the original
`getMonthlySummary` design only ever compared the current month's latest reading against the
*prior calendar month's* last reading — for a vehicle with no data before this month (as in this
test), that comparison is legitimately empty, so both fields stayed blank even with two fill-ups
logged in the same month.

Clarified with the user (see conversation) that the intended behavior is to chain consecutive
fill-ups instead: `previousMileage` should be the reading from the fill-up immediately before the
latest one, whether that fill-up was earlier in the same month or the last one from the prior
month (used only when the current month has just one fill-up so far). Rewrote
`getMonthlySummary` in `fuelConsumption.service.ts` accordingly — entries are grouped
chronologically per (user, unit) and `previousMileage`/`latestMileage` are read from the last two
entries in that order, rather than taking a numeric `MAX()` per calendar month. Re-ran the full
preflight after the change: both builds, migration deploy, and all 71 tests passed.

## Third Post-Review Addendum (skipped-month gap + two UX requests)

Follow-up fix: the prior-reading fallback only looked back exactly one calendar month, so a
vehicle that skipped a month (fueled in July, nothing in August, fuels again in September) would
show "—" instead of chaining back to July. Replaced the one-month-back query with an unbounded
lookback — `findMany` filtered to `entryDate < start of target month`, using Prisma's `distinct`
on `(enteredById, transportationUnitId)` ordered `entryDate desc` (translates to Postgres
`DISTINCT ON`) to fetch exactly one row per pair in a single query, however many months back the
last reading was. `previousReportingMonth()` was removed (no longer used) in favor of a
`monthStartDate()` helper.

Two additional UX changes to `MyFuelHistoryPage.tsx`, both frontend-only:
- Replaced the click-to-open detail **Dialog** with an in-place **collapsible table row**
  (`Collapse` + expand/collapse chevron), matching the existing pattern already used in
  `DeviceManagement/CheckedOutCartsPage.tsx` (`CartRow`) — a plain MUI `Table`/`TableRow` instead
  of `ResponsiveTable`, since the latter's expand mechanism is for fitting hidden columns, not
  arbitrary per-row content. Delete (level ≥3) still lives inside the expanded fill-up list.
- CSV export now includes fuel station location(s). Each row's distinct locations (from its
  underlying fill-ups, in first-seen order) are computed client-side; the export adds a
  `Location` column, and a `Location 2`, `Location 3`, etc. column for every row that used more
  than one station that month (column count is the max distinct-location count across the
  exported rows, so single-location rows just leave the extra columns blank).

Re-ran the full preflight after these changes: both builds, migration deploy, and all 71 tests
passed.

## Fourth Post-Review Addendum (manual starting-mileage baseline)

New request: let a user backfill the previous month's last reading when they have no fuel-log
history before the currently viewed month at all (e.g. didn't use this system last month), so
Miles Driven can compute instead of showing "—" indefinitely.

Added a small, purpose-built model rather than repurposing `FuelConsumptionEntry` (which requires
real fuel/cost/station fields that don't apply to a one-time mileage seed):

- **Schema** (`backend/prisma/schema.prisma`): new `FuelMileageBaseline` model —
  `(transportationUnitId, userId)` unique, `mileage`, `asOfMonth` (YYYY-MM), `enteredById` — plus
  migration `20260901130000_add_fuel_mileage_baseline`.
- **Backend**: `UpsertFuelMileageBaselineSchema` validator; `FuelConsumptionService
  .upsertMileageBaseline()` (level 1 restricted to their own assigned/county-wide unit via a new
  shared `assertUnitAccessibleToDriver()` helper — refactored out of `create()`'s existing check
  rather than duplicated; level 2+ can set on behalf of any user); `PUT /api/fuel-entries/baseline`
  route (registered before the existing `PUT /:id` to avoid the literal-vs-param collision).
  `getMonthlySummary()` now falls back to a baseline's `mileage` as `previousMileage` only when no
  real `FuelConsumptionEntry` predates the target month for that (user, unit) pair — real history
  always takes precedence, so the baseline self-retires once genuine data exists.
- **Frontend**: `fuelEntryApi.setMileageBaseline()`; a "Set Starting Mileage" affordance on
  `MyFuelHistoryPage.tsx` — shown in the Previous Mileage cell (desktop) and inside the expanded
  row (always, so it's reachable on mobile too) whenever `previousMileage` is `null` — opening a
  small dialog that takes just the mileage number (the "as of" month is derived automatically as
  the month before the one being viewed, shown as read-only context text, not a separate field).

Re-ran the full preflight after this change: both builds, the new table's migration deploying
cleanly, and all 71 tests passed.

## Fifth Post-Review Addendum (mobile card view regression)

User reported My Fuel History wasn't switching to card view on mobile, and asked for the rest of
Fleet Management to be checked for the same issue.

Root cause: the third addendum's collapsible-table rewrite replaced `ResponsiveTable` (which
auto-switches to a card list below the mobile breakpoint) with a bespoke MUI `Table`, and only
conditionally hid two columns on mobile — it never gained a real card layout, so mobile users saw
a cramped, horizontally-scrolling table instead.

Audited every other page under Fleet Management (`frontend/src/pages/Transportation/*.tsx`):
`TransportationUnitsPage`, `TransportationUnitDetailPage`, `MvrRecordsPage`,
`DriverLicensePage`, `DotPhysicalsPage`, and `TransportationReportsPage` all use `ResponsiveTable`
for their primary lists and switch to card view correctly — no regression there.
`DotPhysicalsPage` has one secondary, pre-existing raw `<Table>` (a physicians reference-data
management list inside a dialog), unrelated to this feature and not modified — noted here, not
fixed, since it predates this work and isn't part of Fleet Management's primary mobile flows.

Fix: rebuilt `MyFuelHistoryPage.tsx`'s row rendering into the same dual-mode pattern already used
by `DeviceManagement/CheckedOutCartsPage.tsx` — a `FuelSummaryRow` (desktop `Table`/`Collapse`,
unchanged) and a new `FuelSummaryCard` (mobile `Paper`-based card with its own expand toggle),
switched with `{isMobile ? <card list> : <table>}`. The individual-fill-up list markup (with the
county-wide "Set Starting Mileage" prompt and level-≥3 delete) was factored into a shared
`FuelEntryList` component so both modes render identical expand content without duplication.

Re-ran the full preflight after this fix: both builds and all 71 tests passed.

## Sixth Post-Review Addendum (Log Fuel: searchable vehicle picker + make/model label)

User asked for two changes to Log Fuel's vehicle picker:
1. Make the vehicle dropdown searchable.
2. Show make/model instead of vehicle type in the option label.

Changes:
- `backend/src/services/transportationUnit.service.ts`: `getActiveForFuel()` now also selects
  and returns `make`/`model` (previously only `id`, `unitNumber`, `type`, `fuelType`,
  `isCountyWide`).
- `frontend/src/services/transportation.service.ts`: `getActiveForFuel()`'s return type extended
  to match (`make: string | null; model: string | null`).
- `frontend/src/pages/Transportation/FuelEntryPage.tsx`: replaced the vehicle `Select` with an
  MUI `Autocomplete` (filters as you type, same options/value semantics — `onChange` still just
  sets `unitId`). Added a `unitLabel()` helper used for both the Autocomplete's option label and
  its selected-value display: shows `"<unitNumber> — <make> <model> (<fuelType>)"` when a unit has
  a make and/or model set, falling back to the existing `"<unitNumber> — <type label>
  (<fuelType>)"` format when neither is set (some fleet vehicles don't have make/model recorded),
  with the `" — County-Wide"` suffix preserved either way. No schema/migration change — `make`/
  `model` already existed on `TransportationUnit`.

No route or validator changes were needed — `getActiveForFuel` is a read-only endpoint whose
payload just gained two more columns from an already-permitted select.

Re-ran the full preflight after this change: both `docker compose -f docker-compose.dev.yml build
backend` and `build frontend` completed with no TypeScript errors.

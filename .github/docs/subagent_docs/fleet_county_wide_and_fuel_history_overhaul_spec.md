# Fleet Management: County-Wide Vehicles + Fuel History Overhaul — Spec

## Current State Analysis

### Vehicles / Fleet Management
- Prisma model `TransportationUnit` (`backend/prisma/schema.prisma`, `@@map("transportation_units")`): `id, unitNumber, vin?, year?, make?, model?, type, fuelType, currentMileage, capacity?, licensePlate?, isActive, notes?, createdAt, updatedAt` + relations `assignments`, `fuelEntries`. No boolean flag exists for "county-wide" or any pool/shared-vehicle concept. The only unrelated "county-wide" concept in the repo is `ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID`, an AD-group-derived runtime role used solely by Work Orders/Maintenance (`backend/src/utils/groupAuth.ts`, `isCountyWideMaintenance()`) — not a DB field, and out of scope here.
- CRUD: `backend/src/routes/transportationUnit.routes.ts` → `backend/src/controllers/transportationUnit.controller.ts` → `backend/src/services/transportationUnit.service.ts` (`TransportationUnitService`), validated by `CreateTransportationUnitSchema`/`UpdateTransportationUnitSchema` in `backend/src/validators/transportation.validators.ts`. `POST`/`PUT` require `requireModule('TRANSPORTATION', 2)`; deactivate requires level 3.
- Frontend: `frontend/src/pages/Transportation/TransportationUnitsPage.tsx` — plain `useState`-based `UnitFormState` (no react-hook-form), MUI `Dialog` with `TextField`/`Select` fields, `@tanstack/react-query` mutations calling `transportationUnitApi.create`/`.update` (`frontend/src/services/transportation.service.ts`). Types in `frontend/src/types/transportation.types.ts`.
- `TransportationUnitService.getActiveForFuel()` returns `{ id, unitNumber, type, fuelType }[]` for all active units — used by Log Fuel when the user has no assignment.

### Fuel logging / history
- Prisma model `FuelConsumptionEntry` (`@@map("fuel_consumption_entries")`) — one row per fill-up: `transportationUnitId, enteredById, fuelStationId, tankId?, entryDate, fuelAmount, fuelUnit, mileageAtFueling, costPerUnit?, totalCost?, reportingMonth (YYYY-MM), notes?`. Indexed on `[transportationUnitId, reportingMonth]` and `[enteredById, reportingMonth]` among others. Data is permanent — nothing archives or resets it.
- Backend: `backend/src/routes/fuelConsumption.routes.ts` (mounted `/api/fuel-entries`) → `backend/src/controllers/fuelConsumption.controller.ts` → `backend/src/services/fuelConsumption.service.ts` (`FuelConsumptionService`). `getAll` (level ≥2), `getMyEntries` (level ≥1, own only), `create` ("Log Fuel", level ≥1), `update` (level ≥2), `delete` (level ≥3).
- Scheduler: `backend/src/services/scheduler.service.ts` runs a DB-driven cron registry (`JobSchedule` table, admin-configurable via `/api/admin/jobs`). Job key `'transportation-monthly-report'` (default `'0 6 1 * *'`) dispatches to `TransportationReportService.runMonthlyReportJob()` (`backend/src/services/transportationReport.service.ts`), which aggregates the previous month's `FuelConsumptionEntry` rows (by unit and by user via `getFuelByUnit`/`getFuelByUser`), sends a threshold alert if configured, and emails a summary to `financeDirectorEmail`. It does not delete/archive entries — purely read + email. `SendReportBodySchema` in the validators plus a reports route indicate this aggregation is also reachable as a manual "send report" action independent of the cron trigger.
- Frontend: `frontend/src/pages/Transportation/MyFuelHistoryPage.tsx` (route `/transportation/my-fuel-history`) shows a paginated raw-entry `ResponsiveTable` (columns: Date, Unit, Fuel Station, Amount, Mileage, Cost, and Entered By for level ≥2), a "Log Fuel" button, and (level ≥2 only) filters for Unit/Fuel Station/Month/From/To. Level ≥3 gets a per-row Delete action. `frontend/src/pages/Transportation/FuelEntryPage.tsx` (route `/transportation/fuel-entry`) is the "Log Fuel" form: if the user has an active assignment (`transportationUnitApi.getMyUnit()`), the vehicle is a locked, read-only `Chip`; otherwise it's a `Select` populated from `transportationUnitApi.getActiveForFuel()` (all active units, unfiltered).
- No CSV export exists anywhere for fuel data. A reusable, dependency-free pattern already exists at `frontend/src/pages/ReportsPage.tsx:50-67` (`exportCsv` — builds a CSV string client-side and triggers a Blob download); it's page-local, not extracted to a shared util, matching this repo's convention of page-local implementations. No CSV backend/frontend library is installed for export (only `csv-parse` and `exceljs`, used elsewhere for import).

### Roles / permissions
- No Prisma `enum Role` and no `roles.ts` constants file. Authorization is derived per-request from Entra AD group membership (`backend/src/utils/groupAuth.ts`, `GROUP_MODULE_MAP.TRANSPORTATION`):
  ```
  ENTRA_ADMIN_GROUP_ID                    → 3
  ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID  → 3
  ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID → 2
  ENTRA_BUS_DRIVERS_GROUP_ID              → 1
  ENTRA_ALL_STAFF_GROUP_ID                → 1
  ```
  `requireModule('TRANSPORTATION', minLevel)` enforces this server-side, with an unconditional bypass for `User.role === 'ADMIN'` (the "Site Admin" concept in this codebase) that forces `permLevel = max(derived, minLevel)`. Frontend pages mirror this with `isAdmin = user?.roles?.includes('ADMIN')` and `permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? N)`. "Transportation Secretary" == TRANSPORTATION permLevel 2; "Site Admin" == the `ADMIN` role bypass (level 6).

## Problem Definition

1. Vehicles cannot be marked as usable by any staff member ("county-wide") rather than only their assigned driver.
2. Fuel history relies on a fully-automated monthly email report; the district wants Site Admin/Transportation Secretary to pull the data on demand via CSV instead.
3. The history table shows a Cost column the district doesn't use, and needs a mileage-based view instead.
4. There's no "total miles driven this month" figure, derivable from mileage readings.
5. Fill-ups are shown one row per fill-up; the district wants them combined.
6. The page should default to showing the current month, with past months still searchable (no data loss).
7. Log Fuel doesn't let a driver with an assigned unit pick a county-wide vehicle instead.

## Proposed Solution Architecture

Decisions confirmed with the user before implementation:
- The CSV export button replaces the *automated monthly cron report* (the cron job is disabled); the "Log Fuel" button/page is untouched aside from item 7.
- Miles driven for a user+vehicle in a month = (last mileage reading in that month) − (last mileage reading in the prior month).
- Rows collapse to one per **user + vehicle + month**, not fully collapsed across vehicles.
- "Fresh table each month" = the page **defaults** to the current month; no schema/storage change — `FuelConsumptionEntry` rows stay permanent and filterable by month via the existing `reportingMonth` field/index.
- Deleting a bad fill-up (level 3+) still needs to work: each aggregated row expands to reveal the individual fill-ups it was built from, with delete still available there.

### 1. `isCountyWide` flag on vehicles
- Add `isCountyWide Boolean @default(false)` (+ `@@index([isCountyWide])`) to `TransportationUnit` in `backend/prisma/schema.prisma`.
- Add `isCountyWide: z.boolean().optional()` to `CreateTransportationUnitSchema` in `backend/src/validators/transportation.validators.ts` (flows into `UpdateTransportationUnitSchema` via `.partial()`).
- `TransportationUnitService.create()`/`.update()` pass `isCountyWide` through; `getActiveForFuel()`'s select/return type gains `isCountyWide`.
- `frontend/src/types/transportation.types.ts`: add `isCountyWide: boolean` to `TransportationUnit`.
- `frontend/src/pages/Transportation/TransportationUnitsPage.tsx`: add `isCountyWide` to `UnitFormState`/`defaultForm`, add a `Switch` labeled "County-Wide Vehicle" to the Add/Edit dialog, include it in the create/update payload, and show a small "County-Wide" chip in the unit list.

### 2. Log Fuel: allow selecting a county-wide vehicle
- `frontend/src/pages/Transportation/FuelEntryPage.tsx`: replace the locked read-only `Chip` (shown when the user has an assignment) with an always-rendered `Select`, pre-selected to the assigned unit. Its options are `[assigned unit] + [active units where isCountyWide]` (de-duplicated), labeled distinctly for county-wide entries (e.g. `"BUS-12 — County-Wide"`). Users without an assignment keep today's full active-unit dropdown (`getActiveForFuel`, already unfiltered, now carrying `isCountyWide`). No backend route changes beyond item 1's `getActiveForFuel` payload.

### 3. Remove the automated monthly fuel report
- `backend/src/services/scheduler.service.ts`: remove `'transportation-monthly-report'` from `JobKey`, `VALID_JOB_KEYS`, `DEFAULT_CRON`, and its `case` in `dispatch()`.
- Leave `TransportationReportService` untouched (its aggregation methods remain reachable via the existing manual "send report" action, independent of the cron trigger).
- Migration DML removes the existing `JobSchedule` row for `jobKey = 'transportation-monthly-report'` so already-provisioned databases stop firing it and it disappears from the admin jobs list.

### 4. My Fuel History: aggregated monthly view
**Backend** (`backend/src/services/fuelConsumption.service.ts`):
- New `getMonthlySummary(filters: { reportingMonth?, unitId?, userId? }, requestingUserId, requestingPermLevel)`:
  - `reportingMonth` defaults to current `YYYY-MM`.
  - Level < 2 forced to `enteredById = requestingUserId`; level ≥ 2 honors optional `unitId`/`userId`.
  - Single query fetches all entries for `reportingMonth` (scoped) with `unit`/`enteredBy` included; grouped in JS by `(enteredById, transportationUnitId)` — sum `fuelAmount`, `MAX(mileageAtFueling)` as `latestMileage`, retain raw entries for the expand view.
  - Second bulk query (not per-group — avoids N+1) fetches the same pairs for the *previous* month and computes `MAX(mileageAtFueling)` per pair as `previousMileage`.
  - Returns `{ userId, userName, unitId, unitNumber, reportingMonth, totalFuelAmount, fuelUnit, previousMileage, latestMileage, milesDriven, entries }[]` (`milesDriven` is `null` without a prior-month reading).
- New `MonthlySummaryQuerySchema` Zod schema (month optional/regex `^\d{4}-\d{2}$`, `unitId`/`userId` optional uuid) in `transportation.validators.ts`.
- New routes in `fuelConsumption.routes.ts`: `GET /api/fuel-entries/summary` (level ≥2) and `GET /api/fuel-entries/my-summary` (level ≥1), both accepting `?month=YYYY-MM`; controller additions in `fuelConsumption.controller.ts` mirroring `getAll`/`getMyEntries`. Existing raw endpoints (`getAll`, `getMyEntries`, `delete`) stay as-is for the expand view.

**Frontend** (`frontend/src/pages/Transportation/MyFuelHistoryPage.tsx`):
- Switch to `fuelEntryApi.getSummary`/`getMySummary`, keyed by a month filter defaulting to the current month for all levels (level 1 gains a month filter it didn't have before, satisfying "past months searchable").
- Columns: Month, User (level ≥2 only), Vehicle, Total Fuel Amount, Previous Mileage, Latest Mileage, Miles Driven — replacing Date/Fuel Station/per-row Mileage/Cost (fuel-station and per-fill-up date don't survive monthly aggregation, an intended trade-off).
- Each row expands to list its underlying `FuelConsumptionEntry` rows, each keeping the existing Delete action for level ≥3 (`fuelEntryApi.deleteEntry`).
- Drop `TablePagination` for the aggregated view (one month's grouped rows is small and unpaginated).
- Add an "Export CSV" button for permLevel ≥2 that converts the loaded summary rows to CSV client-side, reusing the `exportCsv` pattern from `ReportsPage.tsx:50-67` (copied locally, matching the existing page-local convention). Columns: Month, User, Vehicle, Total Fuel Amount, Previous Mileage, Latest Mileage, Miles Driven.
- "Log Fuel" button unchanged.

**Types/services:**
- `transportation.types.ts`: add `FuelMonthlySummaryRow`.
- `transportation.service.ts`: add `fuelEntryApi.getSummary(params)` / `fuelEntryApi.getMySummary(params)`.

## Implementation Steps

1. Schema + migration: `isCountyWide` on `TransportationUnit`; DML to remove the `transportation-monthly-report` `JobSchedule` row.
2. Backend validators: `isCountyWide` on unit schemas; new `MonthlySummaryQuerySchema`.
3. Backend services: `TransportationUnitService` (isCountyWide passthrough + `getActiveForFuel`), `FuelConsumptionService.getMonthlySummary`, `SchedulerService` (remove monthly-report job).
4. Backend routes/controllers: new summary endpoints.
5. Frontend types/services: `isCountyWide`, `FuelMonthlySummaryRow`, new API methods.
6. Frontend pages: `TransportationUnitsPage.tsx` (county-wide toggle + chip), `FuelEntryPage.tsx` (county-wide-aware vehicle select), `MyFuelHistoryPage.tsx` (aggregated table, expand-to-delete, CSV export, month filter for all levels).
7. Build validation via `docker compose -f docker-compose.dev.yml build backend` / `build frontend`.

## Dependencies

No new dependencies. CSV export reuses the existing dependency-free pattern in `ReportsPage.tsx` (Blob + anchor download) — no `csv-writer`/`json2csv`/`papaparse` needed on either side.

## Configuration Changes

None (no new env vars, no new Entra/Graph scopes). The removed cron job's `JobSchedule` row is cleaned up via migration DML, not a config toggle.

## Risks and Mitigations

- **N+1 queries in monthly aggregation** — mitigated by fetching current- and previous-month entries in exactly two bulk queries, grouping in JS, not per-group DB lookups.
- **Losing per-fill-up delete capability** — mitigated by the expand-per-row design that keeps the existing raw-entry Delete action reachable.
- **Losing Fuel Station / exact fill-up date granularity in the main table** — accepted trade-off per the aggregation requirement; still visible in the expanded per-entry view.
- **Stale `JobSchedule` row after removing the job key** — mitigated by the migration DML deleting it, not just removing code, so the admin jobs list and scheduler startup stay consistent.
- **Existing consumers of raw `getAll`/`getMyEntries` breaking** — mitigated by leaving those endpoints untouched and only adding new summary endpoints; `MyFuelHistoryPage.tsx` is confirmed as their only current frontend consumer.

# Review: Incident device exchange strands the paired charger

## Specification compliance

Matches `DEVICE_EXCHANGE_CHARGER_CARRYOVER_spec.md` exactly:
- `damageIncident.service.ts` `deviceExchange()` check-out branch now
  re-pairs an open `ChargerAssignment` to the new checkout, gated on
  `data.checkin` being present, guarded on `!openChargerAssignment.returnedAt`.
- `chargerId`/`checkoutAt`/`checkoutBy`/`notes` left untouched;
  `charger.status` not touched.
- `chargerAssignment` added to the check-out `include`.
- `WizardStep4DeviceExchange.tsx` summary shows the carried-over serial.
- New integration test file with both the carry-over case and the
  skip-checkout (unchanged) case, following the
  `inventory-permanent-delete.test.ts` pattern.

## Best practices / consistency

- Reuses the existing `$transaction` — no new transaction boundary.
- Charger-select shape is an inline literal matching
  `openChargerAssignmentSelect`'s shape rather than importing a
  module-private constant across files — correctly scoped per spec rather
  than exporting a constant for a single external call site.
- Comment above the re-pair block explains *why* (phantom-row root cause),
  matching this file's existing comment density.

## Maintainability

Small, self-contained addition inside the existing check-out branch; no new
abstractions. The frontend change is a single conditional `<Typography>`
matching the surrounding block's style exactly.

## Completeness

Both documented scenarios verified by the new test: carry-over with
replacement, and untouched charger on skip-checkout. `checkin()` and
`checkinCharger()` (normal check-in flows) were correctly left unmodified —
this bug was specific to the exchange's inline check-in/check-out, which
never had charger logic at all.

## Performance

One extra `findUnique` + one `update` on `ChargerAssignment`, only when
`data.checkin` is present — negligible, no N+1 (single row by unique FK).

## Security

No new route/permission surface — same `requireDeviceManagementAccess()` +
CSRF-protected route. No Entra group IDs or raw Graph payloads introduced
into the response; charger fields exposed (`id`, `serialNumber`,
`returnedAt`) match what other endpoints already return for this relation.

## API currency

No external library usage changed — pure Prisma Client calls matching this
file's existing patterns (its version already exercised elsewhere in this
service).

## Build & test validation

Commands run (per spec's approved list):
- `docker compose -f docker-compose.dev.yml build backend` — **pass**
  (shared `tsc` → `prisma generate` → backend `tsc`, zero errors)
- `docker compose -f docker-compose.dev.yml build frontend` — **pass**
  (`tsc` + `vite build`, zero errors)
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` — **pass**:
  **10 files, 69 tests** (was 9 files / 67 tests before this change; +1 file,
  +2 tests from the new `device-exchange-charger-carryover.test.ts`)

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
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Returns

- Build result: pass (backend + frontend images, backend test suite 10/10 files, 69/69 tests)
- **PASS** — no refinement cycle needed

## Phase 6 — Preflight (final gate)

Ran the same three checks `scripts/preflight.ps1` performs (backend build,
frontend build, backend-test suite via the scoped `db-test`/`backend-test`
containers, then cleaned up `db-test`) individually rather than via the
script wrapper, to keep build output visible per step — all three passed
with the results above. Test-only containers cleaned up. Work is confirmed
CI-ready.

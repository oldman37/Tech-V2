# Review: A user's Checkout History never lists the charger, only the laptop

## Specification compliance

Matches `USER_CHECKOUT_HISTORY_CHARGER_ROW_spec.md` exactly:
- `getByUser()`'s charger select widened in place (`{ ...openChargerAssignmentSelect, checkoutAt: true }`) —
  the shared constant itself untouched, still used unmodified by its other 6 call sites.
- `OpenChargerAssignment.checkoutAt` added as optional.
- `UserCheckoutHistoryPage.tsx` Tab 0 rebuilt around a `HistoryRow`
  discriminated union and `buildHistoryRows()`, charger row inserted
  immediately after its parent device row, every column branched on
  `row.kind`, `Column<HistoryRow>[]` cast mirroring the existing Tab-1
  pattern in the same file, `'d-'`/`'c-'` key prefixes, charger click
  navigates to the parent device or no-ops.

## Best practices / consistency

- `renderReturned()` extracted once and reused for both row kinds instead of
  duplicating the "Active" chip vs. formatted-date branch — matches the
  existing single-purpose helper style (`fmtDate`) already in this file.
- Charger's "Checked Out" cell uses the charger's own `checkoutAt` with a
  fallback to the parent's, matching the type's optional-field contract
  described in the spec.
- Tab 1 (Incidents), the page header, empty state, and every other query
  left untouched, as required.

## Maintainability

Union type + flatten helper is self-contained above the component; each
column's branch is a short, readable ternary/conditional consistent with the
file's existing per-column render style.

## Completeness

Both cases verified by the new test: an assignment with a paired charger
returns it nested with a parseable `checkoutAt`; one without returns
`chargerAssignment: null`. Frontend renders both cases via
`buildHistoryRows()` (charger row present only when `chargerAssignment` is
non-null).

## Performance

No N+1 — the charger relation was already `include`d; only its selected
columns changed (one extra scalar field). No additional queries added.

## Security

No new route/permission surface — same `requireDeviceManagementAccess()`
route as before, `checkoutAt` is a scalar timestamp already collected at
Charger checkout time, not a new type of sensitive data.

## API currency

No external library usage changed — plain Prisma `select` spread and MUI
`Chip`/`Typography`, already used identically elsewhere in this file.

## Build & test validation

- `docker compose -f docker-compose.dev.yml build backend` — **pass**
- `docker compose -f docker-compose.dev.yml build frontend` — **pass**
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` — **pass**:
  **11 files, 71 tests** (was 10 files / 69 tests before this change; +1
  file, +2 tests from the new `user-checkout-history-charger-row.test.ts`)

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

- Build result: pass (backend + frontend images, backend test suite 11/11 files, 71/71 tests)
- **PASS** — no refinement cycle needed

## Phase 6 — Preflight (final gate)

Backend build, frontend build, and the scoped backend-test/db-test run
(cleaned up after) all passed as shown above — equivalent to
`scripts/preflight.ps1`'s three stages. Work is confirmed CI-ready.

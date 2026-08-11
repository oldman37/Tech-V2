# Review: Notification badges on the Requests nav section

## Specification compliance
Matches `REQUEST_NAV_BADGES_spec.md` throughout: `RequestSectionView` model +
migration, five count functions, seed-to-now, personal scope only, own-change
exclusion, `refetchOnWindowFocus`, rollup badge (load-bearing on `/dashboard`,
confirmed in Phase 1), route-mount fix scoped to only the new route,
`notification-preferences` left flagged-not-fixed per explicit user decision.

## Best practices / consistency
- Backend service/controller/routes structurally mirror
  `notificationPreferences.*` exactly (authenticate-only, no `requireModule`,
  thin controller → `handleControllerError`).
- `fieldTrip.service.ts` extraction is behavior-preserving: `getPendingApprovals`
  now delegates to `buildPendingApprovalsWhere`, identical query/return shape,
  covered by the pre-existing field-trip test suite (still passing, see below).
- Zod `z.enum([...])` and Prisma nested-relation/upsert patterns already
  exercised elsewhere in this codebase — no new API surface.
- Migration SQL corrected during implementation (`REFERENCES "users"`, not
  `"User"` — the initial spec draft had this wrong; caught and fixed before
  writing the actual migration file, confirmed against an existing migration's
  FK convention).

## Maintainability
Five focused count functions, each with a doc comment explaining its rule and
(for Work Orders and Field Trip Approvals) the non-obvious edge case it
handles. The comment-body `startsWith` coupling in the Work Orders assignment
branch is flagged inline at both call sites.

## Completeness
All five sections implemented and tested. `FIELD_TRIP_APPROVALS` — the most
complex addition (stage-entry-timestamp derivation, not `submittedAt`) — has
a dedicated test (`request-badges.test.ts` #11) exercising the
`PENDING_SUPERVISOR` direct-report-scoping branch specifically, not just the
simpler branches.

## Performance
No N+1s: each count is one query (or two run via `Promise.all`), all filtered
on already-indexed FKs (`reportedById`, `assignedToId`, `purchaseOrderId`,
`fieldTripRequestId`, `submittedById`, etc. — all pre-existing indexes,
confirmed in Phase 1, no new index required). `getBadgeCounts` runs all five
section counts concurrently via `Promise.all`.

## Security
- Every count query is scoped to `req.user!.id` — never the broader
  supervisor/admin visibility scope. Confirmed by reading each function: no
  query takes a caller-supplied user ID.
- Route-mount fix verified with a dedicated regression test (case #10) using
  a persona with zero group membership — confirmed `403` before the fix would
  have applied here (same bug class as documented for
  `inventoryAudit`/`roomCheckout`), `200` after.
- CSRF: mutating route (`POST /:section/visited`) covered by
  `validateCsrfToken`, matching the codebase's standard pattern for
  authenticated self-service mutations.
- `notification-preferences`' identical exposure documented as a known,
  unfixed issue per explicit user decision — not silently left undocumented.

## API currency
Zod 4, Prisma 7, Express 5, TanStack Query v5 — all patterns copied from
already-working code in this exact codebase (no version-sensitive risk).

## Build validation

Commands run (all within Phase 1 spec's approved/safe list):
```
docker compose -f docker-compose.dev.yml build backend   → PASS (tsc + prisma generate clean)
docker compose -f docker-compose.dev.yml build frontend  → PASS (tsc + vite build clean)
scripts/preflight.ps1                                     → PASS, exit code 0
```
Preflight result: **8 test files / 58 tests passed** (47 pre-existing + 11 new
in `request-badges.test.ts`), including the new migration applying cleanly to
the isolated `db-test` container via `prisma migrate deploy`. No regression
in any pre-existing suite, including `fieldTrip`-adjacent coverage exercised
indirectly through the shared `buildPendingApprovalsWhere` extraction.

## Score table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 95%* | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

\* Functionality is verified by 11 integration tests covering seeding, all
five sections, own-change exclusion, mark-visited, validation, auth, and the
route-mount regression — but not by a live browser (badge rendering, rollup
visibility on the collapsed landing route, active-item color inversion).
Flagged as **not independently verified** per the source document's own
caveat pattern — recommended before calling this fully verified end-to-end.

## Result: PASS

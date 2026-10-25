# Final Review: Director of Schools — District-Wide Work Order Visibility

## Phase 6 Preflight — cycle 1 (failed)

Builds passed; integration tests failed intermittently (run 1: 5 failures in 3 files; run 2:
4 failures in 2 files; a test-only rerun in between passed 82/82). Different tests failed each time,
all HTTP 500s. Server log:

```
Invalid `this.prisma.ticket.findUnique()` invocation ... work-orders.service.ts:593
Too many database connections opened: sorry, too many clients already
code: P2037 / originalCode 53300 (TooManyConnections)
```

Root cause: vitest loads a fresh app module graph per test file; `backend/src/lib/prisma.ts` creates
a `pg.Pool` (max 10) per load that is never ended, plus the helper pool (max 3). Connections
accumulate across the 14 files and intermittently exceed Postgres's default `max_connections=100`.
Pre-existing fragility; the new test file (14th) added pressure.

## Refinement (cycle 1)

`docker-compose.dev.yml` `db-test`: `command: ["postgres", "-c", "max_connections=300"]` with an
explanatory comment. Test-only container; no app code or dev/prod database touched.

Follow-up (not done, out of scope): end the per-file pools in test teardown so connections do not
accumulate.

## Re-validation

- `scripts/preflight.ps1` → `All preflight checks passed.` EXIT=0 (14 files, 82 tests passed).
- Extra test-only rerun → 14 files / 82 tests passed, EXIT=0, no "too many clients".

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 100% | A |
| Code Quality | 93% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 97% | A |
| Build Success | 100% | A |

**Overall Grade: A (98%) — APPROVED**

## Addendum — 1.9.9 changelog entry

`frontend/src/changelog.ts`: added a 1.9.9 highlight and a `changes` line describing the DoS
district-wide work order visibility (notes hard delete stays Admin/Tech Assistants). Wording matches
the existing plain-language, user-facing entries; the test-DB connection fix is internal and omitted.
Preflight re-run: EXIT=0 (frontend build passed; 14 files / 82 tests passed).

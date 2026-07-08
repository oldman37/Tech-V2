# Review: Fix Preflight Silently Skipping Rebuild of Test Image

## Scope Reviewed
- `scripts/preflight.ps1` — one-line change adding `--build` to the `backend-test` run invocation

## Findings

1. **Specification Compliance** — Matches `preflight_stale_test_image_spec.md` exactly: minimal
   one-flag change, no new steps added, no change to what is validated.
2. **Correctness** — `docker compose run --build` is a standard, documented Compose flag; forces
   an image rebuild (respecting layer cache) before starting the container, directly closing the
   stale-image gap confirmed in this session.
3. **Risk** — None beyond a small, cache-mitigated build-time cost on every preflight run, already
   accepted in the spec.
4. **Consistency** — Does not alter FORBIDDEN COMMANDS compliance (still no destructive DB
   commands), still runs entirely through Docker per project constraints.

## Build Validation

Confirmed with a live `scripts/preflight.ps1` run: output now shows `Image tech-v2-backend-test
Building` explicitly before the test step runs (previously silent/skipped), and the suite reports
**6 test files, 38 tests, all passing**, exit code 0.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Correctness | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% (rebuild now visible; 6/6 files, 38/38 tests) | A |

## Result: PASS

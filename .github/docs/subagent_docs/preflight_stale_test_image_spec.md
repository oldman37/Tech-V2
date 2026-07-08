# Spec: Fix Preflight Silently Skipping Rebuild of Test Image

## 1. Current State Analysis

`scripts/preflight.ps1:38` runs the backend test suite as:
```powershell
docker compose -f docker-compose.dev.yml --profile test run --rm backend-test
```
`docker compose run` only builds an image if none exists locally for that service — it does
**not** rebuild on source changes the way `docker compose up --build` or an explicit
`docker compose build` does. Confirmed empirically in this session: after adding a brand-new test
file (`workorders-maintenance-director-scope.test.ts`), a full `scripts/preflight.ps1` run
reported "All preflight checks passed" and exited 0, but the vitest summary showed only 5 test
files / 35 tests — the new 6th file never ran, because Compose reused a `backend-test` image built
before the file existed. Forcing a rebuild (`docker compose build backend-test`) then surfaced 2
real, previously-hidden test failures.

## 2. Problem Definition

Preflight can report a false PASS while silently testing stale code whenever a `backend-test`
image already exists locally from a prior run (the common case during iterative development) —
defeating the purpose of Phase 6 as "the final gate."

## 3. Proposed Solution Architecture

Add Compose's own `--build` flag to the `run` invocation, which forces an image rebuild (subject
to normal Docker layer caching — unchanged layers are still reused, so this doesn't meaningfully
slow down repeated runs when source hasn't changed) before starting the container:
```powershell
docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test
```
This is the smallest possible fix: one flag, no new steps, no change to what gets validated —
just guarantees the image reflects the current working tree every time preflight runs.

## 4. Implementation Steps

1. `scripts/preflight.ps1` line 38: add `--build` to the `docker compose run` invocation.
2. Verify: run `scripts/preflight.ps1` end-to-end once more; confirm the backend-test build step
   is visible in the output (not skipped) and all 6 test files / 38 tests still pass.

## 5. Dependencies

None — `--build` is a standard `docker compose run` flag, already relied on implicitly elsewhere
via `up --build`-style workflows; no version concerns.

## 6. Configuration Changes

None.

## 7. Risks and Mitigations

- **Risk:** Marginally slower preflight runs (an image-cache check + potential rebuild on every
  invocation). **Mitigation:** Docker layer caching means unchanged layers are reused; only
  genuinely changed layers (e.g. the `COPY ./src` layer when source changed) rebuild — the cost is
  small and correctness during the final validation gate outweighs it.

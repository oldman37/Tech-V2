# Idle-Timeout "Still Logged In Overnight" — Review

## Scope Reviewed

- `frontend/src/services/api.ts` (`scheduleIdleLogout()`)

Against: `.github/docs/subagent_docs/session_idle_timeout_bug_fix_spec.md`

## Findings

### 1. Specification Compliance

`timeout: 8000` added to the `axios.post('/auth/logout', ...)` config inside
`scheduleIdleLogout()`, exactly as specified — no other lines touched. **Full
compliance.**

### 2. Best Practices / Consistency

- Matches the existing in-repo convention of passing `timeout` in an Axios request
  config (`frontend/src/services/adminService.ts:201`).
- No new dependency, no new pattern — a single config key.

### 3. Root-Cause Verification

Confirmed by reading `scheduleIdleLogout()`: without a timeout, `axios.post` has no
bound on how long it can stay pending, so `.finally()` (where `clearAuth()` and the
redirect to `/login` live) would never run if the request never settles. Adding
`timeout: 8000` guarantees the promise settles (as an Axios timeout error, caught by
the existing `.catch()`) within 8 seconds, so `.finally()` always eventually runs.
This directly restores the "clear local state regardless" guarantee already stated in
the adjacent code comment.

### 4. Security

- No new attack surface. No change to what data is sent, no change to cookies/CSRF
  handling.
- Happy-path behavior (server revokes refresh token, clears cookies via `Set-Cookie`
  before the client redirects) is unchanged.
- Worst case on the unhappy path (timeout fires): client redirects to `/login` and
  clears local state; server-side revocation may not have completed, so the old
  refresh token could technically still be valid until it's next presented (at which
  point the existing 12-hour absolute-cap / reuse-detection logic still applies). This
  is a strict improvement over the current behavior (indefinite hang, no redirect, no
  clearAuth at all).

### 5. Maintainability / Code Quality

- Inline comment explains *why* the timeout exists and references the failure mode it
  prevents, matching the file's existing comment density.
- Diff is a single line plus a comment — surgical, no unrelated changes.

### 6. Performance

Negligible — one additional Axios config key on an already-existing call.

### 7. Build Validation

Commands run (both approved in Phase 1 spec; neither is in FORBIDDEN COMMANDS):

```
docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml build frontend
```

**Backend:** unaffected by this change (no backend files touched); image build
succeeded (cached layers, exit code 0) — included only because Phase 6 preflight
requires both images.

**Frontend:** `tsc && vite build` completed successfully, no type errors. Same
pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` / chunk-size warnings as before this change
(unrelated, not introduced by this diff).

Both images built successfully; exit codes 0.

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

## Result: PASS

No CRITICAL or RECOMMENDED issues found. Proceeding to Phase 6 (Preflight).

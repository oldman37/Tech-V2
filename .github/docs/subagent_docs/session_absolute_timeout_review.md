# Session Absolute Timeout + Idle Timeout — Review

## Scope Reviewed

- `backend/src/types/auth.types.ts`
- `backend/src/controllers/auth.controller.ts`
- `.env.example`
- `frontend/src/services/api.ts`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/pages/AccessDenied.tsx`

Against: `.github/docs/subagent_docs/session_absolute_timeout_spec.md`

## Findings

### 1. Specification Compliance

- `sessionStart: number` added to `JWTRefreshTokenPayload`; required (as `number`) in
  `isRefreshTokenPayload` → fail-closed for pre-existing tokens, exactly as specified.
- `callback` sets `sessionStart: Date.now()` at login.
- `refreshToken` handler: absolute-cap check inserted after reuse-detection, before
  rotation, using `parseExpiryMs(process.env.ABSOLUTE_SESSION_MAX || '12h')`; revokes
  all active tokens for the user and throws `AuthenticationError`, reusing the existing
  401 + cookie-clear catch path — no new response branch, as specified.
- Rotation payload (`newRefreshTokenPayload`) carries `sessionStart: decoded.sessionStart`
  forward unchanged — verified by direct read of the file, not just the diff — confirms
  the cap cannot be defeated by rotation.
- `.env.example` documents `ABSOLUTE_SESSION_MAX=12h` in the same style/section as the
  adjacent `JWT_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN` vars.
- Frontend: `IDLE_LOGOUT_MS = 60 * 60 * 1000`, `idleTimer`, `cancelIdleLogout()`,
  `scheduleIdleLogout()` added; wired into `onUserActivity()` alongside the existing
  proactive-refresh scheduling; idle timer also armed on initial module load (spec did
  not explicitly call this out but it's required for correctness — a session that opens
  and is never touched must still idle out; without this the timer would only start
  after the first activity event, silently exempting untouched-from-open sessions).
  Idle logout calls the real `/api/auth/logout` endpoint before clearing local state,
  matching the spec's requirement that idle logout actually revoke server-side.
- `cancelIdleLogout()` wired into all three existing `cancelProactiveRefresh()` call
  sites (`api.ts` doRefresh catch, `AppLayout.tsx` handleLogout, `AccessDenied.tsx`
  handleLogout), as specified.

**Verdict: full compliance.**

### 2. Best Practices / Consistency

- Reuses the existing `parseExpiryMs` helper rather than introducing a second duration
  parser.
- Reuses the existing `AuthenticationError` → catch-block → 401 + `clearCookie` path
  instead of adding a new response shape.
- Idle-timeout frontend code mirrors the existing proactive-refresh timer's structure
  (module-level timer var, `cancel*`/`schedule*` pair, throttled activity listener) —
  same idiom, not a new pattern.
- No new dependencies; no version-sensitive API surface touched.

### 3. Security

- Directly closes the reported issue: refresh token rotation can no longer extend a
  session indefinitely — capped at 12h from original login, enforced server-side.
- Fail-closed migration: tokens issued before this change lack `sessionStart` and are
  rejected by the tightened type guard on next use, rather than silently exempted from
  the cap (verified by reading the guard logic, not assumed).
- On both absolute-cap expiry and reuse-detection, **all** active refresh tokens for the
  user are revoked (`updateMany` with `revokedAt: null`), not just the presented one —
  consistent with the existing reuse-detection branch's blast radius.
- Idle logout hits the real `/api/auth/logout` endpoint (server-side revocation), not
  just local `clearAuth()` — prevents a still-valid refresh cookie from resurrecting an
  idled-out session.
- No new attack surface: no new endpoints, no new trust boundary, no Entra group IDs or
  Graph payloads touched.

### 4. Maintainability / Code Quality

- Both new fields/behaviors are commented in place explaining *why* (not reset on
  rotation; fail-closed rationale in spec, referenced via the code comment on the field).
- Diff is surgical — no unrelated formatting or refactors; every changed line traces to
  this task.

### 5. Performance

- One extra `Date.now()` subtraction and env lookup per refresh call — negligible.
- No new Prisma queries added beyond the existing `updateMany` pattern already used by
  the reuse-detection branch (same query shape, just a second call site).

### 6. Build Validation

Commands run (both approved in Phase 1 spec; neither is in FORBIDDEN COMMANDS):

```
docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml build frontend
```

**Backend:** `tsc` step (`RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build`)
completed in 23.1s with no emitted errors — image built successfully.

**Frontend:** `tsc && vite build` completed in ~22.7s with no type errors. Vite emitted
its pre-existing warnings (`INEFFECTIVE_DYNAMIC_IMPORT` on `api.ts`, chunk-size-over-500kB
notice) — both present before this change and unrelated to it (same `api.ts` static/dynamic
import mix and same bundle size class that existed prior); not introduced by this diff.

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

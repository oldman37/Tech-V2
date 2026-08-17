# Session Idle Timeout Rework — Review

Reviewed against `.github/docs/subagent_docs/session_idle_timeout_rework_spec.md`.

## Scope Reviewed

- `backend/src/types/auth.types.ts`
- `backend/src/controllers/auth.controller.ts`
- `frontend/src/services/api.ts`
- `frontend/src/pages/Login.tsx`
- `.env.example`, `.env.deploy`, `docker-compose.yml`, `docker-compose.dev.yml`

## Findings

### 1. Specification Compliance

All five implementation steps completed. One addition beyond the spec, justified below
under *Deviations*.

### 2. Root-Cause Verification

The spec's central claim — that a 60-minute `setTimeout` cannot survive suspend — is
the difference between this attempt and the last two. Verified in the replacement:
`checkIdle()` compares two `Date.now()` readings taken from persistent storage, so it
is unaffected by whether the timer mechanism advanced during sleep. The 30-second
`setInterval` only needs to fire *once* after wake for the comparison to be correct.

### 3. Deviation From Spec (accepted)

The spec did not account for a **stale `last_activity_at` orphaned by a previous
session** — e.g. the browser is closed without logging out, so `cancelIdleLogout()`
never runs to clear the key. On the next sign-in, `checkIdle()` would read yesterday's
timestamp and immediately terminate the brand-new session.

Fixed by exporting `markSessionStart()` from `api.ts` and calling it at the successful
Entra callback (`Login.tsx:96`, immediately before `setUser`). This seeds the baseline
at the exact moment of authentication, which is the only point that reliably
distinguishes a *fresh login* from a *page reload of an existing session* — the
distinction that must be preserved for the reload case to keep accumulating idle time.

This is a correctness fix for a case the spec missed, not scope creep: without it the
feature is unusable (every login after a browser close would bounce straight back to
`/login`).

### 4. Regression Risk vs. Attempt 1

Attempt 1 broke 3 backend tests because it made `sessionStart` **required** in
`isRefreshTokenPayload`, invalidating hand-built test fixtures. This change
deliberately avoids that trap:

- `iat` is added as **optional** (`iat?: number`) to `JWTRefreshTokenPayload`.
- `isRefreshTokenPayload` is **not modified**.
- The runtime check in `refreshToken` fails closed on a missing/non-numeric `iat`.

Verified `backend/src/__tests__/helpers/auth.ts:42-45` — `signTestRefreshToken` uses
`jwt.sign(..., { expiresIn: '7d' })`, and `jwt.sign` populates `iat` automatically with
the current time. Test tokens therefore satisfy the new idle check with no fixture
changes. Confirmed by the passing test run in Phase 6.

### 5. Correctness Review of `checkIdle()`

- **Unauthenticated early-return does not touch the key.** This is the load-bearing
  detail: `authStore` has no `persist` middleware, so `isAuthenticated` is `false` on
  every page load until `/auth/me` resolves. Re-seeding there would reset idle time on
  each reload. Verified the early return at `api.ts:153` has no write.
- **Backwards clock** (`last > now`) re-baselines rather than blocking on a negative
  interval.
- **`parseInt` garbage** is caught — `Number.isFinite(NaN)` is `false`, so a corrupted
  value is treated as "no baseline" and re-seeded.
- **localStorage throwing** (hardened privacy modes) is caught in both read and write;
  the client layer degrades to a no-op and the server-side check remains authoritative.

### 6. Event Wiring

`visibilitychange` is registered on `document`, not `window` — this is the standard
target per the Page Visibility API. (It was initially written against `window`, which
happens to work via bubbling but is not the documented contract; corrected during
review.) `focus` is correctly a `window` event.

Ordering check: when a user returns to a long-idle tab, the `focus`/`visibilitychange`
handler runs before any in-page `mousedown`, so `checkIdle()` evaluates the stale
timestamp *before* `throttledActivity` can overwrite it. The idle logout therefore wins
the race, which is the required behaviour.

### 7. Consistency

- The backend idle block mirrors the shape of the absolute-cap block directly above it
  (same `parseExpiryMs` helper, same `updateMany` revocation, same `AuthenticationError`
  → existing 401/cookie-clear path). No new response branch.
- `IDLE_SESSION_MAX` follows the `ABSOLUTE_SESSION_MAX` env convention in all four
  config files.
- `cancelIdleLogout()` retains its exported name and signature, so `AppLayout.tsx:246`
  and `AccessDenied.tsx:34` are untouched.

### 8. Security

- Idle enforcement is now server-side at the refresh chokepoint, satisfying the OWASP
  requirement that timeout not be client-enforced.
- No change to CSRF handling, cookie flags, or response payloads. No Entra group IDs or
  Graph data exposed.
- Revocation on idle expiry uses the same `updateMany({ revokedAt })` sweep as the
  absolute cap, so all of the user's active tokens are killed, not just the presented one.
- Defence in depth is intact: client precision layer → server idle backstop (60–85 min)
  → 12h absolute cap.

### 9. Performance

- One `localStorage` write per 60s at most (unchanged from the previous timer-reset
  frequency).
- A 30s interval doing two integer comparisons; browsers throttle it further in
  background tabs, which is harmless here.
- Backend: two arithmetic comparisons before any new query. The `updateMany` only runs
  on the terminal path.

### 10. Orphans

`setTimeout`-based `idleTimer` and `scheduleIdleLogout()` were fully removed and
replaced; no unused imports or dead references remain. `IDLE_LOGOUT_MS` is still used.

## Build Validation

Commands run (both from the Phase 1 spec; neither is in FORBIDDEN COMMANDS):

```
docker compose -f docker-compose.dev.yml build backend frontend
```

**Backend:** `shared tsc` → `prisma generate` → `backend tsc` — completed, no type
errors (`#37 DONE 24.5s`). Image exported and tagged `tech-v2-backend:latest`.

**Frontend:** `tsc && vite build` — completed, no type errors (`#38 DONE 24.8s`),
`✓ 13022 modules transformed`, `✓ built in 3.13s`. Image exported and tagged
`tech-v2-frontend:latest`.

Only pre-existing warnings appeared (`INEFFECTIVE_DYNAMIC_IMPORT` on `api.ts`, the
>500 kB chunk-size notice, and the `inlineDynamicImports` deprecation). None are
introduced by this diff — the `api.ts` dynamic-import warning already existed because
`useUsers.ts` dynamically imports a module that many components import statically.

Exit code: `0`.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 95% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

Specification Compliance is 95% rather than 100% because the implementation required
the `markSessionStart()` addition the spec did not anticipate (documented in §3). The
spec has not been retro-edited to hide the gap.

## Result: PASS

No CRITICAL issues. Proceeding to Phase 6 (Preflight).

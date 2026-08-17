# Session Idle Timeout — Rework Spec (Attempt 3)

## Why This Is Attempt 3

Two prior fixes shipped; the session still survives overnight.

- `session_absolute_timeout_spec.md` — added a **server-enforced 12h absolute cap**
  (works, keep it) plus a **client-side 60-minute idle timeout** built on a single
  long `setTimeout`.
- `session_idle_timeout_bug_fix_spec.md` — diagnosed the idle failure as a *hung
  logout request* and added `timeout: 8000` to the axios call **inside** that timer's
  callback.

Attempt 2's premise was that the timer fires and then the request hangs. The timer
does not fire. So the fix hardened a code path that was never reached, which is why
it changed nothing observable. (The 8s timeout is still a legitimate hardening and is
retained below — it is simply not the bug.)

## Current State Analysis

### Auth mechanics (verified in code)

- Access token: JWT `JWT_EXPIRES_IN=1h`, but cookie `maxAge` is **30 min**
  (`backend/src/config/cookies.ts:22`), path `/api`.
- Refresh token: `REFRESH_TOKEN_EXPIRES_IN=7d`, cookie path scoped to
  `/api/auth/refresh-token`, `jti`-tracked in the `RefreshToken` table, rotated on
  every use.
- Absolute cap: `auth.controller.ts:472-482` compares `Date.now() - decoded.sessionStart`
  against `ABSOLUTE_SESSION_MAX` (default `12h`) on every refresh, revoking all active
  tokens when exceeded. `sessionStart` is carried forward unchanged through rotation
  (`auth.controller.ts:610`). **This control is correct and stays as-is.**
- Idle timeout: `frontend/src/services/api.ts:91-112`, a module-scope
  `setTimeout(..., 60 * 60 * 1000)` reset by throttled activity listeners.
- `authStore` is **not** persisted (no zustand `persist`), so `isAuthenticated` is
  `false` on every fresh page load until `initializeAuth()` resolves `/auth/me`.

### Failure modes of the current idle timer

1. **System sleep freezes the countdown.** JS timer behaviour across suspend is
   explicitly unspecified by the HTML standard ([whatwg/html#6759](https://github.com/whatwg/html/issues/6759)),
   and is inconsistent in practice — reports include the callback not running "until
   the laptop is woken up and the tab is brought into focus," and Windows firing after
   the *full* duration rather than the remaining duration
   ([nodejs/node#13168](https://github.com/nodejs/node/issues/13168),
   [nodejs/node#6763](https://github.com/nodejs/node/issues/6763)).
   Concretely: arm the 60-min timer at 17:10, suspend at 17:15, wake at 08:00 — the
   timer still believes ~55 minutes remain. The user immediately starts clicking, the
   throttled activity handler resets it to a fresh 60, and **the session never
   expires**. This is exactly the reported symptom.
2. **Reload restarts the countdown at zero.** The timer is module state; nothing
   persists accumulated idleness across a refresh, navigation, or tab restore.
3. **Background tabs are throttled or discarded**, delaying or destroying the timer.
4. **No server-side idle enforcement whatsoever.** The 401 → `doRefresh()` interceptor
   (`api.ts:201-217`) silently resurrects any session inside the 12h cap. So a dormant
   tab left open overnight refreshes itself back to life on the first morning click.
5. **Client-only enforcement is contrary to OWASP.** Session timeout "must be enforced
   server-side… if the client is used to enforce the session timeout… an attacker
   could manipulate these to extend the session duration"
   ([OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).

### Why the tab-left-open case specifically survives

With the tab **closed**, the 30-min access cookie is gone on return; `/auth/me` 401s;
the interceptor deliberately skips refresh when `!isAuthenticated` (`api.ts:201-205`),
so the user lands on `/login`. With the tab **open**, `isAuthenticated` stays `true`
in memory, so the 401 path *does* refresh, and the session resurrects. This matches
the report ("left the app open overnight") precisely.

## Problem Definition

Enforce a **60-minute idle timeout** that survives system sleep, page reload, tab
throttling, and a dead or tampered client, while retaining the existing
**12-hour absolute cap**. Per user decision: both controls, server-enforced, no
Prisma migration.

## Proposed Solution

Two layers, both keyed to **wall-clock timestamps** rather than timer countdowns.

### Layer A — Server-enforced idle at the refresh chokepoint (authoritative)

The refresh endpoint is the only way a session extends past the 30-minute access
cookie, which makes it the natural enforcement point. The refresh token's standard
`iat` claim already records when the current token was issued — no new payload field,
no schema change.

In `refreshToken`, immediately **after** the existing absolute-cap block:

```ts
// Enforce an idle timeout server-side. Refresh tokens rotate at least every ~30 min
// while the user is active (the access cookie's maxAge forces it), so an `iat` older
// than the idle window means the session has been dormant. Fail closed if `iat` is
// somehow absent.
const idleSessionMs = parseExpiryMs(process.env.IDLE_SESSION_MAX || '60m');
if (typeof decoded.iat !== 'number' || Date.now() - decoded.iat * 1000 >= idleSessionMs) {
  await prisma.refreshToken.updateMany({
    where: { userId: decoded.id, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
  loggers.auth.info('Idle session timeout exceeded — re-authentication required', { userId: decoded.id });
  throw new AuthenticationError('Session timed out due to inactivity — please sign in again');
}
```

This reuses the existing `AuthenticationError` → 401 → cookie-clear path, identical in
shape to the absolute-cap block directly above it. No new response branch.

**Why `iat` is a sound proxy for activity.** During continuous use the access cookie
expires every 30 minutes, forcing a refresh; the proactive timer refreshes even sooner
(25 min after last activity). So `iat` age stays bounded at ~30 min while the user is
working, and grows without bound once activity stops.

**Precision bound (stated honestly).** Because the proactive refresh can fire up to
25 minutes *after* the last real interaction, the server measures idleness from a
point up to 25 min late. Server-side expiry therefore lands between **60 and ~85
minutes** of true inactivity. The client layer below enforces the crisp 60-minute mark
for any live client; the server layer is the backstop for clients that are asleep,
closed, or tampered with. This is a deliberate simplicity tradeoff — tightening it
would require per-request activity stamping and a migration, which was explicitly
ruled out.

`JWTRefreshTokenPayload` gains `iat?: number` — optional because `jwt.sign` populates
it automatically and the two sign call sites (`auth.controller.ts:295`, `:610`)
construct payloads *without* it. `isRefreshTokenPayload` is **not** changed; the
runtime check above fails closed on a missing/non-numeric `iat`, so no test fixtures
break (unlike the `sessionStart` change in attempt 1).

New env var, matching the `ABSOLUTE_SESSION_MAX` convention:

```
# Idle session timeout — max time between token refreshes before the session is
# terminated server-side and full re-authentication is required.
# OPTIONAL — default: 60m
IDLE_SESSION_MAX=60m
```

### Layer B — Sleep-proof client idle detection (UX + precise 60-min cutoff)

Replace the single long `setTimeout` with a persisted timestamp plus a short poll.
A short interval is immune to suspend: whatever the platform does during sleep, the
next tick after wake compares two wall-clock values and sees the full multi-hour gap.

```ts
const IDLE_LOGOUT_MS = 60 * 60 * 1000;   // 60 minutes of no activity
const IDLE_CHECK_MS  = 30 * 1000;        // wall-clock poll
const LAST_ACTIVITY_KEY = 'last_activity_at';
```

- `markActivity()` — writes `Date.now()` to `localStorage` (reusing the existing
  60-second activity throttle, so write volume is unchanged from today's timer resets).
- `checkIdle()` — runs on a 30s interval **and** on `visibilitychange`/`focus`:
  - if not authenticated → return **without touching the key** (critical: `authStore`
    is not persisted, so a reload briefly reports `isAuthenticated === false`;
    re-seeding here would wipe accumulated idleness on every refresh — the exact
    class of bug that made attempt 1 fail);
  - if the key is absent → seed it with `Date.now()` (fresh session baseline);
  - if the stored value is in the future (clock moved backwards) → reset to `Date.now()`;
  - if `Date.now() - stored >= IDLE_LOGOUT_MS` → run the logout sequence.
- Logout sequence is unchanged from today, including attempt 2's `timeout: 8000`
  (still correct as hang protection), plus `localStorage.removeItem(LAST_ACTIVITY_KEY)`.
- `cancelIdleLogout()` keeps its exported name and signature — it now clears the
  interval and removes the key. **`AppLayout.tsx:246` and `AccessDenied.tsx:34` need
  no changes**, which keeps the diff surgical.

Storing in `localStorage` also makes idleness correctly **shared across tabs**:
activity in any tab keeps every tab alive, and all tabs agree on the deadline.

### Interaction of the two layers

| Scenario | Caught by |
|---|---|
| Tab open, user walks away 60 min, machine awake | Client (exact 60 min) |
| Tab open, laptop sleeps overnight | Client, on the first tick after wake |
| Tab reloaded after 50 min idle, then 10 more | Client (timestamp persists) |
| Browser closed overnight, reopened | Server (`iat` check on refresh) |
| Client JS tampered / timer suppressed | Server (`iat` check), then 12h absolute cap |
| Continuous activity for 13 hours | Server (absolute cap, unchanged) |

## Implementation Steps

1. `backend/src/types/auth.types.ts` — add optional `iat?: number` to
   `JWTRefreshTokenPayload` with a comment noting `jwt.sign` populates it.
   Do **not** modify `isRefreshTokenPayload`.
2. `backend/src/controllers/auth.controller.ts` — add the idle check in `refreshToken`
   immediately after the absolute-cap block (~line 482).
3. `.env.example` and `.env.deploy` — document `IDLE_SESSION_MAX=60m` beside
   `ABSOLUTE_SESSION_MAX`.
4. `docker-compose.yml` — pass `IDLE_SESSION_MAX` through to the backend service,
   mirroring how `ABSOLUTE_SESSION_MAX` was added.
5. `frontend/src/services/api.ts` — replace `scheduleIdleLogout()`'s `setTimeout` with
   the `localStorage` timestamp + `setInterval` + `visibilitychange`/`focus` design;
   update `cancelIdleLogout()`; wire `markActivity()` into `onUserActivity()`.

No changes to `AppLayout.tsx`, `AccessDenied.tsx`, or any test fixture.

## Dependencies

None new. Uses `jsonwebtoken` (already imported), the in-repo `parseExpiryMs` helper,
`axios`, and the Web Storage / Page Visibility APIs. Per the Dependency &
Documentation Policy this is an internal change with no new dependency and no
version-sensitive API surface, so no library-version doc verification is required;
the browser-behaviour and session-policy claims above are cited inline instead.

## Configuration Changes

- New optional env var `IDLE_SESSION_MAX` (default `60m`).
- No Prisma schema change, no migration.

## Risks and Mitigations

- **Risk:** A malformed `IDLE_SESSION_MAX` falls through `parseExpiryMs`'s catch-all to
  **7 days**, silently disabling idle enforcement (fail-open).
  **Mitigation:** Not adding new validation machinery — the sibling
  `ABSOLUTE_SESSION_MAX` already carries the identical risk, and diverging would be
  inconsistent. Documented here and called out to the user; the value is set once in
  `.env` and the default path (`|| '60m'`) is safe. Flagged as a candidate for a
  separate, deliberate hardening task if desired.
- **Risk:** Users on a slow first interaction of the morning see a logout redirect
  rather than their page.
  **Mitigation:** Intended behaviour — that is the feature.
- **Risk:** Existing sessions behave inconsistently until their next refresh.
  **Mitigation:** One-time; on deploy, any session whose refresh token is already
  older than 60 min is terminated on its next refresh. Unlike attempt 1, **no**
  forced mass logout occurs, because `isRefreshTokenPayload` is untouched.
- **Risk:** `localStorage` unavailable (hardened privacy mode).
  **Mitigation:** Guard reads/writes; if storage throws, the client layer degrades to
  no-op and the server layer still terminates the session.

## Build/Test Commands To Be Used In Phase 3/6

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS required — no schema change, no migration, no database access.

## Sources

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — idle timeout must be enforced server-side
- [OWASP WSTG — Testing Session Timeout](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/07-Testing_Session_Timeout) — inactivity invalidation must occur server-side
- [OWASP ASVS 3.3 — Session times out after inactivity](https://owasp-aasvs.readthedocs.io/en/latest/requirement-3.3.html)
- [whatwg/html#6759 — How should timers account for system sleep/suspend?](https://github.com/whatwg/html/issues/6759) — behaviour is unspecified
- [nodejs/node#13168 — setTimeout not always firing when computer sleeps/wakes](https://github.com/nodejs/node/issues/13168)
- [nodejs/node#6763 — setTimeout delayed when sleeping on Windows](https://github.com/nodejs/node/issues/6763)
- [chrisguttandin/worker-timers#168 — setTimeout doesn't work when laptop asleep](https://github.com/chrisguttandin/worker-timers/issues/168)

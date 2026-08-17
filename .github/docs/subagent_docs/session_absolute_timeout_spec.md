# Session Absolute Timeout + Idle Timeout — Spec

## Current State Analysis

Auth flow: Entra ID OAuth (MSAL) → app-issued JWT access token (`access_token` cookie)
+ JWT refresh token (`refresh_token` cookie), both HttpOnly.

- Access token: signed with `JWT_ACCESS_SECRET`, lifetime `JWT_EXPIRES_IN` (default `1h`),
  cookie `maxAge` hardcoded to 30 min (`backend/src/config/cookies.ts:22`).
- Refresh token: signed with `JWT_REFRESH_SECRET`, lifetime `REFRESH_TOKEN_EXPIRES_IN`
  (default `7d`), tracked in `RefreshToken` table by `jti` for revocation/reuse detection.
  Rotated on every use (`backend/src/controllers/auth.controller.ts` — `refreshToken`
  handler, lines ~586-617): a new `jti`, new 7-day-expiry JWT, and a new DB row are
  created every time; the old `jti` is marked `revokedAt`.
- Frontend (`frontend/src/services/api.ts`) runs a **proactive refresh timer**
  (`PROACTIVE_REFRESH_MS = 25 min`) that resets on any `mousedown`/`keydown`/`scroll`/
  `touchstart` activity (throttled to once/60s) and calls `/api/auth/refresh-token`
  whenever it fires while `isAuthenticated`.

**Root cause of "signed in for days on end":** because refresh rotates the refresh
token with a fresh 7-day `maxAge` every ~25 minutes during any activity, and there is
no value anywhere that remembers when the session *originally* started, the effective
session lifetime is unbounded — it slides forward forever as long as the tab stays
open and the user occasionally touches the mouse/keyboard. There is also no idle
timeout: the refresh timer only cares whether *any* activity happened in the last
throttle window, not how long the user has actually been away.

## Problem Definition

Add two independent session controls, per user decision:

1. **Absolute session lifetime: 12 hours.** Measured from the original login
   (Entra OAuth callback), not reset by token rotation. Once elapsed, the next
   refresh attempt is rejected and the user must fully re-authenticate via Entra.
2. **Idle timeout: 60 minutes.** If the user produces no tracked activity
   (mouse/keyboard/scroll/touch) for 60 consecutive minutes, the frontend signs
   the user out (revokes server-side refresh tokens + clears cookies) even if
   the absolute cap hasn't been reached.

## Proposed Solution

### 1. Absolute cap — backend, JWT-payload-carried, no DB migration

Add `sessionStart: number` (epoch ms) to `JWTRefreshTokenPayload`. Set once at
login (`callback` handler) to `Date.now()`. On every rotation (`refreshToken`
handler), copy the **incoming** `decoded.sessionStart` into the new token's
payload unchanged — it must never be reset by rotation, or the cap is defeated.

In the `refreshToken` handler, after the existing `isRefreshTokenPayload` guard
and DB `storedToken`/`revokedAt` checks, add:

```ts
const ABSOLUTE_SESSION_MS = parseExpiryMs(process.env.ABSOLUTE_SESSION_MAX || '12h');
if (Date.now() - decoded.sessionStart >= ABSOLUTE_SESSION_MS) {
  await prisma.refreshToken.updateMany({
    where: { userId: decoded.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  throw new AuthenticationError('Session expired — please sign in again');
}
```

This reuses the existing `AuthenticationError` → 401 → cookie-clear catch path
already in the handler, so no new response branch is needed.

`isRefreshTokenPayload` is tightened to require `sessionStart` be a `number`.
This makes the check **fail-closed**: any refresh token issued before this
change ships (which won't carry `sessionStart`) fails the type guard on its
next use and is treated as an invalid payload — the user is forced to fully
re-login once. This is a deliberate, simple, one-time transition (no dual-path
fallback code) and should be called out to the user as a deploy-time effect:
**every currently-signed-in user will be logged out the next time their token
refreshes after this deploys** (within ~25 minutes for active users).

New env var, following the existing `JWT_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN`
duration-string convention (parsed by the existing `parseExpiryMs` helper):

```
# Absolute session lifetime from original login — NOT reset by token refresh.
# Once elapsed, refresh is rejected and the user must fully re-authenticate.
# OPTIONAL — default: 12h
ABSOLUTE_SESSION_MAX=12h
```

Added to `.env.example` (documentation only — `.env` itself is not committed;
no Docker Compose change needed since backend already loads `.env` via
`dotenv.config()` and Compose's `env_file`/interpolation already covers new
keys added to `.env`).

### 2. Idle timeout — frontend, mirrors existing proactive-refresh pattern

`frontend/src/services/api.ts` already has a self-contained activity-tracking
system for the proactive refresh timer. Add a second, independent timer using
the same activity listeners:

```ts
const IDLE_LOGOUT_MS = 60 * 60 * 1000; // 60 minutes
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelIdleLogout() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function scheduleIdleLogout() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (useAuthStore.getState().isAuthenticated) {
      cancelProactiveRefresh();
      axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true }).finally(() => {
        sessionStorage.setItem('explicit_logout', 'true');
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      });
    }
  }, IDLE_LOGOUT_MS);
}
```

`onUserActivity()` calls `scheduleIdleLogout()` alongside the existing
`scheduleProactiveRefresh()` call. `cancelIdleLogout()` is called everywhere
`cancelProactiveRefresh()` currently is, so both timers are torn down together:
- `frontend/src/components/layout/AppLayout.tsx:234` (manual logout)
- `frontend/src/pages/AccessDenied.tsx:33` (forced logout)
- `frontend/src/services/api.ts:38` (refresh-failure forced logout, inside `doRefresh`'s catch)

The idle logout calls the real `/api/auth/logout` endpoint (not just local state
clearing) so the server-side refresh token is actually revoked — consistent with
how `AppLayout.tsx`'s manual logout already behaves, and necessary so a still-valid
refresh token cookie can't silently resurrect the session if the user returns and
triggers an API call before hitting `/login`.

**Scope note:** this is a client-enforced idle timeout, same trust model as the
existing proactive-refresh mechanism already in this codebase (client-driven,
not server-verified per-request). The 12-hour absolute cap above is the real
server-enforced backstop; the idle timeout is a UX/policy layer on top of it,
consistent with how session timers already work here. A fully server-verified
idle timeout would require stamping/checking last-activity on every authenticated
request and is out of scope for what was asked.

## Implementation Steps

1. `backend/src/types/auth.types.ts` — add `sessionStart: number` to
   `JWTRefreshTokenPayload`; require it (as `number`) in `isRefreshTokenPayload`.
2. `backend/src/controllers/auth.controller.ts`:
   - `callback`: set `sessionStart: Date.now()` when building `refreshTokenPayload`.
   - `refreshToken`: add the absolute-cap check (revoke + throw `AuthenticationError`)
     after the existing reuse-detection block; carry `sessionStart: decoded.sessionStart`
     forward into `newRefreshTokenPayload` (not reset).
3. `.env.example` — document `ABSOLUTE_SESSION_MAX=12h` next to the other JWT vars.
4. `frontend/src/services/api.ts` — add `IDLE_LOGOUT_MS`, `idleTimer`,
   `cancelIdleLogout()`, `scheduleIdleLogout()`; wire into `onUserActivity()`.
5. `frontend/src/components/layout/AppLayout.tsx` and
   `frontend/src/pages/AccessDenied.tsx` — import and call `cancelIdleLogout()`
   alongside the existing `cancelProactiveRefresh()` calls.

## Dependencies

None new. Reuses existing `jsonwebtoken`, `axios`, and the in-repo `parseExpiryMs`
helper already in `auth.controller.ts`. No Context7/external-docs lookup required —
no new library, no version-sensitive API surface touched (Express 5 route
signatures, Prisma calls, and JWT signing calls are all unchanged patterns already
used elsewhere in this file).

## Configuration Changes

- New optional env var `ABSOLUTE_SESSION_MAX` (default `12h`), documented in
  `.env.example`. No schema/migration change — no Prisma changes required.

## Risks and Mitigations

- **Risk:** All currently-active sessions are force-logged-out on deploy (fail-closed
  type guard rejects pre-existing tokens missing `sessionStart`).
  **Mitigation:** Acceptable one-time effect of the fix itself (this is what stops the
  runaway sliding window); call it out explicitly to the user pre-deploy so it isn't
  mistaken for a bug. No code path needed to soften it.
- **Risk:** Idle timeout is client-enforced only; a user could tamper with client JS to
  suppress it.
  **Mitigation:** The 12-hour absolute cap is server-enforced regardless, so the
  worst case with a tampered client is the existing 12-hour ceiling, not unbounded
  sign-in — same trust boundary the existing proactive-refresh code already accepts.
- **Risk:** Idle logout firing while a long-running mutation is mid-flight.
  **Mitigation:** 60 minutes of zero mouse/keyboard/scroll/touch activity is a
  deliberately generous threshold; not addressed further per simplicity-first (no
  new "operation in progress" tracking requested or justified).

## Build/Test Commands To Be Used In Phase 3/6

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS are required by this change (no Prisma schema change, no
migration needed).

# Spec: Eliminate spurious `/auth/me` 401 + flash during OAuth callback

## Current State Analysis

Login flow (`frontend/src/App.tsx`, `frontend/src/pages/Login.tsx`,
`frontend/src/store/authStore.ts`):

1. `App.tsx` wraps all routes in `AuthInitializer`, which unconditionally calls
   `useAuthStore.getState().initializeAuth()` on mount (`App.tsx:85-92`).
   `initializeAuth()` calls `GET /api/auth/me` and sets `isLoading: false` in its
   `finally` block regardless of outcome (`authStore.ts:71-85`).
2. The Entra OAuth redirect (`window.location.href = authUrl`) is a **full page
   navigation**. When Entra redirects back to `/login?code=...`, the whole React
   app remounts from scratch — the Zustand store resets to its defaults
   (`isLoading: true`, `isAuthenticated: false`) and `AuthInitializer` fires again.
3. At that exact moment there is **no session cookie yet** — the authorization
   `code` has not been exchanged for tokens. `GET /api/auth/me` is therefore a
   **guaranteed 401** on this remount. This is the request visible in the console
   (`GET http://localhost/api/auth/me 401 (Unauthorized)`).
4. In parallel, `Login.tsx`'s own effect (`Login.tsx:35-44`) detects the `code`
   param and calls `handleCallback`, which hits `GET /auth/callback`, and on
   success calls `setUser()` (`isAuthenticated: true`) and navigates to
   `/dashboard`.
5. Because `/auth/me` is a cheap probe that typically resolves before the slower
   Entra token-exchange request, the store cycles `isLoading: true → false`,
   `isAuthenticated: false` from the unrelated 401 shortly before `handleCallback`
   resolves and overwrites it with the real, authenticated state. This spurious
   intermediate state change is the visible "flash" reported by the user, and the
   401 request/response is the console log entry.
6. This is also a **race hazard**, not just cosmetic: if `/auth/me` ever resolved
   *after* `handleCallback`'s `setUser()` call (e.g. a slow `/auth/me` request, or
   a fast Graph token exchange), its `catch` branch would run
   `set({ user: null, isAuthenticated: false })` and silently clobber a
   just-established authenticated session.

## Problem Definition

`AuthInitializer` has no way to know that a mount is actually the tail end of an
OAuth redirect rather than a fresh visit, so it always probes `/auth/me` — even
on the one code path (`/login?code=...`) where the probe is certain to fail and
whose result is immediately superseded by `Login.handleCallback`.

## Proposed Solution

In `AuthInitializer`, detect the OAuth-callback case before calling
`initializeAuth()`:

- If `window.location.pathname === '/login'` and the URL has a `code` query
  param, skip the `/auth/me` probe entirely and just resolve the store's
  `isLoading` to `false` via the existing `setLoading` action (so
  `ProtectedRoute`'s `if (isLoading) return null;` guard doesn't block forever
  waiting on a call that will never run). `Login.handleCallback` independently
  establishes `user`/`isAuthenticated` from the callback response, exactly as it
  does today.
- Otherwise (normal app load, no OAuth code in flight), behavior is unchanged:
  call `initializeAuth()` as before.

This removes the guaranteed-to-fail request, removes the console noise, and
removes the race window — with no behavior change to any other auth path
(fresh visits, silent SSO redirect, manual login button, refresh, logout).

## Implementation Steps

1. `frontend/src/App.tsx` — in `AuthInitializer`'s effect, read
   `window.location.pathname` + `search` once on mount; if on `/login` with a
   `code` param, call the store's `setLoading(false)` and return early instead of
   calling `initializeAuth()`.

## Dependencies

None — internal code change only, no new packages, no version-sensitive API
usage. Per CLAUDE.md Dependency Policy, external doc verification is not
required for internal-only changes with no new dependencies.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Skipping `initializeAuth()` could leave `isLoading` stuck `true`
  forever if `setLoading(false)` were forgotten, hanging `ProtectedRoute`.
  **Mitigation:** explicitly call the store's `setLoading(false)` in the skip
  branch.
- **Risk:** Regressing the `error=` (silent SSO failed) or plain `/login`
  (no params) cases. **Mitigation:** the skip condition is narrowly scoped to
  `pathname === '/login' && code param present` only; every other case falls
  through to the existing `initializeAuth()` call, unchanged.
- **Risk:** False positive if a legitimate non-OAuth page ever has a `code`
  query param on `/login`. **Mitigation:** `/login` is a dedicated route only
  ever hit by this app's own OAuth flow; no other feature uses a `code` param
  there.

## Verification

- Manual: sign out, sign back in — no `/api/auth/me 401` entry should appear in
  the console during the `/login?code=...` redirect leg; dashboard loads without
  a visible flash.
- Regression: fresh cold visit to `/` with no session still shows the normal
  `/auth/me` 401 → redirect to `/login` (this probe is legitimate and expected
  there, and is intentionally left unchanged).
- Build: `docker compose -f docker-compose.dev.yml build frontend` (frontend
  `tsc` + `vite build`) must succeed.

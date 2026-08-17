# Spec: Fix history-manipulation intervention on login redirect

## Current State Analysis

`frontend/src/pages/Login.tsx` has three `navigate()` calls after auth
resolves:

- Line 30 (auth-resolved redirect effect): `navigate('/dashboard');` — no
  `replace`.
- Line 94 (OAuth callback success, inside `handleCallback`):
  `navigate('/dashboard');` — no `replace`.
- Line 100 (OAuth callback failure): `navigate('/login', { replace: true
  });` — already uses `replace`.

Both success-path calls fire from a `useEffect`/async handler with no
preceding user gesture (they run automatically once auth state resolves or
once the OAuth code exchange completes). React Router's `navigate()` without
`replace` calls `history.pushState`, adding a new browser history entry.

Chrome's "history manipulation" intervention detects script-initiated
`pushState` calls with no user interaction and marks the entry left behind —
here, `/login?code=...&client_info=...&state=...&session_state=...` — as
"skippable" for back/forward navigation, exactly the DevTools Issue reported
by the user.

## Problem Definition

Two things are wrong with using `pushState` (the default, non-`replace`
behavior) here:

1. **UX / browser intervention:** it leaves the `/login?code=...` URL in
   history. If the user later presses Back, the browser (per its own
   intervention) skips that now-broken entry — the code has already been
   consumed and pressing Back would otherwise strand the user on a login page
   that immediately tries to redeem an already-spent authorization code and
   fails. Chrome is proactively working around exactly this trap.
2. **Sensitive data lingering in history:** the OAuth `code`, `client_info`,
   `state`, and `session_state` query params stay in the browser's history
   list (and thus visible in history/autocomplete UI) longer than necessary.

## Proposed Solution

Use `navigate('/dashboard', { replace: true })` in both success-path calls,
matching the existing pattern already used in the failure branch
(`navigate('/login', { replace: true })`). This replaces the current history
entry (the `/login?code=...` URL) instead of pushing a new one on top of it,
so:

- No stale `/login?code=...` entry is ever left in history.
- No browser intervention is triggered, since no unsolicited `pushState`
  happens.
- Pressing Back from `/dashboard` goes to whatever the user was on *before*
  the OAuth redirect (or straight out of the app if it was the entry point),
  not back into a broken mid-login state.

## Implementation Steps

1. `frontend/src/pages/Login.tsx` line 30 — `navigate('/dashboard')` →
   `navigate('/dashboard', { replace: true })`.
2. `frontend/src/pages/Login.tsx` line 94 — `navigate('/dashboard')` →
   `navigate('/dashboard', { replace: true })`.

## Dependencies

None — uses `react-router-dom`'s existing `navigate(to, { replace })` option,
already in use elsewhere in this exact file.

## Risks and Mitigations

- **Risk:** any other code path relies on `/login` remaining in history after
  a successful login. **Mitigation:** searched for `navigate('/login')` /
  back-navigation-dependent logic elsewhere in the login flow; none found —
  the failure branch already treats `/login` as replaceable for the same
  reason.
- **Risk:** double-navigation ordering. `handleCallback`'s `setUser()` call
  flips `isAuthenticated`, which could also fire the redirect effect (line
  28-32) in addition to `handleCallback`'s own explicit navigate — both now
  use `replace: true`, so whichever fires (or if both fire) the net result is
  still a single replaced entry at `/dashboard`, not a stack of duplicates.

## Verification

- Manual: log in, confirm DevTools Issues tab no longer reports "Session
  History Item Has Been Marked Skippable" for the `/login?code=...` URL.
- Manual: after login, press Back — lands outside the app (or on whatever
  page preceded the Entra redirect), not on a broken `/login?code=...` page.
- Build: `docker compose -f docker-compose.dev.yml build frontend` must
  succeed.

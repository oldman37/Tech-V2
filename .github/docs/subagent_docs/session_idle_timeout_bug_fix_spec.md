# Idle-Timeout "Still Logged In Overnight" — Bug Spec

## Reported Symptom

User `jlewis@ocboe.com` left the app open overnight and was still logged in the next
morning, despite the idle-timeout feature (60 min of no mouse/keyboard/scroll/touch
activity → forced logout) shipped in the Session Absolute Timeout + Idle Timeout fix
(`session_absolute_timeout_spec.md` / `_review_final.md`, both APPROVED at the time).

## Current State Analysis

`frontend/src/services/api.ts` — `scheduleIdleLogout()`:

```ts
idleTimer = setTimeout(() => {
  if (!useAuthStore.getState().isAuthenticated) return;
  cancelProactiveRefresh();
  cancelIdleLogout();
  axios
    .post(`${API_URL}/auth/logout`, {}, { withCredentials: true })
    .catch(() => {
      // Best-effort — cookies may already be invalid; proceed to clear local state regardless
    })
    .finally(() => {
      sessionStorage.setItem('explicit_logout', 'true');
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    });
}, IDLE_LOGOUT_MS);
```

The comment on `.catch()` documents the intent correctly: local state must be cleared
*"regardless"* of whether the server call succeeds. But the code only delivers on that
intent if the `axios.post(...)` promise actually **settles** (resolves or rejects).
`axios.post` here is called with no `timeout` option, so if the request never gets a
response — no error, no success — the promise never settles, `.finally()` never runs,
and `clearAuth()` / the redirect to `/login` never happen.

An unresolved (rather than quickly-failed) request is exactly what happens when a
laptop is put to sleep with the request in flight, or the network is flaky right as
the machine suspends: the OS can freeze the TCP connection mid-handshake/mid-request
rather than erroring it out immediately, and without a client-side timeout the
underlying default socket timeout can be very long (many minutes to longer). Sleeping
a laptop for the night — the single most common way a work machine actually goes idle
overnight — is precisely the moment a network transition is most likely, which is also
precisely the moment the idle-logout timer is arming/firing (both keyed off "no
activity for 60 minutes"). The result: the fetch to `/auth/logout` hangs, `.finally()`
never runs, cookies are never cleared client- or server-side, and the session survives
indefinitely — matching the reported symptom exactly.

This is a **regression risk specific to this fix**: `scheduleIdleLogout()` is new code
in this change, and its whole job is to be the thing that fires unattended, overnight,
with nobody present to notice or retry a stuck request.

## Root Cause

`axios.post` in `scheduleIdleLogout()`'s timer callback has no request timeout, so a
network hang at the moment of firing can prevent the promise from ever settling,
which silently defeats the entire idle-logout mechanism for the duration of the hang.

## Fix

Add a bounded client-side `timeout` to the axios call so the promise is guaranteed to
settle (as a timeout error, routed through the existing `.catch()`) within a short,
known window, restoring the "clear local state regardless" guarantee the code already
documents. This is a one-line, surgical change — no behavior change on the happy path
(server still gets the revoke request and clears cookies via `Set-Cookie` before the
redirect, exactly as today), only a bound on the unhappy path.

`frontend/src/services/adminService.ts:201` already establishes the in-repo convention
of passing `timeout` on an axios call config, so this matches existing style.

Timeout value: 8000 ms (8s) — long enough not to falsely abort a slow-but-live request,
short enough that "regardless" is actually true in practice rather than theoretical.

## Implementation Steps

1. `frontend/src/services/api.ts` — add `timeout: 8000` to the `scheduleIdleLogout()`
   axios.post config.

## Dependencies

None new. `timeout` is a core Axios `AxiosRequestConfig` option already in use
elsewhere in this codebase (`adminService.ts`) — no version-sensitive API surface,
no Context7/doc lookup required.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** A slow-but-legitimate logout request could be aborted at 8s, causing the
  server-side revoke to not complete even though the network was fine.
  **Mitigation:** Local state is still cleared and the user is still redirected to
  `/login` (via `.catch()` → `.finally()`), so the user experience is correct either
  way; only the (already best-effort, not user-visible) server-side revoke might be
  slightly delayed until the account's next natural refresh/reuse-detection cycle.
  This is strictly better than the current unbounded hang.

## Build/Test Commands To Be Used In Phase 3/6

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS required (no schema change, no migration, frontend-only fix).

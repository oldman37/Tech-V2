# API Error Message Passthrough — Spec

## Current State Analysis

The frontend makes all authenticated API calls through a single shared Axios instance,
`api`, created in [frontend/src/services/api.ts](../../../frontend/src/services/api.ts).
That instance already has a response interceptor (lines 132–180) that handles CSRF token
caching, 401 refresh-and-retry, and 503 maintenance-mode redirects.

The backend already returns structured, human-readable error bodies on failure:

- `express-rate-limit` responses (e.g. the admin job trigger limiter in
  [backend/src/routes/admin.routes.ts:244](../../../backend/src/routes/admin.routes.ts#L244)):
  `{ error: "Too many job triggers. Please wait before retrying." }` — human text lives in `error`, no `message` field.
- Everything routed through `handleControllerError`
  ([backend/src/utils/errorHandler.ts](../../../backend/src/utils/errorHandler.ts)):
  `{ error: CODE, message: "human-readable text", details?/meta? }` — human text lives in `message`,
  `error` is a machine code (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`, …).
- Network failures / CORS rejections / anything that never reaches Express: no `response` at all,
  so there is no body to read.

**The bug:** most frontend call sites never read `error.response.data` at all. They display
`err.message` (a plain `Error`/`AxiosError.message`) or `err instanceof Error ? err.message : '...'`.
For an `AxiosError`, `.message` is Axios's own generic text ("Request failed with status code 429"),
**not** the backend's response body. This is confirmed as the cause of the message the user saw
when editing a cron schedule and hitting the admin job rate limiter.

Grep confirms `err.message` / `error.message` is used directly (no extraction) in **78 places across
32 frontend files**. Exactly one file — `getErrorMessage()` in
[frontend/src/pages/admin/AdminJobsPage.tsx:68](../../../frontend/src/pages/admin/AdminJobsPage.tsx#L68) —
already does correct extraction, but only checks `data?.error` (not `data?.message`) and is a local,
unshared helper.

Two frontend files bypass the shared `api` instance entirely, importing bare `axios` instead:
`frontend/src/services/checkoutReport.service.ts` (all calls) and
`frontend/src/pages/DeviceManagement/BarcodePdfPage.tsx` (already does its own inline
`data.message` extraction, so it's not affected by the bug). These are **out of scope** — switching
`checkoutReport.service.ts` off bare `axios` is an unrelated architectural change (it also lacks
`withCredentials`, a separate pre-existing concern) and will not be touched here.

## Problem Definition

Users see Axios's generic `"Request failed with status code NNN"` instead of the specific,
actionable message the backend already sends, because nothing on the frontend reads
`error.response.data`.

## Proposed Solution

Fix this once, at the choke point, instead of touching 32 files:

In the response interceptor's rejection handler in `frontend/src/services/api.ts`, before any of
the existing branches (401 refresh, 503 maintenance) run, normalize `error.message` in place:

1. If `error.response?.data` is an object with a non-empty string `message` field, set
   `error.message = data.message`.
2. Else if it has a non-empty string `error` field, set `error.message = data.error`.
3. Else leave `error.message` untouched (network errors, CORS rejections, and anything else with
   no parseable body keep Axios's existing generic text — there is nothing better to show).

Because `AxiosError.message` is a normal mutable string property, and nothing in the frontend
pattern-matches on Axios's literal default message (`grep` for `'Network Error'` / `err.message ===`
returned no hits), this single mutation is picked up automatically by every existing call site that
already does `err.message` or `err instanceof Error ? err.message : ...` — no per-file changes needed.

This also improves the 401-refresh-failure and 503-maintenance paths for free, since the mutation
happens before those branches run (though in practice the maintenance branch redirects instead of
displaying the message, and a failed refresh surfaces a *different* error object from the
`/auth/refresh-token` call, not the original one).

### Why not fix all 78 call sites instead?

- Blast radius: 32 files touched vs. 1.
- The generic-message pattern would inevitably regress again the next time someone writes a new
  `catch (err) { setError(err.message) }` without knowing about a shared helper.
- Fixing it at the interceptor means *every* current and future call site benefits automatically.

### What is explicitly NOT changed

- `AdminJobsPage.tsx`'s local `getErrorMessage()` helper is left as-is. It becomes partially
  redundant (its `err.response.data.error` branch now rarely triggers because `.message` usually
  wins first at the interceptor level) but it still functions correctly and is out of scope per the
  surgical-changes rule — it's not broken, just no longer the only place doing this.
- `checkoutReport.service.ts` and any other bare-`axios` usage — unrelated to this fix, not touched.
- Backend error shapes — already correct, no change needed.
- Zod validation's generic top-level `message` ("Invalid request parameters") is unchanged; forms
  that need field-level detail already read `.details` separately where implemented.

## Implementation Steps

1. In `frontend/src/services/api.ts`, inside the response interceptor's error callback (currently
   starting `async (error: AxiosError) => {`), add a small type-guarded normalization step as the
   first statement, before the existing 401 branch.
2. No new types, no new files, no new dependencies.

## Dependencies

None — internal code change only, no new external library. Per the Dependency & Documentation
Policy, doc verification is not required for this category of change.

## Configuration Changes

None.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Overwriting `.message` breaks code that pattern-matches Axios's default text | Grep confirmed no such usage exists in the frontend. |
| Backend sends a non-string or missing `message`/`error` field | Type-guard checks `typeof === 'string' && length > 0` before using it; falls through to the next candidate, then to the untouched original message. |
| Network/CORS errors lose useful info | Explicitly left untouched — only overwrite when a real body exists. |
| Regression in 401/503 branches | Mutation happens before those branches read `error`; behavior of those branches (status/data checks) is unaffected since only `.message` is touched, not `.response`. |

## Build / Test Plan (Phase 3 & 6)

- `docker compose -f docker-compose.dev.yml build frontend` — compiles TS + Vite build, the only
  affected workspace.
- `scripts/preflight.ps1` — full gate (backend + frontend builds) for Phase 6, per project standard.

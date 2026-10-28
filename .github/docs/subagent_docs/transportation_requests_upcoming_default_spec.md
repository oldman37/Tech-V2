# Transportation Requests — Upcoming-Only Default View (Spec)

## Current state
- `GET /api/transportation-requests` → `transportationRequestService.list()` returns **all** requests
  (scoped by permission) ordered by `tripDate asc`. Optional `from`/`to` filter on `tripDate`.
- `TransportationRequestsPage.tsx` shows every request, past trips included.
- Field Trip → Transportation History (`fieldTripTransportationService.listHistory`) already does:
  no explicit `from`/`to` → only trips not yet passed; explicit range → exactly that window, past
  included. UI shows the caption "Showing upcoming trips only — pick a date range to view past trips."

## Problem
Users want the standalone Transportation Requests list to behave the same way: hide trips whose
date has passed by default, and surface them only on demand via the date range.

## Design
**Backend** (`backend/src/services/transportationRequest.service.ts`, `list`):
- If neither `from` nor `to` is supplied, filter `tripDate >= start of today`.
- `TransportationRequest` has only `tripDate` (no `returnDate`) — single-day trips, so no
  overnight `OR` branch is needed.
- Timezone: `tripDate` is submitted as `YYYY-MM-DD` and stored at `00:00Z`; the backend container
  runs with `TZ=America/Chicago`. A local `setHours(0,0,0,0)` cutoff (05:00/06:00Z) would hide
  *today's* trips. Use the server's local calendar date expressed as UTC midnight:
  `new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))`.
- Explicit `from`/`to` behaviour is unchanged.
- Authorization scoping unchanged. The status filter still composes with the date filter.

**Frontend** (`frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`):
- Add the same caption as the field trip tab when no date range is set (desktop filter row and
  mobile filter panel). Update the page doc comment. No other behavior change.

Only consumer of the endpoint is this page (verified by grep), so no other view is affected.

## Addendum (2026-10-28) — keep unapproved requests from rolling off
User request: past-dated requests that are still awaiting approval must stay in the default view.
- Default (no `from`/`to`) condition becomes
  `tripDate >= today OR status IN (PENDING_SUPERVISOR_APPROVAL, PENDING_SECRETARY_REVIEW)`.
  `APPROVED` and `DENIED` still roll off.
- Level-1 users already use `where.OR` for permission scoping, so the new OR **must** be added via
  `where.AND`. Assigning `where.OR` would replace the permission scope and leak other users' requests.
- An explicit `status` filter still applies on top (AND), so e.g. "Approved" shows upcoming approved only.
- Caption text: "Showing upcoming trips and any still awaiting approval — pick a date range to view past trips."
- Field trip Transportation History same-day concern: investigated, **no bug**. The field trip form
  stores dates at local noon (`T12:00:00` → 17:00Z), confirmed in the dev DB (all 4 rows at 17:00Z),
  so the local-midnight cutoff in `listHistory` keeps same-day trips. No change needed.

## Steps
1. Edit service `list` → verify: backend image build compiles.
2. Add caption to page → verify: frontend image build compiles.
3. Preflight `scripts/preflight.ps1` → exit code 0.

## Approved validation commands
- `powershell -File scripts/preflight.ps1` (runs backend + frontend Docker image builds)

## Dependencies / config
None. No schema change, no migration.

## Risks
- Pending requests whose trip date has passed disappear from the default view (they remain
  reachable via a date range). This is the requested behavior.
- Near midnight the cutoff uses the server's local (Chicago) date, which is consistent with the
  district's calendar day.

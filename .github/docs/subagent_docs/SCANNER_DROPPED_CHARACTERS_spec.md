# Spec: Barcode scanner drops characters in URL-backed search boxes

## Current state analysis

- `frontend/src/App.tsx:96` mounts `<BrowserRouter>` with no props.
- `package.json` declares `"react-router-dom": "^7.12.0"`; the committed lock
  file resolves this to **7.17.0** exactly (verified via `package-lock.json`
  `packages["node_modules/react-router-dom"].version` and
  `packages["node_modules/react-router"].version`, both `7.17.0`).
- react-router v7's `<BrowserRouter>` wraps every router state update in
  `React.startTransition` unless `useTransitions={false}` is passed. This is a
  documented default on the `BrowserRouterProps` type in that release.
- `frontend/src/hooks/useFilterParams.ts` backs every list-page search/filter
  input with `useSearchParams` (confirmed at `useFilterParams.ts:16,19`) — i.e.
  the input's `value` prop is derived from URL/router state, not local
  `useState`.
- Grep across `frontend/src/pages` for `useFilterParams` usage found **20**
  consuming pages in this repo (the source doc found 11 in its own tree) —
  including `CheckoutPage.tsx`, `WorkOrderListPage.tsx`, `Users.tsx`,
  `IncidentsPage.tsx`, `RepairTicketsPage.tsx`, `InvoicesPage.tsx`,
  `PurchaseOrderList.tsx`, `FieldTripListPage.tsx`,
  `FieldTripApprovalPage.tsx`, `TransportationRequestsPage.tsx`,
  `TransportationUnitsPage.tsx`, `MvrRecordsPage.tsx`,
  `MyFuelHistoryPage.tsx`, `DriverLicensePage.tsx`, `DotPhysicalsPage.tsx`,
  `RoomAssignmentsPage.tsx`, `UserCheckoutHistoryPage.tsx`,
  `CheckedOutCartsPage.tsx`, `UnresolvedInventoryPage.tsx`,
  `InventoryAuditHistoryPage.tsx`.
- Grep for `React.lazy` / `Suspense` across `frontend/src` returned **no
  matches** — there are no lazy routes or Suspense boundaries anywhere in the
  app. Nothing in this codebase relies on router-state transitions today.

## Problem definition

A controlled input whose `value` comes from `useSearchParams` reverts each
keystroke to its last-committed value until the pending transition commits,
because `React.startTransition` defers that commit off the discrete-event
lane. Human typing speed (~100ms/keystroke) never notices this — the
transition always resolves between events. A barcode scanner emitting
characters within a few milliseconds does notice: most characters arrive
before the prior transition commits and are silently discarded (reported as
"2 of 5 characters" landing on the Active Checkouts search box). Any of the 20
URL-backed search inputs in this repo is subject to the same defect; Checkouts
is simply where a scanner is used.

## Proposed solution

Pass `useTransitions={false}` to the single `<BrowserRouter>` in
`frontend/src/App.tsx`. This returns router state commits to the synchronous/
urgent lane app-wide, fixing every affected input with a one-line change and
no page-level edits. Safe here specifically because there are no lazy routes
or Suspense boundaries in this app (confirmed above) — re-verify that
precondition if lazy routes are introduced later.

Rejected alternative: giving each of the 20 pages a local `useState` mirror
for its search input. Correct in principle, but it's 20+ near-identical edits
instead of one, treats only inputs known-affected today, and leaves the trap
armed for the next page that wires an input to `useFilterParams`.

## Implementation steps

1. In `frontend/src/App.tsx`, change `<BrowserRouter>` to
   `<BrowserRouter useTransitions={false}>`.
2. Add a `//` line comment (not a JSX comment — a JSX comment placed between
   `return (` and the root element breaks the single-parent-element rule and
   fails the TS/JSX compile) directly above the `App` function or above the
   `return` statement, explaining: why the flag is set (scanner-speed input
   loss on `useSearchParams`-backed inputs), that it's compared with strict
   `=== false` (so omitting the prop or passing `undefined` leaves transitions
   on), and the precondition under which it's safe to remove (no lazy routes /
   no Suspense — re-add local state to affected inputs first if that changes).
3. No changes to `useFilterParams.ts` or any individual page — the hook and
   pages are correct; only the router's scheduling was wrong.

## Dependencies

No new dependency. `useTransitions` is a prop on the already-installed
`react-router-dom@7.17.0`'s `<BrowserRouter>` (verified against the resolved
lock-file version). Existence in the installed type definitions will be
confirmed empirically by the frontend `tsc` build in Phase 3/6 — that is the
authoritative check, since the host has no `node_modules` to inspect directly.

## Configuration changes

None. No env vars, no Prisma schema, no MSAL/Graph scopes.

## Risks and mitigations

- **Risk:** `useTransitions` doesn't exist at the exact installed version and
  a bare-JS consumer silently ignores it, leaving the bug unfixed with no
  compile error. **Mitigation:** the frontend `tsc` build is a hard compile
  gate in this repo (TypeScript, not plain JS) — if the prop isn't in the
  installed type definitions, the build fails loudly rather than the app
  silently continuing to transition-wrap.
- **Risk:** disabling transitions app-wide regresses something that currently
  relies on non-urgent scheduling (e.g. a lazy route flashing a fallback).
  **Mitigation:** confirmed zero `React.lazy`/`Suspense` usage in
  `frontend/src` above; nothing currently depends on transition behavior.
- **Risk:** this fix cannot be verified by an automated test — it depends on
  real inter-event timing that jsdom does not reproduce. **Mitigation:**
  state this plainly in the review/verification output; rely on the `tsc`
  compile gate for correctness of the API usage, and flag manual scanner
  verification as still-needed, matching how the source fix was verified.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build frontend` (compiles `tsc`
  then `vite build` — the authoritative check that `useTransitions` exists in
  the installed types)
- `docker compose -f docker-compose.dev.yml build backend` (unaffected;
  confirms no incidental breakage)
- `scripts/preflight.ps1` (Phase 6 gate, runs both of the above)

No FORBIDDEN COMMANDS are needed for this change (no schema/migration, no
host npm, no database-touching command).

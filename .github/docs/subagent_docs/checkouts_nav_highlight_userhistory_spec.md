# Spec: Fix nav highlight on user checkout history page

## Current state analysis

- Route `frontend/src/App.tsx:437` registers the user checkout history page at
  `/device-management/users/:userId/history` — a sibling of
  `/device-management/checkouts` (`App.tsx:447`), not a child of it.
- The one link to that route is in
  `frontend/src/pages/DeviceManagement/CheckoutPage.tsx:161`, the assignee-name
  cell of the Checkouts table.
- Nav active-item resolution (`findMatchingNavItem`,
  `frontend/src/components/layout/AppLayout.tsx:61-78`) does longest-prefix
  matching of `location.pathname` against each `NAV_SECTIONS` item's `path`.
  Relevant nav items (`AppLayout.tsx:110-117`):
  - `DM Dashboard` → `/device-management`
  - `Checkouts` → `/device-management/checkouts`
  - `Bulk Checkout` → `/device-management/checkouts/bulk`
  - `Bulk Check-In` → `/device-management/checkouts/bulk-checkin`
- `/device-management/users/123/history` starts with `/device-management/`
  (DM Dashboard's prefix) but not `/device-management/checkouts/`, so it falls
  through to DM Dashboard.
- Confirmed via grep: exactly two references to the old path exist in
  `frontend/src` (the route definition and the one link) — no other code
  references it.
- Confirmed `UserCheckoutHistoryPage.tsx` has no hardcoded reference to its
  own route: it reads `userId` via `useParams` and navigates via a generic
  `useGoBack()` hook and absolute paths elsewhere — unaffected by the rename.
- Precedent already exists in this exact repo for nesting a sub-page under its
  owning nav section: `Bulk Checkout` (`/device-management/checkouts/bulk`),
  `Bulk Check-In` (`/device-management/checkouts/bulk-checkin`), and the route
  `/device-management/checkouts/scan` (`App.tsx:457`) are all already nested
  under the `Checkouts` prefix, and `Field Trip Approvals`
  (`/field-trips/approvals`) is nested under `Field Trips`.

## Problem definition

Viewing a user's checkout history (reached by clicking an assignee's name on
the Checkouts page) incorrectly highlights "DM Dashboard" in the nav sidebar
instead of "Checkouts", because the route lives outside the `Checkouts` path
prefix that `findMatchingNavItem` matches against.

## Proposed solution

Move the route under the `Checkouts` prefix so the existing prefix-match logic
resolves it correctly, with no changes to `AppLayout.tsx`. Follows the
established in-repo convention (Bulk Checkout/Bulk Check-In/scan all nested
the same way).

- Old: `/device-management/users/:userId/history`
- New: `/device-management/checkouts/users/:userId/history`

## Implementation steps

1. `frontend/src/App.tsx:437` — change route `path` from
   `/device-management/users/:userId/history` to
   `/device-management/checkouts/users/:userId/history`.
2. `frontend/src/pages/DeviceManagement/CheckoutPage.tsx:161` — change the
   `to={...}` template literal from
   `` `/device-management/users/${u.id}/history` `` to
   `` `/device-management/checkouts/users/${u.id}/history` ``.
3. No changes to `AppLayout.tsx`, `UserCheckoutHistoryPage.tsx`, or any other
   file.

## Dependencies

None — pure route-string change in existing React Router v6 config already
used identically elsewhere in this file (no new APIs, no version research
needed per CLAUDE.md's exemption for internal changes with no new
dependencies).

## Configuration changes

None (no env vars, no Prisma schema, no MSAL/Graph scopes).

## Risks and mitigations

- **Risk:** missing a reference to the old path elsewhere in the app.
  **Mitigation:** grep for `device-management/users` confirmed exactly two
  matches before the change; will re-grep after to confirm zero stale
  references remain.
- **Risk:** the new path accidentally becomes a more specific match than a
  sibling nav item, shadowing something else.
  **Mitigation:** no existing nav item or route uses
  `/device-management/checkouts/users`, so no collision.
- **Risk:** visual/browser regression not caught by build.
  **Mitigation:** trace `findMatchingNavItem` by hand against the new path
  (build-only verification); recommend a manual click-through as a follow-up,
  consistent with the original fix's own caveat.

## Build/test commands to use in Phase 3 (per Resource Constraints)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6)

# Work Order Close Navigation — Spec

## Current State Analysis

`WorkOrderDetailPage.tsx` (`frontend/src/pages/WorkOrderDetailPage.tsx`) handles the
"Update Status" composer action in `handleStatusSubmit`. When the new status is
`CLOSED`, the code (added in commit `2883e06`, "fix(work-orders): navigate to Open
list immediately on close") hard-navigates the user away from the ticket
immediately after a successful status update:

```ts
if (newStatus === 'CLOSED') {
  navigate('/work-orders?status=open', { replace: true });
  return;
}
```

Regardless of where the user came from (a filtered list, search results, the
dashboard, another ticket's link, etc.), closing a ticket always drops them onto
the **unfiltered-by-status** `?status=open` Work Orders list. The user reported
this as a regression: previously, closing a ticket returned them to whatever
page they had come from (e.g. a location-filtered list such as Hillcrest).

Tracing history (`git log` on this file):
- Before commit `95fb04d`, closing a ticket had no automatic navigation coded in
  this file — the only way back was the header `PageBackButton` (plain
  `goBack()`).
- `95fb04d` introduced a `justClosed` flag that made the *Back button* — not an
  automatic redirect — point at `/work-orders?status=closed` after a close.
- `2883e06` replaced that with the current unconditional, automatic
  `navigate('/work-orders?status=open', { replace: true })` on every close.

## Problem Definition (revised after production verification)

**Revision 1** of this spec/fix simply removed the `CLOSED`-specific navigation,
on the theory that closing had never auto-navigated. After deploying that
revision, the user confirmed in production that this was wrong: they expect
closing a ticket to **automatically** return them to whatever page they came
from (e.g. Hillcrest's filtered list) — without a manual Back click — exactly
as it did before. So the actual bug was never "auto-navigation happens on
close" — it's that the auto-navigation goes to the wrong, hardcoded place
(`/work-orders?status=open`) instead of the user's real previous page.

## Proposed Solution

In `handleStatusSubmit`, on a successful `CLOSED` transition, call the existing
`goBack()` handler from `useGoBack()` (`frontend/src/hooks/useGoBack.ts`) — the
same history-back-with-dashboard-fallback logic already used by this page's
header Back button and its error-state Back button — instead of a hardcoded
`navigate('/work-orders?status=open', ...)`. This automatically returns the user
to their actual previous page (filtered or not), matching the previously
correct/expected behavior, while eliminating the hardcoded-destination bug.

This is a pure internal logic change — no new dependencies, no API/schema changes.

## Implementation Steps

1. In `frontend/src/pages/WorkOrderDetailPage.tsx`, in `handleStatusSubmit`'s
   success path, add `if (newStatus === 'CLOSED') { goBack(); return; }` ahead
   of the `setCommentBody(''); setActiveAction(null);` fallthrough shared by
   every other status, using the page's existing `goBack` from `useGoBack()`
   (already imported and used for the error-state Back button — no new import
   needed).

## Dependencies

None — no new packages, no version-sensitive API surface touched.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** `goBack()` falls back to `/dashboard` when there's no history entry
  to pop (e.g. a ticket opened via a fresh deep link) — the user won't land on
  a work-order list at all in that edge case.
  **Mitigation:** This is the exact same fallback already used by the page's
  header Back button in every other scenario on this page; it's the documented,
  intentional behavior of `useGoBack` (see its doc comment), not a new risk
  introduced here.
- **Risk:** Calling `goBack()` skips `setCommentBody('')` / `setActiveAction(null)`
  since the component unmounts on navigation.
  **Mitigation:** Component state is discarded on unmount regardless; no stale
  state can leak back in since revisiting the ticket remounts the page fresh.

## Validation

- `docker compose -f docker-compose.dev.yml build frontend` (frontend compile
  gate — covers TS + Vite build).
- Manual/code trace: confirm `handleStatusSubmit` calls `goBack()` (not a
  hardcoded route) on a successful `CLOSED` transition, and that every other
  status is unaffected.
- Preflight, then redeploy the frontend container (`docker compose -f
  docker-compose.dev.yml up -d frontend`) so the running container actually
  serves the fix — the prior cycle's fix was correct in the image but the
  container wasn't yet running it when first verified.

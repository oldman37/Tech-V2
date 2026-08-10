# Work Order Close Navigation — Spec

## Current State Analysis

`WorkOrderDetailPage.tsx` (`frontend/src/pages/WorkOrderDetailPage.tsx`) handles the
"Update Status" composer action in `handleStatusSubmit`. When the new status is
`CLOSED`, the current code (added in commit `2883e06`, "fix(work-orders): navigate
to Open list immediately on close") hard-navigates the user away from the ticket
immediately after a successful status update:

```ts
if (newStatus === 'CLOSED') {
  navigate('/work-orders?status=open', { replace: true });
  return;
}
```

Regardless of where the user came from (a filtered list, search results, the
dashboard, another ticket's link, etc.), closing a ticket always drops them onto
the **unfiltered-by-status** `?status=open` Work Orders list. The user reports this
as a regression: previously, closing a ticket returned them to whatever page they
had come from, the way `useGoBack` (`frontend/src/hooks/useGoBack.ts`) /
`PageBackButton` behaves everywhere else in the app.

Tracing history (`git log` on this file):
- Before commit `95fb04d`, closing a ticket had **no** special navigation at all —
  the status update just completed in place, and the existing `PageBackButton`
  (plain `goBack()`, i.e. `navigate(-1)` with a dashboard fallback) was the only
  way to leave the page.
- `95fb04d` introduced a `justClosed` flag that made the *Back button* — not an
  automatic redirect — point at `/work-orders?status=closed` after a close.
- `2883e06` replaced that with the current unconditional, automatic
  `navigate('/work-orders?status=open', { replace: true })` on every close,
  removing `justClosed` entirely.

Both later commits were deliberate at the time, but the user's report ("it is not
carrying you back to the previous page as it did before") is asking to restore the
original, pre-`95fb04d` behavior: closing a ticket does not forcibly navigate the
user anywhere. They stay on the (now-closed) detail page and can back out via the
normal `PageBackButton` → `useGoBack()` path, which correctly returns to whichever
page — filtered or not — they arrived from.

## Problem Definition

Closing a work order forcibly redirects to a fixed, unfiltered list
(`/work-orders?status=open`) instead of leaving the user in place / letting the
existing back-navigation mechanism return them to their actual previous page.

## Proposed Solution

In `handleStatusSubmit`, remove the `CLOSED`-specific `navigate(...)` branch so a
close follows the exact same success path as any other status change: clear the
composer (`commentBody`, `activeAction`) and remain on the detail page. No new
navigation logic is introduced — this is a revert to pre-`95fb04d` behavior for
this one branch. `useGoBack` / `PageBackButton` are unchanged and already do the
right thing (`frontend/src/hooks/useGoBack.ts`), so no changes are needed there.

This is a pure internal logic change — no new dependencies, no API/schema changes.

## Implementation Steps

1. In `frontend/src/pages/WorkOrderDetailPage.tsx`, in `handleStatusSubmit`, delete
   the `if (newStatus === 'CLOSED') { navigate(...); return; }` block so the
   function falls through to the existing `setCommentBody(''); setActiveAction(null);`
   for every status, including `CLOSED`.
2. `navigate` is still used elsewhere on the page? Verify — if this was its only
   remaining use, drop the now-unused `useNavigate` import/`navigate` binding to
   avoid an unused-variable lint/build error (only if truly orphaned by this
   change, per the surgical-changes rule).

## Dependencies

None — no new packages, no version-sensitive API surface touched.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Removing the redirect could look like the ticket "didn't close" if a
  user expects to be bounced somewhere.
  **Mitigation:** The status chip, Reopen button, and status history entry update
  in place immediately (existing `useWorkOrder` query invalidation via the
  mutation hook), so the closed state is visibly confirmed without navigation.
  This matches how every other status transition already behaves.
- **Risk:** Orphaned `navigate` import if it was only used for this branch.
  **Mitigation:** Step 2 checks remaining usages before touching the import.

## Validation

- `docker compose -f docker-compose.dev.yml build frontend` (frontend compile
  gate — covers TS + Vite build, will catch an unused-import error).
- Manual/code trace: confirm `handleStatusSubmit` no longer branches on
  `CLOSED` for navigation purposes.

# Work Order Detail Page — Mobile Combined Card (Spec)

## Current State Analysis

`frontend/src/pages/WorkOrderDetailPage.tsx` renders the detail view as a single
CSS grid (`WorkOrderDetailPage.tsx:783`):

```
sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: {...} }}
```

DOM order (which also drives visual stacking order at `xs`, since there is no
`order` override):

1. Left column `Box` (`:785`)
   - Description `Paper` (`:787-816`)
   - Comments & Activity `Paper` (`:819-1041`, includes the activity feed and
     the inline composer for status/priority/assign/request-input/comment)
2. Right column `Box` (`:1045`)
   - Details `Card` (`:1046-1147`) — Reported By, Assigned To, Location, Room,
     Department/Program, Category, Reported Tag Number, Created, Last Updated,
     Resolved

At `xs` the grid collapses to one column, so today's mobile stacking order is:
Description → Comments & Activity → Details.

## Problem Definition

On mobile, the user wants the Description and Details merged into a single
card, placed at the top of the page, with the Comments & Activity card below
it. Desktop (`md+`) layout is explicitly out of scope and must stay exactly as
it is today (per user confirmation: mobile-only change).

## Proposed Solution

This is a UI-only change (no new dependency, no API/type changes) — per the
Dependency & Documentation Policy this does not require external doc
verification.

Because the mobile view needs a different DOM structure (one merged card)
than desktop (two separate cards in a two-column grid), and MUI's `Grid`/`Box`
`order` property cannot merge two `Paper`s into one, the cleanest option
consistent with existing patterns (`AuditItemRow.tsx:78` uses
`display: { xs: 'none', sm: 'flex' }` for responsive show/hide) is:

1. Extract the existing Details card's field list (`WorkOrderDetailPage.tsx:1053-1145`,
   the `Box` containing Reported By / Assigned To / Location / Room /
   Department/Program / Category / Reported Tag Number / Created / Last
   Updated / Resolved) into a small local sub-component,
   `WorkOrderDetailsFields`, that takes `workOrder` as a prop and returns just
   the field list `Box` (no wrapping `Card`/`Paper`, no "Details" heading —
   the caller supplies the heading/card chrome). This lets the exact same
   markup be reused inside both the mobile combined card and the desktop
   Details card without duplicating the field list twice.

2. Restructure the grid's left column so that, on mobile only, Description and
   Details render inside one `Paper`, above Comments & Activity:
   - Add a mobile-only merged card: `display: { xs: 'block', md: 'none' }`,
     containing (in this order, per user confirmation):
     a. "Description" heading + edit affordance + description body (same
        markup/behavior as today, including inline-edit)
     b. A `Divider`
     c. "Details" heading
     d. `<WorkOrderDetailsFields workOrder={workOrder} />`
   - The existing standalone Description `Paper` gets
     `display: { xs: 'none', md: 'block' }` so it only renders on desktop.
   - Comments & Activity `Paper` is unaffected by this display toggling — it
     already sits below Description in DOM order, so it continues to render
     below the mobile combined card automatically.

3. The right column (desktop Details sidebar) gets
   `display: { xs: 'none', md: 'block' }` on its wrapping `Box`, so the
   original Details `Card` only renders on desktop, using the same
   `WorkOrderDetailsFields` sub-component internally to avoid duplicating the
   field markup a third time.

No changes to mutations, hooks, types, routes, or any non-UI logic. All
existing behavior (inline description edit, comment/activity composer,
status/priority/assign/request-input actions) is preserved unchanged — only
presentation/layout structure and responsive visibility change.

## Implementation Steps

1. In `WorkOrderDetailPage.tsx`, add `WorkOrderDetailsFields({ workOrder })` as
   a new sub-component (alongside the other sub-components near the top of
   the file), returning exactly the field-list `Box` currently inlined at
   `:1053-1145`, unchanged apart from being parameterized on `workOrder`.
2. Replace the inline field list inside the existing desktop `Details` `Card`
   (`:1046-1147`) with `<WorkOrderDetailsFields workOrder={workOrder} />`.
3. Add `sx={{ display: { xs: 'none', md: 'block' } }}` to the right column's
   wrapping `Box` (`:1045`).
4. Add `sx={{ display: { xs: 'none', md: 'block' } }}` to the existing
   Description `Paper` (`:787`).
5. Insert a new `Paper` immediately before the Description `Paper`, with
   `sx={{ display: { xs: 'block', md: 'none' }, p: 2.5, mb: 3 }}`, containing:
   - **Implementation refinement over the original plan:** rather than
     duplicating the Description heading/edit-icon/body/inline-edit-form JSX
     inline in both places, extract it into a `WorkOrderDescriptionSection`
     sub-component (mirroring `WorkOrderDetailsFields`) taking `workOrder`,
     `canEdit`, `isEditing`, `onEditStart`, `onSave`, `onCancel` as props.
     Both the mobile combined card and the desktop Description card render
     `<WorkOrderDescriptionSection ... />`, sharing the same
     `isEditingDescription` state and `updateDescription` mutation from the
     parent. This removes the JSX-drift risk noted below entirely instead of
     just mitigating it.
   - A `Divider` (`sx={{ my: 2 }}`).
   - A "Details" `Typography` heading (`variant="subtitle1" fontWeight={600}`)
     matching the desktop Details card's heading style.
   - `<WorkOrderDetailsFields workOrder={workOrder} />`.
6. No changes to Comments & Activity `Paper` — it stays where it is in DOM
   order (immediately after Description), so on mobile it now visually
   follows the new combined card.

## Dependencies

None — no new packages. Uses only components already imported in this file
(`Paper`, `Divider`, `Typography`, `Box`, `IconButton`, `EditIcon`).

## Configuration Changes

None (no env vars, no Prisma schema, no MSAL/Graph scopes).

## Risks & Mitigations

- **Risk:** Duplicating the Description JSX (mobile card + desktop card)
  could drift out of sync over time.
  **Mitigation:** Both blocks share the exact same state
  (`isEditingDescription`, `canEditDescription`) and mutation
  (`updateDescription`), so behavior cannot diverge even if the two blocks
  render independently; only one is ever visible at a given breakpoint per
  the `display` toggle, so there is no risk of duplicate mutations firing.
- **Risk:** Two copies of the Description `Paper` both mounted in the DOM
  (one hidden via `display: none`) means `isEditingDescription` state is
  shared — if a user starts editing on one breakpoint and resizes the window,
  the edit form would reflect in both (only one visible at a time, so no
  visible inconsistency; this matches how the rest of the app already
  static-renders both mobile/desktop variants of other components, e.g.
  `AuditItemRow.tsx`).
- **Risk:** `WorkOrderDetailsFields` extraction accidentally changes desktop
  rendering.
  **Mitigation:** The extraction step is a pure copy — field list JSX is
  moved verbatim into the new sub-component with no logic changes; Phase 3
  review will diff against original markup to confirm no changes leaked in.

## Build/Test Commands Approved for Phase 3

- `docker compose -f docker-compose.dev.yml build frontend` (frontend `tsc` +
  `vite build` — this is a UI-only change confined to the frontend workspace,
  no backend or shared changes, so only the frontend image build is required)
- `scripts/preflight.ps1` for Phase 6 (runs both backend and frontend builds)

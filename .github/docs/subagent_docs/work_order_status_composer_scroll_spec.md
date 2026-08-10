# Work Order Status Composer — Scroll to Dropdown on Mobile

## Current State Analysis

`frontend/src/pages/WorkOrderDetailPage.tsx` renders an inline action
composer below the comment feed. Clicking the **Update Status** button
(`toggleAction('status')`, [WorkOrderDetailPage.tsx:889-897](../../../frontend/src/pages/WorkOrderDetailPage.tsx#L889-L897))
sets `activeAction` to `'status'`, which reveals a `New Status` `<Select>`
field ([WorkOrderDetailPage.tsx:932-969](../../../frontend/src/pages/WorkOrderDetailPage.tsx#L932-L969))
directly below the action button row.

On narrow (mobile) viewports the button row sits near the bottom of the
visible viewport, so the newly-revealed `Select` renders off-screen and
the user has to manually scroll down before they can open it.

No `useMediaQuery`/breakpoint logic exists in this file today, and none
is required for the fix.

## Problem Definition

After tapping **Update Status** on mobile, the "New Status" dropdown is
not visible without a manual scroll, adding friction to a common action.

## Proposed Solution

Attach a `ref` to the status field's wrapper `Box` and, when
`activeAction` becomes `'status'`, call
`element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` in a
`useEffect` keyed on `activeAction`.

- `block: 'nearest'` scrolls the minimum distance needed to bring the
  element fully into the viewport — a no-op on desktop where it's
  already visible, and "ever so slightly" on mobile where it isn't. This
  avoids needing an explicit mobile/breakpoint check.
- `behavior: 'smooth'` matches the "ease into view" feel requested
  rather than an abrupt jump.
- Scoped to the status field only, per the request (Update Status on
  work orders) — the priority/assign/request-input fields are
  unchanged.

No new dependencies; `scrollIntoView` is a standard DOM API already
usable in this React 19 + browser environment.

## Implementation Steps

1. Import `useRef` in `WorkOrderDetailPage.tsx` (add to existing
   `useEffect, useState` import from `react`).
2. Add `const statusFieldRef = useRef<HTMLDivElement>(null);` near the
   other composer state.
3. Attach `ref={statusFieldRef}` to the `Box` at
   [WorkOrderDetailPage.tsx:933](../../../frontend/src/pages/WorkOrderDetailPage.tsx#L933)
   (the `activeAction === 'status'` block).
4. Add a `useEffect` that scrolls the ref into view when
   `activeAction === 'status'`.

## Dependencies

None — standard `useRef`/`useEffect` (React 19, already in use) and the
native `Element.scrollIntoView` DOM API. No new package, no version
check required per the Dependency Policy's "internal code change, no
new dependency" exemption.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Effect fires and scrolls even on desktop where it's
  unnecessary. **Mitigation:** `block: 'nearest'` is a no-op when the
  element is already fully in view.
- **Risk:** Ref not yet attached when effect runs. **Mitigation:** React
  commits DOM mutations before running effects, so the conditionally
  rendered `Box` exists by the time the effect fires.
- **Risk:** Scroll fires unexpectedly when toggling the action back off.
  **Mitigation:** Effect only acts when `activeAction === 'status'`; no
  scroll happens on deselect.

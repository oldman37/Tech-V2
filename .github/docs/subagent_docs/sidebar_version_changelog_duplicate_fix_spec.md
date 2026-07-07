# Sidebar Version Changelog Tooltip — Duplicate Popup Fix Spec

## Current State Analysis

- `sidebarContent` ([AppLayout.tsx:156](frontend/src/components/layout/AppLayout.tsx#L156))
  is a single JSX expression, evaluated once per render, and inserted at two separate
  locations in the tree:
  - The desktop sidebar: `<nav className="shell-sidebar shell-sidebar--desktop">{sidebarContent}</nav>`
    (line ~277)
  - The mobile `Drawer`: `<nav className="shell-sidebar shell-sidebar--mobile">{sidebarContent}</nav>`
    (line ~296), and the `Drawer` uses `ModalProps={{ keepMounted: true }}`, so this second
    copy stays mounted in the DOM even when the drawer is closed on desktop.
- Both copies contain their own `Tooltip`/`ClickAwayListener`/footer `div`, but both read
  the **same** `changelogOpen` state variable and the same `setChangelogOpen` setter (added
  in the prior mobile-tap fix). Since React creates two independent component instances from
  one JSX value used twice, there are two separate `Tooltip` elements in the DOM, both driven
  by the one shared boolean.
- Result (reported by user): clicking the visible desktop footer sets `changelogOpen` to
  `true`, which opens **both** Tooltips simultaneously — the desktop one anchored correctly
  at the sidebar footer (bottom), and the mobile Drawer's copy (kept-mounted but visually
  hidden/off-canvas on desktop) rendering its popper anchored to wherever its own hidden
  trigger `div` resolves in the layout — observed near the top of the page.

## Problem Definition

The desktop and mobile renders of the sidebar footer are two distinct DOM elements but were
wired to one shared piece of `open` state, so opening one opens both.

## Proposed Solution

Give each render location its own independent `open` state:

1. Replace the single `changelogOpen`/`setChangelogOpen` state with two separate pairs:
   `desktopChangelogOpen`/`setDesktopChangelogOpen` and
   `mobileChangelogOpen`/`setMobileChangelogOpen`.
2. Convert `sidebarContent` from a plain JSX variable into a small function,
   `renderSidebarContent(changelogOpen: boolean, setChangelogOpen: Dispatch<SetStateAction<boolean>>)`,
   returning the exact same JSX as today — the nav-section rendering logic is untouched, and
   the footer/Tooltip block continues to reference `changelogOpen`/`setChangelogOpen` exactly
   as it does now, just as function parameters instead of closed-over component state.
3. Update the two call sites to pass the appropriate state pair:
   - Desktop: `renderSidebarContent(desktopChangelogOpen, setDesktopChangelogOpen)`
   - Mobile Drawer: `renderSidebarContent(mobileChangelogOpen, setMobileChangelogOpen)`

This is a minimal, surgical change — no behavior change to nav rendering, hover/tap
semantics, or styling; it only decouples the two physical tooltip instances so they open and
close independently, matching the fact that only one of them is ever visible to the user at
a time.

## Implementation Steps

1. `AppLayout.tsx`: add `Dispatch, SetStateAction` to the existing `react` import.
2. Replace `const [changelogOpen, setChangelogOpen] = useState(false);` with two `useState`
   pairs (desktop/mobile).
3. Wrap the existing `const sidebarContent = (...)` body in
   `const renderSidebarContent = (changelogOpen: boolean, setChangelogOpen: Dispatch<SetStateAction<boolean>>) => (...)`
   — no changes to the JSX body itself.
4. Update both call sites (`{sidebarContent}` → `{renderSidebarContent(...)}`) with the
   correct state pair per location.

## Dependencies

None new — `Dispatch`/`SetStateAction` are existing `react` type exports, and `useState` is
already imported.

## Risks and Mitigations

- **Risk:** None — this only isolates existing state; no new interactions introduced.

## Files to be Modified

- `frontend/src/components/layout/AppLayout.tsx`

# Sidebar Version Changelog Tooltip — Mobile Tap Support Spec

## Current State Analysis

- The version changelog tooltip added in `sidebar_version_changelog_spec.md` wraps the
  sidebar footer in a plain, uncontrolled MUI `Tooltip`
  ([AppLayout.tsx:228-242](frontend/src/components/layout/AppLayout.tsx#L228-L242)).
- `sidebarContent` (the JSX block containing this Tooltip) is a single expression reused for
  both the desktop sidebar (`shell-sidebar--desktop`, line 277) and the mobile `Drawer`
  (`shell-sidebar--mobile`, line 296) — one implementation serves both layouts.
- An uncontrolled MUI `Tooltip` only opens on mouse hover/keyboard focus, or, on touch
  devices, on a **long press** — per MUI v7 docs (verified against `v7.mui.com`), touch
  support is built in via `enterTouchDelay` (default `700`ms) and `leaveTouchDelay` (default
  `1500`ms), but there is no visible affordance telling a mobile user to long-press, and a
  long-press is easily confused with a tap/scroll gesture. This is why the user sees no
  visible way to reveal the changelog on mobile.

## Problem Definition

On mobile (the `Drawer` sidebar), there is no discoverable way to reveal the version
changelog — hover doesn't exist on touch, and the default long-press touch trigger isn't an
intuitive or discoverable interaction.

## Proposed Solution

Convert the `Tooltip` to MUI's documented **controlled tooltip** pattern (verified against
the current v7 API at `v7.mui.com/material-ui/api/tooltip/`), driven by a local `open` boolean
state, and wrap it in `ClickAwayListener` (`import { ClickAwayListener } from '@mui/material'`,
confirmed current import path) so a tap:
- **Opens** the tooltip immediately via the footer `div`'s `onClick` handler (works
  identically for mouse click and touch tap — no long-press needed).
- **Closes** on a second tap of the footer, or a tap/click anywhere else on the page, via
  `ClickAwayListener`'s `onClickAway`.

Hover/focus behavior for desktop users is preserved via the Tooltip's own `onOpen`/`onClose`
callbacks (fired on mouse enter/leave and focus/blur even in controlled mode). The built-in
long-press touch listener is disabled (`disableTouchListener`) since it's superseded by the
explicit tap handler — leaving it enabled would fight with the click-driven toggle (long
press would fire `onOpen` again after the tap already opened it, with no clean way to
resolve which "close" wins).

Because `sidebarContent` is shared between the desktop and mobile renders, this single change
covers both layouts. Only one of the two DOM copies is visible at a given viewport width, so
one shared `useState` boolean is sufficient — no risk of the two copies' tooltips
desynchronizing in a way a user could observe.

## Implementation Steps

1. In `AppLayout.tsx`:
   - Add `ClickAwayListener` to the existing `@mui/material` import (line 5).
   - Add `const [changelogOpen, setChangelogOpen] = useState(false);` near the other
     `useState` calls in the component.
   - Wrap the existing `Tooltip` in `ClickAwayListener onClickAway={() => setChangelogOpen(false)}`.
   - On `Tooltip`, add: `open={changelogOpen}`, `onOpen={() => setChangelogOpen(true)}`,
     `onClose={() => setChangelogOpen(false)}`, `disableTouchListener`.
   - On the footer `div`, add `onClick={() => setChangelogOpen((prev) => !prev)}`.
2. No CSS changes required — `.shell-sidebar-footer-changelog` styling added previously
   already covers the tooltip's list content regardless of trigger method.
3. No new dependency: `ClickAwayListener` ships as part of `@mui/material` (^7.3.8), already
   installed; only its import path was verified since it's a new-to-this-codebase symbol.

## Dependencies

- `@mui/material` `ClickAwayListener` — already installed, current v7 import path verified as
  `import { ClickAwayListener } from '@mui/material'`.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Sharing one `changelogOpen` state across the desktop and mobile copies of
  `sidebarContent` could theoretically leave the (hidden) desktop tooltip "open" in state
  while the mobile Drawer is what's visible, or vice versa.
  **Mitigation:** Not user-visible — the hidden copy has no box on screen for a tooltip to
  render against, and state resets to `false` on `ClickAwayListener`'s outside-click/tap,
  which fires on any navigation or drawer close.
- **Risk:** None to backend/auth/data — frontend-only interaction change, no new network
  calls.

## Files to be Modified

- `frontend/src/components/layout/AppLayout.tsx`

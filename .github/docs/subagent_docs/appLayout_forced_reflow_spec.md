# Spec: Reduce forced-reflow work on AppLayout's first mount (login flash)

## Current State Analysis

`AppLayout` (`frontend/src/components/layout/AppLayout.tsx`) renders the same
`renderSidebarContent()` output twice on every mount:

- Once for the always-visible desktop sidebar (`AppLayout.tsx:399-401`).
- Once inside the mobile `<Drawer variant="temporary" ... ModalProps={{
  keepMounted: true }}>` (`AppLayout.tsx:404-421`), which stays mounted in the
  DOM even while the drawer itself is closed.

`renderSidebarContent()` maps over `NAV_SECTIONS` (6 sections) and wraps each
section's items in an MUI `<Collapse>` (`AppLayout.tsx:283`). MUI's `Collapse`
measures the wrapped node's `scrollHeight` on mount to compute its transition
height — a synchronous layout read.

Because both the desktop sidebar and the (invisible, `keepMounted`) mobile
drawer sidebar render on the very first `AppLayout` mount, up to 12 `Collapse`
instances perform a layout measurement in the same tick — right when a large
new DOM subtree (header, both sidebars, drawer, and the routed page content)
is inserted for the first time. That first mount happens exactly when the app
transitions from the small `Login` page DOM to the full authenticated shell,
which is when the console's `[Violation] Forced reflow ... 41ms` warning and
the visible flash are reported.

## Problem Definition

The mobile drawer's sidebar content (and its `Collapse` measurements) is
rendered up front even though the drawer is closed and, for most sessions,
never opened on desktop-sized viewports at all. This front-loads layout work
onto the single most DOM-heavy render in the app (first authenticated mount)
for no benefit — nothing needs the mobile drawer's content to exist before the
user opens it once.

## Proposed Solution

Defer rendering the mobile drawer's `renderSidebarContent()` output until the
drawer has been opened at least once, using a ref that latches `true` the
first time `mobileOpen` becomes `true`. This:

- Roughly halves the `Collapse` measurement work (6 instead of 12 instances)
  on `AppLayout`'s first mount, reducing the forced-reflow cost right when the
  DOM is largest and the flash is most visible.
- Preserves the existing `ModalProps={{ keepMounted: true }}` behavior for
  every mobile-drawer open after the first — content stays mounted afterward
  exactly as it does today, so repeat-open smoothness / scroll position is
  unaffected.
- Is desktop-neutral — desktop users, who make up the bulk of "just logged
  in" first paints on this internal ops app, never render the mobile drawer's
  duplicate content at all if they never open the hamburger menu.

## Implementation Steps

1. `frontend/src/components/layout/AppLayout.tsx` — add a
   `hasOpenedMobileDrawer` ref that latches to `true` on first `mobileOpen`
   transition to `true`; guard the mobile `<Drawer>`'s
   `renderSidebarContent(...)` call on that ref so it renders `null` until the
   drawer has been opened once.

## Dependencies

None — internal code change only, no new packages, uses the existing MUI
`Drawer`/`Collapse` APIs already in use in this file.

## Risks and Mitigations

- **Risk:** Mobile drawer briefly shows nothing on the very first open
  (before content mounts). **Mitigation:** the latch flips synchronously in
  the same click handler that sets `mobileOpen` true (`setMobileOpen(true)`
  is only called from the hamburger `IconButton`'s `onClick`), so content
  renders in the same commit the drawer starts opening — no visible gap, and
  matches how `keepMounted` behaves for every open after the first anyway.
- **Risk:** Regressing badge counts / active-item highlighting inside the
  mobile drawer. **Mitigation:** `renderSidebarContent` itself is unchanged;
  only the timing of the mobile instance's first render moves.

## Verification

- Manual: log in, confirm dashboard renders without the console
  forced-reflow entry (or with a visibly smaller duration if the measurement
  isn't eliminated outright — some Collapse cost is inherent to the desktop
  sidebar and can't be removed without restructuring the nav to not use
  Collapse at all, which is out of scope here).
- Manual: open the mobile hamburger menu (narrow viewport) — nav content
  still appears immediately and is fully functional (navigation, badges,
  active highlight, changelog tooltip).
- Build: `docker compose -f docker-compose.dev.yml build frontend` must
  succeed.

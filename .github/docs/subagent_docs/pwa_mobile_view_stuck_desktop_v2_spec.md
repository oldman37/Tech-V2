# PWA: Mobile view stuck on desktop after pull-to-refresh (v2) — Spec

## Current State Analysis

`frontend/src/components/layout/AppLayout.tsx` (lines ~127-148) derives layout mode from a
JS-evaluated `isDesktop` boolean, sourced from `window.matchMedia('(min-width:769px)').matches`,
read synchronously on mount and re-validated on `matchMedia` `'change'`, `window` `'resize'`,
`'orientationchange'`, and a one-shot post-mount `requestAnimationFrame`. This value gates which
DOM is rendered at all: the permanent sidebar (`{isDesktop && <nav className="shell-sidebar">…}`),
the mobile `Drawer` (`{!isDesktop && <Drawer variant="temporary">…}`), and the hamburger button
(`{!isDesktop && <IconButton>…}`) are conditionally rendered based on this one JS value.

This is the third attempt at this symptom:
- `fc7530f` (2026-05-20): replaced MUI's async `useMediaQuery` (which defaults to `false` before
  first measurement) with a synchronous `useState` initializer, fixing a "flash to desktop then
  correct" visual glitch on refresh.
- `deb2257` (2026-07-02): added `resize`/`orientationchange` listeners and a one-shot
  `requestAnimationFrame` re-check, theorizing a one-time stale synchronous read on PWA reload
  with no compensating browser event to correct it.
- **User re-tested `deb2257` live** (force-closed and relaunched the installed PWA first, to rule
  out stale service-worker/deploy staleness — confirmed `./deploy.sh update` had already run) and
  the pull-to-refresh-still-shows-desktop symptom persisted. This falsifies the `deb2257` fix.

**Why `deb2257`'s fix could not have worked, by its own stated theory:** the fix's own commit
message argues "the true viewport never changes... only that first read was wrong" — but if
nothing about the real viewport changes, no `resize`/`orientationchange`/`matchMedia change` event
will ever fire to trigger a correction, and there is no guarantee that a single
`requestAnimationFrame` (one frame, ~16ms) is a long enough delay for whatever browser-internal
viewport/toolbar reconciliation is actually happening after an Android/Chrome native
pull-to-refresh reload of a standalone PWA. Chaining more delayed rechecks (a "v3 timing patch")
would still be guessing at an unknown, device-dependent settle time and risks a fourth failed
attempt at the same class of fix.

## Problem Definition

Any approach that computes `isDesktop` once in JS and uses it to decide **which DOM to render**
is vulnerable to this bug: if that one JS snapshot is wrong at the moment it's read (or the moment
its retry window elapses) with no future signal to correct it, the wrong layout renders for the
life of the page, until something else forces a fresh JS evaluation (e.g. full re-login navigation,
as previously observed).

## Proposed Solution

Eliminate the JS viewport snapshot as the thing that decides render structure. Switch
`AppLayout.tsx` to MUI's own documented "Responsive drawer" pattern
(https://mui.com/material-ui/react-drawer/#responsive-drawer — verified against the current
`ResponsiveDrawer.tsx` reference example, compatible with the installed MUI v7 `Drawer` API used
elsewhere in this file): render **both** the permanent sidebar and the temporary `Drawer`
unconditionally, and the hamburger button unconditionally, and let the browser's CSS engine (not
a cached JS read) decide which is visible via `sx` responsive `display` breakpoints. CSS media
queries are re-evaluated by the layout engine on every style recalculation against the live
viewport — there is no stale snapshot to go wrong after a reload, so this removes the entire bug
class rather than further narrowing a timing window.

Concretely:
1. Remove the `isDesktop` state, its `useEffect` (matchMedia + resize/orientationchange/rAF
   listeners), and the `useState`/`useEffect` imports it uniquely required.
2. Hamburger `IconButton`: render unconditionally; hide via `sx={{ display: { sm: 'none' } }}`
   (MUI's default theme `sm` breakpoint is 600px — see breakpoint note below).
3. Permanent sidebar `<nav className="shell-sidebar">`: render unconditionally; wrap visibility
   with `sx={{ display: { xs: 'none', sm: 'flex' } }}` (matches its existing `flex-direction:
   column` CSS, so `flex` not `block`).
4. Mobile `Drawer` (`variant="temporary"`): render unconditionally (already effectively always
   "mounted" via `ModalProps={{ keepMounted: true }}`); add `sx` `display: { xs: 'block', sm:
   'none' }` alongside its existing `sx` (merge into the existing `sx` object, do not add a
   second `sx` prop).
5. `handleNavClick`: currently guards `setMobileOpen(false)` behind `if (!isDesktop)`. Since
   `isDesktop` no longer exists, call `setMobileOpen(false)` unconditionally — it is a no-op if
   the drawer is already closed (desktop), so behavior is unchanged on desktop and identical to
   today on mobile.
6. `AppLayout.css`: the existing breakpoint comment/rule at line ~251-276
   (`@media (max-width: 768px) { .shell-sidebar--mobile { ... } }`) stays — it styles the mobile
   drawer's *contents*, not its visibility, and is unrelated to this fix. No change needed there.

### Breakpoint alignment (must verify before implementing)

The current code uses a custom `769px`/`768px` breakpoint pair (JS: `min-width:769px`; CSS:
`max-width:768px`), not MUI's default `sm` (600px) breakpoint. Switching to MUI's `sx` breakpoint
shorthand (`{ xs: ..., sm: ... }`) would silently change the breakpoint from ~768px to 600px unless
the project's MUI theme already overrides `sm` to `769`, or unless we use the raw CSS media-query
form instead of the breakpoint-token form.

**Implementation must use MUI's raw-value responsive syntax, not the `xs`/`sm` token shorthand**,
to preserve the exact existing 768/769px breakpoint and avoid a behavior change unrelated to this
bug:
```ts
sx={{ display: { xs: 'none', '@media (min-width:769px)': 'flex' } }}
```
Actually MUI's `sx` breakpoint object only accepts theme breakpoint keys or numeric px, not
arbitrary media queries as object keys in that shorthand — so instead use MUI's function form,
which does accept a raw media query:
```ts
sx={{ display: 'none', '@media (min-width:769px)': { display: 'flex' } }}
```
for the desktop sidebar, and the inverse (`display: 'flex'` default, hidden above 769px) for the
mobile-only elements (hamburger, temporary Drawer):
```ts
sx={{ display: { xs: 'flex' }, '@media (min-width:769px)': { display: 'none' } }}
```
This must be verified against the project's actual MUI `theme` (check for a `ThemeProvider` /
`createTheme` breakpoints override in `frontend/src/` before implementing) — if the project
already customizes `theme.breakpoints.values.sm` to `769`, the simpler `{ xs: ..., sm: ... }`
token form should be used instead for readability/consistency with MUI's documented pattern.

## Implementation Steps

1. Search `frontend/src/` for an MUI `createTheme`/`ThemeProvider` breakpoints override to
   determine which `sx` syntax (token-based vs. raw `@media`) to use.
2. Edit `frontend/src/components/layout/AppLayout.tsx`:
   - Remove `isDesktop` state + its effect; remove now-unused `useState`/`useEffect` imports only
     if nothing else in the file still needs them (both are still used elsewhere — `mobileOpen`,
     `openGroup` use `useState`; no other `useEffect` — remove only the `useEffect` import if truly
     unused after this change, otherwise keep).
   - Unconditionally render hamburger `IconButton`, permanent sidebar `<nav>`, and `Drawer`, each
     with the appropriate `sx` display breakpoint per the breakpoint-alignment note above.
   - Update `handleNavClick` to call `setMobileOpen(false)` unconditionally.
3. No CSS file changes anticipated (verify no other rule depends on `isDesktop`-driven DOM
   presence/absence, e.g. `:not(:has(...))` selectors — none currently exist per current
   `AppLayout.css` read).
4. No `shared/` or backend changes — frontend-only, no new dependency.

## Dependencies

None — uses MUI `Drawer`/`IconButton` `sx` prop, already in use in this exact file. No new package.
Verified against MUI v7's documented `react-drawer` responsive pattern (fetched from the current
`mui/material-ui` `ResponsiveDrawer.tsx` reference example on 2026-07-02); the `Drawer` `variant`
and `sx` responsive-display API used is unchanged from the pattern MUI has documented across
recent major versions.

## Risks and Mitigations

- **Risk:** Both the permanent sidebar and temporary Drawer are now always mounted, doubling the
  `sidebarContent` render (nav items, `Collapse` state, etc.) versus the previous conditional
  render.
  **Mitigation:** This is the same cost MUI's own official pattern accepts; `sidebarContent` is
  static per-render JSX (no expensive computation), and this is what `ModalProps={{ keepMounted:
  true }}` was already doing for the Drawer's copy — this fix does not change total DOM node count
  in the "settled" state, only removes the JS gate on *which* copies exist.
- **Risk:** Breakpoint mismatch if raw `@media` `sx` syntax is used incorrectly (e.g. specificity
  conflicts between the two `sx`-generated style rules).
  **Mitigation:** Verify rendered breakpoint behavior at both <768px and >769px in the frontend
  Docker build's dev server (or via browser devtools responsive mode) before declaring done, per
  the Standard Workflow's "start the dev server and test in a browser" guidance for UI changes —
  full physical-device pull-to-refresh verification still cannot be done in this environment and
  must be flagged to the user as a required manual step post-deploy.
- **Risk:** `handleNavClick`'s unconditional `setMobileOpen(false)` could theoretically cause an
  extra no-op re-render on desktop nav clicks.
  **Mitigation:** Same `Object.is` bail-out as before (`false` → `false` is a no-op); negligible.

## Verification

- `docker compose -f docker-compose.dev.yml build frontend` — confirms `tsc` + `vite build` succeed.
- `.\scripts\preflight.ps1` — full gate.
- Manual: resize browser window / devtools responsive mode across 768px/769px to confirm sidebar,
  hamburger, and drawer swap correctly with **no JS execution required** (open devtools, confirm
  layout is correct even with JS breakpoints unrelated to a reload — this is the point of the fix:
  it is reload-order-independent by construction). Real-device pull-to-refresh re-test after
  deploy remains the authoritative confirmation and should be flagged to the user.

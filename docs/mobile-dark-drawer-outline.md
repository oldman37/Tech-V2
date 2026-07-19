# Fix: Gray outline on mobile nav drawer in dark mode

## Bug

On mobile, dark mode only, the slide-out nav menu (hamburger → drawer) renders
with a visible gray outline/border framing the whole menu box. Desktop
sidebar and mobile light mode are unaffected.

## Root cause

`AppLayout.tsx` renders the mobile nav inside a MUI `<Drawer variant="temporary">`.
The `Drawer`'s `sx` prop only sets `width`/`top`/`height` on `.MuiDrawer-paper`
— it never sets a `background-color` or `boxShadow`. The actual visible
content is a child `<nav className="shell-sidebar shell-sidebar--mobile">`
that sets its own background explicitly (`#fff` light, `var(--slate-100,
#1e293b)` dark).

In light mode this coincidence hides the bug: MUI's default light
`Paper` background (`#fff`) matches the nav's own light background exactly,
and the default box-shadow is faint against the light-mode Modal scrim.

In dark mode there's no such coincidence: the Drawer's own unstyled `Paper`
falls back to MUI's default dark `background.paper` (`#121212`) plus its
elevation overlay/box-shadow, both visibly different from the nav's actual
`#1e293b` fill. The mismatched edge reads as a gray outline around the menu.

The desktop sidebar has no `Paper` wrapper at all (it's a plain `<nav>`
styled directly), which is why it never shows this artifact — it's the
consistency target.

## Fix

File: `frontend/src/components/layout/AppLayout.css`

Added one dark-mode-scoped rule directly after the existing
`:root.dark .shell-sidebar--mobile` rule, matching that rule's own pattern:

```diff
 :root.dark .shell-sidebar--mobile {
   background: var(--slate-100, #1e293b);
 }
+
+:root.dark .shell-drawer--mobile .MuiDrawer-paper {
+  background-color: var(--slate-100, #1e293b);
+  background-image: none;
+  box-shadow: none;
+}
```

- `background-color` matches the Paper's fill to the nav's own fill.
- `background-image: none` cancels MUI's dark-mode elevation overlay gradient.
- `box-shadow: none` cancels MUI's default elevation shadow — the main
  visible artifact.

No TSX change needed — `.shell-drawer--mobile` is already applied to the
`Drawer` component (`AppLayout.tsx`, on the `Drawer` that wraps the mobile
nav).

**Scope / blast radius:** the selector `.shell-drawer--mobile .MuiDrawer-paper`
only matches this one `Drawer` instance in the app. It does not touch the
global `.MuiPaper-root` rule already in `global.css` (mobile Paper padding
only), light mode (rule is `:root.dark`-scoped), or the desktop sidebar (no
`Drawer`/`Paper` there).

## Verification performed

- `docker compose -f docker-compose.dev.yml build frontend` — pass (`tsc && vite build`)
- `docker compose -f docker-compose.dev.yml build backend` — pass (unaffected, cached)
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` — pass (38/38 tests, unaffected)

---

## Prompt to recreate this fix on upstream

Give an agent working in the upstream repo (no access to this conversation)
the prompt below verbatim:

```
In this repo's frontend, the mobile nav drawer (hamburger menu → slide-out
panel) shows a visible gray outline/border framing the whole menu box, but
only on mobile AND only in dark mode. Desktop sidebar and mobile light mode
look correct.

Root cause: the mobile nav is rendered inside a MUI <Drawer variant="temporary">
(look for the AppLayout/shell component that renders the hamburger drawer —
likely something like AppLayout.tsx). The Drawer's own MUI Paper surface
(.MuiDrawer-paper) is never given a dark-mode background or box-shadow
override, so it falls back to MUI's default dark Paper styling (a dark
background plus an elevation overlay/box-shadow). The actual nav content
inside it is a separate element that DOES set its own correct dark-mode
background (e.g. a class like .shell-sidebar--mobile, overridden under a
:root.dark or data-theme dark selector). Because the Paper's own background/
shadow doesn't match the nav content's background, the mismatched edge shows
as a gray outline. It's invisible in light mode because MUI's default light
Paper background (white) happens to match the nav's own white background.

Find:
1. The stylesheet with the existing dark-mode override for the mobile nav
   background (e.g. `:root.dark .shell-sidebar--mobile { background: ... }`
   or equivalent).
2. The className (or equivalent selector) applied to the Drawer component
   itself (e.g. `shell-drawer--mobile`), so you can scope a fix to only this
   one Drawer instance.

Fix: add one CSS rule, scoped to dark mode AND to this specific Drawer only
(do not touch the global .MuiPaper-root/.MuiDrawer-paper, which would affect
every Paper/Drawer in the app), that:
- sets the Drawer's Paper background-color to match the nav content's own
  dark-mode background value exactly,
- sets background-image: none (cancels MUI's dark elevation overlay),
- sets box-shadow: none (cancels MUI's default elevation shadow — this is
  the main visible artifact).

Example (adapt selector names/values to what you actually find in the repo):

  :root.dark .shell-drawer--mobile .MuiDrawer-paper {
    background-color: var(--slate-100, #1e293b);
    background-image: none;
    box-shadow: none;
  }

Place it near the existing dark-mode override for the mobile nav background,
following that file's existing pattern rather than introducing a new one.
Do not modify light mode, the desktop sidebar, or any other Paper/Drawer in
the app. Verify with a frontend build (tsc + production bundler build) and,
if this repo has one, an image/container build — do not run any destructive
or database-mutating command to verify a CSS-only change.
```

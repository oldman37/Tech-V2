# Dark Mode — Phase 1 Spec

## Current State Analysis

- **No MUI theme customization exists anywhere in the app.** There is no `createTheme`, no `ThemeProvider`, no `CssBaseline` in [main.tsx](../../../frontend/src/main.tsx) or [App.tsx](../../../frontend/src/App.tsx). MUI components render with the library's untouched default light theme.
- The actual visual design system is hand-rolled CSS, imported globally:
  - [frontend/src/styles/global.css](../../../frontend/src/styles/global.css) — defines `--slate-50..900`, `--primary-blue*`, `--emerald-100/800`, `--red-100/800` custom properties on `:root`, and the `.card`, `.table`, `.btn-*`, `.badge-*`, `.mobile-card`, `.mobile-filter-bar`, `.form-input`, `.feature-icon.*` (gradient) classes used across most pages.
  - [frontend/src/components/layout/AppLayout.css](../../../frontend/src/components/layout/AppLayout.css) — app shell: header gradient, sidebar (`#ffffff` background), `.nav-item*` states, all with hardcoded hex/`--slate-*` values.
  - [frontend/src/pages/Login.css](../../../frontend/src/pages/Login.css) — hardcoded hex colors (`#333`, `#666`, `white`, gradients), not on the shared `--slate-*` token set at all.
  - [frontend/src/App.css](../../../frontend/src/App.css) — leftover Vite template boilerplate (`.card`, `.features`, `.app-header`). Not referenced by any current JSX; class names collide with `global.css`'s real `.card`. Flagged as pre-existing dead code — out of scope, not to be touched.
  - [frontend/src/components/transportation/FuelLevelBar.tsx](../../../frontend/src/components/transportation/FuelLevelBar.tsx) — one example of a component with hardcoded status colors in `sx`/`styled` (`#2e7d32`, `#c62828`, `#f57f17`, `#e0e0e0`). There are likely other similar one-off `sx` hardcodes scattered in components; Phase 2 will need to grep for `#`-hex literals in `sx=` props during implementation, not just the CSS files listed above.
- PWA chrome color is static: [vite.config.ts](../../../frontend/vite.config.ts) manifest `theme_color: '#1e40af'`, `background_color: '#f8fafc'`, and [index.html](../../../frontend/index.html) has a single `<meta name="theme-color" content="#1e40af">` (no `prefers-color-scheme` media variant).
- Installed stack (from [frontend/package.json](../../../frontend/package.json)): `@mui/material` `^7.3.8`, `@mui/icons-material` `^7.3.8`, `@mui/lab` `^7.0.1-beta.22`, `@mui/x-charts` `^9.9.0`, `@mui/x-data-grid` `^8.27.1`, `@emotion/react`/`styled` `^11.14.x`, `zustand` `^5.0.10`. No `next-themes` or similar equivalent installed (not needed — this is a Vite SPA, not Next.js).

## Problem Definition

The app has no dark mode. Because styling is split between (a) MUI's own components, which are theme-driven, and (b) a large body of hand-rolled CSS with literal hex/`white` values, a correct implementation must address both halves — wiring MUI's theme is the easy 20%; making the legacy CSS respond to a mode switch is the remaining 80%.

## Proposed Solution Architecture

Use **MUI v7's native `colorSchemes` + CSS-variables API** (the current recommended approach, not the legacy `palette.mode` pattern) as the single source of truth for mode state, and drive the legacy CSS off the same DOM signal.

1. **Theme setup** — new file `frontend/src/theme/theme.ts`:
   ```ts
   import { createTheme } from '@mui/material/styles';

   export const theme = createTheme({
     cssVariables: {
       colorSchemeSelector: 'class', // adds .light / .dark to <html>
     },
     colorSchemes: {
       light: { palette: { primary: { main: '#3b82f6', dark: '#2563eb' } } },
       dark: true, // MUI-generated dark palette to start; refine later if needed
     },
   });
   ```
   `colorSchemeSelector: 'class'` is the key integration point: MUI toggles a `.light`/`.dark` class on `<html>`, which is the same selector the legacy CSS will key off (see step 3).

2. **Wire the provider** in [main.tsx](../../../frontend/src/main.tsx):
   ```tsx
   <ThemeProvider theme={theme} defaultMode="system">
     <InitColorSchemeScript attribute="class" />
     <CssBaseline enableColorScheme />
     ...
   </ThemeProvider>
   ```
   `InitColorSchemeScript` prevents a flash of the wrong theme on load by setting the class before React hydrates. `defaultMode="system"` respects OS preference on first visit; MUI persists the user's explicit choice to `localStorage` automatically once they toggle (no new Zustand store needed — this is the simplest correct option and avoids a second source of truth).

3. **Make the legacy CSS variables theme-aware** in [global.css](../../../frontend/src/styles/global.css): keep every existing `--slate-*`/`--primary-blue*`/etc. declaration under `:root` as the light values (unchanged), and add a `:root.dark { ... }` block that overrides the same custom-property names with dark equivalents. Because `.card`, `.table`, `.btn-*`, `.badge-*`, `.mobile-card`, `.form-input`, etc. already consume these variables (not literals) in most places, this block alone repaints most of the legacy design system. Remaining **hardcoded literals** (not variables) need direct `:root.dark` overrides too:
   - `global.css`: `.card { background: white }`, `.mobile-card { background: white }`, `.form-input { background-color: white }`, `.mobile-filter-bar__input { background-color: white }`, `.page-wrapper` gradient's `#c3cfe2` stop.
   - `AppLayout.css`: `.shell-header` gradient (`#ffffff`, `#e0e7ff`), `.shell-sidebar { background: #ffffff }`, `.shell-sidebar--mobile { background: #fff }`, `.nav-section-title`/`.nav-section-header`/`.nav-section-expand-icon` (`color: #000`), `.nav-item--active` gradient.
   - `Login.css`: entirely off the `--slate-*` token set — needs its own `:root.dark` overrides for `.login-card` (white), header text colors (`#333`/`#666`), `.error-message` colors, `.microsoft-login-button` colors, `.login-footer` colors. (Login page is pre-auth; still worth covering for consistency, but lowest priority — confirm with user whether login screen should follow system/theme preference in Phase 2 if scope needs trimming.)
   - `FuelLevelBar.tsx` and any other component found via the hex-literal grep: replace literal colors with `theme.palette.*` references or wrap with `theme.applyStyles('dark', {...})` (the v7-recommended pattern for SSR/CSS-var-safe conditional styling) so status colors (red/amber/green) keep adequate contrast in dark mode.

4. **Toggle UI** — add an icon button (sun/moon, from `@mui/icons-material`) in [AppLayout.tsx](../../../frontend/src/components/layout/AppLayout.tsx) header area, using `useColorScheme()`:
   ```tsx
   const { mode, setMode } = useColorScheme();
   ```
   Note the v7 hook contract: `mode` is `undefined` on first render — guard the icon render (e.g. render nothing / a placeholder) until it resolves, per MUI's documented gotcha, to avoid a hydration/flash mismatch.

5. **MUI-driven components** (`@mui/x-data-grid`, `@mui/x-charts`, dialogs, menus, chips) require no extra work — they read from the active theme automatically once `ThemeProvider` + `colorSchemes` are in place.

6. **PWA/browser-chrome polish (optional, low priority)** — add a second `<meta name="theme-color">` tag with `media="(prefers-color-scheme: dark)"` in `index.html` for a dark-appropriate browser chrome tint. The manifest `theme_color`/`background_color` in `vite.config.ts` is static (single value, no media-query concept in the Web App Manifest spec) — leave as-is unless the user wants a build-time manifest split, which is unnecessary complexity for this app's use case.

## Implementation Steps (for Phase 2)

1. Add `frontend/src/theme/theme.ts` with `colorSchemes` config.
2. Update `main.tsx`: wrap in `ThemeProvider` + `InitColorSchemeScript` + `CssBaseline`.
3. Add `:root.dark { ... }` variable-override block to `global.css`, plus literal-color overrides for `.card`, `.mobile-card`, `.form-input`, `.mobile-filter-bar__input`, `.page-wrapper`.
4. Add `:root.dark` overrides to `AppLayout.css` (header gradient, sidebar, nav states) and `Login.css` (card, text, button, error message).
5. Grep `frontend/src` for hex-literal colors inside `sx=` / `styled(...)` usages beyond `FuelLevelBar.tsx`; convert the ones that are pure decoration (not semantic status colors already covered by MUI palette) to theme-aware equivalents.
6. Add the mode-toggle `IconButton` to `AppLayout.tsx`, using `useColorScheme()` with the `mode === undefined` guard.
7. (Optional) Add a `prefers-color-scheme: dark` `theme-color` meta tag to `index.html`.

## Dependencies

No new packages required — `@mui/material` `^7.3.8` (installed) already ships `colorSchemes`, `useColorScheme`, `InitColorSchemeScript`, and `theme.applyStyles`, verified against the official v7 docs:
- [Dark mode — Material UI](https://mui.com/material-ui/customization/dark-mode/)
- [CSS theme variables: Configuration — Material UI](https://mui.com/material-ui/customization/css-theme-variables/configuration/)
- [Upgrade to v7 — Material UI](https://mui.com/material-ui/migration/upgrade-to-v7/)

Confirmed v7-specific behavior: when `cssVariables` is enabled with both `light`/`dark` schemes, the `theme` object itself no longer changes on toggle (only `mode` from `useColorScheme()` changes) — this is a deliberate performance optimization. Implication: any existing (or new) code doing `theme.palette.mode === 'dark' ? a : b` conditionals will NOT re-render on toggle and must be rewritten as `theme.applyStyles('dark', {...})` or CSS-variable-based styling instead.

## Configuration Changes

- None to env vars, Prisma schema, or MSAL/Graph scopes — this is a frontend-only, client-side visual feature with no backend surface.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Missed hardcoded-color spots leave "light patches" in dark mode (poor contrast, invisible text) | Systematic grep for hex literals in `sx=`/`styled(...)`/`.css` during Phase 2 implementation, not just the files identified here; manual visual pass over each major page in Phase 3 review. |
| `useColorScheme()`'s `mode === undefined` on first render causes a toggle-icon flash/mismatch | Explicit guard in the toggle component per MUI's documented pattern. |
| Conditional `theme.palette.mode === 'dark'` checks elsewhere in the codebase silently stop working under v7's CSS-variables optimization | Grep for `palette.mode` usage during Phase 2; none found in current codebase (confirmed via search — no `ThemeProvider`/`createTheme` exists yet), so this is a forward-looking risk only, not a present one. |
| Legacy `.card`/`.mobile-card`/form-input classes visually clash with MUI's dark `Paper`/`Dialog` surfaces if variable values aren't chosen to match MUI's dark palette tones | Base the `:root.dark` slate values on MUI's default dark palette surface colors (`#121212`-family) rather than inventing an unrelated dark palette, so legacy and MUI surfaces read as one consistent system. |
| Scope creep into a full CSS-to-MUI rewrite | Explicitly out of scope per this spec (see architecture section) — legacy CSS is retained, only its color values become theme-aware. |
| Login page pre-auth dark mode adds scope without clear user value | Included in implementation steps but called out as lowest priority / negotiable in Phase 2 if time-boxing is needed. |

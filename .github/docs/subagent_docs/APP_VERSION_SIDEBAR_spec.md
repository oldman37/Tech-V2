# Display App Version in Sidebar + Bump to 1.1.0

## Current State Analysis

- All four workspace `package.json` files (`c:\Tech-V2\package.json`, `backend/package.json`,
  `frontend/package.json`, `shared/package.json`) are currently at `"1.0.0"` in lockstep —
  no independent versioning scheme exists in this repo.
- The app version is not surfaced anywhere in the UI today (confirmed via grep — no
  `APP_VERSION`, no `import.meta.env.PACKAGE_VERSION` usage in `frontend/src`).
- The sidebar lives in `frontend/src/components/layout/AppLayout.tsx`. It renders a
  shared `sidebarContent` fragment (built at lines 166-240, containing only the mapped
  `NAV_SECTIONS`) inside two wrappers: a desktop `<nav className="shell-sidebar">`
  (lines 274-278) and a mobile MUI `<Drawer>` containing `<nav className="shell-sidebar
  shell-sidebar--mobile">` (lines 281-299). Both wrappers render the exact same
  `sidebarContent` variable, so any addition to that fragment appears in both desktop
  and mobile automatically.
- `.shell-sidebar` (frontend/src/components/layout/AppLayout.css:85-94) is currently a
  plain block with `overflow-y: auto` and padding — not a flex container, so there's no
  existing mechanism to pin something to the bottom.
- `frontend/vite.config.ts` has no `define` block; `frontend/src/vite-env.d.ts` only
  declares `ImportMetaEnv`/`ImportMeta` for `VITE_API_URL` — no global build-time
  constant exists yet.
- `frontend/tsconfig.json` already has `"resolveJsonModule": true`, so `frontend/package.json`
  can be imported directly as a JSON module in `vite.config.ts` without new config.

## Problem Definition

1. Bump the app version from 1.0.0 to 1.1.0 across the monorepo (kept in lockstep, per
   existing convention).
2. Display the current app version somewhere in the sidebar, sourced from
   `frontend/package.json` at build time (not hand-duplicated as a string in the
   component).

## Proposed Solution

- **Version bump:** Update `"version": "1.0.0"` → `"version": "1.1.0"` in all four
  `package.json` files (root, `backend`, `frontend`, `shared`). No other version
  references exist elsewhere in the repo (confirmed by the Phase 1 grep above).
- **Expose version to the frontend bundle:** Add a Vite `define` in
  `frontend/vite.config.ts` that reads `frontend/package.json`'s `version` field and
  injects it as a compile-time global `__APP_VERSION__`, following Vite's documented
  `define` pattern (replaces the identifier with the literal value at build time —
  same mechanism Vite's own docs use for exposing package metadata; no new dependency
  needed since `resolveJsonModule` already permits importing the JSON directly).
- **Type declaration:** Add `declare const __APP_VERSION__: string;` to
  `frontend/src/vite-env.d.ts` so TypeScript recognizes the global without `any`.
- **Sidebar UI:** Add a small footer line to the shared `sidebarContent` fragment in
  `AppLayout.tsx` (end of the fragment, after the `NAV_SECTIONS.map(...)` block, still
  inside the `<>...</>`), rendering `v{__APP_VERSION__}`. Because both the desktop and
  mobile nav wrappers render the same `sidebarContent` variable, this shows the version
  in both without duplicating markup.
- **CSS:** Change `.shell-sidebar` to `display: flex; flex-direction: column;` (minimal
  addition, does not change existing width/padding/scroll behavior) and add a new
  `.shell-sidebar-footer` rule: `margin-top: auto` (pins it to the bottom of the
  sidebar), small muted font size, top border, centered text — consistent with the
  existing muted/slate color tokens already used in this stylesheet
  (`var(--slate-200, #e2e8f0)` border color, similar to the existing border-right on
  `.shell-sidebar`).

## Implementation Steps

1. Bump version in: `package.json`, `backend/package.json`, `frontend/package.json`,
   `shared/package.json` → `"1.1.0"`.
2. `frontend/vite.config.ts`: import `pkg` from `./package.json` and add
   `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` to the `defineConfig`
   object.
3. `frontend/src/vite-env.d.ts`: add `declare const __APP_VERSION__: string;`.
4. `frontend/src/components/layout/AppLayout.tsx`: add
   `<div className="shell-sidebar-footer">v{__APP_VERSION__}</div>` at the end of the
   `sidebarContent` fragment (inside the `<>...</>`, after the `.map()` call closes).
5. `frontend/src/components/layout/AppLayout.css`: update `.shell-sidebar` to add
   `display: flex; flex-direction: column;`; add a new `.shell-sidebar-footer` rule.

## Dependencies

None new. Uses Vite's built-in `define` config option (already the mechanism this
project's `vite.config.ts` uses for other config) and TypeScript's existing
`resolveJsonModule` support — no library added, no version-sensitive API introduced.

## Configuration Changes

None (no env vars, no schema, no Graph scopes). The version is injected purely at
frontend build time.

## Risks and Mitigations

- **Risk:** `.shell-sidebar--mobile` (used inside the MUI Drawer) also needs its own
  footer to sit correctly — but since it wraps the same `sidebarContent`, no extra
  markup is needed; only need to confirm the mobile CSS variant
  (`AppLayout.css` ~line 242-250) doesn't override `display`/`flex-direction` in a way
  that breaks the footer's `margin-top: auto`. Mitigation: verify visually after build;
  the existing `.shell-sidebar--mobile` rule only sets `display: block`, so it will be
  overridden intentionally to `flex` for both variants via the shared `.shell-sidebar`
  base rule (mobile variant no longer needs its own explicit `display`).
- **Risk:** Root/backend/shared `package.json` version bumps have no functional
  dependents (nothing reads them programmatically today, per Phase 1 grep), so this is
  a safe, isolated string change.
- **Risk:** none to auth/CSRF/data — purely a display + metadata change.

## Verification

- `docker compose -f docker-compose.dev.yml build backend` and `... build frontend` —
  both compile successfully.
- Manually load the app and confirm "v1.1.0" appears at the bottom of the sidebar on
  both desktop and mobile (resize/drawer) layouts.

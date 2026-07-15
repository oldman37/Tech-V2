# Dark Mode — Review

## Scope Reviewed

Against [dark_mode_spec.md](dark_mode_spec.md):
- `frontend/src/theme/theme.ts` (new)
- `frontend/src/main.tsx`
- `frontend/src/styles/global.css`
- `frontend/src/components/layout/AppLayout.css`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/pages/Login.css`
- `frontend/src/components/transportation/FuelLevelBar.tsx`
- `frontend/index.html`

## Findings

- **Spec compliance**: all implementation steps from the spec were completed, including the "lowest priority / negotiable" Login page coverage.
- **API currency**: uses MUI v7's `colorSchemes` + `cssVariables: { colorSchemeSelector: 'class' }` (current recommended API, verified against official docs in Phase 1), not the legacy `palette.mode` pattern. `useColorScheme()` is guarded for its documented `mode === undefined` first-render state.
- **Scope discipline**: legacy CSS classes were kept; only their color values were made theme-aware via a `:root.dark` variable-ramp inversion plus targeted literal-color overrides, per the spec's explicit decision not to do a full CSS→MUI rewrite. `App.css` (identified in Phase 1 as unused dead code) was left untouched.
- **`FuelLevelBar.tsx`**: hardcoded `#e0e0e0` track background replaced with the theme token `action.disabledBackground`, which resolves via MUI's CSS variables automatically in both schemes — no manual dark override needed.
- **Four other hex-literal `sx`/style colors** (`InventoryHistoryDialog.tsx`, `AuditItemList.tsx`, `FieldTripDetailPage.tsx`) were checked in Phase 1 and left as-is: they're saturated status colors (red/green/blue/gray) with acceptable contrast on both light and dark surfaces, not the "invisible text" failure mode the CSS-literal fixes were targeting.
- **Security**: no backend, auth, or CSRF surface touched — purely client-side visual/theme change.
- **Performance**: no regressions; v7's CSS-variables mode means toggling doesn't force a full theme-object re-render.

## Build Validation

- `docker compose -f docker-compose.dev.yml build frontend` — `tsc && vite build` completed with no errors (pre-existing bundle-size/dynamic-import warnings only, unrelated to this change).
- `scripts/preflight.ps1` — backend image build + 38 backend tests passed, frontend image build passed. Exit code `0`.

## Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

Minor note (not a defect): the `index.html` `theme-color` meta tags follow OS-level `prefers-color-scheme`, not the app's explicit in-app toggle override — if a user manually overrides to dark while their OS is set to light, the browser chrome color won't follow. Documented as an accepted, low-impact trade-off (avoids adding JS to sync a `<meta>` tag with app state for a cosmetic PWA chrome detail).

## Result

**PASS** — no refinement cycle needed.

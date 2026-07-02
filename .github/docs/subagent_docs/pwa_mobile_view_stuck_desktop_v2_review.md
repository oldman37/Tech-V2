# PWA: Mobile view stuck on desktop after pull-to-refresh (v2) — Review

## Scope
`frontend/src/components/layout/AppLayout.tsx`, `frontend/src/components/layout/AppLayout.css`.

## Specification Compliance
Matches `.github/docs/subagent_docs/pwa_mobile_view_stuck_desktop_v2_spec.md`:
- `isDesktop` state, its `useEffect` (matchMedia + resize/orientationchange/rAF listeners), and the
  now-unused `useEffect` import removed entirely.
- Hamburger `IconButton`, permanent sidebar `<nav>`, and mobile `Drawer` now render
  unconditionally; visibility is delegated to CSS (`.hamburger-btn`, `.shell-sidebar--desktop`,
  `.shell-drawer--mobile` classes) using raw `@media (max-width:768px)` / `@media
  (min-width:769px)` rules, preserving the exact prior 768/769px breakpoint (verified no MUI
  `ThemeProvider`/`createTheme` breakpoints override exists anywhere in `frontend/src`, so the
  default `sm` token (600px) would have silently changed behavior if used — raw media queries were
  correctly used instead, per the spec's breakpoint-alignment note).
- `handleNavClick` now calls `setMobileOpen(false)` unconditionally, matching the spec.
- No CSS rules depended on `isDesktop`-driven DOM presence/absence — none found, no incidental
  breakage.

## Best Practices / Consistency
The pattern (both Drawer variants always mounted, `display` toggled via CSS breakpoints) matches
MUI's own official "Responsive drawer" reference example (`ResponsiveDrawer.tsx`, verified live
against the current `mui/material-ui` repo on 2026-07-02) — not a bespoke workaround. `IconButton`
and `Drawer` are MUI components so their visibility uses standard `className`/CSS; the plain `<nav>`
desktop sidebar isn't an MUI component so `sx` wasn't available there — a CSS modifier class
(`.shell-sidebar--desktop`) was used instead, consistent with the file's existing BEM-ish
`.shell-sidebar--mobile` convention already in the CSS file.

## Correctness
This removes the entire bug class rather than narrowing a timing window: CSS `@media` rules are
re-evaluated by the browser's layout/style engine on every paint against the live viewport — there
is no one-time JS snapshot that can go stale across a PWA reload, which was the root cause common
to both prior failed attempts (`fc7530f`, `deb2257`). The mobile Drawer's `open` state
(`mobileOpen`) is unaffected by this change — it's still purely user-gesture-driven (hamburger
click / `onClose`), so no behavior regression there. `handleNavClick`'s unconditional
`setMobileOpen(false)` is a no-op when the drawer is already closed (desktop case), so no
observable behavior change for desktop users.

## Completeness
Addresses the reported defect for its actual root cause (JS-gated render structure), not another
guess at matchMedia timing. Real-device pull-to-refresh verification still cannot be performed in
this environment — flagged to the user as the authoritative confirmation step, same as the prior
two attempts, but this time the fix is structurally immune to the failure mode both prior attempts
were vulnerable to (their own diagnosis: "the true viewport never changes, only the JS read was
wrong" — which no longer matters, because nothing reads the viewport into React state anymore for
layout purposes).

## Performance
Both the permanent sidebar and mobile Drawer's `sidebarContent` now always render (previously only
one rendered at a time). `sidebarContent` is static, cheap JSX (nav item list, no expensive
computation); the Drawer was already effectively always mounted via the pre-existing
`ModalProps={{ keepMounted: true }}`. Net cost: one extra static `<nav>` render on every
`AppLayout` re-render, negligible relative to route-level content. No new listeners, timers, or
API calls were added (net removal: 3 event listeners + 1 rAF callback are now gone).

## Security
No change — client-side layout rendering only, no data or auth path touched.

## Build Validation
Command (per spec, not in FORBIDDEN COMMANDS):
```
docker compose -f docker-compose.dev.yml build frontend
```
Result: **SUCCESS**. `tsc && vite build` completed without errors in 21.5s; PWA precache manifest
(`sw.js`, `workbox-bdb082da.js`) regenerated (9 entries, 2556.88 KiB). The two pre-existing
build-time warnings (`INEFFECTIVE_DYNAMIC_IMPORT` for `src/services/api.ts`, and the >500kB
chunk-size notice) are unrelated to this change (same warnings present in the prior `deb2257`
review, predate this diff). `grep isDesktop` on the modified file returns no matches — confirms no
orphaned references.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 95% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)** — Functionality scored 95% only because real-device pull-to-refresh
confirmation cannot be performed in this environment; the fix eliminates the mechanism both prior
attempts were vulnerable to (a stale one-time JS viewport read gating render structure) rather than
adjusting timing around it, and matches MUI's own documented pattern for this exact use case.

## Result: PASS
No CRITICAL issues. One RECOMMENDED follow-up (non-blocking, carried over from both prior
attempts): verify on an actual mobile PWA install after deploy, specifically via the
pull-to-refresh gesture that reproduced this bug. Proceeding to Phase 6 (Preflight).

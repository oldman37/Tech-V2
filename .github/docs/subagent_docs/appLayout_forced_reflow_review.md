# Review: Reduce forced-reflow work on AppLayout's first mount

## Spec
`.github/docs/subagent_docs/appLayout_forced_reflow_spec.md`

## Modified Files
- `frontend/src/components/layout/AppLayout.tsx`

## Change Summary
Added a `hasOpenedMobileDrawer` ref that latches `true` the first time
`mobileOpen` becomes `true`. The mobile `<Drawer>`'s
`renderSidebarContent(...)` call is now guarded on that ref, so it renders
`null` (nothing) until the drawer has been opened once, instead of always
rendering a full second copy of the nav (and its 6 MUI `Collapse` height
measurements) on every `AppLayout` mount. `ModalProps={{ keepMounted: true
}}` is unchanged, so after the first open the content stays mounted exactly
as before.

## Review

1. **Specification Compliance** — matches spec exactly; single scoped change,
   no unrelated edits.
2. **Best Practices** — latch pattern (`if (mobileOpen)
   hasOpenedMobileDrawer.current = true;`) runs during render, which is a
   supported React pattern for refs (no side effect, no state update, just an
   imperative mutable flag read on the next render) — same shape as React's
   own "resetting state during render" guidance; no `useEffect` needed since
   there's nothing to synchronize with an external system.
2. **Consistency** — reuses the same `useRef` already imported in this file;
   no new dependencies or patterns introduced.
3. **Maintainability** — comment explains the mechanism (MUI Collapse
   scrollHeight measurement × 2 sidebars) and why it matters (forced-reflow
   cost concentrated at first mount), not just what the code does.
4. **Completeness** — addresses the identified hot spot (duplicate
   `Collapse` measurement work on first `AppLayout` mount) without touching
   the desktop sidebar or any interactive behavior.
5. **Performance** — removes up to 6 `Collapse` `scrollHeight` layout reads
   from the critical first-paint path for any session that never opens the
   mobile drawer (the common case on desktop, where "just logged in" first
   paints mostly happen). No performance cost added elsewhere — the guard is
   an `O(1)` ref check.
6. **Security** — no impact; purely a client-side rendering-order change, no
   new data exposure, no auth/authorization logic touched.
7. **API Currency** — no external API usage changed; existing MUI
   `Drawer`/`ModalProps.keepMounted` behavior relied upon as documented.
8. **Build Validation:**
   ```
   docker compose -f docker-compose.dev.yml build frontend
   ```
   Result: **SUCCESS**. `tsc && vite build` completed with no type errors.

## Caveat (documented, not a defect)

This reduces — it does not eliminate — the forced-reflow cost, since the
always-visible desktop sidebar still renders 6 `Collapse` instances on first
mount; removing that entirely would require dropping `Collapse` from the nav
structure, which is out of scope for this fix (see spec's Verification
section). The change targets the clearest, lowest-risk win: the previously
wholly-unnecessary duplicate render.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 95% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

## Result: PASS

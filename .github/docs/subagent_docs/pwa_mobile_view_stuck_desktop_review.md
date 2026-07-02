# PWA: Mobile view stuck on desktop after refresh — Review

## Scope
`frontend/src/components/layout/AppLayout.tsx` — `isDesktop` detection effect only.

## Specification Compliance
Matches `.github/docs/subagent_docs/pwa_mobile_view_stuck_desktop_spec.md`:
- Existing synchronous `useState` lazy initializer (the prior `fc7530f` fix) left untouched — happy-path behavior and the original "flash" fix are preserved.
- `recheck` closure added; registered on `mq`'s `'change'` (existing), plus new `window` `'resize'` and `'orientationchange'` listeners.
- One-shot `requestAnimationFrame(recheck)` added on mount to re-validate after the first post-reload layout/paint pass, with `cancelAnimationFrame` on cleanup.
- Breakpoint value (769px) and CSS counterpart (`AppLayout.css:253`, 768px) untouched — still consistent.
- No other files changed.

## Best Practices / Consistency
Effect cleanup correctly removes all three listeners and cancels the rAF handle, avoiding leaks across `AppLayout` remounts (route changes navigate within the same mounted shell in this app, but the effect still follows React's standard cleanup contract).

## Correctness
`setIsDesktop(mq.matches)` is idempotent — when the re-validated value equals the current state, React's `Object.is` bail-out skips the re-render, so users on an already-correct read see zero behavioral change (no flicker, no extra renders from the added `resize`/`orientationchange` listeners in normal use).

## Completeness
Addresses the reported defect: a stale synchronous viewport read that previously had no compensating event to correct it. Does not (and cannot, per the spec's stated limitation) get physical-device verification in this environment — flagged to the user as an outstanding manual QA step.

## Performance
Negligible — `resize`/`orientationchange` are low-frequency events, and the rAF re-check runs exactly once per mount.

## Security
No change — purely client-side layout detection logic, no data or auth path touched.

## Build Validation
Command (per spec, not in FORBIDDEN COMMANDS):
```
docker compose -f docker-compose.dev.yml build frontend
```
Result: **SUCCESS**. `tsc && vite build` completed without errors (`RUN NODE_OPTIONS="--max-old-space-size=3072" npm run build` finished in 21.5s); PWA precache manifest (`sw.js`, `workbox-*.js`) regenerated. The two build-time warnings present (`INEFFECTIVE_DYNAMIC_IMPORT` for `src/services/api.ts`, and the >500kB chunk-size notice) are pre-existing and unrelated to this change — `AppLayout.tsx` already statically imported `api.ts` before this edit.

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

**Overall Grade: A (99%)** — Functionality scored 95% only because the root cause (a browser viewport-timing race on PWA relaunch) cannot be reproduced or confirmed fixed on a physical device in this environment; the fix is a well-reasoned, evidence-based, low-risk mitigation, not a lab-verified reproduction/fix cycle.

## Result: PASS
No CRITICAL issues. One RECOMMENDED follow-up (non-blocking): verify on an actual mobile PWA install after deploy. Proceeding to Phase 6 (Preflight).

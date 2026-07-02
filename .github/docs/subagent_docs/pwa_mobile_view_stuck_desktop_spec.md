# PWA: Mobile view reverts to desktop on refresh, only fixed by re-login — Spec

## Current State Analysis

`frontend/src/components/layout/AppLayout.tsx` (lines ~124-135) is the single source of truth for the app shell's mobile/desktop layout (hamburger menu + `Drawer` vs. permanent sidebar):

```ts
const [isDesktop, setIsDesktop] = useState(
  () => window.matchMedia('(min-width:769px)').matches
);
useEffect(() => {
  const mq = window.matchMedia('(min-width:769px)');
  const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, []);
```

This is not the first time this exact symptom has been worked on. Commit `fc7530f` ("fix(pwa): fix desktop mode flash on refresh...", 2026-05-20) replaced MUI's `useMediaQuery('(min-width:769px)')` with this synchronous `useState` lazy initializer specifically to fix "desktop mode flash... on refresh" — i.e. this is a known-recurring class of bug in this exact code path.

**Why the previous fix is incomplete:** it only changed *when* the viewport is read (synchronously at mount instead of via an effect defaulting to `false`), not *how reliably* that single read reflects the true viewport. On a PWA standalone relaunch/refresh, the rendering engine can momentarily report incorrect layout-viewport metrics before it has fully reconciled the `<meta name="viewport">` tag with the actual device viewport — a well-documented WebKit/Chromium timing quirk on app-shell reloads. If `window.matchMedia('(min-width:769px)').matches` is read during that narrow window, it can synchronously return `true` (desktop) even on a phone. Critically, because the *actual* viewport never changes afterward (it was correct the whole time from the OS's perspective — only the JS's synchronous snapshot was momentarily stale), the `MediaQueryList`'s `'change'` event never fires to correct it. The value is wrong once and stays wrong for the life of that page load — matching the reported symptom exactly ("stuck" until logout/login, not a transient flash).

**Why logout → login "fixes" it:** `Login.tsx` performs a real cross-origin browser navigation (`window.location.href = authUrl`) to Entra ID and back (`frontend/src/services/authService.ts`, `frontend/src/pages/Login.tsx:50,115`), unlike an in-place refresh of the same URL. By the time the app re-mounts after that round trip, the browser has had much more time (network + redirect latency) to fully settle the viewport, so the same synchronous read happens to succeed.

## Problem Definition

On mobile/PWA, refreshing the currently-loaded page can cause `AppLayout`'s `isDesktop` state to be initialized to `true` even though the viewport is mobile-sized. Because there is no compensating browser event once that happens, the app is stuck showing the desktop shell (no hamburger menu, no mobile drawer) until the user logs out and back in (a full page navigation elsewhere and back).

## Proposed Solution

Keep the existing synchronous initial read (it's still correct on the happy path and avoids the original "flash" bug), but make the value self-healing instead of relying solely on `matchMedia`'s `'change'` event, which does not fire in this failure mode:

1. Add a `window.addEventListener('resize', ...)` and `window.addEventListener('orientationchange', ...)` listener alongside the existing `matchMedia` `'change'` listener — both fire on more viewport-affecting events than `matchMedia`'s change event alone.
2. Re-validate the read once via `requestAnimationFrame` right after mount. This forces one extra check *after* the browser has completed its first layout/paint pass post-reload, by which point the viewport-vs-meta-tag reconciliation race described above has resolved. This directly closes the gap the prior fix left open (a single, possibly-premature synchronous read with no re-check).
3. All listeners re-run the same `matchMedia(...).matches` check and call `setIsDesktop`, so if the corrected value matches the current state, React bails out the re-render (no-op) — no behavior change for users who weren't affected.

This is additive and low-risk: it does not change the breakpoint, does not change the initial synchronous read (still avoids the original flash-to-desktop-then-correct visual glitch), and only adds extra opportunities to self-correct a wrong initial read.

## Implementation Steps

1. In `frontend/src/components/layout/AppLayout.tsx`, extend the existing `useEffect` (lines ~130-135):
   - Factor the `matchMedia(...).matches` read into a small local `recheck` closure.
   - Register `recheck` on `mq`'s `'change'` event (existing), plus `window` `'resize'` and `'orientationchange'`.
   - Call `requestAnimationFrame(recheck)` once on mount as a one-shot post-paint re-validation; store the handle and `cancelAnimationFrame` it on cleanup.
2. No changes to the breakpoint value, the CSS counterpart (`AppLayout.css:253`, already consistent at 768/769px), or any other file.

## Dependencies

None — browser-native APIs only (`matchMedia`, `resize`, `orientationchange`, `requestAnimationFrame`), all already used elsewhere in this file/project.

## Risks and Mitigations

- **Risk:** Extra `resize`/`orientationchange` listeners fire more often than the minimal `matchMedia` change listener, causing extra `setIsDesktop` calls.
  **Mitigation:** `setIsDesktop` is called with a boolean; React skips re-rendering when the new state equals the old state (`Object.is` bail-out), so this has no practical performance impact on a low-frequency UI event like resize/orientation change.
- **Risk:** This is a best-effort mitigation for a browser timing race that cannot be deterministically reproduced/verified in this environment (no physical mobile device available here).
  **Mitigation:** The fix is purely additive/defensive (new listeners + one extra rAF re-check) and cannot make the existing happy path worse; it directly targets the documented failure mode (a stale synchronous read with no compensating event) from the prior related fix commit `fc7530f`.

## Verification

- `docker compose -f docker-compose.dev.yml build frontend` — confirms `tsc` + `vite build` succeed (this is a frontend-only change).
- `.\scripts\preflight.ps1` — full gate.
- Manual: cannot be verified against a physical mobile/PWA device in this environment; flag this explicitly to the user as a real-device verification step they should perform after deploy.

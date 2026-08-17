# Final Review: Remove the white flash between Login and Dashboard

## Spec
`.github/docs/subagent_docs/login_white_flash_color_match_spec.md`

## Prior Review
`.github/docs/subagent_docs/login_white_flash_color_match_review.md` —
NEEDS_REFINEMENT (no CRITICAL issues; one RECOMMENDED).

## Refinement Cycle 1

**RECOMMENDED-1 — `indexOf('code=')` can false-positive → RESOLVED.**

`frontend/index.html` now uses
`new URLSearchParams(location.search).has('code')`, an exact parameter match,
so `?promocode=x` or `?error_code=y` can no longer be mistaken for the OAuth
callback and trigger the flat dashboard pre-paint on a cold `/login` load.
This matches the idiom already used at `Login.tsx:28` for the same purpose.
The surrounding `try/catch` is retained, so any failure still degrades to the
existing gradient rather than blocking first paint.

No other changes were made in this cycle.

## Verification

1. **All Phase 3 findings resolved** — the single RECOMMENDED item is fixed;
   there were no CRITICAL items.
2. **No regressions introduced** — the change is confined to the predicate
   inside the existing inline script; the `data-callback` attribute, the CSS
   rules keyed to it, and all other files are untouched since Phase 3.
3. **Spec alignment maintained** — still exactly the four files in the spec's
   implementation steps; `global.css` remains untouched per spec section 3.
4. **Build & test validation:**
   ```
   scripts\preflight.ps1
   ```
   - Preflight 1/3 — backend image build: **SUCCESS**
   - Preflight 2/3 — frontend image build: **SUCCESS** (`tsc && vite build`,
     no type errors)
   - Preflight 3/3 — backend tests: **9 test files passed, 67 tests passed**
   - Test-only container `tech-v2-db-test-1` cleaned up
   - `All preflight checks passed.` — **exit code 0**

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: APPROVED

## Residual Limitations (documented, not defects)

- The browser's own inter-document canvas cannot be coloured by any API. This
  change removes its contrasting neighbours so it stops registering as a
  flash; it does not make that frame blue. Only the popup-based auth flow
  (out of scope per spec) would eliminate the frame entirely.
- `<meta name="color-scheme">`'s effect on that canvas is browser-dependent.
  Chrome/Edge honour it; coverage elsewhere is not guaranteed. The other
  three changes do the substantive work and do not depend on it.
- `handleSilentLogin` (`Login.tsx:51-64`) performs the same hard navigation
  on auto-SSO and was deliberately left unchanged — it fires without user
  interaction on page arrival, and adding a 180ms delay there would tax every
  visit for a moment the user did not initiate. Flagged for the user rather
  than silently changed.

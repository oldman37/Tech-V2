# Review: Remove the white flash between Login and Dashboard by colour-matching

## Spec
`.github/docs/subagent_docs/login_white_flash_color_match_spec.md`

## Modified Files
- `frontend/src/pages/Login.css`
- `frontend/src/pages/Login.tsx`
- `frontend/index.html`
- `frontend/src/components/layout/AppLayout.css`

## Change Summary

1. `Login.css` — new `.login-container::after` full-viewport overlay in the
   dashboard colour (`var(--slate-50)`), `opacity: 0`, raised to `1` by
   `.login-container--leaving`. Opacity-animated rather than a `background`
   transition because gradient-to-gradient interpolation does not animate.
2. `Login.tsx` — `leaving` state applied to both render branches via
   `containerClass`; `handleLogin` sets it and defers `window.location.href`
   by `LEAVE_FADE_MS` (180ms), skipping the wait entirely under
   `prefers-reduced-motion: reduce`.
3. `index.html` — `<meta name="color-scheme" content="light dark">`; a
   pre-paint inline script marking the Entra return leg with `data-callback`
   on `<html>`; `[data-callback]` rules overriding the gradient with the flat
   dashboard colour in light and dark.
4. `AppLayout.css` — `app-shell-fade-in` 200ms → 350ms.

## Review

1. **Specification Compliance** — all four implementation steps present and
   faithful. `global.css` correctly left untouched per spec section 3.
2. **Best Practices** — opacity-only compositor-friendly animation; the
   overlay carries `pointer-events: none` so it never intercepts clicks; the
   inline script is wrapped in `try/catch` so a failure degrades to the
   existing gradient instead of blocking first paint.
3. **Consistency** — `var(--slate-50, #f8fafc)` matches the token-with-literal-
   fallback pattern already used at `AppLayout.css:7`; the
   `prefers-reduced-motion` guard mirrors `AppLayout.css:20-24`; the new
   `index.html` rules follow the existing literal-value convention in that
   file (tokens are unavailable pre-paint).
4. **Maintainability** — `LEAVE_FADE_MS` is commented as needing to stay in
   sync with the CSS duration. Each block documents *why*, including the
   non-obvious facts that gradients do not interpolate and that MUI owns
   `color-scheme` post-load.
5. **Completeness** — every colour boundary in the sequence is addressed
   except the UA canvas itself, which is documented as having no API.
6. **Performance** — one compositor-only opacity transition; the inline
   script is a single attribute test with no I/O. Bundle warnings in the
   build output are pre-existing and were declared out of scope.
7. **Security** — no auth, cookie, CSRF, or data surface touched. The inline
   script reads `location.search` and writes a static attribute name; it
   never interpolates URL content into the DOM, so no injection vector.
8. **API Currency** — no library APIs used. Verified against the installed
   stack that MUI v7 (`CssBaseline enableColorScheme` + `colorSchemeSelector:
   'class'`) already emits `color-scheme`, which is why it is declared only
   as a meta tag and not in `global.css`.
9. **Build Validation:**
   ```
   docker compose -f docker-compose.dev.yml build frontend
   ```
   Result: **SUCCESS** — `tsc && vite build` completed with no type errors;
   `Image tech-v2-frontend Built`. Emitted warnings (`INEFFECTIVE_DYNAMIC_IMPORT`,
   chunks >500 kB) are pre-existing and unrelated to this change.

## Findings

### RECOMMENDED-1 — `indexOf('code=')` can false-positive

`index.html` detects the callback leg with
`location.search.indexOf('code=') !== -1`. This is a substring test, so any
query parameter *ending* in `code` — `?promocode=x`, `?error_code=y` —
would also match and cause a cold load of `/login` to pre-paint the flat
dashboard colour instead of Login's gradient.

No such parameter is used by the app today (`code`, `state`, `error`,
`fallback`, `silent`), so this is a latent correctness issue rather than a
live bug. `URLSearchParams` gives an exact match at no cost and is already
the idiom used for this same purpose at `Login.tsx:28`.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 95% | A |
| Code Quality | 90% | A- |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 90% | A- |
| Build Success | 100% | A |

**Overall Grade: A- (96%)**

## Result: NEEDS_REFINEMENT

No CRITICAL issues. RECOMMENDED-1 to be addressed in Phase 4.

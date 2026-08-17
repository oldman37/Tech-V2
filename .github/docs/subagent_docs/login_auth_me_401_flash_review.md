# Review: Eliminate spurious `/auth/me` 401 + flash during OAuth callback

## Spec
`.github/docs/subagent_docs/login_auth_me_401_flash_spec.md`

## Modified Files
- `frontend/src/App.tsx` (`AuthInitializer`)

## Change Summary
`AuthInitializer`'s mount effect now checks, before calling `initializeAuth()`,
whether the current location is `/login` with a `code` query param (the tail end
of an Entra OAuth redirect, where the app has just remounted from a full page
load and no session cookie can exist yet). In that case it calls the store's
`setLoading(false)` and returns instead of firing `GET /api/auth/me` — avoiding
a guaranteed 401 that raced `Login.handleCallback`'s real token exchange. Every
other mount path (fresh visit, silent-SSO redirect with no code, plain
`/login`, any authenticated route) is unaffected and still calls
`initializeAuth()` exactly as before.

## Review

1. **Specification Compliance** — matches the spec's proposed solution and
   implementation steps exactly; single, narrowly-scoped change in
   `AuthInitializer`, no other files touched.
2. **Best Practices** — reads `window.location` once inside the existing
   mount-only effect (empty dep array unchanged); no new state, no new
   subscriptions; uses the store's own existing `setLoading` action rather than
   reaching into internals.
3. **Consistency** — mirrors the same `code`-param check pattern
   `Login.tsx` itself already uses (`silentPending` initializer at
   `Login.tsx:15-23`) — same URL, same reasoning, same file convention.
4. **Maintainability** — comment explains *why* the probe is skipped and what
   would otherwise race, not just what the code does.
5. **Completeness** — addresses the exact repro (401 in console + flash on
   first login) without touching the silent-SSO or error-return paths, which
   were not implicated.
6. **Performance** — removes one unnecessary network round trip on every OAuth
   login completion. No regression elsewhere.
7. **Security** — no change to auth enforcement; backend routes/authorization
   untouched. `Login.handleCallback` remains the sole source of truth for
   establishing `user`/`isAuthenticated` on this path, same as before.
8. **API Currency** — no external library usage involved.
9. **Build Validation:**

   Command run (per spec, matches approved Resource Constraints — image build
   only, no host npm, no database):
   ```
   docker compose -f docker-compose.dev.yml build frontend
   ```
   Result: **SUCCESS**. `tsc && vite build` completed with no type errors.
   Output included only pre-existing, unrelated warnings (large-chunk-size
   advisory, dynamic/static import overlap on `api.ts`) — both present before
   this change and out of scope.

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

## Result: PASS

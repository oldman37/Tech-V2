# Review: Staff-only, searchable user pickers on Edit Location modal

## Spec

`.github/docs/subagent_docs/supervisor_picker_staff_search_spec.md`

## Modified Files

- `frontend/src/components/UserSearchAutocomplete.tsx`
- `frontend/src/pages/SupervisorManagement.tsx`

## Changes Made

1. `UserSearchAutocomplete`: added optional `staffOnly?: boolean` prop
   (default `false`), threaded into both `userService.searchUsers(...)` calls
   (initial-open fetch and debounced search), and added to both `useEffect`
   dependency arrays.
2. `SupervisorManagement.tsx`:
   - Add Supervisor picker: plain `<select>` bound to `newSupervisor.userId`
     replaced with `<UserSearchAutocomplete staffOnly />`.
   - `WorkerAssignmentSection`'s `UserSearchAutocomplete` (covers both
     Technology Assistant and Maintenance Personnel pickers): added
     `staffOnly`.
   - Temporary Delegate `UserSearchAutocomplete`: added `staffOnly`.
   - `EditLocationModal`: removed the now-unused `users: User[]` prop from
     its interface, destructuring, and call site.
   - Top-level `SupervisorManagement`: removed the now-unused `users`
     destructure from `useSupervisorsList()`, keeping `isLoading: usersLoading`
     (still gates the page's loading spinner — unchanged behavior).

## Review Against Criteria

1. **Spec Compliance** — matches spec exactly: all three pickers are now
   staff-filtered and type-to-search; unused `users` plumbing removed only
   where this change made it dead.
2. **Best Practices** — reuses existing `UserSearchAutocomplete` /
   `userService.searchUsers` / backend `staffOnly` support already used
   elsewhere in the app; no new dependency; React hook deps updated correctly
   for the new prop.
3. **Consistency** — all three location-role pickers in this modal now share
   the same component/pattern; `staffOnly` filter matches the definition
   already implemented server-side (`@ocboe.com`, excluding
   `@students.ocboe.com`).
4. **Maintainability** — no new abstractions; single shared component now
   covers 3 call sites instead of a bespoke `<select>` plus 2 autocompletes.
5. **Completeness** — Supervisor, Technology Assistant, Maintenance
   Personnel, and Temporary Delegate pickers are all covered ("a supervisor or
   any of the other support roles").
6. **Performance** — no regression; `UserSearchAutocomplete` already does
   server-side, debounced, capped (20 result) search.
7. **Security** — no authorization changes; `staffOnly` filtering happens
   server-side in `userService.searchForAutocomplete`, not just client-side.
8. **API Currency** — no new external API usage; existing MUI `Autocomplete`
   pattern.
9. **Build Validation:**

   Command (per spec, approved, not in FORBIDDEN COMMANDS):
   ```
   docker compose -f docker-compose.dev.yml build frontend
   ```
   Result: **PASS** — `tsc && vite build` completed successfully inside the
   image (`✓ built in 1.73s`, PWA precache generated, image tagged
   `tech-v2-frontend:latest`). No TypeScript errors. Pre-existing build
   warnings only (chunk size, ineffective dynamic import of `api.ts`) — both
   present before this change and unrelated to it.

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

## Result

**PASS** — proceeding to Phase 6 (Preflight).

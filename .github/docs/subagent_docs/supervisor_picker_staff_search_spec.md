# Spec: Staff-only, searchable user pickers on Edit Location modal

## Current State Analysis

`frontend/src/pages/SupervisorManagement.tsx` → `EditLocationModal` contains three
places where a user is picked for a location role:

1. **Add Supervisor** (Supervisors section, ~line 1393): a plain HTML `<select>`
   bound to `newSupervisor.userId`, populated from the `users` prop
   (`useSupervisorsList()` → `GET /users/supervisors/list`, i.e. active users with
   role `ADMIN`/`USER` or already assigned as a supervisor). Not searchable by
   typing, and not filtered to staff email domain.
2. **Technology Assistant** / **Maintenance Personnel** (`WorkerAssignmentSection`,
   reused twice): already uses `UserSearchAutocomplete` (type-to-search against
   `GET /api/users/search`), but does not pass `staffOnly`.
3. **Temporary Delegate** (Delegates section, ~line 1550): already uses
   `UserSearchAutocomplete`, but does not pass `staffOnly`.

`frontend/src/components/UserSearchAutocomplete.tsx` wraps MUI `Autocomplete` and
calls `userService.searchUsers(query, limit, locationId?, staffOnly?)`. The
`staffOnly` parameter is already wired through to the backend
(`frontend/src/services/userService.ts:92`) but the component itself has no prop
to set it — it's always called with `staffOnly` undefined.

The backend endpoint (`backend/src/services/user.service.ts:553`
`searchForAutocomplete`) already implements the staff filter:

```ts
if (staffOnly) {
  where.email = { endsWith: '@ocboe.com', mode: 'insensitive' };
  where.NOT = { email: { endsWith: '@students.ocboe.com', mode: 'insensitive' } };
}
```

So "staff" = active user whose email ends in `@ocboe.com` and does not end in
`@students.ocboe.com`. No backend changes are required.

## Problem

On the Edit Location modal, when assigning a Supervisor, Technology Assistant,
Maintenance Personnel, or Temporary Delegate, the picker should (a) only offer
staff accounts, not students, and (b) support typing to search by name. Today
only #2/#3 above are searchable, and none of the three filter to staff.

## Proposed Solution

1. Add an optional `staffOnly?: boolean` prop to `UserSearchAutocomplete` and
   pass it through to `userService.searchUsers(inputValue, 20, undefined, staffOnly)`
   in both the initial-open fetch and the debounced search effect.
2. In `SupervisorManagement.tsx`:
   - Replace the plain `<select>` for `newSupervisor.userId` in the Add
     Supervisor block with `UserSearchAutocomplete`
     (`value={newSupervisor.userId || null}`, `staffOnly`, label "Search for a
     supervisor…").
   - Pass `staffOnly` on the `UserSearchAutocomplete` used inside
     `WorkerAssignmentSection` (covers both Technology Assistant and
     Maintenance Personnel, since the section is reused for both).
   - Pass `staffOnly` on the `UserSearchAutocomplete` used for the Temporary
     Delegate picker.
3. Once the Add Supervisor `<select>` no longer iterates the `users` prop, the
   `users`/`usersLoading` plumbing from `useSupervisorsList()` into
   `EditLocationModal` becomes dead in that component. Leave the
   `useSupervisorsList()` call, `users` state, and the `AssignSupervisorModal`/
   `AssignmentsTab` components untouched — they are pre-existing
   (`@ts-ignore`-marked, currently unrendered) reserved code outside this
   task's scope. Only remove the `users` prop from `EditLocationModal`'s own
   interface/destructuring since it becomes a genuinely unused parameter
   introduced by this change; `SupervisorManagement` itself keeps fetching
   `users` for the other still-existing consumers.

## Implementation Steps

1. `frontend/src/components/UserSearchAutocomplete.tsx`: add `staffOnly` prop,
   thread into both `userService.searchUsers` calls.
2. `frontend/src/pages/SupervisorManagement.tsx`:
   - `EditLocationModal`: drop the now-unused `users` prop from the component
     (interface + destructuring); replace the Add Supervisor `<select>` with
     `UserSearchAutocomplete staffOnly`.
   - `WorkerAssignmentSection`'s `UserSearchAutocomplete`: add `staffOnly`.
   - Delegate `UserSearchAutocomplete`: add `staffOnly`.
   - Update the call site (`showEditLocation && ...`) to stop passing
     `users={users}` to `EditLocationModal` (prop removed).

## Dependencies

None — reuses the existing `UserSearchAutocomplete` component, MUI
`Autocomplete` (already in use throughout the app), and the existing backend
`staffOnly` query support. No new packages, no schema/migration changes, no
env var changes.

## Risks & Mitigations

- **Risk:** Removing the `users` prop from `EditLocationModal` could break other
  callers. **Mitigation:** grep confirms `EditLocationModal` has exactly one
  call site (`SupervisorManagement`), updated in the same change.
- **Risk:** `staffOnly` filter could hide a legitimately-needed non-`@ocboe.com`
  account. **Mitigation:** this mirrors the exact filter already used
  elsewhere in the app (backend `searchForAutocomplete`); behavior is
  consistent with existing staff-only pickers, not a new policy.
- **Risk:** UI regression in modal layout from swapping `<select>` for MUI
  `Autocomplete`. **Mitigation:** `UserSearchAutocomplete` is already used
  twice in the same modal (Worker Assignment, Delegate) with consistent
  styling — no new layout pattern introduced.

## Build/Test Commands (approved for Phase 3/6)

- `docker compose -f docker-compose.dev.yml build frontend` (frontend `tsc` +
  `vite build` — validates this change compiles)
- `scripts/preflight.ps1` (full gate: backend build, frontend build, backend
  vitest run in Docker)

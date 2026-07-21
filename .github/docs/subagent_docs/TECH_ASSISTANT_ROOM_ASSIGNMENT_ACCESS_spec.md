# Spec: Grant Technology Assistants Room-Assignment Access (Scoped to Assigned Schools)

## Current State Analysis

Room Assignments (`/api/room-assignments/*`) lets a caller view and update which staff are
assigned to which rooms at a location. Authorization is enforced in two duplicated places that
both apply the same "Admin OR Principal/VP-verified-as-primary-supervisor" rule:

- `backend/src/controllers/userRoomAssignment.controller.ts:21-95`
  (`assertAdminOrPrimarySupervisor`) — used by `getAssignmentsByRoom`, `assignUsersToRoom`,
  `unassignUserFromRoom`, and `setPrimaryRoom`.
- `backend/src/middleware/requireAdminOrPrimarySupervisor.ts` — used as route middleware on
  `GET /room-assignments/location/:locationId` and `GET /room-assignments/location/:locationId/users`.

Both check, in order:
1. Admin (role `ADMIN` or `ENTRA_ADMIN_GROUP_ID`) → always allowed.
2. Principal/VP (`ENTRA_PRINCIPALS_GROUP_ID` / `ENTRA_VICE_PRINCIPALS_GROUP_ID`) → allowed only if a
   `LocationSupervisor` row exists for `(locationId, userId, isPrimary: true)` (any
   `supervisorType`), with a legacy fallback in the controller version that also accepts a match on
   `User.officeLocation` against the location name.
3. Otherwise → allowed only if a `LocationSupervisor` row exists for
   `(locationId, userId, isPrimary: true)` directly (same generic, type-agnostic check as principals
   use as their fallback).

Note: because step 2/3's DB check does not filter on `supervisorType`, it is generic across ALL
supervisor types, not principal-specific — it happens to already grant access to anyone holding an
`isPrimary: true` `LocationSupervisor` row for that location, regardless of type. This is pre-existing
behavior, unrelated to this change, and is not being modified.

Technology Assistants are a distinct Entra group (`ENTRA_TECH_ASSISTANTS_GROUP_ID`,
`backend/.env.example`) with no special handling in either room-assignment gate today. They are,
however, already tracked per-location via `LocationSupervisor.supervisorType === 'TECHNOLOGY_ASSISTANT'`
(`shared/src/types.ts:41`) — the same model already used for work-order auto-assignment
(`work-orders.service.ts:432-457`) and default-location resolution
(`.github/docs/subagent_docs/TECH_ASSISTANT_LOCATION_DEFAULT_spec.md`). Unlike Principal/VP, a school
can have more than one assigned Technology Assistant, and `isPrimary` on that row is only used
elsewhere to pick a *default*, not to gate access — so requiring `isPrimary: true` here would
wrongly exclude a non-primary but still-assigned Technology Assistant.

On the frontend, visibility of the whole feature is already fully gated:
- Nav link: `frontend/src/components/layout/AppLayout.tsx:110,179` only renders "Room Assignments"
  when `useRoomAssignmentAccess().canAccess` is true.
- Route: `frontend/src/App.tsx:285-289` wraps the page in
  `<ProtectedRoute requireRoomAssignment>`, which reads the same hook.
- `frontend/src/hooks/useRoomAssignmentAccess.ts` currently computes `canAccess` from
  `isAdmin || isPrincipalOrVP || isPrimarySupervisor`, where `isPrincipalOrVP` comes straight from
  `user.isPrincipalOrVP` (set server-side in `auth.controller.ts:399,781` via
  `groupAuth.ts::isPrincipalOrVP()`), and `isPrimarySupervisor` is derived from the same
  `getUserSupervisedLocations` query used for principals (no type filter, so it already includes any
  `isPrimary` row, including a Technology Assistant one if it happened to be primary).
- `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx:54-94` uses `isPrimarySupervisor` /
  `primarySupervisorLocationIds` to auto-select a single supervised location, and falls back to a
  district-wide `<Select>` (all locations, via `useLocations()`) only for Admins and for
  Principal/VP-group members who have no primary-supervisor row.

Because nothing renders or routes to this page unless `canAccess` is true, **the feature is already
hidden from anyone who lacks access** — adding Technology Assistants to the allowed set will not
expose it to any other, unrelated role.

## Problem Definition

Technology Assistants need to be able to manage room assignments for the school(s) they support,
but only those schools — not district-wide, and not for schools they aren't assigned to. Today they
have no access at all unless they coincidentally hold an unrelated `isPrimary` supervisor row.

## Proposed Solution

Add Technology Assistants as a third authorized party, scoped by an existing
`LocationSupervisor` row of type `TECHNOLOGY_ASSISTANT` for the specific location in question —
mirroring the Principal/VP pattern (group membership + per-location DB verification) but checking
`supervisorType: 'TECHNOLOGY_ASSISTANT'` directly instead of requiring `isPrimary`, since a school
may have multiple assigned Technology Assistants and any of them should be able to manage that
school's room assignments. No `officeLocation` string fallback is added for Technology Assistants
(per `TECH_ASSISTANT_LOCATION_DEFAULT_spec.md`, that field is an HR/payroll string, not a real
assignment, and using it here would grant access based on the wrong data).

### Backend

1. **`backend/src/utils/groupAuth.ts`** — add `isTechAssistant(groupIds: string[]): boolean`,
   following the exact shape of the existing `isPrincipalOrVP()` (lines 191-197), checking
   `ENTRA_TECH_ASSISTANTS_GROUP_ID`.
2. **`backend/src/controllers/userRoomAssignment.controller.ts`** —
   in `assertAdminOrPrimarySupervisor`, after the existing Principal/VP block and before the final
   generic fallback check, add:
   - Compute `isTechAssistant` from `req.user.groups` using the new helper.
   - If true, check for a `LocationSupervisor` row
     `{ locationId, userId: req.user.id, supervisorType: 'TECHNOLOGY_ASSISTANT', user: { isActive: true } }`
     (no `isPrimary` filter). If found, return (allow). If not found, throw the same
     `AuthorizationError` used for the Principal/VP failure path, with its own log line
     (`loggers.roomAssignments.warn(...)`, `action: 'room-assignment'`) so denials are distinguishable
     in logs.
   - This block runs independently of the Principal/VP block (a user is one or the other in
     practice, but the check is structured as three independent group checks, not nested).
3. **`backend/src/middleware/requireAdminOrPrimarySupervisor.ts`** — add the equivalent
   Technology-Assistant branch (group check + `LocationSupervisor` lookup by
   `supervisorType: 'TECHNOLOGY_ASSISTANT'`, no `isPrimary` filter) alongside the existing
   Principal/VP branch, before the final generic fallback query. Denials get their own
   `loggers.accessControl.warn(...)` line.
4. **`backend/src/controllers/auth.controller.ts`** — add `isTechAssistant: isTechAssistant(groupIds)`
   next to the existing `isPrincipalOrVP: isPrincipalOrVP(groupIds)` at both call sites (line ~399,
   login/callback flow, and line ~781, `/me` refresh flow), importing the new helper from
   `groupAuth.ts`.
5. **`backend/src/types/auth.types.ts`** — add `isTechAssistant: boolean;` next to
   `isPrincipalOrVP: boolean;` (line 104) in the shared auth-response permissions type.

### Frontend

6. **`frontend/src/store/authStore.ts`** — add `isTechAssistant?: boolean;` next to
   `isPrincipalOrVP?: boolean;` (line 22) in the `User` interface.
7. **`frontend/src/hooks/useRoomAssignmentAccess.ts`** —
   - Read `isTechAssistant = user?.isTechAssistant ?? false`.
   - The existing `supervisedLocations` query already returns every `LocationSupervisor` row for the
     user (no type filter) via `locationService.getUserSupervisedLocations`, and is already enabled
     for any non-admin user (`skipQuery = isAdmin`) — no new query is needed.
   - Add `techAssistantLocations = supervisedLocations.filter(sl => sl.supervisorType === 'TECHNOLOGY_ASSISTANT')`
     (keep the full `LocationSupervisorWithDetails` objects, not just IDs, so the page can render
     location names for a multi-school selector without an extra fetch).
   - Extend `canAccess` to
     `isAdmin || isPrincipalOrVP || isPrimarySupervisor || (isTechAssistant && techAssistantLocations.length > 0)`.
   - Return `isTechAssistant` and `techAssistantLocations` alongside the existing fields.
8. **`frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`** —
   - Destructure the two new fields from the hook.
   - Auto-select effect (lines 74-81): if the user is not admin/principal-VP and not a primary
     supervisor, but is a Technology Assistant with exactly one `techAssistantLocations` entry,
     auto-select that location the same way primary supervisors are auto-selected.
   - Add `showTechAssistantSelector = !isAdmin && !isPrincipalOrVP && !isPrimarySupervisor && isTechAssistant && techAssistantLocations.length > 1`
     — true only when a Technology Assistant supports more than one school and needs to pick which
     one to manage.
   - When `showTechAssistantSelector` is true, render a `<Select>` scoped to
     `techAssistantLocations` only (their assigned schools) — **not** the district-wide
     `useLocations()` list used for Admin/Principal-without-primary — so a Technology Assistant can
     never pick a school they are not assigned to from the UI.
   - Extend the "show current location name instead of a selector" block and the "select a location"
     prompt text to also cover the single-location Technology Assistant case (mirroring how
     `isPrimarySupervisor` is handled today).
   - No changes to `RoomAssignmentDialog.tsx` — it already receives `locationId` from the page and
     the backend re-validates authorization server-side regardless of what the frontend sends.

## Implementation Steps

1. `backend/src/utils/groupAuth.ts` — add `isTechAssistant()`.
2. `backend/src/controllers/userRoomAssignment.controller.ts` — add Technology Assistant branch to
   `assertAdminOrPrimarySupervisor`.
3. `backend/src/middleware/requireAdminOrPrimarySupervisor.ts` — add matching branch.
4. `backend/src/controllers/auth.controller.ts` — surface `isTechAssistant` in both auth payloads.
5. `backend/src/types/auth.types.ts` — add the field to the shared type.
6. `frontend/src/store/authStore.ts` — add the field to the `User` interface.
7. `frontend/src/hooks/useRoomAssignmentAccess.ts` — compute and expose
   `isTechAssistant` / `techAssistantLocations`; extend `canAccess`.
8. `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` — auto-select single-school case;
   add school-scoped selector for multi-school Technology Assistants; extend location-name /
   prompt text branches.

## Dependencies

None new. No new npm packages, no new Prisma models/fields, no new Graph scopes — this only adds
one pure function, extends two existing authorization checks with a third parallel branch, and
threads one new boolean + one derived array through code paths that already exist and already fetch
the data needed (`LocationSupervisor` rows via `getUserSupervisedLocations`).

## Configuration Changes

None. `ENTRA_TECH_ASSISTANTS_GROUP_ID` is already defined in `backend/.env.example`, already wired
into `docker-compose.dev.yml`, and already used elsewhere in the backend — no new env var is
introduced.

## Risks and Mitigations

- **Risk:** A Technology Assistant is granted access to a school they no longer support if their
  `LocationSupervisor` row isn't cleaned up. **Mitigation:** Same data-lifecycle dependency that
  already exists for Principal/VP scoping and for work-order auto-assignment — out of scope for this
  change; access is only as current as the `LocationSupervisor` table.
- **Risk:** Regression to the existing Principal/VP or Admin paths. **Mitigation:** The new checks
  are additive (independent `if` branches returning early on success); neither the Admin bypass, nor
  the Principal/VP block, nor the final generic fallback are modified.
- **Risk:** Frontend selector exposing schools a Technology Assistant isn't assigned to.
  **Mitigation:** The new selector is explicitly built from `techAssistantLocations` (the user's own
  `TECHNOLOGY_ASSISTANT`-typed rows), not the district-wide `useLocations()` list used for
  Admin/Principal fallback — and the backend independently re-verifies the `locationId` on every
  request regardless of what the frontend renders.
- **Risk:** Confusing a Technology Assistant with zero assigned schools. **Mitigation:**
  `canAccess` requires `techAssistantLocations.length > 0`, so a Technology Assistant with no
  `LocationSupervisor` row still cannot see the nav link or route, exactly like today.

## Files to be Modified

- `backend/src/utils/groupAuth.ts`
- `backend/src/controllers/userRoomAssignment.controller.ts`
- `backend/src/middleware/requireAdminOrPrimarySupervisor.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/types/auth.types.ts`
- `frontend/src/store/authStore.ts`
- `frontend/src/hooks/useRoomAssignmentAccess.ts`
- `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`

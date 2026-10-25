# Spec: Director of Schools — District-Wide Work Order Visibility

## Current State

- `GROUP_MODULE_MAP.WORK_ORDERS` (`backend/src/utils/groupAuth.ts`) grants
  `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` **level 4**.
- Level-4 scoping in `WorkOrderService` (`backend/src/services/work-orders.service.ts`):
  - `getWorkOrders` — restricts to `officeLocationId IN <supervised locations>` when the
    user has any `LocationSupervisor` rows; unrestricted only when they have none.
  - `assertTicketAccess` — same rule for direct-object access (GET by id, status,
    comments, assign, etc.).
- `LocationSyncService` (`SUPERVISOR_GROUPS`) assigns the DoS group as primary supervisor
  of the `DO` (District Office) department location. So in practice the DoS sees only
  District Office work orders (plus their own input requests).
- Level 5 removes all scoping but also unlocks `DELETE /api/work-orders/:id`
  (hard delete) — currently Admin + Tech Assistants only.

## Problem

The Director of Schools cannot view work orders district-wide.

## Decision (confirmed with user)

- Keep DoS at WORK_ORDERS level 4 (no hard-delete).
- Add a district-wide scope override for the **Director of Schools group only**
  (not Asst. DoS).

## Solution

Follow the existing Maintenance Director precedent: that group stays at level 4 but gets
district-wide scope via the `maintenanceRole` scope argument that the controller already
derives from groups and passes to every service method.

1. `groupAuth.ts` — add `isDirectorOfSchools(groups)` (same shape as `isMaintenanceDirector`).
2. `work-orders.controller.ts` — `getMaintenanceRole` returns `'district_wide'` for DoS,
   checked first (it is a superset of every maintenance scope).
3. `work-orders.service.ts`:
   - Extend `MaintenanceRole` union with `'district_wide'`.
   - `getWorkOrders` level-4 branch: no location restriction for `'district_wide'`; no
     department forcing (unlike `director`).
   - `assertTicketAccess` level-4 branch: return early for `'district_wide'`.

Effect: the DoS sees every work order in the list and detail views. Because the
visibility and per-ticket access checks are shared (as with Maintenance Director), the DoS
can also use their existing level-4 actions (status, assign, comments) on any ticket. A
read-only split would leave the level-4 controls on the detail page returning 403. Hard
delete stays level 5.

## Tests

New `backend/src/__tests__/workorders-dos-scope.test.ts`, mirroring
`workorders-maintenance-director-scope.test.ts`:
- DoS supervises location B; ticket at location A (TECHNOLOGY) and location B.
- List includes both; GET by id on A → 200; DELETE on A → 403 (still level 4).

`docker-compose.dev.yml` `backend-test` env: add
`ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID: test-dos-group-id`. Mirror it in `backend/.env.test`
(reference copy).

## Dependencies / Config

No new dependencies, no Prisma schema change, no migration, no new production env vars.

## Validation Commands (approved)

- `scripts/preflight.ps1` (mobile-table guard, backend + frontend image builds,
  `vitest run` in the isolated `backend-test`/`db-test` containers). Requires Docker Desktop.

## Risks

- DoS gains action rights (not just view) on all tickets at level 4. Mitigation:
  matches existing Maintenance Director behaviour; documented to user.
- `maintenanceRole` name is now slightly broader than "maintenance". Mitigation: comment
  at the type; renaming across ~13 call sites is out of scope.

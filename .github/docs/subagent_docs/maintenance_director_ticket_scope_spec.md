# Spec: Fix Maintenance Director Work Order Visibility

## 1. Current State Analysis

Permissions are derived live from Entra group membership (`req.user.groups`), never stored roles
— see `backend/src/utils/groupAuth.ts`. For the `WORK_ORDERS` module,
`ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` grants `permLevel = 4` (`GROUP_MODULE_MAP.WORK_ORDERS`,
`groupAuth.ts:75`), the same level as `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID`.

`backend/src/controllers/work-orders.controller.ts:49-53` derives a `maintenanceRole` used to
special-case ticket visibility for maintenance-specific groups:

```ts
function getMaintenanceRole(groups: string[]): 'county_wide' | 'school_only' | undefined {
  if (isCountyWideMaintenance(groups)) return 'county_wide';
  if (isSchoolMaintenanceWorker(groups)) return 'school_only';
  return undefined;
}
```

It never checks `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID`, so a Maintenance Director's
`maintenanceRole` is always `undefined`.

In `backend/src/services/work-orders.service.ts`, `getWorkOrders()` (list) and
`assertTicketAccess()` (single-ticket access) branch on `permLevel`:

- `permLevel === 3` + `maintenanceRole === 'county_wide'`: `baseWhere.department` is forced to
  `'MAINTENANCE'` (lines 298-300) and no location restriction is applied (lines 325-327) — the
  correct "see everything in my department" behavior for a district-wide maintenance role.
- `permLevel === 4` (lines 350-357 and 250-254): scopes purely by
  `officeLocationId ∈ getSupervisedLocationIds(userId)`, with **no department filter at all**.
  This is the "supervisor sees their assigned locations" pattern, correct for a location-bound
  supervisor but wrong for a Director who should see every Maintenance ticket district-wide.

Compounding this, `backend/src/services/locationSync.service.ts:66-71` gives Maintenance
Directors a `LocationSupervisor` row pointing at a synthetic "Maintenance Department" location
(not a real school/building), so `getSupervisedLocationIds()` returns an id that owns none of the
actual tickets — the level-4 location filter excludes nearly all real Maintenance tickets.

## 2. Problem Definition

Users in `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` should see **every** `department = 'MAINTENANCE'`
work order district-wide (list and direct access), the same class of visibility already given to
`ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID` — not a location-restricted subset.

Out of scope: `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` has the identical `permLevel = 4` shape and
likely the same bug for Technology tickets, but only the Maintenance Director group was reported
and is being fixed here.

## 3. Proposed Solution Architecture

Add a third `maintenanceRole` value, `'director'`, and give it department-wide, location-unrestricted
access at `permLevel === 4` — mirroring the existing `county_wide` treatment at `permLevel === 3`.

**`backend/src/utils/groupAuth.ts`** — add a helper alongside `isCountyWideMaintenance` /
`isSchoolMaintenanceWorker`:
```ts
export function isMaintenanceDirector(groups: string[]): boolean {
  const gid = process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID;
  return Boolean(gid && groups.includes(gid));
}
```

**`backend/src/controllers/work-orders.controller.ts:49-53`** — extend `getMaintenanceRole`:
```ts
function getMaintenanceRole(groups: string[]): 'county_wide' | 'school_only' | 'director' | undefined {
  if (isCountyWideMaintenance(groups)) return 'county_wide';
  if (isSchoolMaintenanceWorker(groups)) return 'school_only';
  if (isMaintenanceDirector(groups)) return 'director';
  return undefined;
}
```

**`backend/src/services/work-orders.service.ts`**:
- `type MaintenanceRole` (line 31): add `'director'`.
- `getWorkOrders()` baseWhere department forcing (lines 298-303): also force `department =
  'MAINTENANCE'` when `maintenanceRole === 'director'`.
- `getWorkOrders()` `permLevel === 4` branch (lines 350-357): skip the
  `getSupervisedLocationIds` location restriction when `maintenanceRole === 'director'`
  (department is already forced in `baseWhere`, mirroring the `county_wide` comment at line 326).
- `assertTicketAccess()` `permLevel === 4` branch (lines 250-254): when `maintenanceRole ===
  'director'`, grant access if `ticket.department === 'MAINTENANCE'`, else deny — mirroring the
  `county_wide` check at lines 227-231.

This changes nothing for non-director users, and changes nothing for Maintenance Directors
outside the `WORK_ORDERS` module.

## 4. Implementation Steps

1. `backend/src/utils/groupAuth.ts`: add `isMaintenanceDirector()`.
2. `backend/src/controllers/work-orders.controller.ts`: extend `getMaintenanceRole()` to detect
   `'director'`.
3. `backend/src/services/work-orders.service.ts`: extend `MaintenanceRole` type; handle
   `'director'` in `getWorkOrders()` (baseWhere + permLevel-4 scope) and in
   `assertTicketAccess()` (permLevel-4 branch).
4. `backend/src/__tests__/helpers/db.ts`: add an optional `department` override param to
   `createTestWorkOrder()` (currently hardcoded to `'TECHNOLOGY'`) so tests can create
   `MAINTENANCE` tickets. Default unchanged — existing callers unaffected.
5. Add regression test `backend/src/__tests__/workorders-maintenance-director-scope.test.ts`
   covering: director sees a MAINTENANCE ticket at an unsupervised location (list + direct GET),
   and director is denied direct access to a TECHNOLOGY ticket.
6. Verify: `docker compose -f docker-compose.dev.yml build backend`, then the Docker-based vitest
   run (`docker compose -f docker-compose.dev.yml --profile test run --rm backend-test`, as
   invoked by `scripts/preflight.ps1`).

## 5. Dependencies

None new — pure logic change reusing the existing `MaintenanceRole` / `assertTicketAccess` /
`getWorkOrders` scoping pattern already in the file.

## 6. Configuration Changes

None. `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` is already configured (confirmed present in the root
`.env`).

## 7. Risks and Mitigations

- **Risk:** A Director could also hold `county_wide` or `school_only` group membership
  simultaneously. **Mitigation:** `getMaintenanceRole()` checks in a fixed order
  (`county_wide` → `school_only` → `director`); no known real-world overlap, and all three
  outcomes grant at least department-scoped MAINTENANCE visibility, so overlap cannot reduce
  access.
- **Risk:** Widening a Director's access beyond intent. **Mitigation:** access is still hard
  bounded to `department === 'MAINTENANCE'` — a Director gains district-wide visibility of their
  own department only, never Technology tickets or other modules.

# Work Order: Move Departments Back Under Location, Programs-Only Dropdown — Spec

## Current State Analysis

- Both work-order pages currently split `OfficeLocation` rows into two separate pickers, per the prior `WORK_ORDER_SCHOOL_AND_DEPARTMENT_PROGRAM` feature:
  - `frontend/src/pages/NewWorkOrderPage.tsx:124-125` — `useLocations(['SCHOOL'])` for the "Location" select, `useLocations(['DEPARTMENT', 'PROGRAM'])` for the "Department/Program" select.
  - `frontend/src/pages/WorkOrderListPage.tsx:133-135` — same split, feeding both the desktop filter row (`WorkOrderListPage.tsx:556-586`) and the mobile filter drawer (`WorkOrderListPage.tsx:432-461`).
- `useLocations(types?: LocationType[])` (`frontend/src/hooks/queries/useLocations.ts`) and `locationService.getAllLocations(types?)` (`frontend/src/services/location.service.ts:26-31`) are fully generic — they pass whatever `LocationType[]` is given straight through as `?types=A,B`. The backend (`backend/src/controllers/location.controller.ts:16-25` → `location.service.ts` `findAll({ types })`) filters on an arbitrary string list with no restriction to specific combinations.
- **No backend change is required.** This is a frontend-only change of which `types` values are requested at two existing call sites, plus label text.
- Ticket storage is unaffected: `Ticket.departmentLocationId` still points at any `OfficeLocation` (`DEPARTMENT` or `PROGRAM` typed rows already saved stay exactly as they are); this change only affects which locations *populate the two pickers going forward*.
- `frontend/src/pages/WorkOrderDetailPage.tsx:490-496` only displays `workOrder.departmentLocation?.name` — no dropdown, no change needed.

## Problem Definition

User request: on both work order pages (create/edit form and list page filters), move `DEPARTMENT`-typed locations out of the "Department/Program" dropdown and into the "Location" dropdown, leaving only `PROGRAM`-typed locations in the second dropdown.

## Decisions (confirmed with user)

- The "Department/Program" dropdown label becomes **"Program"** (create/edit form `InputLabel`/`label`, list-page filter placeholder text) since it will only ever contain Program locations going forward.
- The "Location" dropdown's placeholder/helper text on the list page changes from **"All Schools"** to **"All Locations"**, since it will now contain both School and Department locations (matches the precedent already set by the prior feature's own spec, which called the "All Schools"-label-but-broader-data state a "mismatch").
- Scope is limited to `SCHOOL`/`DEPARTMENT`/`PROGRAM` exactly as named by the user ("departments" and "programs") — `DISTRICT_OFFICE`-typed locations are not mentioned and are left out of the Location picker, unchanged from current behavior.
- Backend, Prisma schema, `Ticket.departmentLocationId` field name, and URL filter param name (`departmentLocation`) are unchanged — purely a frontend data-source and label change.

## Proposed Solution

### `frontend/src/pages/NewWorkOrderPage.tsx`

- Line 124: `useLocations(['SCHOOL'])` → `useLocations(['SCHOOL', 'DEPARTMENT'])`
- Line 125: `useLocations(['DEPARTMENT', 'PROGRAM'])` → `useLocations(['PROGRAM'])`
- Line 406 comment: `{/* Department/Program (optional) */}` → `{/* Program (optional) */}`
- Line 408: `<InputLabel>Department/Program</InputLabel>` → `<InputLabel>Program</InputLabel>`
- Line 410: `label="Department/Program"` → `label="Program"`

### `frontend/src/pages/WorkOrderListPage.tsx`

- Line 133: `useLocations(['SCHOOL'])` → `useLocations(['SCHOOL', 'DEPARTMENT'])`
- Line 134 comment: update to reflect Location now includes Department locations
- Line 135: `useLocations(['DEPARTMENT', 'PROGRAM'])` → `useLocations(['PROGRAM'])`
- Mobile filter drawer (lines ~439, ~454): `All Schools` → `All Locations`; `All Departments/Programs` → `All Programs`
- Desktop filter row (lines ~563, ~579): same two text changes

No changes to `WorkOrderDetailPage.tsx`, backend routes/controllers/services/validators, Prisma schema, shared types, or `location.service.ts`/`useLocations.ts` (already fully generic).

## Implementation Steps

1. Update `NewWorkOrderPage.tsx` — location/program type filters + label text.
2. Update `WorkOrderListPage.tsx` — location/program type filters + placeholder text (desktop + mobile).
3. Verify build via `docker compose -f docker-compose.dev.yml build frontend` (backend untouched, but preflight runs both per script).

## Dependencies

None new — reuses existing `useLocations`/`locationService` generic type-filter plumbing already exercised elsewhere in this file. Exempt from external-doc verification per CLAUDE.md ("internal code changes with no new dependencies").

## Configuration Changes

None.

## Risks and Mitigations

- **Query key collisions**: none — `queryKeys.locations.list(types)` already parameterizes by the `types` array, so `['SCHOOL','DEPARTMENT']` and `['PROGRAM']` cache independently and don't collide with any other existing caller's `types` tuple.
- **Stale existing tickets**: tickets already tagged with a `DEPARTMENT`-typed `departmentLocation` keep displaying correctly on the detail page (it renders whatever `name` is stored) — no data migration needed.
- **Scope creep**: `DISTRICT_OFFICE` type intentionally left untouched — not mentioned in the request; keeps the change surgical.

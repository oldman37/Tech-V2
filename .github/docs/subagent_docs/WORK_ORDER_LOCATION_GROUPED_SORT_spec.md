# Work Order: Group Location Dropdown by Type, Remove "None" — Spec

## Current State Analysis

Follows directly from `WORK_ORDER_DEPARTMENT_TO_LOCATION_spec.md` (Department locations merged into the Location dropdown alongside Schools). Since that change, the Location dropdown mixes two `LocationType` values (`SCHOOL`, `DEPARTMENT`) in a single flat list:

- `frontend/src/pages/NewWorkOrderPage.tsx` Location `<Select>` (~lines 354-373): renders `locations.map(...)` with **no sort at all** (API return order), and includes a `<MenuItem value="">— None —</MenuItem>` placeholder.
- `frontend/src/pages/WorkOrderListPage.tsx` Location `<Select>`, both the mobile filter drawer (~lines 432-446) and the desktop filter row (~lines 556-570): each independently does `.filter((loc) => loc.isActive).sort((a, b) => a.name.localeCompare(b.name)).map(...)` — alphabetical only, not grouped by type. Each keeps its `<MenuItem value="">All Locations</MenuItem>` reset option (a filter's "no filter" state, not a data "None" value — explicitly kept per user decision below).

`OfficeLocationWithSupervisors` (`frontend/src/types/location.types.ts`) has a `type: LocationType` field available on every location object returned by `useLocations`, sufficient to group locally with no backend/API change.

## Problem Definition

1. The Location dropdown's contents (Schools + Departments) should be grouped — Schools first, then Departments — rather than interleaved alphabetically or left in raw API order.
2. The create/edit form's Location dropdown should no longer offer an explicit "— None —" choice.

## Decisions (confirmed with user)

- Grouped sort (Schools first, then Departments, alphabetical by name within each group) applies to **both** work order pages: the create/edit form's Location select, and the list page's Location filter (desktop + mobile).
- "None" removal applies **only** to the create/edit form's Location select (the only one with a literal "— None —" data-value entry). The list page's "All Locations" option is kept — it is the filter's reset/no-filter state, not a selectable data value, and removing it would prevent viewing work orders across all locations.
- No change to validation: `officeLocationId` remains client-side optional in `NewWorkOrderPage.tsx`'s `validate()` (unchanged — not requested).
- No change to the Program dropdown (`departmentLocations`) or its own "— None —" option — out of scope, Program remains optional per the prior feature's confirmed decision.

## Proposed Solution

### `frontend/src/pages/NewWorkOrderPage.tsx`

- Remove `<MenuItem value="">— None —</MenuItem>` from the Location `<Select>`.
- Change `{locations.map((loc) => (...))}` to sort first: Schools before Departments, then alphabetical by name:
  ```tsx
  {[...locations]
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'SCHOOL' ? -1 : 1))
    .map((loc) => (
      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
    ))}
  ```

### `frontend/src/pages/WorkOrderListPage.tsx`

- In both the mobile and desktop Location `<Select>` blocks, replace `.sort((a, b) => a.name.localeCompare(b.name))` with the same grouped comparator:
  ```tsx
  .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'SCHOOL' ? -1 : 1))
  ```
- `<MenuItem value="">All Locations</MenuItem>` is unchanged (kept in both blocks).

No changes to the Program dropdown in either file, no backend/schema/type changes.

## Implementation Steps

1. Update `NewWorkOrderPage.tsx` Location select — remove "None" MenuItem, add grouped sort.
2. Update `WorkOrderListPage.tsx` Location select — grouped sort in both mobile and desktop blocks.
3. Verify build via `docker compose -f docker-compose.dev.yml build frontend` (Phase 6 preflight covers full validation).

## Dependencies

None new — reuses the existing `type` field already present on every `OfficeLocationWithSupervisors` object returned by `useLocations`. Exempt from external-doc verification per CLAUDE.md ("internal code changes with no new dependencies").

## Configuration Changes

None.

## Risks and Mitigations

- **Location becomes effectively required without formal validation**: removing "None" doesn't add a required-field check to `validate()` (not requested); if no default location is pre-filled (`useUserDefaultLocation`), the Select simply renders blank with none of its `MenuItem`s matching the empty string — a valid, if unlabeled, MUI `Select` state, unchanged from today's behavior when "None" was explicitly selected. Not introducing new validation stays surgical to what was asked.
- **Type-grouping duplicated 3x** (create form, list-page desktop, list-page mobile): kept as inline duplication rather than extracted into a shared sort helper, consistent with the existing established pattern in `WorkOrderListPage.tsx` where the desktop/mobile filter blocks already duplicate identical filter/sort/map logic independently.

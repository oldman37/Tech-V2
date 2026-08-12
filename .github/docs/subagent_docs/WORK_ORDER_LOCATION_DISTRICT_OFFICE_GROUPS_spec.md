# Work Order: Add District Office, Group Location Dropdown with Headers + Dividers — Spec

## Current State Analysis

Follows `WORK_ORDER_DEPARTMENT_TO_LOCATION_spec.md` and `WORK_ORDER_LOCATION_GROUPED_SORT_spec.md`. Today the Location dropdown on both work order pages fetches `useLocations(['SCHOOL', 'DEPARTMENT'])` and renders a single flat list sorted Schools-before-Departments via a `.sort()` comparator (no visual grouping, no District Office).

**An established, working precedent for exactly the requested pattern already exists in this codebase**: `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` (lines ~271-284, ~758-784) groups a 4-type location list (`SCHOOL`, `DEPARTMENT`, `PROGRAM`, `DISTRICT_OFFICE`) into a single `Select` using MUI `ListSubheader` per group, each conditionally rendered only `if (group.length > 0)`. This is reused directly rather than inventing a new pattern.

- `LocationType` (`frontend/src/types/location.types.ts`) already includes `'DISTRICT_OFFICE'`; `LOCATION_TYPE_LABELS.DISTRICT_OFFICE === 'District Office'` (singular), matching the label text already shown to users in `RequisitionWizard.tsx`.
- Backend `types` filtering is fully generic (confirmed in prior specs) — adding `'DISTRICT_OFFICE'` to the `useLocations([...])` call requires no backend change.
- `@mui/material` `ListSubheader` requires no new dependency — already imported and used in `RequisitionWizard.tsx` with this exact `Select`-grouping usage today, satisfying the "already exercised elsewhere in the codebase" exemption from the Dependency & Documentation Policy.

## Problem Definition

1. `DISTRICT_OFFICE`-typed locations are currently excluded from the work-order Location dropdown entirely — they need to be selectable.
2. The dropdown should visually group its contents under section headers — "Schools", then "Departments", then "District Office" — each preceded by a divider line, rather than a flat sorted list.

## Decisions (confirmed with user, superseding the flat-sort decision in `WORK_ORDER_LOCATION_GROUPED_SORT_spec.md`)

- District Office is its own **third group**, listed after Departments (not folded into the Departments group) — user explicitly reversed an earlier "fold it in" answer back to "keep it separate."
- A divider line precedes each group boundary: before "Departments" and before "District Office" (each only rendered when that group is non-empty). No divider is needed above the first group ("Schools") — nothing precedes it in the menu (or, on the list-page filter, it directly follows the existing "All Locations" reset item, which is left exactly as-is).
- Group header labels: "Schools", "Departments", "District Office" — the third matches the exact existing label text already used in `RequisitionWizard.tsx`'s `ListSubheader` (singular "Office", consistent with `LOCATION_TYPE_LABELS.DISTRICT_OFFICE`).
- Applies to the same three Location select instances as the prior two specs: `NewWorkOrderPage.tsx`'s create/edit Location select, and `WorkOrderListPage.tsx`'s Location filter (desktop + mobile).
- The Program dropdown and its data source are unaffected — out of scope, unchanged.

## Proposed Solution

### `frontend/src/pages/NewWorkOrderPage.tsx`

- `useLocations(['SCHOOL', 'DEPARTMENT'])` → `useLocations(['SCHOOL', 'DEPARTMENT', 'DISTRICT_OFFICE'])`.
- Import `ListSubheader` from `@mui/material` (`Divider` already imported).
- Replace the single `[...locations].sort(...).map(...)` block with three grouped, sorted, alphabetized sub-lists computed once above the JSX return (mirrors `RequisitionWizard.tsx`'s `groupedLocations` pattern, without introducing `useMemo` — the array is small and the file's existing style computes derived lists inline/per-render already):
  ```tsx
  const schoolLocations = locations.filter((l) => l.type === 'SCHOOL').sort((a, b) => a.name.localeCompare(b.name));
  const departmentTypeLocations = locations.filter((l) => l.type === 'DEPARTMENT').sort((a, b) => a.name.localeCompare(b.name));
  const districtOfficeLocations = locations.filter((l) => l.type === 'DISTRICT_OFFICE').sort((a, b) => a.name.localeCompare(b.name));
  ```
  (Named distinctly from the existing `departmentLocations` variable, which already refers to the unrelated Program-list data source for the separate "Program" dropdown — not renamed, out of scope.)
- In the Location `<Select>`, render:
  ```tsx
  {schoolLocations.length > 0 && <ListSubheader>Schools</ListSubheader>}
  {schoolLocations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
  {departmentTypeLocations.length > 0 && <Divider />}
  {departmentTypeLocations.length > 0 && <ListSubheader>Departments</ListSubheader>}
  {departmentTypeLocations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
  {districtOfficeLocations.length > 0 && <Divider />}
  {districtOfficeLocations.length > 0 && <ListSubheader>District Office</ListSubheader>}
  {districtOfficeLocations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
  ```
  No "None" option (unchanged from the prior spec — still removed).

### `frontend/src/pages/WorkOrderListPage.tsx`

- `useLocations(['SCHOOL', 'DEPARTMENT'])` → `useLocations(['SCHOOL', 'DEPARTMENT', 'DISTRICT_OFFICE'])`.
- Import `Divider` and `ListSubheader` from `@mui/material` (neither currently imported in this file).
- Compute the same three grouped/sorted sub-lists once, near the existing `locations`/`departmentLocations` fetch — reused by both the desktop and mobile filter blocks (avoids duplicating the filter+sort logic twice, unlike the pre-existing mobile/desktop `MenuItem` JSX duplication, which is kept as-is per established file convention):
  ```tsx
  const schoolLocations = locations.filter((l) => l.type === 'SCHOOL' && l.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const departmentTypeLocations = locations.filter((l) => l.type === 'DEPARTMENT' && l.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const districtOfficeLocations = locations.filter((l) => l.type === 'DISTRICT_OFFICE' && l.isActive).sort((a, b) => a.name.localeCompare(b.name));
  ```
  (`isActive` filter preserved from the existing code, which already filtered on it before sorting.)
- In both the mobile filter drawer's and the desktop filter row's Location `<Select>`, replace the single `.filter().sort().map()` chain with the same three-group render block shown above, keeping the existing `<MenuItem value="">All Locations</MenuItem>` unconditionally first (unchanged).

No backend, schema, shared-types, or Program-dropdown changes.

## Implementation Steps

1. `NewWorkOrderPage.tsx` — add `DISTRICT_OFFICE` to the fetch, add `ListSubheader` import, replace the Location select's item rendering with the three-group/divider structure.
2. `WorkOrderListPage.tsx` — add `DISTRICT_OFFICE` to the fetch, add `Divider`/`ListSubheader` imports, compute the three grouped lists once, replace both (mobile + desktop) Location select item-rendering blocks.
3. Verify build via `docker compose -f docker-compose.dev.yml build frontend` (Phase 6 preflight covers full validation, including backend, unaffected).

## Dependencies

None new. `ListSubheader` is already imported and used for this exact purpose in `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` — satisfies the CLAUDE.md exemption ("dependencies already exercised elsewhere in the codebase — copy the existing in-repo pattern"). No external-doc verification required.

## Configuration Changes

None.

## Risks and Mitigations

- **MUI `Select` + `ListSubheader` keyboard navigation**: MUI's own docs note `ListSubheader` items inside a `Select` menu are non-interactive but can still receive keyboard focus unless handled; `RequisitionWizard.tsx` already ships this exact pattern in production without additional workarounds, so no extra handling is added here — consistent with the working precedent.
- **Naming collision avoided**: the new `departmentTypeLocations` variable is deliberately not named `departmentLocations` (already taken by the unrelated Program-list data source in both files) to prevent confusion between "Department-typed locations" (a Location-dropdown group) and "Program locations" (the separate Program dropdown's data).
- **Group order stability**: group membership is now determined structurally (three separate arrays + fixed JSX order) rather than by sort comparator, eliminating the earlier flat-sort's undefined-order edge case between non-`SCHOOL` types (now moot — full revert of that comparator, replaced by grouping).

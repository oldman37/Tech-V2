# List Filter URL State — Rollout to Remaining List Pages

Follows `LIST_FILTER_URL_STATE_spec.md`, which introduced `useFilterParams` and converted
`WorkOrderListPage`. This spec applies the same pattern to the remaining filtered list pages.

## Current State Analysis

`frontend/src/hooks/useFilterParams.ts` exists and is proven on `WorkOrderListPage`. Every other
filtered list page still holds filter state in `useState` and therefore loses the user's view on
Back.

## Problem Definition

Identical to the work-orders bug, in every remaining section: filter a list, open a record, press
Back, land on a reset list.

## Scope — 15 pages

| # | Page | Params (`key`: default) | Quirks |
|---|---|---|---|
| 1 | `DeviceManagement/RepairTicketsPage` | `status`:'', `search`:'', `page`:'0', `rows`:'25' | — |
| 2 | `FieldTrip/FieldTripListPage` | `search`:'', `status`:'', `page`:'0', `rows`:'25' | — |
| 3 | `TransportationRequests/TransportationRequestsPage` | `status`:'', `from`:'', `to`:'', `search`:'', `page`:'0', `rows`:'25' | — |
| 4 | `PurchaseOrders/PurchaseOrderList` | `tab`:dynamic, `status`:'', `search`:'', `from`:'', `to`:'', `fiscalYear`:'', `workflow`:'', `page`:'0', `rows`:'25' | `tab` default depends on `permLevel >= 3` |
| 5 | `DeviceManagement/InvoicesPage` | `status`:'', `overdue`:'0', `search`:'', `page`:'0', `rows`:'25' | boolean |
| 6 | `incidents/IncidentsPage` | `search`:'', `page`:'0', `rows`:'25' | already uses `useSearchParams` for prefill redirect — different keys, no conflict |
| 7 | `Transportation/TransportationUnitsPage` | `search`:'', `type`:'', `fuel`:'', `activeOnly`:'1', `page`:'0', `rows`:'25' | boolean defaulting **true** |
| 8 | `DeviceManagement/CheckedOutCartsPage` | `status`:'', `location`:'', `search`:'', `page`:'0', `rows`:'25' | debounced search |
| 9 | `Users` | `search`:'', `accountType`:'all', `location`:'', `grade`:'', `page`:'1', `rows`:'50' | debounced search; **1-based** page |
| 10 | `InventoryAuditHistoryPage` | `location`:'', `page`:'1' | 1-based page |
| 11 | `Transportation/MyFuelHistoryPage` | `unit`:'', `station`:'', `month`:'', `from`:'', `to`:'', `page`:'0', `rows`:'25' | — |
| 12 | `RoomAssignments/RoomAssignmentsPage` | `location`:'', `search`:'', `type`:'', `building`:'', `page`:'1' | 1-based page |
| 13 | `Transportation/DotPhysicalsPage` | `tab`:'all', `page`:'0', `rows`:'25' | tab only |
| 14 | `Transportation/DriverLicensePage` | `tab`:'all', `page`:'0', `rows`:'25' | tab only |
| 15 | `UnresolvedInventoryPage` | `location`:'' | single filter |

**Out of scope** — transient UI state, which the user should not return into: dialog/drawer open
flags (`filterDrawerOpen`, `dialogOpen`, `createOpen`), form drafts (`form`, `formData`), selection
targets (`returnTarget`, `selectedUser`), error/loading flags, and sync panel state.

## Proposed Solution Architecture

Per page: replace filter `useState`s with one `useFilterParams` call, derive typed locals, and
convert setters to `setFilters({ ..., page: <first> })`. No hook changes required.

### Conventions

- **Booleans** → `'1'` / `'0'`; derive with `=== '1'`. Default is the string form of the existing
  default, so the default state stays out of the URL.
- **Page** → keep each page's existing base (0- or 1-based) in the derived local; the default string
  matches (`'0'` or `'1'`). Filter changes reset to the page's own first-page value.
- **Dynamic defaults** (`PurchaseOrderList.tab`) → pass the computed default into `useFilterParams`,
  exactly as `WorkOrderListPage` does for `department`.

### Debounced search (pages 8, 9)

The URL holds the immediate search text; the debounced value stays local state and continues to
drive the query, preserving current fetch behavior.

Critical: the existing debounce effects call `setPage(first)` on every run, **including mount**.
Once page is restored from the URL, an unguarded effect would reset it and defeat the fix. Each
debounce effect therefore initializes its local debounced value from the URL and skips its
page-reset on the first run via a ref guard.

## Implementation Steps

1. Convert pages 1–3 (simple) → verify: `tsc`.
2. Convert pages 4–7 (dynamic default, booleans) → verify: `tsc`.
3. Convert pages 8–9 (debounced, page-reset guard) → verify: `tsc`; confirm mount does not reset page.
4. Convert pages 10–15 (1-based pages, tabs, single filter) → verify: `tsc`.
5. Preflight → verify: `scripts/preflight.ps1` exit code 0.

## Dependencies

None added. Uses the existing in-repo hook; no new external API surface.

## Configuration Changes

None. Frontend-only. No API, Prisma schema, or migration changes. The same filter values already
reach the backend as query params; putting them in the URL changes nothing about what is sent and
widens no authorization surface — all list endpoints keep their existing server-side scoping.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Debounce effect resets page on mount, defeating restore | Ref guard skips first run; debounced local seeded from URL |
| Boolean default `true` (`activeOnly`) inverted | `'1'`/`'0'` with default `'1'`; derived `=== '1'` |
| 1-based vs 0-based page confusion | Default string matches each page's existing base; no base changes |
| A filter setter missed, leaving dead `useState` | `tsc` `noUnusedLocals` fails on the orphaned setter |
| Large diff across 15 files | Batched by quirk class, preflight gates the whole set |
| Client-side-only filters (IncidentsPage search) behave differently | Behavior unchanged — only the value's storage location moves |

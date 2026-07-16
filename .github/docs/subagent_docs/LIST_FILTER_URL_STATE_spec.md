# List Filter URL State — Specification

## Current State Analysis

`WorkOrderListPage.tsx:64-73` holds every filter in `useState`:

```ts
const [search, setSearch] = useState('');
const [department, setDepartment] = useState<WorkOrderDepartment | ''>(
  user?.permLevels?.defaultWorkOrderDepartment ?? ''
);
const [statusBucket, setStatusBucket] = useState<'open' | 'closed'>('open');
const [priority, setPriority] = useState<WorkOrderPriority | ''>('');
const [locationFilter, setLocationFilter] = useState<string>('');
const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');
const [page, setPage] = useState(0);
const [rowsPerPage, setRowsPerPage] = useState(25);
```

`/work-orders` is therefore a single history entry carrying no record of what the user was viewing.
No list page in the app puts filters in the URL (survey: only `Login`, `RoomManagement`,
`ReferenceDataManagement`, `IncidentsPage`, `NewWorkOrderPage` use `useSearchParams`, none for list
filters).

## Problem Definition

Reported: viewing **closed maintenance** work orders, opening a ticket, and pressing Back returns to
**open technology** tickets.

`navigate(-1)` correctly returns to `/work-orders`; the component then remounts and every filter
re-initializes to its default (`statusBucket` → `'open'`, `department` → the user's default
department). The back button is not at fault — the list page never recorded its state.

This also means a filtered view cannot be refreshed, linked, or bookmarked.

## Proposed Solution Architecture

Move filter state into the URL query string. `/work-orders?status=closed&department=MAINTENANCE`
becomes a real history entry, so Back restores the exact view. A fresh visit from the sidebar has no
params and correctly shows defaults.

### 1. New shared hook — `frontend/src/hooks/useFilterParams.ts`

```ts
export function useFilterParams<T extends Record<string, string>>(defaults: T):
  readonly [T, (patch: Partial<T>) => void, (key: keyof T & string) => boolean]
```

Design decisions:

- **Single object, patch setter.** One `setSearchParams` call per interaction. Separate per-key
  hooks would fire two updates for the common "change filter *and* reset page" case and risk one
  clobbering the other.
- **`replace: true`.** Filter changes replace the current history entry rather than pushing.
  Otherwise adjusting five filters buries the previous page under five Back presses. The entry's URL
  still holds the latest filters, so Back from a detail page restores them.
- **Omit values equal to their default** to keep URLs short.
- **Keep an explicit empty string.** When the default is non-empty (department defaults to the
  user's `defaultWorkOrderDepartment`), `?department=` must stay in the URL, or "All Departments"
  would silently revert to the user's default. `searchParams.get()` returns `''` (not `null`), which
  `?? default` correctly preserves.
- **`hasParam` accessor** so the Technology Assistant default-location effect can tell "user has not
  chosen" from "user chose All Schools" / "restored from history".
- **Stable setter identity** via a ref for `defaults` (the caller passes an object literal, new
  identity each render), so the setter is safe in effect dependency arrays.
- **Strings only.** URL params are strings; `page`/`rows` are converted at the call site rather than
  hiding coercion in the hook.

### 2. `WorkOrderListPage.tsx`

Replace the eight filter `useState`s with one `useFilterParams` call. `filterDrawerOpen` stays
`useState` — it is transient UI, not a view the user should return to.

Param names (short, user-visible): `search`, `department`, `status`, `priority`, `location`,
`fiscalYear`, `page`, `rows`.

Preserve existing behavior:
- `department` default remains `user?.permLevels?.defaultWorkOrderDepartment ?? ''`.
- The TA auto-location effect (`:98-108`) keeps its `defaultLocationApplied` ref guard and gains a
  `hasParam('location')` guard so it never overwrites an explicit or restored choice.
- `activeFiscalYear = fiscalYearFilter || settingsData?.currentFiscalYear || ''` unchanged.
- Every filter change continues to reset page to 0.

## Implementation Steps

1. Create `useFilterParams.ts` → verify: frontend `tsc` passes.
2. Rewrite `WorkOrderListPage` filter state → verify: no `useState` remains for filters.
3. Guard the TA location effect with `hasParam` → verify: explicit choice not overwritten.
4. Preflight → verify: `scripts/preflight.ps1` exit code 0.

## Dependencies

None added. `useSearchParams` is core `react-router-dom` ^7.12.0, already used in-repo
(`IncidentsPage`, `RoomManagement`). The functional-updater form of `setSearchParams` is supported
in v6.4+ and v7.

## Configuration Changes

None. Frontend-only; no API, Prisma schema, or migration changes. Filter values already travel to
the backend as query params via the existing `WorkOrderQuery`; putting them in the URL does not
change what is sent or widen any authorization surface.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Every keystroke in search rewrites the URL | `replace: true` — no history entries created; matches existing undebounced behavior |
| `?department=` empty-string handling regresses "All Departments" | Explicit empty is written, not deleted; only exact-default values are omitted |
| TA default location overwrites a restored filter | `hasParam('location')` guard plus existing ref guard |
| Unstable setter identity causes an effect loop | `defaults` held in a ref; setter depends only on `setSearchParams` |
| Stale/hand-edited param values (`?page=abc`) | `Number(...) || fallback` at call site; backend already validates its own query input via Zod |

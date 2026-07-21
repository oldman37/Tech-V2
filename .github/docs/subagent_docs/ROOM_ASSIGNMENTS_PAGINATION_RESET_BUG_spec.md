# Spec: Fix Pagination Reverting to Page 1 on Room Assignments

## Current State Analysis

Reported symptom: on the Room Assignments page, clicking a pagination control briefly shows the
new page, then snaps back without actually navigating.

Root cause is in `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` (pre-existing code,
not touched by the two most recent changes to this file):

```ts
const locationChangeMounted = useRef(false);
useEffect(() => {
  if (!locationChangeMounted.current) {
    locationChangeMounted.current = true;
    return;
  }
  setFilters({ search: '', type: '', building: '', page: '1' });
}, [selectedLocationId, setFilters]);
```

The intent is "reset filters only when the user switches location, not on mount." But the effect's
dependency array includes `setFilters`, and `setFilters` is **not referentially stable** —
`frontend/src/hooks/useFilterParams.ts:34-50` defines it as
`useCallback(..., [setSearchParams])`, and React Router's `useSearchParams()` (`react-router-dom`
v7) recreates its `setSearchParams` function every time the URL's query string changes, because
internally it's memoized against the current `searchParams` object, which itself is recomputed from
`location.search`. In other words: **every** `setFilters(...)` call anywhere on the page — including
the Pagination component's `onChange={(_, p) => setFilters({ page: String(p) })}` — produces a new
`setFilters` identity on the next render.

Once `locationChangeMounted.current` is `true` (after the very first render), this effect no longer
checks whether `selectedLocationId` actually changed — it fires and unconditionally resets
`search`/`type`/`building`/`page` back to their defaults on *any* re-render where `setFilters`'s
identity differs from last time. Sequence when a user clicks "page 2":

1. `Pagination.onChange` → `setFilters({ page: '2' })` → URL becomes `...&page=2`.
2. Re-render: `location.search` changed → React Router recomputes `searchParams` → `setSearchParams`
   (and therefore `setFilters`) gets a new identity.
3. The reset effect's dependency array sees `setFilters` differ from last render → effect re-runs.
4. `locationChangeMounted.current` is already `true` (set on mount) → the guard does nothing → the
   effect unconditionally calls `setFilters({ search: '', type: '', building: '', page: '1' })`,
   even though `selectedLocationId` never changed.
5. This removes the `page` param again (since `'1'` is the default and gets deleted, per
   `useFilterParams`'s `setValues`), landing back on page 1 — the "flash then revert" the user sees.

This is a latent bug wherever a "mounted-ref, then unconditionally reset" effect depends on
`setFilters` without also checking whether the value it cares about actually changed (e.g. a very
similar pattern exists in `frontend/src/pages/Users.tsx:82-93`, gated on `searchTerm` instead of
`selectedLocationId` — out of scope for this fix, noted for awareness only, not being touched).

## Problem Definition

Pagination (and, more generally, any filter change) on Room Assignments immediately resets back to
page 1 with cleared search/type/building filters, because the location-change-reset effect
misfires on every filter update, not just on an actual location change.

## Proposed Solution

Replace the "fire once via a mounted boolean, then always reset" guard with a guard that compares
the *previous actual value* of `selectedLocationId` (stored in a ref, updated every time the effect
runs) against the current value. This makes the effect correct regardless of whether `setFilters`
is referentially stable, since the reset only happens when the location truly changed:

```ts
const previousLocationIdRef = useRef(selectedLocationId);
useEffect(() => {
  if (previousLocationIdRef.current === selectedLocationId) return;
  previousLocationIdRef.current = selectedLocationId;
  setFilters({ search: '', type: '', building: '', page: '1' });
}, [selectedLocationId, setFilters]);
```

On mount, the ref is initialized to the current `selectedLocationId`, so the first effect run always
sees a match and skips the reset (identical behavior to today for the initial render / Back
navigation restore case). On every subsequent run — whether triggered by a genuine location change or
by `setFilters` churning identity from an unrelated filter/page update — the effect only resets when
the ref's stored value actually differs from the current one, and always re-syncs the ref.

## Implementation Steps

1. `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` — replace `locationChangeMounted`
   (`useRef(false)` + unconditional reset after first run) with `previousLocationIdRef`
   (`useRef(selectedLocationId)` + value-comparison guard), as shown above. No other logic in the
   file changes.

## Files to be Modified

- `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx`

## Risks and Mitigations

- **Risk:** Regressing the "don't reset on mount / Back-navigation restore" behavior.
  **Mitigation:** Initializing the ref to `selectedLocationId` at declaration time reproduces the
  exact same "first run is a no-op" behavior as the old boolean guard.
- **Risk:** Missing a genuine location change if the effect batches unexpectedly.
  **Mitigation:** The ref is compared against the actual current `selectedLocationId` value on every
  effect invocation, not just once — any real change is still caught on the very next run.

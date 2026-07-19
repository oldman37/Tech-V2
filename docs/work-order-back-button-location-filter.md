# Fix: Work Orders "All Schools" filter reverts to home school on Back

## Bug

On the Work Orders list, non-admin users default to their assigned "home
school" location filter. If a user switches the filter to "All Schools",
opens a work order from a *different* school, and then presses Back, the
filter silently reverts to their home school instead of staying on "All
Schools."

## Root cause

`frontend/src/hooks/useFilterParams.ts` stores list filters in the URL query
string and **omits** a param from the URL whenever the value being set equals
that filter's declared default (`setValues`, ~line 41):

```js
if (value === defaultsRef.current[key]) next.delete(key);
else next.set(key, value);
```

In `frontend/src/pages/WorkOrderListPage.tsx`, the `location` filter's default
is `''`, and `''` is *also* the value used by the "All Schools" `<MenuItem>`.
So picking "All Schools" calls `setFilters({ location: '' })`, which matches
the default and gets **deleted** from the URL instead of persisted — making
"user explicitly picked All Schools" indistinguishable from "no location
filter has been resolved yet."

A separate effect auto-applies the user's home school as the location default
the first time the page mounts with no explicit `location` param
(guarded by `hasFilterParam('location')`). Because `/work-orders` and
`/work-orders/:id` are separate routes, navigating list → detail → Back fully
unmounts and remounts `WorkOrderListPage`. On remount, `hasFilterParam('location')`
is `false` (the param was stripped when "All Schools" was chosen), so the
effect fires again and silently overrides "All Schools" back to the home
school.

## Fix

File: `frontend/src/pages/WorkOrderListPage.tsx`

The shared `useFilterParams` hook was **not** modified — it's used by ~15
other list pages and its omit-default-from-URL behavior is correct for them.
The conflict (empty string double-booked as both "unset" and "explicitly All
Schools") is local to this one page, so the fix is confined to it: a second
URL-tracked flag, `locationChosen`, whose only legal non-default value (`'1'`)
never equals its own default (`''`), so it always survives the omit-on-default
check regardless of what the user picks for `location`.

```diff
   const [filters, setFilters, hasFilterParam] = useFilterParams({
     search: '',
     department: user?.permLevels?.defaultWorkOrderDepartment ?? '',
     status: 'open',
     priority: '',
     location: '',
+    // Tracks whether the user has explicitly picked a location (including
+    // "All Schools", which is the same empty string as the unset default) so
+    // Back navigation can tell that apart from "home-school default not yet
+    // applied" — see effect below.
+    locationChosen: '',
     fiscalYear: '',
     page: '0',
     rows: '25',
   });
```

```diff
   useEffect(() => {
     if (isAdmin) return;
     // An explicit location in the URL — chosen by the user, or restored by Back —
-    // outranks this default. `has` covers "All Schools", which is an empty value.
-    if (hasFilterParam('location')) return;
+    // outranks this default. `locationChosen` covers "All Schools", whose value
+    // ('') is otherwise indistinguishable from "not yet defaulted".
+    if (hasFilterParam('location') || hasFilterParam('locationChosen')) return;
     if (supervisedLocations.length > 0 && !defaultLocationApplied.current) {
```

Both location `<Select onChange>` handlers (mobile drawer and desktop filter
bar) now also set `locationChosen: '1'` whenever the user manually changes
the location filter:

```diff
-                  onChange={(e) => { setFilters({ location: e.target.value, page: '0' }); }}
+                  onChange={(e) => { setFilters({ location: e.target.value, locationChosen: '1', page: '0' }); }}
```

And the "Clear Filters" button also resets `locationChosen: ''`, so clearing
filters returns to the original "no explicit choice yet" state and the
home-school default can reassert itself on the next fresh visit:

```diff
                     setFilters({
                       search: '',
                       department: '',
                       status: 'open',
                       priority: '',
                       location: '',
+                      locationChosen: '',
                       fiscalYear: '',
                       page: '0',
                     });
```

**Scope / blast radius:** all four changes are in `WorkOrderListPage.tsx`
only. `useFilterParams.ts` (shared by ~15 other pages) is untouched, so no
other filtered list page is affected. Admin behavior is unchanged — the
effect's `if (isAdmin) return;` guard precedes any use of the new flag.

## Verification performed

- `docker compose -f docker-compose.dev.yml build frontend` — pass (`tsc && vite build`)
- `docker compose -f docker-compose.dev.yml build backend` — pass (unaffected, cached)
- Independent code review pass: traced fresh-visit, explicit-All-Schools-then-Back,
  explicit-other-school-then-Back, Clear-Filters-then-remount, admin, and
  zero-supervised-location scenarios — all resolve to the expected filter state.
  No regressions found in the shared hook or other consumers.

---

## Prompt to recreate this fix on upstream

Give an agent working in the upstream repo (no access to this conversation)
the prompt below verbatim:

```
In this repo's frontend, the Work Orders list page has a back-navigation bug:
non-admin users default to a "home school" location filter. If a user
switches the filter to "All Schools", opens a work order from a different
school, and presses Back, the filter silently reverts to their home school
instead of staying on "All Schools".

Find the Work Orders list page component (something like
WorkOrderListPage.tsx) and the shared hook it uses to keep filter state in
the URL query string (something like useFilterParams). That hook likely omits
a filter's URL param whenever the value being set equals that filter's
declared default, to keep URLs clean for filters like page number or status.

Root cause: the location filter's declared default is an empty string (''),
and '' is ALSO the value used by the "All Schools" option in the location
dropdown. So picking "All Schools" sets the filter to the same value as its
own default, and the shared hook deletes the param from the URL instead of
persisting it — making "user explicitly picked All Schools" indistinguishable
from "no location filter has been resolved yet". Separately, there's likely
an effect that auto-applies the user's assigned home-school location as the
default the first time the list page mounts with no explicit location param
in the URL. Because the list page and the work-order detail page are on
separate routes, Back navigation fully unmounts and remounts the list page.
On remount, since the "All Schools" choice was never actually persisted in
the URL, that auto-default effect fires again and silently overrides "All
Schools" back to the home school.

Do NOT modify the shared useFilterParams-style hook — it's likely used by
many other list pages in this repo, and its default-omission behavior is
correct for them. The fix should be fully confined to the Work Orders list
page component.

Fix: add a second URL-tracked filter flag, e.g. `locationChosen`, defaulting
to '' with its only legal non-default value being a non-empty sentinel like
'1'. Because '1' never equals '', this flag always survives the hook's
omit-on-default check regardless of what the user picks for `location`.

1. Add `locationChosen: ''` alongside the existing `location: ''` in the
   filters hook's defaults object.
2. In the home-school auto-default effect, change its skip condition to also
   check this new flag — it should skip (not override the current location)
   if EITHER the location param is present OR the locationChosen param is
   present. (The first covers the case where the effect itself already wrote
   a real, non-empty school id in a previous mount; the second now covers the
   case where the user explicitly chose "All Schools".)
3. In every place the location filter's onChange handler updates the filter
   state, also set `locationChosen: '1'` in the same update.
4. In any "Clear Filters" / reset-all-filters handler, also reset
   `locationChosen: ''` back to its default, so a full reset restores the
   original "no explicit choice yet" behavior on the next fresh visit.

Keep the change confined to the Work Orders list page file. Do not touch the
shared filter-params hook. Verify with a frontend build (tsc + production
bundler build) and confirm no other filtered list page in the repo was
touched.
```

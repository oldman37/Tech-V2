# Spec: Fix Checked-Out Carts search input + widen search matching

## Current state analysis (verified against this repo)

### Bug 1 — frontend double `setFilters` per keystroke
`frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx`:
- `useFilterParams` (`frontend/src/hooks/useFilterParams.ts`) wraps React
  Router v7.12's `useSearchParams`, updating via the functional-updater form:
  `setSearchParams((prev) => { ...build next from prev... }, { replace: true })`.
- `handleSearchChange` (line 407) calls `setFilters({ search: val })` alone.
- The `TextField`'s `onChange` (line 501, pre-fix) calls
  `handleSearchChange(e.target.value)` **and then** `setFilters({ page: '0' })`
  — two separate `setFilters` invocations synchronously in one handler.
- Confirmed via the working sibling page,
  `frontend/src/pages/DeviceManagement/CheckoutPage.tsx` (line 94-98): its
  `handleSearchChange` folds both fields into **one** call —
  `setFilters({ search: val, page: '0' })` — and its `TextField.onChange`
  (line 376) calls only `handleSearchChange(e.target.value)`, nothing else.
  This is the proven-correct pattern already in the codebase; Checked-Out
  Carts just never got it.
- Root cause: two `setFilters` calls in the same synchronous handler each
  invoke React Router's functional updater independently; the second call's
  `prev` does not reliably observe the first call's not-yet-committed result
  within the same tick, so the second call's rebuilt `URLSearchParams`
  overwrites the `search` key change made by the first. Net effect: the
  input's controlled `value` (sourced from the URL) reverts every keystroke.

### Bug 2 — backend search scope too narrow
`backend/src/services/deviceCart.service.ts`, `listCarts()` (line 136+):
```ts
if (search) {
  where.OR = [
    { tagNumber: { contains: search, mode: 'insensitive' } },
    { name:      { contains: search, mode: 'insensitive' } },
  ];
}
```
Confirmed via `backend/prisma/schema.prisma`:
- `DeviceCart.tagNumber` — the cart's own tag (matched already).
- `DeviceCart.name` — optional free-text label (matched already).
- `DeviceCart.assignedToUserId` / `assignedToUser` — **legacy FK**, explicitly
  commented `DEPRECATED: kept for backward compat — use DeviceCartUser join
  table instead` (schema.prisma:1896), still present and still populated for
  older carts. Not matched by `search`.
- `DeviceCart.users` → `DeviceCartUser` join table (schema.prisma:1955) — the
  **current** assignment mechanism, with a `role` column (`"primary"` /
  `"secondary"`) but no distinction needed for search (both should match,
  since the UI's "Assigned To" column already displays both roles together).
  Not matched by `search`.
- `DeviceCartItem.equipment.assetTag` — the asset tag of a device once it's
  inside a cart (`equipment.assetTag`, `@unique`, `@@index([assetTag])`
  confirmed at schema.prisma:49/105). Not matched by `search`.
- A separate `userSearch` query param already exists (line 163-175 of
  `deviceCart.service.ts`) matching `users.some.user.OR[firstName,lastName,
  email]` — confirmed via grep that no frontend caller for this page sends
  `userSearch`; the page only ever sends `search`. This param is a distinct,
  already-used capability elsewhere and must not be touched.
- All relations to be added are indexed: `Equipment.assetTag` (`@@index`),
  `DeviceCartItem.cartId`/`equipmentId` (`@@index` each), `DeviceCart.
  assignedToUserId` (`@@index`), `DeviceCartUser.cartId`/`userId` (`@@index`
  each). No new index needed.

## Problem definition
1. Typing into the Checked-Out Carts search box never sticks — the field
   appears to reject all input.
2. Once fixed, search still misses two things a user would reasonably expect
   it to match: the asset tag of a device stored inside a cart, and the name
   of the person/people a cart is checked out to.

## Proposed solution

### Frontend (`CheckedOutCartsPage.tsx`)
Fold both filter updates into the single `handleSearchChange` call, matching
the already-proven `CheckoutPage.tsx` pattern exactly:
```diff
   const handleSearchChange = useCallback((val: string) => {
-    setFilters({ search: val });
+    setFilters({ search: val, page: '0' });
     if (debounceRef.current) clearTimeout(debounceRef.current);
     debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
   }, [setFilters]);
```
```diff
-            onChange={(e) => { handleSearchChange(e.target.value); setFilters({ page: '0' }); }}
+            onChange={(e) => handleSearchChange(e.target.value)}
```
No other filter control on this page (Status select, Location autocomplete)
makes more than one `setFilters` call per change — confirmed by reading their
handlers — so no other change needed there.

### Backend (`deviceCart.service.ts` — `listCarts`)
Widen the `search` OR-clause to also match:
1. `items.some.equipment.assetTag` (nested relation, not the cart's own tag).
2. `assignedToUser.firstName` / `assignedToUser.lastName` (legacy FK path).
3. `users.some.user.firstName` / `lastName` (current join-table path,
   unfiltered by `role` so both primary and secondary co-assignees match).
4. A paired "first last" match when `search` contains whitespace: split on
   the first token vs. the remainder, AND-match `firstName`/`lastName` as a
   pair, applied to both the legacy FK and the join-table path — so a full
   name typed as one string matches split columns. Only added when a
   remainder exists after the first token.

Keep the existing `tagNumber` and `name` matches unchanged — additive only.
Do not touch the separate `userSearch` parameter/where-block.

## Dependencies
None new — reuses Prisma nested-relation `some`/`contains`/`mode:
'insensitive'` patterns already used elsewhere in this file (`userSearch`
block) and file (Prisma 7, already verified elsewhere in this codebase).

## Configuration changes
None. No schema change, no migration — every touched relation/column already
exists and is already indexed.

## Risks and mitigations
- **Risk:** widening search regresses existing tag/name matches.
  **Mitigation:** additive-only OR array; existing two entries untouched.
- **Risk:** status/location filters stop composing with search via AND.
  **Mitigation:** only `where.OR` is modified; `where.status`/`where.
  locationId` remain separate top-level `AND`-ed conditions, unchanged.
- **Risk:** performance regression from added joins. **Mitigation:** all
  joined columns are indexed (confirmed above); this mirrors the existing
  `userSearch` pattern already proven at this scale in the same service.

## Build validation commands (Phase 3/6)
- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- Full `scripts/preflight.ps1` (uses an isolated `db-test` container per the
  script — never the persistent dev database).

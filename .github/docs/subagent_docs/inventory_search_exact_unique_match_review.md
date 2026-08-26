# Review: Inventory exact unique-match search

## Files reviewed
- `backend/src/services/inventory.service.ts` — `InventoryService.findAll`

## Findings
- **Spec compliance**: trim -> indexed `count` on `assetTag`/`barcode` exact
  case-insensitive -> constrain to the two exact conditions on a hit, else the original
  fuzzy list. Implemented exactly as specified.
- **Fallback preserved verbatim**: all 13 `contains` conditions are byte-identical to the
  originals (re-indented only). `serialNumber` correctly stays in the fuzzy list and is
  correctly absent from the exact list — it is not `@unique` in the schema.
- **Filter composition untouched**: `where.OR` is the only key assigned; location, office
  location, room, category, status, isDisposed, brand, vendor, model, funding source, price
  and date range filters are all still set as separate top-level keys and ANDed by Prisma
  as before. Sorting and pagination unchanged.
- **Scope**: `InventoryService.search` (line ~312, the New Work Order typeahead) left
  untouched, per spec — it was not what was reported.
- **API currency**: `equals` + `mode: 'insensitive'` is the correct Prisma 7 string filter,
  the same API family as the surrounding `contains` clauses already in this file.
- **Performance**: one additional `count` per search, against two `@unique` columns that
  also carry explicit `@@index` entries — an index lookup, and it frequently replaces the
  much heavier 13-condition scan.
- **Security**: no auth, CSRF, or response-shape change; narrows results only.

## Build & test validation
- `docker compose -f docker-compose.dev.yml build backend` -> **EXIT=0**,
  `grep -c "error TS"` = 0, `Image tech-v2-backend Built`.
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test`
  -> **EXIT=0**, **Test Files 9 passed (9) / Tests 67 passed (67)**. `db-test` torn down.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS

## Accepted behaviour change
An exact tag belonging to an item excluded by another active filter (e.g. a disposed item
while `isDisposed: false`) now yields an empty result rather than coincidental fuzzy
matches. That is the intended reading of the design principle.

## Not independently verified
Live confirmation that searching `60048` returns only that item, and that a name/PO-number
search still returns multiple. No browser automation available; there is no automated test
covering inventory list search.

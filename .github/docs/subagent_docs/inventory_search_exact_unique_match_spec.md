# Spec: Inventory search shows unrelated items alongside an exact asset tag match

## Current state analysis
`backend/src/services/inventory.service.ts` — `InventoryService.findAll` (line 60), the
query backing `GET /api/inventory` and the Inventory Management list page. When `search` is
supplied it builds one flat `where.OR` of 13 `contains`/case-insensitive conditions
(lines ~89-105): assetTag, name, serialNumber, description, notes, poNumber, barcode,
brand name, model name, model number, vendor name, assigned-user displayName and email.
Every field is treated identically, so a term matching any field in whole or part surfaces
the row.

Schema check — `model equipment` in `backend/prisma/schema.prisma`:
- `assetTag  String  @unique` (also `@@index([assetTag])`)
- `barcode   String? @unique` (also `@@index([barcode])`)
- `serialNumber String?` — **not** unique; duplicates/blanks are permitted, so it is
  deliberately excluded from exact-match priority.

`InventoryService.search` (line 312) is a separate, narrower typeahead used by the New Work
Order equipment autocomplete. Out of scope — not what was reported.

## Problem definition
Searching a complete, exact asset tag (e.g. `60048`) also returns unrelated items whose
`poNumber` happens to contain the same digits. Surfaced by the work order asset-tag link
fix, which navigates straight into this search box.

## User-confirmed design principle
An asset tag is unique to a single item — if the full tag is searched for, nothing else
should show. If a value that legitimately has many matches is searched (an item name, a
user with several assigned items, a PO number shared by a batch), showing all matches is
correct.

## Proposed solution architecture
When `search` is supplied:
1. Trim the term.
2. Run one fast indexed `count` for an exact, case-insensitive match on `assetTag` OR
   `barcode` — the only two `@unique` fields.
3. If an exact match exists, constrain `where.OR` to just those two exact conditions.
4. Otherwise fall back to the original 13-condition fuzzy `OR`, unchanged.

All other filters (location, office location, room, category, status, isDisposed, brand,
vendor, model, funding source, price and date ranges), sorting, and pagination are untouched
and still compose with `where.OR` exactly as before.

## Implementation steps
1. Replace the `if (search)` block with the trim -> count -> branch structure. -> verify:
   the fallback branch's 13 conditions are byte-identical to the originals.
2. Backend image build. -> verify: exits 0.
3. Backend test suite. -> verify: 67/67 still pass.

## Dependencies
None. Prisma 7 `equals` with `mode: 'insensitive'` is the same string-filter API already
used by the surrounding `contains` clauses.

## Configuration changes
None. No schema change, no migration.

## Risks and mitigations
- Risk: an extra query per search. Mitigation: `count` against two `@unique`, `@@index`-ed
  columns — an index lookup, negligible next to the existing 13-condition fuzzy scan it
  frequently replaces.
- Risk: partial-tag browsing regressing. Mitigation: the exact branch only triggers on a
  full exact match; typing `600` finds no exact match and takes the unchanged fuzzy path.
- **Accepted behaviour change:** if a searched exact tag belongs to an item excluded by
  another active filter (e.g. a disposed item while `isDisposed: false`), the result is now
  empty rather than a list of coincidental fuzzy matches. This is the intended reading —
  that item is genuinely not in the list being viewed.

# Review: Inventory form write-in Brand / Model / Vendor

## Files reviewed
Created:
- `frontend/src/utils/nameMatching.ts` — `normalizeName`, `levenshtein`, `findNameMatch`
- `frontend/src/components/inventory/CreatableAutocomplete.tsx`
- `frontend/src/components/inventory/ConfirmSimilarNameDialog.tsx`
- `frontend/src/components/inventory/VendorRequestDialog.tsx`

Modified:
- `frontend/src/components/inventory/InventoryFormDialog.tsx`
- `backend/src/controllers/referenceData.controller.ts`

`frontend/src/services/referenceDataService.ts` was listed as conditional in the spec; its
existing `create` signatures were sufficient, so it was **not** touched.

## Findings
- **Root cause correctly diagnosed against the installed version**: `@mui/material ^7.3.8`,
  where `clearOnBlur` defaults to `!freeSolo`. Verified in `frontend/package.json:21`.
- **The freeSolo trap is closed, not walked into**: `freeSolo` is explicitly `false` on
  `CreatableAutocomplete`, creation runs only through the synthetic `+ Add "X"` entry, and a
  raw `string` from `onChange` is ignored outright.
- **Three-layer duplicate guard, all present**:
  1. `filterOptions` stringifies on the normalized name and **suppresses the Add entry**
     when a normalized-exact match exists.
  2. `findNameMatch` returns exact -> select silently; near (Levenshtein <= 2, typed name
     >= 4 chars) -> `ConfirmSimilarNameDialog`; else create.
  3. `createBrand` / `createModel` / `createVendor` each do a case-insensitive `findFirst`
     (models scoped by `brandId`, matching `@@unique([name, brandId])`) and return 409
     carrying `existing: { id, name }`.
- **The 409 is actually consumed**: `readConflictRecord` recovers the colliding record and
  selects it silently when known, or reports "may be deactivated" when it is not in the
  loaded list — so a race never surfaces as a bare failure.
- **Case-sensitivity reasoning verified in schema**, not assumed: `brands.name @unique`,
  `vendors.name @unique`, `models @@unique([name, brandId])` — all case-sensitive in
  Postgres, which is exactly why the index alone cannot stop `Dell`/`dell`.
- **Permission model checked against route definitions, not assumed**: `POST /inventory` and
  `PUT /inventory/:id` are `requireModule('TECHNOLOGY', 2)`; `POST /brands`, `/vendors`,
  `/equipment-models` are also `TECHNOLOGY 2`. **No approval queue added.** The vendor
  dialog posts to plain `POST /vendors`, deliberately **not** `/vendors/request-new`, which
  is `requireModule('REQUISITIONS', 2)` and would 403 a technology-only user — the comment
  in `handleVendorDialogSubmit` records why.
- **Uncommitted-text guard**: `validatePendingText()` runs before `validate()` in
  `handleSubmit`, blocking with `Press Add "<text>" to create it, or clear the field.` and
  clearing per-field the moment the user edits (`handlePendingText`), not at next submit.
- **Scope discipline**: Type/Funds/Room stay non-creatable but now say where to add an entry
  instead of a dead "no options found". `RequisitionWizard.tsx` not refactored. The existing
  `brandId` -> clear `modelId` behaviour untouched. No new dependency — Levenshtein is a
  ~20-line single-row DP with an early exit.
- **No orphans**: `frontend/tsconfig.json` sets `noUnusedLocals` and `noUnusedParameters`,
  and the build passes — so no unused imports or variables were left behind. `Autocomplete`
  is still imported and used by the three non-creatable fields.
- **Security**: no route, permission, or CSRF change. The new 409 body exposes only an
  `{ id, name }` the caller is already authorized to list.

## Build & test validation
`powershell -File scripts/preflight.ps1` -> **EXIT=0**
- 1/3 backend image build (shared tsc -> prisma generate -> backend tsc): pass
- 2/3 frontend image build (tsc -> vite build): pass
- 3/3 backend integration tests: **Test Files 9 passed (9) / Tests 67 passed (67)**
- `All preflight checks passed.`

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

## Known, accepted gaps
- **Existing duplicates are not cleaned up.** Any `Dell`/`dell` pairs already in the tables
  stay; this only stops new ones. Merging them is separate Reference Data work.
- **Row caps could themselves cause the duplicates this fix prevents.** The form loads
  brands/categories/models at `limit: 500` and the backend query validator caps `limit` at
  `max(500)`; vendors are capped at 5000. If the models or brands table passes 500 rows, real
  records silently stop appearing in the picker — and a user who can't find an existing
  model is exactly the user who writes in a duplicate. **Flagged to the user, not raised.**
- **Deactivated records** can't be selected and can't be recreated; the user is told the
  record exists and may be deactivated rather than shown a bare failure.

## Not independently verified
A live browser click-through: typing a new model, choosing `+ Add`, seeing the near-match
prompt, and saving the item. Build and test validation confirms compilation and
type-correctness, not the end-to-end interaction. There are no frontend tests in this repo.

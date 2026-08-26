# Spec: Inventory form silently erases write-in Brand / Model / Vendor values

## Problem as reported
"Most of the fields in the inventory form have dropdown menus, but if the info you need to
enter does not appear in that menu they don't seem to accept a write-in option. I tried to
add a Model that was not listed in the dropdown menu and it kept erasing it when I moved to
the next."

Constraint attached to the request, which shapes the whole design: "We don't need to allow
everything to be entered. A brand or model etc may be in the dropdown already but the user
may misspell it, and we don't want multiple entries for the same thing one correct the
other misspelled."

## Current state analysis
`frontend/src/components/inventory/InventoryFormDialog.tsx` renders Type/Category (line 470),
Brand (492), Model (522), Funds (593), Vendor (611) and Room (654) as MUI `Autocomplete`
components **without** `freeSolo`. Installed MUI is `@mui/material ^7.3.8`
(`frontend/package.json:21`).

Per the MUI v7 Autocomplete API, `clearOnBlur` defaults to `!freeSolo` — i.e. **`true`** for
a plain Autocomplete. On blur with no option selected, MUI clears the input text by design.
So the typed value was never *rejected*; it was reverted. Documented behaviour, not a misuse
of the component — these fields were simply built as pure pickers.

### The trap on the other side of the fix
Turning on `freeSolo` alone makes things worse. Under `freeSolo`, `clearOnBlur` flips to
`false`, so typed text **stays visible** after blur — but it is still **not committed**
unless the user actively selects something. The user would see their text in the box, press
Create, and the item would save with no model attached and no warning. That converts "text
disappears" into "text appears saved but silently isn't". The uncommitted-text guard below
exists specifically to close this.

### Permission finding that removed a whole layer of machinery
- `backend/src/routes/inventory.routes.ts:153-158, 166-172` — `POST /inventory` and
  `PUT /inventory/:id` require `requireModule('TECHNOLOGY', 2)`.
- `backend/src/routes/referenceData.routes.ts:27, 36, 56` — `POST /brands`,
  `POST /vendors`, `POST /equipment-models` **also** require `requireModule('TECHNOLOGY', 2)`.

**Every user who can reach this form can already create reference data** via the Reference
Data admin page, so no approval/pending queue is warranted.

The existing `POST /vendors/request-new` flow (`referenceData.routes.ts:42`) is gated on
`requireModule('REQUISITIONS', 2)` — a **different** population — and exists to serve users
who lack technology rights. Calling it from this form would 403 a technology-only user.
The inventory vendor dialog therefore posts to plain `POST /vendors`.

### Unique-index case sensitivity — verified in schema
`brands.name @unique`, `vendors.name @unique`, `models @@unique([name, brandId])`. Postgres
unique indexes are **case-sensitive**, so `Dell` and `dell` would both insert today. The
index alone cannot prevent the duplication the user is worried about.

## Proposed solution architecture

### Scope — deliberately partial
| Field | Change |
|---|---|
| Brand | Creatable — `+ Add "X"` entry, inline create (name only) |
| Model | Creatable — `+ Add "X"`, inline create, scoped to the selected Brand |
| Vendor | Creatable — `+ Add "X"` opens a structured dialog (name, contact, email, phone, address) |
| Type (Category) | **No write-in** — `noOptionsText` now points at Reference Data |
| Funds | **No write-in** — `noOptionsText` now points at Reference Data |
| School / Room | **No write-in** — `noOptionsText` now points at Room Management |

Categories drive reporting and fragmenting them costs more than a duplicate brand does.
Funding sources and locations carry budget and facilities meaning. Those stay
administratively owned — but they no longer fail silently; they say where to go.

### Creation is deliberate, never incidental
Typing alone never creates a record. The dropdown gains a final synthetic entry
`+ Add "<typed text>"`, and creation happens only when that entry is chosen. A raw `string`
arriving from `onChange` (the user typed and pressed Enter without picking anything) is
ignored outright.

### Three-layer duplicate guard
**Layer 1 — normalized matching while typing.** `filterOptions` matches on a normalized name
(lowercased, punctuation stripped, whitespace collapsed). Typing `delll` still surfaces
`Dell`. Typing `dell` surfaces `Dell` and **suppresses the Add entry entirely**, because an
exact normalized match already exists. Most misspellings never reach creation — the cheapest
and most effective of the three layers.

**Layer 2 — near-match confirmation.** On choosing `+ Add "X"`:
- normalized-exact match exists -> select the existing record, create nothing
- near match (Levenshtein <= 2 on normalized strings, typed name >= 4 chars) ->
  `ConfirmSimilarNameDialog`: "Did you mean Dell?" with `[Use Dell]` / `[Create "Delll" anyway]`
- otherwise -> create directly

The >= 4 character floor exists so short names (`HP`, `Bus`) don't trip the dialog constantly.

**Layer 3 — server-side normalized pre-check.** `createBrand`, `createModel` and
`createVendor` do a case-insensitive `findFirst` (scoped by `brandId` for models) before
inserting. On a hit they return 409 **carrying the record that collided**, so the client can
select it instead of surfacing an error. This closes the two holes the client cannot: a race
between two users, and the case-sensitive Postgres unique index noted above.
`handleControllerError` already maps Prisma `P2002` to a 409, but it cannot say *which*
record collided — which is the part the client needs to recover silently.

### Uncommitted-text guard
The form tracks pending input text per creatable field. At submit, if a creatable field holds
non-empty text that doesn't match the selected record, submission is blocked with a
field-level error: `Press Add "<text>" to create it, or clear the field.` The error clears as
soon as the user edits the text, rather than sitting stale until the next submit attempt.

## Implementation steps
1. `frontend/src/utils/nameMatching.ts` (new) — `normalizeName`, `levenshtein` (single-row DP
   with early exit, ~15 lines, no new dependency), `findNameMatch`.
   -> verify: pure functions, no imports.
2. `frontend/src/components/inventory/CreatableAutocomplete.tsx` (new) — generic over
   `{ id: string; name: string }`, serving all three call sites. Justified as a shared
   component only because it has three call sites.
3. `frontend/src/components/inventory/ConfirmSimilarNameDialog.tsx` (new).
4. `frontend/src/components/inventory/VendorRequestDialog.tsx` (new) — name plus contact
   details, pre-filled with what was typed.
5. `InventoryFormDialog.tsx` — swap Brand/Model/Vendor to `CreatableAutocomplete`; update
   `noOptionsText` on Type/Funds/Room; add the pending-text state and submit guard.
6. `backend/src/controllers/referenceData.controller.ts` — normalized pre-check + 409 with
   `existing` on `createBrand`, `createModel`, `createVendor`.
7. Backend + frontend image builds and the backend test suite. -> verify: all exit 0.

## Dependencies
None new. Levenshtein is implemented inline rather than adding a package.
`frontend/src/services/referenceDataService.ts` already exposes `create` for brands
(line 81), vendors (112) and models (176) with sufficient signatures — not modified.

## Configuration changes
**None.** No Prisma schema change, no migration, no env var, no MSAL or Graph scope change.
No route or permission change anywhere.

## Risks and mitigations
- Risk: `freeSolo` alone silently discarding typed text. Mitigation: the uncommitted-text
  submit guard.
- Risk: raw strings from `onChange` creating records accidentally. Mitigation: ignored
  outright; only the synthetic Add entry creates.
- Risk: case-only duplicates slipping past the client. Mitigation: the server-side
  normalized pre-check (layer 3).
- Risk: a 409 surfacing as a bare error. Mitigation: the 409 body carries `existing.id` and
  `existing.name` so the client selects that record silently.

## Deliberately not changed
- `RequisitionWizard.tsx` is **not** refactored to share the new vendor dialog — out of
  scope, and it would widen the diff for no user-visible gain.
- The existing behaviour clearing `modelId` when `brandId` changes
  (`InventoryFormDialog.tsx:291`) is untouched.
- The row caps on the option queries are left as-is (see gap below).

## Known, accepted gaps
- **Existing duplicates are not cleaned up.** Any `Dell` / `dell` pairs already in the tables
  stay. This only stops new ones. Merging historical duplicates is separate work in
  Reference Data Management.
- **Row caps could themselves cause the duplicates this fix prevents.** The form requests
  brands/categories/models at `limit: 500` (`InventoryFormDialog.tsx:248-251`) and the
  backend query validator caps `limit` at `max(500)` (`referenceData.validators.ts:18`);
  vendors are capped at 5000 (`GetVendorsQuerySchema`, line 49). If the models or brands
  table exceeds 500 rows, real records silently stop appearing in the picker — and a user who
  can't find an existing model is exactly the user who will write in a duplicate. **Flagged,
  not raised**, since raising it is a separate judgement call for the user.
- **Deactivated records.** If a brand/model/vendor exists but is deactivated, the picker
  won't list it and the server rejects the create. The user is told plainly that it exists
  and may be deactivated, rather than shown a bare failure.

# Remove Department References — Research & Specification

**Document:** `docs/SubAgent/remove_dept_refs_spec.md`  
**Date:** 2026-03-13  
**Status:** Phase 1 Complete — Ready for Implementation  
**Search scope:** All `.ts`, `.tsx`, `.json`, `.prisma`, `.sql`, `.md`, `.env`, `.csv`, `.js`, `.jsx` files under `c:\Tech-V2`

---

## 1. Executive Summary

Three "department module" identifiers appear across the codebase:

| Term | Variants found | Current status in DB/backend |
|------|---------------|------------------------------|
| `PROFESSIONAL_DEV` | `PROFESSIONAL_DEV`, `Professional Development`, `Professional Dev` | **Not seeded / not in DB** — dead code only |
| `SPECIAL_ED` | `SPECIAL_ED`, `Special Ed`, `Special Education` | **Two separate meanings**: (1) Room type stored in DB, (2) Permission module — dead code |
| `TRANSCRIPTS` | `TRANSCRIPTS`, `Transcripts`, `Transcript` | **Not seeded / not in DB** — dead code only |

**Key finding:** The permission-module uses of `PROFESSIONAL_DEV`, `SPECIAL_ED`, and `TRANSCRIPTS` are all **dead code**. The current `seed.ts` only seeds `TECHNOLOGY`, `MAINTENANCE`, and `REQUISITIONS`. The `PermissionModule` types in `permissions.ts` (backend) and `roles.types.ts` / `shared/src/types.ts` (frontend/shared) only expose those three modules. `PERMISSION_MODULES` in `roles.types.ts` drives the actual form submission loop — the extra fields in ManageRoles.tsx are never sent to the API.

`SPECIAL_ED` **as a room type** is live and functional — rooms with type `SPECIAL_ED` may exist in the database.

---

## 2. Complete Match Inventory

### 2.1 PROFESSIONAL_DEV

#### Active source code (requires changes)

| # | File | Line(s) | Exact text | Usage context |
|---|------|---------|------------|---------------|
| P1 | `frontend/src/pages/ManageRoles.tsx` | 67 | `PROFESSIONAL_DEV: z.string(),` | Zod form schema field — declared but never submitted (dead field) |
| P2 | `frontend/src/pages/ManageRoles.tsx` | 83 | `PROFESSIONAL_DEV: String(map.PROFESSIONAL_DEV ?? 0),` | `buildFormDefaults()` default value — dead code |

#### Documentation / spec files (informational only — no action needed)

| File | Line(s) | Context |
|------|---------|---------|
| `docs/MASTER_PLAN.md` | 187, 209, 433, 476, 519, 629, 640 | Planning notes — out-of-scope module references |
| `docs/SubAgent/manage_roles_review.md` | 121, 123, 317 | Historical review doc |
| `docs/SubAgent/manage_roles_spec.md` | 152, 205, 365, 686, 748, 759, 784, 785, 1070, 1085, 1530, 1549, 1560, 1591, 1605, 1609, 1621, 1628, 1632, 1823, 1827 | Historical spec — was planned but not implemented |
| `docs/SubAgent/permissions_doc_review.md` | 113 | Historical permissions review |
| `docs/SubAgent/permissions_doc_review_final.md` | 71 | Historical permissions review final |
| `docs/SubAgent/permissions_doc_spec.md` | 147, 183, 211, 212, 929 | Historical permissions spec |
| `docs/SubAgent/remove_legacy_permissions_review.md` | 103, 104, 106, 108, 118, 176, 191, 243 | Legacy permissions cleanup review |
| `docs/SubAgent/remove_legacy_permissions_review_final.md` | 86, 91, 95, 96, 97 | Legacy permissions cleanup final |
| `docs/SubAgent/remove_legacy_permissions_spec.md` | 17, 232, 276, 286, 296, 318, 326, 333, 357, 365, 413 | Legacy permissions cleanup spec |
| `docs/SubAgent/role-module-access-spec.md` | 138, 151, 153, 183, 476, 516, 566 | Role-module access spec |
| `docs/SubAgent/role-module-access-spec_review.md` | 25, 183 | Role-module access review |
| `docs/Inventory.csv` | 6213 | Data row: department name field `Professional Development` — inventory import data (not code) |

---

### 2.2 SPECIAL_ED

#### Active source code — **room type** (LIVE DATA — handle with care)

| # | File | Line(s) | Exact text | Usage context |
|---|------|---------|------------|---------------|
| S1 | `frontend/src/types/room.types.ts` | 20 | `\| 'SPECIAL_ED'` | `RoomType` TypeScript union — type definition |
| S2 | `frontend/src/components/RoomFormModal.tsx` | 28 | `'SPECIAL_ED',` | `ROOM_TYPES` constant array — drives form dropdown |
| S3 | `frontend/src/pages/RoomManagement.tsx` | 188 | `SPECIAL_ED: 'badge-success',` | Badge colour map for room type display |
| S4 | `frontend/src/pages/RoomManagement.tsx` | 316 | `<option value="SPECIAL_ED">Special Ed</option>` | Filter dropdown for room type |
| S5 | `frontend/src/pages/ReferenceDataManagement.tsx` | 1084 | `<option value="SPECIAL_ED">Special Ed</option>` | Room type dropdown in reference data page |
| S6 | `backend/scripts/import-rooms.ts` | 45 | `'SPECIAL_ED': ['special ed', 'sped', 'resource', 'speech', 'chapter'],` | Keyword → RoomType mapping used when importing rooms from CSV |

#### Important note on backend validator divergence
`backend/src/validators/room.validators.ts` defines `RoomType` as a Zod enum **without** `SPECIAL_ED` (it includes `CONFERENCE_ROOM`, `STORAGE`, `RESTROOM`, `HALLWAY`, etc. instead). The backend Room model stores `type` as `String?` (no DB-level enum constraint). This means:
- Rooms already imported with type `SPECIAL_ED` exist in the DB (type stored as a plain string)
- The Zod validator at the API layer does **not** currently accept `SPECIAL_ED` — API calls to create/update a room with `type: 'SPECIAL_ED'` via the REST API will **fail validation**
- The frontend bypasses this by not re-submitting the type on every edit (the Zod schema on the backend only validates the field when it's explicitly provided)

#### Active source code — **permission module** (DEAD CODE)

| # | File | Line(s) | Exact text | Usage context |
|---|------|---------|------------|---------------|
| S7 | `frontend/src/pages/ManageRoles.tsx` | 68 | `SPECIAL_ED: z.string(),` | Zod form schema field — dead code |
| S8 | `frontend/src/pages/ManageRoles.tsx` | 84 | `SPECIAL_ED: String(map.SPECIAL_ED ?? 0),` | `buildFormDefaults()` default value — dead code |

#### Documentation / spec files (informational only)

| File | Line(s) | Context |
|------|---------|---------|
| `docs/MASTER_PLAN.md` | 433 | Seed data status row (historical) |
| `docs/SubAgent/manage_roles_spec.md` | 208, 366, 749, 760, 787, 788, 1071, 1086, 1605, 1610, 1622, 1824, 1827 | Historical spec |
| `docs/SubAgent/manage_roles_review.md` | 123 | Historical review |
| `docs/SubAgent/permissions_doc_review.md` | 114 | Historical |
| `docs/SubAgent/permissions_doc_review_final.md` | 72 | Historical |
| `docs/SubAgent/permissions_doc_spec.md` | 148, 183, 214, 215, 256 | Historical spec |
| `docs/SubAgent/inventory_room_styling_consistency_spec.md` | 733, 924 | Historical styling spec |
| `docs/SubAgent/reference_data_locations_rooms_merge_spec.md` | 542 | Historical rooms merge spec |
| `docs/SubAgent/remove_legacy_permissions_review.md` | 103, 104, 106, 119, 176, 191, 243 | Legacy cleanup review |
| `docs/SubAgent/remove_legacy_permissions_review_final.md` | 87, 95, 96, 97 | Legacy cleanup final |
| `docs/SubAgent/remove_legacy_permissions_spec.md` | 17, 233, 277, 287, 331, 414 | Legacy cleanup spec |
| `docs/SubAgent/role-module-access-spec.md` | 139, 476, 516, 566 | Role-module access spec |
| `docs/SubAgent/role-module-access-spec_review.md` | 183, 205, 207 | Role-module access review |
| `docs/room.csv` | 230, 231, 233, 379 | Room data CSV — department/room name field (data, not code) |
| `docs/Inventory.csv` | 510, 532, 667, 1514, 1515, 2393, 2401, 2581, 4334, 4335, 5263, 5368, 5442, 5579, 5624, 5625, 5651, 5652, 5692, 5693, 5750, 5756, 5762, 5763, 5784–5788, 5795, 5809, 5810, 6171, 6172, 6299, 6995, 6996, 7223, 8841–8843, 8895 | Inventory CSV — department/location name fields (data, not code) |

---

### 2.3 TRANSCRIPTS

#### Active source code (requires changes)

| # | File | Line(s) | Exact text | Usage context |
|---|------|---------|------------|---------------|
| T1 | `frontend/src/pages/ManageRoles.tsx` | 69 | `TRANSCRIPTS: z.string(),` | Zod form schema field — dead code |
| T2 | `frontend/src/pages/ManageRoles.tsx` | 85 | `TRANSCRIPTS: String(map.TRANSCRIPTS ?? 0),` | `buildFormDefaults()` default value — dead code |

#### Documentation / spec files (informational only)

| File | Line(s) | Context |
|------|---------|---------|
| `docs/MASTER_PLAN.md` | 433 | Historical seed status |
| `docs/SubAgent/manage_roles_spec.md` | 211, 367, 750, 761, 790, 791, 1072, 1087, 1623, 1825, 1827 | Historical spec |
| `docs/SubAgent/manage_roles_review.md` | 123 | Historical review |
| `docs/SubAgent/permissions_doc_review.md` | 115 | Historical |
| `docs/SubAgent/permissions_doc_review_final.md` | 73 | Historical |
| `docs/SubAgent/permissions_doc_spec.md` | 149, 183, 217, 218, 256, 931 | Historical spec |
| `docs/SubAgent/remove_legacy_permissions_review.md` | 103, 104, 106, 120, 176, 191, 201, 243 | Legacy cleanup review |
| `docs/SubAgent/remove_legacy_permissions_review_final.md` | 88, 95, 96, 97 | Legacy cleanup final |
| `docs/SubAgent/remove_legacy_permissions_spec.md` | 17, 234, 278, 288, 415 | Legacy cleanup spec |
| `docs/SubAgent/role-module-access-spec.md` | 140, 476, 516, 566, 572 | Role-module access spec |
| `docs/SubAgent/role-module-access-spec_review.md` | 183, 205, 207 | Role-module access review |

---

## 3. Current System Architecture — What Is Live vs. Dead

### 3.1 Permission modules (PROFESSIONAL_DEV, SPECIAL_ED as permission, TRANSCRIPTS)

```
Live permission modules (in DB):          Dead permission modules (not in DB):
  TECHNOLOGY    (3 levels)                  PROFESSIONAL_DEV  ← never seeded
  MAINTENANCE   (3 levels)                  SPECIAL_ED        ← never seeded
  REQUISITIONS  (6 levels, 3 deactivated)   TRANSCRIPTS       ← never seeded
```

**Evidence:**
- `backend/prisma/seed.ts` seeds only 3 sets: `techPermissions`, `maintPermissions`, `reqPermissions`. No PROFESSIONAL_DEV/SPECIAL_ED/TRANSCRIPTS.
- `backend/src/middleware/permissions.ts` `PermissionModule` type: `'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS'` only.
- `shared/src/types.ts` `PermissionModule` type: `'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS'` only.
- `frontend/src/types/roles.types.ts` `PERMISSION_MODULES` array: `['TECHNOLOGY', 'MAINTENANCE', 'REQUISITIONS']` only.
- In `ManageRoles.tsx` `onSubmit`: iterates `PERMISSION_MODULES.map(...)` — only 3 modules. Extra Zod fields are validated but never passed to API payload.
- No migration SQL inserts rows for these three modules.

**Conclusion:** All three permission-module references in `ManageRoles.tsx` are leftover from an earlier spec that was never fully implemented. They are silent dead code — they add noise to the Zod schema but have zero runtime effect.

### 3.2 SPECIAL_ED as a room type (LIVE)

```
Room.type field in Prisma:  String?   (no enum constraint — any string accepted)

Frontend type union:  RoomType = 'CLASSROOM' | 'OFFICE' | ... | 'SPECIAL_ED' | ...
Backend Zod enum:     z.enum(['CLASSROOM', 'OFFICE', 'CONFERENCE_ROOM', 'LAB', ...])
                      ← does NOT include SPECIAL_ED (divergence!)
```

Rooms with `type = 'SPECIAL_ED'` **already exist in the database** (imported via `import-rooms.ts`). The backend validator does not reject it on read operations, only potentially on write.

---

## 4. Safe Removal / Replacement Strategy

### Strategy A — Remove PROFESSIONAL_DEV, SPECIAL_ED (as permission), and TRANSCRIPTS from ManageRoles.tsx

**Risk: Low** — these fields are purely cosmetic dead code.

**Changes required:**

#### File 1: `frontend/src/pages/ManageRoles.tsx`
- Remove 3 lines from `profileFormSchema` Zod object:
  ```diff
  - PROFESSIONAL_DEV: z.string(),
  - SPECIAL_ED: z.string(),
  - TRANSCRIPTS: z.string(),
  ```
- Remove 3 lines from `buildFormDefaults()`:
  ```diff
  - PROFESSIONAL_DEV: String(map.PROFESSIONAL_DEV ?? 0),
  - SPECIAL_ED: String(map.SPECIAL_ED ?? 0),
  - TRANSCRIPTS: String(map.TRANSCRIPTS ?? 0),
  ```

No other active source file needs changes for these permission-module references.

**Type safety check:** `ProfileFormValues` is inferred from `profileFormSchema`. After removing those fields, `values[mod]` in `onSubmit` (which iterates `PERMISSION_MODULES`) still works because `PERMISSION_MODULES` only contains `TECHNOLOGY`, `MAINTENANCE`, `REQUISITIONS`. TypeScript will correctly narrow the key access.

---

### Strategy B — Handle SPECIAL_ED as a room type

Three sub-options depending on business decision:

#### Option B-1 (Keep `SPECIAL_ED` room type — Recommended)
Keep the room type `SPECIAL_ED` everywhere it is currently used — it represents a real room category ("Special Education" rooms). Only removes it from `ManageRoles.tsx` permission fields (Strategy A above). No changes to room-related files.

**Rationale:** Rooms with type `SPECIAL_ED` exist in the database. Removing the type from the frontend would orphan existing data. The room type and the permission module are **different concerns** with the **same string value** — only the permission-module usage is dead code.

#### Option B-2 (Rename room type `SPECIAL_ED` → `SPED` or `SPECIAL_EDUCATION`)
If the goal is to avoid the abbreviation, rename consistently across:
1. `frontend/src/types/room.types.ts` line 20
2. `frontend/src/components/RoomFormModal.tsx` line 28
3. `frontend/src/pages/RoomManagement.tsx` lines 188, 316
4. `frontend/src/pages/ReferenceDataManagement.tsx` line 1084
5. `backend/scripts/import-rooms.ts` line 45

**Also requires:** A database migration to `UPDATE rooms SET type = 'SPED' WHERE type = 'SPECIAL_ED'` (or whatever new value is chosen).

#### Option B-3 (Remove `SPECIAL_ED` room type entirely — Destructive)
Would require migrating existing DB rooms to `GENERAL` or another type. **Not recommended** without a business decision to eliminate special education room designation.

---

## 5. Database Migration Needs

### 5.1 Permission modules (PROFESSIONAL_DEV, SPECIAL_ED as permission, TRANSCRIPTS)
**No database migration needed.** These modules were never seeded into the current database (the current `seed.ts` does not include them). Only frontend dead code needs to be removed.

> **Caveat:** If the database was ever seeded with an older version of `seed.ts` that included these modules (as indicated by earlier documentation), orphaned `permissions` table rows may exist with `module = 'PROFESSIONAL_DEV'`, `module = 'SPECIAL_ED'`, or `module = 'TRANSCRIPTS'`. This should be verified with:
> ```sql
> SELECT module, level, name, "isActive" FROM permissions 
> WHERE module IN ('PROFESSIONAL_DEV', 'SPECIAL_ED', 'TRANSCRIPTS');
> ```
> If rows are found, a cleanup migration is needed:
> ```sql
> -- Deactivate orphaned permission module rows
> UPDATE permissions SET "isActive" = false
> WHERE module IN ('PROFESSIONAL_DEV', 'SPECIAL_ED', 'TRANSCRIPTS');
> -- Cascade: any UserPermission rows pointing to these will also need removal
> DELETE FROM user_permissions
> WHERE "permissionId" IN (
>   SELECT id FROM permissions 
>   WHERE module IN ('PROFESSIONAL_DEV', 'SPECIAL_ED', 'TRANSCRIPTS')
> );
> ```

### 5.2 SPECIAL_ED room type
**No migration needed if keeping room type as-is (Option B-1).** If renaming (Option B-2), a migration is required:
```sql
UPDATE rooms SET type = '<new_value>' WHERE type = 'SPECIAL_ED';
```

---

## 6. Order of Operations (Safe Removal)

### For permission-module dead code removal (PROFESSIONAL_DEV, SPECIAL_ED as perm, TRANSCRIPTS):

```
Step 1 — Verify DB state (no migration needed if these modules never existed)
  └── Run SQL query: SELECT * FROM permissions WHERE module IN (
        'PROFESSIONAL_DEV', 'SPECIAL_ED', 'TRANSCRIPTS');
  └── If rows found: run cleanup SQL first (see §5.1)

Step 2 — Frontend dead code removal (no deploy risk)
  └── Edit: frontend/src/pages/ManageRoles.tsx
        • Remove PROFESSIONAL_DEV, SPECIAL_ED, TRANSCRIPTS from Zod schema
        • Remove PROFESSIONAL_DEV, SPECIAL_ED, TRANSCRIPTS from buildFormDefaults()

Step 3 — Build and type-check
  └── cd frontend && npx tsc --noEmit
  └── Verify no TypeScript errors introduced

Step 4 — Test ManageRoles page manually
  └── Create a new role profile — confirm 3 modules still work
  └── Edit an existing profile — confirm form renders correctly
```

### For SPECIAL_ED room type (if renaming — Option B-2 only):

```
Step 1 — Backend validator alignment
  └── Add 'SPECIAL_ED' to room.validators.ts RoomType enum (or new name)
  └── Ensure frontend and backend enums are in sync

Step 2 — Frontend type and UI updates (all 5 files listed in Option B-2)

Step 3 — Database migration
  └── Write and run Prisma migration:
        UPDATE rooms SET type = '<new_value>' WHERE type = 'SPECIAL_ED';

Step 4 — Update import-rooms.ts script mapping

Step 5 — Test room CRUD and import pipeline
```

---

## 7. Risks and Considerations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Orphaned `permissions` DB rows from older seed | Low–Medium | Query DB before removing frontend code; run deactivation SQL if needed |
| Existing rooms with `type = 'SPECIAL_ED'` in DB | Medium (if renaming) | Use Option B-1 (keep) unless business explicitly decides to rename/remove |
| Backend `room.validators.ts` does not validate `SPECIAL_ED` on write | Low | Rooms imported via script bypass the API validator; this is a pre-existing divergence. Fix: add `SPECIAL_ED` to backend Zod enum (separate cleanup). |
| `ManageRoles.tsx` form schema type mismatch after removal | Low | `PERMISSION_MODULES` loop drives actual submission — removing extra Zod keys is safe. TypeScript will catch any errors at build time. |
| Documentation references remain in `docs/SubAgent/*.md` | Negligible | Historical spec docs; no runtime impact. No action required unless archiving old docs. |
| CSV data files (`Inventory.csv`, `room.csv`) contain "Special Education" / "Special Ed" as department/room names | None | These are source data files, not code. No action needed. |

---

## 8. Files Requiring Changes (Action List)

### Approach: Remove permission-module dead code only (Recommended)

| Priority | File | Change type | Specific change |
|----------|------|-------------|----------------|
| 1 | `frontend/src/pages/ManageRoles.tsx` | Edit | Remove lines 67–69 (Zod schema) and lines 83–85 (buildFormDefaults) — PROFESSIONAL_DEV, SPECIAL_ED, TRANSCRIPTS fields |

**That is the only active source file that needs changes** to remove the dead permission-module references.

### Separate cleanup (recommended but lower priority):

| Priority | File | Change type | Specific change |
|----------|------|-------------|----------------|
| 2 | `backend/src/validators/room.validators.ts` | Edit | Add `'SPECIAL_ED'` to the `RoomType` Zod enum to align with frontend and imported DB data |

---

## 9. Files With NO Action Needed

The following files have references to the terms but require **no code changes**:

- `backend/prisma/schema.prisma` — No enum or constraint for these terms; `Room.type` is `String?`, `Permission.module` is `String`
- `backend/prisma/seed.ts` — These modules are absent (correct; no cleanup needed)
- `backend/src/middleware/permissions.ts` — Already clean (`PermissionModule` is already the 3-module version)
- `shared/src/types.ts` — Already clean (`PermissionModule` is already the 3-module version)
- `frontend/src/types/roles.types.ts` — Already clean (`PERMISSION_MODULES` only has the 3 modules)
- `backend/scripts/import-rooms.ts` — `SPECIAL_ED` maps room names correctly; keep as-is
- `frontend/src/types/room.types.ts` — `SPECIAL_ED` is a valid room type; keep as-is
- `frontend/src/components/RoomFormModal.tsx` — `SPECIAL_ED` room type; keep as-is
- `frontend/src/pages/RoomManagement.tsx` — `SPECIAL_ED` room type; keep as-is
- `frontend/src/pages/ReferenceDataManagement.tsx` — `SPECIAL_ED` room type; keep as-is
- All `docs/SubAgent/*.md` files — historical spec/review docs; no runtime impact
- All `docs/*.csv` files — raw data files; no runtime impact
- All migration SQL files — none contain these terms
- `backend/prisma/seed.ts` — Already only seeds 3 modules

---

## 10. Summary Statistics

| Category | Count |
|----------|-------|
| Active source files with changes required | **1** (`ManageRoles.tsx`) |
| Active source files with no-op SPECIAL_ED room usage (keep) | **5** (`room.types.ts`, `RoomFormModal.tsx`, `RoomManagement.tsx`, `ReferenceDataManagement.tsx`, `import-rooms.ts`) |
| Backend source files with any match | **0** (permissions.ts already clean for these 3 modules) |
| Migration SQL files with any match | **0** |
| Documentation files with reference (no action) | **14+** |
| CSV data files with reference (no action) | **2** (`Inventory.csv`, `room.csv`) |
| Total unique PROFESSIONAL_DEV source code matches | 2 lines in 1 file |
| Total unique SPECIAL_ED source code matches (as permission) | 2 lines in 1 file |
| Total unique SPECIAL_ED source code matches (as room type) | 7 lines in 5 files |
| Total unique TRANSCRIPTS source code matches | 2 lines in 1 file |

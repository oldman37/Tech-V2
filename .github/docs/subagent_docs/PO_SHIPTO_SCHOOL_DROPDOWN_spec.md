# PO Request — Ship To School Dropdown — Specification

## Current State Analysis

The PO Requisition wizard (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`) has one location dropdown today, labeled **"Department / Program / School / District Office"** (lines 670–707). It sets `officeLocationId`/`entityType`, which drives approval routing (supervisor lookup, Finance Director routing, food-service workflow). Selecting it also happens to seed the `shipTo` field via `handleEntityLocationChange` (lines 274–304).

Ship To itself (lines 741–807) is derived from that same selection:
- If `officeLocationId` is set → a `RadioGroup` with **"entity"** (read-only address of the *requesting* location) or **"custom"** (free-text, max 500 chars).
- If `officeLocationId` is not set → a bare free-text field.

There is no way today to pick a **delivery destination school** independent of who is requesting the PO. E.g., IT department requests a PO but the equipment ships to Lincoln Elementary — today that requires typing the school's address by hand into "custom".

Backend already supports this without changes: `GET /api/locations?types=SCHOOL` (`backend/src/controllers/location.controller.ts:14-30`, `backend/src/services/location.service.ts:106-140`) filters `OfficeLocation` by `type` server-side, and `OfficeLocation` (`backend/prisma/schema.prisma:296-331`) has `address`, `city`, `state`, `zip` fields — schools are simply rows with `type = 'SCHOOL'`.

## Problem Definition

Add a dropdown to the Ship To section of the PO Requisition wizard that lists **schools only** (pulled from the same `OfficeLocation` data shown on the Locations & Supervisors page), and selecting a school auto-populates the ship-to address — independent of the "requesting entity" dropdown, so any requestor (department, program, district office, or school) can ship to any school.

## Decision (confirmed with user)

Add a new, independent Ship To option, **not** a restriction of the existing requestor dropdown. Ship To becomes a 3-way radio choice:
1. **Entity address** — existing behavior, requesting location's own address (only shown if an `officeLocationId` is selected).
2. **Ship to a school** (new) — dropdown of schools only; selecting one fills a read-only address display.
3. **Custom address** — existing free-text fallback.

If no `officeLocationId` is selected, Ship To starts as a 2-way choice: **Ship to a school** / **Custom address** (no "entity" option, since there is no requesting entity address to show).

## Proposed Solution Architecture

### 1. Shared schema (`shared/src/schemas/purchaseOrder.schema.ts`)
Add `'school'` to the `shipToType` enum:
```ts
shipToType: z.enum(['entity', 'my_office', 'custom', 'school']).optional().nullable(),
```
`shipTo` (string, max 500) and `officeLocationId` are unchanged. No new field needed for the selected school's ID — since it's ship-to-only display data (not used for routing/approval), we don't need to persist a `shipToLocationId` on the PO record; only the resulting formatted address string (`shipTo`) is persisted, consistent with how "entity" and "custom" already work.

### 2. Frontend type (`frontend/src/types/purchaseOrder.types.ts`)
Mirror the enum in both places it's declared (lines 49, 220):
```ts
export type ShipToType = 'entity' | 'my_office' | 'custom' | 'school';
...
shipToType?: 'entity' | 'my_office' | 'custom' | 'school' | null;
```

### 3. RequisitionWizard.tsx changes

- **Reuse existing location fetch.** The wizard already fetches `/locations?types=SCHOOL,DEPARTMENT,PROGRAM,DISTRICT_OFFICE` into `locationOptions` (lines 240–251) and groups them by type (`groupedLocations`, lines 260–271). `groupedLocations.SCHOOL` already contains exactly the schools list needed — no new query required.
- **New local state** for the selected ship-to school (separate from `officeLocationId`, which must stay tied to the requestor):
  ```ts
  const [shipToSchoolId, setShipToSchoolId] = useState<string | null>(null);
  ```
- **New handler** `handleShipToSchoolChange(schoolId: string | null)`:
  ```ts
  const handleShipToSchoolChange = useCallback((schoolId: string | null) => {
    setShipToSchoolId(schoolId);
    if (!schoolId) { setValue('shipTo', null); return; }
    const school = groupedLocations.SCHOOL.find((l) => l.id === schoolId);
    if (!school) return;
    const addressParts = [school.address, school.city, school.state, school.zip].filter(Boolean).join(', ');
    setValue('shipTo', addressParts ? `${school.name}\n${addressParts}` : school.name);
  }, [groupedLocations, setValue]);
  ```
- **Extend `handleShipToTypeChange`** (lines 306–317) to handle the new `'school'` case: when switching to `'school'`, re-derive `shipTo` from `shipToSchoolId` if already set (mirrors the existing `'entity'` branch); when switching away from `'school'` to `'custom'`, clear `shipTo` (existing behavior already does this for the generic custom branch — no change needed there since it's an `else if` fallthrough). When switching to `'entity'` or away from `'school'`, reset `shipToSchoolId` to `null` so stale selection doesn't leak into a later school choice — not required for correctness but avoids a confusing UI where the dropdown still shows a prior pick after leaving the "school" branch and returning to it later; keep it simple and only reset on unmount-equivalent (component naturally resets since it's a single wizard flow) — **no reset needed**, matches minimal-change principle.
- **Extend the Ship To JSX** (lines 741–807):
  - Add a third `FormControlLabel` (`value="school"`, label `"Ship to a school"`) to the existing `RadioGroup` when `watchedOfficeLocationId` is set (three-way choice), and change the *no-`officeLocationId`* branch (currently a bare `TextField`, lines 789–807) into the same `RadioGroup` pattern but with only `"school"` and `"custom"` options (no `"entity"` since there's no requesting-entity address to show).
  - When `watchedShipToType === 'school'`: render a `Select` (or `Autocomplete`, but `Select` matches the existing entity-location dropdown pattern for visual consistency) listing `groupedLocations.SCHOOL` only, `label="School"`, `onChange` calls `handleShipToSchoolChange`. Below it, the same read-only grey address box used for `'entity'` (lines 761–765), reused verbatim, showing `watchedShipTo`.
- **Review step (Step 3)** — update the Ship To chip (lines 927–938) to also handle `'school'`:
  ```tsx
  label={watchedShipToType === 'entity' ? 'Entity Address' : watchedShipToType === 'school' ? 'School Address' : 'Custom'}
  color={watchedShipToType === 'entity' || watchedShipToType === 'school' ? 'primary' : 'default'}
  ```

### 4. PurchaseOrderDetail.tsx (display of an already-created PO)
Line 497–501 currently labels `shipToType` as `'Entity Address'` or `'My Office'` (falls back to 'My Office' for anything not `'entity'`). Update to add the `'school'` case:
```tsx
{po.shipToType === 'entity' ? 'Entity Address' : po.shipToType === 'school' ? 'School Address' : 'My Office'}
```
(Confirm exact current ternary structure when implementing — read the file at that line before editing, since the research summary paraphrased it.)

### 5. Backend
No backend changes required. `shipToType` is stored as-is (free-form string per the Zod enum) and `shipTo` is already a plain string column — the new enum value passes through unchanged. Confirm `backend/src/validators/` for purchase orders doesn't have its own duplicate enum that needs updating (check during implementation; if a backend-side Zod schema separately re-declares `shipToType`, it must gain `'school'` too, or better, should already import `CreatePurchaseOrderSchema`/`UpdatePurchaseOrderSchema` from `@mgspe/shared-types` per the "single source of truth" comment at the top of the shared schema file).

## Implementation Steps

1. Add `'school'` to `shipToType` enum in `shared/src/schemas/purchaseOrder.schema.ts`.
2. Mirror the enum in `frontend/src/types/purchaseOrder.types.ts` (both declarations).
3. In `RequisitionWizard.tsx`: add `shipToSchoolId` state, `handleShipToSchoolChange`, extend `handleShipToTypeChange`, extend the Ship To RadioGroup/JSX for both the "office location selected" and "no office location selected" branches, add the school `Select` + read-only address box, update the Review step chip label.
4. Update `PurchaseOrderDetail.tsx` label ternary to include `'School Address'`.
5. Verify no backend validator duplicates the `shipToType` enum independently; if it does, add `'school'` there too.
6. Rebuild `shared` before backend/frontend (per repo convention) so the updated type is picked up.

## Dependencies

None new — reuses MUI components (`Select`, `MenuItem`, `RadioGroup`, `FormControlLabel`) and the TanStack Query hook already present in the file. No new package versions to verify against docs.

## Configuration Changes

None (no env vars, no Prisma schema changes, no new Graph/MSAL scopes).

## Risks and Mitigations

- **Risk:** Confusing UX with 3 radio options when both an entity and a school could be the same location (e.g., requestor is itself a school and user also picks "ship to a school" = same school). *Mitigation:* no special-case needed — the resulting `shipTo` string is identical either way; this is a display/workflow convenience, not a data-integrity concern.
- **Risk:** `groupedLocations.SCHOOL` currently depends on the wizard's existing `/locations?types=SCHOOL,DEPARTMENT,PROGRAM,DISTRICT_OFFICE` query already covering `SCHOOL` — confirmed it does (line 245), so no separate fetch/query key needed, avoiding redundant network calls.
- **Risk:** Backend or another frontend surface (e.g., an "Edit PO" flow) might independently validate/display `shipToType` and break on the new enum value if it uses a strict switch/exhaustive check with no default. *Mitigation:* grep for all `shipToType` usages (already enumerated above: `RequisitionWizard.tsx`, `PurchaseOrderDetail.tsx`, `purchaseOrder.types.ts`, `purchaseOrder.schema.ts` — confirmed to be the full set in the frontend; confirm backend during implementation) and update every switch/ternary found, not just the ones listed here.

## Files to Modify

- `shared/src/schemas/purchaseOrder.schema.ts`
- `frontend/src/types/purchaseOrder.types.ts`
- `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`
- (Conditionally) a backend validator file, only if it independently re-declares `shipToType` rather than importing the shared schema.

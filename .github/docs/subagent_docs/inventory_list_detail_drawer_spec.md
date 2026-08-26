# Spec: Inventory Management has no detail view — Notes, Condition, Room invisible

## Current state analysis

### The gap audit
The list query already returns every scalar (`useInventoryList` -> `GET /api/inventory`,
which uses a broad Prisma `include`), so `notes`, `condition` and `description` are already
in `items` in the browser. **This is a rendering gap — no backend change is required.**

`frontend/src/pages/InventoryManagement.tsx` renders 14 columns
(`assetTag, name, category, brand, model, serialNumber, officeLocation, assignedToUser,
status, purchasePrice, vendor, poNumber, fundingSource, purchaseDate`) plus five row action
buttons, and **has no row click handler and no detail view**.

Fields the form/model carry that the page never shows:
| Field | State before this fix |
|---|---|
| Notes | Not a column, no detail view on this page |
| Condition | Not a column, despite being on the form (`condition?: EquipmentCondition \| null`) |
| Room | Shown only as a *fallback* inside the `assignedToUser` column when no user is assigned |
| Description | Not a column, not on the form either — set only by Excel import |

Also catalogued, deliberately left alone: `warrantyExpires`, `barcode`, `qrCode`,
`maintenanceSchedule`, `lastMaintenanceDate`, `customFields`, legacy `locationId` — no UI
touches these; import-only or dead.

### The component that already solves it
`frontend/src/components/inventory/EquipmentDetailDrawer.tsx` is a complete right-side
detail panel already rendering Description (line 150), Condition (line 156), Room (line 271)
and Notes (line 308/323), plus Close/History/Edit. It is currently wired into exactly one
page — `EquipmentSearch.tsx` (line 886), passing only `item` / `open` / `onClose`.

### Integration hazards — all four verified in source, not assumed
1. **Row click vs. row actions.** `ResponsiveTable.tsx:83` declares `onRowClick`;
   line 274 wires it to the `<tr>`; lines 285/291/310 call `e.stopPropagation()` on the
   actions cell. `MobileCard.tsx:112` does the same. **No change to either component.**
2. **Mobile.** `MobileCard.tsx:55` — `handleClick = collapsible ? onToggle : onRowClick...`.
   `InventoryManagement.tsx:680-691` does **not** set `collapsible`, so tap fires
   `onRowClick`. Panel is `width: '480px'` with `maxWidth: '100vw'` (drawer lines 68-69).
3. **Z-order.** Drawer backdrop `zIndex: 1000`, panel `zIndex: 1001`. MUI Dialogs default
   to 1300, so the internal Edit and History dialogs layer above the panel.
4. **Refresh.** The drawer renders `InventoryFormDialog` with
   `onSuccess={() => setEditDialogOpen(false)}` (line 389) and nothing else — harmless on
   Equipment Search, wrong here where the page is TanStack-Query-backed with real mutations.

`useInventory.ts:25` sets `placeholderData: keepPreviousData`, so `items` never flashes
empty mid-refetch — which makes the resurrection guard below safe to key off `items`.

## Problem definition
Information entered on the inventory form (Notes especially) appears nowhere on the
Inventory Management page, so the field reads as though it never saved. The only way to
read Notes today is to reopen the Edit dialog.

## Proposed solution architecture
Reuse the existing drawer rather than building a detail UI or widening a 14-column table.

1. Wire `onRowClick` on the page's `ResponsiveTable` to open `EquipmentDetailDrawer`.
2. Track the selected item's **id**, deriving the item from the current `items` list, so a
   refetch flows through to an already-open drawer:
   `const detailItem = items.find((i) => i.id === detailItemId) ?? null;`
   (`EquipmentSearch` stores the row object instead — that divergence is deliberate.)
3. Add an **optional** `onItemChanged?: () => void` prop to the drawer, invoked from the
   internal `InventoryFormDialog`'s `onSuccess`. Inventory Management passes `refetch`.
   Optional and additive so `EquipmentSearch` needs no edit and cannot regress.
4. **Resurrection guard**: clear `detailItemId` once its row leaves the result set
   (disposed, filtered out, paged past). Without it the drawer closes visually but the stale
   id remains, and flipping the filter to show disposed items would spontaneously reopen it.
5. One new column: `condition`, `hideOnMobile: true` — the single missing field worth
   *scanning* across rows. `hideOnMobile` puts it in the lowest priority tier so it collapses
   into the expand row first and never displaces Status, Category, Location or Assigned To.

## Implementation steps
1. Drawer: add optional `onItemChanged` prop; call it from `InventoryFormDialog.onSuccess`.
   -> verify: `EquipmentSearch.tsx` still compiles without passing it.
2. Page: import drawer, add `detailItemId` state + derived `detailItem`.
3. Page: add the resurrection `useEffect`.
4. Page: add the `condition` column.
5. Page: add `onRowClick` and mount the drawer.
6. Frontend image build. -> verify: exits 0.

## Dependencies
None. No new package, no backend endpoint, no query change.

## Configuration changes
None. No Prisma schema change, no migration.

## Risks and mitigations
- Risk: row click firing on action buttons. Mitigation: already handled upstream in
  `ResponsiveTable`/`MobileCard` — verified, so neither is modified.
- Risk: drawer reopening spontaneously. Mitigation: the resurrection guard, safe because
  `keepPreviousData` prevents a spurious empty `items`.
- Risk: regressing Equipment Search. Mitigation: the new prop is optional and additive.

## Deliberately not changed
- **No backend change of any kind** — data was already in the response.
- **Description is not added to the inventory form** — redundant with Notes; display-only.
- **The `assignedToUser` column's room fallback is untouched** — changing it would alter
  scanning behaviour every user is accustomed to. The drawer shows Room unconditionally,
  which closes the gap without touching the list.
- `EquipmentSearch.tsx`, `ResponsiveTable.tsx`, `MobileCard.tsx` all unmodified.

## Known, accepted gap
Equipment Search's drawer still cannot reflect an edit, because that page stores the row
object rather than deriving it. Pre-existing; out of scope; now a one-line divergence.

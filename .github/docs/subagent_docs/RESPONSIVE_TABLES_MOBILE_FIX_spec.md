# Responsive Tables Mobile Fix — Spec

## Current State Analysis

The frontend has an established responsive-table pattern:

- `frontend/src/components/responsive/ResponsiveTable.tsx` — generic `<ResponsiveTable<T>>` component.
  Renders a plain `<table>` on desktop and a list of `<MobileCard>` components on mobile
  (`useIsMobile()` from `frontend/src/hooks/useResponsive.ts`, breakpoint 768px).
- `frontend/src/components/responsive/MobileCard.tsx` — renders one row as a card: `isPrimary` column
  becomes the card title, `isSecondary` becomes the subtitle, remaining non-`hideOnMobile` columns
  render as label/value pairs, and `rowActions` render in a bottom action strip.
- Both are exported from `frontend/src/components/responsive/index.ts`, alongside `MobileFilterBar`,
  `PullToRefresh`, `OfflineIndicator`, `MobileActionBar` (not required for this fix, but available).
- 21 pages already use this pattern correctly (e.g. `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`,
  `frontend/src/pages/DeviceManagement/CheckoutPage.tsx`, `frontend/src/pages/Transportation/DotPhysicalsPage.tsx`).

## Problem

19 pages render raw MUI `Table`/`TableBody`/`TableHead`/`TableRow`/`TableCell` directly and never
switch to a card layout on mobile — on narrow viewports the table just squeezes/overflows instead of
using the existing `ResponsiveTable` pattern. Reported first on the Intune Device Actions page; the
user has asked for the fix applied to all affected pages.

Some files call `useIsMobile()` already but only for unrelated UI (tabs, stepper orientation) — the
table itself isn't touched. A few files (`ReportsPage.tsx`, `CheckedOutCartsPage.tsx`,
`BulkDeleteDisposedPage.tsx`) have **manual, ad-hoc mobile card rendering** instead of the shared
component — these should be migrated to `ResponsiveTable` too, for consistency, unless doing so would
lose functionality the ad-hoc version has (in which case: note it and leave that specific instance,
don't force a bad fit).

## Solution Architecture

For every raw MUI table identified below:

1. Import `{ ResponsiveTable, type Column }` from `../../components/responsive` (adjust relative depth).
2. Build a `Column<RowType>[]` array mirroring the existing `<TableCell>` headers, in the same order:
   - Preserve every existing `render`/formatting logic (chips, currency, dates, links) as the column's
     `render` function — do not change what's displayed, only how it's laid out.
   - Mark the single most identifying column (name/asset tag/serial/device name — whatever the table
     already treats as primary) `isPrimary: true`.
   - Mark one supporting column (status, description, subtitle-ish) `isSecondary: true`.
   - Columns that are "nice to have but not essential on a phone" (secondary IDs, verbose timestamps,
     redundant fields) get `hideOnMobile: true`. Use judgement per table; don't hide anything a user
     would need to act on the row without it.
   - Any per-row action buttons (icon buttons, "view", "run", delete) move to the `rowActions` prop.
   - Any per-row selection checkbox becomes a normal `Column` (not primary/secondary), rendering the
     `Checkbox` in `render`; the header's `label` can itself be the "select all" `Checkbox` (label
     accepts `ReactNode`). This keeps selection state management (`Set<string>` of selected ids)
     completely unchanged — only the rendering shell changes.
3. Replace the `<TableContainer><Table>...</Table></TableContainer>` block with
   `<ResponsiveTable columns={...} rows={...} getRowKey={...} rowActions={...} />`.
4. Keep `<TablePagination>` as-is outside/below `ResponsiveTable` where the page already paginates —
   `ResponsiveTable` does not manage pagination itself, so no change needed there beyond keeping it
   next to the (now responsive) table.
5. Remove now-unused MUI table imports (`Table`, `TableBody`, `TableCell`, `TableContainer`,
   `TableHead`, `TableRow`) from each file, but only if nothing else in the file still uses them
   (some files have multiple tables — check all before removing an import).
6. Where a file has manual inline `isMobile ? <cardJsx> : <tableJsx>` branching already, replace both
   branches with the single `ResponsiveTable` call, provided the manual card path isn't doing something
   `ResponsiveTable`/`MobileCard` structurally can't (e.g. deeply nested expand/collapse of a sub-table
   — see `CheckedOutCartsPage.tsx` note below). If it can't cleanly fit, leave that one instance as-is
   and note it in the implementation summary — don't force a broken UI to hit a checklist item.

### Nested / expandable tables

`CheckedOutCartsPage.tsx` has a cart row that expands to show a device sub-table. `MobileCard` has no
concept of nested rows. Acceptable approach: convert the **outer** cart list to `ResponsiveTable`, and
for the **inner** device sub-table (only ever shown after the user taps to expand a specific cart —
already a focused, single-cart context), it's reasonable to also convert it to a second
`ResponsiveTable` instance rendered inside the expanded region, OR — if row expansion itself is MUI
`Table`-row-based (`<TableRow>` acting as the expand toggle) — restructure the expand trigger to a
plain clickable element (e.g. the `MobileCard`'s `onRowClick`) that toggles a `Set`/boolean of expanded
ids, with the nested `ResponsiveTable` rendered conditionally beneath. Match whatever keeps the current
expand/collapse behavior working on both desktop and mobile.

## Files To Fix (19)

### DeviceManagement
1. `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` — device preview table (Tab 0
   step 2), reconciliation tables (Tab 3: stale devices, Intune-only w/ checkboxes, inventory-only),
   shared Results table (bottom, action-dependent columns for `fullDecommission`).
2. `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx` — scan/verify table (Step 0, sticky
   header, per-row delete icon), Results table (Step 2, action-dependent columns).
3. `frontend/src/pages/DeviceManagement/ReportsPage.tsx` — multiple report tables; has existing ad-hoc
   mobile card rendering in places — migrate to `ResponsiveTable`, preserving every stat shown.
4. `frontend/src/pages/DeviceManagement/UserCheckoutHistoryPage.tsx` — checkout history table, damage
   incidents table. No `useIsMobile` import yet — add it only if `ResponsiveTable` needs it directly
   (it manages its own internally; the page itself may not need the hook at all).
5. `frontend/src/pages/DeviceManagement/DeviceDetailPage.tsx` — verify actual table usage before
   editing (flagged as "needs inspection" during research); confirm the exact tables present first.
6. `frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx` — cart list + nested device sub-table;
   see "Nested / expandable tables" above.

### PurchaseOrders
7. `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` — PO line items table.
8. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` — line items being added/edited (Step 2);
   this table has inline editable cells (qty/price inputs) — `Column.render` can return the same
   `TextField`/input JSX unchanged, only the outer table shell changes.

### Transportation
9. `frontend/src/pages/Transportation/index.tsx` — recent fuel entries, DOT expiring alerts (dashboard).
10. `frontend/src/pages/Transportation/TransportationReportsPage.tsx` — unit summary, user summary tables.
11. `frontend/src/pages/Transportation/TransportationUnitDetailPage.tsx` — assignments table, fuel
    entries table.

### Admin
12. `frontend/src/pages/admin/AdminEmailQueueTab.tsx` — email queue history table.
13. `frontend/src/pages/admin/AdminSettings.tsx` — verify actual table(s) present before editing.
14. `frontend/src/pages/admin/AdminBackupTab.tsx` — backup file history table.

### Incidents / Other
15. `frontend/src/pages/incidents/IncidentsPage.tsx` — damage incidents list table (has pagination/filter).
16. `frontend/src/pages/BulkDeleteDisposedPage.tsx` — disposed equipment table with select checkboxes;
    currently uses manual `isMobile` branching with CSS `display: none` on columns instead of a real
    card view — migrate to `ResponsiveTable` with the checkbox-column pattern above.

Note: research also flagged `ComponentPricesPage.tsx` inconsistently (once as needing a fix, once as
already correct). **Verify directly before touching it** — if it already uses `ResponsiveTable`, skip
it entirely; do not re-edit a page that's already correct.

## Verification Requirement (all files)

Before editing each file, **open it and confirm the actual raw-`Table` usage and column set** — the
research pass was a broad sweep and may have missed a table, miscounted columns, or (per the
`ComponentPricesPage.tsx` case) mis-flagged a page. Do not blindly apply the checklist; read the file,
confirm the bug is real, then fix exactly what's there.

## Dependencies

No new dependencies — `ResponsiveTable`/`MobileCard`/`useIsMobile` already exist and are used
elsewhere. This is a pure internal refactor of existing pages; the "Dependency & Documentation Policy"
verification step is not required (internal code change, no new external library).

## Risks & Mitigations

- **Regression risk**: table behavior (sorting, pagination, filtering, row click, selection) must be
  functionally identical after conversion — only the rendering shell changes. Mitigation: keep all
  existing state/handlers untouched; only replace the JSX render layer.
- **Import cleanup risk**: removing MUI `Table*` imports that are still used by a second table in the
  same file that wasn't converted (e.g. an already-correct table). Mitigation: grep the file for
  remaining usages before removing any import.
- **Nested table risk** (`CheckedOutCartsPage.tsx`): forcing an awkward fit could break expand/collapse
  UX. Mitigation: described above; if it can't be done cleanly, note it explicitly in the summary
  rather than shipping a broken interaction.
- **Scale risk**: 19 files touched in one pass increases regression surface. Mitigation: Phase 3 review
  + Phase 6 preflight (`docker compose -f docker-compose.dev.yml build frontend`) is a hard gate before
  calling this done; TypeScript compilation during that build will catch column/type mismatches.

## Build/Test Commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build frontend` (safe — build only, no deploy, no DB)
- `scripts/preflight.ps1` (runs both backend + frontend builds; required final gate)

No FORBIDDEN COMMANDS apply to this change (no Prisma/migration/dev-server/test-watch usage needed).

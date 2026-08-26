# Spec: Asset tag / linked inventory item not shown on Work Order detail

## Current state analysis
Verified end-to-end that the data already exists and is simply never rendered:
- `backend/src/services/work-orders.service.ts` — `WORK_ORDER_DETAIL_INCLUDE` line ~98
  already selects `equipment: { select: { id: true, assetTag: true, name: true } }`.
- `frontend/src/types/work-order.types.ts:137` —
  `equipment: { id: string; assetTag: string; name: string } | null`.
- `shared/src/work-order.types.ts:163` — `equipment: WorkOrderEquipment | null`.
- `WorkOrderDetailsFields` in `frontend/src/pages/WorkOrderDetailPage.tsx` renders Reported
  By / Assigned To / Location / Room / Category and the `notInInventory` +
  `notInInventoryTag` fallback (line ~510) — but never reads `workOrder.equipment`.

Link-target research:
- `frontend/src/App.tsx:200` defines `path="/inventory"`. There is no `/inventory/:id`
  route; items open via local dialog state on the list page. So a dedicated detail route
  is not available as a link target.
- `frontend/src/pages/NewWorkOrderPage.tsx:149-154` is an existing precedent for seeding
  page state from a query param, sanitizing with `/[^\w\-./]/g` and `.slice(0, 50)`.
- `WorkOrderDetailPage.tsx` already imports `Link` (MUI, line 36) and
  `Link as RouterLink` (react-router-dom, line 15) — no import changes needed.

**This is a frontend-only change.** No backend, Prisma, shared-type, or frontend-type edit.

## Problem definition
The asset tag entered at work order creation is resolved to an `equipment` record and
returned by the API, but is invisible on the work order, and there is no way to jump from
a work order to that item's inventory entry.

## Proposed solution architecture
1. Render an "Asset Tag" field in `WorkOrderDetailsFields`, shown only when
   `workOrder.equipment` is non-null, placed after "Category" and before the
   `notInInventoryTag` fallback block (resolved case above free-text fallback).
2. The **asset tag itself** is the hyperlink; the item name follows as plain text.
3. Link target: `/inventory?search=<encoded assetTag>` — reuses the existing Inventory list
   and its search box rather than adding a detail page/route. This was the source session's
   explicit user decision, and remains the only available target given no `/inventory/:id`
   route exists.
4. `InventoryManagement.tsx` gains a mount-only effect reading the `search` query param via
   `useSearchParams`, sanitizing it with the same regex/cap as `NewWorkOrderPage.tsx`, and
   seeding `filters.search` through the page's existing `updateFilters`.

## Implementation steps
1. Add the Asset Tag `Box` to `WorkOrderDetailsFields`. -> verify: rendered only under
   `workOrder.equipment &&`, asset tag is the `<Link>`, name is plain text.
2. Add `useEffect` + `useSearchParams` import and the mount-only seeding effect to
   `InventoryManagement.tsx`. -> verify: runs once (`[]` deps), sanitized, no-op when absent.
3. Frontend image build. -> verify: exits 0.

## Dependencies
None new. `react-router-dom`'s `useSearchParams` is already used elsewhere in the app.

## Configuration changes
None.

## Risks and mitigations
- Risk: unsanitized query param reaching the search filter. Mitigation: reuse the existing
  whitelist regex `/[^\w\-./]/g` and 50-char cap.
- Risk: the effect re-firing and stomping user-typed search. Mitigation: `[]` deps —
  mount-only, with the existing eslint-disable comment pattern used by the precedent.
- **Known limitation, carried forward deliberately:** Inventory's search is a broad fuzzy
  `OR` across ~13 fields (`backend/src/services/inventory.service.ts` ~line 89-105), so
  clicking an asset tag can surface unrelated items whose PO number (etc.) shares the same
  digits. This is resolved separately by the inventory exact-unique-match fix, which is
  sequenced immediately after this one.

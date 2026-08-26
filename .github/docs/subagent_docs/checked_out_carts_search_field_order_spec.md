# Spec: Search field last in the Checked-Out Carts filter row

## Current state analysis
`frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx` lines ~465-509 render the
desktop filter bar as three `Box` children in the order:
Status (`FormControl`/`Select`) -> Location (`Autocomplete`) -> Search (`TextField`).

Surveyed the convention on three sibling list pages:
- `frontend/src/pages/WorkOrderListPage.tsx` ~line 517 — search `TextField` first, then
  Department `Select`, status `ToggleButtonGroup`, Priority `Select`.
- `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` ~line 470 — search `TextField`
  first, then Status `Select`, then date range.
- `frontend/src/pages/DeviceManagement/CheckoutPage.tsx` ~line 377 — search `TextField`
  first, then Location `Select`.

Checked-Out Carts is the only page placing search last.

## Problem definition
Filter-row ordering is inconsistent with the rest of the app. Not a logic bug.

## Proposed solution architecture
Reorder the three `Box` children to Search -> Status -> Location. Pure relocation of
existing JSX; no props, state, handlers, styling, or imports change.

## Implementation steps
1. Move the `{/* Search */}` `TextField` block above `{/* Status filter */}`. -> verify:
   `git diff --stat` shows equal insertions/deletions confined to those blocks.
2. Frontend image build. -> verify: exits 0.

## Dependencies
None.

## Configuration changes
None.

## Risks and mitigations
- Risk: an accidental prop/handler edit during the move. Mitigation: verify the diff is a
  symmetric move (same line count in/out) and that no line outside the three blocks changed.

# PO Requisition Wizard — Step 2 Fixes Spec

## Current State Analysis

**File:** `shared/src/schemas/purchaseOrder.schema.ts`
- `PurchaseOrderItemSchema.unitPrice` (lines 39-41) is defined as `z.number().positive('Unit price must be greater than zero')`. `positive()` rejects `0`, so a line item costing $0.00 (e.g. a free promotional item, warranty replacement, or a bundled freebie) cannot be saved — the form shows "Unit price must be greater than zero" and blocks submission.
- This schema is the single source of truth: it's imported directly by `backend/src/validators/purchaseOrder.validators.ts` (re-exported) and by the frontend wizard (`RequisitionWizard.tsx` via `zodResolver(CreatePurchaseOrderSchema)`), so one fix here covers both frontend validation and backend enforcement.
- Contrast with `shippingCost` in the same file (line 68-72), which correctly uses `.min(0, 'Shipping cost cannot be negative')` to allow zero — establishing the existing in-repo convention for "non-negative but zero-allowed" money fields.

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`
- The entire wizard is wrapped in a single outer `Box` (line 339) with `maxWidth: 900, mx: 'auto'` applied unconditionally to all three steps (Details, Line Items, Review).
- Step 2 ("Line Items", `activeStep === 1`, lines 614-817) renders a desktop `<Table>` (lines 700-777) with fixed-width columns:
  - `Item Number` column: `sx={{ width: 130 }}` (header line 705, matching input cell line 716-724)
  - `Qty *`: `width: 110`
  - `Unit Price *`: `width: 150`
  - `Line Total`: `width: 110`
  - `Description *`: no fixed width (flexes)
- Because the whole page is capped at `maxWidth: 900`, the table (and specifically the 130px Item Number column) is squeezed, and item numbers/SKUs get clipped or wrapped.
- `isMobile` comes from `useIsMobile()` (already imported, line 67) and is used to switch between the mobile card layout and the desktop table layout, and is available to gate width behavior.

## Problem Definition

1. Line items with a $0.00 unit cost cannot be entered — validation incorrectly requires the price be strictly greater than zero.
2. On non-mobile viewports, Step 2 of the wizard is constrained to the same centered `900px` max width as Steps 1 and 3, leaving too little room for the line-items table — in particular the Item Number column is too narrow to display full item numbers.

## Proposed Solution

### Fix 1 — Allow $0.00 unit price
Change `PurchaseOrderItemSchema.unitPrice` in `shared/src/schemas/purchaseOrder.schema.ts` from `.positive(...)` to `.min(0, 'Unit price cannot be negative')`, mirroring the existing `shippingCost` pattern. No other files need to change — the backend validator and frontend resolver both consume this schema directly, and the two numeric `<TextField>` inputs (mobile line 686, desktop line 753) already set `inputProps={{ min: 0 }}`, consistent with allowing zero.

### Fix 2 — Full-width Step 2 layout (desktop only)
Make the outer wrapper's `maxWidth` conditional: keep `900` (centered) for Steps 1 and 3, and for Step 2 on non-mobile viewports remove the cap so the table can use the full page width.

```tsx
const isWideStep = activeStep === 1 && !isMobile;
...
<Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: isWideStep ? 'none' : 900, mx: 'auto' }}>
```

Additionally widen the `Item Number` column (currently `width: 130`) to `width: 220` on both the header cell (line 705) and the input cell (line 716) so it has room to show full item numbers once extra horizontal space is available. No other column widths need to change — `Description` has no fixed width and will absorb any remaining space.

## Implementation Steps

1. `shared/src/schemas/purchaseOrder.schema.ts`: replace `.positive('Unit price must be greater than zero')` with `.min(0, 'Unit price cannot be negative')` on the `unitPrice` field.
2. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`:
   - Add `const isWideStep = activeStep === 1 && !isMobile;` near the other derived state (after `isSaving`/`subtotal` block, before the `return`).
   - Update the outer `Box` `sx` (line 339) to use `maxWidth: isWideStep ? 'none' : 900`.
   - Update the `Item Number` column header cell width from `130` to `220` (line 705).
   - Update the `Item Number` input `TableCell` width from `130` to `220` (line 716) — note: the input cell itself has no explicit width, only the header `TableCell` carries `sx={{ width: 130 }}`; only the header needs updating since `<table>` column widths are governed by the header cell in this layout. (Verify during implementation whether the body cell also needs an explicit width for consistent rendering across browsers — if so, mirror the change there too.)

## Dependencies
None — no new packages, no external API changes. Pure Zod constraint change + MUI `sx` prop changes, both patterns already used elsewhere in this exact file/schema.

## Configuration Changes
None. No Prisma schema changes, no migration needed — `unitPrice` is already stored as a nullable-safe numeric column; only the Zod validation boundary changes, and `0` was already a valid Prisma value.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Loosening `unitPrice` to allow 0 could allow accidental $0 line items to slip through unnoticed | This is the user's explicit intent (legitimate $0 items exist); no other guard rails are requested. Negative values remain blocked by `min(0)`. |
| Removing `maxWidth` on Step 2 could cause the line-items table to look awkwardly stretched on very wide monitors | Table columns other than the widened Item Number column keep fixed widths; Description flexes to fill space, which is the intended behavior (more room for text), consistent with the user's ask. |
| Widening Item Number column shifts other columns off-screen on medium (tablet, non-mobile) widths | `TableContainer` already has `overflowX: 'auto'` (line 701) as an existing safety net for horizontal scrolling if needed. |

## Build/Test Validation Plan (Phase 3/6)
- `docker compose -f docker-compose.dev.yml build backend` — confirms shared `tsc` + backend `tsc` compile with the schema change.
- `docker compose -f docker-compose.dev.yml build frontend` — confirms frontend `tsc` + `vite build` compile with the JSX/sx changes.
- These are exactly the two commands in `scripts/preflight.ps1`, so Phase 3 build validation and Phase 6 preflight are the same two commands.

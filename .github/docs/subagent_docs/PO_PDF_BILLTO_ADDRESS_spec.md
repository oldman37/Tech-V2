# PO PDF: Add Obion County Schools "BILL TO" Address

## Current State Analysis

`backend/src/services/pdf.service.ts` (`generatePurchaseOrderPdf`) renders the SHIP TO
section as a single, full-width block (lines ~200-207):

```ts
// ---- Ship To -------------------------------------------------------
if (po.shipTo) {
  doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('SHIP TO');
  doc.font(FONT_REG).fontSize(9).fillColor('#212121').text(po.shipTo, { width: COL_W });
  doc.moveDown(0.5);
  hRule(doc, doc.y);
  doc.moveDown(0.5);
}
```

It only renders at all when `po.shipTo` is set, and consumes the full content width
(`COL_W`). No other fixed/district address currently appears anywhere in the PDF.

The existing two-column pattern used for REQUESTED BY / VENDOR (lines ~163-194) is the
established convention for side-by-side blocks: a `leftX`/`rightX` pair derived from
`MARGIN` and `COL_W`, a shared `sectionTop` Y position, bold section headers in `PRIMARY`
color, and body text in `FONT_REG`/`#212121`.

## Problem Definition

The district's own address (used as the standard billing address for POs) needs to
appear on the PDF, on the same row as the existing Ship To value, positioned in the
left column. The right column keeps the existing SHIP TO label/value exactly as today.

## Proposed Solution

Convert the single-width SHIP TO block into a two-column row, reusing the same
left/right column geometry already established for REQUESTED BY / VENDOR:

- **Left column** — new header `BILL TO`, body is the fixed, hard-coded district
  address (not sourced from the database — there is no existing field for this on
  `POForPdf`, `vendors`, or `officeLocation`):
  ```
  Obion County Schools
  1700 N Fifth St.
  Union City, TN 38261
  ```
- **Right column** — unchanged header `SHIP TO`, body is `po.shipTo` (existing behavior,
  still conditional — only rendered when `po.shipTo` is truthy).

Row rendering rule: the BILL TO column always renders (it's a static constant, always
known). The SHIP TO column renders only if `po.shipTo` is present, same as today. If
`po.shipTo` is absent, BILL TO still renders alone in the left column so the address is
never silently dropped.

The fixed address will be defined as a module-level constant (`BILL_TO_LINES`, an array
of 3 lines) near the other layout constants (`MARGIN`, `PRIMARY`, etc.), consistent with
how `FONT_SIG` and other static values are declared at the top of the file. This keeps
it easy to find/update if the district address ever changes, without introducing a new
DB field, service parameter, or config flag that nothing else requires.

## Implementation Steps

1. In `backend/src/services/pdf.service.ts`, add a constant near the other layout
   constants (~line 80):
   ```ts
   const BILL_TO_LINES = ['Obion County Schools', '1700 N Fifth St.', 'Union City, TN 38261'];
   ```
2. Replace the existing `// ---- Ship To ----` block (~lines 200-207) with a two-column
   version:
   - Compute `leftX`/`rightX`/`colW` the same way as the REQUESTED BY/VENDOR section
     (or reuse those same local consts if still in scope — otherwise redeclare locally
     with identical values for clarity, matching existing file style where each section
     redeclares its own geometry).
   - Left: print `BILL TO` header, then each line of `BILL_TO_LINES`.
   - Right: keep existing `if (po.shipTo)` guard; print `SHIP TO` header and `po.shipTo`
     text, width-constrained to `colW` (not the full `COL_W` as before, since it now
     shares the row).
   - After both columns, `doc.moveDown(...)` to the max Y reached by either column (BILL_TO
     is always 3 lines; `po.shipTo` may wrap to more lines) before drawing `hRule`, to
     avoid the rule overlapping wrapped Ship To text. Use `Math.max` on the two columns'
     ending `doc.y` values, matching how pdfkit text advances `doc.y` per call.
3. No other files change — this is a single-file, backend-only, no-new-dependency
   template edit. No Prisma/schema/migration involved. No shared-types change (the PDF
   generation doesn't touch `POForPdf`'s shape).

## Dependencies

None. Uses only `pdfkit`, already installed and used throughout this file. No new
library, no version-sensitive API introduced.

## Configuration Changes

None (no env vars, no schema, no Graph scopes).

## Risks and Mitigations

- **Risk:** If `po.shipTo` wraps to more lines than the fixed 3-line BILL TO block, the
  next `hRule`/section could start too early relative to the taller column.
  **Mitigation:** take `Math.max(leftEndY, rightEndY)` before drawing the rule, rather
  than relying on `doc.y` after only the last-drawn column.
- **Risk:** Narrowing the SHIP TO text width from `COL_W` to `colW` (half width) could
  cause previously single-line ship-to addresses to wrap onto an extra line.
  **Mitigation:** acceptable/expected given the two-column layout; matches how VENDOR
  address already wraps within `colW` today.
- **Risk:** none to data model / auth / CSRF — purely a rendering change in a PDF
  generation function with no request/response shape change.

## Verification

- `docker compose -f docker-compose.dev.yml build backend` — TypeScript compiles.
- Manually export/download a PO PDF (existing route already calls
  `generatePurchaseOrderPdf`) and visually confirm: BILL TO block with the 3 fixed lines
  on the left, SHIP TO block with `po.shipTo` on the right, same row, followed by a
  horizontal rule below whichever column is taller.

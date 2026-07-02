# PO PDF Header Spacing Fix — Spec

## Current State Analysis

File: `backend/src/services/pdf.service.ts`, function `generatePurchaseOrderPdf`, header block (lines ~122-159).

The header currently renders as:
- Row A (own row): `Requisition Number:` (left only)
- Row B: `PO Number:` (left) | `Date Requested:` (right)
- Row C: `Account Number:` (left) | `Date Issued:` (right)

Each label/value pair is drawn with PDFKit's `continued: true` chaining:

```ts
doc.text('Requisition Number:', hdrLeftX, doc.y, { continued: true, width: hdrLabelW })
   .font(FONT_REG)
   .text(po.reqNumber ?? 'N/A', { continued: false });
```

**Root cause of both reported bugs:** in PDFKit, when a `width` option is supplied to the first call in a `continued: true` chain, that width becomes the wrap width for the *entire* continued run (label + value combined), not just the label. `hdrLabelW` is 110pt, which is close to or less than the rendered width of the label text alone (e.g. `Date Requested:` in bold 10pt) plus its value. The result:
- Labels/values wrap onto 2-3 lines unpredictably depending on label+value string length (visible in the exported PDF screenshot: "Date Requested:" wraps as "Date Requested:" / "July" / "1, 2026").
- Because each row's height now varies with how much its content wrapped, and `doc.y` (used to compute the next row's Y) is read *after* the previous row's wrapped output, the vertical gap between `Requisition Number`, `PO Number`, and `Account Number` becomes inconsistent (bug #1).
- `Date Requested` is placed on the same row as `PO Number` (one row below `Requisition Number`), which reads as a visible gap/misalignment above it relative to the `Requisition Number` line (bug #2).

## Problem Definition

1. Vertical spacing between `Requisition Number`, `PO Number`, and `Account Number` is inconsistent (caused by uncontrolled text wrapping).
2. `Date Requested` does not start at the same height as `Requisition Number` — the user expects it aligned to the top row.

## Proposed Solution

Restructure the header into a fixed 3-row × 2-column grid with explicit, non-wrapping label/value placement:

- Row 1: `Requisition Number` (left) | `Date Requested` (right)
- Row 2: `PO Number` (left) | `Date Issued` (right)
- Row 3: `Account Number` (left) | *(blank)*

Each row uses one fixed `hdrRowGap` (constant) vertical increment computed from `doc.y` set explicitly (not from wrapped-text auto-advance), guaranteeing equal spacing between all three rows.

Replace the `continued: true` chaining with a small local helper that draws the label and value as two independent, non-wrapping text calls positioned at explicit `x` coordinates on the same `y`:

```ts
function drawLabelValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW: number,
): void {
  doc.font(FONT_BLD).fontSize(10).fillColor('#212121')
    .text(label, x, y, { lineBreak: false });
  doc.font(FONT_REG).fontSize(10).fillColor('#212121')
    .text(value, x + labelW, y, { lineBreak: false });
}
```

`lineBreak: false` prevents PDFKit from wrapping either fragment, and each call is independently positioned so one long label can never push the paired value (or a sibling row) out of alignment.

`hdrLabelW` increased from 110 to 125 to comfortably fit the widest label (`Date Requested:` in bold 10pt) with clearance before the value starts. Column positions (`hdrLeftX`, `hdrRightX`) and overall header width (`COL_W`) are unchanged, so nothing downstream (the hRule call, subsequent sections) needs to move.

## Implementation Steps

1. Add a local `drawLabelValue` helper near the top of `generatePurchaseOrderPdf` (or as a module-level function alongside `hRule`).
2. Replace the existing "Requisition Number / PO Number / Date Requested / Account Number / Date Issued" block (current lines ~122-159) with the 3-row grid described above, using a single `hdrRowGap` constant (16pt) for all row-to-row spacing.
3. After the three rows are drawn, explicitly set `doc.y` to the bottom of the block (`hdrY + hdrRowGap`) so the existing `doc.moveDown(0.5); hRule(doc, doc.y);` code that follows continues to work unchanged.
4. No other sections of the PDF (Requested By/Vendor, Bill To/Ship To, Line Items, Signatures) are touched — they do not use the buggy `continued`+`width` pattern and are not part of the reported issue.

## Dependencies

None — uses the already-integrated `pdfkit` package and patterns (`FONT_BLD`, `FONT_REG`, `MARGIN`, `COL_W`) already present in this file. No version/API research required (Dependency Policy exemption: styling-only change, existing dependency).

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** `hdrLabelW = 125` still too narrow for some edge-case long label/value in another locale or future label text. **Mitigation:** `lineBreak: false` guarantees no wrap regardless — worst case is visual overlap with the next column if a value is extremely long, which is far less likely than the current guaranteed-wrap bug, and matches how the rest of the header (`PO Number`, `Account Number`) already behaves today.
- **Risk:** Visual regression to line spacing below the header (Requested By / Vendor section). **Mitigation:** Block ends by explicitly setting `doc.y`, preserving the existing downstream flow exactly as before.

## Verification

- Rebuild backend Docker image (`docker compose -f docker-compose.dev.yml build backend`) to confirm `tsc` compiles.
- Manual visual check: after redeploy, export a PO PDF and confirm all three left rows have equal vertical spacing and `Date Requested` aligns with `Requisition Number`.

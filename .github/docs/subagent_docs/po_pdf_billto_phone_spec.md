# PO PDF: Add District Phone Number to "BILL TO" Block

## Current State Analysis

`backend/src/services/pdf.service.ts:81` defines the fixed BILL TO address as a
module-level constant:

```ts
const BILL_TO_LINES = ['Obion County Schools', '1700 N Fifth St.', 'Union City, TN 38261'];
```

This is rendered line-by-line in the `BILL TO` column of `generatePurchaseOrderPdf`
(lines 218-220):

```ts
doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text('BILL TO', btLeftX, btTop);
doc.font(FONT_REG).fontSize(9).fillColor('#212121');
for (const line of BILL_TO_LINES) doc.text(line, btLeftX, doc.y, { width: btColW });
```

The adjacent `VENDOR` block (lines 194-205) already renders a phone number using the
convention `` `Ph: ${po.vendors.phone}` `` — this is the established in-file format for
phone lines.

## Problem Definition

The district's phone number, `731-885-9743`, needs to appear in the BILL TO block,
after the existing address lines.

## Proposed Solution

Append one line to `BILL_TO_LINES`, formatted consistently with the VENDOR block's
phone line (`Ph: <number>`):

```ts
const BILL_TO_LINES = [
  'Obion County Schools',
  '1700 N Fifth St.',
  'Union City, TN 38261',
  'Ph: 731-885-9743',
];
```

No loop/rendering logic changes are needed — the existing `for (const line of
BILL_TO_LINES)` already prints every element, so the new line renders automatically
directly beneath the address.

## Implementation Steps

1. In `backend/src/services/pdf.service.ts`, edit the `BILL_TO_LINES` constant
   (~line 81) to add `'Ph: 731-885-9743'` as a fourth entry.
2. No other files change — single-file, backend-only, no new dependency, no schema/
   migration, no shared-types change.

## Dependencies

None. No new library; `pdfkit` usage pattern is unchanged.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** A 4th line makes the BILL TO column taller than before, which could shift
  where `Math.max(leftEndY, rightEndY)` lands relative to the SHIP TO column.
  **Mitigation:** the existing code already takes `Math.max(leftEndY, rightEndY)`
  before drawing the following `hRule` (pdf.service.ts:238), so a taller left column
  is already handled correctly — no code change required beyond the data line itself.
- **Risk:** none to data model, auth, or CSRF — purely a static text addition in a PDF
  rendering function.

## Verification

- `docker compose -f docker-compose.dev.yml build backend` — TypeScript compiles.
- Manually export/download a PO PDF and visually confirm the BILL TO block now reads:
  ```
  Obion County Schools
  1700 N Fifth St.
  Union City, TN 38261
  Ph: 731-885-9743
  ```

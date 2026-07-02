# PO PDF: Split Ship To city/state/zip onto its own line — Spec

## Current State Analysis

`backend/src/services/pdf.service.ts`, BILL TO / SHIP TO row (lines ~201-234).

BILL TO renders as 3 fixed, separately-drawn lines via `BILL_TO_LINES` looped with individual `doc.text()` calls (org name / street / city, state zip) — each call auto-advances `doc.y`, so the block is naturally 3 stacked lines.

SHIP TO instead renders `po.shipTo` as a **single** `doc.text()` call:
```ts
doc.font(FONT_REG).fontSize(9).fillColor('#212121').text(po.shipTo, btRightX, doc.y, { width: btColW });
```
`po.shipTo` is a string built on the frontend (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx:236-238,260-261`):
```ts
const addressParts = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
const shipToValue = addressParts ? `${loc.name}\n${addressParts}` : loc.name;
```
So the string is already 2 lines (`\n`-separated): line 1 is the location name, line 2 is the *flattened* `"street, city, state, zip"`. PDFKit renders the embedded `\n` as a line break, so today's PDF shows exactly what the screenshot captured: name on its own line, and street+city+state+zip all crammed onto the second line (e.g. `1700 N. Fifth St., Union City, TN, 38261`).

## Problem Definition

The user wants the SHIP TO block to visually match BILL TO: name, then street address, then city/state/zip — each on its own line, instead of street+city/state/zip sharing one line.

## Scope

Backend-only, `pdf.service.ts` rendering logic. **Not** touching `RequisitionWizard.tsx` or how `shipTo` is stored/constructed — this is purely how the already-stored string is laid out in the PDF, per user's explicit direction ("this will be in the pdf export").

## Proposed Solution

Since the PDF only has the flattened string (no separate address/city/state/zip fields on `po.shipTo` itself), split it heuristically at render time:

1. Split `po.shipTo` on `\n` to get its existing lines (normally: `[name, "street, city, state, zip"]`).
2. For each resulting line, split on `', '`. If it has **more than 2** comma-separated parts (i.e. street + city + state[+ zip] all flattened together), treat the first part as the street line and rejoin the remaining parts as the city/state/zip line. Lines with 2 or fewer parts (e.g. a bare name, or a short custom entry) are left untouched — this avoids incorrectly splitting `shipToType: 'custom'` free-text entries that don't follow the 4-part pattern.
3. Render the resulting flattened list of lines with a loop of individual `doc.text()` calls at `btRightX`, mirroring exactly how `BILL_TO_LINES` is rendered today (`for (const line of BILL_TO_LINES) doc.text(line, btLeftX, doc.y, { width: btColW });`).

Example: `"District Office\n1700 N. Fifth St., Union City, TN, 38261"` →
```
District Office
1700 N. Fifth St.
Union City, TN, 38261
```

## Implementation Steps

1. In `backend/src/services/pdf.service.ts`, inside the `if (po.shipTo)` block (~line 224-228), replace the single `doc.text(po.shipTo, ...)` call with:
   - Compute the line list via `.split('\n')` then the comma-split heuristic described above.
   - Loop and `doc.text(line, btRightX, doc.y, { width: btColW })` for each, same pattern as `BILL_TO_LINES`.
2. `rightEndY = doc.y` still captured after the loop, unchanged from current logic.
3. No other lines in the BILL TO / SHIP TO block change.

## Dependencies

None — pure string manipulation + existing `pdfkit` `.text()` calls already used throughout this file.

## Risks and Mitigations

- **Risk:** A custom/free-text `shipTo` (shipToType `'custom'`) happens to contain 2+ commas for an unrelated reason (e.g. `"Room 204, Building B, near gym"`) and gets split unexpectedly.
  **Mitigation:** Acceptable — this mirrors how BILL TO's own address wraps at fixed points, and the split only ever occurs at the first comma, producing a still-readable two-line result. No data is lost or altered, only where the line break falls.
- **Risk:** A line with exactly 2 parts (e.g. missing state/zip) doesn't get the desired 3-line look.
  **Mitigation:** Out of scope — matches existing incomplete-address behavior elsewhere in the document (e.g. BILL TO's own fixed lines are always complete); not a regression.

## Verification

- `docker compose -f docker-compose.dev.yml build backend` — confirms `tsc` compiles.
- `.\scripts\preflight.ps1` — full gate (backend build, frontend build, backend tests).
- Manual visual check: export a PO PDF with an entity-sourced ship-to address and confirm SHIP TO now shows 3 stacked lines matching BILL TO's layout.

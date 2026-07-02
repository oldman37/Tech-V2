# PO PDF Header Spacing Fix — Review

## Scope
File: `backend/src/services/pdf.service.ts` — header block only (Requisition Number / PO Number / Account Number / Date Requested / Date Issued).

## Specification Compliance
Implementation matches `.github/docs/subagent_docs/po_pdf_header_spacing_spec.md` exactly:
- Added `drawLabelValue` helper using two independent, non-continued `text()` calls with `lineBreak: false` (no more `continued: true` + sticky `width` wrap bug).
- Restructured to the specified 3-row × 2-column grid: Row 1 `Requisition Number` | `Date Requested`, Row 2 `PO Number` | `Date Issued`, Row 3 `Account Number` | blank.
- Single `hdrRowGap = 16` constant drives all row-to-row spacing — equal by construction.
- `hdrLabelW` raised 110 → 125.
- `doc.y` explicitly set to `hdrY + hdrRowGap` after the block so downstream `moveDown(0.5); hRule(...)` is unaffected.

## Best Practices / Consistency
- Follows existing module conventions: local helper function alongside `hRule`, same font/color constants, same `MARGIN`/`COL_W` usage.
- No new dependencies introduced.

## Maintainability
- Row layout is now declarative (fixed `hdrY` increments) rather than relying on `doc.y` auto-advance after wrapped text, which was the source of the original bug — easier to reason about and modify.

## Completeness
- Both reported issues addressed:
  1. Equal spacing across Requisition/PO/Account rows — now guaranteed by fixed `hdrRowGap`.
  2. `Date Requested` aligned to the same row/height as `Requisition Number`.
- No other sections touched (Requested By/Vendor, Bill To/Ship To, Line Items, Signatures unchanged — confirmed via diff).

## Performance
No change — same synchronous PDFKit draw calls, no added I/O or loops.

## Security
No change to data handling; no new user input paths; no Entra/Graph data involved.

## API Currency
`pdfkit` usage (`.font().fontSize().fillColor().text()` chaining, `lineBreak: false`) matches the API already used elsewhere in this same file (e.g. signature block `lineBreak: false` at line ~324 pre-existing). No new API surface introduced.

## Width-fit check (manual calculation, Helvetica-Bold AFM widths, 10pt)
- `"Requisition Number:"` ≈ 98.3pt — fits within `hdrLabelW = 125` with ~27pt clearance.
- `"Date Requested:"` ≈ 78.9pt — fits with ~46pt clearance.
- Value area on the right column (`hdrRightX + 125` to page right margin) ≈ 121pt, ample for date strings like "December 25, 2026".
No overlap risk under normal data.

## Build Validation
Command run (from Phase 1 spec, not in FORBIDDEN COMMANDS):
```
docker compose -f docker-compose.dev.yml build backend
```
Result: **SUCCESS**. `tsc` compiled with no errors (step `RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build` completed in 18.5s, exit clean), image built and tagged `tech-v2-backend:latest`.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS
No CRITICAL or RECOMMENDED issues found. Proceeding to Phase 6 (Preflight).

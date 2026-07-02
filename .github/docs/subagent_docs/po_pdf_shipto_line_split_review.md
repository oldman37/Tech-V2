# PO PDF: Split Ship To city/state/zip onto its own line — Review

## Scope
`backend/src/services/pdf.service.ts` — SHIP TO rendering only, inside the existing BILL TO / SHIP TO row.

## Specification Compliance
Matches `.github/docs/subagent_docs/po_pdf_shipto_line_split_spec.md`:
- `po.shipTo` split on `\n`, then each line further split at the first `, ` when it has more than 2 comma-separated parts, rejoining the remainder as the city/state/zip line.
- Rendered via a loop of individual `doc.text(line, btRightX, doc.y, { width: btColW })` calls — same pattern used for `BILL_TO_LINES`.
- `rightEndY = doc.y` still captured after rendering, so the existing `Math.max(leftEndY, rightEndY)` / `hRule` logic below is unaffected.
- No changes to `RequisitionWizard.tsx` or how `shipTo` is stored — confirmed out of scope per user instruction.

## Best Practices / Consistency
Mirrors the existing `BILL_TO_LINES` loop exactly (same font/color setup once, then per-line `doc.text` calls at a fixed x, width-constrained) — no new pattern introduced.

## Correctness check
For the reported example `"District Office\n1700 N. Fifth St., Union City, TN, 38261"`:
- Line 1 `"District Office"` → `split(', ')` → 1 part → unchanged.
- Line 2 `"1700 N. Fifth St., Union City, TN, 38261"` → `split(', ')` → `["1700 N. Fifth St.", "Union City", "TN", "38261"]` (4 parts, >2) → `["1700 N. Fifth St.", "Union City, TN, 38261"]`.
- Final rendered lines: `District Office` / `1700 N. Fifth St.` / `Union City, TN, 38261` — matches the requested 3-line BILL TO-style layout.

Edge cases considered (per spec risks section): custom free-text ship-to values with unrelated commas will still render sensibly (split at first comma, no data loss); values with ≤2 comma-parts are left as-is (no regression vs. today).

## Completeness
Only the SHIP TO block changed; BILL TO, header rows, line items, and signature sections untouched (confirmed via diff — no other hunks).

## Performance / Security
No change — pure client-side string formatting of already-fetched data, no new I/O, no new user-facing input path, nothing touching auth/CSRF.

## Build Validation
Command (per spec, not in FORBIDDEN COMMANDS):
```
docker compose -f docker-compose.dev.yml build backend
```
Result: **SUCCESS** — `tsc` compiled cleanly (`RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build` completed in 18.7s), image built and tagged `tech-v2-backend:latest`.

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

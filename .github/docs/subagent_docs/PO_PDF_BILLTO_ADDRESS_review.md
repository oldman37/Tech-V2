# PO PDF: BILL TO Address — Review

## Spec Compliance

Implemented exactly per `PO_PDF_BILLTO_ADDRESS_spec.md`:
- `BILL_TO_LINES` constant added next to other layout constants (`backend/src/services/pdf.service.ts:81`).
- SHIP TO block replaced with a two-column BILL TO (left, always renders) / SHIP TO
  (right, conditional on `po.shipTo`) row, reusing the same column geometry pattern as
  the REQUESTED BY / VENDOR section (`backend/src/services/pdf.service.ts:201-224`).
- Row height accounts for the taller of the two columns via `Math.max(leftEndY, rightEndY)`
  before drawing the following `hRule`.
- SHIP TO text width narrowed from full `COL_W` to `btColW` (half width), matching spec.
- No new dependency, no schema/migration, no shared-types change — single file touched.

## Review Checklist

1. **Specification Compliance** — Matches spec exactly. ✅
2. **Best Practices** — Follows existing pdfkit usage conventions in this file (explicit x/y positioning, `continued` avoided here since not needed, font/color reset per block). ✅
3. **Consistency** — Column geometry (`MARGIN`, `COL_W/2 + 10`) mirrors the REQUESTED BY / VENDOR block above it exactly. ✅
4. **Maintainability** — Fixed address isolated as a single named constant, easy to update if the district address changes. ✅
5. **Completeness** — Handles both the case where `po.shipTo` is present and absent (BILL TO always shows; SHIP TO conditional, same as before). ✅
6. **Performance** — No new loops beyond iterating 3 static lines; no additional Prisma/Graph calls. ✅
7. **Security** — No new data exposed; the address is a static, non-sensitive constant. No auth/CSRF surface touched (this is a PDF-rendering function, not a route). ✅
8. **API Currency** — No external API usage changed; pdfkit calls match the file's existing patterns. ✅
9. **Build Validation** — see below.

## Build Validation (verbatim result)

Command: `docker compose -f docker-compose.dev.yml build backend`
Result: **Success** — `tsc` build step completed in 17.6s with no errors, image built and tagged.

Command: `scripts/preflight.ps1`
Result: **All preflight checks passed** (exit code 0). This included:
- Backend Docker image build — success
- Frontend Docker image build — success (unaffected by this backend-only change)
- Full backend vitest suite — 5 test files, 35 tests, all passed

No test exists that asserts on PDF byte/text layout, so no test file needed updating for
this change; verification is via the successful TypeScript build plus manual visual
confirmation of the rendered PDF (recommended before merge, not automatable in this
suite).

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

## Result

**PASS**

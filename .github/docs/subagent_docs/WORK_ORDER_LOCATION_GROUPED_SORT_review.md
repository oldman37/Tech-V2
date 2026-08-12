# Work Order: Group Location Dropdown by Type, Remove "None" — Review

## Scope Reviewed

- `frontend/src/pages/NewWorkOrderPage.tsx`
- `frontend/src/pages/WorkOrderListPage.tsx`

Against spec: `.github/docs/subagent_docs/WORK_ORDER_LOCATION_GROUPED_SORT_spec.md`

## Findings

1. **Specification Compliance** — Exact match. `NewWorkOrderPage.tsx`'s Location select: "— None —" `MenuItem` removed, list now sorted Schools-then-Departments-then-alphabetical via `[...locations].sort(...)`. `WorkOrderListPage.tsx`: both the mobile filter drawer and desktop filter row's Location selects got the same grouped comparator swapped in for the prior pure-alphabetical sort; `All Locations` reset option correctly left untouched in both.
2. **Best Practices** — Comparator is a standard two-key sort (`type` tiebreak first, `name` second) — idiomatic JS `Array.prototype.sort`. `[...locations]` spread in `NewWorkOrderPage.tsx` avoids mutating the query-cache-backed array in place (the two `WorkOrderListPage.tsx` sites already chain off a fresh `.filter()` result, so no spread needed there — `.filter()` already returns a new array).
3. **Consistency** — Same comparator expression duplicated verbatim across all three sites, consistent with the file's existing pattern of duplicating identical filter/sort/map logic between the mobile and desktop blocks (not a new duplication pattern introduced by this change).
4. **Maintainability** — No structural change; comparator is short and self-explanatory (`SCHOOL` sorts first, everything else after, alphabetical within a group).
5. **Completeness** — Both work order pages covered, including both list-page filter surfaces (desktop + mobile). Program dropdown and Room dropdown intentionally untouched (correct — out of this request's confirmed scope).
6. **Performance** — No regression; sort cost is unchanged in complexity (was already sorting on the list page; the create form's `locations` array is small, well under any threshold worth optimizing).
7. **Security** — No change in surface area; purely client-side list ordering, no new inputs or endpoints.
8. **API Currency** — N/A; no external dependency touched.
9. **Build Validation**:
   - Command run (per spec, safe/approved): `docker compose -f docker-compose.dev.yml build frontend`
   - Result: **SUCCESS** — `tsc` passed with no errors, `vite build` completed (`✓ built in 2.16s`), PWA service worker built, image exported and tagged `tech-v2-frontend:latest`. Same pre-existing warnings as before this change (`INEFFECTIVE_DYNAMIC_IMPORT`, chunk-size), nothing new.
   - Backend untouched by this change; Phase 6 preflight still runs both.

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

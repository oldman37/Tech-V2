# Work Order: Move Departments Back Under Location, Programs-Only Dropdown — Review

## Scope Reviewed

- `frontend/src/pages/NewWorkOrderPage.tsx`
- `frontend/src/pages/WorkOrderListPage.tsx`

Against spec: `.github/docs/subagent_docs/WORK_ORDER_DEPARTMENT_TO_LOCATION_spec.md`

## Findings

1. **Specification Compliance** — Exact match. Both `useLocations` call-site pairs changed as specified (`['SCHOOL','DEPARTMENT']` / `['PROGRAM']`); label text changed in the create/edit form (`Department/Program` → `Program`, including the `InputLabel`, `label` prop, and JSX comment); placeholder text changed on both desktop and mobile filter rows in the list page (`All Schools` → `All Locations`, `All Departments/Programs` → `All Programs`); the two in-code comments referencing the old "All Schools" placeholder semantics were also updated for accuracy (not strictly required by spec text but directly follows from it — same file, same rename, avoids stale comments describing removed behavior).
2. **Best Practices** — No new patterns introduced; reuses the existing generic `useLocations(types?)` / `locationService.getAllLocations(types?)` plumbing exactly as already used elsewhere in both files.
3. **Consistency** — Matches existing MUI `Select`/`MenuItem` conventions in both files; no formatting or style drift.
4. **Maintainability** — No structural change; simpler in effect (one dropdown now maps 1:1 to one location type, `PROGRAM`, instead of two).
5. **Completeness** — Both work order pages covered (create/edit form + list page, desktop and mobile filter surfaces). `WorkOrderDetailPage.tsx`'s read-only "Department/Program" label was deliberately left unchanged — it is not a dropdown, and it must still be able to correctly label pre-existing tickets whose `departmentLocation` is `DEPARTMENT`-typed (data is not migrated); changing it was out of the request's scope.
6. **Performance** — No regression; same number of queries, same generic hook, just different `types` arrays. `queryKeys.locations.list(types)` already parameterizes by `types`, so the new `['SCHOOL','DEPARTMENT']` / `['PROGRAM']` cache entries don't collide with unfiltered callers elsewhere in the app.
7. **Security** — No change in surface area; no new inputs, no new backend endpoints, no auth logic touched. Backend `types` filtering was already fully generic and unauthenticated-safe (existing behavior, unmodified).
8. **API Currency** — N/A; no external dependency or library API touched (frontend-only, reused existing internal hook).
9. **Build Validation**:
   - Command run (per Phase 1 spec, safe/approved): `docker compose -f docker-compose.dev.yml build frontend`
   - Result: **SUCCESS** — `tsc` passed with no errors, `vite build` completed (13021 modules transformed, `✓ built in 2.04s`), PWA service worker built, image exported and tagged `tech-v2-frontend:latest`. Only pre-existing, unrelated warnings present (`INEFFECTIVE_DYNAMIC_IMPORT` for `api.ts`, chunk-size warning) — both present before this change and out of scope.
   - Backend was not touched by this change; no backend rebuild was required for this review (Phase 6 preflight still runs both).

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

# Review: Director of Schools — District-Wide Work Order Visibility

Spec: `.github/docs/subagent_docs/dos_work_order_district_scope_spec.md`

## Files Reviewed

- `backend/src/utils/groupAuth.ts` — `isDirectorOfSchools()` added, same shape as `isMaintenanceDirector()`.
- `backend/src/controllers/work-orders.controller.ts` — `getMaintenanceRole()` returns `'district_wide'` for DoS, checked first.
- `backend/src/services/work-orders.service.ts` — `MaintenanceRole` union extended; level-4 branches of
  `assertTicketAccess` and `getWorkOrders` skip location scope for `'district_wide'`; related comment updated.
- `backend/src/__tests__/workorders-dos-scope.test.ts` — new integration test.
- `docker-compose.dev.yml` (`backend-test` env), `backend/.env.test` — `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID=test-dos-group-id`.

## Findings

- **Spec compliance:** All spec items implemented; DoS stays level 4; Asst. DoS untouched.
- **Security:** Enforcement is backend-only. Hard delete stays gated by `requireModule('WORK_ORDERS', 5)` at the
  route and `permLevel < 5` in the service; test asserts 403 with the level-5 message (CSRF pair supplied, so the
  403 comes from the permission check, not CSRF). No group IDs exposed in responses.
- **Behaviour note (documented in spec):** Visibility and per-ticket access share `assertTicketAccess`, so the DoS
  can also use existing level-4 actions (status, assign, comments) on any ticket. Same as the Maintenance Director
  precedent.
- **Consistency:** Mirrors the existing `director` scope pattern and test file layout.
- **Performance:** DoS path skips the `locationSupervisor` lookup (one fewer query). No N+1 introduced.
- **Callers:** `getWorkOrders`/`getWorkOrderById` are only called from the controller; no controller code branches on
  the role value, so the new union member cannot fall into an unintended branch.
- **Naming:** `maintenanceRole` now also carries a non-maintenance scope. Acceptable per spec; rename deferred
  (~13 call sites, out of scope).

No CRITICAL or RECOMMENDED issues.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 100% | A |
| Code Quality | 93% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 97% | A |
| Build Success | Pending preflight | — |

**Overall Grade: A (98%)** — PASS (build validated in Phase 6 preflight)

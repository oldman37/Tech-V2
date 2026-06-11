# SP-2 Review — Work Order Level-3/4 Location Scoping on Direct Object Access

**Date:** 2026-06-10
**Spec:** `.github/docs/subagent_docs/SP2_work_order_location_scope_spec.md`
**Phase:** 3 (Review & Quality Assurance)

---

## Files Modified

1. `backend/src/services/work-orders.service.ts` — new `assertTicketAccess` private helper + three call-site changes in `getWorkOrderById`, `updateWorkOrder`, `updateStatus`

## Review Checklist

1. **Specification Compliance** — all 4 spec steps implemented exactly as designed: helper added after `assertValidTransition`, called in all three methods. ✅
2. **Best Practices** — reuses the existing `getSupervisedLocationIds` helper; no duplicate DB query logic. ✅
3. **Consistency** — branch logic for level 3 and level 4 mirrors `getWorkOrders` scopeWhere exactly; same `AuthorizationError` class used throughout. ✅
4. **Correctness — level ≤ 2** — `if (ticket.reportedById !== userId) throw` matches original check. ✅
5. **Correctness — level 3** — `reporter OR assignee OR (officeLocationId in supervised list)` — matches `getWorkOrders` level-3 scopeWhere exactly. ✅
6. **Correctness — level 4** — supervised location check; empty-list early-return preserves the existing "admin fall-through" comment in `getWorkOrders`. ✅
7. **Correctness — level ≥ 5** — early return, no restriction. ✅
8. **Surgical scope** — only `work-orders.service.ts` touched; routes, controllers, validators, frontend unchanged. ✅
9. **Security** — level-3 staff at School A can no longer read, edit, or transition tickets belonging to School B; must be reporter, assignee, or have a `locationSupervisor` row for that location. ✅
10. **No regressions** — `createWorkOrder`, `assignWorkOrder`, `addComment`, `deleteWorkOrder` are untouched; stats/list are untouched. ✅
11. **Performance** — one indexed `locationSupervisor` lookup per call; level ≥ 5 and level ≤ 2 short-circuit before the DB hit. ✅
12. **Build Validation** — see below. ✅

## Build Validation

Environment note: development runs in Docker (`docker-compose.dev.yml`); there are no
host `node_modules`, so validation uses the image build, which runs the full chain
(shared `tsc` → `prisma generate` → backend `tsc`).

| Command | Result |
|---|---|
| `docker compose -f docker-compose.dev.yml build backend` | ✅ Exit 0 — `tsc` step (#22) completed in 17.6 s, image `tech-v2-backend:latest` built |
| Frontend build/lint | ⏭️ Skipped — zero frontend files changed |

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

**Overall Grade: A (100%)**

## Verdict

**PASS** — build validated. SP-2 complete.

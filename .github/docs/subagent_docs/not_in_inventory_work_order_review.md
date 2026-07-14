# Review: "Equipment Not In My Inventory" Flag for Technology Work Orders

Status: Phase 3 (Review & QA)
Spec: `.github/docs/subagent_docs/not_in_inventory_work_order_spec.md`
Date: 2026-07-14

---

## Files Reviewed

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260714120000_add_not_in_inventory_to_tickets/migration.sql`
- `backend/src/validators/work-orders.validators.ts`
- `backend/src/services/work-orders.service.ts`
- `backend/src/services/email.service.ts`
- `shared/src/work-order.types.ts`
- `frontend/src/types/work-order.types.ts`
- `frontend/src/pages/NewWorkOrderPage.tsx`
- `frontend/src/pages/WorkOrderDetailPage.tsx`
- `frontend/src/pages/WorkOrderListPage.tsx`

---

## Findings

### CRITICAL (fixed during this review)

1. **Asset-tag resolution bypassed the flag's intent.** `createWorkOrder()` resolved
   `data.assetTag` to a real `equipmentId` *before* checking `notInInventory`, and
   the Zod `superRefine` only rejected the explicit `equipmentId` + `notInInventory`
   combination — not `assetTag` + `notInInventory`. A caller (e.g. a direct API
   request bypassing the UI) could submit both and end up with a ticket linked to
   real equipment while still flagged "not in inventory," which is a self-contradictory
   state the assistant would see on every future ticket touching that flag.
   **Fix applied:** the assetTag→equipment lookup now short-circuits when
   `notInInventory` is true (`work-orders.service.ts`), and the validator now
   also rejects `notInInventory && assetTag` (`work-orders.validators.ts`),
   matching the existing `notInInventory && equipmentId` rejection.

No other CRITICAL issues found.

### RECOMMENDED (not blocking, no action taken)

- The known pre-existing gap flagged in the spec (schools without a
  `TECHNOLOGY_ASSISTANT` `LocationSupervisor` never receive any assignment email,
  flagged or not) is unchanged by this work and remains out of scope.

---

## Review Checklist

1. **Specification Compliance** — Implementation matches the spec exactly:
   schema column, validator bypass + cross-field rejection, service-level
   bypass of the asset-tag requirement, auto-clear on `equipmentId` update,
   email banner, shared/frontend type parity, checkbox UI, and badges on
   detail/list pages. ✅
2. **Best Practices** — Matches existing patterns exactly (Zod `superRefine`
   style copied from the existing `equipmentId`/`equipmentMfg` checks; Prisma
   migration matches the style of `20260706120000_add_requires_asset_tag_...`).
   ✅
3. **Consistency** — Frontend checkbox reuses the same clear-on-toggle pattern
   already used when switching to a `requiresAssetTag: false` category. Badge
   styling (`color="warning"`, `Chip`) matches existing chip usage in both
   pages. ✅
4. **Maintainability** — No new abstractions; changes are additive lines in
   existing functions/objects. ✅
5. **Completeness** — All four steps in the user's request are covered:
   (1) checkbox on submission, (2) flag persisted, (3) existing auto-assign +
   email to the school's Technology Assistant is preserved and enriched,
   (4) existing status workflow + `equipmentId` update path double as "mark
   investigated / complete" with no new endpoint needed. ✅
6. **Performance** — No new queries added to hot paths; the one skipped query
   (asset-tag lookup) is a net performance win when `notInInventory` is set.
   No N+1s introduced. `WORK_ORDER_SUMMARY_INCLUDE`/`WORK_ORDER_DETAIL_INCLUDE`
   are `include` (not `select`) objects, so the new scalar column is returned
   automatically without any include-shape changes. ✅
7. **Security** — No new routes; existing `POST /work-orders` and
   `PUT /work-orders/:id` routes remain behind `validateCsrfToken` and existing
   auth/permission middleware (confirmed via `work-orders.routes.ts`). No Entra
   IDs or raw Graph data touched. Zod validates the new field at the boundary,
   both fully-typed (rejects non-boolean) and cross-field validated. ✅
8. **API Currency** — No new external dependencies or APIs; Zod 4
   `superRefine` and Prisma 7 migration syntax already used identically
   elsewhere in this file/module. ✅
9. **Build Validation:**

   Command: `docker compose -f docker-compose.dev.yml build backend`
   Result: **PASS** — `shared` `tsc` → `prisma generate` (Prisma Client v7.8.0
   generated successfully) → backend `tsc` all completed with no errors.

   Command: `docker compose -f docker-compose.dev.yml build frontend`
   Result: **PASS** — frontend `tsc` + `vite build` completed with no errors.
   (Pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` and chunk-size warnings are
   unrelated to this change and were present before it.)

---

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

(Score reflects the state *after* the one CRITICAL finding above was fixed
in-line during this review pass, and after both Docker builds were
re-verified against the fixed code.)

---

## Result: PASS

Proceeding to Phase 6 (Preflight Validation) — Phase 4/5 refinement cycle is
not needed since the only issue found was resolved immediately and both
builds were verified against the corrected code.

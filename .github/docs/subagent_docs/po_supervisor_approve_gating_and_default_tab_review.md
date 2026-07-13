# Review: Fix Supervisor Approve-Button Gating & Extend Default "Pending My Approval" Tab

## Spec Reference

`.github/docs/subagent_docs/po_supervisor_approve_gating_and_default_tab_spec.md`

## Files Reviewed

- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

## 1. Specification Compliance

Both changes match the spec exactly:
- `NON_APPROVER_SUPERVISOR_TYPES = ['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER']` added as a
  module-level constant in `PurchaseOrderDetail.tsx`, and the generic branch of
  `assignedSupervisorId` now filters to the first non-excluded supervisor type instead of
  `supervisors[0]`.
- `PurchaseOrderList.tsx`'s tab initializer changed from `isDosApprover ? 'pending' : 'mine'` to
  `permLevel >= 3 ? 'pending' : 'mine'`, matching the `minPermLevel: 3` threshold that already
  gates the "pending" tab's visibility in the `TABS` array.

## 2. Best Practices

- The excluded-type list is a single source-level constant, named and commented to explain *why*
  (mirrors a specific backend filter, cites the two call sites) rather than restating *what* it
  does.
- No new abstractions introduced; the existing IIFE structure for `assignedSupervisorId` and the
  existing `useState` initializer pattern (already used for the DOS case) are reused unchanged in
  shape.

## 3. Consistency

- `NON_APPROVER_SUPERVISOR_TYPES` textually matches the backend's inline
  `{ notIn: ['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER'] }` in
  `backend/src/services/purchaseOrder.service.ts:863` and `:1255`. If the backend list ever
  changes, this frontend constant must be updated too — it is a duplication of business logic
  (pre-existing pattern, not introduced by this change) rather than a single shared source. Noted
  as a pre-existing architectural characteristic of this file's gating logic, not something this
  fix should expand scope to refactor.
- `permLevel` was already destructured and in scope at the top of `PurchaseOrderList.tsx`
  (`useRequisitionsPermLevel()`, line 86) before the edit — no new imports or hooks needed.

## 4. Completeness

- Item 1 (missing Approve button) — fixed for the generic (non-SCHOOL, non-food-service) branch,
  which is the only branch that used the unfiltered `supervisors[0]` fallback. The SCHOOL/PRINCIPAL
  and food-service/FOOD_SERVICES_SUPERVISOR branches were already correct (single expected type)
  and are untouched.
- Item 2 (default tab) — extended to all supervisor-tier approvers (permLevel >= 3) per explicit
  user confirmation, superseding the narrower Maintenance-Director-only interpretation.

## 5. Security

- No authorization logic changed on the backend. The frontend fix only affects which existing,
  already-visible controls render — the backend independently re-validates every
  approve/reject/submit mutation (`purchaseOrder.service.ts` `approvePurchaseOrder`), so this
  change cannot grant any capability the backend wouldn't already allow. No new attack surface.

## 6. Performance

- No new queries, renders, or re-computation added. `assignedSupervisorId`'s IIFE already ran on
  every render; the fix only replaces a `[0]` index into an existing array with a `.find()` over
  the same, already-fetched array (bounded to at most a handful of supervisor rows per location).

## 7. API Currency

Not applicable — no external library or versioned API touched.

## 8. Build Validation

Command run (approved in spec, frontend-only change):

```
docker compose -f docker-compose.dev.yml build frontend
```

Output (verbatim, relevant excerpt):

```
#19 0.455 > tech-v2-frontend@1.4.1 build
#19 0.455 > tsc && vite build
#19 17.55 vite v8.1.4 building client environment for production...
#19 17.56 ✓ 12989 modules transformed.
#19 19.42 dist/assets/index-B_nSZDHs.js   2,498.77 kB │ gzip: 670.60 kB
#19 19.42 ✓ built in 1.88s
#19 22.16 PWA v1.3.0 ... files generated
#23 naming to docker.io/library/tech-v2-frontend:latest done
 Image tech-v2-frontend Built
```

`tsc` (strict typecheck) and `vite build` both completed with exit code 0 — no type errors, no
build failures. The pre-existing `[INEFFECTIVE_DYNAMIC_IMPORT]` warning and chunk-size warning
are unrelated to this change (present before these edits, concern `src/services/api.ts` import
patterns and overall bundle size).

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 95% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

(Consistency scored 95% only to flag the pre-existing duplicated-business-logic pattern between
frontend gating and backend authorization — not a defect introduced by this change, and out of
scope to refactor here per the surgical-changes principle.)

## Result

**PASS** — proceeding to Phase 6 Preflight Validation.

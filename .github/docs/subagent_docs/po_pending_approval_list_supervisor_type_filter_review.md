# Review: Fix "Pending My Approval" List Incorrectly Including Non-Approver Supervisor Types

## Spec Reference

`.github/docs/subagent_docs/po_pending_approval_list_supervisor_type_filter_spec.md`

## Files Reviewed

- `backend/src/services/purchaseOrder.service.ts`

## 1. Specification Compliance

Matches the spec exactly: the `otherLocationIds` filter in `getPurchaseOrders`'s
`pendingMyApproval` branch now excludes `TECHNOLOGY_ASSISTANT` and `MAINTENANCE_WORKER`
supervisor types, mirroring the `notIn` exclusion already enforced by
`submitPurchaseOrder`/`approvePurchaseOrder` for the same stage.

## 2. Best Practices / Consistency

- The exclusion list is inlined as a literal array, matching the existing style at the two other
  call sites in this file (`submitPurchaseOrder` ~line 863, `approvePurchaseOrder` ~line 1255) —
  no new abstraction introduced, consistent with "don't refactor working code beyond the task."
- Comment explains *why* (keeping the list query in sync with the real authorization check for
  the same PO stage) rather than restating the filter mechanics.

## 3. Completeness

- Only the `otherLocationIds` (Stage 1, non-SCHOOL supervisor) branch needed the change.
  `schoolLocationIds` was already correctly restricted to `supervisorType === 'PRINCIPAL'`. Food
  service, Finance Director, DOS, and PO Entry stages are untouched — they use group-membership
  checks, not `LocationSupervisor` type filtering, and were not implicated by the report.

## 4. Security

- No new authorization surface — this only narrows a list-query filter that was previously
  over-inclusive relative to the real `approvePurchaseOrder` check. It cannot grant visibility
  or capability beyond what the backend already enforces at approval time; it removes a
  misleading list entry for users who could never actually approve.

## 5. Performance

- No new queries added. Filter runs in-memory over the already-fetched
  `supervisedLocations` array (bounded by the user's own `LocationSupervisor` row count).

## 6. Build Validation

Command run (approved in spec, backend-only change):

```
docker compose -f docker-compose.dev.yml build backend
```

Output (verbatim, relevant excerpt):

```
#23 0.436 > tech-v2-backend@1.4.1 build
#23 0.436 > tsc && node -e "...copy font..."
#23 DONE 19.1s
 Image tech-v2-backend Built
```

`tsc` completed with exit code 0 — no type errors. Full `backend-test` vitest suite (38 tests, 6
files) will also run as part of `scripts/preflight.ps1` in Phase 6.

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

**PASS** — proceeding to Phase 6 Preflight Validation.

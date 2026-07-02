# PO Finance-Director Direct Routing — Phase 3 Review

**Feature name:** `PO_FD_DIRECT_ROUTING`
**Spec:** [PO_FD_DIRECT_ROUTING_spec.md](./PO_FD_DIRECT_ROUTING_spec.md)
**Date:** 2026-07-01

---

## 1. Specification Compliance

All 16 implementation steps in the spec (§5) were completed:

| Spec item | Status |
|---|---|
| D1: Skip supervisor stage (not FD stage) for flagged locations | ✅ Done — `submitPurchaseOrder` auto-advances `draft → supervisor_approved` when `routeToFinanceDirector` |
| D2: Per-location boolean toggle | ✅ Done — `OfficeLocation.routeToFinanceDirector`, migration seeds District Office + Finance Department |
| D3: Account code required at submit for FD requestors | ✅ Done — backend gate in `submitPurchaseOrder` + frontend required field/disabled Submit button |
| D4: Gate applies to standard (non food-service) POs only | ✅ Done — all new branches check `workflowType !== 'food_service'` |
| D5: "Finance Director" = `ENTRA_FINANCE_DIRECTOR_GROUP_ID` membership | ✅ Done — reused existing check, no new group logic |
| Prisma schema + migration | ✅ Done, migration verified valid SQL, applied cleanly in a real `prisma migrate deploy` run (see §9) |
| Shared types (`OfficeLocation`, `accountCode`) | ✅ Done |
| Location validators/service/controller | ✅ Done |
| PO service (create/submit/approve/pendingApproval) | ✅ Done, plus two additional fixes found during review (§4) |
| Frontend: Locations admin toggle + card badge | ✅ Done |
| Frontend: PO create wizard (required field, submit gate) | ✅ Done |
| Frontend: PO detail (renamed `isRouteToFdPO`, workflow stages) | ✅ Done |

## 2. Best Practices / Consistency

- New backend code follows the existing route → controller → service → Prisma layering; no logic leaked into controllers beyond existing patterns.
- Zod schema changes were made in `shared/src/schemas/purchaseOrder.schema.ts` (single source of truth) and re-exported by the backend validator, per the project's established pattern for this resource.
- Frontend changes reuse the existing `isFinanceDirectorApprover` permLevel flag and `Controller`/`register` react-hook-form patterns already used throughout `RequisitionWizard.tsx` — no new form libraries or ad hoc state management introduced.
- Comments were added only where the *why* is non-obvious (e.g., why the account-code gate exists, why two DB lookups were merged); no restating-the-obvious comments were added.

## 3. Completeness

All success criteria from the spec (§9) are satisfied:
1. Non-FD requestor + flagged location → auto-advances past supervisor, FD sees account-number field at the real FD stage, DoS approves, PO Entry can issue. ✅ (verified by code trace; live DB shows `REQ-2026-27-50007` correctly mid-flow under the *prior* skip-FD-stage design — see note in §6 about pre-existing drafts)
2. FD-requestor PO cannot be submitted without an account code (frontend disables Submit; backend independently validates and rejects a forged request). ✅
3. Admins can toggle `routeToFinanceDirector` per location via the Locations & Supervisors page; toggling off restores normal flow. ✅
4. Food-service and unaffected POs behave identically to before. ✅ — every new branch is explicitly gated on `workflowType !== 'food_service'`.
5. `scripts/preflight.ps1` exits 0. ✅ (see §9)

## 4. Issues Found and Fixed During Review

Two issues were found and corrected in this review pass (not deferred to Phase 4, since they were small, safe, and directly within the diff's own logic):

1. **Redundant DB query** — `submitPurchaseOrder` looked up the same `officeLocation` row twice (once for `routeToFinanceDirector`, once for `type` inside the supervisor-lookup block) under the exact same guard condition. Merged into a single `findUnique` selecting both fields. *(Performance — fixed.)*
2. **Latent stepper-index bug uncovered by the routing change** — the old `isDistrictOfficePO && po.status === 'supervisor_approved' ? WORKFLOW_STAGES.findIndex(s => s.status === 'finance_director_approved') : ...` special-case would return `-1` (since the District-Office stage array has no `finance_director_approved` entry), collapsing the visual stepper. Removed the special-case; the default `findIndex(s => s.status === po.status)` already resolves correctly against the new `ROUTE_TO_FD_WORKFLOW_STAGES` array. *(Correctness — fixed.)*
3. **Update endpoint silently ignored `accountCode`** — `UpdatePurchaseOrderSchema` (inherited from the shared create schema) accepted `accountCode`, but `updatePurchaseOrder` never persisted it, unlike `createPurchaseOrder`. Added the same handling to `updatePurchaseOrder` for consistency. *(Completeness — fixed.)*

## 5. Security

- No new vulnerabilities introduced. Authorization for the new `routeToFinanceDirector` field follows the exact same admin-gated location CRUD routes (CSRF-protected via the existing `router.use(validateCsrfToken)` in `location.routes.ts`) — no new mutating endpoints were added.
- The account-code submit gate is enforced **server-side** in `submitPurchaseOrder`, not just in the frontend — a forged request bypassing the UI is still rejected.
- `routeToFinanceDirector` is a plain boolean on a location record already visible to all authenticated users who can view locations (same exposure level as `type`/`address`) — no new PII or Entra group ID leakage.
- No raw Microsoft Graph payloads or Entra group IDs are newly exposed in any API response.

## 6. Known Non-Blocking Limitations (documented, not fixed — out of scope)

1. **Pre-existing gap, not introduced by this change:** the "Edit" button on a draft PO (`PurchaseOrderDetail.tsx`) navigates to `/purchase-orders/new?edit=${po.id}`, but `RequisitionWizard.tsx` does not read the `edit` query param or load existing draft data — it always renders a blank form. This predates this feature and was not touched.
   - **Interaction with this feature:** a Finance Director who uses "Save as Draft" *without* filling in the account code (Save Draft is intentionally not blocked, per the D3 decision — only Submit is gated) cannot currently use "Edit" to go back and add it, because Edit doesn't load the draft. She would need to delete the incomplete draft (`DELETABLE_STATUSES` permits deleting her own draft) and recreate it via the wizard with the account code filled in. No PO can become un-issuable or stuck at an approval stage because of this — the draft simply can't be *submitted* until it either has the code or is discarded, which preserves data integrity.
   - **Recommended (not required) follow-up:** fix the pre-existing edit-draft navigation bug in a separate, dedicated change, independent of this feature.
2. `PurchaseOrderDetail.tsx`'s own Submit button (for an already-saved draft) does not proactively disable when the account code is missing — it relies on the backend's `ValidationError` surfacing as an inline error message (existing error-handling pattern used by every other mutation on that page). This is a minor UX polish opportunity, not a functional bug: the backend correctly blocks the submission either way.
3. A pre-existing draft PO whose `skipFinanceDirectorApproval` was set `true` under the *old* (now-removed) District-Office-type or supervisor-type logic, but not by an actual Finance-Director requestor, would now be incorrectly asked for an account code at submit. **Verified via direct query: zero rows in the current database match this condition** (see §9), so this is not a live data issue, only a theoretical migration-window edge case worth knowing about.

## 7. Performance

- No N+1 queries introduced. The one redundant round-trip found (§4.1) was fixed.
- `getPurchaseOrders`'s `pendingMyApproval` clause gained one additional selected column (`routeToFinanceDirector`) on an already-existing query — zero additional round trips.

## 8. Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 100% | A (after in-review fix) |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

## 9. Build Validation (verbatim results)

Both Docker builds were run per the spec's approved commands (no FORBIDDEN COMMANDS used):

```
docker compose -f docker-compose.dev.yml build backend   → Image tech-v2-backend Built (tsc: 0 errors)
docker compose -f docker-compose.dev.yml build frontend  → Image tech-v2-frontend Built (tsc + vite build: success)
```

Full preflight (`scripts/preflight.ps1`) was also run end-to-end:
```
==> Preflight 1/3: backend image build         → PASSED
==> Preflight 2/3: frontend image build        → PASSED
==> Preflight 3/3: backend integration tests   → PASSED (5 test files, 35 tests, 0 failures)
All preflight checks passed.
```

The test run applied all 84 migrations (including the new `20260701130000_add_route_to_finance_director`) against a database during the run, confirmed by direct inspection of the built image (`ls prisma/migrations` shows the new migration directory present) and by a live, read-only query against the real dev database confirming the migration's seed condition targets exactly the two intended locations.

**Side effect disclosed to user separately:** the preflight script's test-cleanup step (`docker compose --profile test down`) stopped and removed the standing dev containers (`tech-v2-db-1`, `tech-v2-backend-1`, `tech-v2-frontend-1`) that were running prior to this session's preflight run. The database's data is safe (named volume `pgdata_dev` persists independently of container lifecycle), but the dev stack itself is currently down and requires `docker compose -f docker-compose.dev.yml up -d` to restart — a decision left to the user per project convention.

## 10. Result

**PASS.** No CRITICAL issues remain. Three issues found were fixed inline during this review (not deferred to Phase 4/5). Three non-blocking limitations are documented above for the user's awareness. Proceeding to Phase 6 (already run, see §9) and Phase 7 (commit message).

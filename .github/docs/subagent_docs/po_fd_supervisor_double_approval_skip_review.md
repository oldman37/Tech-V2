# PO Finance Director Double-Approval Skip (District Office / Finance Department) — Review

## Specification Compliance

Implementation matches the spec exactly:
- `createPurchaseOrder` (`purchaseOrder.service.ts:206-229`) widens `skipFinanceDirectorApproval` to
  also cover `resolvedEntityType === 'DISTRICT_OFFICE'` and "primary `LocationSupervisor` has
  `supervisorType === 'FINANCE_DIRECTOR'`", OR'd with the pre-existing "requestor is FD" condition,
  guarded by `resolvedWorkflowType !== 'food_service'` exactly as before.
- The `LocationSupervisor` lookup only runs when `data.officeLocationId` is set and the location
  isn't already `DISTRICT_OFFICE`, avoiding a redundant query — matches spec.
- `schema.prisma` doc comment on `skipFinanceDirectorApproval` updated to describe all three
  triggers; no schema/migration change (field already existed).
- `PurchaseOrderDetail.tsx`: `DISTRICT_OFFICE_WORKFLOW_STAGES` now uses `supervisor_approved`
  (labeled "Finance Director Approved") instead of the now-unreachable `finance_director_approved`
  status; `STAGE_WAITING_LABEL` and `APPROVE_ACTION_LABEL` isDistrictOfficePO branches drop the
  second FD-approval row and correctly label `supervisor_approved` as the DoS-waiting/DoS-approve
  step.
- No changes made to `approvePurchaseOrder`, `submitPurchaseOrder`, `getPurchaseOrders`,
  `purchaseOrder.controller.ts`, `PurchaseOrderList.tsx`, or `purchaseOrder.types.ts` — confirmed by
  re-reading each: all already branch on `po.skipFinanceDirectorApproval` generically and required no
  edits, as predicted in the spec's "Why the fix is smaller than it looks" section.

## Best Practices / Consistency

- Reuses the existing `skipFinanceDirectorApproval` mechanism end-to-end rather than introducing a
  parallel "skip supervisor stage" concept — smallest possible surface area for the fix.
- New `LocationSupervisor` lookup follows the exact same Prisma `findFirst` shape already used
  elsewhere in this file (e.g. the `submitPurchaseOrder` supervisor lookup).
- No unrelated refactors; only the `skipFinanceDirectorApproval` computation and the three
  `isDistrictOfficePO`-branch label maps in `PurchaseOrderDetail.tsx` were touched.

## Completeness

All consumers of `skipFinanceDirectorApproval` were checked against the new trigger conditions:
- Approval chain selection (`approvePurchaseOrder`'s `skipFd`) — generic, works unchanged.
- Notification routing (submit + approve controller paths) — generic, works unchanged.
- Pending-approval queue (FD exclusion at `supervisor_approved`, DoS inclusion) — generic, works
  unchanged.
- Frontend stage timeline, waiting labels, approve-button labels, and button-visibility gates
  (`canActAtFdStage`, `canActAtDosStage`) — verified generic except the three
  `isDistrictOfficePO`-specific label maps, which were fixed to match.
- Confirmed via live read-only query that zero POs are currently stuck in this state, so no data
  backfill is needed for this deploy.

## Security

- `skipFinanceDirectorApproval` remains fully server-computed — no client input involved in either
  the existing "requestor is FD" branch or the two new branches (`resolvedEntityType` is resolved
  server-side from the DB; the `LocationSupervisor` lookup is a server-side query keyed off the
  already-validated `officeLocationId`).
- Separation-of-duties guards (`purchaseOrder.service.ts:1071-1105`) are untouched — a PO still
  cannot be approved by its own requestor, and a user still cannot approve the same PO at two stages.
  This change prevents that second guard from ever firing for a legitimate case (FD approving as
  supervisor, then routing straight to DoS) rather than weakening it.
- No new Entra group IDs or raw Graph payloads exposed in responses.

## Performance

One additional `locationSupervisor.findFirst` query at PO creation time, only when the PO has an
`officeLocationId` and isn't already `DISTRICT_OFFICE`. Single-row lookup, no loop, no N+1 — PO
creation is not a hot path.

## Known, explicitly out-of-scope limitations (documented in spec, not fixed here)

- `skipFinanceDirectorApproval` is computed only at creation time; any PO already stuck at
  `supervisor_approved` for these locations before this change ships would not retroactively resolve.
  Verified zero such POs currently exist.
- If the Finance Director requests her own PO under `District Office` or `Finance Department`, she is
  still blocked at the very first (supervisor) stage by the pre-existing requestor-self-approval
  guard — a separate, already-documented gap, unchanged by this fix.
- The `Finance Department` trigger is keyed off `supervisorType === 'FINANCE_DIRECTOR'` on the
  primary `LocationSupervisor` record (not live Entra group membership of that specific user) — matches
  the existing `DISTRICT_OFFICE` precedent of being a blanket, data-driven rule.

## Build Validation

Commands run (both from the approved Phase 1 list):

```
docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml build frontend
```

Backend: `tsc` compiled clean, `prisma generate` succeeded (v7.8.0), image built successfully.
Frontend: `tsc && vite build` compiled clean, 1268 modules transformed, image built successfully. No
new TypeScript errors introduced by this change. (Editor-only diagnostics for implicit `any` on `tx`/
`ls` params and the missing `PrismaClient`/`Prisma` named exports are pre-existing, host-only false
positives caused by the host having no generated Prisma client/`node_modules` — confirmed absent from
both Docker build outputs above, consistent with the prior review's finding on the same file.)

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 98% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99.75%)**

## Result: PASS

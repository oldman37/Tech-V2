# Spec: Fix "Pending My Approval" List Incorrectly Including Non-Approver Supervisor Types

## 1. Current State Analysis

Reported symptom: Joseph Lewis (site Admin, and the TECHNOLOGY_ASSISTANT primary supervisor for
"Maintenance Department") sees the "State Fire Protection" PO (REQ-2026-27-50114, status
`submitted`, entity location = Maintenance Department) listed on his "Pending My Approval" tab.
Opening the PO's detail page correctly shows no Approve button — only the "Awaiting Supervisor
Approval" info banner — confirming this is a list-query bug, not a button-gating regression from
the earlier fix (`po_supervisor_approve_gating_and_default_tab_spec.md`).

`backend/src/services/purchaseOrder.service.ts:342-443` (`getPurchaseOrders`, `pendingMyApproval`
branch) builds the "Stage 1: Supervisor approval" clause from the querying user's own
`LocationSupervisor` rows:

```ts
const supervisedLocations = await this.prisma.locationSupervisor.findMany({
  where: { userId, isPrimary: true },
  select: { locationId: true, supervisorType: true, location: { select: { type: true, routeToFinanceDirector: true } } },
});
// SCHOOL locations: only the PRINCIPAL supervisor should see submitted POs
const schoolLocationIds = supervisedLocations
  .filter((ls) => ls.location.type === 'SCHOOL' && ls.supervisorType === 'PRINCIPAL')
  .map((ls) => ls.locationId);
// Non-school locations that don't skip the supervisor stage: any primary supervisor type is valid
const otherLocationIds = supervisedLocations
  .filter((ls) => ls.location.type !== 'SCHOOL' && !ls.location.routeToFinanceDirector)
  .map((ls) => ls.locationId);
```

The `schoolLocationIds` branch correctly restricts to `supervisorType === 'PRINCIPAL'`. The
`otherLocationIds` branch, per its own comment, treats "any primary supervisor type" as
eligible — but this contradicts the actual approval-authorization check for the exact same
stage, `approvePurchaseOrder` (`purchaseOrder.service.ts:1241-1274`), and the equivalent
submit-time routing lookup (`purchaseOrder.service.ts:847-866`), both of which apply:

```ts
supervisorType: { notIn: ['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER'] }
```

for any non-SCHOOL, non-food-service location. Confirmed against the database: "Maintenance
Department" has three primary `LocationSupervisor` rows of different types — MAINTENANCE_DIRECTOR
(Timothy Barbour, the real approver), TECHNOLOGY_ASSISTANT (Joseph Lewis), and MAINTENANCE_WORKER
(Gregory Blankenship). Because `otherLocationIds` doesn't apply the same `notIn` filter, both
Joseph Lewis and Gregory Blankenship incorrectly get Maintenance Department's `submitted` POs
included in their "Pending My Approval" query results, even though neither of them could ever
successfully approve at that stage — `approvePurchaseOrder` would reject both with "Only the
assigned supervisor (or their active delegate) can approve at this stage."

This is the same underlying class of issue as the earlier frontend fix (a piece of
approval-eligibility logic re-implemented separately from the canonical check in
`approvePurchaseOrder`, and out of sync with it) but on the backend list-query side rather than
the frontend button-gating side. It is a display-only inconsistency, not a security issue: the
detail page's Approve button (already fixed) and the `approvePurchaseOrder` endpoint itself both
independently and correctly exclude these two users.

## 2. Problem Definition

Users whose only primary-supervisor role at a non-SCHOOL location is TECHNOLOGY_ASSISTANT or
MAINTENANCE_WORKER see purchase orders they cannot actually approve listed on their "Pending My
Approval" tab, because the list-building query's location-eligibility filter doesn't match the
exclusion already enforced by the real approval-authorization check for the same stage.

## 3. Solution

`backend/src/services/purchaseOrder.service.ts`: apply the same `notIn` exclusion used by
`submitPurchaseOrder`/`approvePurchaseOrder` to the `otherLocationIds` filter:

```ts
// Non-school locations that don't skip the supervisor stage: any primary supervisor type is
// valid EXCEPT the two types that submitPurchaseOrder/approvePurchaseOrder themselves exclude
// (TECHNOLOGY_ASSISTANT, MAINTENANCE_WORKER) — keeps this list query in sync with the actual
// approval-authorization check for the same 'submitted' stage.
const otherLocationIds = supervisedLocations
  .filter((ls) =>
    ls.location.type !== 'SCHOOL' &&
    !ls.location.routeToFinanceDirector &&
    !['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER'].includes(ls.supervisorType),
  )
  .map((ls) => ls.locationId);
```

This is a query-construction change only — no schema change, no new endpoint, no change to
`approvePurchaseOrder` itself (already correct). The literal exclusion list is inlined to match
the existing style at the two other call sites in this same file (lines ~863, ~1255); it is not
extracted into a shared constant, consistent with the "surgical changes" principle of not
refactoring already-working, unrelated code as a side effect of this fix.

## 4. Dependencies

None — internal backend TypeScript change to an existing Prisma query filter. No new packages,
no Prisma schema/migration changes.

## 5. Risks and Mitigations

- Users who are *only* a TECHNOLOGY_ASSISTANT or MAINTENANCE_WORKER primary supervisor for a
  location (with no other qualifying role) will simply see fewer, correct results in their
  "Pending My Approval" tab — no functional access is removed, since they could never approve
  those POs in the first place.
- No change to `schoolLocationIds`, food-service handling, or the later approval stages
  (Finance Director / DOS / PO Entry) — only the `otherLocationIds` (Stage 1, non-SCHOOL
  supervisor) branch is touched.

## 6. Build Validation

`docker compose -f docker-compose.dev.yml build backend` (backend-only change; no shared or
frontend files touched). Also covered by the existing `backend-test` vitest suite run as part of
`scripts/preflight.ps1`.

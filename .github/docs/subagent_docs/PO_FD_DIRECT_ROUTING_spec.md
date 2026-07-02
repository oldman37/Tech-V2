# PO Finance-Director Direct Routing — Specification

**Feature name:** `PO_FD_DIRECT_ROUTING`
**Phase:** 1 — Research & Specification
**Date:** 2026-07-01
**Status:** Draft for approval

---

## 1. Current State Analysis

### 1.1 The approval ladder

Purchase orders move through this status chain
([purchaseOrder.service.ts:6](../../../backend/src/services/purchaseOrder.service.ts#L6)):

```
draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued
```

Each transition has a required permission level and a required Entra group
([purchaseOrder.service.ts:145-152](../../../backend/src/services/purchaseOrder.service.ts#L145-L152),
[:1123-1182](../../../backend/src/services/purchaseOrder.service.ts#L1123-L1182)).

### 1.2 Existing special-case routing (to be replaced)

Today, two conditions are detected at **creation time**
([purchaseOrder.service.ts:206-229](../../../backend/src/services/purchaseOrder.service.ts#L206-L229)) and cause
`skipFinanceDirectorApproval = true`, which removes the `finance_director_approved` stage
([:160-167](../../../backend/src/services/purchaseOrder.service.ts#L160-L167)):

1. Location `type = DISTRICT_OFFICE` — supervisor-stage approval is routed to the Finance Director group
   ([submit :800-812](../../../backend/src/services/purchaseOrder.service.ts#L800-L812),
   [approve :1204-1220](../../../backend/src/services/purchaseOrder.service.ts#L1204-L1220)).
2. Location's primary supervisor is typed `FINANCE_DIRECTOR` (the "Finance Department" case)
   ([:219-224](../../../backend/src/services/purchaseOrder.service.ts#L219-L224)).

A third condition — the **requestor is themselves a Finance Director** (member of
`ENTRA_FINANCE_DIRECTOR_GROUP_ID`) — also sets `skipFinanceDirectorApproval` and is **retained** by this spec.

### 1.3 The account-code entry point

The GL account number is captured **only** at the Finance Director stage:

- Frontend: the "Account Number" field renders only when `canActAtFdStage` is true
  ([PurchaseOrderDetail.tsx:829](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L829)), which
  requires `!isFdSkip && po.status === 'supervisor_approved' && isFinanceDirector`
  ([:269](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L269)).
- Backend: an account code supplied with an approval is persisted **only** when the transition target is
  `finance_director_approved`
  ([purchaseOrder.service.ts:1290-1296](../../../backend/src/services/purchaseOrder.service.ts#L1290-L1296)).
- The create/submit path has **no** account-code field
  ([purchaseOrder.validators.ts:104,128](../../../backend/src/validators/purchaseOrder.validators.ts#L104) — `accountCode`
  exists only on `ApproveSchema` and `AssignAccountSchema`).
- A standalone `assignAccountCode` endpoint exists ([:1418](../../../backend/src/services/purchaseOrder.service.ts#L1418))
  and a `useAssignAccountCode` hook exists, but **the hook is not wired into any component**.

### 1.4 Verified production data (read-only query, 2026-07-01)

| Location | `type` | Primary supervisor(s) | Supervisor type |
|---|---|---|---|
| District Office | `DISTRICT_OFFICE` | Chad Luedeke / Joseph Lewis / Timothy Watkins | MAINTENANCE_WORKER / TECHNOLOGY_ASSISTANT / DIRECTOR_OF_SCHOOLS |
| Finance Department | `DEPARTMENT` | Linda Carney | FINANCE_DIRECTOR |

Both currently satisfy the "skip FD stage" logic — which is the wrong stage to skip and is the root of the
account-code gap.

---

## 2. Problem Definition

For **Finance Department** and **District Office**, the location's supervisor *is* the Finance Director (Linda
Carney) or, for District Office, approval is already routed to the Finance Director group. The current
implementation makes the Finance Director approve at the **supervisor** stage and then **skips the dedicated
Finance Director stage** — which is exactly the stage that:

1. Prompts for and persists the GL account number, and
2. Would otherwise be the natural single point of Finance Director review.

Consequences:

- **Account code is stranded.** For these locations the account-number field never appears, and a standard PO can
  reach `dos_approved` with no account code and then be **un-issuable**
  ([issue guard :1497-1502](../../../backend/src/services/purchaseOrder.service.ts#L1497-L1502)).
- **The "requestor is the Finance Director" case is worse** — both the supervisor and FD stages are skipped, so
  there is no point at all where she can enter the account number.

---

## 3. Decisions (agreed with user)

| # | Decision |
|---|---|
| D1 | For the two locations, **skip the supervisor stage** (not the FD stage). The Finance Director becomes the first approver at the real `finance_director_approved` stage, where account-code entry already works. |
| D2 | Identify the two locations with a **per-location boolean toggle** on the Locations & Supervisors admin page — **not** by name, type, or supervisor lookup. Rename-proof and admin self-service. |
| D3 | When the **requestor is the Finance Director** (FD stage will be skipped), the account number is a **hard requirement at submit** — the Submit action is blocked until it is entered (frontend gate + backend validation). |
| D4 | The required-account-code gate applies to **standard** (non–food-service) POs only. |
| D5 | "Finance Director" = membership in `ENTRA_FINANCE_DIRECTOR_GROUP_ID` (existing check). |

---

## 4. Proposed Solution Architecture

### 4.1 New per-location flag

Add `routeToFinanceDirector Boolean @default(false)` to `OfficeLocation`
([schema.prisma:296-326](../../../backend/prisma/schema.prisma#L296-L326)).

Semantics: **when true, POs for this location skip the supervisor stage and route directly to the Finance Director
approval stage.**

### 4.2 Resulting flows

**A. `routeToFinanceDirector` location, requestor is NOT the FD** (the main fix):

```
draft → (submit auto-advances, supervisor stage skipped) → supervisor_approved
      → Finance Director approves + enters account #        → finance_director_approved
      → Director of Schools approves                        → dos_approved
      → PO Entry issues                                     → po_issued
```

Uses the **standard** approval chain (i.e. `skipFinanceDirectorApproval = false`), so the existing FD-stage
field-display and account-code persistence work unchanged.

**B. Requestor IS the Finance Director** (any location; `skipFinanceDirectorApproval = true`):

```
draft (account # required) → submit → supervisor_approved
      → (FD stage skipped)  → Director of Schools approves → dos_approved → po_issued
```

If the location *also* has `routeToFinanceDirector`, both supervisor and FD stages are skipped — same outcome.
The account number is captured on the draft and validated at submit.

**C. All other POs** — unchanged.

### 4.3 Retirement of type-based routing

The `DISTRICT_OFFICE`-type and `FINANCE_DIRECTOR`-supervisor routing branches are **replaced** by the flag. A
one-time data migration seeds `routeToFinanceDirector = true` for the two existing locations so behavior is
continuous on deploy.

---

## 5. Implementation Steps

### 5.1 Database (Prisma) — user-applied migration

1. `schema.prisma`: add to `model OfficeLocation`:
   ```prisma
   routeToFinanceDirector Boolean @default(false)
   ```
2. Create `backend/prisma/migrations/<YYYYMMDDHHmmss>_add_route_to_finance_director/migration.sql`:
   ```sql
   ALTER TABLE "office_locations"
     ADD COLUMN "routeToFinanceDirector" BOOLEAN NOT NULL DEFAULT false;

   -- One-time seed to preserve current behavior for the two known locations.
   -- Thereafter this flag is admin-controlled via the Locations & Supervisors page.
   UPDATE "office_locations"
     SET "routeToFinanceDirector" = true
     WHERE "type" = 'DISTRICT_OFFICE' OR "name" = 'Finance Department';
   ```
   > Per project rules: the migration file is committed; the container applies it via `prisma migrate deploy` on
   > startup. Do **not** run any `prisma migrate` command locally.

### 5.2 Shared types (`shared/src/`)

3. Add optional `routeToFinanceDirector?: boolean` to the OfficeLocation response type and to the
   location create/update input types.
4. Add optional `accountCode?: string` to the purchase-order **create** (and update) input type/schema used by
   `CreatePurchaseOrderSchema` / `UpdatePurchaseOrderSchema` (these are re-exported from shared —
   [purchaseOrder.validators.ts:14-15,35](../../../backend/src/validators/purchaseOrder.validators.ts#L14-L15)).
   Constrain to `.max(100)` to match `AssignAccountSchema`.

### 5.3 Backend — location management

5. `location.validators.ts`: add `routeToFinanceDirector: z.boolean().optional()` to
   `CreateOfficeLocationSchema` and `UpdateOfficeLocationSchema`
   ([:77-102](../../../backend/src/validators/location.validators.ts#L77-L102)).
6. `location.service.ts`: thread `routeToFinanceDirector` through `CreateLocationDto`/`UpdateLocationDto`,
   `create()`, `update()`, and the inactive-location reactivation branches
   ([:7-23,187-311](../../../backend/src/services/location.service.ts#L187-L311)).

### 5.4 Backend — purchase orders

7. `createPurchaseOrder` ([:178-273](../../../backend/src/services/purchaseOrder.service.ts#L178-L273)):
   - Remove the `isDistrictOffice` and `supervisorIsFinanceDirector` conditions from
     `skipFinanceDirectorApproval`. New definition:
     ```
     skipFinanceDirectorApproval = workflowType !== 'food_service' && requestorInFinanceDirectorGroup
     ```
   - Persist the new optional `accountCode` (trimmed) when provided.
8. `submitPurchaseOrder` ([:757-1017](../../../backend/src/services/purchaseOrder.service.ts#L757-L1017)):
   - Read the location's `routeToFinanceDirector`. Replace the `isDistrictOffice` detection/branch with a
     `routeToFinanceDirector` branch.
   - **New auto-advance branch:** when `routeToFinanceDirector` (and not food service), transition
     `draft → supervisor_approved` in one transaction with two history rows (`draft→submitted`,
     `submitted→supervisor_approved`, note: *"Supervisor stage skipped — location routed directly to Finance
     Director"*), mirroring the existing self-supervisor bypass
     ([:901-950](../../../backend/src/services/purchaseOrder.service.ts#L901-L950)). Return a flag so the
     controller notifies the correct next group (FD, or DoS when `skipFinanceDirectorApproval`).
   - **Account-code gate (D3/D4):** if `workflowType !== 'food_service'` and `skipFinanceDirectorApproval` is true,
     require a non-empty `po.accountCode`; otherwise throw
     `ValidationError('An account code is required before submitting this requisition', 'accountCode')`.
9. `approvePurchaseOrder` ([:1031-1332](../../../backend/src/services/purchaseOrder.service.ts#L1031-L1332)):
   - Remove the `DISTRICT_OFFICE` branch at the `submitted` stage
     ([:1204-1220](../../../backend/src/services/purchaseOrder.service.ts#L1204-L1220)) — flagged POs never sit at
     `submitted`. The existing standard `supervisor_approved → finance_director_approved` FD-group check
     ([:1145-1163](../../../backend/src/services/purchaseOrder.service.ts#L1145-L1163)) already governs the FD
     approval and account-code persistence — no change needed there.
10. `getPurchaseOrderById` include ([:522-535](../../../backend/src/services/purchaseOrder.service.ts#L522-L535)):
    add `routeToFinanceDirector` to the `officeLocation` selection so the frontend can render the correct stepper
    and gates.
11. `purchaseOrder.controller.ts` submit handler
    ([:154-215](../../../backend/src/controllers/purchaseOrder.controller.ts#L154-L215)): route the submit-time
    notification for the new auto-advance case to `snapshot.finance` (or `snapshot.dos` when the FD stage is
    also skipped), reusing the existing `sendApprovalActionRequired` pattern.

### 5.5 Frontend — locations admin

12. `location.types.ts`: add `routeToFinanceDirector` to the location type and create/update inputs.
13. `SupervisorManagement.tsx` add/edit location dialog: add a checkbox **"Route straight to Finance Director
    (skip supervisor approval)"** bound to `routeToFinanceDirector`; display it on the location card
    ([LocationCard :222+](../../../frontend/src/pages/SupervisorManagement.tsx#L222)).

### 5.6 Frontend — PO create form

14. `RequisitionWizard.tsx`: when the current user is a Finance Director (reuse the `isFinanceDirector`
    derivation used in `PurchaseOrderDetail`), show a **required** "Account Number" field, and disable
    **Submit** (not Save as Draft) until it is filled
    ([Review step / handleSaveAndSubmit :299-324](../../../frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx#L299-L324)).
    Include `accountCode` in the create payload.

### 5.7 Frontend — PO detail

15. `PurchaseOrderDetail.tsx`: introduce `isRouteToFdPO = po.officeLocation?.routeToFinanceDirector === true` and
    retire the `isDistrictOfficePO` routing branches
    ([:170,269-289,362-363](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L269-L289)). Because
    flagged POs use the standard chain (`isFdSkip === false`) and land at `supervisor_approved`, `canActAtFdStage`
    already lights up for the Finance Director and the account-number field appears — the main goal is achieved by
    *removing* special-casing rather than adding it.
16. Add a workflow-stage array for the route-to-FD flow (Draft → Submitted → Finance Director Approved →
    Director of Schools Approved → PO Issued) and map a `supervisor_approved` status to the "awaiting Finance
    Director" step, replacing `DISTRICT_OFFICE_WORKFLOW_STAGES` usage
    ([:96-102,173-179](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L96-L102)).

---

## 6. Dependencies

No new runtime dependencies. All work uses the installed stack (Prisma 7, Express 5, React 19, MUI v7, Zod 4,
TanStack Query v5). API-currency verification is **not required** — no external library integrations are added
(internal code + existing in-repo patterns only, per the Dependency & Documentation Policy exemptions).

---

## 7. Configuration Changes

- **Prisma schema:** one new column `office_locations.routeToFinanceDirector` (+ committed migration SQL).
- No new environment variables. No new Entra groups or Graph scopes.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Removing type-based `DISTRICT_OFFICE` routing regresses District Office POs | Seed migration sets the flag = true for District Office; verify with a submit→FD→DoS→issue walkthrough in review. |
| An in-flight draft created before deploy has no `accountCode` and requestor is FD | Backend submit-time gate blocks submission with a clear message; she edits the draft to add it. Existing drafts are unaffected until resubmitted. |
| Mid-flight flag change (admin toggles while a PO is mid-workflow) | Routing decision is made at submit; already-advanced POs keep their status/history. Document as expected. |
| Food-service interaction | All new branches are gated on `workflowType !== 'food_service'`; food-service routing is untouched. |
| Requestor is the **DoS** for a route-to-FD location | Pre-existing limitation (final-approver self-approval) — out of scope; note for the user. |
| `pendingMyApproval` queue logic references District-Office routing ([:400-403](../../../backend/src/services/purchaseOrder.service.ts#L400-L403)) | Review must update the approver-queue clauses so flagged POs surface to the FD at `supervisor_approved` (standard branch already covers this) and no longer rely on the `submitted`+`DISTRICT_OFFICE` clause. |

---

## 9. Success Criteria (verifiable)

1. A **standard PO for a flagged location, submitted by a non-FD user**, auto-advances past the supervisor stage
   to `supervisor_approved`, the Finance Director sees the account-number field, enters it, approves to
   `finance_director_approved`, the DoS approves, and PO Entry can issue it.
2. A **standard PO submitted by the Finance Director** cannot be submitted without an account number (frontend
   button disabled; backend rejects a forged request), and once submitted flows to the DoS carrying the code.
3. **Admins can toggle** `routeToFinanceDirector` per location on the Locations & Supervisors page; toggling off
   restores the normal supervisor-first flow.
4. Food-service and all non-flagged, non-FD-requestor POs behave exactly as before.
5. `scripts/preflight.ps1` (both Docker image builds) exits 0.

---

## 10. Out of Scope

- Wiring the unused `useAssignAccountCode` hook / standalone assign-account button (not needed given D3).
- Any change to food-service routing.
- Back-filling account codes onto POs already stranded before this change (handled manually if any exist).

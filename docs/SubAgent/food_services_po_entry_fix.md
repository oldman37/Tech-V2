# Food Services PO Entry — Diagnosis & Fix Specification

**System:** Tech-V2 (Tech Department Management System)  
**Created:** 2026-04-28  
**Status:** Bug Diagnosis — Ready for Implementation  
**Reporter:** Food Services PO Entry user unable to issue PO after DOS approval

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Approval Workflows](#2-complete-approval-workflows)
3. [Root Cause Analysis](#3-root-cause-analysis)
4. [Detailed Code Trace](#4-detailed-code-trace)
5. [Affected Files](#5-affected-files)
6. [Recommended Fix](#6-recommended-fix)
7. [Acceptance Criteria](#7-acceptance-criteria)

---

## 1. Executive Summary

**Symptom:** A Food Services PO Entry user cannot issue a PO number after the Director of Schools (DOS) approves the requisition. The "Issue PO" button either does not appear or the API call fails.

**Root Cause:** A **permission-level deadlock** on the account-code assignment route. The backend route `/api/purchase-orders/:id/account` requires `REQUISITIONS` level 5 (`requireModule('REQUISITIONS', 5)`), but the Food Services Supervisor — the designated account-code assigner for food service POs — only has `REQUISITIONS` level 3. Because **no authorized user can assign an account code** to a food service PO, the downstream `issuePurchaseOrder` service rightfully rejects the issue request with `"An account code must be assigned before issuing the PO"`, and the frontend hides the "Issue PO" button because `!!po.accountCode` is false.

**Secondary Issue:** The food service approval flow also lacks an inline account-code assignment path. In the standard workflow the Finance Director can supply an `accountCode` during their approval (`supervisor_approved → finance_director_approved`). The food service workflow skips that step entirely, so there is no approval-time mechanism to set it either.

---

## 2. Complete Approval Workflows

### 2.1 Standard Workflow

```
draft
  → submitted                          (Requestor, level 2)
  → supervisor_approved                (Location Supervisor, level 3)
  → finance_director_approved          (Finance Director, level 5 — can set accountCode inline)
  → dos_approved                       (Director of Schools, level 6)
  → po_issued                          (Finance PO Entry, level 4 — requires accountCode set)
```

### 2.2 Food Service Workflow (`workflowType = 'food_service'`)

```
draft
  → submitted                          (Requestor, level 2)
  → supervisor_approved                (Food Services Supervisor, level 3)
  → dos_approved                       (Director of Schools, level 6 — skips finance_director_approved)
  → po_issued                          (Food Services PO Entry, level 4 — requires accountCode set)
```

**Missing step:** There is no stage in the food service workflow where the account code gets assigned.

### 2.3 Permission Levels for Relevant Groups

| Entra Group | Env Var | REQUISITIONS Level | Role |
|---|---|:---:|---|
| Food Services Supervisor | `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` | 3 | USER |
| Food Services PO Entry | `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` | 4 | USER |
| Director of Schools | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | 6 | ADMIN |
| Finance Director | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | 5 | MANAGER |
| Finance PO Entry | `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` | 4 | USER |

Source: [groupAuth.ts](../../backend/src/utils/groupAuth.ts) lines 56–67.

---

## 3. Root Cause Analysis

### Bug #1 — Route permission too restrictive on `/account` endpoint

| Layer | File | Line | What happens |
|---|---|:---:|---|
| **Route middleware** | [purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts) | 159 | `requireModule('REQUISITIONS', 5)` — requires level 5 |
| **FS Supervisor level** | [groupAuth.ts](../../backend/src/utils/groupAuth.ts) | 65 | FS Supervisor mapped to REQUISITIONS level 3 |
| **Result** | — | — | FS Supervisor gets HTTP 403 before reaching controller |

The controller at [purchaseOrder.controller.ts](../../backend/src/controllers/purchaseOrder.controller.ts) lines 299–319 correctly checks group membership for food service POs (only FS Supervisor group allowed), but the route-level middleware blocks the FS Supervisor before the controller code ever executes.

**Who can assign account codes for food service POs?**

| User | Route (level ≥ 5) | Controller (FS Sup group) | Result |
|---|:---:|:---:|---|
| Food Services Supervisor (level 3) | ❌ Blocked | ✅ Would pass | **BLOCKED** |
| Finance Director (level 5) | ✅ Passes | ❌ Not in FS Sup group | **BLOCKED** |
| Director of Schools (level 6, ADMIN) | ✅ Passes | ❌ Not in FS Sup group | **BLOCKED** |
| Food Services PO Entry (level 4) | ❌ Blocked | ❌ Not in FS Sup group | **BLOCKED** |

**Result: Nobody can assign account codes for food service POs.** This is a complete deadlock.

### Bug #2 — No inline account-code path during food service approval

In the standard workflow, the Finance Director can set `accountCode` when approving at the `supervisor_approved → finance_director_approved` transition. This is handled in [purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts) lines 1073–1079:

```typescript
...(transition.to === 'finance_director_approved' && {
    approvedAt: now,
    ...(approveData?.accountCode != null && approveData.accountCode.trim() !== '' && {
      accountCode: approveData.accountCode.trim(),
    }),
  }),
```

The food service workflow skips `finance_director_approved` entirely, and the `supervisor_approved` transition has no equivalent account-code persistence. The DOS approval (`dos_approved`) also does not persist an account code.

### Bug #3 (Downstream) — PO issuance blocked without account code

The `issuePurchaseOrder` service method at [purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts) lines 1271–1275 requires:

```typescript
if (!po.accountCode) {
  throw new ValidationError(
    'An account code must be assigned before issuing the PO',
    'accountCode',
  );
}
```

The frontend at [PurchaseOrderDetail.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx) lines 232–233 hides the "Issue PO" button when `accountCode` is not set:

```typescript
const canIssue = isFoodService
  ? isFoodServicePoEntry && permLevel >= 4 && po.status === 'dos_approved' && !!po.accountCode
  : isPoEntryUser && permLevel >= 4 && po.status === 'dos_approved' && !!po.accountCode;
```

Since no one can set the account code (Bugs #1 + #2), `po.accountCode` is always null/empty for food service POs, and the "Issue PO" button never appears.

### Frontend vs Backend mismatch on `/account`

The frontend correctly allows FS Supervisors to see the "Assign Account Code" button ([PurchaseOrderDetail.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx) lines 229–231):

```typescript
const canAssign = isFoodService
  ? (isFoodServiceSupervisor || isStrictFinanceDirector) && permLevel >= 3 && ...
  : isStrictFinanceDirector && permLevel >= 5 && ...;
```

But the API call will fail with 403 because the route middleware requires level 5. The user sees the button, clicks it, and gets an error.

---

## 4. Detailed Code Trace

### Step-by-step trace for a Food Services PO Entry user attempting to issue:

1. **Food staff creates PO** with `workflowType: 'food_service'` → status `draft`
2. **Requestor submits** → status `submitted`
3. **FS Supervisor approves** (`submitted → supervisor_approved`) — ✅ works
4. **FS Supervisor tries to assign account code**:
   - Frontend shows button ✅ (permLevel 3 ≥ 3)
   - API call `POST /:id/account` hits route middleware
   - `requireModule('REQUISITIONS', 5)` checks level: 3 < 5 → **HTTP 403** ❌
5. **DOS approves** (`supervisor_approved → dos_approved`) — ✅ works
6. **FS PO Entry user views PO**:
   - `po.status === 'dos_approved'` ✅
   - `isFoodServicePoEntry === true` ✅
   - `permLevel >= 4` ✅ (level 4)
   - `!!po.accountCode` → **false** (never set) ❌
   - `canIssue = false` → "Issue PO" button hidden
7. **If user manually calls API** `POST /:id/issue`:
   - Route middleware passes (level 4 ≥ 4) ✅
   - Controller group check passes ✅
   - Service throws: `"An account code must be assigned before issuing the PO"` ❌

---

## 5. Affected Files

| File | Lines | Issue |
|---|---|---|
| [backend/src/routes/purchaseOrder.routes.ts](../../backend/src/routes/purchaseOrder.routes.ts) | 155–161 | `/account` route requires `REQUISITIONS` level 5; should allow level 3+ for food service |
| [backend/src/services/purchaseOrder.service.ts](../../backend/src/services/purchaseOrder.service.ts) | 1073–1079 | Inline account code only persisted for `finance_director_approved` transition; missing for food service supervisor approval |
| [backend/src/controllers/purchaseOrder.controller.ts](../../backend/src/controllers/purchaseOrder.controller.ts) | 299–319 | Controller has correct group-based auth for food service but is unreachable due to route middleware |
| [frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx](../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx) | 229–231 | Frontend correctly shows account-code button for FS Supervisor but API call fails |
| [frontend/src/services/purchaseOrder.service.ts](../../frontend/src/services/purchaseOrder.service.ts) | 147 | Stale comment says "Requires level 4 + status = dos_approved" (inconsistent with route level 5) |

---

## 6. Recommended Fix

### Fix 1 — Lower the `/account` route-level permission (REQUIRED)

**File:** `backend/src/routes/purchaseOrder.routes.ts`  
**Change:** `requireModule('REQUISITIONS', 5)` → `requireModule('REQUISITIONS', 3)`

The controller already has defense-in-depth group-based authorization that correctly distinguishes:
- **Standard POs**: Only Finance Director group members can assign account codes
- **Food Service POs**: Only Food Services Supervisor group members can assign account codes

Lowering the route requirement to level 3 allows the FS Supervisor to reach the controller, where the group-specific check will enforce the correct authorization.

```typescript
// BEFORE:
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  requireModule('REQUISITIONS', 5),   // ← blocks FS Supervisor (level 3)
  purchaseOrderController.assignAccountCode,
);

// AFTER:
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  requireModule('REQUISITIONS', 3),   // ← allows level 3+; controller enforces group membership
  purchaseOrderController.assignAccountCode,
);
```

**Security note:** This does NOT weaken security. The controller's group-based checks are stricter than the route-level permission. A level-3 Principal who is not in the Finance Director or FS Supervisor group will still get HTTP 403 from the controller.

### Fix 2 — Add inline account-code support for food service supervisor approval (RECOMMENDED)

**File:** `backend/src/services/purchaseOrder.service.ts`  
**In the `approvePurchaseOrder` method**, extend the stage-specific update payload to also persist `accountCode` when transitioning to `supervisor_approved` for food service POs:

```typescript
// BEFORE (only finance_director_approved persists accountCode):
const stageUpdates: Prisma.purchase_ordersUpdateInput = {
  status: transition.to,
  ...(transition.to === 'finance_director_approved' && {
    approvedAt: now,
    ...(approveData?.accountCode != null && approveData.accountCode.trim() !== '' && {
      accountCode: approveData.accountCode.trim(),
    }),
  }),
  ...(transition.to === 'dos_approved' && { schoolsDirectorApprovedAt: now }),
};

// AFTER (also persist accountCode on supervisor_approved for food service POs):
const stageUpdates: Prisma.purchase_ordersUpdateInput = {
  status: transition.to,
  ...(transition.to === 'finance_director_approved' && {
    approvedAt: now,
    ...(approveData?.accountCode != null && approveData.accountCode.trim() !== '' && {
      accountCode: approveData.accountCode.trim(),
    }),
  }),
  ...(transition.to === 'supervisor_approved' && po.workflowType === 'food_service' && {
    ...(approveData?.accountCode != null && approveData.accountCode.trim() !== '' && {
      accountCode: approveData.accountCode.trim(),
    }),
  }),
  ...(transition.to === 'dos_approved' && { schoolsDirectorApprovedAt: now }),
};
```

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
In the approve dialog, show the optional account-code field when the FS Supervisor is approving at the `submitted` stage for food service POs (same pattern as the FD approve dialog for standard POs).

### Fix 3 — Update stale frontend comments (CLEANUP)

**File:** `frontend/src/services/purchaseOrder.service.ts` line 147 and 156  
Update JSDoc comments to reflect correct required levels:
- `assignAccountCode`: "Requires level 3+ (group-enforced)" not "level 4"  
- `issue`: "Requires level 4" not "level 5"

---

## 7. Acceptance Criteria

1. **FS Supervisor can assign account code via `/account` endpoint** for food service POs at `supervisor_approved`, `dos_approved` status
2. **FS Supervisor can optionally set account code during approval** of `submitted → supervisor_approved` for food service POs
3. **FS PO Entry user sees "Issue PO" button** when the PO is at `dos_approved` status with an account code set
4. **FS PO Entry user can successfully issue a PO** (transition to `po_issued`) after DOS approval
5. **Standard workflow is unaffected** — Finance Director still assigns account codes; Finance PO Entry still issues POs
6. **Standard users (level 3 Principals, etc.) cannot assign account codes** — controller defense-in-depth blocks non-FD/non-FS-Sup users
7. **No regression in separation of duties** — requestor cannot approve own PO, same-user cannot approve multiple stages

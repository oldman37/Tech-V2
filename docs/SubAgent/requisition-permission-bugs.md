# Requisition Permission Bugs — Research Findings

**Date:** March 11, 2026  
**Investigator:** Research SubAgent  
**Bugs Investigated:** Bug 1 (General User cannot submit) + Bug 2 (General User sees all POs)

---

## 1. Permission Level for "General User" in REQUISITIONS

### Authoritative Answer: **Level 2**

Per `docs/requisition_flow.md` §3 (the canonical spec for the new system):

| Level | Role Name | Capabilities |
|---|---|---|
| 1 | Viewer | View own POs only |
| **2** | **Requestor / Staff ("General User")** | **Create drafts; edit own drafts; delete own drafts; submit for approval** |
| 3 | Supervisor | Approve/reject submitted requisitions |
| 4 | Purchasing Staff | Assign account code; purchasing approval |
| 5 | Director of Services (DOS) | Final approval; issue PO number |

**"General User" = REQUISITIONS Level 2.**

### The Seed vs. Spec Mismatch (Root Context)

`backend/prisma/seed.ts` still defines REQUISITIONS permissions using a **legacy inverted 1–9 system** (legacy PHP app mapping):

```typescript
// CURRENT (WRONG) — legacy inverted numbering
{ module: 'REQUISITIONS', level: 1, name: 'Director of Schools', ... }
{ module: 'REQUISITIONS', level: 2, name: 'Director of Finance',  ... }
{ module: 'REQUISITIONS', level: 3, name: 'PO Entry',             ... }
{ module: 'REQUISITIONS', level: 4, name: 'Principal',            ... }
{ module: 'REQUISITIONS', level: 5, name: 'Vice Principal',       ... }
{ module: 'REQUISITIONS', level: 6, name: 'Bookkeeper',           ... }
{ module: 'REQUISITIONS', level: 7, name: 'Supervisor',           ... }
{ module: 'REQUISITIONS', level: 8, name: 'Athletic Director',    ... }
{ module: 'REQUISITIONS', level: 9, name: 'General User',         ... }
```

All routes, the service, and the frontend were **written for the new 1–5 ascending system** where the larger number = more authority. The seed was never updated.

---

## 2. Bug 1 — General User CANNOT Submit New Requisitions

### What Should Happen
A user with REQUISITIONS Level 2 ("General User/Requestor") should be able to:
1. See the "New Requisition" button on the list page
2. Navigate to the wizard, fill it in, and submit it
3. Submit an existing draft from the detail page

### Root Cause: `seed.ts` — Wrong Permission Level Numbers for REQUISITIONS

**File:** `backend/prisma/seed.ts`  
**What is wrong:** The seed assigns "General User" to Level 9 (legacy inverted). The new 1–5 system the code was built for has no explicit "General User/Requestor" entry at Level 2. When a system administrator assigns REQUISITIONS permissions to regular staff and follows the TECHNOLOGY module convention (Level 1 = "General User"), they would assign Level 1 — but Level 1 in REQUISITIONS = "Viewer" (cannot submit). Result: the user is a Viewer, not a Requestor, and all submit gates reject them.

#### Backend Gate — Route Guard (CORRECT code, wrong data feeds it)

**File:** `backend/src/routes/purchaseOrder.routes.ts`

```typescript
// POST /api/purchase-orders — create a draft
router.post(
  '/',
  validateRequest(CreatePurchaseOrderSchema, 'body'),
  checkPermission('REQUISITIONS', 2),   // ← requires Level ≥ 2
  purchaseOrderController.createPurchaseOrder,
);

// POST /api/purchase-orders/:id/submit — submit for approval
router.post(
  '/:id/submit',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 2),   // ← requires Level ≥ 2
  purchaseOrderController.submitPurchaseOrder,
);
```

The route guards are **correct per spec** (Level 2 needed to create/submit). The problem is that a user who should have Level 2 was given Level 1 because the seed's REQUISITIONS levels don't map to the 1–5 design the code expects.

#### Frontend Gate — List Page (CORRECT code, wrong data feeds it)

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

```tsx
{permLevel >= 2 && (
  <Button
    variant="contained"
    startIcon={<AddIcon />}
    onClick={() => navigate('/purchase-orders/new')}
  >
    New Requisition
  </Button>
)}
```

With a user at Level 1 (wrong assignment): `1 >= 2 = false` → **button is hidden**. They can never reach the wizard at all.

#### Frontend Gate — Detail Page (CORRECT code, wrong data feeds it)

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

```tsx
const canSubmit = po.status === 'draft' && po.requestorId === user?.id && permLevel >= 2;
```

With a user at Level 1: `1 >= 2 = false` → `canSubmit = false` → **Submit button on draft detail is hidden**.

### The Fix for Bug 1

**File to change:** `backend/prisma/seed.ts`

Replace the legacy 1–9 REQUISITIONS permissions with the new 1–5 spec-aligned set:

```typescript
// CORRECT — new 1-5 ascending system matching routes/service/frontend
const reqPermissions = [
  { module: 'REQUISITIONS', level: 1, name: 'Viewer',                description: 'View own purchase orders only (no create/submit)' },
  { module: 'REQUISITIONS', level: 2, name: 'General User',          description: 'Create, edit, submit own purchase orders' },
  { module: 'REQUISITIONS', level: 3, name: 'Supervisor',            description: 'Approve/reject submitted purchase orders' },
  { module: 'REQUISITIONS', level: 4, name: 'Purchasing Staff',      description: 'Purchasing approval; assign account codes' },
  { module: 'REQUISITIONS', level: 5, name: 'Director of Services',  description: 'Final approval and PO issuance' },
];
```

After updating the seed, any existing database entries that assigned Level 1, or the old Level 9, to "General User" staff must be migrated to Level 2.

**No route, service, or frontend code needs to change for Bug 1** — the existing `checkPermission('REQUISITIONS', 2)` and `permLevel >= 2` guards are correct per spec once the seed provides the right level.

---

## 3. Bug 2 — General User SEES Other Users' Requisitions

### What Should Happen
A user with REQUISITIONS Level 2 ("General User/Requestor") should only see their **own** purchase orders in the list view. They should not see POs created by other users.

### Root Cause: `purchaseOrder.service.ts` — Wrong Scope Threshold

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Function:** `getPurchaseOrders()`

#### Buggy Code

```typescript
/**
 * Return a paginated, filtered list of purchase orders.
 * permLevel 1 = can only see own POs; permLevel 2+ = can see all POs.
 */
async getPurchaseOrders(
  filters: PurchaseOrderQueryDto,
  userId: string,
  permLevel: number,
): Promise<PurchaseOrderListResponse> {
  // ...
  const where: Prisma.purchase_ordersWhereInput = {
    // Scope: level 1 sees only own POs; level 2+ sees all   ← THIS COMMENT IS WRONG
    ...(permLevel < 2 && { requestorId: userId }),           // ← BUG: threshold should be < 3
```

**Why this is buggy:**  
The condition `permLevel < 2` restricts scoping to Level 1 only. Any user with Level 2 ("General User/Requestor") gets `2 < 2 = false`, so the `requestorId` filter is NOT applied, and they see ALL purchase orders in the system.

Per the Permission Model spec, Level 2 ("General User/Requestor") can only manage **own** POs. Only Level 3+ (Supervisors, Purchasing, DOS) need to see all POs (to approve/process them). The scope threshold should be `permLevel < 3`.

Additionally, with legacy Level 9 from the old seed: `9 < 2 = false` → also sees all POs. This confirms the bug manifests with both old and new data.

#### Secondary Bug Instances (same `permLevel < 2` pattern in the same service)

**`getPurchaseOrderById()`** — same wrong threshold for detail access:
```typescript
if (permLevel < 2 && po.requestorId !== userId) {   // ← BUG: should be < 3
  throw new AuthorizationError('You do not have permission to view this purchase order');
}
```

**`updatePurchaseOrder()`** — same wrong threshold for edit ownership:
```typescript
if (permLevel < 2 && po.requestorId !== userId) {   // ← BUG: should be < 3
  throw new AuthorizationError('You can only edit your own purchase orders');
}
```

**`deletePurchaseOrder()`** — same wrong threshold for delete ownership:
```typescript
if (permLevel < 2 && po.requestorId !== userId) {   // ← BUG: should be < 3
  throw new AuthorizationError('You can only delete your own purchase orders');
}
```

### The Fix for Bug 2

**File:** `backend/src/services/purchaseOrder.service.ts`  
Change **every occurrence** of `permLevel < 2` to `permLevel < 3`:

| Location | Current (WRONG) | Fix (CORRECT) |
|---|---|---|
| `getPurchaseOrders()` — list scope | `permLevel < 2 && { requestorId: userId }` | `permLevel < 3 && { requestorId: userId }` |
| `getPurchaseOrderById()` — detail access | `if (permLevel < 2 && po.requestorId !== userId)` | `if (permLevel < 3 && po.requestorId !== userId)` |
| `updatePurchaseOrder()` — edit ownership | `if (permLevel < 2 && po.requestorId !== userId)` | `if (permLevel < 3 && po.requestorId !== userId)` |
| `deletePurchaseOrder()` — delete ownership | `if (permLevel < 2 && po.requestorId !== userId)` | `if (permLevel < 3 && po.requestorId !== userId)` |

After this change, the scoping is:
- **Level 1 and Level 2** (Viewer + General User): see only their own records ✓  
- **Level 3+** (Supervisor, Purchasing, DOS): see all records ✓

#### Secondary Fix: Route Comment

**File:** `backend/src/routes/purchaseOrder.routes.ts`

Update the incorrect comment on the GET `/` route:
```typescript
// WRONG:
/**
 * GET /api/purchase-orders
 * List purchase orders (own only for level 1; all for level 2+)
 */

// CORRECT:
/**
 * GET /api/purchase-orders
 * List purchase orders (own only for levels 1-2; all for level 3+)
 */
```

#### Secondary Fix: Spec Document

**File:** `docs/requisition_flow.md`, §5 (API Endpoints), scoping note:
```markdown
// WRONG:
**Scoping:** Level-1 users see only their own records (`requestorId = userId`). Level 2+ see all records.

// CORRECT:
**Scoping:** Levels 1–2 see only their own records (`requestorId = userId`). Level 3+ see all records.
```

---

## 4. Bug Interaction Summary

| Scenario | permLevel | Bug 1 (submit blocked)? | Bug 2 (sees all)? |
|---|---|---|---|
| Legacy seed "General User" (Level 9) | 9 | **NO** — `9 >= 2`, passes all submit gates | **YES** — `9 < 2 = false`, scope not applied |
| New system, wrongly assigned Level 1 | 1 | **YES** — `1 < 2`, route returns 403, buttons hidden | **NO** — `1 < 2 = true`, scope applied correctly |
| New system, correctly assigned Level 2 | 2 | **NO** — `2 >= 2`, passes all submit gates | **YES** — `2 < 2 = false`, scope not applied (threshold bug) |
| New system Level 2 + service fix applied | 2 | **NO** ✓ | **NO** — `2 < 3 = true`, scope applied correctly ✓ |

Both bugs have the **same root cause**: the REQUISITIONS permission numbering in `seed.ts` does not match the 1–5 ascending system the routes/service/frontend were designed for, and the service's scope threshold (`< 2`) was written assuming only Level 1 = "view own" without accounting for Level 2 also needing the "view own" restriction.

---

## 5. Files to Change — Summary

### Bug 1 Fix

| File | Change |
|---|---|
| `backend/prisma/seed.ts` | Replace legacy 9-level inverted REQUISITIONS permissions with new 1–5 ascending system. Level 2 = "General User" (Requestor/Staff). |
| *DB migration* | Re-assign any existing users who have REQUISITIONS Level 9 (old "General User") to Level 2, and anyone with Level 1 (old "Director of Schools") to Level 5. Requires a data migration script. |

**No code changes needed** in routes, service, or frontend for Bug 1 — those files are correctly gated at Level 2.

### Bug 2 Fix

| File | Change |
|---|---|
| `backend/src/services/purchaseOrder.service.ts` | Change all `permLevel < 2` to `permLevel < 3` (4 locations: `getPurchaseOrders`, `getPurchaseOrderById`, `updatePurchaseOrder`, `deletePurchaseOrder`) |
| `backend/src/routes/purchaseOrder.routes.ts` | Update the JSDoc comment on `GET /` to say "own only for levels 1-2; all for level 3+" |
| `docs/requisition_flow.md` | Update §5 scoping note from "Level 2+ see all" to "Level 3+ see all" |

---

## 6. Quick Reference — Exact Code Locations

### `backend/src/services/purchaseOrder.service.ts`

```
getPurchaseOrders()   — line: ...(permLevel < 2 && { requestorId: userId })
getPurchaseOrderById() — line: if (permLevel < 2 && po.requestorId !== userId)
updatePurchaseOrder()  — line: if (permLevel < 2 && po.requestorId !== userId)
deletePurchaseOrder()  — line: if (permLevel < 2 && po.requestorId !== userId)
```
All four: change `< 2` → `< 3`.

### `backend/prisma/seed.ts`

```
reqPermissions array (currently 9 entries, levels 1-9)
→ Replace with 5 entries, levels 1-5, matching spec
→ Level 2 = "General User" (was Level 9 in old mapping)
```

### `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

```tsx
{permLevel >= 2 && (<Button>New Requisition</Button>)}
```
**No change needed** — Level 2 is correct. Fix is in seed so users DO get Level 2.

### `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

```tsx
const canSubmit = po.status === 'draft' && po.requestorId === user?.id && permLevel >= 2;
```
**No change needed** — Level 2 is correct. Fix is in seed.

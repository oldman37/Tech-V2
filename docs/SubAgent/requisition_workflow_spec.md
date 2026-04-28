# Requisition Workflow Specification — Multi-Step Approval

**Date:** 2026-03-12  
**Status:** Ready for Implementation  
**Author:** Research & Specification Subagent  
**Spec File:** `docs/SubAgent/requisition_workflow_spec.md`

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Database Changes Required](#2-database-changes-required)
3. [Backend Architecture](#3-backend-architecture)
4. [Role & Permission Mapping](#4-role--permission-mapping)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Email Notification Design](#6-email-notification-design)
7. [Security Considerations](#7-security-considerations)
8. [Implementation Plan](#8-implementation-plan)

---

## 1. Current State Analysis

### 1.1 Current Schema

The `purchase_orders` model in `backend/prisma/schema.prisma` uses a plain `String` field for `status` (not a Prisma enum). The TypeScript enum lives in the validators layer (`purchaseOrder.validators.ts`).

**Current `PO_VALID_STATUSES`** (from `backend/src/validators/purchaseOrder.validators.ts`):
```typescript
export const PO_VALID_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'purchasing_approved',   // ← Intermediate step; Level 4 advances to this BEFORE Finance Director
  'dos_approved',          // ← Finance Director approved (confusingly named)
  'schools_approved',      // ← Director of Schools approved
  'po_issued',
  'denied',
] as const;
```

**Current `purchase_orders` model fields (relevant subset):**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `reqNumber` | `String?` unique | Assigned at submit time (`REQ-NNNNN`) |
| `poNumber` | `String?` unique | Assigned at PO issuance (`PO-NNNNN`) |
| `type` | `String` | Default `"general"` |
| `requestorId` | FK → User | Who submitted |
| `vendorId` | FK → Vendor? | Optional |
| `description` | `String` | Title of request |
| `amount` | `Decimal` | Sum of line items + shipping |
| `status` | `String` | Defaults to `"draft"` |
| `accountCode` | `String?` | GL account code; required for PO issuance |
| `program` | `String?` | Department/program name |
| `isApproved` | `Boolean` | `true` only after `po_issued` |
| `approvedBy` | `String?` | User ID of who issued the PO |
| `approvedDate` | `DateTime?` | Timestamp of PO issuance |
| `shipTo` | `String?` | Delivery address |
| `shippingCost` | `Decimal?` | Added to total |
| `notes` | `String?` | Special instructions |
| `officeLocationId` | FK → OfficeLocation? | Associated location |
| `denialReason` | `String?` | Set on rejection |
| `submittedAt` | `DateTime?` | Timestamp of first submission |
| `approvedAt` | `DateTime?` | Timestamp of DOS approval |
| `issuedAt` | `DateTime?` | Timestamp of PO issuance |

**`RequisitionStatusHistory` model** (audit trail — already exists):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `purchaseOrderId` | FK → purchase_orders | Cascade-delete |
| `fromStatus` | `String` | Before the transition |
| `toStatus` | `String` | After the transition |
| `changedById` | FK → User | Who performed the action |
| `changedAt` | `DateTime` | When it happened |
| `notes` | `String?` | Optional comment / denial reason |

**`po_items` model** (line items — unchanged): `id`, `poId`, `lineNumber`, `description`, `model`, `quantity`, `unitPrice`, `totalPrice`.

**`UserSupervisor` model** (`user_supervisors` table — already exists): `userId`, `supervisorId`, `isPrimary`.

**`SystemSettings` model** (singleton `id = "singleton"` — already exists):

| Field | Default | Purpose |
|---|---|---|
| `supervisorBypassEnabled` | `true` | Feature flag for self-supervisor bypass |
| `supervisorStageEmail` | `null` | CC email for supervisor stage |
| `purchasingStageEmail` | `null` | CC email for Finance Director stage (currently misnamed) |
| `dosStageEmail` | `null` | CC email for Director of Schools stage (currently misnamed) |

### 1.2 Current Workflow (6-Step)

The current implementation has **six approval stages** (plus draft and denied terminals):

```
  draft
   │
   ├─[submit, Level 2]─────────────────────────────────────────────────┐
   │                                                    (self-supervisor │
   │                                                     bypass, writes  │
   ▼                                                    2 history rows)  │
  submitted                                                              │
   │                                                                     │
   ├─[Level 3 approve (Supervisor)]──────────────────────────────────────►supervisor_approved
                                                                         │
                                                              ┌──────────┘
                                                              │
                                                   [Level 4 "PO Entry" advance]   ← EXTRA STEP (not in new spec)
                                                              │
                                                              ▼
                                                    purchasing_approved  ← Finance Director's inbox (confusingly named)
                                                              │
                                                   [Level 5 Finance Director approve]
                                                              │
                                                              ▼
                                                     dos_approved        ← Director of Schools' inbox
                                                              │
                                                   [Level 6 Director of Schools approve]
                                                              │
                                                              ▼
                                                    schools_approved     ← PO Entry's inbox
                                                              │
                                                   [Level 4 PO Entry issues PO]
                                                              │
                                                              ▼
                                                         po_issued
```

**Current APPROVAL_TRANSITIONS** (in `purchaseOrder.service.ts`):
```typescript
const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
  3: { from: 'submitted',           to: 'supervisor_approved' },
  4: { from: 'supervisor_approved', to: 'purchasing_approved' },   // PO Entry advances record before Finance Director
  5: { from: 'purchasing_approved', to: 'dos_approved' },          // Finance Director
  6: { from: 'dos_approved',        to: 'schools_approved' },      // Director of Schools
};
```

**Self-supervisor bypass (current):** `draft → purchasing_approved` (skips supervisor AND the Level 4 intermediate step)

### 1.3 Gaps — Current vs. Required

| # | Gap | Current | Required |
|---|---|---|---|
| **G1** | **Extra intermediate stage** | Level 4 (PO Entry) advances from `supervisor_approved → purchasing_approved` **before** Finance Director | No this intermediate advance; Finance Director acts directly on `supervisor_approved` records |
| **G2** | **Self-supervisor bypass destination** | Bypass lands at `purchasing_approved` (pre-Finance Director) | Bypass must land at `supervisor_approved` (Finance Director's inbox) |
| **G3** | **Status naming is misleading** | `dos_approved` means "Finance Director approved"; `purchasing_approved` is Finance Director's inbox | Rename statuses for clarity: `finance_director_approved`, true `dos_approved` for Director of Schools |
| **G4** | **Forward email routing at Level 3** | After supervisor approval, notifies `purchasingStageEmail` (Finance Director CC) — this is correct but the naming in `SystemSettings` is confusing | Rename or document: `purchasingStageEmail` → goes to Finance Director; `dosStageEmail` → goes to Director of Schools |
| **G5** | **Account code assignment endpoint** | Requires `status = purchasing_approved` | Must work at `dos_approved` (Director of Schools approved; ready for PO Entry) |
| **G6** | **PO issuance requires `schools_approved`** | `issuePurchaseOrder` validates `status === 'schools_approved'` | Must validate against new `dos_approved` (renamed Director of Schools status) |
| **G7** | **Permission level 4 role** | Level 4 has TWO responsibilities: (a) advance supervisor_approved → purchasing_approved, AND (b) issue PO | Level 4 only issues PO; no longer advances intermediate workflow stages |
| **G8** | **Frontend status constants** | `PO_VALID_STATUSES`, `PO_STATUS_LABELS`, `WORKFLOW_STAGES` use old values | Must be updated to match new status set |
| **G9** | **Pending tab filter** | `STATUS_FOR_LEVEL[4] = 'supervisor_approved'` | Level 4 queue should show `dos_approved` records |

### 1.4 Files to Create or Modify

**Backend — Modify:**
- `backend/prisma/schema.prisma` (if adding comments; status remains a String)
- `backend/src/validators/purchaseOrder.validators.ts`
- `backend/src/services/purchaseOrder.service.ts`
- `backend/src/controllers/purchaseOrder.controller.ts`
- `backend/src/routes/purchaseOrder.routes.ts`
- `backend/src/services/email.service.ts`
- `backend/src/services/settings.service.ts` (optional: rename stage email accessors)

**Backend — Create:**
- `backend/prisma/migrations/20260312130000_rename_po_statuses/migration.sql`

**Frontend — Modify:**
- `frontend/src/types/purchaseOrder.types.ts`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`
- `frontend/src/hooks/queries/usePurchaseOrders.ts` (no logic change needed; types update cascades)
- `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` (no logic change; types update)

---

## 2. Database Changes Required

### 2.1 New Status Values

The `status` column remains a plain `VARCHAR` (no Postgres enum is used in the schema). The valid values are enforced at the TypeScript/Zod layer. The following changes to the status vocabulary are required:

**Status Rename/Remove Map:**

| Old Value | Action | New Value | Stage it represents |
|---|---|---|---|
| `draft` | **Keep** | `draft` | Created, not submitted |
| `submitted` | **Keep** | `submitted` | Awaiting supervisor approval |
| `supervisor_approved` | **Keep** | `supervisor_approved` | Supervisor approved; awaiting Finance Director |
| `purchasing_approved` | **REMOVE** | *(eliminated)* | Was intermediate PO Entry step; no longer needed |
| `dos_approved` | **RENAME** | `finance_director_approved` | Finance Director has approved; awaiting Director of Schools |
| `schools_approved` | **RENAME** | `dos_approved` | Director of Schools approved; awaiting PO Entry/Purchasing |
| `po_issued` | **Keep** | `po_issued` | PO number assigned; fully complete |
| `denied` | **Keep** | `denied` | Rejected at any stage; terminal |

**New `PO_VALID_STATUSES`:**
```typescript
export const PO_VALID_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
  'po_issued',
  'denied',
] as const;
```

### 2.2 Migration SQL

Create `backend/prisma/migrations/20260312130000_rename_po_statuses/migration.sql`:

```sql
-- Rename existing status values in purchase_orders table
-- Old "dos_approved" (Finance Director approved) → "finance_director_approved"
-- Old "schools_approved" (Director of Schools approved) → "dos_approved"
-- Old "purchasing_approved" records (if any exist) → migrate to "supervisor_approved"
--   because these were in the Finance Director's queue; the Finance Director
--   now picks up from supervisor_approved.

-- Step 1: Rename dos_approved → finance_director_approved
UPDATE purchase_orders
SET status = 'finance_director_approved'
WHERE status = 'dos_approved';

-- Step 2: Rename schools_approved → dos_approved
UPDATE purchase_orders
SET status = 'dos_approved'
WHERE status = 'schools_approved';

-- Step 3: Migrate legacy purchasing_approved records to supervisor_approved
--   (Finance Director will need to re-approve these)
UPDATE purchase_orders
SET status = 'supervisor_approved'
WHERE status = 'purchasing_approved';

-- Step 4: Update RequisitionStatusHistory to keep audit trail consistent
UPDATE requisition_status_history SET "fromStatus" = 'finance_director_approved' WHERE "fromStatus" = 'dos_approved';
UPDATE requisition_status_history SET "toStatus"   = 'finance_director_approved' WHERE "toStatus"   = 'dos_approved';
UPDATE requisition_status_history SET "fromStatus" = 'dos_approved'              WHERE "fromStatus" = 'schools_approved';
UPDATE requisition_status_history SET "toStatus"   = 'dos_approved'              WHERE "toStatus"   = 'schools_approved';
UPDATE requisition_status_history SET "fromStatus" = 'supervisor_approved'       WHERE "fromStatus" = 'purchasing_approved';
UPDATE requisition_status_history SET "toStatus"   = 'supervisor_approved'       WHERE "toStatus"   = 'purchasing_approved';
```

### 2.3 Schema Fields to Add

No new schema columns are strictly required — all necessary fields already exist (`denialReason`, `submittedAt`, `approvedAt`, `issuedAt`, `poNumber`, `reqNumber`, `accountCode`).

**Optional enhancement (recommended):** Add `schoolsDirectorApprovedAt DateTime?` to `purchase_orders` to record the timestamp when Director of Schools approves (mirrors `approvedAt` used for Finance Director). This gives a complete timestamp chain.

```prisma
// Add to purchase_orders model
schoolsDirectorApprovedAt DateTime?   // Set when Director of Schools approves → dos_approved
```

Migration SQL for optional field:
```sql
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "schoolsDirectorApprovedAt" TIMESTAMP(3);
```

### 2.4 SystemSettings Schema — No Changes Required

The existing `SystemSettings` fields (`supervisorStageEmail`, `purchasingStageEmail`, `dosStageEmail`) remain in the schema unchanged. They will be repurposed as follows:

| Field | New Meaning |
|---|---|
| `supervisorStageEmail` | CC email when record enters `submitted` stage |
| `purchasingStageEmail` | CC email when record enters Finance Director's queue (`supervisor_approved`) |
| `dosStageEmail` | CC email when record enters Director of Schools' queue (`finance_director_approved`) |

A new `poEntryStageEmail` field could be added to notify the Purchasing Department when a record enters `dos_approved` (ready for PO issuance), but this is optional:

```prisma
poEntryStageEmail String?   // email to notify when dos_approved (ready for PO Entry)
```

---

## 3. Backend Architecture

### 3.1 New Workflow State Machine

```
  draft
   │
   ├─[POST /:id/submit — Level 2]──────────────────────────────────────────┐
   │                                               (self-supervisor bypass: │
   │                                                writes 2 history rows;  │
   ▼                                                one email to Finance Dir)│
  submitted                                                                 │
   │                                                                        │
   ├─[POST /:id/approve — Level 3 (Supervisor)]───────────────────────────►supervisor_approved
                                                                            │
                                               [POST /:id/approve — Level 5 (Finance Director)]
                                                                            │
                                                                            ▼
                                                              finance_director_approved
                                                                            │
                                               [POST /:id/approve — Level 6 (Director of Schools)]
                                                                            │
                                                                            ▼
                                                                     dos_approved
                                                                            │
                                               [POST /:id/issue — Level 4 (PO Entry / Purchasing)]
                                                                            │
                                                                            ▼
                                                                       po_issued

  Any of submitted, supervisor_approved, finance_director_approved, dos_approved:
  ──[POST /:id/reject — Level 3+]──────────────────────────────────────────► denied
```

### 3.2 Updated APPROVAL_TRANSITIONS

**File:** `backend/src/services/purchaseOrder.service.ts`

```typescript
const APPROVAL_TRANSITIONS: Record<number, { from: POStatus; to: POStatus }> = {
  3: { from: 'submitted',                 to: 'supervisor_approved' },
  5: { from: 'supervisor_approved',       to: 'finance_director_approved' },
  6: { from: 'finance_director_approved', to: 'dos_approved' },
  // Level 4 (PO Entry) does NOT advance via /approve — they only issue via /issue
};
```

### 3.3 Updated REJECTABLE_STATUSES

```typescript
const REJECTABLE_STATUSES: POStatus[] = [
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
];
```

### 3.4 API Endpoint Design

**Base path:** `/api/purchase-orders`  
**Auth:** All routes require `authenticate` + `validateCsrfToken` middleware.

| Method | Path | Min Level | Description |
|---|---|---|---|
| `GET` | `/` | 1 | List POs (own-only for level 1; all for level 2+) |
| `POST` | `/` | 2 | Create new draft |
| `GET` | `/:id` | 1 | Get single PO with full detail |
| `PUT` | `/:id` | 2 | Update a draft |
| `DELETE` | `/:id` | 2 | Delete a draft |
| `POST` | `/:id/submit` | 2 | Submit draft for approval |
| `POST` | `/:id/approve` | 3 | Approve at current stage (role-aware) |
| `POST` | `/:id/reject` | 3 | Deny / reject at current stage |
| `POST` | `/:id/account` | 4 | Assign account code (requires `dos_approved`) |
| `POST` | `/:id/issue` | 4 | Issue PO number (requires `dos_approved` + accountCode) |
| `GET` | `/:id/pdf` | 1 | Download PO as PDF |
| `GET` | `/:id/history` | 1 | Get full status history timeline |

**No new endpoints are required.** All new behavior is driven by updated service logic.

### 3.5 Service Method Changes

**File:** `backend/src/services/purchaseOrder.service.ts`

#### `submitPurchaseOrder()` — Change bypass target

```typescript
// OLD: self-supervisor bypass sets status = 'purchasing_approved'
// NEW: self-supervisor bypass sets status = 'supervisor_approved'
//      → Finance Director (Level 5) picks up from supervisor_approved

// Normal path (unchanged): draft → submitted
// Bypass path (CHANGED): draft → supervisor_approved (two history rows written atomically)

// History rows on bypass:
// Row 1: { fromStatus: 'draft',      toStatus: 'submitted',          notes: null }
// Row 2: { fromStatus: 'submitted',  toStatus: 'supervisor_approved', notes: 'Supervisor bypass: requestor is their own primary supervisor' }
```

#### `approvePurchaseOrder()` — Use new APPROVAL_TRANSITIONS

```typescript
// CHANGED: Remove level 4 from APPROVAL_TRANSITIONS
// Level 4 only issues PO; they no longer advance the pre-Finance Director stage
// Level 5 now acts on supervisor_approved records (not purchasing_approved)
// Level 6 now acts on finance_director_approved records (not dos_approved)
```

#### `assignAccountCode()` — Fix status guard

```typescript
// OLD: validates po.status === 'purchasing_approved'
// NEW: validates po.status === 'dos_approved'
//      (account code assigned by PO Entry after Director of Schools has approved)
```

#### `issuePurchaseOrder()` — Fix status guard

```typescript
// OLD: validates po.status === 'schools_approved'
// NEW: validates po.status === 'dos_approved'
//      (PO Entry issues from dos_approved, which now means "Director of Schools has approved")
```

### 3.6 Controller Method Changes

**File:** `backend/src/controllers/purchaseOrder.controller.ts`

#### `submitPurchaseOrder()` — Fix bypass email routing

```typescript
// OLD: On bypass, notifies purchasingStageEmail
// NEW: On bypass, notifies purchasingStageEmail (same, but this now means Finance Director queue email)
//      No code change needed if we keep field names; just update documentation
```

#### `approvePurchaseOrder()` — Update stage labels and email routing

```typescript
const stageLabels: Record<number, string> = {
  3: 'Supervisor Approved',
  5: 'Finance Director Approved',   // Was: 'Director of Services Approved' or similar
  6: 'Director of Schools Approved', // Was: absent or DOS label
};

// Email forward to next approver:
// Level 3 approved → notify Finance Director queue (purchasingStageEmail — kept as-is)
// Level 5 approved → notify Director of Schools queue (dosStageEmail — kept as-is)  
// Level 6 approved → notify PO Entry queue (poEntryStageEmail — new SystemSettings field, optional)
//                    If poEntryStageEmail not set, no forward notification is sent
```

### 3.7 Routes Changes

**File:** `backend/src/routes/purchaseOrder.routes.ts`

#### Comment updates to route jsdoc

```typescript
/**
 * POST /api/purchase-orders/:id/approve
 * Level 3 = supervisor (submitted → supervisor_approved)
 * Level 5 = Finance Director (supervisor_approved → finance_director_approved)
 * Level 6 = Director of Schools (finance_director_approved → dos_approved)
 */
router.post(
  '/:id/approve',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(ApproveSchema, 'body'),
  checkPermission('REQUISITIONS', 3),  // Min level 3; service differentiates by exact level
  purchaseOrderController.approvePurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/issue
 * Level 4 = PO Entry / Purchasing (issues from dos_approved status)
 */
router.post(
  '/:id/issue',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(IssuePOSchema, 'body'),
  checkPermission('REQUISITIONS', 4),
  purchaseOrderController.issuePurchaseOrder,
);

/**
 * POST /api/purchase-orders/:id/account
 * Level 4 = PO Entry (assigns account code when status = dos_approved)
 */
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  checkPermission('REQUISITIONS', 4),
  purchaseOrderController.assignAccountCode,
);
```

**Note:** No new routes are needed. The minimum permission on `/approve` stays at level 3; service differentiates behavior by exact `req.user.permLevel`. Level 4 no longer triggers any approval transition (they are not in `APPROVAL_TRANSITIONS`), so a Level 4 user calling `/approve` receives a 403 from the service guard.

### 3.8 Validator Changes

**File:** `backend/src/validators/purchaseOrder.validators.ts`

```typescript
// Replace:
export const PO_VALID_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'purchasing_approved',  // ← REMOVE
  'dos_approved',         // ← RENAME to 'finance_director_approved'
  'schools_approved',     // ← RENAME to 'dos_approved'
  'po_issued',
  'denied',
] as const;

// With:
export const PO_VALID_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
  'po_issued',
  'denied',
] as const;

export type POStatus = (typeof PO_VALID_STATUSES)[number];
```

### 3.9 Zod Validation Schemas — No New Schemas Required

All existing schemas (`CreatePurchaseOrderSchema`, `UpdatePurchaseOrderSchema`, `ApproveSchema`, `RejectSchema`, `AssignAccountSchema`, `IssuePOSchema`) remain unchanged except:
- `PurchaseOrderQuerySchema` uses `z.enum(PO_VALID_STATUSES)` for the `status` filter — this automatically uses the new values after the constant is updated.

### 3.10 Email Notification Logic Per Step

| Step | Trigger | Service Method | Controller Action |
|---|---|---|---|
| **Submit (normal)** | `draft → submitted` | Returns `supervisorEmail` | `sendRequisitionSubmitted(po, supervisorEmail)` |
| **Submit (bypass)** | `draft → supervisor_approved` | Returns `selfSupervisorBypass=true` | `sendApprovalActionRequired(po, purchasingStageEmail, 'Finance Director Approval')` |
| **Supervisor Approve** | `submitted → supervisor_approved` | Returns updated PO | `sendRequisitionApproved(po, requestorEmail, 'Supervisor Approved')` + `sendApprovalActionRequired(po, purchasingStageEmail, 'Finance Director Approval')` |
| **Finance Director Approve** | `supervisor_approved → finance_director_approved` | Returns updated PO | `sendRequisitionApproved(po, requestorEmail, 'Finance Director Approved')` + `sendApprovalActionRequired(po, dosStageEmail, 'Director of Schools Approval')` |
| **Director of Schools Approve** | `finance_director_approved → dos_approved` | Returns updated PO | `sendRequisitionApproved(po, requestorEmail, 'Director of Schools Approved')` + optional `sendApprovalActionRequired(po, poEntryStageEmail, 'PO Entry Required')` |
| **Any Rejection** | `* → denied` | Returns updated PO | `sendRequisitionRejected(po, requestorEmail, denialReason)` |
| **PO Issued** | `dos_approved → po_issued` | Returns updated PO | `sendPOIssued(po, requestorEmail)` |

---

## 4. Role & Permission Mapping

### 4.1 Existing Permission Records

The `permissions` table currently has these REQUISITIONS records (from seed.ts):

| Level | Name | Module |
|---|---|---|
| 1 | Viewer | `REQUISITIONS` |
| 2 | General User | `REQUISITIONS` |
| 3 | Supervisor | `REQUISITIONS` |
| 4 | Purchasing Staff | `REQUISITIONS` |
| 5 | Director of Finance | `REQUISITIONS` |
| 6 | Director of Schools | `REQUISITIONS` |

**No new permission records are required.** The existing 6 levels map directly to the new workflow.

### 4.2 Role → Level Mapping (from Entra ID groups, per `permission.md`)

| Entra Group | App Role | REQUISITIONS Level | New Workflow Role |
|---|---|:---:|---|
| All Staff | VIEWER | 2 | Submit requisitions |
| Principals, Vice Principals | MANAGER | 3 | Supervisor approval |
| Supervisors of Instruction | MANAGER | 3 | Supervisor approval |
| Tech Admin, Maintenance Admin, Most Directors | MANAGER/TECHNICIAN | 3 | Supervisor approval |
| Director of Finance | MANAGER | **5** | Finance Director approval |
| Director of Schools | ADMIN | **5** | *(ADMIN bypasses, effectively level 6)* |
| Technology Director | ADMIN | — | *(ADMIN bypass)* |
| System Admin | ADMIN | — | *(ADMIN bypass)* |

**Note on ADMIN bypass:** The `checkPermission` middleware sets `req.user.permLevel = 6` for all ADMIN role users. This means ADMIN users can approve at any stage and must be tested carefully — they will match the Level 6 `APPROVAL_TRANSITIONS` entry (`finance_director_approved → dos_approved`) when the status is `finance_director_approved`.

**Action required — UserPermission seed update:**
The `prisma/seed.ts` (or a data migration) should ensure Director of Finance group members have level **5** (not level 4) for REQUISITIONS in the `user_permissions` table. Per `permission.md`, this is already documented but needs verification in live data.

### 4.3 What Each Role Can See and Do

| Permission Level | See Own | See All | Create/Edit Draft | Submit | Approve (Supervisor) | Approve (Finance Dir) | Approve (DOS) | Assign Account | Issue PO | Reject |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Level 1 (Viewer) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Level 2 (General User) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Level 3 (Supervisor) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Level 4 (PO Entry) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Level 5 (Finance Director) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Level 6 / ADMIN (Director of Schools) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 4.4 Queue Filters by Role (for "Pending My Approval" tab)

| Level | Status Shown in Pending Queue |
|---|---|
| 3 (Supervisor) | `submitted` |
| 4 (PO Entry/Purchasing) | `dos_approved` |
| 5 (Finance Director) | `supervisor_approved` |
| 6 / ADMIN | `finance_director_approved` |

---

## 5. Frontend Architecture

### 5.1 Pages

All three existing pages continue to be used. No new pages are required.

| Page | File | Changes Required |
|---|---|---|
| List | `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Update `STATUS_FOR_LEVEL` pending tab filter for levels 4, 5, 6 |
| Detail | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Update `WORKFLOW_STAGES` stepper; update `REJECTABLE` array |
| Wizard | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | No changes required |

### 5.2 Type Changes

**File:** `frontend/src/types/purchaseOrder.types.ts`

```typescript
// Update PO_STATUSES array:
export const PO_STATUSES = [
  'draft',
  'submitted',
  'supervisor_approved',
  'finance_director_approved',  // replaces dos_approved
  'dos_approved',               // replaces schools_approved
  'po_issued',
  'denied',
] as const;

// Update PO_STATUS_LABELS:
export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft:                      'Draft',
  submitted:                  'Submitted',
  supervisor_approved:        'Supervisor Approved',
  finance_director_approved:  'Finance Director Approved',
  dos_approved:               'Director of Schools Approved',
  po_issued:                  'PO Issued',
  denied:                     'Denied',
};

// Update PO_STATUS_CHIP_COLOR:
export const PO_STATUS_CHIP_COLOR: Record<POStatus, ...> = {
  draft:                      'default',
  submitted:                  'info',
  supervisor_approved:        'warning',
  finance_director_approved:  'warning',
  dos_approved:               'warning',
  po_issued:                  'success',
  denied:                     'error',
};
```

### 5.3 PurchaseOrderDetail.tsx Changes

```typescript
// Update WORKFLOW_STAGES stepper:
const WORKFLOW_STAGES: { status: POStatus; label: string }[] = [
  { status: 'draft',                      label: 'Draft Created' },
  { status: 'submitted',                  label: 'Submitted for Approval' },
  { status: 'supervisor_approved',        label: 'Supervisor Approved' },
  { status: 'finance_director_approved',  label: 'Finance Director Approved' },
  { status: 'dos_approved',               label: 'Director of Schools Approved' },
  { status: 'po_issued',                  label: 'PO Issued' },
];

// Update REJECTABLE array:
const REJECTABLE = [
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
];
```

### 5.4 PurchaseOrderList.tsx Changes

```typescript
// Update pending tab STATUS_FOR_LEVEL:
const STATUS_FOR_LEVEL: Partial<Record<number, POStatus>> = {
  3: 'submitted',              // Supervisor sees submitted records
  4: 'dos_approved',           // PO Entry sees Director-of-Schools-approved records
  5: 'supervisor_approved',    // Finance Director sees supervisor-approved records
  6: 'finance_director_approved', // Director of Schools sees finance-director-approved records
};
```

### 5.5 State Management

No changes to TanStack Query hooks or Zustand store are required. The query keys and mutation functions remain identical — only the type constants change.

---

## 6. Email Notification Design

### 6.1 Email Infrastructure

**Transport:** Nodemailer (existing, `email.service.ts`)  
**Environment variables:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`  
**Safety:** All user-supplied strings pass through `escapeHtml()` before HTML embedding. Email failures are caught and logged; they never propagate to the API response.

### 6.2 Existing Email Functions

All four existing functions remain valid and require only label/text updates — no new functions are needed for the core workflow.

| Function | Current | Change Required |
|---|---|---|
| `sendRequisitionSubmitted(po, toEmail)` | Notifies supervisor | No change |
| `sendRequisitionApproved(po, toEmail, stageName)` | Notifies requestor of progress | Update stage label strings passed from controller |
| `sendRequisitionRejected(po, toEmail, reason)` | Notifies requestor of denial | No change |
| `sendPOIssued(po, toEmail)` | Notifies requestor of PO issuance | No change |
| `sendApprovalActionRequired(po, toEmail, stageName)` | Notifies next approver in chain | Update stage label strings passed from controller |

### 6.3 Email Templates Per Step

#### Step 2 — Supervisor Denial Email

**Trigger:** `POST /:id/reject` when `fromStatus = 'submitted'`  
**Function:** `sendRequisitionRejected()`  
**Recipient:** `po.User.email` (original requestor)  
**Subject:** `Requisition Denied: {description}`  
**Body includes:**
- "Your purchase requisition has been denied at the Supervisor stage."
- PO detail table (title, amount, vendor)
- Denial reason block (styled with red left-border)
- "If you believe this was in error, contact your supervisor."

#### Step 3 — Finance Director Denial Email

**Trigger:** `POST /:id/reject` when `fromStatus = 'supervisor_approved'`  
**Function:** `sendRequisitionRejected()` (same function)
**Recipient:** `po.User.email`  
**Subject:** `Requisition Denied: {description}`  
**Body includes:**
- "Your purchase requisition has been denied at the Finance Director stage."
- PO detail table
- Denial reason block
- "If you believe this was in error, contact the Finance Director."

*Implementation note:* The `sendRequisitionRejected` function does not currently include the stage name. The denial reason is sufficient context. If stage context is desired, add an optional `stageName` parameter to `sendRequisitionRejected` and pass `"Finance Director"` from the controller.

#### Step 4 — Director of Schools Denial Email

**Trigger:** `POST /:id/reject` when `fromStatus = 'finance_director_approved'`  
**Function:** `sendRequisitionRejected()` (same function)  
**Recipient:** `po.User.email`  
**Subject:** `Requisition Denied: {description}`  
**Body:** Same template — denial reason is self-explanatory.

#### Step 5 — PO Issuance Confirmation Email

**Trigger:** `POST /:id/issue` when `status → po_issued`  
**Function:** `sendPOIssued()` (unchanged)  
**Recipient:** `po.User.email`  
**Subject:** `PO Issued: {poNumber} — {description}`  
**Body includes:**
- "Your purchase requisition has been approved and issued."
- Large PO number display (styled `font-size: 24px; color: #1565C0`)
- PO detail table (title, PO number, vendor, amount)
- "Reference this PO number when communicating with vendors."

### 6.4 Stage Advancement Notification Emails

These notify the **next approver** that action is required.

| From State | To State | Notify Who | Email Function | Stage Label |
|---|---|---|---|---|
| `draft` | `submitted` (normal) | Supervisor (by email) | `sendRequisitionSubmitted` | — |
| `draft` | `supervisor_approved` (bypass) | `purchasingStageEmail` | `sendApprovalActionRequired` | `"Finance Director Approval"` |
| `submitted` | `supervisor_approved` | `purchasingStageEmail` | `sendApprovalActionRequired` | `"Finance Director Approval"` |
| `supervisor_approved` | `finance_director_approved` | `dosStageEmail` | `sendApprovalActionRequired` | `"Director of Schools Approval"` |
| `finance_director_approved` | `dos_approved` | `poEntryStageEmail` (optional) | `sendApprovalActionRequired` | `"PO Entry Required"` |

### 6.5 Requestor Progress Notification Emails

These notify the **original requestor** each time their requisition advances.

| Stage | `stageName` passed to `sendRequisitionApproved()` |
|---|---|
| Supervisor approves | `"Supervisor Approved"` |
| Finance Director approves | `"Finance Director Approved"` |
| Director of Schools approves | `"Director of Schools Approved"` |

---

## 7. Security Considerations

### 7.1 Authentication

- All endpoints require `authenticate` middleware (validated JWT in HttpOnly cookie).
- `authenticate` validates signature, expiry, and extracts `req.user` (id, email, roles, groups).
- No endpoints in the PO workflow are public.

### 7.2 CSRF Protection

- All state-changing routes (POST, PUT, DELETE) are protected by `validateCsrfToken` middleware at the router level (`router.use(validateCsrfToken)`).
- Read-only endpoints (GET) are exempt from CSRF tokens.

### 7.3 Permission Enforcement Per Endpoint

| Action | Check | Enforcement Point |
|---|---|---|
| View PO list | `checkPermission('REQUISITIONS', 1)` | Route middleware |
| View PO detail | `checkPermission('REQUISITIONS', 1)` | Route middleware + service: own-only check for level 1–2 |
| Create draft | `checkPermission('REQUISITIONS', 2)` | Route middleware |
| Submit | `checkPermission('REQUISITIONS', 2)` + `po.requestorId === userId` | Route middleware + service |
| Approve | `checkPermission('REQUISITIONS', 3)` | Route middleware; service validates exact `permLevel` matches transition |
| Reject | `checkPermission('REQUISITIONS', 3)` | Route middleware |
| Assign account code | `checkPermission('REQUISITIONS', 4)` + `status === 'dos_approved'` | Route middleware + service |
| Issue PO | `checkPermission('REQUISITIONS', 4)` + `status === 'dos_approved'` + `accountCode != null` | Route middleware + service |

### 7.4 Input Validation

All inputs pass through Zod schemas validated in `validateRequest` middleware before reaching controllers:
- UUIDs validated with `z.string().uuid()`
- String fields max-length validated (1000 chars for denial reason, 200 chars for account code)
- Positive numbers for item quantities / prices
- Line items: min 1, max 100

### 7.5 Row-Level Access Control

```typescript
// Service enforces row-level ownership:
// Level 1: can only view/download own records
// Level 2: can only edit/delete/submit own drafts
// Level 3+: can view and act on any record in their stage's queue
```

### 7.6 Email Security

- `escapeHtml()` applied to ALL user-supplied strings before HTML embedding (prevents XSS in email bodies)
- Email addresses are never logged in full (domain portion only logged)
- Email failures are caught and logged; never propagate to API responses (no information leakage)
- SMTP credentials stored in `.env` (never committed to source control)

### 7.7 Defense Against Status Manipulation

The service enforces valid state transitions server-side — clients cannot manipulate the `status` field directly. The `status` field is never accepted as input via `UpdatePurchaseOrderSchema` (not present in that schema). Only the specific action endpoints (`/submit`, `/approve`, `/reject`, `/issue`) can transition status, and each validates the exact pre-condition (`po.status === transition.from`).

---

## 8. Implementation Plan

### 8.1 Ordered Task List

Tasks must be performed in this order to avoid broken intermediate states.

---

#### Task 1 — Create migration SQL

**Action:** Create migration file  
**File to create:** `backend/prisma/migrations/20260312130000_rename_po_statuses/migration.sql`  
**Content:** SQL to rename status values (see §2.2)

---

#### Task 2 — Update validators

**Action:** Edit `PO_VALID_STATUSES` constant  
**File to modify:** `backend/src/validators/purchaseOrder.validators.ts`

Changes:
- Remove `'purchasing_approved'` from the array
- Replace `'dos_approved'` with `'finance_director_approved'`
- Replace `'schools_approved'` with `'dos_approved'`

---

#### Task 3 — Update service

**Action:** Update business logic  
**File to modify:** `backend/src/services/purchaseOrder.service.ts`

Changes:
1. Update `APPROVAL_TRANSITIONS` to new 3-level map (levels 3, 5, 6); remove level 4 entry
2. Update `REJECTABLE_STATUSES` array
3. In `submitPurchaseOrder()`: change bypass target from `'purchasing_approved'` to `'supervisor_approved'`; update bypass notes string
4. In `assignAccountCode()`: change status guard from `'purchasing_approved'` to `'dos_approved'`
5. In `issuePurchaseOrder()`: change status guard from `'schools_approved'` to `'dos_approved'`
6. In `approvePurchaseOrder()`: no logic changes needed (uses `APPROVAL_TRANSITIONS` which is already updated)

---

#### Task 4 — Update controller

**Action:** Update email routing and stage labels  
**File to modify:** `backend/src/controllers/purchaseOrder.controller.ts`

Changes:
1. Update `stageLabels` object in `approvePurchaseOrder`:
   - Level 3: `'Supervisor Approved'`
   - Level 5: `'Finance Director Approved'`
   - Level 6: `'Director of Schools Approved'`
2. Update email forwarding logic in `approvePurchaseOrder`:
   - `permLevel === 3` → forward to `settings.purchasingStageEmail` (Finance Director queue)
   - `permLevel === 5` → forward to `settings.dosStageEmail` (Director of Schools queue)
   - `permLevel === 6` → forward to `settings.poEntryStageEmail` (PO Entry queue, optional new field)
3. In `submitPurchaseOrder()` bypass path: update log message and stage label passed to `sendApprovalActionRequired`

---

#### Task 5 — Update routes (comments only)

**Action:** Update JSDoc comments to match new role assignments  
**File to modify:** `backend/src/routes/purchaseOrder.routes.ts`

Changes (comments only — no code logic changes):
- Update comment on `/:id/approve` to reflect new level → stage mapping
- Update comment on `/:id/issue` to reflect `dos_approved` (not `schools_approved`)
- Update header comment block at top of file

---

#### Task 6 — Update email service (optional enhancement)

**Action:** Add optional `stageName` parameter to `sendRequisitionRejected`  
**File to modify:** `backend/src/services/email.service.ts`

Change:
```typescript
// Add optional stageName param for richer denial email context
export async function sendRequisitionRejected(
  po: {...},
  toEmail: string,
  reason: string,
  stageName?: string,   // ← new optional param
): Promise<void> {
  // Add to HTML body if stageName provided:
  // <p>Denied at stage: <strong>${escapeHtml(stageName)}</strong></p>
}
```

---

#### Task 7 — Update frontend types

**Action:** Update status constants and labels  
**File to modify:** `frontend/src/types/purchaseOrder.types.ts`

Changes:
1. Remove `'purchasing_approved'` from `PO_STATUSES`
2. Replace `'dos_approved'` with `'finance_director_approved'`
3. Replace `'schools_approved'` with `'dos_approved'`
4. Update `PO_STATUS_LABELS` with new display names
5. Update `PO_STATUS_CHIP_COLOR` (colors stay the same for same conceptual meaning)

---

#### Task 8 — Update PurchaseOrderDetail.tsx

**Action:** Update workflow stepper and rejectable statuses  
**File to modify:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Changes:
1. Update `WORKFLOW_STAGES` array (see §5.3)
2. Update `REJECTABLE` array (see §5.3)

---

#### Task 9 — Update PurchaseOrderList.tsx

**Action:** Update pending-tab status filter per level  
**File to modify:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

Changes:
1. Update `STATUS_FOR_LEVEL` map (see §5.4)
   - Level 4: `'dos_approved'` (was `'supervisor_approved'`)
   - Level 5: `'supervisor_approved'` (was `'purchasing_approved'`)
   - Add level 6: `'finance_director_approved'`

---

#### Task 10 — Run migration

**Command (from `backend/` directory):**
```bash
npx prisma migrate deploy
```
Or during development:
```bash
npx prisma migrate dev --name rename_po_statuses
```

---

#### Task 11 — Validate and rebuild

**Backend:**
```bash
cd backend; npx tsc --noEmit
```
**Frontend:**
```bash
cd frontend; npx tsc --noEmit
```

---

### 8.2 File Summary

**Files to CREATE:**

| Path | Purpose |
|---|---|
| `backend/prisma/migrations/20260312130000_rename_po_statuses/migration.sql` | Data migration: rename status values in DB |

**Files to MODIFY:**

| Path | Changes |
|---|---|
| `backend/src/validators/purchaseOrder.validators.ts` | Remove `purchasing_approved`; rename `dos_approved` → `finance_director_approved`; rename `schools_approved` → `dos_approved` |
| `backend/src/services/purchaseOrder.service.ts` | New `APPROVAL_TRANSITIONS` (levels 3/5/6); new `REJECTABLE_STATUSES`; bypass target; `assignAccountCode` guard; `issuePurchaseOrder` guard |
| `backend/src/controllers/purchaseOrder.controller.ts` | Stage labels; email forwarding levels; bypass email label |
| `backend/src/routes/purchaseOrder.routes.ts` | JSDoc comment updates (no code changes) |
| `backend/src/services/email.service.ts` | Optional: add `stageName` param to `sendRequisitionRejected` |
| `frontend/src/types/purchaseOrder.types.ts` | Status constants, labels, chip colors |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | `WORKFLOW_STAGES`; `REJECTABLE` |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | `STATUS_FOR_LEVEL` pending-tab map |

**Files NOT changing:**

| Path | Reason |
|---|---|
| `backend/prisma/schema.prisma` | `status` field remains `String`; no `@map` enum change needed |
| `backend/src/middleware/permissions.ts` | Permission levels 1–6 already defined |
| `backend/src/middleware/auth.ts` | No changes needed |
| `frontend/src/hooks/queries/usePurchaseOrders.ts` | Types auto-update via `purchaseOrder.types.ts` |
| `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` | No changes needed |
| `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | No changes needed |
| `backend/src/services/settings.service.ts` | `SystemSettings` field names stay as-is |
| `backend/prisma/seed.ts` | Permission records at levels 1–6 already seeded |

---

## Appendix A — Final Status Transition Table

| Current Status | HTTP Action | Min Level | New Status | Email Sent |
|---|---|---|---|---|
| `draft` | POST `/:id/submit` | 2 | `submitted` (normal) | Supervisor notified |
| `draft` | POST `/:id/submit` (bypass) | 2 | `supervisor_approved` | Finance Director notified |
| `submitted` | POST `/:id/approve` | 3 | `supervisor_approved` | Requestor + Finance Director notified |
| `submitted` | POST `/:id/reject` | 3 | `denied` | Requestor notified with reason |
| `supervisor_approved` | POST `/:id/approve` | 5 | `finance_director_approved` | Requestor + Director of Schools notified |
| `supervisor_approved` | POST `/:id/reject` | 3 | `denied` | Requestor notified with reason |
| `finance_director_approved` | POST `/:id/approve` | 6 | `dos_approved` | Requestor + PO Entry notified (if email configured) |
| `finance_director_approved` | POST `/:id/reject` | 3 | `denied` | Requestor notified with reason |
| `dos_approved` | POST `/:id/account` | 4 | `dos_approved` (unchanged) | No email |
| `dos_approved` | POST `/:id/issue` | 4 | `po_issued` | Requestor notified with PO number |
| `dos_approved` | POST `/:id/reject` | 3 | `denied` | Requestor notified with reason |

---

## Appendix B — Self-Supervisor Bypass Detail

**Conditions for bypass (all three must be true):**
1. `SystemSettings.supervisorBypassEnabled = true`
2. `po.requestorId === requestor.id` (requestor is their own primary supervisor) OR no `UserSupervisor` record with `userId = requestorId AND isPrimary = true` exists
3. `po.status === 'draft'` and the `/submit` action is being called

**Bypass transaction (atomic):**
```typescript
// Sets status = 'supervisor_approved' (Finance Director will pick up from here)
// Writes two RequisitionStatusHistory rows:
//   { fromStatus: 'draft',     toStatus: 'submitted',          notes: null }
//   { fromStatus: 'submitted', toStatus: 'supervisor_approved', notes: 'Supervisor bypass: requestor is their own primary supervisor' }
// Sets reqNumber, submittedAt, submittedDate
```

**Email sent on bypass:**
- `sendApprovalActionRequired(po, settings.purchasingStageEmail, 'Finance Director Approval')`

---

## Appendix C — Permission Level → Queue Status Matrix

This is the definitive reference for the "Pending My Approval" tab at each permission level:

| REQUISITIONS Level | Status awaiting their action | `STATUS_FOR_LEVEL` value |
|---|---|---|
| 3 (Supervisor) | `submitted` | `'submitted'` |
| 4 (PO Entry/Purchasing) | `dos_approved` | `'dos_approved'` |
| 5 (Finance Director) | `supervisor_approved` | `'supervisor_approved'` |
| 6 / ADMIN (Director of Schools) | `finance_director_approved` | `'finance_director_approved'` |

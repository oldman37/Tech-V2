# Food Service Department — PO Approval Flow Specification

**System:** Tech-V2 (Tech Department Management System)  
**Created:** 2026-04-27  
**Status:** Draft  
**Scope:** Food Service Department-specific PO workflow only — NO changes to any other department's flow

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Legacy PHP Food Requisition System Analysis](#3-legacy-php-food-requisition-system-analysis)
4. [Food Service Flow Requirements](#4-food-service-flow-requirements)
5. [Database Schema Changes](#5-database-schema-changes)
6. [Backend Changes](#6-backend-changes)
7. [Frontend Changes](#7-frontend-changes)
8. [Permission & Role Mapping](#8-permission--role-mapping)
9. [Email Notification Changes](#9-email-notification-changes)
10. [Security Considerations](#10-security-considerations)
11. [Migration Plan](#11-migration-plan)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Files Analyzed](#13-files-analyzed)

---

## 1. Executive Summary

The Food Service Department requires a **unique PO approval flow** that differs from the standard workflow used by all other departments. The standard flow routes through `Supervisor → Finance Director → Director of Schools → PO Entry`. The Food Service flow routes through `Food Services Supervisor → Director of Schools → Food Services PO Entry`.

Key differences:
- **No Finance Director stage** — the Food Services Supervisor replaces this intermediate step
- **Separate PO Entry group** — Food Service has its own PO Entry group (`ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID`) distinct from the general Finance PO Entry group (`ENTRA_FINANCE_PO_ENTRY_GROUP_ID`)
- **Director of Schools approves directly after Food Services Supervisor** (skips the `finance_director_approved` stage)

The implementation must be **purely additive** — the existing standard workflow for all other departments must remain completely untouched.

---

## 2. Current State Analysis

### 2.1 Unified PO Model

The system uses a **single `purchase_orders` table** for the entire lifecycle. There is no separate requisition table. The same record transitions from draft through approval to PO issuance.

**Schema location:** `backend/prisma/schema.prisma` — `purchase_orders` model

Key fields:
- `status` (String) — current workflow stage
- `type` (String, default `"general"`) — category field, currently unused for routing
- `entityType` (String?) — cached from `officeLocation.type` (SCHOOL, DEPARTMENT, PROGRAM, DISTRICT_OFFICE)
- `officeLocationId` (FK → OfficeLocation?) — ties the PO to an entity
- `fiscalYear` (String?) — fiscal year tracking
- `accountCode` (String?) — assigned by Finance Director during/after approval

### 2.2 Current Standard Workflow

```
draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued
                                                                                   ↗
Any active stage → denied
```

| Status | Meaning | Who Advances |
|--------|---------|--------------|
| `draft` | Created, not yet submitted | Requestor (level 2+) |
| `submitted` | Awaiting supervisor approval | Supervisor (level 3) — location-based routing |
| `supervisor_approved` | Awaiting Finance Director approval | Finance Director (level 5, group check) |
| `finance_director_approved` | Awaiting Director of Schools approval | Director of Schools (level 6, group check) |
| `dos_approved` | Awaiting PO issuance | PO Entry (level 4, group check) |
| `po_issued` | Fully complete — PO number assigned | Terminal state |
| `denied` | Rejected at any stage | Terminal state |

### 2.3 Approval Routing Logic

The service (`purchaseOrder.service.ts`) uses a **dynamic approval requirements map** loaded from `SystemSettings`:

```typescript
const approvalRequirements = {
  'submitted':                 { to: 'supervisor_approved',        requiredLevel: settings.supervisorApprovalLevel },   // default 3
  'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: settings.financeDirectorApprovalLevel }, // default 5
  'finance_director_approved': { to: 'dos_approved',               requiredLevel: settings.dosApprovalLevel },           // default 6
};
```

Additionally, the `approvePurchaseOrder()` method performs **defense-in-depth group membership checks**:
- `supervisor_approved` → requires `ENTRA_FINANCE_DIRECTOR_GROUP_ID` or `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID`
- `finance_director_approved` → requires `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID`

### 2.4 PO Issuance Logic

The `issuePurchaseOrder()` method requires:
- Status = `dos_approved`
- `accountCode` must be set
- Level 4+ permission
- Defense-in-depth: `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` group membership

### 2.5 Supervisor Routing at Submit

The submit flow (`submitPurchaseOrder()`) resolves the approving supervisor via:
1. **Priority 1:** Location's primary `LocationSupervisor` (if PO has `officeLocationId`)
2. **Priority 2:** Requestor's personal `UserSupervisor` (fallback when no location)
3. **Self-supervisor bypass:** If requestor IS their own supervisor, auto-advance to `supervisor_approved`

### 2.6 Permission System

Permissions are derived from Entra group membership via `groupAuth.ts`:
- Backend: `requireModule('REQUISITIONS', level)` middleware derives `permLevel` from groups
- Frontend: `derivePermLevelFrontend(groupIds, 'REQUISITIONS')` mirrors the backend logic
- Additional **group-specific checks** in the controller/service for defense-in-depth

### 2.7 Existing Food Service Code

The following Food Service-related code already exists:
- **Entra group env vars:** `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` and `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` are configured in `.env`
- **Group auth mapping:** Both backend and frontend `groupAuth.ts` already map `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` → `REQUISITIONS: 3`
- **UserSync mapping:** `userSync.service.ts` maps Food Services Supervisor group → `{ role: 'USER', permissions: [{ module: 'REQUISITIONS', level: 3 }] }`
- **Location supervisor type:** `FOOD_SERVICES_SUPERVISOR` is a valid `supervisorType` in the location system
- **Admin diagnostics:** `admin.routes.ts` reports whether `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` is configured
- **No food-specific PO logic exists yet** — no routing, no alternate workflow

---

## 3. Legacy PHP Food Requisition System Analysis

The legacy system (`c:\wwwroot\`) had a **completely separate set of files and database table** for food requisitions:

### 3.1 Separate Database Table

Legacy used `food_requisitions` — an entirely separate table from the regular `requisition{year}` tables. This allowed independent status tracking and approval chains.

### 3.2 Legacy Food Approval Levels (`foodreqLevel`)

| Level | Role | Capability |
|-------|------|------------|
| 1 | Director of Schools | Final approval (status 3 → 4) |
| 2 | Purchasing / PO Entry | Account code assignment; PO issuance |
| 3 | PO Entry (issue only) | Issue PO numbers (status 4 → 5) |
| 4 | Supervisor (alt) | Supervisor approval (status 1 → 2) |
| 7 | Supervisor | Supervisor approval (status 1 → 2) |
| 8+ | General User | Create requisitions, view own |

### 3.3 Legacy Food Status Flow

| Status | Meaning | Advanced By |
|--------|---------|-------------|
| 1 | Submitted (awaiting supervisor) | Requestor on create |
| 2 | Supervisor Approved | `foodreqLevel` 4 or 7 |
| 3 | Director of Schools Approved | `foodreqLevel` 2 (purchasing level) |
| 4 | DOS Approved → Awaiting PO | `foodreqLevel` 1 (DOS) |
| 5 | PO Issued | `foodreqLevel` ≤ 3 |
| 6 | Denied | Any supervisor+ |

### 3.4 Legacy Flow Summary

```
Create → Status 1 (Submitted)
  → Supervisor Approves → Status 2
    → Director of Schools Approves → Status 4
      → PO Entry Issues PO → Status 5

Self-supervisor auto-bypass: if foodreqLevel < 8, auto-advance to Status 2 on create
```

**Key Insight:** The legacy food flow had **3 approval stages** (Supervisor → DOS → PO Issue) while the standard flow had **4 stages** (Supervisor → Purchasing → DOS → PO Issue). The food flow **skipped the Purchasing/Finance Director step**.

### 3.5 Legacy Files Analyzed

- `newFoodRequisition.php` — Create form; self-supervisor bypass (foodreqLevel < 8 auto-advance to status 2)
- `approveFoodReq.php` — Approval/denial handler; level 7/4 = supervisor, level 2 = purchasing, level 1 = DOS
- `approveFoodReqAjax.php` — AJAX version of the same approval handler
- `issueFoodPO.php` — PO number entry form (foodreqLevel ≤ 3 required)
- `changeFoodAccount.php` — Account code assignment (foodreqLevel ≤ 2)
- `foodreqStatus.php` — Status list view with level-based filtering

---

## 4. Food Service Flow Requirements

### 4.1 Food Service Approval Flow

```
FOOD SERVICE FLOW
─────────────────────────────────────────────────────────────────────────

  ┌─────────┐  submit    ┌───────────┐  approve     ┌──────────────────────┐
  │  draft  │ ─────────► │ submitted │ ─(FS Sup)───► │  supervisor_approved │
  └─────────┘            └───────────┘               └──────────┬───────────┘
                              │                                  │
                              │ (self-supervisor bypass          │ approve
                              │  if requestor = FS Supervisor    │ (Director of Schools)
                              │  AND bypass enabled)             ▼
                              │                       ┌──────────────────────┐
                              └──────────────────────►│    dos_approved      │
                                                       └──────────┬───────────┘
                                                                  │
                                                                  │ issue
                                                                  │ (FS PO Entry)
                                                                  ▼
                                                       ┌──────────────────────┐
                                                       │      po_issued       │
                                                       └──────────────────────┘

  Any active stage → denied
```

### 4.2 Status Transition Comparison

| Step | Standard Flow | Food Service Flow |
|------|---------------|-------------------|
| 1 | `draft` → `submitted` | `draft` → `submitted` |
| 2 | `submitted` → `supervisor_approved` (Location Supervisor) | `submitted` → `supervisor_approved` (Food Services Supervisor) |
| 3 | `supervisor_approved` → `finance_director_approved` (Finance Director) | `supervisor_approved` → `dos_approved` (Director of Schools) **← SKIP finance_director_approved** |
| 4 | `finance_director_approved` → `dos_approved` (Director of Schools) | *(skipped)* |
| 5 | `dos_approved` → `po_issued` (Finance PO Entry) | `dos_approved` → `po_issued` (Food Services PO Entry) |

### 4.3 Entra Group Assignments

| Role in Food Service Flow | Entra Group ID | Env Var |
|---------------------------|----------------|---------|
| Food Services Supervisor | `2d999959-4fe9-43ac-8e63-435075ef7b7a` | `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` |
| Director of Schools | `0874bbc2-4c51-435f-b034-59615c2a7351` | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` |
| Food Services PO Entry | `c394ebd0-8d2e-42b4-8f35-a62c37f6fa48` | `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` |

### 4.4 How to Identify a Food Service PO

A PO is considered a "Food Service PO" when:

**Option A — Entity-based detection (Recommended):**
The PO's `officeLocationId` resolves to a location whose primary supervisor is of type `FOOD_SERVICES_SUPERVISOR`. This leverages the existing LocationSupervisor infrastructure.

**Option B — Explicit type field:**
Add a new `workflowType` field to `purchase_orders` that defaults to `'standard'` and can be set to `'food_service'` at creation time.

**Recommendation: Option B (`workflowType` field)** — This is more explicit, less fragile, and allows future department-specific workflows without complex supervisor type lookups. The `workflowType` is set at creation time based on the requestor's department or entity selection, and determines the entire approval chain.

### 4.5 Account Code Handling

In the Food Service flow:
- The **Food Services Supervisor** may optionally assign an account code during their approval (similar to how the Finance Director can in the standard flow)
- The **Director of Schools** does NOT need to separately assign an account code
- Account code must still be set before PO issuance — if not set by the Food Services Supervisor, the Food Services PO Entry user must set it before issuing

---

## 5. Database Schema Changes

### 5.1 Add `workflowType` to `purchase_orders`

```prisma
model purchase_orders {
  // ... existing fields ...

  /// Determines which approval chain this PO follows.
  /// 'standard' = default 6-stage flow (Supervisor → Finance Director → DOS → PO Entry)
  /// 'food_service' = Food Service 5-stage flow (FS Supervisor → DOS → FS PO Entry)
  workflowType  String  @default("standard")

  // ... existing fields ...

  @@index([workflowType])
}
```

**Values:** `'standard'` | `'food_service'`  
**Default:** `'standard'` — all existing POs retain current behavior  
**Set on:** Creation (based on requestor or entity selection)

### 5.2 No New Status Values Needed

The Food Service flow reuses existing statuses:
- `draft`, `submitted`, `supervisor_approved`, `dos_approved`, `po_issued`, `denied`

It **skips** `finance_director_approved` — the transition goes directly from `supervisor_approved` → `dos_approved`.

### 5.3 Prisma Migration

```sql
-- Migration: Add workflowType column to purchase_orders
ALTER TABLE "purchase_orders" ADD COLUMN "workflowType" TEXT NOT NULL DEFAULT 'standard';
CREATE INDEX "purchase_orders_workflowType_idx" ON "purchase_orders"("workflowType");
```

This is **non-destructive** — all existing rows get `'standard'` as default.

---

## 6. Backend Changes

### 6.1 Prisma Schema Update

**File:** `backend/prisma/schema.prisma`

Add `workflowType` field to the `purchase_orders` model as described in §5.1.

### 6.2 Validators Update

**File:** `backend/src/validators/purchaseOrder.validators.ts`

Add `workflowType` to the create schema:

```typescript
// In CreatePurchaseOrderSchema:
workflowType: z.enum(['standard', 'food_service']).optional().default('standard'),
```

Add to the query schema for filtering:

```typescript
// In PurchaseOrderQuerySchema:
workflowType: z.enum(['standard', 'food_service']).optional(),
```

### 6.3 PurchaseOrder Service Changes

**File:** `backend/src/services/purchaseOrder.service.ts`

#### 6.3.1 New: Food Service Approval Requirements Map

Add a second approval-requirements builder for the food service flow:

```typescript
private async getFoodServiceApprovalRequirements(): Promise<Partial<Record<POStatus, { to: POStatus; requiredLevel: number }>>> {
  const s = await this.settingsService.getSettings();
  return {
    'submitted':           { to: 'supervisor_approved', requiredLevel: s.supervisorApprovalLevel },
    'supervisor_approved': { to: 'dos_approved',        requiredLevel: s.dosApprovalLevel },
    // NOTE: finance_director_approved stage is SKIPPED
  };
}
```

#### 6.3.2 Modify: `approvePurchaseOrder()`

The approve method must select the correct requirements map based on `workflowType`:

```typescript
async approvePurchaseOrder(id, userId, permLevel, userGroups, approveData?) {
  const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
  if (!po) throw new NotFoundError('Purchase order', id);

  // Select approval chain based on workflow type
  const approvalRequirements = po.workflowType === 'food_service'
    ? await this.getFoodServiceApprovalRequirements()
    : await this.getApprovalRequirements();

  const stageReq = approvalRequirements[po.status as POStatus];
  // ... rest of existing logic
```

**Defense-in-depth group checks** must also branch on `workflowType`:

For `food_service` POs at `supervisor_approved` stage:
- Require `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` (NOT Finance Director — Food Service skips FD)

For `food_service` POs at `submitted` stage:
- Require `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` membership OR location supervisor check

**Important:** Remove or bypass the Finance Director group check for food service POs when status is `supervisor_approved`.

#### 6.3.3 Modify: `issuePurchaseOrder()`

Update the PO Entry group check to also accept `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` for food service POs:

```typescript
// In the controller (purchaseOrder.controller.ts) issuePurchaseOrder handler:
const po = await service.getPurchaseOrderById(req.params.id, req.user!.id, permLvl);
const userGroups = req.user!.groups ?? [];

if (po.workflowType === 'food_service') {
  const fsPoEntryGroupId = process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID;
  if (fsPoEntryGroupId && !userGroups.includes(fsPoEntryGroupId)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Issuing a Food Service PO requires membership in the Food Services PO Entry group',
    });
  }
} else {
  // Existing check for ENTRA_FINANCE_PO_ENTRY_GROUP_ID
}
```

#### 6.3.4 Modify: `createPurchaseOrder()`

Pass through the `workflowType` field to the Prisma create:

```typescript
const record = await tx.purchase_orders.create({
  data: {
    // ... existing fields ...
    workflowType: data.workflowType ?? 'standard',
  },
});
```

#### 6.3.5 Modify: `submitPurchaseOrder()`

For food service POs, the supervisor lookup should prioritize the Food Services Supervisor from the location's supervisor records:

- If `workflowType === 'food_service'` and `officeLocationId` is set, look for a `FOOD_SERVICES_SUPERVISOR` type LocationSupervisor
- Self-supervisor bypass should still work the same way

#### 6.3.6 Modify: `getPurchaseOrders()` — `pendingMyApproval` Filter

Update the `pendingMyApproval` logic to include Food Service-specific stages:

```typescript
// For Food Service POs: DOS approves after supervisor_approved (no FD stage)
const fsSupervisorGroupId = process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID;
const isFSSupervisor = fsSupervisorGroupId ? userGroups.includes(fsSupervisorGroupId) : false;

// Add food service supervisor pending items
if (isFSSupervisor) {
  pendingOrClauses.push({
    status: 'submitted',
    workflowType: 'food_service',
    // Location-scoped if supervisor has assigned locations
  });
}

// DOS can approve food service POs at supervisor_approved stage
if (isDoS) {
  pendingOrClauses.push({
    status: 'supervisor_approved',
    workflowType: 'food_service',
  });
}

// Food Service PO Entry: issue food service POs at dos_approved
const fsPoEntryGroupId = process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID;
const isFsPoEntry = fsPoEntryGroupId ? userGroups.includes(fsPoEntryGroupId) : false;
if (isFsPoEntry) {
  pendingOrClauses.push({
    status: 'dos_approved',
    workflowType: 'food_service',
  });
}
```

#### 6.3.7 Modify: `assignAccountCode()`

For food service POs, also allow the Food Services Supervisor group to assign account codes (at `supervisor_approved` or later):

```typescript
// In the controller, replace the strict Finance Director check:
if (po.workflowType === 'food_service') {
  const fsSupGroupId = process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID;
  const isAuthorised =
    (fsSupGroupId && userGroups.includes(fsSupGroupId)) ||
    req.user!.roles?.includes('ADMIN') === true;
  if (!isAuthorised) {
    return res.status(403).json({ ... });
  }
} else {
  // Existing Finance Director check
}
```

### 6.4 Controller Changes

**File:** `backend/src/controllers/purchaseOrder.controller.ts`

#### 6.4.1 `approvePurchaseOrder` handler

Update the notification logic to handle the food service flow:

```typescript
if (po.status === 'supervisor_approved' && po.workflowType === 'food_service') {
  // Food Service: supervisor approved → notify Director of Schools (skip FD)
  if (snapshot?.dos?.length) {
    sendApprovalActionRequired(po, snapshot.dos, 'Director of Schools Approval').catch(() => {});
  }
} else if (po.status === 'supervisor_approved') {
  // Standard: supervisor approved → notify Finance Director
  if (snapshot?.finance?.length) {
    sendApprovalActionRequired(po, snapshot.finance, 'Finance Director Approval').catch(() => {});
  }
}
// dos_approved: Food Service → notify Food Services PO Entry (new); Standard → notify Finance PO Entry
```

#### 6.4.2 `issuePurchaseOrder` handler

Branch the group check on `workflowType` as described in §6.3.3.

#### 6.4.3 `assignAccountCode` handler

Branch the group check on `workflowType` as described in §6.3.7.

### 6.5 Routes Changes

**File:** `backend/src/routes/purchaseOrder.routes.ts`

No route changes needed — the existing endpoints handle both workflows. The branching happens in the service/controller layer.

### 6.6 Group Auth Changes

**File:** `backend/src/utils/groupAuth.ts`

Add `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` to the REQUISITIONS module mapping:

```typescript
REQUISITIONS: [
  // ... existing entries ...
  ['ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID', 4],  // Food Service PO Entry — same level as Finance PO Entry
],
```

### 6.7 UserSync Service Changes

**File:** `backend/src/services/userSync.service.ts`

Add mapping for the Food Services PO Entry group:

```typescript
addMapping('ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID', process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID, {
  role: 'USER',
  permissions: [
    { module: 'REQUISITIONS', level: 4 },
  ],
});
```

### 6.8 Email Service Changes

**File:** `backend/src/services/email.service.ts`

Update `buildApproverEmailSnapshot()` to also fetch Food Service PO Entry group emails:

```typescript
const fsPoEntryGroupId = process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID;

const [finance, dos, poEntry, fsPoEntry] = await Promise.all([
  financeGroupId   ? fetchGroupEmails(financeGroupId)   : Promise.resolve([]),
  dosGroupId       ? fetchGroupEmails(dosGroupId)       : Promise.resolve([]),
  poEntryGroupId   ? fetchGroupEmails(poEntryGroupId)   : Promise.resolve([]),
  fsPoEntryGroupId ? fetchGroupEmails(fsPoEntryGroupId) : Promise.resolve([]),
]);

return { supervisor: supervisorEmails, finance, dos, poEntry, fsPoEntry };
```

Update the `ApproverEmailSnapshot` type to include `fsPoEntry: string[]`.

---

## 7. Frontend Changes

### 7.1 Type Updates

**File:** `frontend/src/types/purchaseOrder.types.ts`

Add the workflow type:

```typescript
export type WorkflowType = 'standard' | 'food_service';
```

Add to the `PurchaseOrder` interface:

```typescript
workflowType: WorkflowType;
```

### 7.2 Group Auth Update

**File:** `frontend/src/utils/groupAuth.ts`

Add `VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` mapping:

```typescript
VITE_ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID: { REQUISITIONS: 4 },
```

### 7.3 RequisitionWizard Changes

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

Add ability to select workflow type. This should be **auto-detected** where possible:

- If the selected entity location has a `FOOD_SERVICES_SUPERVISOR` type supervisor, auto-set `workflowType: 'food_service'`
- Include a manual override (or informational display) showing which approval path will be used
- Pass `workflowType` in the create payload

### 7.4 PurchaseOrderDetail Changes

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

#### 7.4.1 Workflow Stages Timeline

The timeline stepper must show the correct stages based on `workflowType`:

```typescript
const STANDARD_WORKFLOW_STAGES = [
  { status: 'draft',                     label: 'Draft Created' },
  { status: 'submitted',                 label: 'Submitted for Approval' },
  { status: 'supervisor_approved',       label: 'Supervisor Approved' },
  { status: 'finance_director_approved', label: 'Finance Director Approved' },
  { status: 'dos_approved',              label: 'Director of Schools Approved' },
  { status: 'po_issued',                 label: 'PO Issued' },
];

const FOOD_SERVICE_WORKFLOW_STAGES = [
  { status: 'draft',               label: 'Draft Created' },
  { status: 'submitted',           label: 'Submitted for Approval' },
  { status: 'supervisor_approved', label: 'Food Services Supervisor Approved' },
  { status: 'dos_approved',        label: 'Director of Schools Approved' },
  { status: 'po_issued',           label: 'PO Issued' },
];

const WORKFLOW_STAGES = po.workflowType === 'food_service'
  ? FOOD_SERVICE_WORKFLOW_STAGES
  : STANDARD_WORKFLOW_STAGES;
```

#### 7.4.2 Action Button Visibility

Update the permission checks for the action panel:

For food service POs:
- **Approve at supervisor stage:** Check `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` membership (or location supervisor check)
- **Approve at supervisor_approved stage:** Check `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` (skip Finance Director)
- **Issue at dos_approved stage:** Check `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` (not Finance PO Entry)
- **Assign account code:** Allow Food Services Supervisor group in addition to Finance Director

#### 7.4.3 Approval Button Labels

```typescript
const FOOD_SERVICE_APPROVE_LABELS: Partial<Record<POStatus, string>> = {
  'submitted':           'Approve as Food Services Supervisor',
  'supervisor_approved': 'Approve as Director of Schools',
};

const FOOD_SERVICE_WAITING_LABELS: Partial<Record<POStatus, string>> = {
  'submitted':           'Awaiting Food Services Supervisor Approval',
  'supervisor_approved': 'Awaiting Director of Schools Approval',
  'dos_approved':        'Awaiting PO Issuance',
};
```

### 7.5 PurchaseOrderList Changes

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

- Add a column or badge indicating the workflow type (e.g., "Food Service" chip)
- Optionally add a filter for workflow type
- The "Pending My Approval" tab already delegates to the backend, which will be updated to include food service items

### 7.6 Frontend Service Changes

**File:** `frontend/src/services/purchaseOrder.service.ts`

Add `workflowType` to the filter params:

```typescript
if (filters.workflowType)  q.append('workflowType', filters.workflowType);
```

### 7.7 Auth Store / Permission Hooks

Add flags for food service-specific capabilities:

```typescript
isFoodServiceSupervisor: boolean;  // user is in ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID
isFoodServicePoEntry: boolean;     // user is in ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID
```

These should be derived from the user's group memberships in the auth store, similar to existing `isFinanceDirectorApprover`, `isDosApprover`, `isPoEntryUser`.

---

## 8. Permission & Role Mapping

### 8.1 Food Service Entra Group → Permission Mapping

| Entra Group | Env Var | App Role | REQUISITIONS Level | Workflow Actions |
|-------------|---------|----------|-------------------|------------------|
| Food Services Supervisor | `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` | USER | 3 | Approve food service POs at `submitted` stage; assign account code |
| Director of Schools | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | ADMIN | 6 | Approve food service POs at `supervisor_approved` stage |
| Food Services PO Entry | `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` | USER | 4 | Issue PO numbers for food service POs at `dos_approved` stage |

### 8.2 New `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` Integration

This group needs to be added to:
1. `backend/src/utils/groupAuth.ts` — REQUISITIONS level 4
2. `frontend/src/utils/groupAuth.ts` — REQUISITIONS level 4
3. `backend/src/services/userSync.service.ts` — REQUISITIONS level 4 mapping
4. `backend/src/routes/admin.routes.ts` — diagnostics reporting
5. `frontend/src/services/adminService.ts` — diagnostics type

### 8.3 No Changes to Standard Workflow Permissions

The standard workflow permission checks remain exactly as-is. Branching only occurs when `workflowType === 'food_service'` on the PO record.

---

## 9. Email Notification Changes

### 9.1 Food Service Notification Flow

| Transition | Who Gets Notified | Template |
|------------|-------------------|----------|
| `draft` → `submitted` | Food Services Supervisor (location-based) | `sendRequisitionSubmitted` |
| `submitted` → `supervisor_approved` | Requestor + Director of Schools group | `sendRequisitionApproved` + `sendApprovalActionRequired` |
| `supervisor_approved` → `dos_approved` | Requestor + Food Services PO Entry group | `sendRequisitionApproved` + `sendApprovalActionRequired` |
| `dos_approved` → `po_issued` | Requestor | `sendPOIssued` |
| Any → `denied` | Requestor | `sendRequisitionRejected` |

### 9.2 Snapshot Enhancement

The `approverEmailsSnapshot` (built at submit time) needs a new `fsPoEntry` field to cache Food Services PO Entry group emails.

---

## 10. Security Considerations

### 10.1 Authorization Enforcement

All food service-specific authorization checks must be **server-side** with defense-in-depth Entra group membership verification:

- **Supervisor approval:** Verify approver is in `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` for food service POs
- **DOS approval:** Verify approver is in `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` (same as standard)
- **PO issuance:** Verify issuer is in `ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID` for food service POs
- **Account code:** Verify assigner is in `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` for food service POs

### 10.2 Frontend Guards Are UX-Only

Frontend permission checks (button visibility, route guards) are convenience only. The backend must independently enforce all access control.

### 10.3 Input Validation

The `workflowType` field must be:
- Validated by Zod schema (`z.enum(['standard', 'food_service'])`)
- Immutable after creation (cannot be changed via PUT)
- Default to `'standard'` if not provided

### 10.4 Prevent Cross-Workflow Interference

- Standard PO Entry (`ENTRA_FINANCE_PO_ENTRY_GROUP_ID`) must NOT be able to issue food service POs
- Food Service PO Entry (`ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID`) must NOT be able to issue standard POs
- Finance Director must NOT be a required approver for food service POs
- Food Services Supervisor must NOT be able to approve at the `supervisor_approved → finance_director_approved` stage of standard POs

### 10.5 Audit Trail

All food service workflow transitions must create `RequisitionStatusHistory` records identical to the standard flow. The `workflowType` on the parent PO provides context for audit queries.

---

## 11. Migration Plan

### 11.1 Database Migration

1. Generate Prisma migration: `npx prisma migrate dev --name add_workflow_type`
2. This adds `workflowType TEXT NOT NULL DEFAULT 'standard'` to `purchase_orders`
3. All existing POs automatically get `workflowType = 'standard'` — no data migration needed
4. Add index on `workflowType` for efficient filtering

### 11.2 Deployment Order

1. **Database migration** — add column (backward-compatible, all rows default to 'standard')
2. **Backend deployment** — service/controller/route changes
3. **Frontend deployment** — UI changes for food service workflow display and creation

### 11.3 Rollback Strategy

- The `workflowType` column can be dropped without data loss
- Any food service POs created during the rollback window would have `workflowType = 'food_service'` but would fall through to standard behavior if the branching code is removed
- No existing data is modified

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Food service PO accidentally marked as standard | Wrong approval chain followed | Auto-detect `workflowType` from entity location's supervisor type; show clear UI indication |
| Standard PO accidentally marked as food service | Skips Finance Director review | Only allow `food_service` type when entity location has a `FOOD_SERVICES_SUPERVISOR`; backend validation |
| Food Services PO Entry group not configured in .env | Food service POs get stuck at `dos_approved` | Log warning on startup if env var is missing; fall back to standard PO Entry group |
| Director of Schools unavailable | Food service POs queue at `supervisor_approved` | Same risk as standard flow; no additional mitigation needed |
| Mixed group membership (user is in both FS Supervisor and Finance Director) | Confusing approval permissions | `workflowType` on the PO determines which checks apply, not the user's groups |
| Legacy data migration | Existing food requisitions in legacy system | Out of scope — this spec covers only new POs in Tech-V2 |

---

## 13. Files Analyzed

### Backend Files
| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | Database schema — purchase_orders, po_items, RequisitionStatusHistory, SystemSettings models |
| `backend/src/services/purchaseOrder.service.ts` | Core business logic — create, submit, approve, reject, issue, list, PDF |
| `backend/src/controllers/purchaseOrder.controller.ts` | HTTP handlers — email notifications, group-based defense-in-depth |
| `backend/src/routes/purchaseOrder.routes.ts` | Route definitions with requireModule middleware |
| `backend/src/middleware/auth.ts` | JWT authentication, requireAdmin, requireGroup |
| `backend/src/utils/groupAuth.ts` | Group → permission level derivation (requireModule middleware) |
| `backend/src/services/userSync.service.ts` | Entra group → role/permission auto-mapping at login |
| `backend/src/services/email.service.ts` | Email notifications, approver email snapshot builder |
| `backend/src/services/settings.service.ts` | SystemSettings singleton, dynamic approval levels |
| `backend/src/validators/purchaseOrder.validators.ts` | Zod validation schemas for all PO endpoints |
| `backend/src/config/entraId.ts` | MSAL/Graph client configuration |
| `backend/src/routes/admin.routes.ts` | Admin diagnostics including group configuration status |
| `backend/src/services/location.service.ts` | Location supervisor types including FOOD_SERVICES_SUPERVISOR |
| `backend/src/validators/location.validators.ts` | Valid supervisor types enum |
| `backend/.env` | Environment variables with all Entra group IDs |

### Frontend Files
| File | Purpose |
|------|---------|
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | PO list view with tabs, filters, pagination |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | PO detail with timeline stepper, action buttons |
| `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Multi-step creation form |
| `frontend/src/services/purchaseOrder.service.ts` | API client for all PO endpoints |
| `frontend/src/types/purchaseOrder.types.ts` | TypeScript types, status enums, labels, chip colors |
| `frontend/src/utils/groupAuth.ts` | Frontend group → permission derivation |
| `frontend/src/services/adminService.ts` | Admin diagnostics service types |
| `frontend/src/types/location.types.ts` | Location types including FOOD_SERVICES_SUPERVISOR |

### Shared Files
| File | Purpose |
|------|---------|
| `shared/src/types.ts` | Shared types including FOOD_SERVICES_SUPERVISOR supervisor type |

### Documentation Files
| File | Purpose |
|------|---------|
| `docs/requisition_flow.md` | Complete current PO workflow documentation |
| `docs/PERMISSIONS_AND_ROLES.md` | Permission system documentation |
| `docs/permission.md` | Permission reference documentation |

### Legacy PHP Files (Reference)
| File | Purpose |
|------|---------|
| `wwwroot/newFoodRequisition.php` | Legacy food requisition creation form with self-supervisor bypass |
| `wwwroot/approveFoodReq.php` | Legacy food requisition approval handler (3-tier: supervisor → DOS → PO entry) |
| `wwwroot/approveFoodReqAjax.php` | Legacy AJAX food approval handler |
| `wwwroot/issueFoodPO.php` | Legacy food PO issuance form |
| `wwwroot/changeFoodAccount.php` | Legacy food account code assignment |
| `wwwroot/foodreqStatus.php` | Legacy food requisition status list view |

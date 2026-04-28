# Requisition & Purchase Order — Complete Flow

**System:** Tech-V2 (Tech Department Management System)  
**Last Updated:** March 2026  
**Sprint:** C-2 (Purchase Orders Backend)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Models](#2-database-models)
3. [Permission Model](#3-permission-model)
4. [Workflow State Machine](#4-workflow-state-machine)
5. [API Endpoints](#5-api-endpoints)
6. [Stage-by-Stage Walkthrough](#6-stage-by-stage-walkthrough)
7. [Self-Supervisor Bypass](#7-self-supervisor-bypass)
8. [Email Notifications](#8-email-notifications)
9. [PDF Generation](#9-pdf-generation)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Settings & Auto-Numbering](#11-settings--auto-numbering)
12. [Validation Rules](#12-validation-rules)
13. [Audit / Status History](#13-audit--status-history)
14. [Legacy vs V2 Comparison](#14-legacy-vs-v2-comparison)

---

## 1. Overview

The system uses a **single unified model** (`purchase_orders`) that starts life as a **Requisition** (draft through approval stages) and graduates to a **Purchase Order** once it receives an official PO number at the final stage.

```
REQUISITION PHASE                         PO PHASE
──────────────────────────────────────    ─────────────
draft → submitted → supervisor_approved
     → purchasing_approved → dos_approved → po_issued
                           ↘ denied (at any active stage)
```

There is no separate "requisition table" and "PO table." The same record tracks the entire lifecycle. The `reqNumber` (e.g. `REQ-00042`) is assigned at submit time; the `poNumber` (e.g. `PO-00017`) is assigned only when the DOS issues it at the final step.

---

## 2. Database Models

### `purchase_orders` — Primary Record

| Field | Type | When Set | Purpose |
|---|---|---|---|
| `id` | UUID | Creation | Primary key |
| `reqNumber` | `String?` unique | On submit | Human-readable requisition number (`REQ-NNNNN`) |
| `poNumber` | `String?` unique | On issue | Official PO number (`PO-NNNNN`) |
| `type` | `String` | Creation | Category (default `"general"`) |
| `requestorId` | FK → User | Creation | The user who created the request |
| `vendorId` | FK → Vendor? | Creation/Edit | Optional associated vendor |
| `description` | `String` | Creation | Title / description of the request |
| `amount` | `Decimal` | Computed | Sum of all line item totals + shipping |
| `status` | `String` | Workflow transitions | Current lifecycle stage (see §4) |
| `accountCode` | `String?` | Purchasing approval | General ledger account code |
| `program` | `String?` | Creation/Edit | Program or department name |
| `isApproved` | `Boolean` | PO issuance | `true` only after `po_issued` |
| `approvedBy` | `String?` | PO issuance | Name of the DOS who issued the PO |
| `approvedDate` | `DateTime?` | PO issuance | Timestamp of issuance |
| `shipTo` | `String?` | Creation/Edit | Delivery address |
| `shippingCost` | `Decimal?` | Creation/Edit | Added to computed total |
| `notes` | `String?` | Creation/Edit | Special instructions |
| `officeLocationId` | FK → OfficeLocation? | Creation/Edit | Associated office location |
| `denialReason` | `String?` | On reject | Reason for denial |
| `submittedAt` | `DateTime?` | On submit | Timestamp of first submission |
| `approvedAt` | `DateTime?` | On DOS approve | Timestamp of DOS approval |
| `issuedAt` | `DateTime?` | On PO issue | Timestamp of PO issuance |
| `createdAt` | `DateTime` | Creation | Auto-set by Prisma |
| `updatedAt` | `DateTime` | Any update | Auto-updated by Prisma |

### `po_items` — Line Items

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `poId` | FK → purchase_orders | Cascade-delete with parent |
| `lineNumber` | `Int` | Display order |
| `description` | `String` | Item description |
| `model` | `String?` | Model/part number |
| `quantity` | `Int` | Quantity requested |
| `unitPrice` | `Decimal` | Price per unit |
| `totalPrice` | `Decimal` | `quantity × unitPrice` |

**Constraints:** min 1 item, max 100 items per requisition.  
On `updatePurchaseOrder` with new `items`, **all existing items are deleted and replaced atomically** inside a `$transaction`.

### `RequisitionStatusHistory` — Audit Trail

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID | PK |
| `purchaseOrderId` | FK → purchase_orders | Which PO this event belongs to |
| `fromStatus` | `String` | Status before the transition |
| `toStatus` | `String` | Status after the transition |
| `changedById` | FK → User | Who performed the action |
| `changedAt` | `DateTime` | When it happened |
| `notes` | `String?` | Optional comment (approval notes, denial reason) |

Every workflow action writes at least one history row. The supervisor bypass path writes **two** rows in a single transaction.

### `SystemSettings` — Singleton Configuration

| Field | Type | Default | Purpose |
|---|---|---|---|
| `nextReqNumber` | `Int` | 1 | Auto-increment counter for `REQ-NNNNN` |
| `reqNumberPrefix` | `String` | `"REQ"` | Prefix for req numbers |
| `nextPoNumber` | `Int` | 1 | Auto-increment counter for `PO-NNNNN` |
| `poNumberPrefix` | `String` | `"PO"` | Prefix for PO numbers |
| `supervisorBypassEnabled` | `Boolean` | `false` | Feature flag: allow bypass when requestor = own supervisor |
| `supervisorStageEmail` | `String?` | null | Where to CC on submission for supervisor approval |
| `purchasingStageEmail` | `String?` | null | Where to CC when reaching purchasing stage |
| `dosStageEmail` | `String?` | null | Where to CC when reaching DOS stage |

The singleton row always has `id = "singleton"`. Settings are updated through the separate Settings API; the PO service reads them at each workflow step.

---

## 3. Permission Model

**Module:** `REQUISITIONS`

| Level | Role Name | Capabilities |
|---|---|---|
| **1** | Viewer | View own POs (list, detail, PDF, history) |
| **2** | Requestor / Staff | Create drafts; edit own drafts; delete own drafts; submit for approval |
| **3** | Supervisor | Approve `submitted → supervisor_approved`; reject any in-progress requisition |
| **4** | Purchasing Staff | Approve `supervisor_approved → purchasing_approved`; assign account code |
| **5** | Director of Services (DOS) | Approve `purchasing_approved → dos_approved`; issue PO number (`dos_approved → po_issued`) |
| **ADMIN role** | System Admin | Treated as level 5; bypasses all permission checks |

**How permission levels are resolved at runtime:**

1. `authenticate` middleware validates the JWT and attaches `req.user`.
2. `checkPermission('REQUISITIONS', minLevel)` queries `user_permissions` for the user's highest `REQUISITIONS` level.
3. If the user has the `ADMIN` role it short-circuits to level 5.
4. The resolved `permLevel` is attached to `req.user.permLevel` for downstream use in the controller and service.

---

## 4. Workflow State Machine

### Valid Statuses

| Status | Meaning |
|---|---|
| `draft` | Created but not yet submitted |
| `submitted` | Awaiting supervisor approval |
| `supervisor_approved` | Supervisor approved; awaiting purchasing review |
| `purchasing_approved` | Purchasing approved; awaiting DOS approval |
| `dos_approved` | DOS approved; ready for PO issuance |
| `po_issued` | PO number assigned — fully approved and issued |
| `denied` | Rejected at any stage |

### State Transition Diagram

```
                    ┌────────────────────────────────────────────────────────────┐
                    │                     REQUISITION FLOW                       │
                    └────────────────────────────────────────────────────────────┘

  ┌─────────┐  submit    ┌───────────┐  approve     ┌──────────────────────┐
  │  draft  │ ─────────► │ submitted │ ─(level 3)──► │  supervisor_approved │
  └─────────┘            └───────────┘               └──────────┬───────────┘
                              │                                  │
                              │ (supervisor bypass:              │ approve
                              │  user IS own supervisor          │ (level 4)
                              │  AND bypass enabled)             ▼
                              │                       ┌──────────────────────┐
                              └──────────────────────►│ purchasing_approved  │
                                                       └──────────┬───────────┘
                                                                  │
                                                                  │ approve
                                                                  │ (level 5)
                                                                  ▼
                                                       ┌──────────────────────┐
                                                       │    dos_approved      │
                                                       └──────────┬───────────┘
                                                                  │
                                                                  │ issue
                                                                  │ (level 5)
                                                                  ▼
                                                       ┌──────────────────────┐
                                                       │      po_issued       │  ← Terminal: fully complete
                                                       └──────────────────────┘

  Any stage except draft/po_issued:
  ─────────────────────────────────
  [reject, level 3+] ──────────────────────────────────────────► denied  ← Terminal

```

### Approval Transition Map

```typescript
const APPROVAL_TRANSITIONS = {
  3: { from: 'submitted',          to: 'supervisor_approved' },
  4: { from: 'supervisor_approved', to: 'purchasing_approved' },
  5: { from: 'purchasing_approved', to: 'dos_approved' },
};
```

A level-3 user calling `/approve` on a `supervisor_approved` record will receive a 403. Each level only advances its own stage.

---

## 5. API Endpoints

**Base path:** `/api/purchase-orders`  
**Auth:** All routes require `authenticate` + `validateCsrfToken` middleware.

| Method | Path | Min Level | Description |
|---|---|---|---|
| `GET` | `/` | 1 | List purchase orders (paginated, filtered) |
| `POST` | `/` | 2 | Create a new draft |
| `GET` | `/:id` | 1 | Get single PO detail |
| `PUT` | `/:id` | 2 | Update a draft (draft status only) |
| `DELETE` | `/:id` | 2 | Delete a draft (draft status only) |
| `POST` | `/:id/submit` | 2 | Submit for approval |
| `POST` | `/:id/approve` | 3 | Advance to next approval stage |
| `POST` | `/:id/reject` | 3 | Deny at current active stage |
| `POST` | `/:id/account` | 4 | Assign account code |
| `POST` | `/:id/issue` | 5 | Issue PO number (final step) |
| `GET` | `/:id/pdf` | 1 | Download PDF of the PO |
| `GET` | `/:id/history` | 1 | Get full status history timeline |

### List Query Parameters

| Param | Type | Description |
|---|---|---|
| `page` | `number` | Page number (default 1) |
| `limit` | `number` | Results per page (default 20) |
| `status` | `string` | Filter by status value |
| `search` | `string` | Full-text search on description/reqNumber/poNumber |
| `dateFrom` | `ISO date` | Filter created >= dateFrom |
| `dateTo` | `ISO date` | Filter created <= dateTo |
| `locationId` | `string` | Filter by office location |

**Scoping:** Level-1 users see only their own records (`requestorId = userId`). Level 2+ see all records.

---

## 6. Stage-by-Stage Walkthrough

### Stage 0 — Create Draft

**Who:** Any user with REQUISITIONS level ≥ 2  
**Endpoint:** `POST /api/purchase-orders`

1. Client sends `CreatePurchaseOrderSchema` payload (title, optional vendor/location/shipTo/notes/program, line items array).
2. Service opens a Prisma `$transaction`:
   - Creates the `purchase_orders` row with `status = 'draft'`, `isApproved = false`.
   - Computes `amount = Σ(item.quantity × item.unitPrice) + shippingCost`.
   - Creates all `po_items` rows in bulk with numbered `lineNumber`.
3. Returns the created record.
4. **No email sent at draft stage.**

---

### Stage 1 — Edit Draft (optional)

**Who:** Requestor (own draft, level ≥ 2)  
**Endpoint:** `PUT /api/purchase-orders/:id`

- Validates `status === 'draft'`; any other status returns 400.
- If `items` array is provided, all existing `po_items` are deleted and replaced atomically.
- Recomputes `amount` if items or `shippingCost` change.
- No status change; no email.

---

### Stage 2 — Submit

**Who:** Requestor (own draft, level ≥ 2)  
**Endpoint:** `POST /api/purchase-orders/:id/submit`

1. Validates `status === 'draft'`.
2. Atomically claims a `reqNumber` via raw SQL (`UPDATE system_settings SET "nextReqNumber" = "nextReqNumber" + 1 RETURNING *`).
3. **Checks for self-supervisor bypass** (see §7):
   - Look up requestor's primary supervisor in `user_supervisors`.
   - If `supervisor.supervisorId === requestor.id` (or no supervisor) AND `supervisorBypassEnabled = true`:
     - Set `status = 'purchasing_approved'`; set `submittedAt = now`.
     - Write TWO history rows: `draft→submitted` + `submitted→purchasing_approved`.
     - Send email to `purchasingStageEmail`.
   - Otherwise (normal path):
     - Set `status = 'submitted'`; set `submittedAt = now`.
     - Write ONE history row: `draft→submitted`.
     - Send email to requestor's supervisor.

---

### Stage 3 — Supervisor Approval

**Who:** User with REQUISITIONS level ≥ 3  
**Endpoint:** `POST /api/purchase-orders/:id/approve`

1. Validates level 3 user is calling and `status === 'submitted'`.
2. Sets `status = 'supervisor_approved'`.
3. Writes history row: `submitted→supervisor_approved`.
4. Sends `sendApprovalActionRequired` email to `purchasingStageEmail`.
5. Sends `sendRequisitionApproved` (notification) email to the original requestor.

---

### Stage 4 — Purchasing Approval

**Who:** User with REQUISITIONS level ≥ 4  
**Endpoint:** `POST /api/purchase-orders/:id/approve`

1. Validates level 4 and `status === 'supervisor_approved'`.
2. Sets `status = 'purchasing_approved'`.
3. Writes history row.
4. Sends `sendApprovalActionRequired` to `dosStageEmail`.
5. Sends `sendRequisitionApproved` to requestor.

**Optional — Assign Account Code:**  
`POST /api/purchase-orders/:id/account`  
- Validates level ≥ 4 and `status === 'purchasing_approved'`.
- Updates `accountCode`.
- Writes history row.
- No email triggered.

---

### Stage 5 — DOS Approval

**Who:** User with REQUISITIONS level 5 (or ADMIN)  
**Endpoint:** `POST /api/purchase-orders/:id/approve`

1. Validates level 5 and `status === 'purchasing_approved'`.
2. Sets `status = 'dos_approved'`; sets `approvedAt = now`.
3. Writes history row.
4. Sends `sendApprovalActionRequired` with PO-issuance instructions to `dosStageEmail`.
5. Sends `sendRequisitionApproved` to requestor.

---

### Stage 6 — PO Issuance (Final)

**Who:** User with REQUISITIONS level 5 (or ADMIN)  
**Endpoint:** `POST /api/purchase-orders/:id/issue`

**Pre-conditions (enforced by service):**
- `status === 'dos_approved'`
- `accountCode` must be set (cannot issue without one)

**Steps:**
1. Optional `poNumber` override in request body (`IssuePOSchema`). If omitted → auto-generate via `SettingsService.getNextPoNumber()`.
2. Uniqueness check: if a custom `poNumber` is provided, verify it doesn't already exist in the DB.
3. Atomically claims number via raw SQL increment (same race-condition-safe approach as req numbers).
4. Sets:
   - `status = 'po_issued'`
   - `poNumber = <generated or provided>`
   - `isApproved = true`
   - `approvedBy = issuing user's display name`
   - `approvedDate = now`
   - `issuedAt = now`
5. Writes history row: `dos_approved→po_issued`.
6. Sends `sendPOIssued` email to requestor with the PO number.

---

### Rejection (Any Active Stage)

**Who:** User with REQUISITIONS level ≥ 3  
**Endpoint:** `POST /api/purchase-orders/:id/reject`  
**Body:** `{ reason: string }` (required)

**Rejectable statuses:** `submitted`, `supervisor_approved`, `purchasing_approved`, `dos_approved`

1. Validates current status is rejectable (not `draft` or terminal states).
2. Sets `status = 'denied'`, `denialReason = reason`.
3. Writes history row: `<currentStatus>→denied`, with the reason in `notes`.
4. Sends `sendRequisitionRejected` email to requestor with the denial reason.

---

### Delete Draft

**Who:** Requestor (own draft, level ≥ 2)  
**Endpoint:** `DELETE /api/purchase-orders/:id`

- Only works when `status === 'draft'`.
- Cascade-deletes all `po_items`.
- No history entry (record is removed entirely).
- No email.

---

## 7. Self-Supervisor Bypass

When an employee is their own supervisor (or has no supervisor assigned), requiring supervisor approval creates a dead-end. The bypass feature handles this.

### Conditions for Bypass

All three must be true:

1. `SystemSettings.supervisorBypassEnabled = true`
2. The requestor has no supervisor on record **OR** their supervisor's `supervisorId === requestor.id`
3. The record is in `draft` status and the `submit` action is being called

### Bypass Behavior

Instead of landing at `submitted`, the service:

- Sets `status = 'purchasing_approved'` directly
- Sets `submittedAt = now`
- Writes **two** history rows atomically:
  1. `draft → submitted` (timestamped `now`)
  2. `submitted → purchasing_approved` (timestamped `now`, notes: `"Supervisor bypass"`)
- Notifies `purchasingStageEmail` instead of a supervisor

### Visual

```
Normal submit:   draft ──► submitted ──(awaits supervisor)──► supervisor_approved ──► ...
Bypass submit:   draft ──► [two rows written] ──────────────► purchasing_approved ──► ...
```

---

## 8. Email Notifications

All emails use `escapeHtml()` on all user-supplied data before rendering HTML. Email failures are **caught and logged** — they never cause the API response to fail. This means a workflow action succeeds even if the mail server is down.

| Email Function | Trigger | Recipient |
|---|---|---|
| `sendRequisitionSubmitted` | Normal submit (non-bypass) | Supervisor's email address |
| `sendApprovalActionRequired` | Bypass submit OR any approval (levels 3, 4) | `SystemSettings.purchasingStageEmail` or `dosStageEmail` (stage-dependent) |
| `sendRequisitionApproved` | After each approval stage | Original requestor |
| `sendRequisitionRejected` | After rejection | Original requestor |
| `sendPOIssued` | After PO issuance | Original requestor |

### Email Content Includes

- Requisition/PO number
- Description / title
- Amount
- Current status
- Any notes or denial reason
- Link back to the PO detail page

---

## 9. PDF Generation

**Endpoint:** `GET /api/purchase-orders/:id/pdf`  
**Library:** PDFKit  
**Access:** Level ≥ 1 (own only for level 1; any for level 2+)

PDF is generated on-demand (not stored) and streamed as `application/pdf`.

### PDF Layout

```
┌──────────────────────────────────────────────────────┐
│        PURCHASE ORDER / Technology Department        │
│  PO Number: PO-00017          Date: March 11, 2026   │
├────────────────────────┬─────────────────────────────┤
│  Requested By:         │  Vendor:                     │
│  Jane Smith            │  Acme Supplies               │
│  jane.smith@org        │  123 Main St, City, ST 00000 │
│                        │  Ph: 800-555-1234            │
├────────────────────────┴─────────────────────────────┤
│  Ship To:  Tech Dept, 456 Office Blvd                 │
├───┬──────────────────────┬────────┬─────┬────┬───────┤
│ # │ Description           │ Model  │ Qty │ UP │ Total │
├───┼──────────────────────┼────────┼─────┼────┼───────┤
│ 1 │ Laptop                │ XPS-15 │  2  │ $1200 │ $2400│
│ 2 │ Dock                  │ WD-19  │  2  │  $250 │  $500│
├───┴──────────────────────┴────────┴─────┼────┼───────┤
│                                Subtotal │    │ $2900 │
│                                Shipping │    │   $50 │
│                           Grand Total   │    │ $2950 │
├──────────────────────────────────────────────────────┤
│  Account Code: 100-5500    Program: IT Infrastructure │
│  Notes: Please ship to loading dock                   │
├──────────────────────────────────────────────────────┤
│  Requested By: ___________  Date: ___________         │
│  Supervisor:   ___________  Date: ___________         │
│  Director:     ___________  Date: ___________         │
└──────────────────────────────────────────────────────┘
```

---

## 10. Frontend Architecture

### Pages (`frontend/src/pages/PurchaseOrders/`)

| File | Description |
|---|---|
| `PurchaseOrderList.tsx` | Tabbed list view with All / My Requests / Pending Approval / Issued tabs, full-text search, date filter, pagination |
| `PurchaseOrderDetail.tsx` | Full detail view: info header, line-items table, financial summary, status stepper, context-sensitive action panel |
| `RequisitionWizard.tsx` | 3-step multi-page form for creating a new requisition |

### Router Registration (`App.tsx`)

```
/purchase-orders         → PurchaseOrderList
/purchase-orders/new     → RequisitionWizard
/purchase-orders/:id     → PurchaseOrderDetail
```

### RequisitionWizard — 3 Steps

```
Step 1: Details
  ├─ Title / description (required)
  ├─ Type (general, equipment, software, ...)
  ├─ Vendor (optional, searchable dropdown)
  ├─ Office Location (optional)
  ├─ Program / department
  ├─ Ship To address
  └─ Notes

Step 2: Line Items
  ├─ Add / remove items dynamically
  ├─ Per item: description, model, quantity, unit price
  ├─ Running total displayed live
  └─ Shipping cost input

Step 3: Review
  ├─ Full summary of all entered data
  ├─ Calculated totals
  └─ Submit (calls POST /api/purchase-orders, then navigates to detail)
```

### PurchaseOrderDetail — Action Panel

Buttons are rendered only when the logged-in user has the right permission level **and** the record is in the correct status:

| Action | Condition |
|---|---|
| **Submit** | `status === 'draft'` AND `requestorId === userId` AND `permLevel >= 2` |
| **Approve** | `permLevel >= 3` AND `status === APPROVAL_REQUIRED_STATUS[permLevel]` |
| **Reject** | `permLevel >= 3` AND `status` in rejectable set |
| **Assign Account Code** | `permLevel >= 4` AND `status === 'purchasing_approved'` |
| **Issue PO** | `permLevel >= 5` AND `status === 'dos_approved'` AND `accountCode` is set |
| **Edit** | `status === 'draft'` AND (`requestorId === userId` OR `permLevel >= 2`) |
| **Download PDF** | `permLevel >= 1` (always visible for accessible records) |

### Status Stepper

The detail page displays a horizontal stepper showing progress through all stages, with the current stage highlighted and `denied` shown as an error state.

```
[Draft] → [Submitted] → [Supervisor Approved] → [Purchasing Approved] → [DOS Approved] → [PO Issued]
                                                                                      ↘ [Denied]
```

### React Query Hooks

| Hook | Cache Key | Notes |
|---|---|---|
| `useRequisitionsPermLevel` | `['user', 'permissions', 'REQUISITIONS']` | 10-min staleTime; admins short-circuit to 5 |
| `usePurchaseOrderList(params)` | `['purchaseOrders', 'list', params]` | `keepPreviousData` for smooth pagination |
| `usePurchaseOrder(id)` | `['purchaseOrders', 'detail', id]` | Skips when `id` is falsy |
| `useCreatePurchaseOrder` | — | Invalidates `purchaseOrders.all` on success |
| `useUpdatePurchaseOrder` | — | Invalidates list + detail |
| `useSubmitPurchaseOrder` | — | Invalidates list + detail |
| `useApprovePurchaseOrder` | — | Invalidates list + detail |
| `useRejectPurchaseOrder` | — | Invalidates list + detail |
| `useIssuePurchaseOrder` | — | Invalidates list + detail |

---

## 11. Settings & Auto-Numbering

### Race-Condition-Safe Number Generation

Both `getNextReqNumber()` and `getNextPoNumber()` in `SettingsService` use **raw SQL with an atomic increment**:

```sql
UPDATE system_settings
SET "nextReqNumber" = "nextReqNumber" + 1
WHERE id = 'singleton'
RETURNING "nextReqNumber", "reqNumberPrefix"
```

This prevents two concurrent submissions from receiving the same number. The old value (before the increment) is used as the sequence number for the current request.

### Number Format

```
REQ-00001    (prefix + zero-padded to 5 digits)
PO-00001
```

Prefix and padding width are both configurable via `SystemSettings`.

---

## 12. Validation Rules

All input is validated with **Zod v4** schemas before reaching the service layer.

### `CreatePurchaseOrderSchema`

| Field | Rule |
|---|---|
| `title` | Required string |
| `type` | Optional string (default `"general"`) |
| `vendorId` | Optional UUID |
| `shipTo` | Optional string |
| `shippingCost` | Optional non-negative number |
| `notes` | Optional string |
| `program` | Optional string |
| `officeLocationId` | Optional UUID |
| `items` | Array, min 1, max 100 |
| `items[].description` | Required string |
| `items[].model` | Optional string |
| `items[].quantity` | Required positive integer |
| `items[].unitPrice` | Required non-negative number |

### `RejectSchema`

| Field | Rule |
|---|---|
| `reason` | Required non-empty string |

### `AssignAccountSchema`

| Field | Rule |
|---|---|
| `accountCode` | Required non-empty string |

### `IssuePOSchema`

| Field | Rule |
|---|---|
| `poNumber` | Optional string (if omitted, auto-generated) |

> **Note:** Zod v4 uses `error:` (not `invalid_type_error:`) inside `.number()` refinement parameters.

---

## 13. Audit / Status History

Every workflow state change writes a row to `requisition_status_history`. This provides a complete, tamper-evident audit trail.

### History Timeline (Example: PO-00017)

```
#  changedAt              fromStatus            toStatus               changedBy       notes
1  2026-03-11 09:00:12    draft                 submitted              Jane Smith      —
2  2026-03-11 10:15:44    submitted             supervisor_approved    Bob Manager     "Looks good"
3  2026-03-11 11:30:02    supervisor_approved   purchasing_approved    Sue Purchasing  —
4  2026-03-11 13:05:17    purchasing_approved   dos_approved           Tom DOS         —
5  2026-03-11 14:22:33    dos_approved          po_issued              Tom DOS         —
```

**Endpoint:** `GET /api/purchase-orders/:id/history` (returns newest-first)  
**Access:** Level ≥ 1 (level 1 can only see own records)

---

## 14. Legacy vs V2 Comparison

| Aspect | Legacy (wwwroot PHP) | V2 (Tech-V2) |
|---|---|---|
| **Database** | Separate `requisitions` + `po` tables | Single `purchase_orders` table |
| **Status tracking** | Integer codes (1–5) in a single column | Named string statuses; full `requisition_status_history` table |
| **Permissions** | `$_SESSION['reqLevel']` in PHP session | JWT + DB `user_permissions` records; 5-level explicit model |
| **Authentication** | Session-based (`$_SESSION`) | Microsoft Entra ID (Azure AD) + JWT bearer tokens |
| **Number generation** | No guaranteed uniqueness; DB race conditions possible | Atomic raw-SQL increment under transaction isolation |
| **Notifications** | PHPMailer per-page | Centralized `email.service.ts`; stage-driven; failures don't break workflow |
| **PDF** | `excel.php` / manual export | PDFKit on-demand streaming |
| **Audit trail** | None | Full `requisition_status_history` with actor + timestamp |
| **Supervisor bypass** | Not implemented | Feature-flagged via `SystemSettings.supervisorBypassEnabled` |
| **Frontend** | Server-rendered PHP + Bootstrap 3 | React 18 SPA + MUI + TanStack Query |
| **API contract** | HTML form POST to PHP | RESTful JSON API with Zod-validated request bodies |
| **Multi-school** | Hard-coded school IDs in session | Office location model; single-tenant by design |
| **Vendor data** | Free-text `po_company` field | FK to structured `vendors` table |

---

## Quick Reference — Who Does What

| Role | Actions Available |
|---|---|
| **Any authenticated user (level 1)** | View own requisitions, download own PDFs, view own history |
| **Requestor / Staff (level 2)** | All of level 1 + create, edit, delete drafts, submit |
| **Supervisor (level 3)** | All of level 2 + approve submitted requisitions, reject any active requisition |
| **Purchasing (level 4)** | All of level 3 + approve supervisor-approved, assign account code |
| **DOS / Admin (level 5)** | All of level 4 + DOS-approve, issue PO, view all records |

---

*This document reflects the implementation as of Sprint C-2 (March 2026). Source of truth files:*
- *`backend/prisma/schema.prisma`*
- *`backend/src/services/purchaseOrder.service.ts`*
- *`backend/src/controllers/purchaseOrder.controller.ts`*
- *`backend/src/routes/purchaseOrder.routes.ts`*
- *`backend/src/validators/purchaseOrder.validators.ts`*
- *`frontend/src/pages/PurchaseOrders/`*

# Specification: Finance Director Account Number Entry

**Feature:** Move account code entry from PO Entry (level 4) to Finance Director (level 5)  
**Spec File:** `docs/SubAgent/requisition_account_number_spec.md`  
**Date:** March 25, 2026  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problem Statement](#2-problem-statement)
3. [Proposed Changes Overview](#3-proposed-changes-overview)
4. [Data Model Analysis](#4-data-model-analysis)
5. [Backend Changes](#5-backend-changes)
6. [Frontend Changes](#6-frontend-changes)
7. [Security Considerations](#7-security-considerations)
8. [Step-by-Step Implementation Plan](#8-step-by-step-implementation-plan)
9. [Files to Modify](#9-files-to-modify)

---

## 1. Current State Analysis

### 1.1 Workflow

The requisition/PO workflow uses a **single `purchase_orders` table** that tracks the entire lifecycle:

```
draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued
                                                                             ↘ denied (any stage)
```

### 1.2 Permission Levels (REQUISITIONS module)

| Level | Role | Current Account Code Behavior |
|-------|------|-------------------------------|
| 2 | General User (Requestor) | Creates draft, submits |
| 3 | Supervisor | Approves `submitted → supervisor_approved` |
| 4 | **PO Entry** | **Currently: sets `accountCode`, issues PO number** |
| 5 | **Finance Director** | Approves `supervisor_approved → finance_director_approved` |
| 6 | Director of Schools | Approves `finance_director_approved → dos_approved` |
| ADMIN | System Admin | Effective level 6 everywhere |

### 1.3 Current Account Code Flow

**Step 1 — Finance Director Approval** (current, no account code involvement):
- Endpoint: `POST /api/purchase-orders/:id/approve`
- Required: `permLevel >= 5` + `ENTRA_FINANCE_DIRECTOR_GROUP_ID` membership
- Required status: `supervisor_approved`
- Effect: Updates status → `finance_director_approved`, sets `approvedAt`
- Account code: **not touched**

**Step 2 — Director of Schools Approval** (unchanged):
- Endpoint: `POST /api/purchase-orders/:id/approve`
- Required: `permLevel >= 6` + `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` membership
- Required status: `finance_director_approved`
- Effect: Updates status → `dos_approved`, sets `schoolsDirectorApprovedAt`

**Step 3 — PO Entry assigns account code** (current, being moved):
- Endpoint: `POST /api/purchase-orders/:id/account`
- Required: `permLevel >= 4` (PO Entry)
- Required status: `dos_approved`
- Effect: Saves `accountCode` to the record

**Step 4 — PO Entry issues PO** (unchanged functionality, gate logic updated):
- Endpoint: `POST /api/purchase-orders/:id/issue`
- Required: `permLevel >= 4` (PO Entry)
- Required status: `dos_approved` + `accountCode` must be set
- Effect: Assigns PO number, sets `status = 'po_issued'`, `isApproved = true`

### 1.4 Relevant Source Files

| File | Role |
|------|------|
| `backend/prisma/schema.prisma` | `purchase_orders` model definition |
| `backend/src/validators/purchaseOrder.validators.ts` | Zod schemas: `ApproveSchema`, `AssignAccountSchema` |
| `backend/src/services/purchaseOrder.service.ts` | `approvePurchaseOrder()`, `assignAccountCode()`, `issuePurchaseOrder()` |
| `backend/src/controllers/purchaseOrder.controller.ts` | `approvePurchaseOrder`, `assignAccountCode` handlers |
| `backend/src/routes/purchaseOrder.routes.ts` | Route definitions and permission guards |
| `frontend/src/types/purchaseOrder.types.ts` | `ApprovePOInput`, `AssignAccountCodeInput` interfaces |
| `frontend/src/services/purchaseOrder.service.ts` | `approve()`, `assignAccountCode()` API calls |
| `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` | `useApprovePurchaseOrder`, `useAssignAccountCode` hooks |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Action panel UI, dialogs, `canAssign` logic |

---

## 2. Problem Statement

The current design assigns account code **after** Director of Schools approval (`dos_approved`), by a PO Entry user (level 4). The business requirement is that the **Finance Director** should enter the account number as part of their review, **before** or **during** their approval step.

**Why this matters:**
- The Finance Director is the approver who understands the correct General Ledger account allocation
- The account code should be captured at the FD review stage (status: `supervisor_approved`)
- PO Entry staff should be **viewers** of the account code — they use it to process the purchase, not assign it

---

## 3. Proposed Changes Overview

### Change Summary

| What | Before | After |
|------|--------|-------|
| Who sets `accountCode` | PO Entry (level 4) after `dos_approved` | Finance Director (level 5) during `supervisor_approved → finance_director_approved` |
| How it's set | Separate `/account` endpoint | Embedded in the Finance Director's `approve` payload |
| PO Entry UI | "Assign Account Code" button visible | Button removed; account code shown as read-only |
| `/account` endpoint | Level 4, status `dos_approved` | **Repurposed** to level 5, status `supervisor_approved` (or removed in favor of the approve payload approach) |
| PO issuance gate | `accountCode` required | Unchanged — `accountCode` still required before `po_issued` |

### Chosen Approach: Embed in Finance Director Approve Payload

Rather than requiring two separate actions (set account code + approve), the Finance Director's **Approve Dialog** will include an account code text field. The `accountCode` is submitted alongside the approval `notes`. The backend saves both in the same database transaction.

This is preferred because:
1. Single-step UX for the Finance Director
2. No new endpoint needed
3. Atomic: account code and the approval are committed together
4. Audit trail is preserved (history row records the FD approval event)

The existing `/account` endpoint is **changed** to require level 5 and status `supervisor_approved`, serving as a "pre-approve account entry" option if the FD needs to save the code separately before approving.

---

## 4. Data Model Analysis

### 4.1 Existing Field

The `accountCode` field already exists on the `purchase_orders` table:

```prisma
// backend/prisma/schema.prisma
model purchase_orders {
  ...
  accountCode  String?   // ← ALREADY EXISTS; no migration needed
  ...
}
```

**No Prisma migration is required.** The field is already `String?` (nullable), which supports the case where a Finance Director approves without yet entering the account code (though they must enter it before PO issuance).

### 4.2 No New Fields

The field name `accountCode` is semantically correct for this workflow. The user-facing label in the UI can say "Account Number" if desired, but the underlying DB column name remains `accountCode` to avoid unnecessary renaming.

---

## 5. Backend Changes

### 5.1 Validator: `purchaseOrder.validators.ts`

**File:** `backend/src/validators/purchaseOrder.validators.ts`

Extend `ApproveSchema` to accept an optional `accountCode` field:

```typescript
// BEFORE:
export const ApproveSchema = z.object({
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional().nullable(),
});

// AFTER:
export const ApproveSchema = z.object({
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional().nullable(),
  accountCode: z
    .string()
    .min(1, 'Account code must not be empty if provided')
    .max(100, 'Account code must be 100 characters or less')
    .optional()
    .nullable(),
});
```

Update the inferred DTO type (no code change needed — `z.infer<>` picks it up automatically):

```typescript
export type ApproveDto = z.infer<typeof ApproveSchema>;
// Now includes: { notes?: string | null; accountCode?: string | null }
```

### 5.2 Service: `purchaseOrder.service.ts`

**File:** `backend/src/services/purchaseOrder.service.ts`

**Change 1 — `approvePurchaseOrder`: save `accountCode` during FD approval**

Locate the `stageUpdates` block inside `approvePurchaseOrder`. Add the account code to the update when the transition target is `finance_director_approved`:

```typescript
// BEFORE:
const stageUpdates: Prisma.purchase_ordersUpdateInput = {
  status: transition.to,
  ...(transition.to === 'finance_director_approved' && { approvedAt: now }),
  ...(transition.to === 'dos_approved' && { schoolsDirectorApprovedAt: now }),
};

// AFTER:
const stageUpdates: Prisma.purchase_ordersUpdateInput = {
  status: transition.to,
  ...(transition.to === 'finance_director_approved' && {
    approvedAt: now,
    // Save account code if provided by the Finance Director during their approval
    ...(approveData?.accountCode != null && approveData.accountCode.trim() !== '' && {
      accountCode: approveData.accountCode.trim(),
    }),
  }),
  ...(transition.to === 'dos_approved' && { schoolsDirectorApprovedAt: now }),
};
```

**Change 2 — `assignAccountCode`: change status gate from `dos_approved` to `supervisor_approved`**

This allows the Finance Director to set the account code independently (via the UI) while reviewing a PO before they approve — a useful fallback in case they want to save progress:

```typescript
// BEFORE:
if (po.status !== 'dos_approved') {
  throw new ValidationError(
    `Account code can only be assigned when status is "dos_approved" (Director of Schools approved). Current: "${po.status}"`,
    'status',
  );
}

// AFTER:
const ACCOUNT_CODE_ASSIGNABLE_STATUSES: POStatus[] = ['supervisor_approved', 'finance_director_approved', 'dos_approved'];
if (!ACCOUNT_CODE_ASSIGNABLE_STATUSES.includes(po.status as POStatus)) {
  throw new ValidationError(
    `Account code can only be assigned when the requisition is at or past the "supervisor_approved" stage. Current: "${po.status}"`,
    'status',
  );
}
```

> **Note:** Allowing `finance_director_approved` and `dos_approved` as fallback statuses means an admin can still correct an account code after FD approval if needed.

### 5.3 Routes: `purchaseOrder.routes.ts`

**File:** `backend/src/routes/purchaseOrder.routes.ts`

**Change — `/account` endpoint: raise required permission from level 4 to level 5**

```typescript
// BEFORE:
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  checkPermission('REQUISITIONS', 4),   // ← PO Entry
  purchaseOrderController.assignAccountCode,
);

// AFTER:
router.post(
  '/:id/account',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AssignAccountSchema, 'body'),
  checkPermission('REQUISITIONS', 5),   // ← Finance Director only
  purchaseOrderController.assignAccountCode,
);
```

> **Why keep the endpoint?** It serves as an explicit pre-approve account code entry step for the Finance Director. The approve-with-accountCode approach is the primary UX path; this endpoint is a fallback for edge cases (e.g., a Finance Director reviewing the PO over multiple sessions).

### 5.4 Controller: `purchaseOrder.controller.ts`

**No changes required.** The `approvePurchaseOrder` handler already forwards the full parsed `approveData` object to the service. The service will now read `approveData.accountCode` from it.

The `assignAccountCode` handler is also unchanged — it delegates status validation to the service.

---

## 6. Frontend Changes

### 6.1 Types: `purchaseOrder.types.ts`

**File:** `frontend/src/types/purchaseOrder.types.ts`

Extend `ApprovePOInput` to include the optional account code field:

```typescript
// BEFORE:
export interface ApprovePOInput {
  notes?: string | null;
}

// AFTER:
export interface ApprovePOInput {
  notes?: string | null;
  accountCode?: string | null;   // Finance Director can optionally set this during their approval
}
```

### 6.2 Frontend Service: `purchaseOrder.service.ts`

**File:** `frontend/src/services/purchaseOrder.service.ts`

No code change required — `approve()` already passes the full `data: ApprovePOInput` object as the POST body. When the type is updated in §6.1, the new `accountCode` field is automatically included when non-null.

### 6.3 Mutations Hook: `usePurchaseOrderMutations.ts`

**File:** `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts`

No changes required. `useApprovePurchaseOrder` already accepts `{ id, data?: ApprovePOInput }`.

### 6.4 PurchaseOrderDetail — Finance Director Changes

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

#### 6.4.1 Add `accountCode` State Variable

Add a state variable for the account code field in the Finance Director's Approve Dialog:

```typescript
// Add alongside existing dialog states:
const [fdAccountCode, setFdAccountCode] = useState('');
```

#### 6.4.2 Update `handleApprove` to Include Account Code

The Finance Director's approval action must include the account code in the payload:

```typescript
const handleApprove = () => {
  setActionError(null);

  // Build payload — include accountCode only for Finance Director's approval stage
  const approvePayload: ApprovePOInput = {
    notes: approveNotes || null,
    ...(po.status === 'supervisor_approved' && fdAccountCode.trim()
      ? { accountCode: fdAccountCode.trim() }
      : {}),
  };

  approveMutation.mutate(
    { id: po.id, data: approvePayload },
    {
      onSuccess: () => {
        setApproveDialogOpen(false);
        setFdAccountCode('');
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { message?: string } } };
        setActionError(e?.response?.data?.message ?? 'Failed to approve');
      },
    },
  );
};
```

#### 6.4.3 Finance Director Approve Dialog — Add Account Code Field

Within the existing Approve Dialog (`<Dialog open={approveDialogOpen} ...>`), add an account code `TextField` that is shown **only** when the Finance Director is acting at the `supervisor_approved` stage:

```tsx
{/* Account Code input — shown only to Finance Director at the supervisor_approved stage */}
{po.status === 'supervisor_approved' && canActAtFdStage && (
  <TextField
    label="Account Number"
    value={fdAccountCode}
    onChange={(e) => setFdAccountCode(e.target.value)}
    fullWidth
    sx={{ mt: 2 }}
    inputProps={{ maxLength: 100 }}
    helperText={
      po.accountCode
        ? `Current: ${po.accountCode} — enter a new value to update`
        : 'Enter the GL account number for this requisition (required before PO can be issued)'
    }
    placeholder="e.g. 100-5500"
  />
)}
```

Place this after the Notes field but before the DialogActions.

Also pre-populate `fdAccountCode` with the existing account code when opening the dialog (so the FD can see and edit it):

```typescript
// Modify the "Approve" button's onClick handler:
onClick={() => {
  setFdAccountCode(po.accountCode ?? '');
  setApproveDialogOpen(true);
}}
```

#### 6.4.4 Remove "Assign Account Code" Button for PO Entry

Change the `canAssign` logic so PO Entry users no longer see the "Assign Account Code" button:

```typescript
// BEFORE:
const canAssign = permLevel >= 4 && po.status === 'dos_approved';

// AFTER:
const canAssign = permLevel >= 5 && ACCOUNT_CODE_ASSIGNABLE_STATUSES.includes(po.status as POStatus);
// PO Entry (level 4) can no longer assign account code.
// Finance Director (level 5+) can assign during supervisor_approved / finance_director_approved stages.
```

Where `ACCOUNT_CODE_ASSIGNABLE_STATUSES` is a local constant derived from the business rule:

```typescript
const ACCOUNT_CODE_ASSIGNABLE_STATUSES: POStatus[] = [
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',   // Fallback for admin corrections
];
```

#### 6.4.5 Account Code Read-Only Display for PO Entry

The account code is **already rendered read-only** in the PO header info panel:

```tsx
{po.accountCode && (
  <Box>
    <Typography variant="caption" color="text.secondary">Account Code</Typography>
    <Typography variant="body2" fontFamily="monospace">{po.accountCode}</Typography>
  </Box>
)}
```

This display is visible to all users who can access the PO (level 1+). No changes needed.

#### 6.4.6 Update PO Entry `canIssue` Condition

The `canIssue` condition already correctly blocks issuance when `accountCode` is not set. No change needed:

```typescript
const canIssue = permLevel >= 4 && po.status === 'dos_approved' && !!po.accountCode;
```

PO Entry will still see `canIssue = true` only when all of: level ≥ 4, `dos_approved` status, and `accountCode` is set (by Finance Director).

---

## 7. Security Considerations

### 7.1 Authentication & Authorization

| Concern | Mitigation |
|---------|-----------|
| PO Entry sets account code via direct API call | Route now requires `permLevel >= 5`; any level-4 call to `POST /account` returns 403 |
| Finance Director sends account code in approve payload | Existing group-membership check in `approvePurchaseOrder` already enforces `ENTRA_FINANCE_DIRECTOR_GROUP_ID`; the `accountCode` field is saved only when the transition to `finance_director_approved` is authorized and succeeds |
| Admin bypasses the FD gate | ADMIN role maps to effective level 6 everywhere; they can perform all FD operations. This is expected and documented |
| Account code visible to viewers (level 1) | Intended — it's financial reference data needed on the PO form, not a secret |

### 7.2 Input Validation

| Field | Rule | Layer |
|-------|------|-------|
| `accountCode` in `ApproveDto` | Optional `string`, max 100 chars, stripped of leading/trailing whitespace via `.trim()` in service | Zod (backend) |
| `accountCode` in `AssignAccountDto` | Retained: required `string`, min 1, max 100 chars | Zod (backend, unchanged) |
| `fdAccountCode` in frontend | `inputProps={{ maxLength: 100 }}`, `.trim()` before submission | React/MUI |

### 7.3 Injection Attack Prevention

- Account code is stored as a plain `String?` field via Prisma parameterized queries — no SQL injection risk
- The value is displayed in the frontend using `{po.accountCode}` (React auto-escapes)
- The value is included in the PDF via PDFKit text render, which treats all values as literal text

### 7.4 CSRF Protection

No change — all `POST` routes already require `validateCsrfToken` middleware via `router.use(validateCsrfToken)`.

### 7.5 Audit Trail

The existing `RequisitionStatusHistory` record written during the Finance Director's approval will include the approval `notes` in its `notes` column. The account code assignment itself is auditable via the `updatedAt` field on the `purchase_orders` record and the history row's `changedById` + `changedAt`.

> **Optional enhancement:** Add an explicit history note such as `"Account code set: ${accountCode}"` to the history row created during FD approval. This is not strictly required but improves auditability.

---

## 8. Step-by-Step Implementation Plan

### Phase 1 — Backend

1. **`purchaseOrder.validators.ts`**  
   Add optional `accountCode` field to `ApproveSchema`. No migration needed.

2. **`purchaseOrder.service.ts` — `approvePurchaseOrder`**  
   Extend `stageUpdates` to include `accountCode` when `transition.to === 'finance_director_approved'` and `approveData.accountCode` is provided and non-empty.

3. **`purchaseOrder.service.ts` — `assignAccountCode`**  
   Change the status validation from `po.status !== 'dos_approved'` to allow `supervisor_approved`, `finance_director_approved`, and `dos_approved`.

4. **`purchaseOrder.routes.ts`**  
   Change `checkPermission('REQUISITIONS', 4)` to `checkPermission('REQUISITIONS', 5)` on the `/:id/account` route.

5. **Build and test the backend**  
   Run `npm run build` in the backend directory. Verify no TypeScript errors.

### Phase 2 — Frontend

6. **`purchaseOrder.types.ts`**  
   Add `accountCode?: string | null` to `ApprovePOInput`.

7. **`PurchaseOrderDetail.tsx` — state**  
   Add `const [fdAccountCode, setFdAccountCode] = useState('');`.

8. **`PurchaseOrderDetail.tsx` — `canAssign` logic**  
   Change `canAssign` to require `permLevel >= 5` and `ACCOUNT_CODE_ASSIGNABLE_STATUSES.includes(po.status)`.

9. **`PurchaseOrderDetail.tsx` — Finance Director Approve Dialog**  
   - Add the account code `TextField` conditionally for FD stage
   - Pre-populate `fdAccountCode` from `po.accountCode` when opening the dialog
   - Update `handleApprove` to pass `accountCode` in the payload at the FD stage

10. **Build and test the frontend**  
    Run `npm run dev` in the frontend directory. Verify no TypeScript errors.

### Phase 3 — Validation & Testing

11. **Test Finance Director path**  
    - PO must be at `supervisor_approved`
    - FD approves WITH an account code → verify `finance_director_approved` status and `accountCode` saved
    - FD approves WITHOUT an account code → verify `finance_director_approved` status and `accountCode` remains null
    - Verify PO Entry CANNOT issue the PO when `accountCode` is null (existing gate)

12. **Test PO Entry read-only**  
    - PO Entry (level 4) user opens a PO in `dos_approved` status with an account code set
    - Verify "Assign Account Code" button is NOT shown
    - Verify account code appears in the read-only info panel
    - Verify `POST /api/purchase-orders/:id/account` returns 403 for a level-4 user

13. **Test `/account` endpoint permission**  
    - Finance Director (level 5) calls `POST /account` on a `supervisor_approved` PO → 200 OK
    - PO Entry (level 4) calls `POST /account` → 403 Forbidden

14. **Regression: existing PO issue flow**  
    - Ensure POs with `accountCode` already set (from prior workflow) can still be issued
    - Ensure `issuePurchaseOrder` gate `!po.accountCode` still blocks issuance when account code is missing

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `backend/src/validators/purchaseOrder.validators.ts` | Add `accountCode` optional field to `ApproveSchema` |
| `backend/src/services/purchaseOrder.service.ts` | Update `approvePurchaseOrder` to save `accountCode` at FD stage; update `assignAccountCode` status validation |
| `backend/src/routes/purchaseOrder.routes.ts` | Change `/account` route permission from level 4 → level 5 |
| `frontend/src/types/purchaseOrder.types.ts` | Add `accountCode` to `ApprovePOInput` |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Add FD account code field in Approve Dialog; update `canAssign`; update `handleApprove` |

**No changes needed:**
- `backend/prisma/schema.prisma` — `accountCode` field already exists
- `backend/src/controllers/purchaseOrder.controller.ts` — controller transparently passes `approveData` to service
- `frontend/src/services/purchaseOrder.service.ts` — `approve()` already passes full `data` object
- `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` — hooks are data-pass-through

---

*Specification complete. Proceed to implementation in Phase 2.*

# Disregard Requisition — Feature Specification

**Date:** 2026-03-24  
**Feature:** "Disregard Requisition" button in RequisitionWizard  
**Priority:** Medium  
**Author:** Research SubAgent

---

## 1. Executive Summary

Add a "Disregard Requisition" button to the RequisitionWizard alongside the existing "Save as Draft" button (Step 3 — Review). The button shows a confirmation dialog, then navigates the user back to `/purchase-orders`.

**Critical finding:** The wizard at `/purchase-orders/new` is **creation-only** — no PO ID exists in state until the user explicitly clicks "Save as Draft" or "Submit for Approval". Therefore, in the current implementation, "Disregard" always means *navigate away without saving* (no API call). The existing `DELETE /api/purchase-orders/:id` endpoint is available for future draft-edit flows but is **not called in Phase 1**.

**No new backend endpoint is required.**

---

## 2. Current State Analysis

### 2.1 Component File

| Item | Detail |
|------|--------|
| **File** | `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx` |
| **Route** | `/purchase-orders/new` (registered in `App.tsx` line 146) |
| **Route params** | None — no `id` or `draftId` parameter |
| **Wizard steps** | 0=Details, 1=Line Items, 2=Review |

### 2.2 Save as Draft — Current Implementation

**Handler function** (~lines 292–302):
```typescript
// ── Save as Draft ──
const handleSaveDraft = () => {
  setSubmitError(null);
  createMutation.mutate(buildPayload(), {
    onSuccess: (po) => navigate(`/purchase-orders/${po.id}`),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      setSubmitError(e?.response?.data?.message ?? 'Failed to save draft');
    },
  });
};
```

- Uses `useCreatePurchaseOrder` hook (imported at line 51)
- Hook calls `purchaseOrderService.create(data)` → `POST /api/purchase-orders`
- Creates PO with implicit `status: 'draft'` (set by the backend service)
- On success: navigates to `/purchase-orders/${po.id}` (exits wizard)
- **No draft ID is tracked in component state during the multi-step flow**

**"Save as Draft" button** (~lines 836–843):
```tsx
{activeStep === 2 && (
  <>
    <Button
      variant="outlined"
      onClick={handleSaveDraft}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Save as Draft'}
    </Button>
    <Button
      variant="contained"
      color="primary"
      onClick={handleSaveAndSubmit}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Submit for Approval'}
    </Button>
  </>
)}
```

Location: Navigation Buttons `<Box>` (~lines 808–882), right-side inner `<Box sx={{ display: 'flex', gap: 1 }}>`.

### 2.3 Cancel / Back Buttons — Current Implementation

**Cancel/Back button** (~lines 813–825):
```tsx
<Button
  onClick={activeStep === 0 ? () => navigate('/purchase-orders') : handleBack}
  disabled={isSaving}
  variant="outlined"
>
  {activeStep === 0 ? 'Cancel' : 'Back'}
</Button>
```

- Step 0: navigates directly to `/purchase-orders` (no confirmation)
- Steps 1–2: goes back one step (does NOT exit the wizard)
- No confirmation dialog for any navigation

### 2.4 `isSaving` flag

```typescript
const isSaving = createMutation.isPending || submitMutation.isPending;
```

Disables all buttons during API calls.

### 2.5 Draft Status Value

In the data model, draft status is the string `'draft'`. Defined in:
- `c:\Tech-V2\backend\src\services\purchaseOrder.service.ts` line 49: `const DELETABLE_STATUSES: POStatus[] = ['draft'];`
- `c:\Tech-V2\frontend\src\types\purchaseOrder.types.ts` (PurchaseOrderStatus type)

---

## 3. Backend — Existing DELETE Endpoint

No new endpoint is needed. The existing delete route is fully implemented.

### 3.1 Route Definition

**File:** `c:\Tech-V2\backend\src\routes\purchaseOrder.routes.ts` lines 96–103

```typescript
router.delete(
  '/:id',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  checkPermission('REQUISITIONS', 2),
  purchaseOrderController.deletePurchaseOrder,
);
```

**Full path:** `DELETE /api/purchase-orders/:id`

**Middleware stack (in order):**
1. `authenticate` — validates JWT from HttpOnly cookie, populates `req.user`
2. `validateCsrfToken` — validates CSRF token header (`X-CSRF-Token`)
3. `validateRequest(PurchaseOrderIdParamSchema, 'params')` — validates UUID format of `:id`
4. `checkPermission('REQUISITIONS', 2)` — requires REQUISITIONS permission level ≥ 2

### 3.2 Controller

**File:** `c:\Tech-V2\backend\src\controllers\purchaseOrder.controller.ts` lines 110–120

```typescript
export const deletePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId  = req.user!.id;
    const permLvl = req.user!.permLevel ?? 1;

    await service.deletePurchaseOrder(req.params.id as string, userId, permLvl);
    res.json({ message: 'Purchase order deleted' });
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

Response on success: `200 { message: 'Purchase order deleted' }`

### 3.3 Service

**File:** `c:\Tech-V2\backend\src\services\purchaseOrder.service.ts` lines 510–530

```typescript
async deletePurchaseOrder(id: string, userId: string, permLevel: number) {
  const po = await this.getPurchaseOrderById(id, userId, permLevel);

  if (!DELETABLE_STATUSES.includes(po.status as POStatus)) {
    throw new ValidationError(
      `Purchase order cannot be deleted in status "${po.status}". Only draft POs can be deleted.`,
      'status',
    );
  }

  if (permLevel < 3 && po.requestorId !== userId) {
    throw new AuthorizationError('You can only delete your own purchase orders');
  }

  await this.prisma.purchase_orders.delete({ where: { id } });
  logger.info('Purchase order deleted', { id, deletedBy: userId });
}
```

**Constraints enforced by service:**
- Status must be `'draft'` (`DELETABLE_STATUSES = ['draft']`)
- Level 1–2 users can only delete POs they own (`requestorId === userId`)
- Level 3+ (supervisors, admins) can delete any draft PO

### 3.4 Frontend Service Method (Already Exists)

**File:** `c:\Tech-V2\frontend\src\services\purchaseOrder.service.ts` lines 101–106

```typescript
delete: async (id: string): Promise<{ message: string }> => {
  const res = await api.delete<{ message: string }>(`${BASE}/${id}`);
  return res.data;
},
```

### 3.5 Frontend Mutation Hook (Already Exists)

**File:** `c:\Tech-V2\frontend\src\hooks\mutations\usePurchaseOrderMutations.ts` ~lines 63–75

```typescript
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => purchaseOrderService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });
}
```

---

## 4. Frontend Implementation Plan

### 4.1 Scope

Phase 1 implements a "Disregard Requisition" button in the RequisitionWizard that:
- Is visible on **Step 3 (Review)** only, alongside "Save as Draft"
- Shows a **MUI Dialog** for confirmation before acting
- On confirm: **navigates to `/purchase-orders`** (no API call — wizard is creation-only)
- Uses MUI `color="error"` styling

Phase 2 (future, not in scope here): extend the wizard to support editing existing drafts via a `draftId` URL param. When `draftId` is present, confirm → call `useDeletePurchaseOrder` → navigate.

### 4.2 State Additions

Add one new state variable after the `submitError` state declaration (~line 127):

```typescript
const [disregardDialogOpen, setDisregardDialogOpen] = useState(false);
```

### 4.3 Handler Functions

Add two handler functions after `handleSaveAndSubmit` (~after line 319):

```typescript
// ── Disregard Requisition ──
const handleDisregardClick = () => setDisregardDialogOpen(true);

const handleDisregardConfirm = () => {
  setDisregardDialogOpen(false);
  navigate('/purchase-orders');
};
```

### 4.4 MUI Imports to Add

Add to the existing MUI import block (lines 17–45):

```typescript
Dialog,
DialogTitle,
DialogContent,
DialogContentText,
DialogActions,
```

`WarningAmberIcon` is not required — the `color="error"` Button styling is sufficient.

### 4.5 Confirmation Dialog JSX

Add the `<Dialog>` immediately before the closing `</Box>` of the outer wrapper (~line 882, just before the `return`'s closing `</Box>`):

```tsx
{/* ── Disregard Confirmation Dialog ── */}
<Dialog
  open={disregardDialogOpen}
  onClose={() => setDisregardDialogOpen(false)}
  aria-labelledby="disregard-dialog-title"
>
  <DialogTitle id="disregard-dialog-title">Disregard Requisition?</DialogTitle>
  <DialogContent>
    <DialogContentText>
      Are you sure you want to disregard this requisition? All data will be lost.
    </DialogContentText>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setDisregardDialogOpen(false)}>Cancel</Button>
    <Button color="error" variant="contained" onClick={handleDisregardConfirm} autoFocus>
      Disregard
    </Button>
  </DialogActions>
</Dialog>
```

### 4.6 Button Placement

In the `activeStep === 2` block within the Navigation Buttons section (~lines 836–857), add the "Disregard Requisition" button **before** the "Save as Draft" button:

**Before:**
```tsx
{activeStep === 2 && (
  <>
    <Button
      variant="outlined"
      onClick={handleSaveDraft}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Save as Draft'}
    </Button>
    <Button
      variant="contained"
      color="primary"
      onClick={handleSaveAndSubmit}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Submit for Approval'}
    </Button>
  </>
)}
```

**After:**
```tsx
{activeStep === 2 && (
  <>
    <Button
      variant="outlined"
      color="error"
      onClick={handleDisregardClick}
      disabled={isSaving}
    >
      Disregard Requisition
    </Button>
    <Button
      variant="outlined"
      onClick={handleSaveDraft}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Save as Draft'}
    </Button>
    <Button
      variant="contained"
      color="primary"
      onClick={handleSaveAndSubmit}
      disabled={isSaving}
    >
      {isSaving ? <CircularProgress size={20} /> : 'Submit for Approval'}
    </Button>
  </>
)}
```

### 4.7 Visual Layout Result

Step 3 footer will read:
```
[ Back ]          [ Disregard Requisition ]  [ Save as Draft ]  [ Submit for Approval ]
                    (outlined, error color)   (outlined, default)  (contained, primary)
```

---

## 5. Backend Implementation Plan

**No backend changes are required.**

The existing `DELETE /api/purchase-orders/:id` endpoint (see Section 3) already handles discard/delete of draft POs with full auth, CSRF protection, and ownership checks.

If Phase 2 (editing existing drafts in the wizard) is implemented in the future:
1. The DELETE endpoint requires no modification.
2. The frontend would add `useDeletePurchaseOrder` to the wizard and call it in `handleDisregardConfirm` when a `draftId` is present.

---

## 6. Security Considerations

### 6.1 Frontend

| Risk | Mitigation |
|------|-----------|
| Accidental discard | Confirmation dialog required before any action |
| No saved data at risk | Wizard is creation-only; no PO exists in the DB at Disregard time (Phase 1) |
| State leak | `setDisregardDialogOpen(false)` closes dialog before navigation |

### 6.2 Backend DELETE Endpoint (Phase 2 readiness)

| Control | Implementation |
|---------|---------------|
| Authentication | `authenticate` middleware — validates JWT from HttpOnly cookie |
| CSRF protection | `validateCsrfToken` middleware — required on all state-changing routes |
| Authorization | `checkPermission('REQUISITIONS', 2)` — minimum level 2 required |
| Ownership enforcement | Service: level < 3 users can only delete `requestorId === userId` |
| Status guard | Service: only `status = 'draft'` POs can be deleted; throws `ValidationError` otherwise |
| Input validation | `validateRequest(PurchaseOrderIdParamSchema, 'params')` — validates UUID format |
| SQL injection | Prisma ORM parameterized queries — not vulnerable |
| Audit trail | `logger.info('Purchase order deleted', { id, deletedBy: userId })` |

### 6.3 OWASP Notes

- **Broken Access Control (A01):** Fully mitigated — ownership check in service, permission level in middleware.
- **Injection (A03):** Prisma ORM prevents SQL injection; UUID validation prevents path traversal-style attacks.
- **CSRF (A05 Security Misconfiguration):** `validateCsrfToken` middleware on the delete route.
- **Authentication Failures (A07):** JWT validation via `authenticate`; HttpOnly cookies prevent XSS token theft.

---

## 7. Files to Modify

| File | Change | New Code? |
|------|--------|-----------|
| `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx` | Add state, handlers, dialog, button | No (edit existing) |

**No other files need modification for Phase 1.**

---

## 8. Files Reference Map

| Purpose | File | Lines |
|---------|------|-------|
| Wizard component (full) | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | 1–~897 |
| Route registration | `frontend/src/App.tsx` | 145–155 |
| `handleSaveDraft` | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~292–302 |
| `handleSaveAndSubmit` | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~304–319 |
| Navigation Buttons section | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~808–882 |
| Save as Draft button | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~836–843 |
| Delete mutation hook | `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` | ~63–75 |
| Delete service method | `frontend/src/services/purchaseOrder.service.ts` | ~101–106 |
| DELETE route | `backend/src/routes/purchaseOrder.routes.ts` | 96–103 |
| DELETE controller | `backend/src/controllers/purchaseOrder.controller.ts` | 110–120 |
| DELETE service logic | `backend/src/services/purchaseOrder.service.ts` | 510–530 |
| DELETABLE_STATUSES | `backend/src/services/purchaseOrder.service.ts` | 49 |

---

## 9. Out of Scope

- Editing existing draft POs within the wizard (Phase 2)
- "Disregard" from the PO Detail page (separate feature — the Detail page already has delete/reject options)
- Steps 0 and 1 disregard button (the existing Cancel navigates away silently from step 0; adding a confirmation to that Cancel button is a UX decision deferred to a follow-up)
- Auto-save drafts during wizard steps

---

## 10. Checklist for Implementation SubAgent

- [ ] Add `disregardDialogOpen` state to `RequisitionWizard`
- [ ] Add `Dialog`, `DialogTitle`, `DialogContent`, `DialogContentText`, `DialogActions` to MUI imports
- [ ] Add `handleDisregardClick` and `handleDisregardConfirm` handler functions
- [ ] Add `<Dialog>` JSX for confirmation before closing `</Box>` of outer wrapper
- [ ] Add "Disregard Requisition" `<Button color="error" variant="outlined">` in `activeStep === 2` block, before "Save as Draft"
- [ ] Verify `npm run build` passes with no TypeScript errors
- [ ] Manually test: open wizard → reach step 3 → click Disregard → dialog appears → Cancel keeps wizard open → Confirm navigates to `/purchase-orders`

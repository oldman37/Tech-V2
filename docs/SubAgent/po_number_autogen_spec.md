# PO Number Auto-Generation Specification

**Date:** 2026-05-05  
**Author:** Research SubAgent  
**Status:** Ready for Implementation

---

## 1. Summary of Findings

The backend already has **full auto-generation capability** for PO numbers — the `issuePurchaseOrder` service method prefers an auto-generated number when none is supplied. The only gap is the **frontend**, which currently requires the Finance PO Entry user to manually type a PO number in a dialog. The implementation is a small, targeted frontend change: remove the manual input, send an empty payload, and let the backend assign the next sequence number automatically.

---

## 2. Current State

### 2.1 How the PO Number Is Currently Set

**Trigger:** When a Finance PO Entry user clicks "Issue PO" from the `PurchaseOrderDetail` page.

**Frontend flow (`PurchaseOrderDetail.tsx`):**
1. A dialog opens with a required `<TextField label="PO Number *">`.
2. The `handleIssuePO` function validates `if (!poNumber.trim()) return;` — the button is disabled until the field is non-empty.
3. The mutation is called with `{ id: po.id, data: { poNumber: poNumber.trim() } }`.
4. On success the dialog closes and state resets.

**Result: The user must manually type a PO number.** No sequence from settings is consulted on the frontend. The helper text even shows `"Example: PO-2026-001"`, confirming this is free-text entry.

### 2.2 Current `IssuePOInput` Type (Frontend)

```typescript
// frontend/src/types/purchaseOrder.types.ts  line 242
export interface IssuePOInput {
  poNumber: string;   // required — non-optional
}
```

### 2.3 Current Backend Validator

```typescript
// backend/src/validators/purchaseOrder.validators.ts  line 188
export const IssuePOSchema = z.object({
  poNumber: z
    .string()
    .min(1, 'PO number must not be empty if provided')
    .max(100)
    .optional(),     // ← already optional
});
```

### 2.4 Current Backend Service Logic

```typescript
// backend/src/services/purchaseOrder.service.ts  line 1275
const poNumber = issueData.poNumber
  ? issueData.poNumber                          // user-supplied override
  : await this.settingsService.getNextPoNumber(); // auto-generate
```

**The backend already auto-generates when `issueData.poNumber` is falsy.**

### 2.5 Current Backend `getNextPoNumber()` Implementation

```typescript
// backend/src/services/settings.service.ts  line 104
async getNextPoNumber(): Promise<string> {
  await this.getSettings();   // ensure singleton row exists

  const result = await this.prisma.$queryRaw<
    Array<{ next_po_number: number; po_number_prefix: string }>
  >`
    UPDATE system_settings
    SET    "nextPoNumber" = "nextPoNumber" + 1,
           "updatedAt"   = NOW()
    WHERE  id = 'singleton'
    RETURNING "nextPoNumber" - 1 AS next_po_number,
              "poNumberPrefix"   AS po_number_prefix
  `;

  const { next_po_number, po_number_prefix } = result[0];
  const formatted = `${po_number_prefix}-${String(next_po_number).padStart(5, '0')}`;
  return formatted;   // e.g. "PO-00017"
}
```

Atomicity is guaranteed by the raw `UPDATE … RETURNING` — no race condition possible under concurrent requests.

---

## 3. How Requisition Number Auto-Generation Works (Reference Pattern)

The `reqNumber` is assigned **fully automatically** during `submitPurchaseOrder()`:

1. `getNextReqNumber()` is called (same atomic SQL pattern as `getNextPoNumber()`).
2. Returns a formatted string like `"REQ-00042"`.
3. Written directly to the `purchase_orders.reqNumber` field in the same transaction.
4. **The user has zero input into `reqNumber` — it is 100% system-generated.**

The PO number auto-generation goal is to replicate this exact pattern at the `issuePurchaseOrder` step.

---

## 4. Admin Settings — DB Model & Field

| Item | Value |
|---|---|
| Prisma model | `SystemSettings` |
| DB table | `system_settings` |
| Row ID | `'singleton'` (always one row) |
| Counter field | `nextPoNumber` (Int, default `1`) |
| Prefix field | `poNumberPrefix` (String, default `"PO"`) |
| Managed by | `SettingsService.getSettings()` / `updateSettings()` |
| Admin UI | `AdminSettings.tsx` → "Requisitions" tab |

The admin UI exposes `nextPoNumber` and `poNumberPrefix` as editable fields, giving the admin full control over the sequence starting point and prefix format.

---

## 5. Finance PO Entry Role

| Item | Value |
|---|---|
| Entra Group ID | `bb379769-bd72-4c6c-abb5-4f07fb3e8115` |
| Env var | `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` |
| Frontend flag | `user.permLevels.isPoEntryUser` |
| Required `permLevel` | ≥ 4 |
| Backend guard | `issuePurchaseOrder` controller checks group membership |
| Route minimum | `requireModule('REQUISITIONS', 4)` |

`canIssue` derivation in `PurchaseOrderDetail.tsx`:
```typescript
const canIssue = isPoEntryUser && permLevel >= 4 && po.status === 'dos_approved' && !!po.accountCode;
```

---

## 6. Proposed Implementation Plan

### 6.1 Scope

This is a **small, targeted change** — the backend already supports auto-generation. Only the frontend and its TypeScript types need modification.

No database migration is required.

---

### 6.2 Backend — No Changes Required

The following backend components are already correct and do not need modification:

| File | Status | Reason |
|---|---|---|
| `backend/src/services/purchaseOrder.service.ts` | ✅ Ready | `issuePurchaseOrder` already auto-generates when `issueData.poNumber` is falsy |
| `backend/src/services/settings.service.ts` | ✅ Ready | `getNextPoNumber()` is implemented and tested |
| `backend/src/validators/purchaseOrder.validators.ts` | ✅ Ready | `IssuePOSchema` already marks `poNumber` as `.optional()` |
| `backend/src/controllers/purchaseOrder.controller.ts` | ✅ Ready | Passes `issueData` through to service; group-check already enforced |
| `backend/src/routes/purchaseOrder.routes.ts` | ✅ Ready | Route guard (`requireModule('REQUISITIONS', 4)`) already in place |
| `backend/prisma/schema.prisma` | ✅ Ready | `purchase_orders.poNumber` is nullable (`String? @unique`); `SystemSettings` has `nextPoNumber` + `poNumberPrefix` |

**Optional backend hardening (recommended):** Add a retry loop around `issuePurchaseOrder` for PO number unique constraint collisions (identical to the existing 3-attempt retry on `reqNumber` in `submitPurchaseOrder`). See §6.5.

---

### 6.3 Frontend Changes (Required)

#### File 1: `frontend/src/types/purchaseOrder.types.ts`

**Location:** Line ~242–244

**Change:** Make `poNumber` optional so the frontend can call the issue endpoint with an empty body.

```typescript
// BEFORE
export interface IssuePOInput {
  poNumber: string;
}

// AFTER
export interface IssuePOInput {
  poNumber?: string;   // optional — backend auto-generates when absent
}
```

---

#### File 2: `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

**Multiple changes required:**

**Change A** — Remove `poNumber` state (line ~128):
```typescript
// REMOVE this line:
const [poNumber, setPoNumber] = useState('');
```

**Change B** — Update `handleIssuePO` function (lines ~304–310):
```typescript
// BEFORE
const handleIssuePO = () => {
  if (!poNumber.trim()) return;
  issueMutation.mutate(
    { id: po.id, data: { poNumber: poNumber.trim() } },
    {
      onSuccess: () => { setIssueDialogOpen(false); setPoNumber(''); },
    }
  );
};

// AFTER
const handleIssuePO = () => {
  issueMutation.mutate(
    { id: po.id, data: {} },
    {
      onSuccess: () => { setIssueDialogOpen(false); },
    }
  );
};
```

**Change C** — Replace the Issue PO Dialog content (lines ~865–900):

Replace the dialog that contains a required TextField with a confirmation-style dialog that informs the user a PO number will be auto-assigned:

```tsx
{/* ── Issue PO Dialog ── */}
<Dialog open={issueDialogOpen} onClose={() => setIssueDialogOpen(false)} maxWidth="xs" fullWidth>
  <DialogTitle>Issue Purchase Order</DialogTitle>
  <DialogContent>
    <Typography variant="body2" color="text.secondary">
      This will finalize the purchase order and automatically assign the next
      PO number from the system sequence.
    </Typography>
    <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
      This action cannot be undone.
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setIssueDialogOpen(false)} disabled={issueMutation.isPending}>
      Cancel
    </Button>
    <Button
      variant="contained"
      color="secondary"
      onClick={handleIssuePO}
      disabled={issueMutation.isPending}
    >
      {issueMutation.isPending ? <CircularProgress size={20} /> : 'Issue PO'}
    </Button>
  </DialogActions>
</Dialog>
```

---

### 6.4 Optional: Preview Next PO Number (UX Enhancement — Not Required for MVP)

If you want to show the user the **upcoming PO number** before they confirm, a new read-only GET endpoint can be added to the settings API:

```
GET /api/settings/next-po-number
→ { preview: "PO-00018" }
```

This would read `nextPoNumber` and `poNumberPrefix` from settings **without incrementing** — it is informational only. The actual increment happens at issue time.

This is not required for the core feature but improves UX. It would require:
- **Backend:** New route in `settings.routes.ts` + handler in `settings.controller.ts` (read-only, no increment)
- **Frontend:** `useQuery` to fetch preview and display it in the confirmation dialog

---

### 6.5 Optional Backend Hardening — Retry on PO Number Collision

The `submitPurchaseOrder` method already has a 3-attempt retry loop for `reqNumber` unique constraint collisions (P2002). The `issuePurchaseOrder` method currently does not have equivalent retry logic. Under extremely high concurrency this could fail.

**Recommended addition to `issuePurchaseOrder` in `purchaseOrder.service.ts`:**

```typescript
const MAX_PO_RETRIES = 3;
for (let attempt = 1; attempt <= MAX_PO_RETRIES; attempt++) {
  const poNumber = issueData.poNumber
    ? issueData.poNumber
    : await this.settingsService.getNextPoNumber();

  // existing uniqueness check + transaction...
  try {
    // ... existing update transaction
    return updated;
  } catch (err: unknown) {
    const isPrismaUniqueError =
      err != null && typeof err === 'object' && 'code' in err &&
      (err as { code: string }).code === 'P2002';
    if (isPrismaUniqueError && attempt < MAX_PO_RETRIES) {
      logger.warn('PO number collision, retrying', { poNumber, attempt });
      continue;
    }
    throw err;
  }
}
```

---

## 7. Files That Need to Be Modified

| File | Change Type | Priority |
|---|---|---|
| `frontend/src/types/purchaseOrder.types.ts` | Edit — make `IssuePOInput.poNumber` optional | **Required** |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Edit — remove state, update handler, replace dialog | **Required** |
| `backend/src/services/purchaseOrder.service.ts` | Edit — add retry loop around poNumber assignment | Recommended |

No other files need modification.

---

## 8. Migration

**No database migration needed.**

- `purchase_orders.poNumber` is already `String? @unique` (nullable).
- `SystemSettings.nextPoNumber` and `SystemSettings.poNumberPrefix` already exist.
- `SettingsService.getNextPoNumber()` already exists.
- The backend validator already accepts optional `poNumber`.

---

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| Unauthorized PO issuance | `issuePurchaseOrder` controller checks `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` membership via defense-in-depth group check. Route requires `requireModule('REQUISITIONS', 4)`. |
| PO number collision | Atomic raw SQL `UPDATE … RETURNING` guarantees no two requests claim the same sequence number. Optional retry loop adds additional resilience. |
| Sequence manipulation | Admin settings page is still accessible to admins to reset `nextPoNumber`. This is by design. |
| Removing manual input | **Removes** an attack vector where a PO Entry user could enter an arbitrary or duplicate PO number (e.g., to override a previously issued PO by re-using an old number). The existing uniqueness check (`findFirst({where:{poNumber,NOT:{id}}})`) remains as a safety net when `issueData.poNumber` is explicitly supplied (override path). |
| CSRF | Already mitigated: `router.use(validateCsrfToken)` is applied to all mutating routes. |

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Admin forgets to configure `nextPoNumber` before first use | Low | Medium | `SystemSettings` defaults `nextPoNumber` to `1` on upsert; formatted output will be `"PO-00001"` which is valid |
| PO Entry user expects to enter a custom PO number | Medium | Low | This is the feature we are removing by design; the dialog copy should clearly state the number is system-assigned |
| Two concurrent issue requests claim the same number | Very Low | High | Atomic SQL `UPDATE … RETURNING` prevents this at DB level; retry loop further hardens |
| `poNumber` in `IssuePOInput` type change breaks other callers | None | N/A | `IssuePOInput` is only used in `usePurchaseOrderMutations.ts` → `purchaseOrderService.issue()` → `PurchaseOrderDetail.tsx`. No other callers exist. |
| Food Service PO Entry path | None | N/A | `isFsPoEntry && permLevel >= 4 && po.status === 'dos_approved'` — food service issue follows the same `issuePurchaseOrder` service method, so the auto-generation fix applies to both workflows. |

---

## 11. Test Scenarios

After implementation, verify:

1. **Happy path:** Finance PO Entry user opens a `dos_approved` PO with an account code, clicks "Issue PO", confirms — PO is issued with an auto-generated number matching `{prefix}-{padded sequence}`.
2. **Sequence increments:** Issue a second PO; verify the number is `{prefix}-{N+1}`.
3. **Admin sequence reset:** Admin changes `nextPoNumber` to 500 in settings; next issued PO is `{prefix}-00500`.
4. **No duplicate numbers:** Two simultaneous issue requests against different POs each receive unique numbers.
5. **Food Service workflow:** FS PO Entry user issues a food service PO — auto-generated number is assigned correctly.
6. **Old frontend guard removed:** The "Issue PO" button is no longer disabled based on an empty text field; it is only disabled while `issueMutation.isPending`.

---

## 12. Reference: Key File Locations

| Purpose | File |
|---|---|
| PO Prisma model (`purchase_orders`) | `backend/prisma/schema.prisma` line 325 |
| SystemSettings model | `backend/prisma/schema.prisma` line 772 |
| `getNextPoNumber()` | `backend/src/services/settings.service.ts` line 104 |
| `issuePurchaseOrder()` service | `backend/src/services/purchaseOrder.service.ts` line 1252 |
| `issuePurchaseOrder` controller | `backend/src/controllers/purchaseOrder.controller.ts` line ~298 |
| Issue PO route | `backend/src/routes/purchaseOrder.routes.ts` line 163 |
| `IssuePOSchema` validator | `backend/src/validators/purchaseOrder.validators.ts` line 188 |
| `IssuePOInput` type | `frontend/src/types/purchaseOrder.types.ts` line 242 |
| Issue PO mutation hook | `frontend/src/hooks/mutations/usePurchaseOrderMutations.ts` line ~152 |
| Issue PO dialog + handler | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` lines 127–128, 304–310, 865–900 |
| Admin settings (nextPoNumber UI) | `frontend/src/pages/admin/AdminSettings.tsx` |

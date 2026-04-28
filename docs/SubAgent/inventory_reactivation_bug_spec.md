# Inventory Reactivation Bug — Specification

**Date:** 2026-03-03  
**Status:** Research complete — Ready for implementation  
**Severity:** High — Disposed items cannot be returned to active status via the UI

---

## 1. Executive Summary

When an inventory item is disposed (soft-deleted) and a user subsequently edits it to change its status back to `active`, the item is **never actually reactivated**. It remains invisible in the default list view and continues to be counted as disposed in statistics. The bug is caused by two co-dependent deficiencies: (1) the frontend edit form does not include the `isDisposed` flag in its payload, and (2) the backend service does not auto-clear disposal fields when the `status` field transitions away from `'disposed'`.

---

## 2. System Context

| Layer | Key file(s) |
|---|---|
| Frontend page | `frontend/src/pages/InventoryManagement.tsx` |
| Frontend form | `frontend/src/components/inventory/InventoryFormDialog.tsx` |
| Frontend service | `frontend/src/services/inventory.service.ts` |
| Frontend types | `frontend/src/types/inventory.types.ts` |
| Backend controller | `backend/src/controllers/inventory.controller.ts` |
| Backend service | `backend/src/services/inventory.service.ts` |
| Backend validator | `backend/src/validators/inventory.validators.ts` |
| Database schema | `backend/prisma/schema.prisma` |

---

## 3. Prisma Schema — `equipment` Model

**File:** `backend/prisma/schema.prisma` lines 47–110

The `equipment` model uses **two independent fields** to track disposal state:

```prisma
status      String   @default("active")   // string enum: active|available|maintenance|storage|disposed|lost|damaged|reserved
isDisposed  Boolean  @default(false)       // explicit disposal boolean
disposedDate DateTime?                     // date of disposal
disposedReason String?                     // reason text
disposalDate DateTime?                     // legacy duplicate date field
```

**Both `status` AND `isDisposed` must be kept in sync.** The default list query filters by `isDisposed = false`, not by `status`, so an item with `status = 'active'` but `isDisposed = true` is treated as disposed by the application.

---

## 4. Disposal Flow (Working Correctly)

**File:** `frontend/src/pages/InventoryManagement.tsx` lines 94–103

```tsx
const handleDelete = async (item: InventoryItem) => {
  if (!window.confirm(`Mark "${item.name}" (${item.assetTag}) as disposed?`)) {
    return;
  }
  try {
    await inventoryService.deleteItem(item.id);   // DELETE /api/inventory/:id
    fetchInventory();
    fetchStats();
  } catch (err: any) { ... }
};
```

**File:** `backend/src/services/inventory.service.ts` lines 595–615

```typescript
// Soft delete — sets BOTH flags correctly
await this.prisma.equipment.update({
  where: { id },
  data: {
    isDisposed: true,
    disposedDate: new Date(),
    status: 'disposed',
  },
});
await this.createAuditLog({ equipmentId: id, changeType: 'DISPOSE', ... });
```

Disposal correctly sets `isDisposed = true`, `status = 'disposed'`, and logs a `DISPOSE` audit entry. ✅

---

## 5. Reactivation Flow (Broken)

There is **no dedicated "Reactivate" button or handler** for inventory items. The only mechanism to restore a disposed item is via the generic Edit Form.

### 5.1 Frontend — Form State Type Mismatch

**File:** `frontend/src/components/inventory/InventoryFormDialog.tsx` lines 95–115

```tsx
const [formData, setFormData] = useState<CreateInventoryRequest>({
  assetTag: '',
  name: '',
  status: 'active',
  condition: 'good',
  // ... other fields
  // ❌ isDisposed is NOT in CreateInventoryRequest — never part of form state
});
```

**File:** `frontend/src/types/inventory.types.ts` lines 145–200

```typescript
export interface CreateInventoryRequest {
  assetTag: string;
  name: string;
  status?: EquipmentStatus;
  // ... other fields
  // ❌ No isDisposed, disposedDate, disposedReason fields
}

export interface UpdateInventoryRequest extends Partial<CreateInventoryRequest> {
  isDisposed?: boolean;        // ✅ exists on UpdateInventoryRequest
  disposedDate?: string | null;
  disposedReason?: string | null;
  disposalDate?: string | null;
}
```

`InventoryFormDialog` uses `CreateInventoryRequest` for its `formData` state — which **does not include `isDisposed`**. Even though `UpdateInventoryRequest` (the correct type for edits) supports `isDisposed`, the form never tracks or sets it.

### 5.2 Frontend — `buildPayload` Does Not Inject `isDisposed: false`

**File:** `frontend/src/components/inventory/InventoryFormDialog.tsx` lines 313–365 (`buildPayload` function)

```typescript
const buildPayload = (data: CreateInventoryRequest) => {
  const cleaned: any = { ...data };
  // cleans up empty strings, converts dates ...
  // ❌ Never adds isDisposed: false when status !== 'disposed'
  return cleaned;
};
```

### 5.3 Frontend — Submit Sends Payload Without `isDisposed`

**File:** `frontend/src/components/inventory/InventoryFormDialog.tsx` lines 367–395 (`handleSubmit`)

```typescript
const handleSubmit = async () => {
  const payload = buildPayload(formData);
  // payload = { assetTag, name, status: 'active', ... }
  // ❌ payload.isDisposed is undefined — never sent
  if (item) {
    await inventoryService.updateItem(item.id, payload as UpdateInventoryRequest);
  }
  onSuccess();
};
```

The payload contains `status: 'active'` but **no `isDisposed` field**.

### 5.4 Backend — `update()` Does Not Auto-Clear Disposal Flags

**File:** `backend/src/services/inventory.service.ts` lines 490–560

```typescript
const updateData: Prisma.equipmentUpdateInput = {
  status: data.status,              // ✅ Sets status: 'active'
  isDisposed: data.isDisposed,      // data.isDisposed === undefined → Prisma ignores this field
  disposedDate: data.disposedDate   // data.disposedDate === undefined → Prisma ignores this field
    ? new Date(data.disposedDate)
    : undefined,
  disposedReason: data.disposedReason,  // undefined → ignored
  disposalDate: data.disposalDate       // undefined → ignored
    ? new Date(data.disposalDate)
    : undefined,
  // ...
};

await this.prisma.equipment.update({ where: { id }, data: updateData });
```

**Prisma's behavior**: when a field in `updateData` is `undefined`, Prisma **skips that column entirely** — the existing database value is preserved. Since `data.isDisposed` is `undefined` (frontend never sent it), `isDisposed` stays `true` in the database.

### 5.5 Result After "Reactivation" Attempt

After the `PUT /api/inventory/:id` call completes with `{ status: 'active' }`:

| Field | Expected | Actual |
|---|---|---|
| `status` | `'active'` | `'active'` ✅ |
| `isDisposed` | `false` | `true` ❌ |
| `disposedDate` | `null` | *original disposal date* ❌ |
| `disposedReason` | `null` | *original reason* ❌ |

### 5.6 UI Re-fetch Hides the Item

**File:** `frontend/src/pages/InventoryManagement.tsx` lines 37–43

```tsx
const [filters, setFilters] = useState<InventoryFilters>({
  search: '',
  status: undefined,
  isDisposed: false,       // ← default filter: show only non-disposed items
});
```

After `handleFormSuccess()` calls `fetchInventory()`, the request hits `GET /api/inventory?isDisposed=false`. The backend's `findAll()` adds `where.isDisposed = false` to the query. The item still has `isDisposed: true` in the database, so it is **excluded from results** — it appears to vanish from the list.

### 5.7 Statistics Also Incorrect

**File:** `backend/src/services/inventory.service.ts` lines 660–670

```typescript
// activeItems query
this.prisma.equipment.count({
  where: { status: 'active', isDisposed: false },   // dual condition
})
```

An item with `status: 'active'` but `isDisposed: true` is **not counted as active** in the statistics dashboard. The "Disposed" counter also continues to include it.

---

## 6. Root Cause Summary

Two independent deficiencies combine to produce the bug:

| # | Location | Issue |
|---|---|---|
| **RC-1** | `InventoryFormDialog.tsx` | Form state typed as `CreateInventoryRequest` — no `isDisposed` field; `buildPayload` never injects `isDisposed: false` when changing status away from `'disposed'` |
| **RC-2** | `inventory.service.ts` → `update()` | No guard that auto-clears `isDisposed`, `disposedDate`, `disposedReason`, `disposalDate` when `status` transitions to a non-disposed value |
| **RC-3** | `InventoryManagement.tsx` | No dedicated "Reactivate" action button — users depend entirely on the broken edit form |

Either RC-1 or RC-2 alone is sufficient to cause the bug. Both should be fixed for defence-in-depth.

---

## 7. Proposed Fix

### Fix 1 — Backend service auto-clear (primary defence)

**File:** `backend/src/services/inventory.service.ts`  
**Location:** Inside `update()`, after building `updateData` (around line 535), before the `prisma.equipment.update` call.

```typescript
// Auto-clear disposal flags when reactivating (status changing away from disposed)
const isReactivating =
  data.status !== undefined &&
  data.status !== 'disposed' &&
  existing.isDisposed === true;

if (isReactivating) {
  updateData.isDisposed = false;
  updateData.disposedDate = null;
  updateData.disposedReason = null;
  updateData.disposalDate = null;
}
```

After the `prisma.equipment.update` call, add a `REACTIVATE` audit log entry:

```typescript
if (isReactivating) {
  await this.createAuditLog({
    equipmentId: id,
    changeType: 'REACTIVATE',
    user,
    notes: `Item reactivated — status changed to '${data.status}'`,
  });
}
```

### Fix 2 — Frontend form injects `isDisposed: false` in payload (secondary defence)

**File:** `frontend/src/components/inventory/InventoryFormDialog.tsx`  
**Location:** `buildPayload` function

```typescript
const buildPayload = (data: CreateInventoryRequest): UpdateInventoryRequest => {
  const cleaned: any = { ...data };

  // ... existing empty-string and date conversions ...

  // When editing a disposed item and status changes to non-disposed, clear disposal flags
  if (cleaned.status && cleaned.status !== 'disposed') {
    cleaned.isDisposed = false;
    cleaned.disposedDate = null;
    cleaned.disposedReason = null;
    cleaned.disposalDate = null;
  }

  return cleaned;
};
```

### Fix 3 — Add a dedicated "Reactivate" action in the inventory table

**File:** `frontend/src/pages/InventoryManagement.tsx`  
Add a `handleReactivate` handler (analogous to the one on line 196 of `ReferenceDataManagement.tsx`) that sets both `status` and `isDisposed` explicitly:

```typescript
const handleReactivate = async (item: InventoryItem) => {
  if (!window.confirm(`Mark "${item.name}" (${item.assetTag}) as active?`)) return;
  try {
    await inventoryService.updateItem(item.id, {
      isDisposed: false,
      status: 'active',
      disposedDate: null,
      disposedReason: null,
      disposalDate: null,
    });
    fetchInventory();
    fetchStats();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to reactivate item');
  }
};
```

In the table row actions cell, when `item.isDisposed` is true, render a **Reactivate** button alongside the Edit/Delete buttons.

---

## 8. Files That Need Changes

| File | Change | Priority |
|---|---|---|
| `backend/src/services/inventory.service.ts` | Add auto-clear disposal flags in `update()` + emit `REACTIVATE` audit log | **P1 — must fix** |
| `frontend/src/components/inventory/InventoryFormDialog.tsx` | `buildPayload` injects `isDisposed: false` when `status !== 'disposed'` | **P1 — must fix** |
| `frontend/src/pages/InventoryManagement.tsx` | Add `handleReactivate` function + Reactivate button in disposed-item rows | **P2 — strongly recommended** |

Optional / nice-to-have:

| File | Change |
|---|---|
| `backend/src/services/inventory.service.ts` | Mirror the logic in `delete()` (soft-delete) too: when `data.isDisposed === false` is explicitly sent, auto-set `status` to `'available'` if current status is `'disposed'` |
| `frontend/src/types/inventory.types.ts` | Add comment to `UpdateInventoryRequest` explaining that `isDisposed: false` + `status` must be sent together for reactivation |

---

## 9. Security Considerations

- **No new endpoints required.** All fixes use the existing `PUT /api/inventory/:id` route, which already enforces `authenticate` middleware and `checkPermission('TECHNOLOGY', 2)` (edit-level access). Reactivation requires the same permissions as editing.
- **No sensitive data exposure.** The `isDisposed`, `disposedDate`, and `disposedReason` fields are already exposed through the existing GET and PUT endpoints. Clearing them on reactivation does not introduce new attack surface.
- **Audit trail preserved.** The proposed backend fix emits a `REACTIVATE` audit log entry, maintaining a full history of the item's lifecycle.
- **Validate `status` values.** The existing `UpdateInventorySchema` in `inventory.validators.ts` (line 168) already validates `status` against the `EquipmentStatus` enum — no schema changes needed.
- **No privilege escalation.** The auto-clear logic in Fix 1 only triggers when the incoming `data.status` is non-null and the item is currently disposed. An unauthenticated/unauthorised user cannot reach the service layer.

---

## 10. Test Scenarios

| # | Scenario | Expected result after fix |
|---|---|---|
| T1 | Dispose item → Edit form → Change status to `active` → Save | Item appears in default list (isDisposed=false, status=active) |
| T2 | Dispose item → Click Reactivate button → Confirm | Item appears in default list; audit log shows REACTIVATE entry |
| T3 | Dispose item → Edit form → Leave status as `disposed` → Save | isDisposed remains true; disposal dates unchanged |
| T4 | Create new item with status `disposed` | isDisposed should default to `false` (no disposal without explicit dispose action) |
| T5 | Stats dashboard after T1 or T2 | activeItems increments, disposedItems decrements |
| T6 | Reactivate without TECHNOLOGY level 2 permission | Returns 403 Forbidden |

---

## 11. Spec File Path

```
c:\Tech-V2\docs\SubAgent\inventory_reactivation_bug_spec.md
```

# Inventory Edit Bug Fix Specification

**Date:** 2026-03-03  
**Reporter:** User (UI)  
**Symptom:** Clicking the "Update" button in the Inventory edit dialog does nothing  
**Status:** Research complete — root cause identified

---

## 1. Executive Summary

When a user opens an existing inventory item for editing (via the pencil icon on [frontend/src/pages/InventoryManagement.tsx](../../frontend/src/pages/InventoryManagement.tsx)) and clicks the **Update** button, the dialog stays open and nothing happens. No loading spinner, no error toast, no dialog close.

**Root cause:** Prisma serializes the `purchasePrice` field (a `Decimal` DB type) as a **JSON string** (e.g., `"1500.00"`) in API responses. The frontend initializes `formData.purchasePrice` with this string. The frontend Zod validation schema uses `z.number()`, which rejects strings. Validation silently fails — the only evidence is a small helper-text error under the Price field, which may be below the scroll fold of the dialog. Because `validate()` returns `false` before `setLoading(true)` is ever called, the button appears dead.

---

## 2. Files Involved

| File | Role |
|------|------|
| [frontend/src/pages/InventoryManagement.tsx](../../frontend/src/pages/InventoryManagement.tsx) | Page: triggers edit dialog; `handleFormSuccess` refreshes list |
| [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx) | **Bug location** — form state, validation schema, submit handler |
| [frontend/src/services/inventory.service.ts](../../frontend/src/services/inventory.service.ts) | API service: `updateItem()` calls `PUT /inventory/:id` |
| [frontend/src/services/api.ts](../../frontend/src/services/api.ts) | Axios instance: CSRF token injection |
| [frontend/src/types/inventory.types.ts](../../frontend/src/types/inventory.types.ts) | `InventoryItem` type — `purchasePrice` typed as `number | null` (incorrect at runtime) |
| [backend/src/routes/inventory.routes.ts](../../backend/src/routes/inventory.routes.ts) | Route: `PUT /inventory/:id` → validates → controller |
| [backend/src/controllers/inventory.controller.ts](../../backend/src/controllers/inventory.controller.ts) | Controller: `updateInventoryItem()` |
| [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) | Service: `update()`, `logChanges()`, `mapEquipmentItem()` |
| [backend/src/validators/inventory.validators.ts](../../backend/src/validators/inventory.validators.ts) | `UpdateInventorySchema` — backend Zod validation |
| [backend/src/middleware/validation.ts](../../backend/src/middleware/validation.ts) | `validateRequest()` middleware |
| [backend/src/middleware/csrf.ts](../../backend/src/middleware/csrf.ts) | CSRF token generation and validation |

---

## 3. Data Flow Analysis (Frontend → Database)

```
User clicks "Update"
  │
  ▼
InventoryFormDialog.handleSubmit()           [InventoryFormDialog.tsx ~L300]
  ├── calls validate()
  │     └── inventorySchema.parse(formData)  ← FAILS HERE
  │           purchasePrice: z.number()      ← receives string "1500.00"
  │           ZodError thrown
  │           validationErrors.purchasePrice set
  │           returns false
  │
  └── if (!validate()) return;               ← exits here — nothing more executes
        (no setLoading, no API call)

  ───── IF VALIDATION PASSED (after fix) ─────
  ▼
buildPayload(formData)
  ├── converts empty strings → null for optional string fields
  └── converts YYYY-MM-DD purchaseDate → ISO datetime string

  ▼
inventoryService.updateItem(item.id, payload)  [inventory.service.ts ~L75]
  └── api.put(`/inventory/${id}`, data)

  ▼ Axios request interceptor [api.ts]
  └── attaches x-xsrf-token header from in-memory cache (set from prior GET responses)

  ▼ Backend middleware chain [inventory.routes.ts]
  ├── authenticate()          — JWT via cookie
  ├── validateCsrfToken()     — compares XSRF-TOKEN cookie to x-xsrf-token header
  ├── validateRequest(InventoryIdParamSchema, 'params')  — UUID check
  └── validateRequest(UpdateInventorySchema, 'body')     — Zod body validation

  ▼ inventoryController.updateInventoryItem()  [inventory.controller.ts ~L175]
  └── inventoryService.update(id, body, user)

  ▼ inventoryService.update()   [inventory.service.ts ~L450]
  ├── findUnique(id) — verify exists
  ├── duplicate assetTag check (if assetTag changed)
  ├── build Prisma updateData with connect/disconnect for FK relations
  ├── prisma.equipment.update({where: {id}, data: updateData})
  └── logChanges(oldItem, newItem, user)   ← AUDIT BUG (see §5.2)

  ▼ Response: updated equipment object
  ▼ onSuccess() → fetchInventory() refresh + setFormDialogOpen(false)
```

---

## 4. Root Cause Analysis

### Bug 1 (PRIMARY — "Update button does nothing")

**Location:** [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx)

**Problem:** Prisma's `Decimal` type serializes to a JSON **string** (e.g., `"1500.00"`) in API responses. `purchasePrice` is received as a string at runtime even though the TypeScript type declaration says `number | null`.

When editing an existing item the effect at line ~180 populates the form:

```tsx
// InventoryFormDialog.tsx ~L155
purchasePrice: item.purchasePrice || null,  // ← "1500.00" (string) stored here
```

The frontend Zod validation schema defines:

```tsx
// InventoryFormDialog.tsx ~L62
purchasePrice: z.number().min(0).optional().nullable(),
```

`z.number()` is strict — it rejects strings. When `validate()` runs `inventorySchema.parse(formData)`, a `ZodError` is thrown for the `purchasePrice` field. The catch block sets:

```tsx
validationErrors.purchasePrice = "Expected number, received string"   // (Zod message)
```

This appears as small helper text beneath the **Price** field in the dialog. If the user hasn't scrolled down to see it, the dialog appears frozen — no loading spinner (because `setLoading(true)` is called **after** validation, and is never reached), no close, no error toast.

**Evidence in code:**
- Prisma `equipment` model: `purchasePrice Decimal? @db.Decimal(10, 2)` — serializes as string
- `mapEquipmentItem()` in [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) does not convert Decimal to number
- `InventoryManagement.tsx` already casts: `parseFloat(item.purchasePrice as any)` (the `as any` cast is a red flag that the type is wrong at runtime)

---

## 5. Secondary Bugs Found

### Bug 2 — `handleChange` coerces ALL falsy values to `null`

**Location:** [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx) ~L275

```tsx
const handleChange = (field, value) => {
  setFormData((prev) => ({
    ...prev,
    [field]: value || null,   // ← BUG: 0 becomes null, false becomes null
  }));
};
```

**Impact:**
- `purchasePrice = 0` → stored as `null` (user cannot set a $0 price)
- Any `boolean` field passed as `false` → stored as `null`
- Compounds Bug 1: even if a user types a valid number, `parseFloat('0') || null = null`

**Fix:** Change to explicit `value ?? null` (nullish coalescing), and handle numeric parsing separately.

---

### Bug 3 — Audit trail does not log FK / relation changes

**Location:** [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) ~L875 (`logChanges` method)

```typescript
const fields: Array<keyof equipment> = [
  'assetTag', 'serialNumber', 'name', 'description', 'status', 'condition',
  'purchaseDate', 'purchasePrice', 'fundingSource', 'poNumber',
  'isDisposed', 'disposedDate', 'disposedReason', 'notes',
  // ← MISSING: roomId, officeLocationId, locationId, brandId, modelId,
  //            categoryId, vendorId, assignedToUserId, fundingSourceId
];
```

**Impact:** Changing a room, office location, brand, assigned user, model, category, vendor, or funding source reference leaves **zero audit trail**. The history dialog shows nothing for these changes.

---

### Bug 4 — Backend `mapEquipmentItem` does not coerce Decimal to Number

**Location:** [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) ~L36

```typescript
function mapEquipmentItem(item: any): any {
  const { brands, categories, models: model, ...rest } = item;
  return {
    ...rest,                  // ← purchasePrice (Decimal) spread as-is → string in JSON
    brand: brands ?? null,
    category: categories ?? null,
    model: model ?? null,
  };
}
```

Prisma's `Decimal` serializes as a string. This is where the runtime/type mismatch originates.

---

### Bug 5 — Frontend `InventoryItem` type incorrectly typed

**Location:** [frontend/src/types/inventory.types.ts](../../frontend/src/types/inventory.types.ts) ~L37

```typescript
purchasePrice?: number | null;   // ← typed as number, but runtime value is string
```

This masks the bug in TypeScript; no compiler error is emitted on `item.purchasePrice || null` even though `item.purchasePrice = "1500.00"`.

---

### Bug 6 — CSRF cookie is `httpOnly: true` (design note, not a breakage)

**Location:** [backend/src/middleware/csrf.ts](../../backend/src/middleware/csrf.ts) ~L50

The CSRF token cookie is set `httpOnly: true`, so JavaScript cannot read it. However, the double-submit pattern is correctly implemented: the token is **also** sent in every response header (`X-CSRF-Token`), and CORS is configured to expose that header. The frontend caches it in module-level memory and injects it on `PUT`/`POST`/`DELETE` requests. This works correctly as long as at least one GET response has been received. No fix needed, but worth documenting.

---

## 6. Proposed Fixes

### Fix 1 — Coerce `purchasePrice` to number on form initialization (PRIMARY FIX)

**File:** [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx)

In the `useEffect` that populates form data from `item`, coerce `purchasePrice`:

```tsx
// BEFORE (~L155)
purchasePrice: item.purchasePrice || null,

// AFTER
purchasePrice: item.purchasePrice != null ? Number(item.purchasePrice) : null,
```

`Number("1500.00")` = `1500`. `Number(null)` = `0`, so the null guard prevents 0 being stored. This fixes the ZodError.

Also update the TextField's `onChange` to coerce properly:

```tsx
// BEFORE (~L490)
onChange={(e) => handleChange('purchasePrice', parseFloat(e.target.value) || null)}

// AFTER
onChange={(e) => {
  const raw = e.target.value;
  handleChange('purchasePrice', raw === '' ? null : Number(raw));
}}
```

---

### Fix 2 — Replace `value || null` with `value ?? null` in `handleChange`

**File:** [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx) ~L275

```tsx
// BEFORE
[field]: value || null,

// AFTER
[field]: value ?? null,
```

`??` only replaces `null` and `undefined`, not falsy values like `0`, `false`, or `''`. This allows `purchasePrice = 0` and other valid falsy values.

> **Note:** For string fields where you want `'' → null` behavior, handle that explicitly in `buildPayload` (which already does this for `serialNumber`, `poNumber`, `fundingSource`, `notes`).

---

### Fix 3 — Add FK fields to `logChanges` in backend service

**File:** [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) ~L875

Add the missing FK fields to the `fields` array:

```typescript
// AFTER existing scalar fields, add:
const fkFields: Array<keyof equipment> = [
  'roomId',
  'officeLocationId',
  'locationId',
  'brandId',
  'modelId',
  'categoryId',
  'vendorId',
  'assignedToUserId',
  'fundingSourceId',
];

for (const field of [...fields, ...fkFields]) {
  // existing comparison logic
}
```

This ensures room changes (and all other relation changes) are recorded in `inventory_changes`.

---

### Fix 4 — Coerce Decimal to Number in `mapEquipmentItem`

**File:** [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) ~L36

```typescript
// AFTER
function mapEquipmentItem(item: any): any {
  const { brands, categories, models: model, ...rest } = item;
  return {
    ...rest,
    // Coerce Prisma Decimal to JS number so the frontend receives a number
    purchasePrice: rest.purchasePrice != null ? Number(rest.purchasePrice) : null,
    brand: brands ?? null,
    category: categories ?? null,
    model: model ?? null,
  };
}
```

This is the backend-side fix that eliminates the type mismatch at the source.

---

### Fix 5 — Correct `InventoryItem.purchasePrice` type

**File:** [frontend/src/types/inventory.types.ts](../../frontend/src/types/inventory.types.ts)

```typescript
// BEFORE
purchasePrice?: number | null;

// AFTER (reflects runtime reality until Fix 4 is deployed; or keep as number after Fix 4)
purchasePrice?: number | string | null;
```

After Fix 4 is deployed (backend coerces to number), revert to `number | null`.

---

## 7. Implementation Steps

Execute in this order:

1. **Backend Fix (Fix 4):** Update `mapEquipmentItem` in [backend/src/services/inventory.service.ts](../../backend/src/services/inventory.service.ts) to coerce `purchasePrice` to `Number`. This eliminates the string/number mismatch at the API boundary.

2. **Backend Fix (Fix 3):** Add FK fields (`roomId`, `officeLocationId`, etc.) to the `logChanges` `fields` array so room changes are audited.

3. **Frontend Fix (Fix 1):** In [frontend/src/components/inventory/InventoryFormDialog.tsx](../../frontend/src/components/inventory/InventoryFormDialog.tsx), coerce `item.purchasePrice` to `Number()` when populating the form. Also fix the `onChange` handler for the price field.

4. **Frontend Fix (Fix 2):** Replace `value || null` with `value ?? null` in `handleChange`.

5. **Frontend Fix (Fix 5):** Update `InventoryItem.purchasePrice` type in [frontend/src/types/inventory.types.ts](../../frontend/src/types/inventory.types.ts).

6. **Test:** Open inventory, edit an item with a `purchasePrice`, change the room, click Update. Verify:
   - Dialog shows loading spinner, then closes
   - Item list refreshes with new room
   - History dialog for the item shows a ROOM_CHANGE entry
   - Price is preserved correctly

---

## 8. Summary Table

| # | Severity | Type | Symptom | File | Fix |
|---|----------|------|---------|------|-----|
| 1 | **CRITICAL** | Runtime type mismatch | Update button does nothing | `InventoryFormDialog.tsx` + `inventory.service.ts` | Coerce Decimal→Number (backend) + coerce in form init (frontend) |
| 2 | High | Logic bug | `purchasePrice=0` silently cleared | `InventoryFormDialog.tsx` | `value ?? null` |
| 3 | High | Missing feature | FK changes not in audit log | `inventory.service.ts` `logChanges` | Add FK fields |
| 4 | Medium | Type mismatch | Incorrect TypeScript type | `inventory.types.ts` | `number \| string \| null` |
| 5 | Low | Design note | CSRF httpOnly pattern | `csrf.ts` | No change needed (works correctly) |

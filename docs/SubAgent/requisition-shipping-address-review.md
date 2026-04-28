# Code Review: "Ship To" Address Choice Feature
**Date:** 2026-03-24  
**Reviewer:** GitHub Copilot  
**Scope:** Sprint C-2 `shipToType` feature across backend, shared types, and frontend

---

## Overall Assessment: ✅ PASS (with minor issues)

The implementation is functionally correct and production-ready. The core feature works as specified: the radio group shows/hides based on entity selection, both address resolution paths (`entity` and `my_office`) work correctly, `shipToType` is persisted and validated end-to-end, and backward compatibility is maintained. Four minor issues were found — none blocking.

---

## File-by-File Review

### 1. `backend/prisma/schema.prisma` — ✅ PASS

**Lines reviewed:** 340–400

```prisma
shipTo            String?
shipToType        String?    // 'entity' | 'my_office' | 'custom'
```

- Field is optional/nullable (`String?`) — existing POs without it remain valid ✓
- `shipTo` was already present from Sprint C-2; `shipToType` is the new addition ✓
- Migration `20260324190341_add_ship_to_type_to_purchase_orders/migration.sql` adds `ALTER TABLE "purchase_orders" ADD COLUMN "shipToType" TEXT` — correct, non-destructive ✓
- DB-level check constraint for valid values is absent, but this is acceptable given Zod validation at the API boundary ✓
- Indexes already present on relevant fields; no new index needed for `shipToType` (low-cardinality column) ✓

**Issues:** None

---

### 2. `backend/src/validators/purchaseOrder.validators.ts` — ✅ PASS

**Lines reviewed:** 107–120

```typescript
shipToType: z.enum(['entity', 'my_office', 'custom']).optional().nullable(),
```

- Valid values enforced via `z.enum` — prevents arbitrary strings from reaching the database ✓
- `optional().nullable()` allows the field to be omitted or sent as `null` — backward compatible ✓
- Applied to `CreatePurchaseOrderSchema`; `UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial()` inherits it automatically ✓
- No `any` types; DTO types inferred via `z.infer<>` ✓

**Issues:** None

---

### 3. `backend/src/services/purchaseOrder.service.ts` — ✅ PASS

**Lines reviewed:** 202–203 (create), 480–481 (update)

```typescript
// Create
shipToType: data.shipToType ?? null,

// Update (conditional partial-update pattern)
...(data.shipToType !== undefined && { shipToType: data.shipToType }),
```

- Create path correctly stores `null` when not provided ✓
- Update path uses the same `undefined`-check partial pattern as all other optional fields — consistent ✓
- No cross-field validation between `shipToType` and `officeLocationId` (e.g., `'entity'` type without an entity selected). This is acceptable — frontend guards the combination; backend is intentionally lenient for API flexibility ✓

**Issues:** None

---

### 4. `shared/src/types.ts` — ✅ PASS

**Lines reviewed:** 17–19

```typescript
export type ShipToType = 'entity' | 'my_office' | 'custom';
```

- Correctly defined as a union type ✓
- Exported from the shared package ✓

**Issues:** None in this file, but see **Minor Issue #1** below regarding consumption.

---

### 5. `frontend/src/types/purchaseOrder.types.ts` — ⚠️ MINOR ISSUES

**Lines reviewed:** 130–215

**What works:**
- `CreatePurchaseOrderInput.shipToType?: 'entity' | 'my_office' | 'custom' | null` — correct inline union, matches backend schema ✓
- `UpdatePurchaseOrderInput = Partial<CreatePurchaseOrderInput>` — inherits correctly ✓

**Minor Issue #2 — `PurchaseOrderSummary.shipToType` typed as `string | null`:**

```typescript
// Current (line ~140)
shipToType?: string | null;
```

The response shape uses `string | null` instead of the proper union type. This means TypeScript won't catch passing an invalid value when reading from a PO response object — the Detail page comparison `po.shipToType === 'entity'` still works at runtime but loses compile-time safety.

**Recommendation:** Change to:
```typescript
import type { ShipToType } from '@shared/types';
// ...
shipToType?: ShipToType | null;
```
Or at minimum use the inline union:
```typescript
shipToType?: 'entity' | 'my_office' | 'custom' | null;
```

---

### 6. `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` — ✅ PASS (with minor issues)

This is the most complex file. Reviewed in full.

#### Correctness

| Requirement | Status | Notes |
|---|---|---|
| Radio group shown only when entity selected | ✅ | Conditional render: `{selectedLocationId ? <RadioGroup...> : <TextField...>}` |
| `'entity'` sets `shipTo` to entity address | ✅ | `handleEntityLocationChange` + `handleShipToTypeChange('entity')` both build address from loc fields |
| `'my_office'` sets `shipTo` to user's office address | ✅ | `handleShipToTypeChange('my_office')` reads from `myOfficeLocation` query |
| `shipToType` in form payload | ✅ | `buildPayload()` includes `shipToType: shipToType` |
| Entity label includes entity name | ✅ | `` `${loc.name ?? 'Selected Location'} (department/program address)` `` |
| My office label includes school name | ✅ | `` `My office: ${myOfficeLocation.name}` `` |
| `/users/me/office-location` fetch | ✅ | TanStack Query with `staleTime: 5min`, catch returns `null` gracefully |
| MUI RadioGroup with FormControlLabel + Radio | ✅ | All three MUI primitives used correctly |

#### Type Safety

**Minor Issue #1 — Local `ShipToType` duplicates shared type:**

```typescript
// RequisitionWizard.tsx line ~70 — LOCAL DEFINITION
type ShipToType = 'entity' | 'my_office' | 'custom';
```

This duplicates `ShipToType` from `c:\Tech-V2\shared\src\types.ts`. If the shared definition ever changes (e.g., adding `'po_box'`), the wizard won't be updated automatically.

**Recommendation:** Replace the local definition with an import:
```typescript
import type { ShipToType } from '@shared/types';
```
Or from the frontend types file:
```typescript
import type { CreatePurchaseOrderInput } from '@/types/purchaseOrder.types';
// then use:  CreatePurchaseOrderInput['shipToType']
```

#### UX

**Minor Issue #3 — Review step (Step 3) omits shipToType indicator:**

The Step 3 "Review" panel shows:
```tsx
<Typography variant="caption" color="text.secondary">Ship To</Typography>
<Typography>{shipTo || '—'}</Typography>
```

There is no visual indicator of whether the address is from the entity, from "My Office", or custom. A user cannot distinguish at review time between a typed custom address and an auto-populated entity address.

**Recommendation:** Add a small chip below the shipTo text in the review:
```tsx
{shipToType !== 'custom' && (
  <Chip size="small" variant="outlined"
    label={shipToType === 'entity' ? 'Entity Address' : 'My Office'}
    sx={{ mt: 0.5 }}
  />
)}
```

**Minor Issue #4 — Entity radio label uses "(department/program address)" for SCHOOL entity type:**

```tsx
label={`${loc.name ?? 'Selected Location'} (department/program address)`}
```

When the selected entity is a `SCHOOL`, the label reads "Lincoln Elementary (department/program address)" — slightly misleading. "entity address" or a type-aware string would be more accurate.

**Recommendation:** Make the label type-aware:
```typescript
const entityLabel = entityType === 'SCHOOL'
  ? `${loc.name} (school address)`
  : entityType === 'PROGRAM'
  ? `${loc.name} (program address)`
  : `${loc.name} (department address)`;
```
Or use the generic: `${loc.name} (entity address)`

#### Security

- No sensitive data exposed; `shipToType` and `shipTo` are non-PII address strings ✓
- `/users/me/office-location` is protected by `authenticate` middleware ✓
- Zod validation on backend prevents injection via enum constraint ✓
- `inputProps={{ maxLength: 500 }}` on the custom address field prevents oversized payloads from the UI ✓

#### Backward Compatibility

- When `selectedLocationId` is null, `shipToType` defaults to `'custom'` and `shipTo` is empty — matches prior behavior before this feature existed ✓
- Setting `shipToType: 'custom'` with an empty `shipTo` is equivalent to pre-feature behavior ✓

---

### 7. `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` — ✅ PASS

**Lines reviewed:** 356–364

```tsx
<Typography variant="body2">{po.shipTo ?? '—'}</Typography>
{po.shipToType && po.shipToType !== 'custom' && (
  <Chip
    size="small"
    label={po.shipToType === 'entity' ? 'Entity Address' : 'My Office'}
    variant="outlined"
    sx={{ mt: 0.5 }}
  />
)}
```

- Correctly shows ship-to address with `—` fallback ✓
- Badge only renders for `'entity'` and `'my_office'` — custom and null are both hidden ✓
- Labels are correct ✓
- Falls back gracefully when `shipToType` is `null` (old POs) ✓

**No issues.** The chip's lack of a `color` prop (rendering in default grey) is intentional — consistent with the existing entity type chip style in that same component.

---

## Issues Summary

| # | Severity | File | Description |
|---|---|---|---|
| 1 | Minor | `RequisitionWizard.tsx` ~L70 | Local `ShipToType` duplicates `shared/src/types.ts` export; import from shared instead |
| 2 | Minor | `purchaseOrder.types.ts` ~L140 | `PurchaseOrderSummary.shipToType` typed as `string \| null` instead of the union type; loses response-side type safety |
| 3 | Minor | `RequisitionWizard.tsx` Step 3 | Review step shows address text but no `shipToType` chip; user can't distinguish entity/my_office/custom at review time |
| 4 | Minor | `RequisitionWizard.tsx` ~L501 | Entity radio label says "(department/program address)" even for SCHOOL entity type; should say "(entity address)" or use type-aware string |

**Critical issues:** 0  
**Major issues:** 0  
**Minor issues:** 4

---

## Recommendations (Priority Order)

1. **Issue #2 (type safety)** — Update `PurchaseOrderSummary.shipToType` to `'entity' | 'my_office' | 'custom' | null`. Low effort, improves type chain integrity.

2. **Issue #1 (type duplication)** — Import `ShipToType` from shared instead of redeclaring locally. Low effort, reduces drift risk.

3. **Issue #4 (label accuracy)** — Change the entity radio label to `"(entity address)"` generically, or use a type-specific string. Low effort, small UX improvement.

4. **Issue #3 (review step UX)** — Add a `shipToType` chip to the Step 3 Review panel. Low effort, clearer review summary before final submission.

---

## Conclusion

The "Ship To" address choice feature is well-implemented. The data layer (schema, migration, validators, service) is correct and backward compatible. The UI logic faithfully meets the specification. The four minor issues are all low-risk and low-effort to fix. The implementation follows existing patterns throughout the codebase and is ready to merge.

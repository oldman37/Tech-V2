# Requisition "Ship To" Address Choice — Feature Specification

**System:** Tech-V2 (Tech Department Management System)  
**Date:** March 24, 2026  
**Feature:** Allow users to choose a shipping address (entity address vs. user's own office address) when creating or editing a requisition.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Feature Requirements](#2-feature-requirements)
3. [Proposed DB Changes](#3-proposed-db-changes)
4. [API Changes](#4-api-changes)
5. [Frontend Changes](#5-frontend-changes)
6. [Shared Type Changes](#6-shared-type-changes)
7. [Security Considerations](#7-security-considerations)
8. [Implementation Steps](#8-implementation-steps)

---

## 1. Current State Analysis

### 1.1 `purchase_orders` Model (Prisma)

**File:** `backend/prisma/schema.prisma`

Relevant fields on the `purchase_orders` model:

| Field | Type | Purpose |
|---|---|---|
| `shipTo` | `String?` | Free-text delivery address (max 500 chars per Zod validator). Printed on the PDF. |
| `officeLocationId` | `String?` | FK → `OfficeLocation`. Represents the **department/program/school** the requisition belongs to (used for approval routing). |
| `entityType` | `String?` | Cached value of `officeLocation.type` (`'SCHOOL'`, `'DEPARTMENT'`, `'PROGRAM'`, or null). |

**There is no current field tracking _which source_ the `shipTo` address came from.**

### 1.2 `OfficeLocation` Model

**File:** `backend/prisma/schema.prisma` (lines 269–286)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | UUID PK |
| `name` | `String` | e.g., "Hillcrest Elementary" |
| `code` | `String?` | Short code |
| `type` | `String` | `'SCHOOL'`, `'DISTRICT_OFFICE'`, `'DEPARTMENT'`, `'PROGRAM'` |
| `address` | `String?` | Street address line |
| `city` | `String?` | |
| `state` | `String?` | |
| `zip` | `String?` | |
| `phone` | `String?` | |
| `isActive` | `Boolean` | |

Full address is composed from `address`, `city`, `state`, `zip` — no single structured address string stored.

### 1.3 `User` Model (Location Fields)

**File:** `backend/prisma/schema.prisma` (line 480)

| Field | Type | Notes |
|---|---|---|
| `officeLocation` | `String?` | **Plain text string** synced from Microsoft Entra ID (e.g., `"Hillcrest Elementary"`). This is NOT a foreign key. |

There is no direct FK from `User` to `OfficeLocation`. The connection is made by name-matching:

- **Service method:** `UserService.getMyOfficeLocation(userId)` — resolves `user.officeLocation` string → `OfficeLocation` record via `findFirst({ where: { name: user.officeLocation } })`.
- **Endpoint:** `GET /api/users/me/office-location` (requires authentication, no special permission level).
- **Returns:** Full `OfficeLocation` with primary supervisor, or `204 No Content` if not set.

### 1.4 Current `RequisitionWizard.tsx` Behavior

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

Current flow when user picks a Department/Program/School:

1. `handleEntityLocationChange(locId)` is called.
2. Builds an address string: `"[loc.name]\n[address], [city], [state], [zip]"`.
3. Auto-fills the `shipTo` text field with that string.
4. Sets `autoFilledShipTo = true` (shows "Auto-filled from selected location" helper text).
5. User can freely **override** the text field — clearing `autoFilledShipTo`.

**Current state:** There is no radio/choice UI. The behavior is auto-fill from entity, user can type anything.

### 1.5 Validator (`purchaseOrder.validators.ts`)

**File:** `backend/src/validators/purchaseOrder.validators.ts`

`CreatePurchaseOrderSchema` already accepts:
- `shipTo?: string | null` (max 500 chars)
- `officeLocationId?: string | null` (UUID)
- `entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null`

`UpdatePurchaseOrderSchema` = `CreatePurchaseOrderSchema.partial()`.

### 1.6 Summary of Gaps

| Gap | Description |
|---|---|
| No `shipToType` field | Cannot track which address source the user chose. |
| No UI choice | The wizard auto-fills and lets user type — no explicit radio button choice. |
| No "my office" resolution in wizard | The wizard never fetches the user's own office location. |
| No "my office" resolution in backend | Backend does not validate or re-resolve the user's office location address. |

---

## 2. Feature Requirements

When a user has selected a Department / Program / School on a requisition (Step 1 of the wizard), they should see a **"Ship To" choice** with two options:

1. **Ship to [selected entity name]** — uses the address of the selected Department/Program/School location.
2. **Ship to my office location ([user's location name])** — uses the address of the school/office the user is assigned to (from their Entra `officeLocation` field, resolved to an `OfficeLocation` record).

An optional third option:
3. **Custom address** — free-text entry (preserves existing behavior for users who want a different address).

If **no entity location is selected**, the field should default to the "Custom address" mode (existing free-text behavior, unchanged).

### UX Notes

- The user's office location should be **pre-fetched** when the wizard loads (using the existing `GET /api/users/me/office-location` endpoint).
- If the user has **no office location set** (Entra field is empty or doesn't match any record), the "my office" option should be hidden or disabled.
- Changing the radio selection should re-fill the `shipTo` text with the appropriate address.
- The `shipToType` value should be **persisted** so the detail page and PDF can reflect the choice.

---

## 3. Proposed DB Changes

### 3.1 New Field on `purchase_orders`

Add one optional field:

```prisma
// In purchase_orders model, after the `shipTo` field:
shipToType        String?   // 'entity' | 'my_office' | 'custom'
```

| Value | Meaning |
|---|---|
| `'entity'` | Ship to the selected Department/Program/School address. |
| `'my_office'` | Ship to the requestor's own office location address. |
| `'custom'` | User entered a custom address manually. |
| `null` | Legacy/migrated records — treat as unknown. |

**Why a string (not enum)?** Prisma string fields with validated values (Zod) are the established pattern in this codebase (see `status`, `entityType`, `type` fields). Avoids a migration for a new Postgres enum type.

**No additional FK is needed.** The actual address text is already captured in `shipTo`. Storing the type is sufficient for display, reporting, and PDF logic.

### 3.2 Migration

Generate a new Prisma migration:

```bash
npx prisma migrate dev --name add_ship_to_type_to_purchase_orders
```

Migration SQL will be:
```sql
ALTER TABLE "purchase_orders" ADD COLUMN "shipToType" TEXT;
```

**Backward compatibility:** All existing rows will have `shipToType = NULL`. The UI and PDF should treat `null` as equivalent to `'custom'` (free-text, no specific source).

---

## 4. API Changes

### 4.1 Validators — `purchaseOrder.validators.ts`

**File:** `backend/src/validators/purchaseOrder.validators.ts`

Add to `CreatePurchaseOrderSchema`:

```typescript
shipToType: z
  .enum(['entity', 'my_office', 'custom'])
  .optional()
  .nullable(),
```

This is already inherited by `UpdatePurchaseOrderSchema` (which is `CreatePurchaseOrderSchema.partial()`), so no additional change needed there.

**Exported DTO type** `CreatePurchaseOrderDto` (inferred via `z.infer<typeof CreatePurchaseOrderSchema>`) will automatically include the new field.

### 4.2 Service — `purchaseOrder.service.ts`

**File:** `backend/src/services/purchaseOrder.service.ts`

**`createPurchaseOrder`:** Include `shipToType` in the Prisma `create` call:

```typescript
const record = await tx.purchase_orders.create({
  data: {
    // ... existing fields ...
    shipTo:       data.shipTo ?? null,
    shipToType:   data.shipToType ?? null,   // ← new field
    // ...
  },
  // ...
});
```

**`updatePurchaseOrder`:** Include `shipToType` in the Prisma `update` call (only when the field is present in the payload, using `data.shipToType !== undefined` guards that already apply to other optional fields).

No new endpoints are needed. The existing `POST /api/purchase-orders` and `PUT /api/purchase-orders/:id` endpoints handle create and update respectively.

### 4.3 Response Shape

The `shipToType` field will be returned automatically once it exists on the DB row, as all `purchase_orders` queries use `include`/`select` patterns that return the full record.

### 4.4 Existing Endpoint Used — No Changes Needed

`GET /api/users/me/office-location` already exists and returns:
```json
{
  "id": "uuid",
  "name": "Hillcrest Elementary",
  "type": "SCHOOL",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "TN",
  "zip": "37172",
  "phone": null,
  "isActive": true,
  "supervisors": [ ... ]
}
```

The frontend will call this endpoint when loading the wizard (see §5). No backend changes required for this endpoint.

---

## 5. Frontend Changes

### 5.1 `RequisitionWizard.tsx`

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

#### New State Variables

```typescript
// Ship-to choices
type ShipToType = 'entity' | 'my_office' | 'custom';
const [shipToType, setShipToType] = useState<ShipToType>('custom');
```

#### New Query — User's Own Office Location

Add a query to fetch the current user's resolved office location on mount:

```typescript
const { data: myOfficeLocation } = useQuery({
  queryKey: ['users', 'me', 'office-location'],
  queryFn: async () => {
    try {
      const res = await api.get<LocationOptionWithSupervisor>('/users/me/office-location');
      return res.data ?? null;
    } catch {
      return null;  // 204 or error → no office location
    }
  },
  staleTime: 5 * 60 * 1000,
});
```

#### Updated `handleEntityLocationChange`

When the user selects an entity location, **default to `'entity'` ship-to type** and fill address:

```typescript
const handleEntityLocationChange = useCallback((locId: string | null) => {
  setSelectedLocationId(locId);
  if (!locId) {
    setShipToType('custom');
    setShipTo('');
    setSelectedEntitySupervisor(null);
    setEntityType(null);
    return;
  }
  const loc = locationOptions.find((l) => l.id === locId);
  if (!loc) return;
  setEntityType(loc.type);

  // Default ship-to choice to 'entity' and fill address
  const addressParts = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
  const shipToValue = addressParts ? `${loc.name}\n${addressParts}` : loc.name;
  setShipTo(shipToValue);
  setShipToType('entity');

  const primarySup = loc.supervisors?.find((s) => s.isPrimary) ?? null;
  setSelectedEntitySupervisor(primarySup ?? null);
}, [locationOptions]);
```

#### New Handler — `handleShipToTypeChange`

```typescript
const handleShipToTypeChange = (newType: ShipToType) => {
  setShipToType(newType);
  if (newType === 'entity' && selectedLocationId) {
    const loc = locationOptions.find((l) => l.id === selectedLocationId);
    if (loc) {
      const addressParts = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
      setShipTo(addressParts ? `${loc.name}\n${addressParts}` : loc.name);
    }
  } else if (newType === 'my_office' && myOfficeLocation) {
    const addressParts = [
      myOfficeLocation.address, myOfficeLocation.city,
      myOfficeLocation.state, myOfficeLocation.zip
    ].filter(Boolean).join(', ');
    setShipTo(addressParts ? `${myOfficeLocation.name}\n${addressParts}` : myOfficeLocation.name);
  } else if (newType === 'custom') {
    setShipTo('');
  }
};
```

#### Updated `buildPayload`

```typescript
const buildPayload = (): CreatePurchaseOrderInput => ({
  title: title.trim(),
  vendorId: selectedVendor?.id ?? null,
  shipTo: shipTo.trim() || null,
  shipToType: shipToType,              // ← new field
  notes: notes.trim() || null,
  program: null,
  shippingCost: shippingCost ? Number(shippingCost) : null,
  officeLocationId: selectedLocationId ?? null,
  entityType: entityType ?? null,
  items: items.map((item, index) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineNumber: index + 1,
    model: item.model?.trim() || null,
  })),
});
```

#### Step 1 — Updated "Ship To" UI

Replace the current `TextField` for `shipTo` with a conditional radio + field block when a location is selected:

```tsx
{/* ── Ship To ── */}
{selectedLocationId ? (
  <FormControl component="fieldset">
    <FormLabel component="legend" sx={{ mb: 1 }}>Ship To</FormLabel>
    <RadioGroup
      value={shipToType}
      onChange={(e) => handleShipToTypeChange(e.target.value as ShipToType)}
    >
      <FormControlLabel
        value="entity"
        control={<Radio />}
        label={`${selectedLocationId ? locationOptions.find(l => l.id === selectedLocationId)?.name ?? 'Selected Location' : 'Selected Location'} (department/program address)`}
      />
      {myOfficeLocation && (
        <FormControlLabel
          value="my_office"
          control={<Radio />}
          label={`My office: ${myOfficeLocation.name}`}
        />
      )}
      <FormControlLabel
        value="custom"
        control={<Radio />}
        label="Custom address"
      />
    </RadioGroup>

    {/* Address preview for entity/my_office, editable text for custom */}
    {(shipToType === 'entity' || shipToType === 'my_office') ? (
      <Box sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, mt: 1 }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
          {shipTo || '(No address on file for this location)'}
        </Typography>
      </Box>
    ) : (
      <TextField
        label="Custom Address"
        value={shipTo}
        onChange={(e) => setShipTo(e.target.value)}
        fullWidth
        multiline
        minRows={2}
        placeholder="Enter delivery address"
        inputProps={{ maxLength: 500 }}
        sx={{ mt: 1 }}
      />
    )}
  </FormControl>
) : (
  /* No location selected — show plain text field (existing behavior) */
  <TextField
    label="Ship To"
    value={shipTo}
    onChange={(e) => setShipTo(e.target.value)}
    fullWidth
    placeholder="Delivery address"
    inputProps={{ maxLength: 500 }}
  />
)}
```

**MUI imports to add:** `FormControl`, `FormLabel`, `RadioGroup`, `Radio`, `FormControlLabel` — these are all standard MUI components, likely already imported partially. Check existing imports and add only what's missing.

### 5.2 `PurchaseOrderDetail.tsx`

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Add display of the `shipToType` value in the detail view. In the "Details" section where `shipTo` is already shown, add a small badge or label:

```tsx
{po.shipTo && (
  <Box>
    <Typography variant="caption" color="text.secondary">Ship To</Typography>
    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{po.shipTo}</Typography>
    {po.shipToType && po.shipToType !== 'custom' && (
      <Chip
        size="small"
        label={po.shipToType === 'entity' ? 'Entity Address' : 'My Office'}
        variant="outlined"
        sx={{ mt: 0.5 }}
      />
    )}
  </Box>
)}
```

---

## 6. Shared Type Changes

### 6.1 `shared/src/types.ts`

Add a `ShipToType` union type for cross-package use:

```typescript
/**
 * Ship-to address source type for purchase orders
 */
export type ShipToType = 'entity' | 'my_office' | 'custom';
```

### 6.2 `frontend/src/types/purchaseOrder.types.ts`

**`CreatePurchaseOrderInput`** — add `shipToType`:

```typescript
export interface CreatePurchaseOrderInput {
  title: string;
  type?: string;
  vendorId?: string | null;
  shipTo?: string | null;
  shipToType?: 'entity' | 'my_office' | 'custom' | null;  // ← new
  shippingCost?: number | null;
  notes?: string | null;
  program?: string | null;
  officeLocationId?: string | null;
  entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null;
  items: PurchaseOrderItemInput[];
}
```

**`PurchaseOrderSummary`** — add `shipToType`:

```typescript
export interface PurchaseOrderSummary {
  // ... existing fields ...
  shipTo?: string | null;
  shipToType?: string | null;  // ← new
  // ...
}
```

---

## 7. Security Considerations

### 7.1 Input Validation

- `shipToType` is validated server-side via Zod `z.enum(['entity', 'my_office', 'custom'])`. An invalid value will return HTTP 422.
- `shipTo` continues to be validated via `z.string().max(500)`. XSS risk is minimal since this field is rendered in a PDF or as plain text.

### 7.2 Address Trust Model

The backend receives the final `shipTo` text (the resolved address string) from the frontend. **This is acceptable** because:

1. The `shipTo` field is informational / display-only. It is printed on the PDF and has no financial or access-control implications.
2. The user can always submit any address they want via the "custom" option anyway. Restricting `entity` or `my_office` to be server-resolved would add complexity with no meaningful security benefit.
3. The `officeLocationId` FK (used for approval routing) is the authoritative business-logic field and is unaffected by `shipToType`.

**Recommendation:** No server-side re-resolution of the address is needed. The Zod enum validation on `shipToType` is sufficient.

### 7.3 CSRF

All create/update PO endpoints already require `validateCsrfToken` middleware. No change needed.

### 7.4 Authorization

The `GET /api/users/me/office-location` endpoint requires only `authenticate` middleware (any logged-in user). This is correct — a user reading their own office location data is not a privilege escalation concern.

---

## 8. Implementation Steps

All tasks are ordered from lowest to highest dependency. Steps within a group can be executed in parallel.

### Phase 1 — Backend Schema

| Step | File | Change |
|---|---|---|
| 1 | `backend/prisma/schema.prisma` | Add `shipToType String?` field to `purchase_orders` model, after the `shipTo` field. |
| 2 | (terminal) | Run `npx prisma migrate dev --name add_ship_to_type_to_purchase_orders` |
| 3 | (terminal) | Run `npx prisma generate` |

### Phase 2 — Backend Logic (after Phase 1)

| Step | File | Change |
|---|---|---|
| 4 | `backend/src/validators/purchaseOrder.validators.ts` | Add `shipToType: z.enum(['entity', 'my_office', 'custom']).optional().nullable()` to `CreatePurchaseOrderSchema`. |
| 5 | `backend/src/services/purchaseOrder.service.ts` | In `createPurchaseOrder`: add `shipToType: data.shipToType ?? null` to the Prisma `create` data object. |
| 6 | `backend/src/services/purchaseOrder.service.ts` | In `updatePurchaseOrder`: add `shipToType: data.shipToType ?? null` to the Prisma `update` data object (following the same `data.shipToType !== undefined` guard pattern used for other optional fields). |

### Phase 3 — Shared Types

| Step | File | Change |
|---|---|---|
| 7 | `shared/src/types.ts` | Add `export type ShipToType = 'entity' \| 'my_office' \| 'custom';` |

### Phase 4 — Frontend Types

| Step | File | Change |
|---|---|---|
| 8 | `frontend/src/types/purchaseOrder.types.ts` | Add `shipToType?: 'entity' \| 'my_office' \| 'custom' \| null` to `CreatePurchaseOrderInput`. |
| 9 | `frontend/src/types/purchaseOrder.types.ts` | Add `shipToType?: string \| null` to `PurchaseOrderSummary` (and inherited by `PurchaseOrder`). |

### Phase 5 — Frontend Components (after Phases 3–4)

| Step | File | Change |
|---|---|---|
| 10 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Add `shipToType` state variable with type `'entity' \| 'my_office' \| 'custom'`, defaulting to `'custom'`. |
| 11 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Add `myOfficeLocation` query using `GET /api/users/me/office-location`. |
| 12 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Update `handleEntityLocationChange` to set `shipToType = 'entity'` and fill address. |
| 13 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Add `handleShipToTypeChange` handler. |
| 14 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Replace `shipTo` `TextField` with radio group + conditional address display/text field (see §5.1). |
| 15 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Add `shipToType` to `buildPayload()`. |
| 16 | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Add MUI imports: `FormControl`, `FormLabel`, `RadioGroup`, `Radio`, `FormControlLabel`. |
| 17 | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Add `shipToType` chip badge in the ship-to display section. |

### Phase 6 — Build Verification

| Step | Action |
|---|---|
| 18 | Run `npm run build` in `/backend` — verify 0 TypeScript errors. |
| 19 | Run `npm run build` in `/frontend` — verify 0 TypeScript errors. |

---

## 9. Files to Create or Modify — Summary

| Action | File |
|---|---|
| **Modify** | `backend/prisma/schema.prisma` |
| **New migration** | `backend/prisma/migrations/<timestamp>_add_ship_to_type_to_purchase_orders/migration.sql` |
| **Modify** | `backend/src/validators/purchaseOrder.validators.ts` |
| **Modify** | `backend/src/services/purchaseOrder.service.ts` |
| **Modify** | `shared/src/types.ts` |
| **Modify** | `frontend/src/types/purchaseOrder.types.ts` |
| **Modify** | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` |
| **Modify** | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` |

**Total files changed: 7 existing files + 1 new migration file.**

---

## 10. Design Decisions & Trade-offs

| Decision | Rationale |
|---|---|
| Use `shipToType String?` (not a Prisma enum) | Consistent with the codebase's existing pattern (`status`, `entityType`, `type` are all `String` fields validated by Zod). Avoids extra Postgres enum migration. |
| No server-side address re-resolution for `my_office` | The `shipTo` text is display/print-only. Re-resolving server-side adds complexity with no security gain — user-entered custom addresses are already unrestricted. |
| Default to `'entity'` when a location is selected | Matches the current auto-fill behavior — minimal disruption to existing UX flow. |
| Hide "my office" option when user has no location | Avoids confusing empty-address scenario. Degrade gracefully. |
| `null` shipToType for legacy records | Existing rows remain valid; treat as `'custom'` in display logic. |

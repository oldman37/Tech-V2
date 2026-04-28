# Spec: PO Line Item UI Fixes

**Date:** 2026-03-24  
**Scope:** Frontend only — minimal, targeted fixes. No new features, no refactoring.  
**Files in scope:**
- `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

---

## Issue 1 — Qty Input Too Narrow

### Current State
**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Line 584:**
```tsx
<TableCell sx={{ width: 80 }}>Qty *</TableCell>
```
**Lines 605–614** (the input cell body — no explicit width on `TableCell`):
```tsx
<TableCell>
  <TextField
    size="small"
    type="number"
    value={item.quantity}
    onChange={(e) => updateItem(item._key, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
    inputProps={{ min: 1, style: { textAlign: 'right' } }}
    fullWidth
    error={item.quantity <= 0}
  />
</TableCell>
```
The header cell constrains column width to `80px`. The `fullWidth` TextField expands to fill the cell, so the input is effectively `80px` wide — too narrow to display multi-digit quantities comfortably.

### Proposed Fix
Widen the header `TableCell` from `width: 80` to `width: 110`. No change needed to the `TextField` itself (it already uses `fullWidth`).

```tsx
// Line 584 — change:
<TableCell sx={{ width: 80 }}>Qty *</TableCell>
// To:
<TableCell sx={{ width: 110 }}>Qty *</TableCell>
```

---

## Issue 2 — Unit Price Shows Leading Zero ("0123" instead of "123")

### Current State
**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Line 585 (header):**
```tsx
<TableCell sx={{ width: 120 }}>Unit Price *</TableCell>
```
**Lines 615–624 (input):**
```tsx
<TableCell>
  <TextField
    size="small"
    type="number"
    value={item.unitPrice}
    onChange={(e) => updateItem(item._key, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
    inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
    fullWidth
    error={item.unitPrice <= 0}
  />
</TableCell>
```
**Root cause:** `item.unitPrice` starts at `0` (see line 110: `{ _key: key, description: '', quantity: 1, unitPrice: 0, model: '' }`). The controlled `type="number"` input displays `0`. When the user clicks into the field and starts typing digits without first selecting/clearing the `0`, browsers render the intermediate value as `"0123"`. While `parseFloat("0123")` correctly returns `123` and the React state updates to `123`, the visual leading zero persists until the input loses focus and React re-renders the controlled value.

### Proposed Fix
Add `onFocus={(e) => e.target.select()}` to auto-select the entire field content when the user focuses it. This way, typing immediately replaces the displayed `0` with the new digits — no leading zero ever appears.

```tsx
// Lines 615–624 — change:
<TextField
  size="small"
  type="number"
  value={item.unitPrice}
  onChange={(e) => updateItem(item._key, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
  inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
  fullWidth
  error={item.unitPrice <= 0}
/>
// To:
<TextField
  size="small"
  type="number"
  value={item.unitPrice}
  onChange={(e) => updateItem(item._key, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
  onFocus={(e) => e.target.select()}
  inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
  fullWidth
  error={item.unitPrice <= 0}
/>
```

Apply the same `onFocus` fix to the Qty `TextField` as well (same issue: starts at `1`, user would need to clear before typing):

```tsx
// Lines 605–614 Qty TextField — add onFocus:
<TextField
  size="small"
  type="number"
  value={item.quantity}
  onChange={(e) => updateItem(item._key, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
  onFocus={(e) => e.target.select()}
  inputProps={{ min: 1, style: { textAlign: 'right' } }}
  fullWidth
  error={item.quantity <= 0}
/>
```

---

## Issue 3 — "Model / Part #" Label Must Be Renamed to "Item Number"

The label `Model / Part #` appears in three places across two files.

### Occurrence A — RequisitionWizard.tsx (line item entry table header)
**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Line 587:**
```tsx
<TableCell sx={{ width: 130 }}>Model / Part #</TableCell>
```
**Change to:**
```tsx
<TableCell sx={{ width: 130 }}>Item Number</TableCell>
```

### Occurrence B — RequisitionWizard.tsx (review/summary table header)
**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`  
**Line 748:**
```tsx
<TableCell>Model</TableCell>
```
**Change to:**
```tsx
<TableCell>Item Number</TableCell>
```

### Occurrence C — PurchaseOrderDetail.tsx (read-only detail view table header)
**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`  
**Line 432:**
```tsx
<TableCell>Model / Part #</TableCell>
```
**Change to:**
```tsx
<TableCell>Item Number</TableCell>
```

---

## Summary of All Changes

| # | File | Line | Change |
|---|------|------|--------|
| 1 | `RequisitionWizard.tsx` | 584 | `width: 80` → `width: 110` on Qty header `TableCell` |
| 2 | `RequisitionWizard.tsx` | ~608 | Add `onFocus={(e) => e.target.select()}` to Qty `TextField` |
| 3 | `RequisitionWizard.tsx` | ~619 | Add `onFocus={(e) => e.target.select()}` to Unit Price `TextField` |
| 4 | `RequisitionWizard.tsx` | 587 | `"Model / Part #"` → `"Item Number"` (entry table header) |
| 5 | `RequisitionWizard.tsx` | 748 | `"Model"` → `"Item Number"` (review table header) |
| 6 | `PurchaseOrderDetail.tsx` | 432 | `"Model / Part #"` → `"Item Number"` (detail view header) |

All changes are purely presentational/label edits and a single event handler addition. No type changes, no API changes, no new state.

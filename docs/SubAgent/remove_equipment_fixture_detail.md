# Remove "Equipment / Fixture Detail" Section from Work Order Form

## Overview

Remove the **MAINTENANCE-specific** "Equipment / Fixture Details" section (Manufacturer, Model, Serial Number fields) from the work order creation form and detail view. The database columns remain intact — the frontend simply stops sending these fields.

The **TECHNOLOGY-specific** "Equipment Details" section (Asset Tag / Inventory ID) is **kept** — it is NOT part of this removal.

---

## Affected Fields

The three fields being removed from the UI:

| Form Label       | Form State Key | DTO Field        | Prisma Column     |
|------------------|----------------|------------------|-------------------|
| Manufacturer     | `mfg`          | `equipmentMfg`   | `equipmentMfg`    |
| Model            | `model`        | `equipmentModel` | `equipmentModel`  |
| Serial Number    | `serial`       | `equipmentSerial`| `equipmentSerial` |

---

## Files & Line Ranges

### 1. Frontend — New Work Order Form

**File:** `frontend/src/pages/NewWorkOrderPage.tsx`

#### A. FormState interface (lines 46–60)
Remove these keys from `FormState`:
```ts
  mfg: string;       // line 56
  model: string;      // line 57
  serial: string;     // line 58
```

#### B. INITIAL constant (lines 62–73)
Remove these initial values:
```ts
  mfg: '',            // line 71
  model: '',          // line 72
  serial: '',         // line 73
```

#### C. handleSubmit — DTO construction (lines 148–154)
Remove the MAINTENANCE spread block:
```ts
      ...(form.department === 'MAINTENANCE' && {
        equipmentMfg: form.mfg || null,
        equipmentModel: form.model || null,
        equipmentSerial: form.serial || null,
      }),
```

#### D. Maintenance-specific JSX section (lines 339–365)
Remove the entire `{form.department === 'MAINTENANCE' && ( ... )}` block containing:
- `<Typography>` "Equipment / Fixture Details (optional)"
- Three `<TextField>` components: Manufacturer, Model, Serial Number

---

### 2. Frontend — Work Order Detail Page

**File:** `frontend/src/pages/WorkOrderDetailPage.tsx`

#### Equipment display block (lines 411–423)
Remove the conditional block:
```tsx
{workOrder.equipmentMfg && (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">
      Equipment
    </Typography>
    <Typography variant="body2">
      {[workOrder.equipmentMfg, workOrder.equipmentModel, workOrder.equipmentSerial]
        .filter(Boolean)
        .join(' / ')}
    </Typography>
  </Box>
)}
```

---

### 3. Frontend — Types

**File:** `frontend/src/types/work-order.types.ts`

#### WorkOrderDetail interface (lines 85–89)
Keep fields as-is (they map to DB columns that still exist, and the detail API still returns them). Optionally mark as deprecated with comments, but no functional change needed.

#### CreateWorkOrderDto (lines 106–108)
These are already optional. No change required (backend will simply never receive them from the form).

#### UpdateWorkOrderDto (lines 117–119)
These are already optional. No change required.

---

### 4. Backend — Prisma Schema

**File:** `backend/prisma/schema.prisma` (lines 717–720 in the Ticket model)

```prisma
  equipmentMfg     String?
  equipmentModel   String?
  equipmentSerial  String?
```

**ACTION: NO CHANGE.** Columns stay in the database. No migration needed.

---

### 5. Backend — Zod Validators

**File:** `backend/src/validators/work-orders.validators.ts`

#### CreateWorkOrderSchema (lines 79–81, 84–89)
Fields are already optional/nullable in the schema:
```ts
    equipmentMfg:    z.string().max(200).optional().nullable(),
    equipmentModel:  z.string().max(200).optional().nullable(),
    equipmentSerial: z.string().max(200).optional().nullable(),
```

The `superRefine` cross-department check (line 84) prevents TECHNOLOGY orders from having these fields, and validates MAINTENANCE can't have `equipmentId`.

**ACTION: NO CHANGE REQUIRED.** The fields are optional; not sending them is valid.

#### UpdateWorkOrderSchema (lines 110–112)
Also already optional/nullable:
```ts
  equipmentMfg:    z.string().max(200).optional().nullable(),
  equipmentModel:  z.string().max(200).optional().nullable(),
  equipmentSerial: z.string().max(200).optional().nullable(),
```

**ACTION: NO CHANGE REQUIRED.**

---

### 6. Backend — Work Order Service

**File:** `backend/src/services/work-orders.service.ts`

#### createWorkOrder method (lines 396–398)
```ts
          equipmentMfg:    data.department === 'MAINTENANCE' ? (data.equipmentMfg ?? null) : null,
          equipmentModel:  data.department === 'MAINTENANCE' ? (data.equipmentModel ?? null) : null,
          equipmentSerial: data.department === 'MAINTENANCE' ? (data.equipmentSerial ?? null) : null,
```

**ACTION: NO CHANGE REQUIRED.** When the frontend stops sending these fields, `data.equipmentMfg` etc. will be `undefined`, and `undefined ?? null` evaluates to `null`. The columns will be set to NULL — correct behavior.

#### WORK_ORDER_DETAIL_INCLUDE (line 71)
```ts
  equipment: { select: { id: true, assetTag: true, name: true } },
```

**ACTION: NO CHANGE.** This is the Technology equipment relation, not the Maintenance fields.

---

### 7. Backend — Controller

**File:** `backend/src/controllers/work-orders.controller.ts`

**ACTION: NO CHANGE REQUIRED.** The controller just passes validated DTO to the service.

---

### 8. Backend — Routes

**File:** `backend/src/routes/work-orders.routes.ts`

**ACTION: NO CHANGE REQUIRED.**

---

### 9. Shared Types

**File:** `shared/src/work-order.types.ts`

#### WorkOrderDetail (lines 133–135)
```ts
  equipmentMfg: string | null;
  equipmentModel: string | null;
  equipmentSerial: string | null;
```

#### CreateWorkOrderDto (lines 153–155)
```ts
  equipmentMfg?: string | null;
  equipmentModel?: string | null;
  equipmentSerial?: string | null;
```

#### UpdateWorkOrderDto (lines 164–166)
```ts
  equipmentMfg?: string | null;
  equipmentModel?: string | null;
  equipmentSerial?: string | null;
```

**ACTION: NO CHANGE REQUIRED.** These are already optional/nullable. The API still returns them (as null) for existing records. Removing them from types would be a breaking change if any other consumer references them.

---

## Removal Plan — Summary

| # | File | Action |
|---|------|--------|
| 1 | `frontend/src/pages/NewWorkOrderPage.tsx` | Remove `mfg`, `model`, `serial` from FormState, INITIAL, handleSubmit DTO, and the Maintenance JSX section |
| 2 | `frontend/src/pages/WorkOrderDetailPage.tsx` | Remove the equipment display block (lines 411–423) |
| 3 | `frontend/src/types/work-order.types.ts` | No change (fields are optional) |
| 4 | `backend/prisma/schema.prisma` | **No change** — keep DB columns |
| 5 | `backend/src/validators/work-orders.validators.ts` | **No change** — fields are already optional |
| 6 | `backend/src/services/work-orders.service.ts` | **No change** — handles undefined gracefully |
| 7 | `backend/src/controllers/work-orders.controller.ts` | **No change** |
| 8 | `backend/src/routes/work-orders.routes.ts` | **No change** |
| 9 | `shared/src/work-order.types.ts` | **No change** |

**Total files to modify: 2** (both frontend)

---

## Important Notes

- **No database migration needed.** Columns remain; they'll simply be NULL for new records.
- **Existing data is preserved.** Any previously submitted Manufacturer/Model/Serial data stays in the DB.
- **The Technology "Equipment Details" (Asset Tag) section is NOT affected** — it remains in the form.
- **Backend is already tolerant** of missing optional fields — no backend changes required.

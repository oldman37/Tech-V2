# Field Trip Part C — New Transportation Secretary Fields

**Generated:** 2026-05-05  
**Scope:** Add Transportation Type (restricted), Number of Buses, and Driver Names to the Part C approval form and confirmation email.

---

## 1. Analysis of Existing State

### Schema (`FieldTripTransportationRequest`)

| Field | Type | Part | Notes |
|---|---|---|---|
| `transportationType` | `String? @db.VarChar(100)` | C | Already exists — `DISTRICT_BUS | CHARTER | PARENT_TRANSPORT | WALKING` |
| `transportationCost` | `Decimal? @db.Decimal(10,2)` | C | Already exists — "Estimated/Assessed Cost" |
| `transportationNotes` | `String? @db.Text` | C | Already exists |
| `busCount` | `Int` | **A** | Submitter-set (ceil(students/52)). NOT to be confused with Part C bus count |

**Missing fields (need to add):**

| New Field | Type | Purpose |
|---|---|---|
| `transportationBusCount` | `Int?` | Part C — number of buses the transportation office is dispatching |
| `driverNames` | `Json?` | Part C — `string[]` of driver names, index `i` = Bus `i+1` driver |

> **Note:** `transportationCost` already exists in both schema and frontend. The feature request's "Estimated Cost" maps directly to the existing `transportationCost` / "Assessed Transportation Cost" field — no schema change needed for that field, only a label clarification in the UI.

> **Note:** `transportationType` already exists. The feature request restricts Part C to 3 options (District Buses, Charter Buses, Walking), dropping `PARENT_TRANSPORT`. The DB column stays unchanged; the restriction is enforced in the validator and hidden in the UI.

---

## 2. Schema Changes

### File: `c:\Tech-V2\backend\prisma\schema.prisma`

**Location:** Inside `model FieldTripTransportationRequest { }`, after the `transportationNotes` line (~line 661).

Add two fields in the `// Part C` block:

```prisma
// Part C — Transportation office (set by Transportation Director on approve/deny)
transportationType      String?   @db.VarChar(100)    // 'DISTRICT_BUS' | 'CHARTER' | 'WALKING'
transportationCost      Decimal?  @db.Decimal(10, 2)  // cost assessed by transportation office
transportationBusCount  Int?                           // Part C — buses dispatched (nil = not yet set or WALKING)
driverNames             Json?                          // Part C — string[] driver names, one per bus
transportationNotes     String?   @db.Text
denialReason            String?   @db.Text
```

No new Prisma enum is required — `transportationType` remains a plain `String` column (values are validated by Zod at the API layer).

---

## 3. Migration

### Naming Convention

Existing migration directories follow: `YYYYMMDDHHMMSS_snake_case_description`

Timestamp to use (today, next available): `20260505120000`

**Migration directory name:**
```
20260505120000_add_transportation_part_c_bus_and_drivers
```

### Migration SQL (`migration.sql`)

```sql
-- AlterTable
ALTER TABLE "field_trip_transportation_requests"
ADD COLUMN "transportationBusCount" INTEGER,
ADD COLUMN "driverNames"            JSONB;
```

**How to generate:**  
After updating `schema.prisma`, run:
```bash
npx prisma migrate dev --name add_transportation_part_c_bus_and_drivers
```
Prisma will produce the above SQL automatically.

---

## 4. Validator Changes

### File: `c:\Tech-V2\backend\src\validators\fieldTripTransportation.validators.ts`

#### 4a. Restrict Part C transportation types (~line 27)

Change (or add a separate const for Part C):

```typescript
// Types allowed when the transportation office sets Part C
export const PART_C_TRANSPORTATION_TYPES = [
  'DISTRICT_BUS',
  'CHARTER',
  'WALKING',
] as const;

export type PartCTransportationType = (typeof PART_C_TRANSPORTATION_TYPES)[number];
```

> `PARENT_TRANSPORT` is intentionally excluded — it is not valid for Part C approval.  
> Keep `TRANSPORTATION_TYPES` (all 4 values) in place for backward compatibility with existing data reads.

#### 4b. Extend `ApproveTransportationSchema` (~line 72)

Current schema:
```typescript
export const ApproveTransportationSchema = z.object({
  transportationType: z.enum(TRANSPORTATION_TYPES),
  transportationCost: z.number().min(0).optional().nullable(),
  notes:              z.string().max(3000).optional().nullable(),
});
```

New schema (replace in-place):
```typescript
export const ApproveTransportationSchema = z.object({
  transportationType:    z.enum(PART_C_TRANSPORTATION_TYPES),
  transportationCost:    z.number().min(0).optional().nullable(),
  transportationBusCount: z.number().int().min(1).max(99).optional().nullable(),
  driverNames:           z.array(z.string().max(200)).max(99).optional().nullable(),
  notes:                 z.string().max(3000).optional().nullable(),
}).refine(
  (d) => {
    // busCount + driverNames only meaningful for bus trips
    const isBus = d.transportationType === 'DISTRICT_BUS' || d.transportationType === 'CHARTER';
    if (isBus && d.transportationBusCount != null && d.driverNames != null) {
      // driverNames array length must equal transportationBusCount
      return d.driverNames.length === d.transportationBusCount;
    }
    return true;
  },
  { message: 'Number of driver names must equal the number of buses' },
);

export type ApproveTransportationDto = z.infer<typeof ApproveTransportationSchema>;
```

---

## 5. Service Changes

### File: `c:\Tech-V2\backend\src\services\fieldTripTransportation.service.ts`

#### 5a. Update `ApproveTransportationDto` import type

The DTO type is derived from Zod (`z.infer`), so it updates automatically — no manual change needed here beyond the validator edit above.

#### 5b. Update `approve()` method (~line 308 in the `data:` block of `prisma.fieldTripTransportationRequest.update`)

Current `data:` object:
```typescript
data: {
  status:              'TRANSPORTATION_APPROVED',
  transportationType:  data.transportationType,
  transportationCost:  data.transportationCost ?? null,
  transportationNotes: data.notes ?? null,
  approvedById:        userId,
  approvedAt:          new Date(),
},
```

Updated `data:` object — add two new fields:
```typescript
data: {
  status:                 'TRANSPORTATION_APPROVED',
  transportationType:     data.transportationType,
  transportationCost:     data.transportationCost ?? null,
  transportationBusCount: data.transportationBusCount ?? null,
  driverNames:            data.driverNames ?? Prisma.DbNull,
  transportationNotes:    data.notes ?? null,
  approvedById:           userId,
  approvedAt:             new Date(),
},
```

> `Prisma.DbNull` is already imported at the top of the file (`import { Prisma } from '@prisma/client'`).

---

## 6. Email Template Changes

### File: `c:\Tech-V2\backend\src\services\email.service.ts`

#### 6a. Update `sendTransportationApproved` signature (~line 693)

Current `transportRequest` parameter shape:
```typescript
transportRequest: {
  transportationType: string | null;
  transportationCost: unknown;
  transportationNotes: string | null;
}
```

New shape (add two fields):
```typescript
transportRequest: {
  transportationType:     string | null;
  transportationCost:     unknown;
  transportationBusCount: number | null;
  driverNames:            string[] | null;
  transportationNotes:    string | null;
}
```

#### 6b. Update the HTML table in `sendTransportationApproved` (~line 724)

After the existing "Assessed Cost" row, insert:

```typescript
// Build driver names rows
const driversHtml = (() => {
  if (!transportRequest.driverNames?.length) return '';
  return transportRequest.driverNames
    .map((name, i) =>
      `<tr><td style="padding:4px 8px;font-weight:bold;">Bus ${i + 1} Driver:</td>
           <td style="padding:4px 8px;">${escapeHtml(name || '—')}</td></tr>`,
    )
    .join('');
})();
```

And extend the HTML table:
```html
<tr>
  <td style="padding:4px 8px;font-weight:bold;">Transportation Type:</td>
  <td style="padding:4px 8px;">${escapeHtml(typeLabel)}</td>
</tr>
<tr>
  <td style="padding:4px 8px;font-weight:bold;">Estimated Cost:</td>
  <td style="padding:4px 8px;">${escapeHtml(costStr)}</td>
</tr>
${transportRequest.transportationBusCount != null ? `
<tr>
  <td style="padding:4px 8px;font-weight:bold;">Number of Buses:</td>
  <td style="padding:4px 8px;">${transportRequest.transportationBusCount}</td>
</tr>` : ''}
${driversHtml}
${transportRequest.transportationNotes ? `
<tr>
  <td style="padding:4px 8px;font-weight:bold;vertical-align:top;">Notes:</td>
  <td style="padding:4px 8px;">${escapeHtml(transportRequest.transportationNotes)}</td>
</tr>` : ''}
```

#### 6c. Update the controller's `sendTransportationApproved` call

### File: `c:\Tech-V2\backend\src\controllers\fieldTripTransportation.controller.ts` (~line 178)

Current call:
```typescript
sendTransportationApproved(
  submitterEmail,
  { /* trip fields */ },
  {
    transportationType:  result.transportationType,
    transportationCost:  result.transportationCost,
    transportationNotes: result.transportationNotes,
  },
)
```

Updated call:
```typescript
sendTransportationApproved(
  submitterEmail,
  { /* trip fields — unchanged */ },
  {
    transportationType:     result.transportationType,
    transportationCost:     result.transportationCost,
    transportationBusCount: result.transportationBusCount ?? null,
    driverNames:            (result.driverNames as string[] | null) ?? null,
    transportationNotes:    result.transportationNotes,
  },
)
```

---

## 7. Frontend Changes

### 7a. Frontend Types

**File:** `c:\Tech-V2\frontend\src\types\fieldTrip.types.ts`

#### `FieldTripTransportationRequest` interface (~line 252) — add two optional fields:
```typescript
transportationBusCount?: number | null;
driverNames?:            string[] | null;
```

#### `ApproveTransportationDto` interface (~line 305) — add two optional fields:
```typescript
export interface ApproveTransportationDto {
  transportationType:     TransportationType;
  transportationCost?:    number | null;
  transportationBusCount?: number | null;
  driverNames?:            string[] | null;
  notes?:                 string | null;
}
```

#### `TRANSPORTATION_TYPE_LABELS` — restrict Part C labels

Add a new const for Part C (do not modify the existing one which is used for display):
```typescript
// Subset used by Part C approval form (secretary cannot assign PARENT_TRANSPORT)
export const PART_C_TRANSPORTATION_TYPE_LABELS: Partial<Record<TransportationType, string>> = {
  DISTRICT_BUS: 'District Buses',
  CHARTER:      'Charter Buses',
  WALKING:      'Walking',
};
```

### 7b. Part C Form Component

**File:** `c:\Tech-V2\frontend\src\components\fieldtrip\TransportationPartCForm.tsx`

#### New state variables (add after existing `useState` declarations, ~line 82):
```typescript
const [transportationBusCount, setTransportationBusCount] = useState<string>('');
const [driverNames, setDriverNames]                       = useState<string[]>([]);
```

#### Dynamic driver names: sync array with bus count on change

Add a handler that grows/shrinks `driverNames` when `transportationBusCount` changes:
```typescript
const handleBusCountChange = (value: string) => {
  setTransportationBusCount(value);
  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 1 && n <= 99) {
    setDriverNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push('');
      next.length = n;
      return next;
    });
  } else {
    setDriverNames([]);
  }
};

const handleDriverNameChange = (index: number, value: string) => {
  setDriverNames((prev) => {
    const next = [...prev];
    next[index] = value;
    return next;
  });
};
```

#### Condition for showing bus-related fields:
```typescript
const isBusTrip =
  transportationType === 'DISTRICT_BUS' || transportationType === 'CHARTER';
```

#### Update `handleApprove` to pass new fields in DTO (~line 96):
```typescript
const dto: ApproveTransportationDto = {
  transportationType:     transportationType as TransportationType,
  transportationCost:     transportationCost ? parseFloat(transportationCost) : null,
  transportationBusCount: isBusTrip && transportationBusCount
    ? parseInt(transportationBusCount, 10)
    : null,
  driverNames: isBusTrip && driverNames.length > 0
    ? driverNames
    : null,
  notes: notes.trim() || null,
};
```

#### Update the `TRANSPORTATION_TYPE_LABELS` import to also import `PART_C_TRANSPORTATION_TYPE_LABELS`:
```typescript
import {
  TRANSPORTATION_STATUS_LABELS as STATUS_LABELS,
  TRANSPORTATION_STATUS_COLORS,
  TRANSPORTATION_TYPE_LABELS,
  PART_C_TRANSPORTATION_TYPE_LABELS,
} from '../../types/fieldTrip.types';
```

#### Replace the `RadioGroup` entries to use `PART_C_TRANSPORTATION_TYPE_LABELS` (~line 308):
```tsx
<RadioGroup
  value={transportationType}
  onChange={(e) => setTransportationType(e.target.value as TransportationType)}
>
  {(Object.entries(PART_C_TRANSPORTATION_TYPE_LABELS) as [TransportationType, string][]).map(
    ([value, label]) => (
      <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
    ),
  )}
</RadioGroup>
```

#### New form fields — insert after the Transportation Cost `<Grid>` item (~line 325 in JSX):

```tsx
{/* Number of Buses — only for District/Charter */}
{isBusTrip && (
  <Grid size={{ xs: 12, sm: 6 }}>
    <TextField
      fullWidth
      required
      label="Number of Buses"
      type="number"
      value={transportationBusCount}
      onChange={(e) => handleBusCountChange(e.target.value)}
      inputProps={{ min: 1, max: 99, step: 1 }}
    />
  </Grid>
)}

{/* Driver Names — one per bus */}
{isBusTrip && driverNames.length > 0 && (
  <Grid size={{ xs: 12 }}>
    <Typography variant="subtitle2" gutterBottom>
      Driver Names
    </Typography>
    <Grid container spacing={2}>
      {driverNames.map((name, idx) => (
        <Grid key={idx} size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            fullWidth
            label={`Bus ${idx + 1} Driver`}
            value={name}
            onChange={(e) => handleDriverNameChange(idx, e.target.value)}
            inputProps={{ maxLength: 200 }}
          />
        </Grid>
      ))}
    </Grid>
  </Grid>
)}
```

#### Add `isBusTrip` validation gate in `handleApprove`:
```typescript
if (isBusTrip && !transportationBusCount) {
  setError('Please enter the number of buses.');
  return;
}
```

#### Update the Approved result `<Alert>` to display new fields (~line 265):
```tsx
{transport.status === 'TRANSPORTATION_APPROVED' && (
  <Alert severity="success" sx={{ mb: 3 }}>
    <strong>Transportation Approved</strong>
    {transport.transportationType && (
      <> — {TRANSPORTATION_TYPE_LABELS[transport.transportationType]}</>
    )}
    {transport.transportationCost != null && (
      <> — Estimated cost: ${Number(transport.transportationCost).toFixed(2)}</>
    )}
    {transport.transportationBusCount != null && (
      <><br />Buses: {transport.transportationBusCount}</>
    )}
    {transport.driverNames?.length ? (
      <><br />Drivers: {transport.driverNames.join(', ')}</>
    ) : null}
    {transport.transportationNotes && (
      <><br />{transport.transportationNotes}</>
    )}
    {transport.approvedBy && (
      <><br />Approved by {transport.approvedBy.displayName ?? `${transport.approvedBy.firstName} ${transport.approvedBy.lastName}`}</>
    )}
  </Alert>
)}
```

---

## 8. File Change Summary

| File | Change | Approx. Line(s) |
|---|---|---|
| `backend/prisma/schema.prisma` | Add `transportationBusCount Int?` and `driverNames Json?` inside `FieldTripTransportationRequest` | ~661 |
| `backend/prisma/migrations/20260505120000_add_transportation_part_c_bus_and_drivers/migration.sql` | **New file** — `ALTER TABLE ... ADD COLUMN` | — |
| `backend/src/validators/fieldTripTransportation.validators.ts` | Add `PART_C_TRANSPORTATION_TYPES` const; extend `ApproveTransportationSchema` with `transportationBusCount`, `driverNames`, and refine check | ~27, ~72 |
| `backend/src/services/fieldTripTransportation.service.ts` | Add `transportationBusCount` and `driverNames` to `approve()` Prisma `data:` block | ~308 |
| `backend/src/services/email.service.ts` | Add `transportationBusCount` and `driverNames` params to `sendTransportationApproved`; add rows to HTML table | ~693, ~724 |
| `backend/src/controllers/fieldTripTransportation.controller.ts` | Pass `transportationBusCount` and `driverNames` in `sendTransportationApproved` call | ~178 |
| `frontend/src/types/fieldTrip.types.ts` | Add fields to `FieldTripTransportationRequest`, `ApproveTransportationDto`; add `PART_C_TRANSPORTATION_TYPE_LABELS` | ~252, ~305, ~360 |
| `frontend/src/components/fieldtrip/TransportationPartCForm.tsx` | New state, `handleBusCountChange`, `handleDriverNameChange`, `isBusTrip` flag, new JSX fields, updated DTO, updated Approved alert | ~82, ~96, ~280, ~308, ~325, ~265 |

---

## 9. No-Change Items

- **`TRANSPORTATION_TYPES`** const in the validators — keep all 4 values for existing data reads; no DB enum migration needed.
- **`transportationCost`** — field already exists in schema, validator, service, email, and frontend. The label "Estimated Cost" vs "Assessed Cost" is cosmetic; only `label` prop on the `TextField` needs updating in the form (minor UI-only change, no structural impact).
- **Denial flow** — no changes needed; denial does not collect bus/driver data.
- **`busCount` (Part A)** — untouched; remains the submitter's requested count.

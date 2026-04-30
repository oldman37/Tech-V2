# Field Trip Wizard — Step 3 "Costs & Additional Details" Enhancement Specification

> **Author:** SubAgent (Research Phase)
> **Date:** 2026-04-30
> **Project:** Tech-V2 — Tech Department Management System
> **Status:** DRAFT — Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State of Step 3](#2-current-state-of-step-3)
3. [Wizard Architecture](#3-wizard-architecture)
4. [Form Library & State Management](#4-form-library--state-management)
5. [Dynamic List Pattern](#5-dynamic-list-pattern)
6. [9 New Fields — Implementation Details](#6-9-new-fields--implementation-details)
7. [TypeScript Interfaces to Update](#7-typescript-interfaces-to-update)
8. [Zod Validator Updates](#8-zod-validator-updates)
9. [Prisma Schema Changes](#9-prisma-schema-changes)
10. [Backend Routes (No New Routes)](#10-backend-routes-no-new-routes)
11. [Frontend Files to Change](#11-frontend-files-to-change)
12. [FieldTripDetailPage Display](#12-fieldtripdetailpage-display)
13. [Security Considerations](#13-security-considerations)
14. [Migration Steps in Order](#14-migration-steps-in-order)

---

## 1. Overview

The field trip wizard lives in a **single-file component**:

```
frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx
```

It is a 3-step MUI `Stepper` (`activeStep` 0/1/2). Step 2 (`activeStep === 2`) is labelled **"Costs & Additional Details"**. Currently it has 6 fields. This spec adds 9 new fields to that step and the data layer that backs them.

---

## 2. Current State of Step 3

### Step label
```typescript
const STEPS = ['Trip Information', 'Transportation', 'Costs & Additional Details'];
// Step 3 = index 2 (activeStep === 2)
```

### Current fields rendered at `activeStep === 2`

| # | Label | Type | Required | `FormState` key |
|---|-------|------|----------|-----------------|
| 1 | Cost Per Student | `number` TextField with `$` adornment | ✅ | `costPerStudent` (string) |
| 2 | Total Cost | `number` TextField with `$` adornment | ✅ | `totalCost` (string) |
| 3 | Funding Source / Account Number | text TextField | ✅ | `fundingSource` |
| 4 | Chaperone Names & Contact Information | multiline TextField (`minRows={3}`) | ✅ | `chaperoneInfo` |
| 5 | Emergency Contact | text TextField | ✅ | `emergencyContact` |
| 6 | Additional Notes | multiline TextField (`minRows={3}`) | ✅ | `additionalNotes` |

### Current Step 2 validation (`validateStep(2, form)`)
```typescript
if (step === 2) {
  // costPerStudent: required, ≥ 0
  // totalCost: required, ≥ 0
  // fundingSource: required non-empty
  // chaperoneInfo: required non-empty
  // emergencyContact: required non-empty
  // additionalNotes: required non-empty
}
```

---

## 3. Wizard Architecture

### File: `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`

Key architectural facts:
- **No routing between steps** — all three steps render in the same component/page
- Steps are gated by `activeStep` state (`useState<number>`)
- Step navigation via `handleNext()` / `handleBack()` — Step 1 is **skipped** if `!form.transportationNeeded`
- Draft auto-save: `handleSaveDraft()` saves the entire flat `FormState` to the API via `formToDto(form)`
- Final submit: `handleSubmit()` validates all 3 steps, saves, then calls `fieldTripService.submit(id)`
- Load from URL param `id`: `useParams<{ id?: string }>()` → pre-populates via `tripToFormState(existingTrip)`
- `isReadOnly` = true when `existingTrip.status !== 'DRAFT'`

### Stepper skip logic
```typescript
// handleNext:
if (activeStep === 0 && !form.transportationNeeded) setActiveStep(2);
else setActiveStep((s) => s + 1);

// handleBack:
if (activeStep === 2 && !form.transportationNeeded) setActiveStep(0);
else setActiveStep((s) => s - 1);
```

---

## 4. Form Library & State Management

### Form library
**None.** The form uses plain React `useState`. No React Hook Form, no Formik.

```typescript
const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, teacherName: user?.name ?? '' });
const [errors, setErrors] = useState<FieldErrors>({});
```

### Change handler pattern
```typescript
const handleChange = (
  field: keyof FormState,
  value: string | boolean | Array<{...}>
) => {
  setForm((prev) => ({ ...prev, [field]: value } as FormState));
  setErrors((prev) => ({ ...prev, [field]: undefined }));
};
```

### Validation
```typescript
type FieldErrors = Partial<Record<keyof FormState, string>>;

function validateStep(step: number, form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  // ... per-step checks
  return errors;
}
```

### API / Server state
- **TanStack Query** (`@tanstack/react-query`) for server state
- `useMutation` for create/update/submit
- `useQuery` to load existing draft by id

### Auth store
```typescript
import { useAuthStore } from '../../store/authStore'; // Zustand
const { user } = useAuthStore();
```

---

## 5. Dynamic List Pattern

The existing "Additional Stops / Breaks" list in **Step 1 (Transportation)** is the established pattern to follow for the new chaperone dynamic list.

### Pattern summary

**1. FormState entry**
```typescript
transportAdditionalDests: Array<{ name: string; arriveTime: string; leaveTime: string }>;
```

**2. EMPTY_FORM default**
```typescript
transportAdditionalDests: [],
```

**3. Limit check before showing "Add" button**
```typescript
{!isReadOnly && form.transportAdditionalDests.length < 10 && (
  <Button onClick={() => handleChange('transportAdditionalDests',
    [...form.transportAdditionalDests, { name: '', arriveTime: '', leaveTime: '' }]
  )}>
    + Add Stop / Break
  </Button>
)}
```

**4. Render each row**
```typescript
{form.transportAdditionalDests.map((stop, idx) => (
  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <TextField
      value={stop.name}
      onChange={(e) => {
        const updated = [...form.transportAdditionalDests];
        updated[idx] = { ...updated[idx], name: e.target.value };
        handleChange('transportAdditionalDests', updated);
      }}
    />
    {!isReadOnly && (
      <Button color="error" onClick={() =>
        handleChange('transportAdditionalDests',
          form.transportAdditionalDests.filter((_, i) => i !== idx)
        )
      }>Remove</Button>
    )}
  </Box>
))}
```

**Apply this exact pattern to the new `chaperones` array field (Field 5 below).**

---

## 6. 9 New Fields — Implementation Details

### Field ordering in Step 3 (complete step after adding new fields)

The new Step 3 should render in this order:

1. **Rain Alternate Date** *(new)*
2. **Number of Substitutes Needed** *(new)*
3. **Parental Permission Forms Received** *(new)*
4. **Plans for Students Not Going** *(new)*
5. **Chaperone List** *(replaces existing `chaperoneInfo` textarea)*
6. **Emergency Contact** *(existing, unchanged)*
7. **Regular Classroom Instructional Time Missed** *(new)*
8. **Funding Source / Account Number** *(existing, keep as-is)*
9. **Cost Per Student** *(existing, unchanged)*
10. **Total Cost** *(existing, unchanged)*
11. **Reimbursement Expenses** *(new)*
12. **Overnight Safety Precautions** *(new — conditional on `isOvernightTrip`)*
13. **Additional Notes** *(existing, keep as-is)*

> **Note:** `chaperoneInfo` (free-text string) is **replaced** by the structured `chaperones` dynamic list. The old `chaperoneInfo` field remains in the DB (nullable) for backward compatibility on existing records, but the new form uses `chaperones` (JSON). See DB section.

---

### Field 1: Rain Alternate Date

| Property | Value |
|----------|-------|
| FormState key | `rainAlternateDate: string` |
| Input type | `<TextField type="date">` with `InputLabelProps={{ shrink: true }}` (matches existing `returnDate` date fields) |
| Required | No |
| Validation | If provided, must be a valid date after `tripDate` |
| DB column | `rainAlternateDate DateTime?` |
| DTO field | `rainAlternateDate?: string \| null` |
| Label | "Rain / Alternate Date (optional)" |
| Helper text | "If the trip may be rescheduled in case of bad weather, enter the backup date" |

**Validation logic to add to `validateStep(2, form)`:**
```typescript
if (form.rainAlternateDate && form.tripDate) {
  const rain = new Date(form.rainAlternateDate + 'T00:00:00');
  const trip = new Date(form.tripDate + 'T00:00:00');
  if (rain <= trip) errors.rainAlternateDate = 'Alternate date must be after the trip date';
}
```

**`formToDto` mapping:**
```typescript
rainAlternateDate: form.rainAlternateDate
  ? new Date(form.rainAlternateDate + 'T12:00:00').toISOString()
  : null,
```

---

### Field 2: Number of Substitutes Needed

| Property | Value |
|----------|-------|
| FormState key | `substituteCount: string` (string like all other number fields, parsed to int on submit) |
| Input type | `<TextField type="number" inputProps={{ min: 0, max: 50 }}>` |
| Required | Yes |
| Validation | Integer 0–50 |
| DB column | `substituteCount Int?` |
| DTO field | `substituteCount?: number \| null` |
| Label | "Number of Substitutes Needed" |
| Helper text | "Enter 0 if no substitutes are required" |

**Validation logic:**
```typescript
const subs = parseInt(form.substituteCount, 10);
if (form.substituteCount === '' || isNaN(subs) || subs < 0 || subs > 50)
  errors.substituteCount = 'Enter a number between 0 and 50';
```

**`formToDto` mapping:**
```typescript
substituteCount: parseInt(form.substituteCount, 10),
```

**`EMPTY_FORM` default:** `substituteCount: '0'`

---

### Field 3: Parental Permission Forms Received

| Property | Value |
|----------|-------|
| FormState key | `parentalPermissionReceived: boolean` |
| Input type | `<RadioGroup row>` with Yes / No (same pattern as `isOvernightTrip` radio) |
| Required | Yes (must explicitly choose) |
| Validation | None beyond required — it's a boolean, default `false` = "No" |
| DB column | `parentalPermissionReceived Boolean @default(false)` |
| DTO field | `parentalPermissionReceived: boolean` |
| Label | "Have parental permission forms been received from all participating students?" |

**Validation logic:**
```typescript
// No extra validation needed since it's always true or false (default false = No is valid answer)
```

**`EMPTY_FORM` default:** `parentalPermissionReceived: false`

**Render pattern (matches `isOvernightTrip`):**
```tsx
<FormControl component="fieldset" disabled={isReadOnly}>
  <FormLabel component="legend" sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
    Have parental permission forms been received from all participating students?
  </FormLabel>
  <RadioGroup
    row
    value={form.parentalPermissionReceived ? 'yes' : 'no'}
    onChange={(e) => handleChange('parentalPermissionReceived', e.target.value === 'yes')}
  >
    <FormControlLabel value="yes" control={<Radio />} label="Yes" />
    <FormControlLabel value="no"  control={<Radio />} label="No"  />
  </RadioGroup>
</FormControl>
```

---

### Field 4: Plans for Students Not Going

| Property | Value |
|----------|-------|
| FormState key | `plansForNonParticipants: string` |
| Input type | `<TextField multiline minRows={3}>` |
| Required | Yes |
| Validation | Non-empty, max 2000 chars |
| DB column | `plansForNonParticipants String? @db.Text` |
| DTO field | `plansForNonParticipants: string` |
| Label | "Plans for Students Not Attending This Trip" |
| Helper text | "Describe what non-participating students will be doing during the trip" |

**Validation logic:**
```typescript
if (!form.plansForNonParticipants.trim())
  errors.plansForNonParticipants = 'Plans for non-participating students are required';
```

---

### Field 5: Chaperone List (Dynamic — replaces `chaperoneInfo`)

This is the most complex new field. It **replaces** `chaperoneInfo` (the existing free-text textarea) with a structured dynamic list.

#### Type definition
```typescript
export interface ChaperoneEntry {
  name:                 string;
  backgroundCheckComplete: boolean;
}
```

#### FormState key
```typescript
chaperones: ChaperoneEntry[];
```

#### EMPTY_FORM default
```typescript
chaperones: [],
```

#### Validation logic
```typescript
if (form.chaperones.length === 0)
  errors.chaperones = 'At least one chaperone is required';
if (form.chaperones.some(c => !c.name.trim()))
  errors.chaperones = 'All chaperone entries must have a name';
```

#### DB storage
The `chaperones` data is stored as **JSON** in the DB:
```prisma
chaperones Json? // Array of { name: string, backgroundCheckComplete: boolean }
```

> The old `chaperoneInfo String? @db.Text` column is **kept** (nullable, not required) for records created before this migration. New records write to `chaperones` JSON; `chaperoneInfo` will be `null` for new records.

#### DTO field
```typescript
chaperones?: { name: string; backgroundCheckComplete: boolean }[] | null;
```

#### Render pattern (follow `transportAdditionalDests` exactly)
```tsx
<Grid size={12}>
  <Typography variant="subtitle2" gutterBottom>
    Chaperones
    <Box component="span" sx={{ color: 'error.main' }}> *</Box>
  </Typography>
  {errors.chaperones && (
    <FormHelperText error sx={{ mb: 1 }}>{errors.chaperones}</FormHelperText>
  )}
  {form.chaperones.map((chaperone, idx) => (
    <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        label={`Chaperone ${idx + 1} Name`}
        value={chaperone.name}
        onChange={(e) => {
          const updated = [...form.chaperones];
          updated[idx] = { ...updated[idx], name: e.target.value };
          handleChange('chaperones', updated);
        }}
        size="small"
        sx={{ flex: 2, minWidth: 200 }}
        disabled={isReadOnly}
        required
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={chaperone.backgroundCheckComplete}
            onChange={(e) => {
              const updated = [...form.chaperones];
              updated[idx] = { ...updated[idx], backgroundCheckComplete: e.target.checked };
              handleChange('chaperones', updated);
            }}
            disabled={isReadOnly}
          />
        }
        label="Background Check Complete"
      />
      {!isReadOnly && (
        <Button
          size="small"
          color="error"
          onClick={() => handleChange('chaperones', form.chaperones.filter((_, i) => i !== idx))}
        >
          Remove
        </Button>
      )}
    </Box>
  ))}
  {!isReadOnly && form.chaperones.length < 20 && (
    <Button
      size="small"
      variant="outlined"
      onClick={() =>
        handleChange('chaperones', [
          ...form.chaperones,
          { name: '', backgroundCheckComplete: false },
        ])
      }
    >
      + Add Chaperone
    </Button>
  )}
</Grid>
```

**Additional import needed:** `Checkbox` from `@mui/material`

#### `formToDto` mapping
```typescript
chaperones: form.chaperones.filter(c => c.name.trim()).map(c => ({
  name: c.name.trim(),
  backgroundCheckComplete: c.backgroundCheckComplete,
})),
```

#### `tripToFormState` mapping (load from existing record)
```typescript
chaperones: Array.isArray(trip.chaperones)
  ? (trip.chaperones as ChaperoneEntry[])
  : [],
```

---

### Field 6: Regular Classroom Instructional Time Missed

| Property | Value |
|----------|-------|
| FormState key | `instructionalTimeMissed: string` |
| Input type | `<TextField>` (plain text — can be "2 periods", "3 hours", "Half day") |
| Required | Yes |
| Validation | Non-empty, max 200 chars |
| DB column | `instructionalTimeMissed String? @db.VarChar(200)` |
| DTO field | `instructionalTimeMissed: string` |
| Label | "Regular Classroom Instructional Time Missed" |
| Helper text | "e.g. 2 class periods, 3 hours, half day" |

**Validation logic:**
```typescript
if (!form.instructionalTimeMissed.trim())
  errors.instructionalTimeMissed = 'Instructional time missed is required';
```

---

### Field 7: Funding Source

**Already exists.** The `fundingSource` field (text TextField, required) is unchanged. No implementation needed. Keep it in the render order at its current position.

---

### Field 8: Reimbursement Expenses (Multi-Select)

| Property | Value |
|----------|-------|
| FormState key | `reimbursementExpenses: string[]` |
| Input type | MUI `<Select multiple>` with `renderValue` showing comma-joined labels |
| Options | `['Registration', 'Meals', 'Mileage', 'Lodging', 'Other']` |
| Required | No |
| Validation | None (optional) |
| DB column | `reimbursementExpenses String[] @default([])` (PostgreSQL text array) |
| DTO field | `reimbursementExpenses?: string[]` |
| Label | "Reimbursement Expenses Requested" |
| Helper text for Lodging | Show inline alert when 'Lodging' is selected: *"If requesting lodging reimbursement, please email hotel information to the Finance office."* |

**`EMPTY_FORM` default:** `reimbursementExpenses: []`

**Render pattern:**
```tsx
const REIMBURSEMENT_OPTIONS = ['Registration', 'Meals', 'Mileage', 'Lodging', 'Other'];

<Grid size={12}>
  <FormControl fullWidth disabled={isReadOnly}>
    <InputLabel id="reimbursement-label">Reimbursement Expenses Requested</InputLabel>
    <Select
      labelId="reimbursement-label"
      label="Reimbursement Expenses Requested"
      multiple
      value={form.reimbursementExpenses}
      onChange={(e) => handleChange('reimbursementExpenses',
        typeof e.target.value === 'string'
          ? e.target.value.split(',')
          : e.target.value as string[]
      )}
      renderValue={(selected) => (selected as string[]).join(', ')}
    >
      {REIMBURSEMENT_OPTIONS.map((opt) => (
        <MenuItem key={opt} value={opt}>
          <Checkbox checked={form.reimbursementExpenses.includes(opt)} />
          <ListItemText primary={opt} />
        </MenuItem>
      ))}
    </Select>
  </FormControl>
  {form.reimbursementExpenses.includes('Lodging') && (
    <Alert severity="info" sx={{ mt: 1 }}>
      If requesting lodging reimbursement, please email hotel information to the Finance office.
    </Alert>
  )}
</Grid>
```

**Additional imports needed:** `ListItemText` from `@mui/material`

**`formToDto` mapping:**
```typescript
reimbursementExpenses: form.reimbursementExpenses,
```

**Zod validation:**
```typescript
reimbursementExpenses: z.array(
  z.enum(['Registration', 'Meals', 'Mileage', 'Lodging', 'Other'])
).optional().default([]),
```

---

### Field 9: Overnight Trip Safety Precautions

| Property | Value |
|----------|-------|
| FormState key | `overnightSafetyPrecautions: string` |
| Input type | `<TextField multiline minRows={3}>` |
| Visibility | **Only shown** when `form.isOvernightTrip === true` (conditional render, same pattern as `returnDate`) |
| Required | Yes **if** `isOvernightTrip === true` |
| Validation | If overnight, non-empty required, max 3000 chars |
| DB column | `overnightSafetyPrecautions String? @db.Text` |
| DTO field | `overnightSafetyPrecautions?: string \| null` |
| Label | "Overnight Trip Safety Precautions" |
| Helper text | "Describe safety precautions, supervision plan, and emergency procedures for the overnight portion" |

**Validation logic:**
```typescript
if (form.isOvernightTrip && !form.overnightSafetyPrecautions.trim())
  errors.overnightSafetyPrecautions = 'Safety precautions are required for overnight trips';
```

**Conditional render:**
```tsx
{form.isOvernightTrip && (
  <Grid size={12}>
    <TextField
      fullWidth
      multiline
      minRows={3}
      label="Overnight Trip Safety Precautions"
      value={form.overnightSafetyPrecautions}
      onChange={(e) => handleChange('overnightSafetyPrecautions', e.target.value)}
      error={!!errors.overnightSafetyPrecautions}
      helperText={errors.overnightSafetyPrecautions ?? 'Describe safety precautions, supervision plan, and emergency procedures for the overnight portion'}
      disabled={isReadOnly}
      required
    />
  </Grid>
)}
```

**`EMPTY_FORM` default:** `overnightSafetyPrecautions: ''`

---

## 7. TypeScript Interfaces to Update

### File: `frontend/src/types/fieldTrip.types.ts`

#### A. New `ChaperoneEntry` interface — add near top of file
```typescript
export interface ChaperoneEntry {
  name:                    string;
  backgroundCheckComplete: boolean;
}
```

#### B. `FieldTripRequest` interface — add these fields to the "Form fields" section
```typescript
// New Step 3 fields
rainAlternateDate?:          string | null;
substituteCount?:            number | null;
parentalPermissionReceived?: boolean;
plansForNonParticipants?:    string | null;
chaperones?:                 ChaperoneEntry[] | null;
instructionalTimeMissed?:    string | null;
reimbursementExpenses?:      string[];
overnightSafetyPrecautions?: string | null;
```

#### C. `CreateFieldTripDto` interface — add these fields
```typescript
// New Step 3 fields
rainAlternateDate?:          string | null;
substituteCount:             number;
parentalPermissionReceived:  boolean;
plansForNonParticipants:     string;
chaperones:                  ChaperoneEntry[];
instructionalTimeMissed:     string;
reimbursementExpenses?:      string[];
overnightSafetyPrecautions?: string | null;
```

---

## 8. Zod Validator Updates

### File: `backend/src/validators/fieldTrip.validators.ts`

#### Add to `FieldTripBodyShape` object
```typescript
rainAlternateDate: z
  .string()
  .nullable()
  .optional()
  .refine(
    (val) => !val || !isNaN(Date.parse(val)),
    'Rain alternate date must be a valid date',
  ),
substituteCount: z
  .number()
  .int('Number of substitutes must be a whole number')
  .min(0, 'Number of substitutes must be 0 or greater')
  .max(50, 'Number of substitutes must be 50 or less'),
parentalPermissionReceived: z.boolean(),
plansForNonParticipants: z
  .string()
  .min(1, 'Plans for non-participating students are required')
  .max(2000, 'Plans for non-participating students must be 2000 characters or less'),
chaperones: z
  .array(
    z.object({
      name: z
        .string()
        .min(1, 'Chaperone name is required')
        .max(200, 'Chaperone name must be 200 characters or less'),
      backgroundCheckComplete: z.boolean(),
    }),
  )
  .min(1, 'At least one chaperone is required'),
instructionalTimeMissed: z
  .string()
  .min(1, 'Instructional time missed is required')
  .max(200, 'Instructional time missed must be 200 characters or less'),
reimbursementExpenses: z
  .array(z.enum(['Registration', 'Meals', 'Mileage', 'Lodging', 'Other']))
  .optional()
  .default([]),
overnightSafetyPrecautions: z
  .string()
  .max(3000, 'Overnight safety precautions must be 3000 characters or less')
  .nullable()
  .optional(),
```

#### Add cross-field refinement to `CreateFieldTripSchema` (alongside existing transportation refinement)
```typescript
.refine(
  (data) => !data.isOvernightTrip || (data.overnightSafetyPrecautions && data.overnightSafetyPrecautions.trim().length > 0),
  {
    message: 'Overnight safety precautions are required for overnight trips',
    path: ['overnightSafetyPrecautions'],
  },
)
```

---

## 9. Prisma Schema Changes

### File: `backend/prisma/schema.prisma`

Add to `model FieldTripRequest`, within the "Form Fields" section, **after** `alternateTransportation`:

```prisma
  // Step 3 — Costs & Additional Details (new fields)
  rainAlternateDate            DateTime?
  substituteCount              Int?
  parentalPermissionReceived   Boolean                 @default(false)
  plansForNonParticipants      String?                 @db.Text
  chaperones                   Json?                   // Array of { name: string, backgroundCheckComplete: boolean }
  instructionalTimeMissed      String?                 @db.VarChar(200)
  reimbursementExpenses        String[]                @default([])
  overnightSafetyPrecautions   String?                 @db.Text
```

> **Backward compatibility:** The existing `chaperoneInfo String? @db.Text` column stays in the schema. New records will have `chaperoneInfo = null` and `chaperones = [...]`. Old records have `chaperoneInfo` populated and `chaperones = null`.

### Migration command
```bash
cd backend
npx prisma migrate dev --name add_field_trip_step3_fields
```

---

## 10. Backend Routes (No New Routes)

No new routes are needed. The existing `PUT /api/field-trips/:id` (`UpdateFieldTripSchema`) and `POST /api/field-trips` (`CreateFieldTripSchema`) handle all new fields once the validators are updated.

### Existing routes (no changes to route file)
```
POST   /api/field-trips                    → create (Level 2+)
PUT    /api/field-trips/:id                → update draft (Level 2+, own record)
POST   /api/field-trips/:id/submit         → submit for approval (Level 2+)
GET    /api/field-trips/:id                → get detail (Level 2+)
GET    /api/field-trips/my-requests        → list own (Level 2+)
```

All routes already have:
- `authenticate` middleware (JWT validation)
- `validateCsrfToken` middleware
- `requireModule('FIELD_TRIPS', 2)` permission check
- Zod `validateRequest` middleware

---

## 11. Frontend Files to Change

### Primary file: `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`

**Changes required:**

1. **Imports** — add `Checkbox`, `ListItemText`, `Alert` to the MUI import list (check which are already imported; `Alert` is already present)

2. **`ChaperoneEntry` type** — import from `fieldTrip.types.ts` or define locally (prefer importing)

3. **`REIMBURSEMENT_OPTIONS` constant** — add near other constants at top of file
   ```typescript
   const REIMBURSEMENT_OPTIONS = ['Registration', 'Meals', 'Mileage', 'Lodging', 'Other'] as const;
   ```

4. **`FormState` interface** — add 8 new fields:
   ```typescript
   rainAlternateDate:           string;
   substituteCount:             string;
   parentalPermissionReceived:  boolean;
   plansForNonParticipants:     string;
   chaperones:                  ChaperoneEntry[];
   instructionalTimeMissed:     string;
   reimbursementExpenses:       string[];
   overnightSafetyPrecautions:  string;
   ```

5. **`EMPTY_FORM`** — add defaults for 8 new fields:
   ```typescript
   rainAlternateDate:           '',
   substituteCount:             '0',
   parentalPermissionReceived:  false,
   plansForNonParticipants:     '',
   chaperones:                  [],
   instructionalTimeMissed:     '',
   reimbursementExpenses:       [],
   overnightSafetyPrecautions:  '',
   ```

6. **`tripToFormState(trip)`** — add mappings:
   ```typescript
   rainAlternateDate:           trip.rainAlternateDate ? trip.rainAlternateDate.slice(0, 10) : '',
   substituteCount:             trip.substituteCount != null ? String(trip.substituteCount) : '0',
   parentalPermissionReceived:  trip.parentalPermissionReceived ?? false,
   plansForNonParticipants:     trip.plansForNonParticipants ?? '',
   chaperones:                  Array.isArray(trip.chaperones) ? trip.chaperones as ChaperoneEntry[] : [],
   instructionalTimeMissed:     trip.instructionalTimeMissed ?? '',
   reimbursementExpenses:       trip.reimbursementExpenses ?? [],
   overnightSafetyPrecautions:  trip.overnightSafetyPrecautions ?? '',
   ```

7. **`formToDto(form)`** — add mappings:
   ```typescript
   rainAlternateDate:           form.rainAlternateDate
                                  ? new Date(form.rainAlternateDate + 'T12:00:00').toISOString()
                                  : null,
   substituteCount:             parseInt(form.substituteCount, 10),
   parentalPermissionReceived:  form.parentalPermissionReceived,
   plansForNonParticipants:     form.plansForNonParticipants.trim(),
   chaperones:                  form.chaperones
                                  .filter(c => c.name.trim())
                                  .map(c => ({ name: c.name.trim(), backgroundCheckComplete: c.backgroundCheckComplete })),
   instructionalTimeMissed:     form.instructionalTimeMissed.trim(),
   reimbursementExpenses:       form.reimbursementExpenses,
   overnightSafetyPrecautions:  form.isOvernightTrip
                                  ? (form.overnightSafetyPrecautions.trim() || null)
                                  : null,
   ```

8. **`validateStep(2, form)`** — add validation for new fields:
   ```typescript
   // Field 1: Rain Alternate Date
   if (form.rainAlternateDate && form.tripDate) {
     const rain = new Date(form.rainAlternateDate + 'T00:00:00');
     const trip = new Date(form.tripDate + 'T00:00:00');
     if (rain <= trip) errors.rainAlternateDate = 'Alternate date must be after the trip date';
   }
   // Field 2: Substitutes
   const subs = parseInt(form.substituteCount, 10);
   if (form.substituteCount === '' || isNaN(subs) || subs < 0 || subs > 50)
     errors.substituteCount = 'Enter a number between 0 and 50';
   // Field 4: Plans for non-participants
   if (!form.plansForNonParticipants.trim())
     errors.plansForNonParticipants = 'Plans for non-participating students are required';
   // Field 5: Chaperones
   if (form.chaperones.length === 0)
     errors.chaperones = 'At least one chaperone is required';
   else if (form.chaperones.some(c => !c.name.trim()))
     errors.chaperones = 'All chaperone entries must have a name';
   // Field 6: Instructional time missed
   if (!form.instructionalTimeMissed.trim())
     errors.instructionalTimeMissed = 'Instructional time missed is required';
   // Field 9: Overnight safety precautions
   if (form.isOvernightTrip && !form.overnightSafetyPrecautions.trim())
     errors.overnightSafetyPrecautions = 'Safety precautions are required for overnight trips';
   ```

9. **`handleChange` type signature** — update union type to include new array types:
   ```typescript
   const handleChange = (
     field: keyof FormState,
     value: string | boolean | ChaperoneEntry[] | string[]
       | Array<{ name: string; arriveTime: string; leaveTime: string }>
   ) => { ... }
   ```

10. **Step 3 JSX block** — replace the current `{activeStep === 2 && (...)}` block with the new field set (see ordering in Section 6)

### Secondary file: `frontend/src/types/fieldTrip.types.ts`

Add `ChaperoneEntry` interface; update `FieldTripRequest` and `CreateFieldTripDto` as detailed in Section 7.

### Secondary file: `backend/src/validators/fieldTrip.validators.ts`

Update `FieldTripBodyShape` and add refinement as detailed in Section 8.

### Secondary file: `backend/prisma/schema.prisma`

Add columns to `FieldTripRequest` model as detailed in Section 9.

---

## 12. FieldTripDetailPage Display

### File: `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`

After implementing the form changes, the detail page needs to display the new fields.

Read the current detail page to understand its rendering pattern (MUI `Grid` + `Typography` label/value pairs), then add display rows for:

- Rain Alternate Date (formatted date, or "N/A")  
- Number of Substitutes Needed  
- Parental Permission Forms Received (Yes/No chip)  
- Plans for Non-Participants  
- Chaperones (render as list with background check status indicator — use `CheckCircleIcon` / `CancelIcon` from existing imports)  
- Instructional Time Missed  
- Reimbursement Expenses (chips for each selected option)  
- Overnight Safety Precautions (if `isOvernightTrip`)  

The detail page does **not** require a separate spec entry — follow the established display pattern in the file.

---

## 13. Security Considerations

### Authentication
- All routes already use `authenticate` middleware (JWT from `Authorization: Bearer` header)
- JWT validated against Entra ID using the existing auth middleware
- `req.user` is typed and always present on authenticated endpoints

### Authorization
- `requireModule('FIELD_TRIPS', 2)` on POST/PUT (already in place)
- The controller enforces **ownership**: a submitter can only update their own DRAFT records
- Admins bypass module checks (existing `ADMIN` role handling in `requireModule`)

### CSRF
- `validateCsrfToken` middleware is already on all state-changing routes via `router.use(validateCsrfToken)`
- No new routes = no new CSRF setup needed

### Input validation
- All new fields are validated by Zod schemas before reaching controller logic
- `chaperones` is a JSON field — Zod validates the array shape before it is written to DB
- `reimbursementExpenses` is validated as `z.enum([...])` array — no free-text injection
- `rainAlternateDate` validated as ISO date string before `new Date()` construction
- Max length constraints mirror DB constraints (`VarChar(200)`, `@db.Text`)

### JSON field safety
- `chaperones` stored as Prisma `Json?` (PostgreSQL `jsonb`)
- Never directly interpolated into SQL (Prisma parameterizes all queries)
- Backend Zod schema validates the `chaperones` array structure before it reaches Prisma

### XSS
- All display text in MUI components is auto-escaped by React
- No `dangerouslySetInnerHTML` is used anywhere in the field trip pages

---

## 14. Migration Steps in Order

```
1. BACKEND — schema.prisma
   Add 8 new columns to FieldTripRequest model

2. BACKEND — prisma migrate
   npx prisma migrate dev --name add_field_trip_step3_fields

3. BACKEND — fieldTrip.validators.ts
   Add new fields to FieldTripBodyShape
   Add overnight safety precautions cross-field refinement

4. FRONTEND — fieldTrip.types.ts
   Add ChaperoneEntry interface
   Update FieldTripRequest with new nullable fields
   Update CreateFieldTripDto with new fields

5. FRONTEND — FieldTripRequestPage.tsx
   Add imports (Checkbox, ListItemText — Alert already imported)
   Add REIMBURSEMENT_OPTIONS constant
   Update FormState interface (8 new fields)
   Update EMPTY_FORM (8 new defaults)
   Update tripToFormState (8 new mappings)
   Update formToDto (8 new mappings)
   Update handleChange type signature
   Update validateStep(2, form) (new validation rules)
   Replace Step 3 JSX block with new field set

6. FRONTEND — FieldTripDetailPage.tsx
   Add display rows for 8 new fields

7. BUILD & TEST
   cd backend && npm run build
   cd frontend && npm run build
   Verify no TypeScript errors
   Manual smoke test: create/edit/submit a field trip through all 3 steps
```

---

## Appendix A: File Path Reference

| File | Purpose |
|------|---------|
| `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx` | Main wizard — all 3 steps |
| `frontend/src/types/fieldTrip.types.ts` | Frontend TypeScript types |
| `frontend/src/services/fieldTrip.service.ts` | API calls (no changes needed) |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | Read-only view — add display rows |
| `backend/src/validators/fieldTrip.validators.ts` | Zod schemas |
| `backend/src/controllers/fieldTrip.controller.ts` | HTTP handlers (no changes needed) |
| `backend/src/routes/fieldTrip.routes.ts` | Route registration (no changes needed) |
| `backend/prisma/schema.prisma` | Database model |

---

*End of specification.*

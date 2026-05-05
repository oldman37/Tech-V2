# Field Trip Form Enhancements — Specification

**Generated:** 2026-05-05  
**Scope:** Three targeted enhancements to `FieldTripRequestPage` and `FieldTripDetailPage`  
**Status:** Research Complete — Ready for Implementation

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Feature 1 — Google Maps Destination Autocomplete + Mileage](#2-feature-1--google-maps-destination-autocomplete--mileage-calculation)
3. [Feature 2 — Auto-Calculate Total Cost](#3-feature-2--auto-calculate-total-cost)
4. [Feature 3 — Hide Action Buttons After Approval](#4-feature-3--hide-approvedenysend-back-buttons-after-approved)
5. [Schema Changes](#5-schema-changes)
6. [Backend Changes](#6-backend-changes)
7. [Frontend Changes](#7-frontend-changes)
8. [Dependencies](#8-dependencies)
9. [Environment Variables](#9-environment-variables)
10. [Security Considerations](#10-security-considerations)
11. [Migration Plan](#11-migration-plan)
12. [Research References](#12-research-references)

---

## 1. Current State Analysis

### 1.1 Relevant Files

| File | Path | Purpose |
|------|------|---------|
| Request form | `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx` | Multi-step create/edit form |
| Detail page | `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | Read/view + action buttons |
| Frontend types | `frontend/src/types/fieldTrip.types.ts` | TypeScript interfaces |
| Prisma schema | `backend/prisma/schema.prisma` | `FieldTripRequest` model (~line 523) |
| Validators | `backend/src/validators/fieldTrip.validators.ts` | Zod schemas |
| Service | `backend/src/services/fieldTrip.service.ts` | Business logic |
| Controller | `backend/src/controllers/fieldTrip.controller.ts` | HTTP handlers |
| Routes | `backend/src/routes/fieldTrip.routes.ts` | Express routes + CSRF |

### 1.2 Form Architecture

`FieldTripRequestPage.tsx` uses **custom controlled-state management** — NOT React Hook Form despite `@hookform/resolvers` being in `package.json`. Key patterns:

- `FormState` interface with all form fields as strings/booleans/arrays (lines 103–152)
- `EMPTY_FORM` const as initial state (lines 154–202)
- `handleChange(field, value)` dispatcher updates `form` state and clears field-level errors
- Per-step validation in `validateStep(step, form)` called on Next/Submit
- `formToDto(form)` converts `FormState → CreateFieldTripDto` before API calls

### 1.3 Existing Destination Fields

| Schema column | Type | Form field key | Notes |
|---|---|---|---|
| `destination` | `VARCHAR(500) NOT NULL` | `form.destination` | Required — displayed text name |
| `destinationAddress` | `VARCHAR(500) NULL` | `form.destinationAddress` | Added in migration `20260430173011`; required by both frontend validation and backend validator |

Both fields are rendered in **Step 0 (Trip Information)** as plain `TextField` components (~line 802–833 of request page).

### 1.4 Existing Cost Fields

All cost fields live in **Step 2 (Costs & Additional Details)**:

| Schema column | Type | Form field key | Label |
|---|---|---|---|
| `costPerStudent` | `DECIMAL(10,2) NULL` | `form.costPerStudent` | "Cost Per Student" |
| `totalCost` | `DECIMAL(10,2) NULL` | `form.totalCost` | "Total Cost" |

Both are manually entered `TextField` with `type="number"`. Currently **no auto-calculation exists** — the user types both independently.

### 1.5 Status Values & Action Button Logic

Status enum (defined in `fieldTrip.validators.ts` and `fieldTrip.types.ts`):

```
DRAFT | PENDING_SUPERVISOR | PENDING_ASST_DIRECTOR | PENDING_DIRECTOR
| PENDING_FINANCE_DIRECTOR | APPROVED | DENIED | NEEDS_REVISION
```

In `FieldTripDetailPage.tsx` (~line 136–165):

```typescript
const PENDING_STATUSES = new Set([
  'PENDING_SUPERVISOR',
  'PENDING_ASST_DIRECTOR',
  'PENDING_DIRECTOR',
  'PENDING_FINANCE_DIRECTOR',
]);

const isPending       = PENDING_STATUSES.has(trip.status);
const isOwner         = trip.submittedById === user?.id;
const showActionButtons = isPending && !isOwner;
```

The Approve / Deny / Send Back buttons are rendered **only when `showActionButtons` is true** (conditional JSX, not disabled). Since `APPROVED` is not in `PENDING_STATUSES`, the buttons are already absent from the DOM for approved trips.

**Feature 3 is functionally satisfied by existing code.** The spec enhancement is to add an explicit, named guard so the intent is self-documenting and future-proof.

### 1.6 Google Maps — Nothing Exists

- `frontend/package.json` — no `@react-google-maps/api`, `use-places-autocomplete`, `@googlemaps/js-api-loader`, or similar packages installed.
- `frontend/.env.example` — no `VITE_GOOGLE_MAPS_API_KEY` variable.
- No origin address or district HQ address configured anywhere in the codebase.
- No `mileage`, `distance`, or `estimatedMileage` field in `FieldTripRequest` schema.

---

## 2. Feature 1 — Google Maps Destination Autocomplete + Mileage Calculation

### 2.1 Goal

Replace the two plain text fields ("Destination" and "Destination Address") with a single Google Places Autocomplete widget. When the user selects a place:
1. `form.destination` is populated with the **place name**.
2. `form.destinationAddress` is populated with the **formatted address**.
3. `form.estimatedMileage` is computed via the **Distance Matrix API** (driving, one-way from the configured origin to the place) and displayed as a read-only info badge.

### 2.2 Library Choice

Use **`@googlemaps/js-api-loader`** (official Google package) + the **Places library** loaded on demand. This avoids a large always-on bundle and plays well with Vite's tree-shaking.

Do **not** use `@react-google-maps/api` — it wraps map components which are not needed; the heavyweight dependency is unjustified for a simple autocomplete + distance call.

Install:

```bash
npm install @googlemaps/js-api-loader
npm install --save-dev @types/google.maps
```

### 2.3 Origin Address Strategy

Use a **configurable Vite env var** with a fallback constant:

```
VITE_TRIP_ORIGIN_ADDRESS="123 District Drive, City, State 12345"
```

In the component:

```typescript
const TRIP_ORIGIN = import.meta.env.VITE_TRIP_ORIGIN_ADDRESS ?? '123 District Drive, City, State 12345';
```

This lets the deployer override the address without a code change. The fallback should be replaced with the actual district HQ address at deployment time.

> The `VITE_` prefix is required for Vite to expose env vars to the browser bundle. **Never** put Google Maps keys in vars without `VITE_` prefix — they would be undefined at runtime.

### 2.4 New Schema Field

Add `estimatedMileage` to `FieldTripRequest`:

```prisma
estimatedMileage  Decimal?  @db.Decimal(8, 2)  // Driving mileage from district HQ to destination (auto-calculated at form time)
```

This stores the value at form-submission time as a snapshot. It is informational and is not re-calculated server-side.

### 2.5 API Loader Setup

Create a shared loader module:

**`frontend/src/lib/googleMaps.ts`**

```typescript
import { Loader } from '@googlemaps/js-api-loader';

let loaderPromise: Promise<typeof google> | null = null;

export function getGoogleMapsLoader(): Promise<typeof google> {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
      version: 'weekly',
      libraries: ['places'],
    });
    loaderPromise = loader.load();
  }
  return loaderPromise;
}
```

Loading is deferred until the component mounts and requested. The singleton pattern prevents redundant script injections.

### 2.6 Component: `DestinationAutocompleteField`

Create a new component:

**`frontend/src/components/fieldtrip/DestinationAutocompleteField.tsx`**

Props interface:

```typescript
interface DestinationAutocompleteFieldProps {
  destinationValue:     string;
  addressValue:         string;
  mileageValue:         string;  // '' | stringified number
  onPlaceSelected: (destination: string, address: string, mileage: string) => void;
  onDestinationChange:  (value: string) => void;
  onAddressChange:      (value: string) => void;
  destinationError?:    string;
  addressError?:        string;
  disabled?:            boolean;
}
```

Implementation outline:

```typescript
import { useEffect, useRef, useState } from 'react';
import { TextField, Box, Typography, CircularProgress } from '@mui/material';
import { getGoogleMapsLoader } from '../../lib/googleMaps';

const TRIP_ORIGIN = import.meta.env.VITE_TRIP_ORIGIN_ADDRESS ?? '';

export function DestinationAutocompleteField({ ... }: DestinationAutocompleteFieldProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | null = null;

    getGoogleMapsLoader().then((google) => {
      if (!inputRef.current) return;

      autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['establishment', 'geocode'],
        fields: ['name', 'formatted_address', 'geometry'],
      });

      autocomplete.addListener('place_changed', async () => {
        const place = autocomplete!.getPlace();
        if (!place.geometry?.location) return;

        const name    = place.name ?? '';
        const address = place.formatted_address ?? '';

        onDestinationChange(name);
        onAddressChange(address);

        // Calculate driving distance
        if (TRIP_ORIGIN) {
          setLoading(true);
          try {
            const service = new google.maps.DistanceMatrixService();
            const result  = await service.getDistanceMatrix({
              origins:      [TRIP_ORIGIN],
              destinations: [place.geometry.location],
              travelMode:   google.maps.TravelMode.DRIVING,
              unitSystem:   google.maps.UnitSystem.IMPERIAL,
            });

            const element = result.rows[0]?.elements[0];
            if (element?.status === 'OK' && element.distance) {
              // Google returns meters; convert to miles (1 mile = 1609.344 m)
              const miles = (element.distance.value / 1609.344).toFixed(1);
              onPlaceSelected(name, address, miles);
            } else {
              onPlaceSelected(name, address, '');
            }
          } catch {
            onPlaceSelected(name, address, '');
          } finally {
            setLoading(false);
          }
        } else {
          onPlaceSelected(name, address, '');
        }
      });
    });

    return () => {
      if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, []);

  return (
    <Box>
      <TextField
        fullWidth
        label="Destination"
        inputRef={inputRef}
        value={destinationValue}
        onChange={(e) => onDestinationChange(e.target.value)}
        error={!!destinationError}
        helperText={destinationError ?? 'Start typing to search for a destination (powered by Google Maps)'}
        disabled={disabled}
        required
        autoComplete="off"
      />
      <TextField
        fullWidth
        label="Destination Address"
        value={addressValue}
        onChange={(e) => onAddressChange(e.target.value)}
        error={!!addressError}
        helperText={addressError ?? 'Auto-filled when you select from the list above, or enter manually'}
        disabled={disabled}
        required
        sx={{ mt: 2 }}
      />
      {(mileageValue || loading) && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {loading
            ? <CircularProgress size={14} />
            : (
              <Typography variant="body2" color="text.secondary">
                Estimated driving distance from district: <strong>{mileageValue} miles</strong>
              </Typography>
            )
          }
        </Box>
      )}
    </Box>
  );
}
```

### 2.7 FormState Changes

Add to `FormState` interface:

```typescript
estimatedMileage: string;  // '' | stringified decimal
```

Add to `EMPTY_FORM`:

```typescript
estimatedMileage: '',
```

Add to `tripToFormState`:

```typescript
estimatedMileage: trip.estimatedMileage != null ? String(trip.estimatedMileage) : '',
```

Add to `formToDto`:

```typescript
estimatedMileage: form.estimatedMileage ? parseFloat(form.estimatedMileage) : null,
```

### 2.8 Handler in FieldTripRequestPage

Replace the two individual `handleChange` calls with a combined handler:

```typescript
const handlePlaceSelected = (destination: string, address: string, mileage: string) => {
  setForm((prev) => ({
    ...prev,
    destination,
    destinationAddress: address,
    estimatedMileage: mileage,
  }));
  setErrors((prev) => ({
    ...prev,
    destination: undefined,
    destinationAddress: undefined,
  }));
};
```

### 2.9 Step 0 JSX Change

Replace the two separate Destination/DestinationAddress `TextField` blocks (~lines 802–833) with:

```tsx
<Grid size={12}>
  <DestinationAutocompleteField
    destinationValue={form.destination}
    addressValue={form.destinationAddress}
    mileageValue={form.estimatedMileage}
    onPlaceSelected={handlePlaceSelected}
    onDestinationChange={(v) => handleChange('destination', v)}
    onAddressChange={(v) => handleChange('destinationAddress', v)}
    destinationError={errors.destination}
    addressError={errors.destinationAddress}
    disabled={!!isReadOnly}
  />
</Grid>
```

### 2.10 FieldTripDetailPage — Display Mileage

In the "Trip Information" `<Paper>` block, after the `destinationAddress` DetailField:

```tsx
{trip.estimatedMileage != null && (
  <DetailField
    label="Estimated Driving Distance"
    value={`${Number(trip.estimatedMileage).toFixed(1)} miles`}
  />
)}
```

---

## 3. Feature 2 — Auto-Calculate Total Cost

### 3.1 Current Behavior

Step 2 exposes two independent numeric fields:
- **"Cost Per Student"** (`costPerStudent`) — what the trip costs per student
- **"Total Cost"** (`totalCost`) — currently entered manually by the user

### 3.2 Desired Behavior

When `costPerStudent` changes, automatically compute:

```
totalCost = costPerStudent × studentCount
```

`totalCost` becomes a **computed / read-only display** field. The user should not type into it directly. If `costPerStudent` is cleared or invalid, `totalCost` clears too.

### 3.3 No Schema Changes Needed

Both `costPerStudent` (Decimal?) and `totalCost` (Decimal?) already exist in the schema. No migration is required for Feature 2.

### 3.4 FormState Changes

`totalCost` remains in `FormState` as `string` — no type change. The difference is that it is **auto-populated** rather than user-entered.

### 3.5 handleChange Update

Extend the `handleChange` dispatcher to recompute `totalCost` when `costPerStudent` or `studentCount` changes:

```typescript
const handleChange = (
  field: keyof FormState,
  value: string | boolean | ChaperoneEntry[] | string[] | Array<...>
) => {
  setForm((prev) => {
    const next = { ...prev, [field]: value } as FormState;

    // Clear subject area when grade changes away from High School
    if (field === 'gradeClass' && value !== 'High School') {
      next.subjectArea = '';
    }

    // Auto-calculate total cost when costPerStudent or studentCount changes
    if (field === 'costPerStudent' || field === 'studentCount') {
      const perStudent = parseFloat(field === 'costPerStudent' ? (value as string) : next.costPerStudent);
      const count      = parseInt(field === 'studentCount'    ? (value as string) : next.studentCount, 10);
      if (!isNaN(perStudent) && perStudent >= 0 && !isNaN(count) && count > 0) {
        next.totalCost = (perStudent * count).toFixed(2);
      } else {
        next.totalCost = '';
      }
    }

    return next;
  });
  setErrors((prev) => ({ ...prev, [field]: undefined }));
};
```

### 3.6 Step 2 JSX Change — Total Cost Field

Make the "Total Cost" field **read-only**:

```tsx
{/* 10. Total Cost — auto-calculated from Cost Per Student × Student Count */}
<Grid size={{ xs: 12, sm: 6 }}>
  <TextField
    fullWidth
    label="Total Cost (auto-calculated)"
    type="number"
    inputProps={{ min: 0, step: '0.01', readOnly: true }}
    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
    value={form.totalCost}
    error={!!errors.totalCost}
    helperText={errors.totalCost ?? `Cost Per Student × ${form.studentCount || 0} students`}
    disabled={isReadOnly}
    required
    sx={{ '& .MuiInputBase-input': { bgcolor: 'action.hover', cursor: 'default' } }}
  />
</Grid>
```

Key differences from current code:
- `onChange` prop **removed** (field is not user-editable)
- `inputProps` adds `readOnly: true`
- Background tinted with `bgcolor: 'action.hover'` to signal computed state
- `helperText` shows the formula dynamically

### 3.7 Validation Impact

In `validateStep` (step 2), the `totalCost` validation already checks:

```typescript
const totalC = parseFloat(form.totalCost);
if (form.totalCost === '' || isNaN(totalC) || totalC < 0)
  errors.totalCost = 'Enter a valid total cost (0 or greater)';
```

This validation remains valid — if `costPerStudent` is invalid, `totalCost` will be `''`, and the validation will catch it, guiding the user to fix `costPerStudent`.

The error message can be updated to:

```typescript
errors.totalCost = 'Total cost could not be calculated — enter a valid Cost Per Student';
```

---

## 4. Feature 3 — Hide Approve/Deny/Send Back Buttons After APPROVED

### 4.1 Current Behavior (Already Correct)

In `FieldTripDetailPage.tsx` (lines ~162–165):

```typescript
const PENDING_STATUSES = new Set([
  'PENDING_SUPERVISOR',
  'PENDING_ASST_DIRECTOR',
  'PENDING_DIRECTOR',
  'PENDING_FINANCE_DIRECTOR',
]);

const isPending       = PENDING_STATUSES.has(trip.status);
const showActionButtons = isPending && !isOwner;
```

The action buttons `<Paper>` is wrapped in `{showActionButtons && (...)}`. Since `APPROVED`, `DENIED`, and `NEEDS_REVISION` are not in `PENDING_STATUSES`, `isPending === false` for all terminal states, and the buttons **are not rendered** (removed from the DOM, not disabled).

Feature 3 is **already implemented correctly**. The enhancement below makes the intent explicit with a named constant.

### 4.2 Enhancement — Explicit Guard

Replace the implicit reliance on set membership with an explicit terminal-state guard:

```typescript
// Statuses where the approval workflow is complete — no further approver actions possible.
const TERMINAL_STATUSES = new Set(['APPROVED', 'DENIED']);

const isPending       = PENDING_STATUSES.has(trip.status);
const isTerminal      = TERMINAL_STATUSES.has(trip.status);
const showActionButtons = isPending && !isOwner && !isTerminal;
```

The `!isTerminal` clause is redundant (because `APPROVED`/`DENIED` are already excluded from `PENDING_STATUSES`) but makes the intent **self-documenting**: a future developer cannot accidentally add `APPROVED` to `PENDING_STATUSES` and inadvertently expose the action buttons.

### 4.3 NEEDS_REVISION Submitter Button

The "Edit & Revise" button in the header area is already guarded by `isNeedsRevision && isOwner`. This is unaffected.

---

## 5. Schema Changes

### 5.1 New Field — `estimatedMileage`

**File:** `backend/prisma/schema.prisma`  
**Model:** `FieldTripRequest`  
**Location:** After the `destinationAddress` field (~line 536), within the "Form Fields" block.

```prisma
estimatedMileage      Decimal?                @db.Decimal(8, 2)   // Driving miles from district origin (auto at form submit)
```

No other schema changes are required for Features 2 or 3.

---

## 6. Backend Changes

### 6.1 Validator — `fieldTrip.validators.ts`

**Add `estimatedMileage` to `FieldTripBodyShape`:**

```typescript
estimatedMileage: z
  .number()
  .min(0, 'Estimated mileage must be 0 or greater')
  .max(10000, 'Estimated mileage cannot exceed 10,000 miles')
  .nullable()
  .optional(),
```

This field is optional/nullable — forms submitted without Google Maps (or before the feature) gracefully omit it.

**Add to TypeScript DTO types inferred by Zod:**

No manual DTO type change is needed — `z.infer<typeof CreateFieldTripSchema>` will automatically include `estimatedMileage?: number | null`.

### 6.2 Service — `fieldTrip.service.ts`

In `createDraft` and `updateDraft` methods, the Prisma `data` object is constructed from the validated DTO. Since `estimatedMileage` is an optional field already typed on the schema, Prisma will accept it automatically — **no explicit service changes are required** provided the field is included in the `CreateFieldTripDto` shape.

### 6.3 Controller — No Changes

The controller passes `req.body` (pre-validated DTO) directly to the service. No controller changes needed.

### 6.4 Routes — No Changes

No new routes. The existing `POST /api/field-trips` and `PUT /api/field-trips/:id` routes handle all mutations.

---

## 7. Frontend Changes

### 7.1 Summary Table

| File | Change | Feature |
|------|--------|---------|
| `frontend/src/lib/googleMaps.ts` | **CREATE** — singleton loader | 1 |
| `frontend/src/components/fieldtrip/DestinationAutocompleteField.tsx` | **CREATE** — autocomplete + mileage widget | 1 |
| `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx` | **EDIT** — FormState, handleChange, Step 0 JSX, Step 2 JSX | 1, 2 |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | **EDIT** — TERMINAL_STATUSES constant, showActionButtons, mileage display | 1, 3 |
| `frontend/src/types/fieldTrip.types.ts` | **EDIT** — add `estimatedMileage` to `FieldTripRequest` and `CreateFieldTripDto` | 1 |
| `frontend/.env.example` | **EDIT** — add `VITE_GOOGLE_MAPS_API_KEY` and `VITE_TRIP_ORIGIN_ADDRESS` | 1 |

### 7.2 `fieldTrip.types.ts` Changes

Add to `FieldTripRequest` interface (after `destinationAddress`):

```typescript
estimatedMileage?: number | null;
```

Add to `CreateFieldTripDto` interface:

```typescript
estimatedMileage?: number | null;
```

### 7.3 `.env.example` Changes

Append to `frontend/.env.example`:

```bash
# Google Maps Platform
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
# Origin address for mileage calculation (district HQ or primary departure school)
VITE_TRIP_ORIGIN_ADDRESS=123 District Drive, City, State 12345
```

---

## 8. Dependencies

### 8.1 Frontend (`frontend/package.json`)

```bash
npm install @googlemaps/js-api-loader
npm install --save-dev @types/google.maps
```

| Package | Purpose | Version |
|---------|---------|---------|
| `@googlemaps/js-api-loader` | Lazy-loads Google Maps JS API with Places library | `^1.16.x` |
| `@types/google.maps` | TypeScript ambient type declarations for `google.maps.*` | `^3.x` |

No backend packages are required. Mileage calculation is performed client-side in the browser using the Distance Matrix API (billed to the Maps API key).

### 8.2 Why Not `use-places-autocomplete`?

`use-places-autocomplete` is a React hook that wraps `PlaceAutocompleteService`. It requires the Maps script to be loaded separately and adds a runtime dependency. Using `@googlemaps/js-api-loader` plus a direct `Autocomplete` widget (which provides the standard Google "blue dropdown" UX) is:
- Simpler to configure
- Consistent with Google's own recommended React integration pattern
- Compatible with MUI TextField via `inputRef`

---

## 9. Environment Variables

### 9.1 Frontend Env Vars

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GOOGLE_MAPS_API_KEY` | Yes (for Feature 1) | Google Maps Platform API key. Must have **Places API** and **Distance Matrix API** enabled. |
| `VITE_TRIP_ORIGIN_ADDRESS` | Recommended | Street address used as the driving distance origin. Defaults to the placeholder if unset. |

### 9.2 API Key Setup (Google Cloud Console)

1. Enable **Maps JavaScript API**, **Places API**, and **Distance Matrix API** in Google Cloud Console.
2. Restrict the API key to:
   - **Application restrictions**: HTTP referrers — `https://your-app-domain.com/*` and `http://localhost:5173/*`
   - **API restrictions**: Maps JavaScript API, Places API, Distance Matrix API only
3. Store the key in `frontend/.env.local` (gitignored). Never commit actual keys.

---

## 10. Security Considerations

### 10.1 API Key Exposure

`VITE_GOOGLE_MAPS_API_KEY` is embedded in the browser bundle. This is **unavoidable** for client-side Google Maps usage. Mitigate by:

- **HTTP referrer restrictions** in Google Cloud Console (restrict to your domain)
- **API restrictions** (only enable the three required APIs on this key)
- **Billing alerts** in Google Cloud Console to detect abuse
- Never use the same key for server-side or admin operations

### 10.2 Input Validation

- `estimatedMileage` is validated server-side by Zod: `z.number().min(0).max(10000).nullable().optional()`
- `destination` and `destinationAddress` remain validated per existing Zod rules (min 1, max 500 chars)
- The mileage value shown to the user is computed from the Distance Matrix API response — no user-controlled mileage injection is possible
- `parseFloat(form.estimatedMileage)` in `formToDto` sanitizes the string before it reaches the API

### 10.3 CSRF

All mutations go through existing routes which apply `validateCsrfToken` middleware (line 48 of `fieldTrip.routes.ts`). No new routes are added — CSRF protection is already in place.

### 10.4 Content Security Policy

If the app uses a CSP header, ensure the following are allowed:
```
script-src: https://maps.googleapis.com
style-src: https://fonts.googleapis.com
img-src: https://maps.gstatic.com https://*.googleapis.com
connect-src: https://maps.googleapis.com
```

### 10.5 Auto-Calc Total Cost

The `totalCost` field is computed purely from `costPerStudent × studentCount`. Both inputs are validated (non-negative numbers). No security concern beyond existing validation.

### 10.6 Action Button Hiding (Feature 3)

The TERMINAL_STATUSES guard is purely a UI enhancement. Authorization enforcement remains server-side: the `approve` and `deny` endpoints check the user's permission level and trip status before allowing any action. Frontend hiding is defense-in-depth, not the primary control.

---

## 11. Migration Plan

### 11.1 Naming Convention

Existing migrations follow: `YYYYMMDDHHMMSS_snake_case_description`  
Examples from the migrations directory:
- `20260430173011_add_destination_address`
- `20260430170537_add_field_trip_new_fields`
- `20260505120000_add_transportation_part_c_bus_and_drivers`

### 11.2 Migration File

**Directory:** `backend/prisma/migrations/20260505130000_add_field_trip_estimated_mileage/`  
**File:** `migration.sql`

```sql
-- AlterTable
ALTER TABLE "field_trip_requests"
  ADD COLUMN "estimatedMileage" DECIMAL(8,2);
```

After adding the Prisma schema field, run:

```bash
npx prisma migrate dev --name add_field_trip_estimated_mileage
```

Or in production:

```bash
npx prisma migrate deploy
```

### 11.3 Backward Compatibility

- `estimatedMileage` is nullable — existing rows default to `NULL`. No backfill is needed.
- The Zod validator marks it `optional().nullable()` — existing API clients that omit the field continue to work.
- The frontend gracefully handles `estimatedMileage: null` in `tripToFormState` by defaulting to `''`.

---

## 12. Research References

### 12.1 Google Maps Platform — Places Autocomplete

1. **Google Maps JavaScript API: Place Autocomplete**  
   https://developers.google.com/maps/documentation/javascript/place-autocomplete  
   Official reference for `google.maps.places.Autocomplete`, `getPlace()`, field filters, and event listeners. The `fields: ['name', 'formatted_address', 'geometry']` restriction limits billed SKUs to only the data needed.

2. **@googlemaps/js-api-loader — GitHub**  
   https://github.com/googlemaps/js-api-loader  
   Official loader package. Supports `version: 'weekly'`, `libraries: ['places']`, and returns a promise resolving to the global `google` namespace. Compatible with tree-shaking and lazy loading in Vite/React.

### 12.2 Google Distance Matrix API

3. **Distance Matrix API — Developer Guide**  
   https://developers.google.com/maps/documentation/javascript/distancematrix  
   Covers `DistanceMatrixService.getDistanceMatrix()`, response structure (`rows[0].elements[0].distance.value` in meters), `UnitSystem.IMPERIAL`, and `TravelMode.DRIVING`. Notes that the result must be checked for `element.status === 'OK'` before reading the value.

4. **Google Maps Platform Pricing — Distance Matrix**  
   https://developers.google.com/maps/billing-and-pricing/pricing#directions  
   Each Distance Matrix calculation (1 origin × 1 destination) costs ~$0.005 USD at standard pricing. At the volume typical of a school district field trip system (hundreds of requests per year), cost is negligible.

### 12.3 React + TypeScript Controlled Form Patterns

5. **React Docs: You Might Not Need an Effect — Updating State Based on Props or State**  
   https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state  
   Authoritative guidance that derived state (like `totalCost` computed from `costPerStudent × studentCount`) should be computed **inside the event handler** (inside `handleChange`) rather than in a `useEffect`, to avoid extra render cycles and stale state bugs. This directly justifies implementing Feature 2 inside `handleChange`.

6. **MUI TextField — Read-Only Input**  
   https://mui.com/material-ui/react-text-field/#read-only  
   Documents the `inputProps={{ readOnly: true }}` pattern for displaying computed values in a TextField without making the field fully disabled (preserves visual styling and accessibility).

### 12.4 UI Patterns for Workflow-Based Button Visibility

7. **WCAG 2.1 — 4.1.2 Name, Role, Value**  
   https://www.w3.org/TR/WCAG21/#name-role-value  
   Accessibility best practice requires that action buttons that cannot be used by the current user be **removed from the DOM** (or given `aria-hidden="true"`), not merely visually hidden with CSS, so screen readers do not announce them. The current conditional-render approach (`{showActionButtons && <Paper>...</Paper>}`) is correct.

---

## Appendix A — Complete FormState Field Inventory After Changes

| Field | TypeScript type | Step | Feature |
|-------|----------------|------|---------|
| `teacherName` | `string` | 0 | existing |
| `schoolBuilding` | `string` | 0 | existing |
| `gradeClass` | `string` | 0 | existing |
| `subjectArea` | `string` | 0 | existing |
| `studentCount` | `string` | 0 | existing |
| `tripDate` | `string` | 0 | existing |
| `destination` | `string` | 0 | existing (enhanced by F1) |
| `destinationAddress` | `string` | 0 | existing (enhanced by F1) |
| `estimatedMileage` | `string` | 0 | **NEW — F1** |
| `purpose` | `string` | 0 | existing |
| `preliminaryActivities` | `string` | 0 | existing |
| `followUpActivities` | `string` | 0 | existing |
| `transportationNeeded` | `boolean` | 0 | existing |
| `isOvernightTrip` | `boolean` | 0 | existing |
| `returnDate` | `string` | 0 | existing |
| `alternateTransportation` | `string` | 0 | existing |
| `departureTime` | `string` | 0 | existing |
| `returnTime` | `string` | 0 | existing |
| `transportationDetails` | `string` | 1 | existing |
| `transportNeedsDriver` | `string` | 1 | existing |
| `transportDriverName` | `string` | 1 | existing |
| `transportLoadingLocation` | `string` | 1 | existing |
| `transportLoadingTime` | `string` | 1 | existing |
| `transportArriveLocation` | `string` | 1 | existing |
| `transportArriveFirstDestTime` | `string` | 1 | existing |
| `transportLeaveLocation` | `string` | 1 | existing |
| `transportLeaveLastDestTime` | `string` | 1 | existing |
| `transportReturnToSchoolTime` | `string` | 1 | existing |
| `transportSpedBus` | `string` | 1 | existing |
| `transportItinerary` | `string` | 1 | existing |
| `transportAdditionalDests` | `Array<{...}>` | 1 | existing |
| `rainAlternateDate` | `string` | 2 | existing |
| `substituteCount` | `string` | 2 | existing |
| `parentalPermissionReceived` | `boolean` | 2 | existing |
| `plansForNonParticipants` | `string` | 2 | existing |
| `chaperones` | `ChaperoneEntry[]` | 2 | existing |
| `emergencyContact` | `string` | 2 | existing |
| `instructionalTimeMissed` | `string` | 2 | existing |
| `fundingSource` | `string` | 2 | existing |
| `costPerStudent` | `string` | 2 | existing (triggers F2 auto-calc) |
| `totalCost` | `string` | 2 | existing (auto-calculated by F2) |
| `reimbursementExpenses` | `string[]` | 2 | existing |
| `overnightSafetyPrecautions` | `string` | 2 | existing |
| `additionalNotes` | `string` | 2 | existing |

---

## Appendix B — Checklist for Implementation Subagent

### Feature 1
- [ ] Run `npm install @googlemaps/js-api-loader` in `frontend/`
- [ ] Run `npm install --save-dev @types/google.maps` in `frontend/`
- [ ] Create `frontend/src/lib/googleMaps.ts`
- [ ] Create `frontend/src/components/fieldtrip/DestinationAutocompleteField.tsx`
- [ ] Add `estimatedMileage: string` to `FormState` in `FieldTripRequestPage.tsx`
- [ ] Add `estimatedMileage: ''` to `EMPTY_FORM`
- [ ] Add `estimatedMileage` to `tripToFormState()`
- [ ] Add `estimatedMileage` to `formToDto()`
- [ ] Add `handlePlaceSelected` handler in `FieldTripRequestPage`
- [ ] Replace Destination + DestinationAddress fields in Step 0 with `<DestinationAutocompleteField>`
- [ ] Add `estimatedMileage?: number | null` to `FieldTripRequest` in `fieldTrip.types.ts`
- [ ] Add `estimatedMileage?: number | null` to `CreateFieldTripDto` in `fieldTrip.types.ts`
- [ ] Add `estimatedMileage` Zod field to `FieldTripBodyShape` in `fieldTrip.validators.ts`
- [ ] Add `estimatedMileage Decimal? @db.Decimal(8, 2)` to `FieldTripRequest` in `schema.prisma`
- [ ] Run `npx prisma migrate dev --name add_field_trip_estimated_mileage`
- [ ] Add mileage `DetailField` to `FieldTripDetailPage.tsx`
- [ ] Update `frontend/.env.example` with new vars

### Feature 2
- [ ] Extend `handleChange` in `FieldTripRequestPage.tsx` with auto-calc block for `costPerStudent`/`studentCount`
- [ ] Remove `onChange` from "Total Cost" TextField in Step 2
- [ ] Add `inputProps={{ readOnly: true }}` to "Total Cost" TextField
- [ ] Update label to `"Total Cost (auto-calculated)"`
- [ ] Update `helperText` on "Total Cost" to show formula
- [ ] Update `totalCost` validation error message in `validateStep`

### Feature 3
- [ ] Add `TERMINAL_STATUSES` constant in `FieldTripDetailPage.tsx`
- [ ] Update `showActionButtons` derivation to include `&& !isTerminal`

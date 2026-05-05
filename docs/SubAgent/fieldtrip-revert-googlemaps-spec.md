# Field Trip — Google Maps Revert Specification

**Generated:** 2026-05-05  
**Scope:** Remove ONLY the Google Maps autocomplete + mileage feature.  
**Preserve:** Auto-calculated total cost, and the Approve/Deny/Resend button-hiding logic.

---

## Summary

The Google Maps feature added:
- A new `estimatedMileage` DB column (migration not yet run against production)
- A Google Maps JS loader module
- A `DestinationAutocompleteField` React component
- `estimatedMileage` wired into form state, `tripToFormState`, `formToDto`, and `handlePlaceSelected`
- `estimatedMileage` in frontend TypeScript types and DTOs
- `estimatedMileage` in the Zod validator (backend)
- `estimatedMileage` in the Prisma service (create + update)
- `estimatedMileage` displayed in FieldTripDetailPage
- Two new env vars in `frontend/.env.example`
- Two npm packages (`@googlemaps/js-api-loader`, `@types/google.maps`)

---

## Files to DELETE Entirely

### 1. `frontend/src/lib/googleMaps.ts`
**Action:** Delete this file entirely.  
It is a new file created solely for Google Maps — it has no other purpose.

### 2. `frontend/src/components/fieldtrip/DestinationAutocompleteField.tsx`
**Action:** Delete this file entirely.  
It is a new component created solely for Google Maps — it has no other purpose.

### 3. `backend/prisma/migrations/20260505130000_add_field_trip_estimated_mileage/` (entire directory)
**Action:** Delete this migration directory and its `migration.sql`.  
The migration has NOT been applied to the production database (only `prisma generate` was run). Deleting the directory and reverting the schema is safe.

---

## Files to Edit

### 4. `backend/prisma/schema.prisma`

**Location:** The `FieldTripRequest` model, after `destinationAddress`.

**oldString:**
```
  destination           String                  @db.VarChar(500)
  destinationAddress    String?                 @db.VarChar(500)
  estimatedMileage      Decimal?                @db.Decimal(8, 2)   // Driving miles from district origin (auto at form submit)
  purpose               String                  @db.Text
```

**newString:**
```
  destination           String                  @db.VarChar(500)
  destinationAddress    String?                 @db.VarChar(500)
  purpose               String                  @db.Text
```

---

### 5. `frontend/package.json`

**oldString (dependencies block):**
```json
    "@googlemaps/js-api-loader": "^1.16.8",
    "@hookform/resolvers": "^5.2.2",
```

**newString:**
```json
    "@hookform/resolvers": "^5.2.2",
```

**oldString (devDependencies block):**
```json
    "@types/google.maps": "^3.58.1",
    "@types/react": "^19.2.8",
```

**newString:**
```json
    "@types/react": "^19.2.8",
```

---

### 6. `frontend/.env.example`

**oldString:**
```
# Google Maps Platform
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
# Origin address for mileage calculation (district HQ or primary departure school)
VITE_TRIP_ORIGIN_ADDRESS=123 District Drive, City, State 12345
```

**newString:** *(remove those four lines entirely — replace with empty string)*

---

### 7. `frontend/src/types/fieldTrip.types.ts`

#### 7a. Remove `estimatedMileage` from `FieldTripRequest` interface

**oldString:**
```typescript
  destination:           string;
  destinationAddress?:   string | null;
  estimatedMileage?:     number | null;
  purpose:               string;
```

**newString:**
```typescript
  destination:           string;
  destinationAddress?:   string | null;
  purpose:               string;
```

#### 7b. Remove `estimatedMileage` from `CreateFieldTripDto` interface

**oldString:**
```typescript
  destination:           string;
  destinationAddress:    string;
  estimatedMileage?:     number | null;
  purpose:               string;
```

**newString:**
```typescript
  destination:           string;
  destinationAddress:    string;
  purpose:               string;
```

---

### 8. `backend/src/validators/fieldTrip.validators.ts`

**oldString:**
```typescript
  destinationAddress: z
    .string()
    .min(1, 'Destination address is required')
    .max(500, 'Destination address must be 500 characters or less'),
  estimatedMileage: z
    .number()
    .min(0, 'Estimated mileage must be 0 or greater')
    .max(10000, 'Estimated mileage cannot exceed 10,000 miles')
    .nullable()
    .optional(),
  purpose: z
```

**newString:**
```typescript
  destinationAddress: z
    .string()
    .min(1, 'Destination address is required')
    .max(500, 'Destination address must be 500 characters or less'),
  purpose: z
```

---

### 9. `backend/src/services/fieldTrip.service.ts`

#### 9a. Remove from `create` Prisma data object (line ~112)

**oldString:**
```typescript
        destination:          data.destination,
        destinationAddress:   data.destinationAddress,
        estimatedMileage:     data.estimatedMileage ?? null,
        purpose:              data.purpose,
```

**newString:**
```typescript
        destination:          data.destination,
        destinationAddress:   data.destinationAddress,
        purpose:              data.purpose,
```

#### 9b. Remove from `update` Prisma data object (line ~169)

**oldString:**
```typescript
    if (data.destinationAddress    !== undefined) updateData.destinationAddress    = data.destinationAddress ?? null;
    if (data.estimatedMileage      !== undefined) updateData.estimatedMileage      = data.estimatedMileage ?? null;
    if (data.purpose               !== undefined) updateData.purpose               = data.purpose;
```

**newString:**
```typescript
    if (data.destinationAddress    !== undefined) updateData.destinationAddress    = data.destinationAddress ?? null;
    if (data.purpose               !== undefined) updateData.purpose               = data.purpose;
```

---

### 10. `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`

#### 10a. Remove import of `DestinationAutocompleteField`

**oldString:**
```typescript
import { FieldTripDatePicker }                       from '../../components/FieldTripDatePicker';
import { DestinationAutocompleteField }               from '../../components/fieldtrip/DestinationAutocompleteField';
```

**newString:**
```typescript
import { FieldTripDatePicker }                       from '../../components/FieldTripDatePicker';
```

#### 10b. Remove `estimatedMileage` from `FormState` interface

**oldString:**
```typescript
  destination:           string;
  destinationAddress:    string;
  estimatedMileage:      string;
  purpose:               string;
```

**newString:**
```typescript
  destination:           string;
  destinationAddress:    string;
  purpose:               string;
```

#### 10c. Remove `estimatedMileage` from `EMPTY_FORM` constant

**oldString:**
```typescript
  destination:           '',
  destinationAddress:    '',
  estimatedMileage:      '',
  purpose:               '',
```

**newString:**
```typescript
  destination:           '',
  destinationAddress:    '',
  purpose:               '',
```

#### 10d. Remove `estimatedMileage` from `tripToFormState` function

**oldString:**
```typescript
    destination:           trip.destination,
    destinationAddress:    trip.destinationAddress   ?? '',
    estimatedMileage:      trip.estimatedMileage != null ? String(trip.estimatedMileage) : '',
    purpose:               trip.purpose,
```

**newString:**
```typescript
    destination:           trip.destination,
    destinationAddress:    trip.destinationAddress   ?? '',
    purpose:               trip.purpose,
```

#### 10e. Remove `estimatedMileage` from `formToDto` function

**oldString:**
```typescript
    destination:           form.destination.trim(),
    destinationAddress:    form.destinationAddress.trim(),
    estimatedMileage:      form.estimatedMileage ? parseFloat(form.estimatedMileage) : null,
    purpose:               form.purpose.trim(),
```

**newString:**
```typescript
    destination:           form.destination.trim(),
    destinationAddress:    form.destinationAddress.trim(),
    purpose:               form.purpose.trim(),
```

#### 10f. Remove `handlePlaceSelected` handler

**oldString:**
```typescript
  const handlePlaceSelected = (destination: string, address: string, mileage: string) => {
    setForm((prev) => ({
      ...prev,
      destination,
      destinationAddress: address,
      estimatedMileage:   mileage,
    }));
    setErrors((prev) => ({
      ...prev,
      destination:        undefined,
      destinationAddress: undefined,
    }));
  };

  const handleSaveDraft = async () => {
```

**newString:**
```typescript
  const handleSaveDraft = async () => {
```

#### 10g. Replace `DestinationAutocompleteField` JSX block with plain MUI TextFields

The current JSX (the entire `{/* Destination + Address + Mileage — Google Places Autocomplete */}` block):

**oldString:**
```tsx
            {/* Destination + Address + Mileage — Google Places Autocomplete */}
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

**newString:**
```tsx
            {/* Destination */}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Destination"
                value={form.destination}
                onChange={(e) => handleChange('destination', e.target.value)}
                error={!!errors.destination}
                helperText={errors.destination}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Destination Address */}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Destination Address"
                value={form.destinationAddress}
                onChange={(e) => handleChange('destinationAddress', e.target.value)}
                error={!!errors.destinationAddress}
                helperText={errors.destinationAddress}
                disabled={isReadOnly}
                required
              />
            </Grid>
```

---

### 11. `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`

**oldString:**
```tsx
          {trip.destinationAddress && (
            <DetailField label="Destination Address"  value={trip.destinationAddress} />
          )}
          {trip.estimatedMileage != null && (
            <DetailField
              label="Estimated Driving Distance"
              value={`${Number(trip.estimatedMileage).toFixed(1)} miles`}
            />
          )}
          <DetailField label="Buses Needed" value={trip.transportationNeeded ? 'Yes' : 'No'} />
```

**newString:**
```tsx
          {trip.destinationAddress && (
            <DetailField label="Destination Address"  value={trip.destinationAddress} />
          )}
          <DetailField label="Buses Needed" value={trip.transportationNeeded ? 'Yes' : 'No'} />
```

---

## Post-Revert Steps

1. **Delete migration directory:**  
   `rm -rf backend/prisma/migrations/20260505130000_add_field_trip_estimated_mileage`

2. **Delete new files:**  
   `rm frontend/src/lib/googleMaps.ts`  
   `rm frontend/src/components/fieldtrip/DestinationAutocompleteField.tsx`

3. **Run `prisma generate`** after schema revert to regenerate the Prisma client without `estimatedMileage`.

4. **Run `npm install`** in `frontend/` after removing packages from `package.json` to clean `node_modules` and `package-lock.json`.

5. **Rebuild both frontend and backend** to confirm no TypeScript errors remain.

---

## What Is NOT Changed (Confirmed Preserved)

| Feature | Files Affected | Status |
|---|---|---|
| Auto-calculated `totalCost` | `FieldTripRequestPage.tsx` `handleChange` — auto-calc logic for `costPerStudent`/`studentCount` | **UNTOUCHED** |
| Hide Approve/Deny/Resend after approval | `FieldTripDetailPage.tsx` — `isPending`/`showActionButtons` logic | **UNTOUCHED** |

# Specification: Add "PROGRAM" Type to OfficeLocation

**Date:** 2026-03-11  
**Feature:** Add `PROGRAM` as a new value for the `type` field on OfficeLocation  
**Affected Page:** Office Locations & Supervisors (`/supervisor-management`)

---

## 1. Current State

### 1.1 Prisma Model — `OfficeLocation`

File: [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma) (line 269)

```prisma
model OfficeLocation {
  id          String               @id @default(uuid())
  name        String               @unique
  code        String?              @unique
  type        String               // plain String — NOT a DB enum
  address     String?
  phone       String?
  isActive    Boolean              @default(true)
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  city        String?
  state       String?
  zip         String?
  supervisors     LocationSupervisor[]
  rooms           Room[]
  equipment       equipment[]
  purchase_orders purchase_orders[] @relation("POOfficeLocation")

  @@index([isActive])
  @@index([type])
  @@map("office_locations")
}
```

> **Important:** The `type` column is a plain `String` in PostgreSQL — there is **no database-level enum**. Constraints are enforced entirely at the application layer (Zod validators, TypeScript types). This means **no Prisma migration is needed** to add `PROGRAM`.

### 1.2 Current Type Values

| Value | Label | Icon |
|---|---|---|
| `SCHOOL` | School | 🏫 |
| `DISTRICT_OFFICE` | District Office | 🏢 |
| `DEPARTMENT` | Department | 📁 |

### 1.3 Where Type Is Defined / Enforced

| Layer | File | Current enum values |
|---|---|---|
| Zod Validator (backend) | `backend/src/validators/location.validators.ts` | `['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT']` |
| Service DTO (backend) | `backend/src/services/location.service.ts` | `'SCHOOL' \| 'DISTRICT_OFFICE' \| 'DEPARTMENT'` + validTypes array |
| Frontend type | `frontend/src/types/location.types.ts` | `'SCHOOL' \| 'DISTRICT_OFFICE' \| 'DEPARTMENT'` |
| Shared types | `shared/src/types.ts` | `'SCHOOL' \| 'DISTRICT_OFFICE' \| 'DEPARTMENT'` |

### 1.4 Edit Location Dialog — Current Structure

The **`EditLocationModal`** component is defined inside  
[`frontend/src/pages/SupervisorManagement.tsx`](../../frontend/src/pages/SupervisorManagement.tsx) (~line 795).

**Current fields:**
1. Name (required, text input)
2. Code (optional, text input)
3. **Type** (required, `<select>` with three options: School, District Office, Department)
4. Street Address (optional, text input)
5. City / State / ZIP (3-column grid, optional text inputs)
6. Phone (optional, tel input)
7. Active checkbox
8. Supervisors collapsible section (add / remove supervisor assignments)

The **`AddLocationModal`** (same file, ~line 487) has the same type `<select>`.

The **`LocationsTab`** filter dropdown (same file, ~line 153) also lists the same three type values plus "All Types".

### 1.5 Route Definition

File: [`backend/src/routes/location.routes.ts`](../../backend/src/routes/location.routes.ts)

All routes are behind `authenticate` and `validateCsrfToken` middleware:

```
GET    /api/locations         → getOfficeLocations
GET    /api/locations/:id     → getOfficeLocation
POST   /api/locations         → createOfficeLocation  (validates CreateOfficeLocationSchema)
PUT    /api/locations/:id     → updateOfficeLocation  (validates UpdateOfficeLocationSchema)
DELETE /api/locations/:id     → deleteOfficeLocation
```

The `CreateOfficeLocationSchema` and `UpdateOfficeLocationSchema` both reference the `LocationType` Zod enum.

---

## 2. Proposed Change

Add **`PROGRAM`** as a fourth location type.

| New Value | Suggested Label | Suggested Icon |
|---|---|---|
| `PROGRAM` | Program | 📋 |

**No database migration is required** because `type` is a plain `String` column. Only application-layer changes are needed.

---

## 3. Files to Modify

### 3.1 Zod Validator (Backend)

**File:** [`backend/src/validators/location.validators.ts`](../../backend/src/validators/location.validators.ts)

**Change:** Add `'PROGRAM'` to the `LocationType` Zod enum.

```typescript
// BEFORE
const LocationType = z.enum(['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT']);

// AFTER
const LocationType = z.enum(['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT', 'PROGRAM']);
```

This single change propagates to both `CreateOfficeLocationSchema` and `UpdateOfficeLocationSchema` automatically since both reference `LocationType`.

---

### 3.2 Service DTO (Backend)

**File:** [`backend/src/services/location.service.ts`](../../backend/src/services/location.service.ts)

**Change 1:** Update the `CreateLocationDto` TypeScript union type.

```typescript
// BEFORE
export interface CreateLocationDto {
  name: string;
  code?: string;
  type: 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT';
  // ...
}

// AFTER
export interface CreateLocationDto {
  name: string;
  code?: string;
  type: 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT' | 'PROGRAM';
  // ...
}
```

**Change 2:** Update the `validTypes` array inside the `create()` method.

```typescript
// BEFORE
const validTypes = ['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT'];

// AFTER
const validTypes = ['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT', 'PROGRAM'];
```

---

### 3.3 Frontend Types

**File:** [`frontend/src/types/location.types.ts`](../../frontend/src/types/location.types.ts)

**Change 1:** Add `'PROGRAM'` to the `LocationType` union.

```typescript
// BEFORE
export type LocationType = 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT';

// AFTER
export type LocationType = 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT' | 'PROGRAM';
```

**Change 2:** Add entry to `LOCATION_TYPE_LABELS`.

```typescript
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  SCHOOL: 'School',
  DISTRICT_OFFICE: 'District Office',
  DEPARTMENT: 'Department',
  PROGRAM: 'Program',           // ADD THIS
};
```

**Change 3:** Add entry to `LOCATION_TYPE_ICONS`.

```typescript
export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  SCHOOL: '🏫',
  DISTRICT_OFFICE: '🏢',
  DEPARTMENT: '📁',
  PROGRAM: '📋',                // ADD THIS
};
```

**Change 4:** Update `isValidLocationType` guard function.

```typescript
// BEFORE
export function isValidLocationType(type: string): type is LocationType {
  return ['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT'].includes(type);
}

// AFTER
export function isValidLocationType(type: string): type is LocationType {
  return ['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT', 'PROGRAM'].includes(type);
}
```

---

### 3.4 Shared Types

**File:** [`shared/src/types.ts`](../../shared/src/types.ts)

**Change:** Add `'PROGRAM'` to the `LocationType` union.

```typescript
// BEFORE
export type LocationType = 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT';

// AFTER
export type LocationType = 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT' | 'PROGRAM';
```

---

### 3.5 Frontend Page — Edit Location Dialog

**File:** [`frontend/src/pages/SupervisorManagement.tsx`](../../frontend/src/pages/SupervisorManagement.tsx)

Three `<select>` dropdowns need a new `<option>` added:

#### A) LocationsTab filter dropdown (~line 162)

```tsx
// BEFORE
<select ...>
  <option value="ALL">All Types</option>
  <option value="SCHOOL">Schools</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Departments</option>
</select>

// AFTER
<select ...>
  <option value="ALL">All Types</option>
  <option value="SCHOOL">Schools</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Departments</option>
  <option value="PROGRAM">Programs</option>
</select>
```

#### B) AddLocationModal Type select (~line 580)

```tsx
// BEFORE
<select
  required
  value={formData.type}
  onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
  className="form-select"
>
  <option value="SCHOOL">School</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Department</option>
</select>

// AFTER
<select
  required
  value={formData.type}
  onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
  className="form-select"
>
  <option value="SCHOOL">School</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Department</option>
  <option value="PROGRAM">Program</option>
</select>
```

#### C) EditLocationModal Type select (~line 908)

```tsx
// BEFORE
<select
  required
  value={formData.type}
  onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
  className="form-select"
>
  <option value="SCHOOL">School</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Department</option>
</select>

// AFTER
<select
  required
  value={formData.type}
  onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
  className="form-select"
>
  <option value="SCHOOL">School</option>
  <option value="DISTRICT_OFFICE">District Office</option>
  <option value="DEPARTMENT">Department</option>
  <option value="PROGRAM">Program</option>
</select>
```

---

## 4. No Migration Required

Because `type` is defined as `String` in Prisma (not `enum LocationTypeEnum`), **no `prisma migrate dev` is needed**. The PostgreSQL column already accepts any string value. The constraint is purely at the application layer.

If a DB-level constraint were desired in the future (e.g., a CHECK constraint or converting to a PostgreSQL enum), that would require a migration. For this feature, it is not required.

---

## 5. No Backend Controller Changes

The `createOfficeLocation` controller validates required fields (`name` and `type`) and then delegates to the service. The service validates `type` against `validTypes`. Both changes (validator + service) are sufficient — the controller itself does not need modification.

---

## 6. No New Routes Required

The existing `PUT /api/locations/:id` route handles updates. No new routes are needed.

---

## 7. Security Considerations

| Concern | Status |
|---|---|
| Authentication | All location routes are protected by `authenticate` middleware |
| CSRF | All state-changing routes are protected by `validateCsrfToken` middleware |
| Input validation | `CreateOfficeLocationSchema` and `UpdateOfficeLocationSchema` (Zod) enforce the type enum — adding `PROGRAM` to the Zod enum is sufficient |
| SQL injection | Not applicable; Prisma ORM with parameterized queries is used throughout |
| Permission checks | Location routes use `authenticate` but do not currently have a per-role permission guard (same pattern as existing location CRUD) |
| XSS | React escapes `type` values when rendered in JSX; no raw HTML injection risk |

---

## 8. Summary: Complete File List

| # | File | Change Type |
|---|---|---|
| 1 | `backend/src/validators/location.validators.ts` | Add `'PROGRAM'` to `LocationType` Zod enum |
| 2 | `backend/src/services/location.service.ts` | Add `'PROGRAM'` to `CreateLocationDto` type union and `validTypes` array |
| 3 | `frontend/src/types/location.types.ts` | Add `'PROGRAM'` to `LocationType`, `LOCATION_TYPE_LABELS`, `LOCATION_TYPE_ICONS`, `isValidLocationType` |
| 4 | `shared/src/types.ts` | Add `'PROGRAM'` to `LocationType` union |
| 5 | `frontend/src/pages/SupervisorManagement.tsx` | Add `<option value="PROGRAM">` to three `<select>` elements |

**No migration required. No new files required.**

---

## 9. Testing Checklist

- [ ] Create a new location with type `PROGRAM` → succeeds, stored in DB
- [ ] Update an existing location to type `PROGRAM` → succeeds
- [ ] Try to create a location with an invalid type (e.g., `INVALID`) → backend returns 400
- [ ] Filter by `Programs` in the LocationsTab dropdown → shows only PROGRAM locations
- [ ] PROGRAM location card shows 📋 icon and "Program" label
- [ ] Edit a PROGRAM location → Type dropdown pre-selects PROGRAM correctly

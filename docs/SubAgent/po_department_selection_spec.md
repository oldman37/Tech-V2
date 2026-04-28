# PO Department / Program / School Selection — Feature Specification

**Feature:** Department, Program, or School selection on Purchase Orders with location auto-fill and supervisor-based approval routing  
**Document type:** Phase 1 — Research & Specification  
**Date:** March 18, 2026  
**Author:** Copilot Research Agent  
**Status:** Ready for Implementation Review

---

## Table of Contents

1. [Feature Summary](#1-feature-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Gap Analysis](#3-gap-analysis)
4. [Proposed Database Schema Changes](#4-proposed-database-schema-changes)
5. [Proposed API Changes](#5-proposed-api-changes)
6. [Proposed Frontend Changes](#6-proposed-frontend-changes)
7. [Approval Routing Logic](#7-approval-routing-logic)
8. [Security Considerations](#8-security-considerations)
9. [Step-by-Step Implementation Plan](#9-step-by-step-implementation-plan)
10. [Open Questions](#10-open-questions)

---

## 1. Feature Summary

Users must be able to associate a PO with a specific **Department**, **Program**, or **School** (a typed `OfficeLocation` record). When type = **School**, the ship-to address auto-fills from the requestor's own location as stored in the DB by Entra ID sync. The chosen entity's **primary supervisor** (`LocationSupervisor.isPrimary = true`) replaces the requestor's personal supervisor (`UserSupervisor`) as the first approval step. The remainder of the chain stays the same:

```
submitted → [entity location supervisor] → finance_director_approved
          → dos_approved → po_issued
```

---

## 2. Current State Analysis

### 2.1 Relevant Database Models

#### `purchase_orders` (schema.prisma lines 340–390)

| Field | Type | Current Use |
|---|---|---|
| `officeLocationId` | `String?` (FK → `OfficeLocation`) | Optional "shipping destination"; set by wizard |
| `program` | `String?` | **Free-text** string for program or department name (no FK) |
| `shipTo` | `String?` | Free-text delivery address |
| `requestorId` | FK → `User` | The PO creator |

`officeLocationId` already has an index and a named relation `"POOfficeLocation"`. The model can already hold a reference to a School, Department, or Program location. The problem is **how it is used** (shipping destination, not entity routing) and **incomplete approval routing** on submit.

#### `OfficeLocation` (schema.prisma lines 280–295)

```prisma
model OfficeLocation {
  id       String  @id
  name     String  @unique
  code     String? @unique
  type     String  // 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT' | 'PROGRAM'
  isActive Boolean @default(true)
  supervisors     LocationSupervisor[]
  purchase_orders purchase_orders[] @relation("POOfficeLocation")
  ...
}
```

Location types are already typed and indexed (`@@index([type])`).

#### `LocationSupervisor` (schema.prisma lines 192–208)

```prisma
model LocationSupervisor {
  id             String         @id
  locationId     String         // FK → OfficeLocation
  userId         String         // The supervisor's User ID
  supervisorType String         // e.g. 'PRINCIPAL', 'DIRECTOR_OF_SCHOOLS', ...
  isPrimary      Boolean        @default(false)
  location       OfficeLocation @relation(...)
  user           User           @relation(...)

  @@unique([locationId, userId, supervisorType])
  @@index([locationId])
  @@index([supervisorType])
}
```

Primary supervisors per entity **already exist** in the DB. The approval routing just does not query this table on submit.

#### `UserSupervisor` (schema.prisma lines 435–455)

```prisma
model UserSupervisor {
  id           String
  userId       String   // the requestor
  supervisorId String   // the supervisor
  isPrimary    Boolean  @default(false)
  locationId   String?  // optional location scope
  ...
}
```

Currently the **only** supervisor source queried during PO submit.

#### `User.officeLocation` (schema.prisma lines 460–465)

```
officeLocation  String?  // normalized Entra location name, e.g. "Hillcrest Elementary"
```

This is a **plain string** set during Entra sync via `mapOfficeLocation()` in `userSync.service.ts`. It is NOT a foreign key — it holds the `OfficeLocation.name` value after normalization.

### 2.2 Current Approval Routing (submit flow)

File: `backend/src/services/purchaseOrder.service.ts`  
Method: `submitPurchaseOrder()`

```typescript
// Current: looks up personal supervisor only
const supervisorRecord = await this.prisma.userSupervisor.findFirst({
  where: { userId: po.requestorId, isPrimary: true },
  include: { supervisor: { select: { id: true, email: true } } },
});
```

The method then either takes a self-supervisor bypass path or sends email to the personal supervisor. It **never queries `LocationSupervisor`** for the PO's `officeLocationId`.

### 2.3 Current Frontend (RequisitionWizard.tsx – Step 1)

The `officeLocationId` is currently wired as "Shipping Destination":

```tsx
<FormControl fullWidth>
  <InputLabel>Shipping Destination</InputLabel>
  <Select
    value={selectedLocationId ?? ''}
    onChange={(e) => {
      const locId = e.target.value || null;
      setSelectedLocationId(locId);
      if (locId) {
        const loc = locationOptions.find((l) => l.id === locId);
        if (loc) setShipTo(loc.name);  // auto-fills shipTo with location name
      }
    }}
  >
    {locationOptions.map(...)}  // all locations — no type filter
  </Select>
</FormControl>
```

Problems:
1. The label says "Shipping Destination" — semantically wrong for entity routing
2. No type filtering — shows DISTRICT_OFFICE entries alongside schools
3. No grouping by type (Schools vs Departments vs Programs)
4. Auto-fill logic sets `shipTo` to the **selected** location name, not the **user's own** location
5. No indication of who the location supervisor is (transparency gap)

### 2.4 Current Validator (purchaseOrder.validators.ts)

```typescript
export const CreatePurchaseOrderSchema = z.object({
  ...
  program: z.string().max(200, ...).optional().nullable(),   // free-text
  officeLocationId: z.string().uuid(...).optional().nullable(),
  ...
});
```

The `program` field is a free-text string. After this feature, it can be retired or kept as an override label (the entity name will come from the `OfficeLocation` record).

### 2.5 Location Service (location.service.ts)

`findAll()` returns all active locations with supervisors. There is **no type-filter query param** currently — the service always returns all active locations.

### 2.6 Entra Sync (userSync.service.ts)

```typescript
// User.officeLocation is set as a normalized string during sync:
const rawLocation = graphUser.officeLocation || graphUser.physicalDeliveryOfficeName || null;
const officeLocation = this.mapOfficeLocation(rawLocation);
// → stored as User.officeLocation (String?)
```

The normalization map maps strings like "hillcrest elementary" → "Hillcrest Elementary" which must match an `OfficeLocation.name` exactly for the auto-fill lookup to work.

---

## 3. Gap Analysis

### 3.1 Missing / Incorrect Behavior

| # | Gap | Impact | Effort |
|---|---|---|---|
| G-1 | `officeLocationId` semantically labeled "Shipping Destination" in UI | UX confusion | Low |
| G-2 | No type-filter on `/api/locations` endpoint | UI shows all location types | Low |
| G-3 | `submitPurchaseOrder` never looks up `LocationSupervisor` for routing | Approval bypass of entity supervisor | Medium |
| G-4 | Auto-fill sets `shipTo = selected location name` instead of user's own location | Wrong ship-to for School type | Low |
| G-5 | No visual indication of who the entity supervisor is | UX transparency gap | Low |
| G-6 | `program` field is free-text (no entity link) | Inconsistent reporting | Low (can coexist) |
| G-7 | No server-side endpoint to resolve `User.officeLocation` string → `OfficeLocation.id` | Client must do fuzzy matching | Low |

### 3.2 What Already Exists (No Change Needed)

| # | Exists | Notes |
|---|---|---|
| E-1 | `purchase_orders.officeLocationId` FK | Correct FK exists; just needs semantic repurposing |
| E-2 | `OfficeLocation.type` with SCHOOL/DEPARTMENT/PROGRAM | Discriminator already present |
| E-3 | `LocationSupervisor` table with `isPrimary` flag | All that's needed for routing |
| E-4 | `User.officeLocation` string from Entra sync | Available for auto-fill lookup |
| E-5 | `LocationSupervisor` included in `findById()` response | Supervisor info is fetchable |
| E-6 | Full approval chain (Finance Director → DOS) | Unchanged — permission-level based |

---

## 4. Proposed Database Schema Changes

### 4.1 `purchase_orders` — Minimal Changes

The existing `officeLocationId` field already represents the entity association perfectly. **No new columns are required** for the core feature. However, to improve auditability and query clarity, we add one optional field:

```prisma
model purchase_orders {
  // ... existing fields ...

  officeLocationId  String?   // REPURPOSED: now the Dept/Program/School entity, not shipping dest
  
  // NEW: optional cached snapshot of the entity type at PO creation time
  // Avoids a JOIN when displaying PO lists; populated from officeLocation.type on create/update
  entityType        String?   // 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null
  
  // ... rest unchanged ...
}
```

**Why `entityType` as a denormalized cache?**  
The PO list query already includes `officeLocation: { select: { id, name, code } }` — to show entity type in the list without an extra join, it's helpful to cache it. If omitted, the list will need to include `type` in the officeLocation select. **This field is optional** — the implementation can skip it and just include `type` in the officeLocation select instead. Recommend adding it for simplicity.

### 4.2 Migration SQL

```sql
-- Migration: add entityType column to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "entityType" TEXT;

-- Backfill from the related OfficeLocation
UPDATE purchase_orders po
SET "entityType" = ol.type
FROM office_locations ol
WHERE po."officeLocationId" = ol.id;

-- Index for filtering POs by entity type
CREATE INDEX IF NOT EXISTS "purchase_orders_entityType_idx" ON purchase_orders ("entityType");
```

### 4.3 Prisma Schema Addition

```prisma
model purchase_orders {
  // ... existing fields above officeLocationId ...

  officeLocationId  String?
  entityType        String?   // 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' — cached from officeLocation.type

  // ... existing relations unchanged ...
  officeLocation    OfficeLocation? @relation("POOfficeLocation", fields: [officeLocationId], references: [id])

  // NEW INDEX
  @@index([entityType])
  // ... existing indexes ...
}
```

### 4.4 `OfficeLocation` — No Changes Needed

The model is already correct. The `type` field with values `SCHOOL | DISTRICT_OFFICE | DEPARTMENT | PROGRAM` and the `supervisors: LocationSupervisor[]` relation cover all requirements.

### 4.5 `LocationSupervisor` — No Changes Needed

Already supports primary supervisors per location. The `isPrimary = true` record is the routing target.

---

## 5. Proposed API Changes

### 5.1 `GET /api/locations` — Add Type Filter

**File:** `backend/src/routes/location.routes.ts`  
**File:** `backend/src/controllers/location.controller.ts`  
**File:** `backend/src/services/location.service.ts`

Add query parameter support:

```
GET /api/locations?types=SCHOOL,DEPARTMENT,PROGRAM
GET /api/locations?types=SCHOOL
GET /api/locations          → returns all (current behavior, unchanged)
```

**Service change** (`location.service.ts` → `findAll()`):

```typescript
async findAll(options?: { types?: string[] }): Promise<LocationWithSupervisors[]> {
  const locations = await this.prisma.officeLocation.findMany({
    where: {
      isActive: true,
      ...(options?.types?.length && { type: { in: options.types } }),
    },
    include: { supervisors: { include: { user: { select: { ... } } } } },
    orderBy: { name: 'asc' },
  });
  return locations;
}
```

**Controller change** (`location.controller.ts`):

```typescript
export const getLocations = async (req: AuthRequest, res: Response) => {
  try {
    const { types } = req.query;  // comma-separated or array
    const typeList = types
      ? (Array.isArray(types) ? types : String(types).split(','))
      : undefined;
    const locations = await locationService.findAll({ types: typeList });
    res.json(locations);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 5.2 `GET /api/users/me/office-location` — Resolve User's Location

**File:** `backend/src/routes/user.routes.ts`  
**File:** `backend/src/controllers/user.controller.ts`

New endpoint that resolves the current user's `officeLocation` string to the matching `OfficeLocation` record:

```
GET /api/users/me/office-location
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "name": "Hillcrest Elementary",
  "type": "SCHOOL",
  "address": "...",
  "city": "...",
  "state": "...",
  "zip": "..."
}

Response 204: (no content — user has no officeLocation set)
```

**Service logic:**

```typescript
async getMyOfficeLocation(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { officeLocation: true },
  });
  if (!user?.officeLocation) return null;

  // Match by exact name (normalized by Entra sync to match OfficeLocation.name)
  const location = await this.prisma.officeLocation.findFirst({
    where: { name: user.officeLocation, isActive: true },
    include: {
      supervisors: {
        where: { isPrimary: true },
        include: { user: { select: { id: true, displayName: true, email: true } } },
        take: 1,
      },
    },
  });
  return location; // null if no match
}
```

### 5.3 `GET /api/locations/:id` — Include Primary Supervisor in Response

Already includes supervisors (from `findById()`). No change needed. Frontend uses this to display "Approver: [Name]" in the wizard.

### 5.4 `POST /api/purchase-orders` — Accept `entityType`

**File:** `backend/src/validators/purchaseOrder.validators.ts`

```typescript
export const CreatePurchaseOrderSchema = z.object({
  // ... existing ...
  officeLocationId: z.string().uuid(...).optional().nullable(),
  entityType: z.enum(['SCHOOL', 'DEPARTMENT', 'PROGRAM']).optional().nullable(),
  // program field: keep for backward compat but mark as deprecated
  program: z.string().max(200, ...).optional().nullable(),
  // ...
});
```

**Service change** (`purchaseOrder.service.ts` → `createPurchaseOrder()`):

When `officeLocationId` is set, auto-populate `entityType` by looking up the location's type:

```typescript
// After opening the transaction, resolve entityType if not provided
let resolvedEntityType = data.entityType ?? null;
if (data.officeLocationId && !resolvedEntityType) {
  const loc = await tx.officeLocation.findUnique({
    where: { id: data.officeLocationId },
    select: { type: true },
  });
  resolvedEntityType = loc?.type === 'DISTRICT_OFFICE' ? null : (loc?.type ?? null);
}
```

Then include `entityType: resolvedEntityType` in the `tx.purchase_orders.create()` data object.

### 5.5 `POST /api/purchase-orders/:id/submit` — Location Supervisor Routing

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Method:** `submitPurchaseOrder()`

Replace the current personal-supervisor-only lookup with a prioritized lookup:

```typescript
// ── Priority supervisor resolution ──────────────────────────────────────────

let supervisorEmail: string | null = null;
let supervisorId: string | null = null;
let isSelfSupervisor = true;

// PRIORITY 1: Location's primary supervisor (if PO has an entity location)
if (po.officeLocationId) {
  try {
    const locationSupervisorRecord = await this.prisma.locationSupervisor.findFirst({
      where: { locationId: po.officeLocationId, isPrimary: true },
      include: { user: { select: { id: true, email: true } } },
    });

    if (locationSupervisorRecord && locationSupervisorRecord.userId !== po.requestorId) {
      supervisorId    = locationSupervisorRecord.userId;
      supervisorEmail = locationSupervisorRecord.user.email ?? null;
      isSelfSupervisor = false;
      logger.info('Using location supervisor for approval routing', {
        id,
        locationId:       po.officeLocationId,
        supervisorUserId: supervisorId,
      });
    }
    // If the location supervisor IS the requestor → stay in self-supervisor path
  } catch (err) {
    logger.warn('Location supervisor lookup failed, falling back to personal supervisor', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// PRIORITY 2: Personal supervisor fallback (when no entity location or no location supervisor)
if (isSelfSupervisor) {
  try {
    const personalSupervisorRecord = await this.prisma.userSupervisor.findFirst({
      where: { userId: po.requestorId, isPrimary: true },
      include: { supervisor: { select: { id: true, email: true } } },
    });

    if (personalSupervisorRecord && personalSupervisorRecord.supervisorId !== po.requestorId) {
      supervisorId    = personalSupervisorRecord.supervisorId;
      supervisorEmail = personalSupervisorRecord.supervisor.email ?? null;
      isSelfSupervisor = false;
    }
  } catch (err) {
    logger.warn('Personal supervisor lookup failed, using self-supervisor bypass', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Gate self-supervisor bypass on feature flag
const settings = await this.settingsService.getSettings();
if (!settings.supervisorBypassEnabled) {
  isSelfSupervisor = false;
}
```

The rest of the submit flow (req number claim, status history, email notifications) remains unchanged.

**Return type change** — update `SubmitPOResult` return to also include `supervisorId`:

```typescript
return { po: record, supervisorEmail, supervisorId, selfSupervisorBypass: false };
```

### 5.6 Validation Rule — Entity Type Consistency

In `createPurchaseOrder` and `updatePurchaseOrder`, validate that when `officeLocationId` is set, it refers to a non-DISTRICT_OFFICE location:

```typescript
if (data.officeLocationId) {
  const loc = await this.prisma.officeLocation.findUnique({
    where: { id: data.officeLocationId },
    select: { type: true, isActive: true },
  });
  if (!loc || !loc.isActive) {
    throw new ValidationError('Selected location not found or inactive', 'officeLocationId');
  }
  if (loc.type === 'DISTRICT_OFFICE') {
    throw new ValidationError(
      'Purchase orders cannot be assigned to a District Office location. Choose a School, Department, or Program.',
      'officeLocationId',
    );
  }
}
```

---

## 6. Proposed Frontend Changes

### 6.1 `RequisitionWizard.tsx` — Step 1 Details

**File:** `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`

#### 6.1.1 Fetch Locations Filtered by Type

Replace the existing `locationsData` query to fetch only SCHOOL/DEPARTMENT/PROGRAM types, and include supervisors in response for display:

```typescript
// Fetch entity locations: School, Department, Program only
const { data: locationsData } = useQuery({
  queryKey: ['locations', 'entity-types'],
  queryFn: async () => {
    const res = await api.get<LocationOptionWithSupervisor[]>('/locations', {
      params: { types: 'SCHOOL,DEPARTMENT,PROGRAM', isActive: true },
    });
    return res.data ?? [];
  },
  staleTime: 10 * 60 * 1000,
});

// Fetch user's own resolved location for auto-fill
const { data: myLocation } = useQuery({
  queryKey: ['users', 'me', 'office-location'],
  queryFn: async () => {
    const res = await api.get<OfficeLocationDetail | null>('/users/me/office-location');
    return res.data ?? null;
  },
  staleTime: 60 * 1000,
});
```

#### 6.1.2 Type Interface for Location Option

```typescript
interface LocationOptionWithSupervisor {
  id: string;
  name: string;
  type: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM';
  address?: string | null;
  supervisors?: Array<{
    userId: string;
    supervisorType: string;
    isPrimary: boolean;
    user: { displayName: string | null; email: string };
  }>;
}
```

#### 6.1.3 Group Dropdown by Type

Replace the flat Select with a grouped Autocomplete or grouped Select using MUI `ListSubheader`:

```tsx
// Group locations by type
const groupedLocations = useMemo(() => {
  const groups: Record<string, LocationOptionWithSupervisor[]> = {
    SCHOOL: [],
    DEPARTMENT: [],
    PROGRAM: [],
  };
  (locationOptions ?? []).forEach((loc) => {
    if (loc.type in groups) groups[loc.type].push(loc);
  });
  return groups;
}, [locationOptions]);
```

```tsx
<FormControl fullWidth>
  <InputLabel id="entity-location-label">Department / Program / School *</InputLabel>
  <Select
    labelId="entity-location-label"
    value={selectedLocationId ?? ''}
    label="Department / Program / School *"
    onChange={(e) => {
      const locId = e.target.value || null;
      setSelectedLocationId(locId);
      handleEntityLocationChange(locId);
    }}
  >
    <MenuItem value=""><em>None</em></MenuItem>
    
    {groupedLocations.SCHOOL.length > 0 && (
      <ListSubheader>Schools</ListSubheader>
    )}
    {groupedLocations.SCHOOL.map((loc) => (
      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
    ))}

    {groupedLocations.DEPARTMENT.length > 0 && (
      <ListSubheader>Departments</ListSubheader>
    )}
    {groupedLocations.DEPARTMENT.map((loc) => (
      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
    ))}

    {groupedLocations.PROGRAM.length > 0 && (
      <ListSubheader>Programs</ListSubheader>
    )}
    {groupedLocations.PROGRAM.map((loc) => (
      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
    ))}
  </Select>
</FormControl>
```

#### 6.1.4 Auto-Fill Logic for School Type

```typescript
const handleEntityLocationChange = useCallback((locId: string | null) => {
  setSelectedLocationId(locId);

  if (!locId) {
    // Clear auto-filled shipTo if previously auto-filled
    if (autoFilledShipTo) {
      setShipTo('');
      setAutoFilledShipTo(false);
    }
    setSelectedEntitySupervisor(null);
    return;
  }

  const loc = locationOptions.find((l) => l.id === locId);
  if (!loc) return;

  // If type = SCHOOL, auto-fill shipTo from user's own location
  if (loc.type === 'SCHOOL' && myLocation) {
    const shipToValue = myLocation.address
      ? `${myLocation.name}, ${myLocation.address}`
      : myLocation.name;
    setShipTo(shipToValue);
    setAutoFilledShipTo(true);
  } else if (loc.type !== 'SCHOOL') {
    // For Dept/Program: auto-fill with the entity name (location address if set)
    const shipToValue = loc.address ? `${loc.name}, ${loc.address}` : loc.name;
    setShipTo(shipToValue);
    setAutoFilledShipTo(true);
  }

  // Show primary supervisor for transparency
  const primarySupervisor = loc.supervisors?.find((s) => s.isPrimary);
  setSelectedEntitySupervisor(primarySupervisor ?? null);
}, [locationOptions, myLocation, autoFilledShipTo]);
```

New state variables needed:
```typescript
const [autoFilledShipTo, setAutoFilledShipTo] = useState(false);
const [selectedEntitySupervisor, setSelectedEntitySupervisor] = useState<SupervisorInfo | null>(null);
```

#### 6.1.5 Supervisor Preview Card

Below the entity selection dropdown, show a non-editing info card:

```tsx
{selectedEntitySupervisor && (
  <Box sx={{ bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200', 
             borderRadius: 1, p: 1.5, mt: -1 }}>
    <Typography variant="caption" color="info.700" fontWeight={600}>
      First Approver
    </Typography>
    <Typography variant="body2">
      {selectedEntitySupervisor.user.displayName ?? selectedEntitySupervisor.user.email}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {selectedEntitySupervisor.supervisorType.replace(/_/g, ' ')}
    </Typography>
  </Box>
)}
{selectedLocationId && !selectedEntitySupervisor && (
  <Alert severity="warning" sx={{ mt: -1 }}>
    No primary supervisor is assigned to this location. The requisition will require manual routing.
  </Alert>
)}
```

#### 6.1.6 Move Ship-To Below Entity Selection

Currently "Shipping Destination" (Select) → "Ship To" (TextField) in that order. New order:
1. **Department / Program / School** (Select — with type grouping)
2. **Ship To** (TextField — pre-filled, user-editable)
3. Remaining fields (Shipping Cost, Notes, etc.)

Remove the old duplicate "Shipping Destination" Select entirely — the entity selection IS the new primary location field.

### 6.2 `PurchaseOrderDetail.tsx` — Display Entity Type

Show the entity type badge (School / Department / Program) alongside the location name:

```tsx
{po.officeLocation && (
  <Box>
    <Typography variant="caption" color="text.secondary">Department / School / Program</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2">{po.officeLocation.name}</Typography>
      {po.entityType && (
        <Chip
          label={po.entityType.charAt(0) + po.entityType.slice(1).toLowerCase()}
          size="small"
          color={po.entityType === 'SCHOOL' ? 'primary' : 'default'}
        />
      )}
    </Box>
  </Box>
)}
```

### 6.3 `purchaseOrder.types.ts` — Add `entityType`

```typescript
export interface PurchaseOrderSummary {
  // ... existing ...
  entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null;
  officeLocation?: POOfficeLocation | null;
}

// Extend POOfficeLocation to include type
export interface POOfficeLocation {
  id: string;
  name: string;
  code?: string | null;
  type?: string | null;  // ADD
}
```

### 6.4 `CreatePurchaseOrderInput` — Add `entityType`

```typescript
export interface CreatePurchaseOrderInput {
  // ... existing ...
  officeLocationId?: string | null;
  entityType?: 'SCHOOL' | 'DEPARTMENT' | 'PROGRAM' | null;  // ADD
}
```

### 6.5 `PurchaseOrderList.tsx` — Entity Type Column

Add an optional "Entity" column to the PO list grid showing the linked location and its type chip. Only visible on medium+ screens.

---

## 7. Approval Routing Logic

### 7.1 Complete Decision Tree for Supervisor Resolution

```
submitPurchaseOrder(poId, userId)
│
├─ PO has officeLocationId?
│  │
│  ├─ YES → query LocationSupervisor WHERE locationId = po.officeLocationId AND isPrimary = true
│  │       │
│  │       ├─ Record found AND supervisorId ≠ requestorId
│  │       │  └─ supervisorEmail = location.user.email
│  │       │     isSelfSupervisor = false
│  │       │     [EMAIL: location supervisor notified]
│  │       │
│  │       ├─ Record found BUT supervisorId = requestorId
│  │       │  └─ isSelfSupervisor = true  → bypass path (if enabled)
│  │       │
│  │       └─ No primary location supervisor found
│  │          └─ FALLBACK: query UserSupervisor WHERE userId = requestorId AND isPrimary = true
│  │             └─ [same evaluation as NO path below]
│  │
│  └─ NO (no officeLocationId) → query UserSupervisor WHERE userId = requestorId AND isPrimary = true
│        │
│        ├─ Personal supervisor found AND supervisorId ≠ requestorId
│        │  └─ supervisorEmail = personal.supervisor.email
│        │     isSelfSupervisor = false
│        │
│        └─ No personal supervisor OR supervisorId = requestorId
│           └─ isSelfSupervisor = true → bypass path (if settings.supervisorBypassEnabled)
│
├─ isSelfSupervisor = false → status: draft → submitted
│  [EMAIL to supervisorEmail]
│
└─ isSelfSupervisor = true + bypass enabled → status: draft → supervisor_approved (2 history rows)
   [EMAIL to Finance Director permission level users]
```

### 7.2 Full Approval Chain After Submission

```
submitted
  ↓ [LocationSupervisor or UserSupervisor with REQUISITIONS level ≥ 3]
supervisor_approved
  ↓ [REQUISITIONS level 5 — Finance Director]
finance_director_approved
  ↓ [REQUISITIONS level 6 — Director of Schools]
dos_approved
  ↓ [REQUISITIONS level 4 — PO Entry: assign account code]
  ↓ [REQUISITIONS level 4 — PO Entry: issue PO number]
po_issued  ← terminal
         ↘ denied (from any active stage, level ≥ 3)
```

The approval levels (3 / 5 / 6 / 4) remain completely unchanged. Only the **identity of the supervisor in step 1** changes — they still need REQUISITIONS level ≥ 3 on their own account to perform the approval.

### 7.3 Edge Cases

| Scenario | Behavior |
|---|---|
| Entity location has no primary supervisor | Fall back to requestor's personal supervisor |
| Entity location's primary supervisor IS the requestor | Self-supervisor bypass (if enabled in settings) |
| Entity location's primary supervisor does not have REQUISITIONS ≥ 3 | They receive the email notification but cannot approve in the app — a warning should be shown in the wizard |
| officeLocationId not set | Behavior identical to current system (personal supervisor routing) |
| officeLocationId set to DISTRICT_OFFICE | Blocked by new validation in service layer |

### 7.4 Supervisor Capability Warning

In the wizard, after resolving the entity's primary supervisor, optionally check if they have REQUISITIONS level ≥ 3. If not, display a warning:

> "Warning: The assigned supervisor for this location may not have approval permissions. Contact an administrator."

This check requires a new API call (`GET /api/users/:supervisorId/permissions`) or the supervisor's permission level to be included in the LocationSupervisor include response. **Recommend deferring this to a follow-up task** to avoid over-engineering the initial implementation.

---

## 8. Security Considerations

### 8.1 Input Validation

- `officeLocationId` must be a valid UUID (existing Zod validation covers this)
- `entityType` is validated against enum `['SCHOOL', 'DEPARTMENT', 'PROGRAM']` in Zod schema (no arbitrary strings)
- Server-side validation in `createPurchaseOrder` confirms the FK exists and is active
- Server-side validation rejects `DISTRICT_OFFICE` type (prevents spoofing approval routing to district-level supervisor)

### 8.2 Approval Routing Integrity

- The supervisor lookup happens in the **service layer on the server**, never trusting client-provided supervisor IDs
- The client cannot specify who the supervisor is — it is always derived from `LocationSupervisor` or `UserSupervisor` tables
- Self-supervisor bypass is gated behind the `supervisorBypassEnabled` feature flag in `SystemSettings` — an admin-controlled server-side flag
- All status transitions are validated against the `approvalRequirements` map (from `getApprovalRequirements()` which reads dynamic levels from `SystemSettings`)
- CSRF tokens are required on all state-changing routes (already in place via `validateCsrfToken`)

### 8.3 Location Data Access

- `GET /api/locations` (including with `types` filter) requires `authenticate` middleware (existing)
- `GET /api/users/me/office-location` requires authentication and only returns the **current user's** location — no user ID spoofing possible since `userId` comes from the JWT, not the request body
- The `types` query parameter is a whitelist-validated enum — unexpected type values are ignored (or the Zod schema rejects them)

### 8.4 Audit Trail

- The supervisor routing decision is logged: `logger.info('Using location supervisor for approval routing', { id, locationId, supervisorUserId })`
- All status transitions continue to write `RequisitionStatusHistory` rows
- The `notes` field on history rows should capture routing decisions for transparency in the audit trail

### 8.5 OWASP Top 10 — Applicable Items

| Risk | Mitigation |
|---|---|
| **A1 Broken Access Control** | Permission level checks unchanged; only supervisor lookup source changes |
| **A3 Injection** | All inputs go through Zod validation + Prisma parameterized queries; no raw SQL |
| **A5 Security Misconfiguration** | No new environment variables; feature flags stay in SystemSettings |
| **A7 Auth Failures** | New endpoint `/users/me/office-location` uses `req.user!.id` from JWT middleware, not request param |

---

## 9. Step-by-Step Implementation Plan

### Phase A — Backend (no migration yet)

**Step A1** — Add type filter to location endpoint  
Files: `location.service.ts`, `location.controller.ts`  
- Add optional `types` query param to `findAll()`
- Validate `types` as array of `LocationType` values
- Test with `GET /api/locations?types=SCHOOL,DEPARTMENT,PROGRAM`

**Step A2** — Add `GET /api/users/me/office-location` endpoint  
Files: `user.routes.ts`, `user.controller.ts`, `user.service.ts`  
- Look up `User.officeLocation` string, then query `OfficeLocation` by name match
- Include primary supervisor in response
- Return 204 if no location set

**Step A3** — Update validator to add `entityType`  
File: `purchaseOrder.validators.ts`  
- Add `entityType: z.enum(['SCHOOL', 'DEPARTMENT', 'PROGRAM']).optional().nullable()` to both Create and Update schemas
- Export updated DTO types

**Step A4** — Update `createPurchaseOrder` and `updatePurchaseOrder` service methods  
File: `purchaseOrder.service.ts`  
- Add `DISTRICT_OFFICE` validation guard when `officeLocationId` is provided
- Auto-resolve `entityType` from the linked `OfficeLocation.type` when creating
- Write `entityType` to the PO record

**Step A5** — Update `submitPurchaseOrder` approval routing  
File: `purchaseOrder.service.ts`  
- Implement the priority lookup: LocationSupervisor first, UserSupervisor fallback
- Log the routing decision
- Update return type to include `supervisorId`

**Step A6** — Update `getPurchaseOrders` list include to expose `entityType` via `officeLocation`  
File: `purchaseOrder.service.ts`  
- Add `type` to the officeLocation select in the list query

### Phase B — Database Migration

**Step B1** — Create Prisma migration  
```bash
cd backend
npx prisma migrate dev --name "add_po_entity_type"
```
This adds `entityType String?` to `purchase_orders` and creates the index.

**Step B2** — Run the migration on dev, then production

**Step B3** — Backfill existing PO records  
Run the backfill SQL in a migration or one-time script to set `entityType` from the linked `OfficeLocation.type` for any existing POs that have `officeLocationId` set.

### Phase C — Frontend

**Step C1** — Update `purchaseOrder.types.ts`  
- Add `entityType` to `PurchaseOrderSummary` and `PurchaseOrder`
- Add `type` to `POOfficeLocation`
- Add `entityType` to `CreatePurchaseOrderInput`

**Step C2** — Update `RequisitionWizard.tsx` — Step 1  
- Add `autoFilledShipTo` and `selectedEntitySupervisor` state
- Change locations query to filter by types  
- Replace "Shipping Destination" Select with grouped "Department / Program / School" Select
- Implement `handleEntityLocationChange` with auto-fill logic
- Add supervisor preview card below the entity select
- Add query for `/users/me/office-location`

**Step C3** — Update `buildPayload()` in wizard to include `entityType`  
- Derive `entityType` from the selected location's type when building the create payload

**Step C4** — Update `PurchaseOrderDetail.tsx`  
- Show entity type chip next to location name

**Step C5** — Update `PurchaseOrderList.tsx` (optional)  
- Add entity type column or indicator in the list table

### Phase D — Testing

| Test | Assertion |
|---|---|
| Create PO with SCHOOL location | `entityType = 'SCHOOL'`, `shipTo` auto-filled from user.officeLocation |
| Create PO with DEPARTMENT location | `entityType = 'DEPARTMENT'`, `shipTo` auto-filled from dept address |
| Create PO with no location | `entityType = null`, routing unchanged |
| Submit PO with location + primary supervisor | `submitted` status, supervisor email notified |
| Submit PO with location, no primary supervisor | Falls back to UserSupervisor routing |
| Submit PO with location, supervisor is requestor | Self-supervisor bypass path |
| Submit PO with DISTRICT_OFFICE locationId (via direct API call) | 422 ValidationError |
| Approve by location supervisor (perm level 3) | `supervisor_approved` transition succeeds |
| GET /api/locations?types=SCHOOL | Returns only SCHOOL type locations |
| GET /api/users/me/office-location when user has officeLocation | Returns OfficeLocation record |
| GET /api/users/me/office-location when user has no officeLocation | Returns 204 |

---

## 10. Open Questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should `officeLocationId` remain optional or become **required** on submission? | Keep optional for backward compat; make required a future enforcement step via SystemSettings flag |
| Q2 | When School is selected and user's `officeLocation` doesn't match any OfficeLocation record, what happens? | Fall silent — ship-to is not auto-filled; user fills it manually; no error |
| Q3 | Should the existing `program` free-text field be removed or kept? | Keep for legacy POs; hide from wizard UI; deprecate over time |
| Q4 | Should we warn the user if the entity's primary supervisor lacks REQUISITIONS ≥ 3? | Defer to a follow-up task — adds complexity without blocking routing |
| Q5 | Does `DISTRICT_OFFICE` ever need to be selectable on a PO? | No per requirements; blocked in validation. Revisit if food requisitions or central purchasing need it |
| Q6 | The `program` field appears in the search query (`OR` clause in `getPurchaseOrders`) — should search also match `officeLocation.name`? | Yes — after implementation, add `officeLocation.name` to the search `OR` clause using a join filter |
| Q7 | Should `RequisitionStatusHistory.notes` record the entity name and supervisor name at submission time for immutable audit trail? | Recommended: append `"Entity: [location.name] — Routed to: [supervisor.displayName]"` in notes |

---

## 11. File Change Summary

| File | Change Type | Description |
|---|---|---|
| `backend/prisma/schema.prisma` | Modify | Add `entityType String?` and `@@index([entityType])` to `purchase_orders` |
| `backend/prisma/migrations/...` | New | Auto-generated migration for `entityType` column |
| `backend/src/validators/purchaseOrder.validators.ts` | Modify | Add `entityType` to Create/Update schemas |
| `backend/src/services/purchaseOrder.service.ts` | Modify | Add entityType resolution, DISTRICT_OFFICE guard, location supervisor routing |
| `backend/src/services/location.service.ts` | Modify | Add `types` filter to `findAll()` |
| `backend/src/controllers/location.controller.ts` | Modify | Extract `types` query param |
| `backend/src/services/user.service.ts` | Modify | Add `getMyOfficeLocation(userId)` method |
| `backend/src/controllers/user.controller.ts` | Modify | Add `getMyOfficeLocation` handler |
| `backend/src/routes/user.routes.ts` | Modify | Add `GET /me/office-location` route |
| `frontend/src/types/purchaseOrder.types.ts` | Modify | Add `entityType` to interfaces, `type` to `POOfficeLocation` |
| `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Modify | Replace Shipping Destination with entity selector, auto-fill, supervisor preview |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | Modify | Show entityType chip |
| `shared/src/types.ts` | No change | `LocationType` already includes all needed values |

**Total files to change: 12**  
**New files: 1** (Prisma migration only, auto-generated)  
**No new tables, no existing column removal**

---

*Specification complete. Ready for Phase 2 — Implementation.*

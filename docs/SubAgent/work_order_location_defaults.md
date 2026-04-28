# Work Order Location Defaults — Specification

> **Author:** Copilot Phase 1 Research  
> **Date:** 2026-04-23  
> **Goal:** Default the work order form's Location and Room fields to the logged-in user's assigned school/room, while still allowing override.

---

## 1. Current State Analysis

### 1.1 How the form works today

The **NewWorkOrderPage** (`frontend/src/pages/NewWorkOrderPage.tsx`) is a two-step form:

1. **Step 1** — User selects a department (`TECHNOLOGY` or `MAINTENANCE`) via the `DepartmentSelector` component.
2. **Step 2** — User fills in: Category, Priority, Title, Description, **Location** (dropdown), **Room** (dropdown, conditional on location pick), and department-specific fields.

**Location / Room selection today:**
- Both fields start **empty** (`officeLocationId: ''`, `roomId: ''`).
- Location is a `<Select>` populated by `useLocations()` which calls `GET /api/locations` (returns all active `OfficeLocation` records).
- Room `<Select>` only appears when a location is selected, populated by `useRoomsByLocation(officeLocationId)` which calls `GET /api/rooms?locationId={id}`.
- Both fields are **optional** — the user can submit with `— None —`.
- There is **no pre-population** from the user's profile.

### 1.2 Relevant initial state

```ts
const INITIAL: FormState = {
  department: null,
  category: '',
  priority: 'MEDIUM',
  title: '',
  description: '',
  officeLocationId: '',   // ← always empty
  roomId: '',             // ← always empty
  inventoryId: '',
  mfg: '',
  model: '',
  serial: '',
};
```

---

## 2. Data Model Analysis

### 2.1 User model (`users` table)

Key fields for location/room:

| Field | Type | Description |
|---|---|---|
| `officeLocation` | `String?` | Free-text location name synced from Microsoft Entra ID (e.g. `"Hillcrest Elementary"`). **Not** a foreign key. |
| `primaryRoomId` | `String?` | FK → `rooms.id`. The user's assigned primary room. |
| `primaryRoom` | `Room?` | Relation to `Room` model. |
| `user_rooms` | `user_rooms[]` | Legacy many-to-many join table (references old `locations` model, not `OfficeLocation`). |

**Important:** `User.officeLocation` is a **string**, not a foreign key. To resolve it to an `OfficeLocation` record (UUID), the backend has `getMyOfficeLocation()` which does a case-insensitive name match.

### 2.2 Room model (`rooms` table)

| Field | Type | Description |
|---|---|---|
| `id` | `String` (UUID) | Primary key |
| `locationId` | `String` | FK → `office_locations.id` |
| `name` | `String` | Room name/number |
| `location` | `OfficeLocation` | Parent location |
| `primaryUsers` | `User[]` | Users assigned to this room via `UserPrimaryRoom` relation |

### 2.3 OfficeLocation model (`office_locations` table)

| Field | Type | Description |
|---|---|---|
| `id` | `String` (UUID) | Primary key |
| `name` | `String` | Location name (e.g. `"Hillcrest Elementary"`) |
| `type` | `String` | `SCHOOL`, `DEPARTMENT`, `PROGRAM`, `DISTRICT_OFFICE` |
| `rooms` | `Room[]` | Child rooms |

### 2.4 Ticket model (`tickets` table) — the work order

| Field | Type | Description |
|---|---|---|
| `officeLocationId` | `String?` | FK → `office_locations.id` |
| `roomId` | `String?` | FK → `rooms.id` |

Both are optional. They accept UUIDs.

### 2.5 Relationship chain

```
User.officeLocation (string "Hillcrest Elementary")
  ──name-match──▶ OfficeLocation.id (UUID)
                     └──▶ Room[] (children)

User.primaryRoomId (UUID)
  ──FK──▶ Room.id
              └──▶ Room.locationId ──FK──▶ OfficeLocation.id
```

**Key insight:** `User.primaryRoom.locationId` gives us the `officeLocationId` directly as a UUID — no name-matching needed. If `primaryRoomId` is set, we get both the room and its parent location in a single Prisma include.

---

## 3. Existing API Endpoints

### 3.1 `GET /api/users/me` (user.routes.ts)

Returns `UserWithPermissions`:
```ts
{
  id, entraId, email, firstName, lastName, displayName,
  department, jobTitle, officeLocation, // ← string, not UUID
  role, isActive, lastSync, lastLogin,
  primaryRoom: { id: string; name: string } | null  // ← has room ID + name
}
```

**Missing:** Does NOT include the `officeLocationId` UUID or the room's `locationId`. The `primaryRoom` select only returns `{ id, name }`.

### 3.2 `GET /api/users/me/office-location` (user.routes.ts)

Resolves `User.officeLocation` (string) → `OfficeLocation` record via case-insensitive name match. Returns the full location record with supervisors. Used by the RequisitionWizard for PO shipping.

### 3.3 `GET /api/locations` (location.routes.ts)

Returns all active `OfficeLocation` records. Used by `useLocations()`.

### 3.4 `GET /api/rooms?locationId={id}` (implied by useRoomsByLocation)

Returns rooms for a specific location. Used by `useRoomsByLocation()`.

### 3.5 `POST /api/work-orders` (work-orders.routes.ts)

Accepts `CreateWorkOrderDto`:
```ts
{
  department: 'TECHNOLOGY' | 'MAINTENANCE',
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  officeLocationId?: string (UUID),  // ← optional
  roomId?: string (UUID),            // ← optional
  title: string,
  description: string,
  category?: string,
  // + department-specific fields
}
```

No backend changes needed for the create endpoint — it already accepts optional `officeLocationId` and `roomId`.

---

## 4. Frontend Auth Store

`frontend/src/store/authStore.ts` stores:
```ts
interface User {
  id, entraId, email, name, firstName, lastName, jobTitle, department,
  groups, roles, hasBaseAccess, permLevels
}
```

**Does NOT store** `officeLocation`, `primaryRoom`, or any location data. The auth store is populated during login from the auth callback, not from `/users/me`.

---

## 5. Proposed Solution Architecture

### 5.1 Strategy: Resolve user's default location via `primaryRoom`

**Why `primaryRoom` is better than `officeLocation` string:**
- `primaryRoom` is a real FK → gives us a UUID immediately.
- `Room.locationId` → gives us `officeLocationId` UUID with zero additional queries.
- `officeLocation` is a string requiring fuzzy name matching (fragile).
- `primaryRoom` already exists on most users who have room assignments.

**Fallback:** If `primaryRoomId` is null but `officeLocation` string exists, use `/users/me/office-location` to resolve it.

### 5.2 Backend Changes

#### A. Expand `GET /api/users/me` response to include location context

**File:** `backend/src/services/user.service.ts`

In `findById()`, expand the `primaryRoom` include to also return `locationId`:

```ts
// Current:
primaryRoom: { select: { id: true, name: true } }

// Proposed:
primaryRoom: { select: { id: true, name: true, locationId: true } }
```

Update `UserWithPermissions` interface and `formatUserWithPermissions()` accordingly.

**File:** `backend/src/services/user.service.ts` — interface `UserWithPermissions`

```ts
// Current:
primaryRoom?: { id: string; name: string } | null;

// Proposed:
primaryRoom?: { id: string; name: string; locationId: string } | null;
```

#### B. No changes needed to work order endpoints

The `POST /api/work-orders` endpoint already accepts optional `officeLocationId` and `roomId` — no modification required.

### 5.3 Frontend Changes

#### A. Update User type to include `locationId` on `primaryRoom`

**File:** `frontend/src/services/userService.ts`

```ts
// Current:
primaryRoom?: { id: string; name: string } | null;

// Proposed:
primaryRoom?: { id: string; name: string; locationId: string } | null;
```

#### B. Create a custom hook: `useUserDefaultLocation`

**New file:** `frontend/src/hooks/queries/useUserDefaultLocation.ts`

Purpose: Fetches the current user's default location + room for form pre-population.

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';

interface UserDefaultLocation {
  officeLocationId: string | null;
  roomId: string | null;
}

/**
 * Resolves the user's default officeLocationId + roomId.
 * Priority:
 *   1. primaryRoom → room.locationId + room.id
 *   2. /users/me/office-location → resolved OfficeLocation.id (no room)
 *   3. null/null
 */
export function useUserDefaultLocation(): { data: UserDefaultLocation | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.users?.defaultLocation ?? ['users', 'me', 'default-location'],
    queryFn: async (): Promise<UserDefaultLocation> => {
      // Step 1: Get user profile with primaryRoom
      const meRes = await api.get('/users/me');
      const me = meRes.data;

      if (me.primaryRoom?.locationId && me.primaryRoom?.id) {
        return {
          officeLocationId: me.primaryRoom.locationId,
          roomId: me.primaryRoom.id,
        };
      }

      // Step 2: Fall back to office-location resolution
      try {
        const locRes = await api.get('/users/me/office-location');
        if (locRes.data?.resolved && locRes.data?.id) {
          return { officeLocationId: locRes.data.id, roomId: null };
        }
      } catch {
        // 204 or error — no office location
      }

      return { officeLocationId: null, roomId: null };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return { data: query.data ?? null, isLoading: query.isLoading };
}
```

#### C. Modify `NewWorkOrderPage.tsx` to pre-populate

**File:** `frontend/src/pages/NewWorkOrderPage.tsx`

1. Import `useUserDefaultLocation`.
2. After the component mounts / after user defaults are loaded, set `officeLocationId` and `roomId` in form state.
3. Add a visual indicator showing "Defaulted to your assigned location" with an option to change.

**Key changes:**

```tsx
// Add import
import { useUserDefaultLocation } from '@/hooks/queries/useUserDefaultLocation';

// Inside component:
const { data: userDefaults, isLoading: defaultsLoading } = useUserDefaultLocation();

// Track whether user has manually changed location
const [locationOverridden, setLocationOverridden] = useState(false);

// useEffect to apply defaults once loaded
useEffect(() => {
  if (userDefaults && !locationOverridden) {
    setForm(prev => ({
      ...prev,
      officeLocationId: userDefaults.officeLocationId ?? '',
      roomId: userDefaults.roomId ?? '',
    }));
  }
}, [userDefaults, locationOverridden]);

// Modify location onChange to mark override
const handleLocationChange = (locId: string) => {
  set('officeLocationId', locId);
  set('roomId', '');
  setLocationOverridden(true);
};
```

4. Add a helper text under the Location dropdown:
```tsx
{!locationOverridden && userDefaults?.officeLocationId && (
  <FormHelperText>
    Pre-filled from your assigned location. You can change it above.
  </FormHelperText>
)}
```

---

## 6. Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `backend/src/services/user.service.ts` | Add `locationId` to `primaryRoom` select in `findById()` and `findAll()`; update `UserWithPermissions` interface |
| 2 | `frontend/src/services/userService.ts` | Update `User.primaryRoom` type to include `locationId` |
| 3 | `frontend/src/hooks/queries/useUserDefaultLocation.ts` | **NEW** — Custom hook to resolve user's default location + room |
| 4 | `frontend/src/pages/NewWorkOrderPage.tsx` | Pre-populate location/room from defaults, add override tracking, add helper text |

---

## 7. Implementation Steps

### Step 1: Backend — Expand `primaryRoom` include
1. In `backend/src/services/user.service.ts`, update the `UserWithPermissions` interface:
   - Change `primaryRoom?: { id: string; name: string } | null` → `primaryRoom?: { id: string; name: string; locationId: string } | null`
2. Update `findById()` Prisma include:
   - Change `primaryRoom: { select: { id: true, name: true } }` → `primaryRoom: { select: { id: true, name: true, locationId: true } }`
3. Update `findAll()` Prisma include similarly.
4. No change needed in `formatUserWithPermissions()` — it passes through `user.primaryRoom` as-is.

### Step 2: Frontend — Update User type
1. In `frontend/src/services/userService.ts`, update the `User` interface `primaryRoom` field to include `locationId: string`.

### Step 3: Frontend — Create `useUserDefaultLocation` hook
1. Create `frontend/src/hooks/queries/useUserDefaultLocation.ts` with the logic described in §5.3.B.
2. Add a query key to `frontend/src/lib/queryKeys.ts` if it uses a centralized key registry.

### Step 4: Frontend — Update `NewWorkOrderPage.tsx`
1. Import `useUserDefaultLocation`.
2. Add `locationOverridden` state.
3. Add `useEffect` to apply defaults from the hook.
4. Modify the Location `<Select>` `onChange` to call `setLocationOverridden(true)`.
5. Add `<FormHelperText>` below the Location dropdown indicating auto-fill.
6. Ensure Room dropdown triggers properly when `officeLocationId` is set by defaults (the existing `useRoomsByLocation` hook should handle this automatically since it watches the `officeLocationId` value).

---

## 8. Security Considerations

1. **Authentication:** All endpoints involved (`/users/me`, `/users/me/office-location`, `/work-orders`) already require authentication via `authenticate` middleware. No changes needed.
2. **Authorization:** The `POST /api/work-orders` endpoint requires `WORK_ORDERS` level 2+. Location/room IDs submitted are validated as UUIDs by Zod schemas. No additional auth checks needed for pre-population.
3. **Input validation:** The `CreateWorkOrderSchema` already validates `officeLocationId` and `roomId` as optional UUIDs. The backend does not verify that the room belongs to the specified location — this is a pre-existing design choice (considered low risk since it's the user's own work order).
4. **Data exposure:** Expanding `primaryRoom` to include `locationId` exposes a UUID that's already available via `/locations` endpoint — no new data leakage.
5. **CSRF:** All state-changing routes already use `validateCsrfToken` middleware.

---

## 9. Potential Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| User has no `primaryRoomId` and no `officeLocation` string | Form defaults remain empty (current behavior) | Graceful fallback — hook returns `null/null`, form stays empty |
| `officeLocation` string doesn't match any `OfficeLocation.name` | `/users/me/office-location` returns `resolved: false` | Hook treats unresolved as no default — form stays empty |
| User's `primaryRoom` belongs to an inactive location | Room/location might not appear in dropdown | Both `useLocations()` and `useRoomsByLocation()` filter by `isActive` — if the location is inactive, the default won't match any dropdown option. Consider filtering in the hook. |
| Race condition: defaults load after user starts typing | Could overwrite user's manual selection | The `locationOverridden` flag prevents this — defaults only apply if user hasn't touched the field |
| Adding `locationId` to `primaryRoom` breaks existing consumer expectations | Backward compatible — adding a field to an object is non-breaking | TypeScript will catch any issues at compile time |
| Performance: Extra API call for `/users/me` on page load | Minimal — `useUserDefaultLocation` fires once and caches for 5 min | Uses TanStack Query caching; `/users/me` response is lightweight |

---

## 10. Precedent: RequisitionWizard Pattern

The **RequisitionWizard** (`frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`) already implements a similar pattern:
- Fetches `GET /users/me/office-location` to get the user's assigned location.
- Uses the resolved location for "Ship to my office" default.
- This validates the approach and demonstrates the API is production-ready.

The work order form can follow the same pattern but enhance it by also using `primaryRoom` for room-level defaults.

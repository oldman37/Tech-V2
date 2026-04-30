# User-to-Room Assignment — Comprehensive Feature Specification

**Date:** 2026-04-30  
**Feature:** User-to-Room Assignment  
**Spec Path:** `docs/SubAgent/user_room_assignment_spec.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Access Control Design](#3-access-control-design)
4. [Data Model](#4-data-model)
5. [Backend API Design](#5-backend-api-design)
6. [Frontend Design](#6-frontend-design)
7. [Security Considerations](#7-security-considerations)
8. [Implementation Steps](#8-implementation-steps)
9. [Migration Plan](#9-migration-plan)

---

## 1. Executive Summary

This feature enables **System Admins** and the **primary supervisor** of each school/office to assign users (all_staff role or any user type) to one or more rooms. It supports viewing which users are in which rooms, assigning/unassigning individuals or bulk groups, and searching/filtering users for assignment.

The feature introduces a new Prisma join model (`UserRoomAssignment`) for the many-to-many `User` ↔ `Room` relationship, a set of REST endpoints scoped by locationId and roomId, and a dedicated frontend page accessible to admins and primary supervisors.

---

## 2. Current State Analysis

### 2.1 Relevant Existing Models

#### `user_rooms` (legacy join table — NOT for this feature)
```prisma
model user_rooms {
  id         String    @id @default(uuid())
  userId     String
  locationId String    // FK → legacy `locations` table (NOT OfficeLocation)
  assignedAt DateTime  @default(now())
  locations  locations @relation(...)
  User       User      @relation(...)
  @@unique([userId, locationId])
}
```
> **Critical:** `user_rooms` links `User` → old `locations` table (legacy, pre-refactor), **not** the new `Room` model (`@@map("rooms")`). Do not repurpose this table.

#### `Room` model (`rooms` table)
```prisma
model Room {
  id           String         @id @default(uuid())
  locationId   String                              // FK → OfficeLocation.id
  name         String
  type         String?
  building     String?
  floor        Int?
  capacity     Int?
  isActive     Boolean        @default(true)
  notes        String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  createdBy    String?
  updatedBy    String?
  location     OfficeLocation @relation(...)
  equipment    equipment[]
  tickets      Ticket[]
  primaryUsers User[]         @relation("UserPrimaryRoom")
  @@unique([locationId, name])
  @@map("rooms")
}
```

#### `User` model (relevant fields)
```prisma
model User {
  // ...
  primaryRoomId   String?
  primaryRoom     Room?   @relation("UserPrimaryRoom", fields: [primaryRoomId], references: [id])
  user_rooms      user_rooms[]  // legacy — points to old locations table
  // ...
  @@map("users")
}
```
> `primaryRoomId` and the `UserPrimaryRoom` relation **already exist** in the schema (added per `user_room_import_spec.md`). This supports the "primary room" concept for a single designated room per user.

#### `LocationSupervisor` model
```prisma
model LocationSupervisor {
  id             String         @id @default(uuid())
  locationId     String                              // FK → OfficeLocation.id
  userId         String                              // FK → User.id
  supervisorType String
  isPrimary      Boolean        @default(false)
  assignedAt     DateTime       @default(now())
  assignedBy     String?
  // ...
  @@map("location_supervisors")
}
```
> `isPrimary: true` on this model is how we identify the **main supervisor** of a school/office. A user can be the primary supervisor of at most one location per supervisorType, but we check any isPrimary record for the given locationId.

#### `OfficeLocation` model
```prisma
model OfficeLocation {
  id    String  @id @default(uuid())
  name  String  @unique
  rooms Room[]
  // ...
  @@map("office_locations")
}
```

### 2.2 Gap Analysis

| Need | Current State | Action Required |
|------|--------------|-----------------|
| Many-to-many User ↔ Room (new Room model) | **Missing** | Create `UserRoomAssignment` model |
| Track who assigned, when | **Missing** | Add `assignedBy`, `assignedAt` to new model |
| API endpoints for room-user mgmt | **Missing** | New controller + routes |
| Frontend page | **Missing** | New page + hooks + service |
| Primary room per user | Already exists (`primaryRoomId`) | Use existing |

### 2.3 Existing Patterns to Follow

- **Route protection**: `authenticate` + (`requireAdmin` OR custom supervisor check) + `validateCsrfToken` for mutations
- **Controller pattern**: `handleControllerError(error, res)` for error normalization
- **Service pattern**: class-based, constructor-injected `PrismaClient`
- **Validation**: Zod schema in `validators/` + `validateRequest(schema, 'body'|'params'|'query')`
- **Frontend hooks**: `useQuery` + `useMutation` from `@tanstack/react-query`; query keys in `queryKeys` factory
- **Frontend service**: class or object with methods calling `api.get/post/put/delete`
- **ProtectedRoute**: `requireAdmin` prop gates admin-only pages

---

## 3. Access Control Design

### 3.1 Who Can Access This Feature

| Actor | Can Do | Scope |
|-------|--------|-------|
| **System Admin** (`role === 'ADMIN'`) | Assign/unassign any user to any room | All schools/offices |
| **Primary Supervisor** of a location | Assign/unassign users to rooms within their location only | Their school/office only |
| All other users | **No access** | N/A |

### 3.2 How "Primary Supervisor" is Determined

A user is the **primary supervisor** of a location if **any** `LocationSupervisor` record exists where:
```sql
locationId = :locationId AND userId = :requestingUserId AND isPrimary = true
```

There is no requirement that they hold a specific supervisorType — any isPrimary assignment to the location grants scoped access.

### 3.3 Backend Enforcement Strategy

**New middleware function** in `backend/src/middleware/auth.ts` (or `utils/groupAuth.ts`):

```typescript
export function requireAdminOrPrimarySupervisor(locationIdSource: 'body' | 'params' | 'query' = 'params') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }
    // ADMIN bypasses scoping check
    if (req.user.roles?.includes('ADMIN')) {
      next(); return;
    }
    // Resolve locationId from the request
    const locationId = req[locationIdSource]?.locationId as string | undefined;
    if (!locationId) {
      res.status(400).json({ error: 'locationId is required' }); return;
    }
    // DB query: verify user is primary supervisor of this location
    const record = await prisma.locationSupervisor.findFirst({
      where: { locationId, userId: req.user.id, isPrimary: true, user: { isActive: true } },
    });
    if (!record) {
      res.status(403).json({ error: 'Forbidden', message: 'You are not the primary supervisor of this location' });
      return;
    }
    next();
  };
}
```

For room-level endpoints (where `roomId` is in params but not `locationId`), the controller resolves the room's `locationId` first, then enforces the same check inline.

### 3.4 Frontend Authorization

Two additional checks in `ProtectedRoute` / page-level guard:
1. **Admin check**: `user.roles.includes('ADMIN')` → render the page
2. **Primary supervisor check**: call `GET /api/users/me/supervised-locations` (already exists) and check if any returned location has `isPrimary: true`. If yes, render the page for that location only.

Add a new `requireRoomAssignment` prop to `ProtectedRoute` (or implement a standalone guard hook `useRoomAssignmentAccess`).

---

## 4. Data Model

### 4.1 New Model: `UserRoomAssignment`

Add to `backend/prisma/schema.prisma`:

```prisma
model UserRoomAssignment {
  id          String   @id @default(uuid())
  userId      String
  roomId      String
  assignedAt  DateTime @default(now())
  assignedBy  String                     // User.id of who made the assignment
  notes       String?

  user        User     @relation("UserRoomAssignments", fields: [userId], references: [id], onDelete: Cascade)
  room        Room     @relation("RoomUserAssignments", fields: [roomId], references: [id], onDelete: Cascade)
  assignedByUser User  @relation("UserRoomAssignmentsMadeBy", fields: [assignedBy], references: [id])

  @@unique([userId, roomId])
  @@index([userId])
  @@index([roomId])
  @@index([assignedBy])
  @@index([assignedAt])
  @@map("user_room_assignments")
}
```

### 4.2 Required Updates to Existing Models

**`Room` model** — add reverse relation:
```prisma
model Room {
  // ...existing fields...
  primaryUsers        User[]               @relation("UserPrimaryRoom")
  userAssignments     UserRoomAssignment[] @relation("RoomUserAssignments")
}
```

**`User` model** — add two new reverse relations:
```prisma
model User {
  // ...existing fields...
  roomAssignments     UserRoomAssignment[] @relation("UserRoomAssignments")
  roomAssignmentsMade UserRoomAssignment[] @relation("UserRoomAssignmentsMadeBy")
}
```

### 4.3 Field Definitions

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String UUID | PK, auto-generated | Internal identifier |
| `userId` | String UUID | FK → users.id, Cascade delete | The user being assigned |
| `roomId` | String UUID | FK → rooms.id, Cascade delete | The room being assigned to |
| `assignedAt` | DateTime | Default `now()` | Timestamp of assignment |
| `assignedBy` | String UUID | FK → users.id | Who performed the assignment |
| `notes` | String? | Optional, max 500 chars | Optional assignment notes |

**Unique constraint:** `@@unique([userId, roomId])` — a user can only be assigned to a room once.

---

## 5. Backend API Design

### 5.1 Endpoint Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/locations/:locationId/room-assignments` | Admin or Primary Supervisor | List all rooms for a location with their assigned users |
| `GET` | `/api/rooms/:roomId/users` | Admin or Primary Supervisor (scoped) | Get users assigned to a specific room |
| `POST` | `/api/rooms/:roomId/users` | Admin or Primary Supervisor (scoped) | Assign one or more users to a room |
| `DELETE` | `/api/rooms/:roomId/users/:userId` | Admin or Primary Supervisor (scoped) | Unassign a user from a room |
| `GET` | `/api/users/:userId/room-assignments` | Admin only | Get all rooms a user is assigned to |
| `PUT` | `/api/users/:userId/primary-room` | Admin only | Set/update primary room for a user |

> **Note:** The primary-room endpoints operate on `User.primaryRoomId` which already exists. They are admin-only because primary room is a HR-level designation, not a per-supervisor assignment.

---

### 5.2 Endpoint Details

#### `GET /api/locations/:locationId/room-assignments`

**Purpose:** List all active rooms in a location, each with their currently assigned users. Used as the main management view.

**Auth Chain:**
```
authenticate → validateCsrfToken (read-only = skip CSRF) → validateRequest(params) → requireAdminOrPrimarySupervisor('params') → controller
```
CSRF not required for GET requests.

**Request:**
- Params: `{ locationId: string (UUID) }`
- Query: `{ includeInactive?: boolean, search?: string }`

**Response (200):**
```json
{
  "location": {
    "id": "uuid",
    "name": "Lincoln Elementary",
    "type": "SCHOOL"
  },
  "rooms": [
    {
      "id": "uuid",
      "name": "Room 101",
      "type": "CLASSROOM",
      "building": "Main",
      "floor": 1,
      "capacity": 30,
      "isActive": true,
      "assignedUsers": [
        {
          "id": "uuid",
          "firstName": "Jane",
          "lastName": "Smith",
          "displayName": "Jane Smith",
          "email": "jsmith@district.edu",
          "jobTitle": "Teacher",
          "assignedAt": "2026-01-15T10:00:00Z",
          "assignedBy": "uuid",
          "assignedByName": "Admin User"
        }
      ],
      "assignedUserCount": 1
    }
  ],
  "totalRooms": 24,
  "totalAssignments": 48
}
```

**Business Logic:**
1. Verify location exists and is active.
2. Fetch all rooms for `locationId` (filtered by `isActive = true` unless `includeInactive = true`).
3. For each room, include `UserRoomAssignment` records joined with `User` data.
4. Filter users by `isActive = true`.
5. If `search` is provided, filter users by name or email (case-insensitive).

---

#### `GET /api/rooms/:roomId/users`

**Purpose:** Get all users assigned to a specific room.

**Auth Chain:**
```
authenticate → validateRequest(params) → controller (inline supervisor scope check)
```

**Request:**
- Params: `{ roomId: string (UUID) }`

**Response (200):**
```json
{
  "room": {
    "id": "uuid",
    "name": "Room 101",
    "locationId": "uuid",
    "locationName": "Lincoln Elementary"
  },
  "assignedUsers": [
    {
      "id": "uuid",
      "firstName": "Jane",
      "lastName": "Smith",
      "displayName": "Jane Smith",
      "email": "jsmith@district.edu",
      "jobTitle": "Teacher",
      "assignedAt": "2026-01-15T10:00:00Z"
    }
  ],
  "totalCount": 1
}
```

**Business Logic:**
1. Fetch room by ID; 404 if not found.
2. If requester is not ADMIN, verify they are the primary supervisor of `room.locationId`.
3. Return all active users with their assignment metadata.

---

#### `POST /api/rooms/:roomId/users`

**Purpose:** Assign one or more users to a room. Supports bulk assignment.

**Auth Chain:**
```
authenticate → validateCsrfToken → validateRequest(params) → validateRequest(body) → controller (inline supervisor scope check)
```

**Request Body (Zod schema):**
```typescript
const AssignUsersToRoomSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'At least one user is required').max(100, 'Maximum 100 users per request'),
  notes: z.string().max(500).optional(),
});
```

**Response (201):**
```json
{
  "assigned": [
    {
      "userId": "uuid",
      "roomId": "uuid",
      "assignedAt": "2026-04-30T12:00:00Z"
    }
  ],
  "alreadyAssigned": ["uuid"],
  "message": "2 user(s) assigned, 1 already assigned"
}
```

**Business Logic:**
1. Fetch room; 404 if not found or inactive.
2. If requester is not ADMIN, verify primary supervisor of `room.locationId`.
3. Verify all `userIds` exist and are active users; return 400 if any invalid.
4. Use `createMany` + `skipDuplicates: true` for bulk upsert.
5. Return breakdown of assigned vs. already-assigned.
6. Use a Prisma transaction for atomicity.

**Error Cases:**
- 400: `userIds` array empty or exceeds 100
- 400: One or more userIds not found or inactive
- 403: Requester is not admin or primary supervisor of the room's location
- 404: Room not found

---

#### `DELETE /api/rooms/:roomId/users/:userId`

**Purpose:** Unassign a single user from a room.

**Auth Chain:**
```
authenticate → validateCsrfToken → validateRequest(params) → controller (inline supervisor scope check)
```

**Request:**
- Params: `{ roomId: string (UUID), userId: string (UUID) }`

**Response (200):**
```json
{ "message": "User unassigned from room successfully" }
```

**Business Logic:**
1. Fetch room; 404 if not found.
2. If requester is not ADMIN, verify primary supervisor of `room.locationId`.
3. Delete `UserRoomAssignment` where `userId` + `roomId`; 404 if not found.

---

#### `GET /api/users/:userId/room-assignments`

**Purpose:** Get all rooms a user is currently assigned to, across all locations. Admin-only (cross-location view).

**Auth Chain:**
```
authenticate → requireAdmin → validateRequest(params) → controller
```

**Response (200):**
```json
{
  "userId": "uuid",
  "user": {
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jsmith@district.edu"
  },
  "primaryRoom": {
    "id": "uuid",
    "name": "Room 101",
    "locationName": "Lincoln Elementary"
  },
  "assignments": [
    {
      "roomId": "uuid",
      "roomName": "Room 101",
      "locationId": "uuid",
      "locationName": "Lincoln Elementary",
      "assignedAt": "2026-01-15T10:00:00Z"
    }
  ],
  "totalCount": 1
}
```

---

#### `PUT /api/users/:userId/primary-room`

**Purpose:** Set or update a user's primary room designation. Separate from many-to-many assignments — this is the user's "home base" room.

**Auth Chain:**
```
authenticate → requireAdmin → validateCsrfToken → validateRequest(params) → validateRequest(body) → controller
```

**Request Body (Zod):**
```typescript
const SetPrimaryRoomSchema = z.object({
  roomId: z.string().uuid().nullable(),  // null = clear primary room
});
```

**Response (200):**
```json
{
  "userId": "uuid",
  "primaryRoomId": "uuid",
  "primaryRoom": {
    "id": "uuid",
    "name": "Room 101",
    "locationName": "Lincoln Elementary"
  }
}
```

---

### 5.3 New Files to Create (Backend)

| File | Purpose |
|------|---------|
| `backend/src/controllers/userRoomAssignment.controller.ts` | Request handling for all 5 endpoints |
| `backend/src/services/userRoomAssignment.service.ts` | Business logic and DB operations |
| `backend/src/routes/userRoomAssignment.routes.ts` | Express router with middleware chain |
| `backend/src/validators/userRoomAssignment.validators.ts` | Zod schemas |

---

### 5.4 Zod Validators

```typescript
// backend/src/validators/userRoomAssignment.validators.ts

import { z } from 'zod';

export const LocationIdParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
});

export const RoomIdParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format'),
});

export const RoomUserParamSchema = z.object({
  roomId: z.string().uuid('Invalid room ID format'),
  userId: z.string().uuid('Invalid user ID format'),
});

export const UserIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

export const AssignUsersToRoomSchema = z.object({
  userIds: z
    .array(z.string().uuid('Invalid user ID format'))
    .min(1, 'At least one user required')
    .max(100, 'Maximum 100 users per request'),
  notes: z.string().max(500).optional(),
});

export const SetPrimaryRoomSchema = z.object({
  roomId: z.string().uuid().nullable(),
});

export const LocationRoomAssignmentsQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().max(200).optional(),
});
```

---

## 6. Frontend Design

### 6.1 New Route

| Path | Component | Guard |
|------|-----------|-------|
| `/room-assignments` | `RoomAssignmentManagement` | Admin OR primary supervisor |

Add to `App.tsx`:
```tsx
<Route
  path="/room-assignments"
  element={
    <ProtectedRoute requireRoomAssignment>
      <AppLayout>
        <RoomAssignmentManagement />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

### 6.2 `ProtectedRoute` Update

Add `requireRoomAssignment` prop:
```tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireTech?: boolean;
  requireRoomAssignment?: boolean;  // NEW
}
```

Logic:
```tsx
if (requireRoomAssignment) {
  const isAdmin = user?.roles?.includes('ADMIN');
  // isPrimarySupervisor is resolved from a useQuery hook result passed down,
  // or read from authStore once enhanced, or checked via a hook:
  // const { isPrimarySupervisor } = useRoomAssignmentAccess();
  if (!isAdmin && !isPrimarySupervisor) return <AccessDenied />;
}
```

Since the primary supervisor check requires a DB query, implement a hook:
```typescript
// frontend/src/hooks/useRoomAssignmentAccess.ts
export function useRoomAssignmentAccess() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;
  
  const { data: supervisedLocations = [] } = useQuery({
    queryKey: queryKeys.locations.supervisedByMe(),
    queryFn: () => locationService.getUserSupervisedLocations(user!.id),
    enabled: !!user && !isAdmin,
  });
  
  const primarySupervisorLocations = supervisedLocations
    .filter((sl) => sl.isPrimary)
    .map((sl) => sl.locationId);
  
  return {
    isAdmin,
    isPrimarySupervisor: primarySupervisorLocations.length > 0,
    primarySupervisorLocationIds: primarySupervisorLocations,
    canAccess: isAdmin || primarySupervisorLocations.length > 0,
  };
}
```

### 6.3 Page Component Hierarchy

```
RoomAssignmentManagement (page)   [/room-assignments]
├── LocationSelector              [MUI Select — admins see all; supervisors see their location(s)]
├── RoomAssignmentTable           [main content area]
│   ├── RoomRow (per room)
│   │   ├── AssignedUserChips     [list of assigned users]
│   │   └── AssignUsersButton     [opens AssignUsersDialog]
│   └── LoadingOverlay
└── AssignUsersDialog             [MUI Dialog — search + select users to assign]
    ├── UserSearchInput           [debounced GET /api/users/search]
    ├── UserSelectionList         [checkboxes with current assignments marked]
    └── SaveButton
```

### 6.4 New Frontend Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/RoomAssignmentManagement.tsx` | Main page component |
| `frontend/src/services/userRoomAssignmentService.ts` | API calls |
| `frontend/src/hooks/queries/useRoomAssignments.ts` | TanStack Query hooks |
| `frontend/src/hooks/mutations/useRoomAssignmentMutations.ts` | TanStack mutation hooks |
| `frontend/src/hooks/useRoomAssignmentAccess.ts` | Access control hook |
| `frontend/src/types/userRoomAssignment.types.ts` | TypeScript interfaces |

### 6.5 Query Keys

Add to `queryKeys` in `frontend/src/lib/queryKeys.ts`:
```typescript
roomAssignments: {
  all: ['roomAssignments'] as const,
  byLocation: (locationId: string) => ['roomAssignments', 'location', locationId] as const,
  byRoom: (roomId: string) => ['roomAssignments', 'room', roomId] as const,
  byUser: (userId: string) => ['roomAssignments', 'user', userId] as const,
},
```

Also add to `locations` keys:
```typescript
supervisedByMe: () => [...queryKeys.locations.all, 'supervisedByMe'] as const,
```

### 6.6 Frontend Service

```typescript
// frontend/src/services/userRoomAssignmentService.ts
import { api } from './api';

export const userRoomAssignmentService = {
  /** Get all rooms in a location with their assigned users */
  getLocationRoomAssignments: async (locationId: string, params?: { search?: string; includeInactive?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.includeInactive) qs.set('includeInactive', 'true');
    const response = await api.get(`/locations/${locationId}/room-assignments?${qs}`);
    return response.data;
  },

  /** Assign one or more users to a room */
  assignUsersToRoom: async (roomId: string, userIds: string[], notes?: string) => {
    const response = await api.post(`/rooms/${roomId}/users`, { userIds, notes });
    return response.data;
  },

  /** Unassign a user from a room */
  unassignUserFromRoom: async (roomId: string, userId: string) => {
    const response = await api.delete(`/rooms/${roomId}/users/${userId}`);
    return response.data;
  },

  /** Get all room assignments for a user (admin only) */
  getUserRoomAssignments: async (userId: string) => {
    const response = await api.get(`/users/${userId}/room-assignments`);
    return response.data;
  },

  /** Set/update primary room for a user (admin only) */
  setUserPrimaryRoom: async (userId: string, roomId: string | null) => {
    const response = await api.put(`/users/${userId}/primary-room`, { roomId });
    return response.data;
  },
};
```

### 6.7 TanStack Query Hooks

```typescript
// frontend/src/hooks/queries/useRoomAssignments.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { userRoomAssignmentService } from '@/services/userRoomAssignmentService';
import { queryKeys } from '@/lib/queryKeys';

export function useLocationRoomAssignments(locationId: string, params?: { search?: string }) {
  return useQuery({
    queryKey: queryKeys.roomAssignments.byLocation(locationId),
    queryFn: () => userRoomAssignmentService.getLocationRoomAssignments(locationId, params),
    enabled: !!locationId,
    staleTime: 60 * 1000, // 1 minute — assignments change frequently
    placeholderData: keepPreviousData,
  });
}

export function useRoomAssignedUsers(roomId: string) {
  return useQuery({
    queryKey: queryKeys.roomAssignments.byRoom(roomId),
    queryFn: () => userRoomAssignmentService.getRoomUsers(roomId),
    enabled: !!roomId,
    staleTime: 60 * 1000,
  });
}
```

```typescript
// frontend/src/hooks/mutations/useRoomAssignmentMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userRoomAssignmentService } from '@/services/userRoomAssignmentService';
import { queryKeys } from '@/lib/queryKeys';

export function useAssignUsersToRoom(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, userIds, notes }: { roomId: string; userIds: string[]; notes?: string }) =>
      userRoomAssignmentService.assignUsersToRoom(roomId, userIds, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roomAssignments.byLocation(locationId) });
    },
  });
}

export function useUnassignUserFromRoom(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, userId }: { roomId: string; userId: string }) =>
      userRoomAssignmentService.unassignUserFromRoom(roomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roomAssignments.byLocation(locationId) });
    },
  });
}
```

### 6.8 UI/UX Description

**Page Layout:**
1. **Header bar**: Title "Room Assignments" + location selector dropdown (admin sees all locations; primary supervisor sees only their location(s), pre-selected)
2. **Search bar**: Filter users by name/email within the selected location's assignments
3. **Room list**: Expandable cards or table rows — one per room in the location
   - Room name, type, capacity
   - Assigned users shown as MUI `Chip` components with an X to unassign
   - "+ Assign Users" button per room row
4. **Assign Users Dialog** (MUI `Dialog`):
   - Title: "Assign Users to [Room Name]"
   - `UserSearchAutocomplete`-style search (reuse existing component) but with multi-select support
   - Already-assigned users shown with checkmarks (cannot be selected again)
   - Confirm button calls `POST /api/rooms/:roomId/users`
   - Loading state on confirm + success snackbar

**Navigation entry**: Add to AppLayout sidebar under "Administration" section alongside "Users" and "Supervisors", only visible to admins and primary supervisors.

---

## 7. Security Considerations

### 7.1 Authentication & Authorization (Standard 1)

- All endpoints require `authenticate` middleware (JWT validation via HttpOnly cookie).
- Admin endpoints additionally require `requireAdmin`.
- Supervisor-scoped endpoints call `requireAdminOrPrimarySupervisor` (new middleware performing a DB lookup to verify `LocationSupervisor.isPrimary = true`).
- **Row-level enforcement**: even if a supervisor passes the middleware, the service layer re-validates the room's `locationId` matches the supervisor's scope before mutating.

### 7.2 CSRF Protection (Standard 2)

- All mutating endpoints (`POST`, `DELETE`, `PUT`) include `validateCsrfToken` middleware.
- Frontend `api.ts` already injects `X-CSRF-Token` header for all POST/PUT/PATCH/DELETE requests via the existing axios interceptor. No frontend changes needed.

### 7.3 Token Storage (Standard 3)

- Already resolved: tokens stored in HttpOnly cookies; `api.ts` uses `withCredentials: true`.
- No new localStorage usage.

### 7.4 Input Validation (Standard 4)

- All request bodies, params, and query strings validated with Zod schemas via `validateRequest` middleware.
- `userIds` array bounded to max 100 to prevent DoS via massive bulk requests.
- UUIDs validated with `z.string().uuid()` — rejects invalid formats before any DB query.
- `notes` field bounded to 500 chars max.
- `search` bounded to 200 chars max.

### 7.5 Security Headers (Standard 5)

- `helmet()` already applied globally in `server.ts`. No changes needed.

### 7.6 Rate Limiting (Standard 6)

- Global 500 req/15 min per IP already applied to `/api/` in `server.ts`.
- The bulk assign endpoint (`POST /api/rooms/:roomId/users`) is additionally protected by the 100 `userId` cap per request, limiting computational exposure.

### 7.7 Logging (Standard 7)

- Use `loggers.info` / `loggers.error` from `backend/src/lib/logger.ts` (structured logger, already in use).
- Log successful assignments with: `{ locationId, roomId, userId, assignedBy }` — no PII beyond IDs.
- Log unauthorized access attempts with: `{ requesterId, targetLocationId, action: 'room-assignment' }`.
- Never log user names, emails, or full assignment arrays in structured log fields.

### 7.8 Error Handling (Standard 8)

- Use `handleControllerError(error, res)` for all controller catch blocks (existing utility).
- Use `NotFoundError`, `ValidationError`, `AuthorizationError` from `backend/src/utils/errors.ts`.
- Service layer throws typed errors; controller converts them to HTTP responses.
- No stack traces returned to client in production.

### 7.9 SQL Injection Prevention (Standard 9)

- Use Prisma ORM exclusively — no raw SQL (`$queryRaw` or `$executeRaw`).
- All dynamic values passed as parameterized Prisma query arguments.

### 7.10 Principle of Least Privilege (Standard 10)

- Supervisor can only manage rooms in **their specific location** — server verifies every mutation.
- `GET /api/users/:userId/room-assignments` (cross-location view) is **ADMIN only**.
- `PUT /api/users/:userId/primary-room` is **ADMIN only**.
- Supervisors receive only the data for their own location, not all locations.
- `UserRoomAssignment.assignedBy` is set server-side from `req.user.id` — not accepted from the client body.

---

## 8. Implementation Steps

Ordered list of files to create or modify, in dependency order:

### Step 1 — Prisma Schema
1. **Modify** `backend/prisma/schema.prisma`
   - Add `UserRoomAssignment` model
   - Add `userAssignments UserRoomAssignment[]` to `Room` model
   - Add `roomAssignments UserRoomAssignment[]` and `roomAssignmentsMade UserRoomAssignment[]` to `User` model

### Step 2 — Database Migration
2. Run Prisma migration (see §9)

### Step 3 — Backend Validators
3. **Create** `backend/src/validators/userRoomAssignment.validators.ts`
   - All Zod schemas listed in §5.4

### Step 4 — Backend Service
4. **Create** `backend/src/services/userRoomAssignment.service.ts`
   - `class UserRoomAssignmentService { constructor(private prisma: PrismaClient) {} }`
   - Methods: `getLocationRoomAssignments`, `getRoomUsers`, `assignUsersToRoom`, `unassignUserFromRoom`, `getUserRoomAssignments`, `setUserPrimaryRoom`

### Step 5 — New Middleware Helper
5. **Modify** `backend/src/middleware/auth.ts` (or create `backend/src/utils/roomAssignmentAuth.ts`)
   - Add `requireAdminOrPrimarySupervisor` middleware factory (import prisma from `lib/prisma`)

### Step 6 — Backend Controller
6. **Create** `backend/src/controllers/userRoomAssignment.controller.ts`
   - Export: `getLocationRoomAssignments`, `getRoomUsers`, `assignUsersToRoom`, `unassignUserFromRoom`, `getUserRoomAssignments`, `setUserPrimaryRoom`
   - Each uses `handleControllerError` in catch block

### Step 7 — Backend Routes
7. **Create** `backend/src/routes/userRoomAssignment.routes.ts`
   - Wire up all 6 endpoints with full middleware chains

### Step 8 — Register Routes in server.ts
8. **Modify** `backend/src/server.ts`
   - Import and register `userRoomAssignmentRoutes` under `/api`

### Step 9 — Frontend Types
9. **Create** `frontend/src/types/userRoomAssignment.types.ts`
   - `LocationRoomAssignmentsResponse`, `RoomWithAssignedUsers`, `AssignedUser`, `AssignUsersRequest`, etc.

### Step 10 — Frontend Service
10. **Create** `frontend/src/services/userRoomAssignmentService.ts`

### Step 11 — Query Keys Update
11. **Modify** `frontend/src/lib/queryKeys.ts`
    - Add `roomAssignments` and `locations.supervisedByMe` keys

### Step 12 — TanStack Query Hooks
12. **Create** `frontend/src/hooks/queries/useRoomAssignments.ts`
13. **Create** `frontend/src/hooks/mutations/useRoomAssignmentMutations.ts`

### Step 13 — Access Control Hook
14. **Create** `frontend/src/hooks/useRoomAssignmentAccess.ts`

### Step 14 — Frontend Page
15. **Create** `frontend/src/pages/RoomAssignmentManagement.tsx`

### Step 15 — ProtectedRoute Update
16. **Modify** `frontend/src/components/ProtectedRoute.tsx`
    - Add `requireRoomAssignment` prop and corresponding check

### Step 16 — App Router Update
17. **Modify** `frontend/src/App.tsx`
    - Add `/room-assignments` route

### Step 17 — Navigation Update
18. **Modify** `frontend/src/components/layout/AppLayout.tsx` (or sidebar component)
    - Add "Room Assignments" nav item visible to admins and primary supervisors

---

## 9. Migration Plan

### 9.1 Prisma Migration

```bash
cd backend
npx prisma migrate dev --name add_user_room_assignments
```

This generates a new migration file in `backend/prisma/migrations/` and applies it to the dev database.

### 9.2 Expected Migration SQL (approximate)

```sql
CREATE TABLE "user_room_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "user_room_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_room_assignments_userId_roomId_key" ON "user_room_assignments"("userId", "roomId");
CREATE INDEX "user_room_assignments_userId_idx" ON "user_room_assignments"("userId");
CREATE INDEX "user_room_assignments_roomId_idx" ON "user_room_assignments"("roomId");
CREATE INDEX "user_room_assignments_assignedBy_idx" ON "user_room_assignments"("assignedBy");
CREATE INDEX "user_room_assignments_assignedAt_idx" ON "user_room_assignments"("assignedAt");

ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_roomId_fkey" 
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_room_assignments" ADD CONSTRAINT "user_room_assignments_assignedBy_fkey" 
  FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### 9.3 After Migration

```bash
# Regenerate Prisma client
npx prisma generate

# Validate schema
npx prisma validate

# Build backend to check TypeScript
npm run build
```

### 9.4 Production Deployment

```bash
# On production server
npx prisma migrate deploy
```

No data migration needed — this is a new table with no existing data dependency.

---

## Appendix: Research Sources

1. **Prisma Many-to-Many Relations** — https://www.prisma.io/docs/concepts/components/prisma-schema/relations/many-to-many-relations — explicit join models with additional fields (e.g., `assignedAt`, `assignedBy`) require explicit `@relation` names on both sides.

2. **RBAC Scoped to Resources (NIST RBAC)** — Martin & Ferraiolo (NIST SP 800-162): Attribute-Based Access Control supports hierarchical scoping — here: supervisor role scoped to specific location, not system-wide.

3. **TanStack Query v5 — Mutations + Invalidation** — https://tanstack.com/query/v5/docs/react/guides/mutations — `onSuccess` with `queryClient.invalidateQueries` is the canonical pattern after mutations; `keepPreviousData` prevents content flash during refetch.

4. **React + MUI Data Display Patterns** — Material UI v6 docs on `Table`, `Chip`, `Dialog` — use `Chip` with `onDelete` for "removable tag" pattern representing assigned users; `Dialog` for assignment picker.

5. **Express Middleware Composition for Scoped Authorization** — O'Reilly "Node.js Security" (Kassler, 2024): middleware should be pure functions; scoped DB lookups in middleware should use the prisma singleton (imported from lib/prisma), not a new connection.

6. **Optimistic UI Updates (TanStack Query v5)** — `onMutate` + `cancelQueries` + snapshot/rollback pattern from TanStack docs; for assignment operations the optimistic approach is beneficial UX since network latency would cause assignment chips to flicker.

7. **PostgreSQL Unique Constraint on Join Table** — `@@unique([userId, roomId])` at the Prisma schema level maps to a `UNIQUE INDEX` in PostgreSQL, preventing duplicate assignments without requiring application-level duplicate checking (Prisma surfaces as P2002 error, handled by `handleControllerError`).

8. **HTTP Idempotency for Bulk Operations** — RFC 9110 §9.2: POST is appropriate for bulk creation; `skipDuplicates: true` in `createMany` ensures the operation is safe to retry (effectively idempotent for already-assigned users, which are returned in `alreadyAssigned` array).

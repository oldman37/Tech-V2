# Spec: Temporary Supervisor Delegation for PO Approval

**Feature:** `SUPERVISOR_DELEGATION`  
**Date:** 2026-06-30  
**Status:** Phase 1 — Specification

---

## 1. Current State Analysis

### Approval Flow (Supervisor Stage)

When a purchase order reaches `submitted` status, `purchaseOrder.service.ts:approvePurchaseOrder()` (lines 1109–1199) enforces:

- **Food service POs:** approver must be in `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` (Entra group, not location record)
- **DISTRICT_OFFICE POs:** approver must be in `ENTRA_FINANCE_DIRECTOR_GROUP_ID`
- **Standard POs with a location (SCHOOL):** the specific primary `PRINCIPAL` record in `location_supervisors` for that location must match the approver's `userId`
- **Standard POs with a location (other types):** any primary `LocationSupervisor` record for that location must match the approver's `userId`
- **POs with no location:** approver must be in one of the recognised supervisor Entra groups

The check at lines 1154–1158 is an exact match:
```typescript
if (locSup.userId !== userId) {
  throw new AuthorizationError('Only the assigned supervisor for this location can approve at this stage');
}
```

**There is no fallback.** If the primary supervisor is unavailable, the PO is permanently blocked.

### Location / Supervisor Data Model

- `OfficeLocation` (`office_locations`) → `LocationSupervisor` (`location_supervisors`)
- `LocationSupervisor` composite unique: `(locationId, userId, supervisorType)`
- `isPrimary` is one-per-type-per-location; only the primary is used for PO routing
- Supervisor types relevant to PO approval: all types **except** `TECHNOLOGY_ASSISTANT` and `MAINTENANCE_WORKER` (those are work-order routing roles, not PO approvers)
- Food service POs use the Entra group exclusively — delegation via location records does not apply to them and is out of scope for this feature

### Edit Location Modal (`SupervisorManagement.tsx`)

The existing `EditLocationModal` (line 983–1405) has:
1. Location details fields
2. `WorkerAssignmentSection` ×2 (Technology Assistant, Maintenance Worker)
3. Collapsible **Supervisors** section — lists assigned supervisor rows with Remove button; Add Supervisor inline form

The `ProtectedRoute requireAdmin` guard (App.tsx line 152) restricts the entire SupervisorManagement page to admin users only.

### Available Infrastructure

- `UserSearchAutocomplete` — reusable MUI Autocomplete backed by `/api/users/search`; accepts `value`, `onChange`, `label`, `initialUser` props
- `requireAdmin` middleware — available in `backend/src/middleware/auth.ts`
- `validateCsrfToken` middleware — already applied to all location routes
- `locationService.getLocation(id)` — called by the modal to refresh supervisor state after changes

---

## 2. Problem Definition

When a supervisor (e.g., Maintenance Director) is unavailable (out of town, on leave), any PO submitted against their location is permanently blocked at the `submitted` stage. There is no mechanism for an admin to designate a stand-in (e.g., Maintenance Secretary) who can approve on the supervisor's behalf for a limited time.

---

## 3. Proposed Solution Architecture

### 3.1 New Database Table: `supervisor_delegations`

A per-location, per-role delegation record naming a specific user as a temporary stand-in. The delegation is active when `isActive = true` AND `expiresAt > now()`.

**Key design decisions:**
- Keyed by `(locationId, supervisorType)` — mirrors exactly how the PO approval service resolves the responsible supervisor
- Multiple active delegations for the same `(locationId, supervisorType)` are allowed (e.g., two people can both be stand-ins)
- Expiry is mandatory — no open-ended delegations
- `isActive` supports manual revocation before expiry
- Food service and DISTRICT_OFFICE POs are excluded (they use Entra groups, not location records)

### 3.2 Approval Service Change

In `purchaseOrder.service.ts:approvePurchaseOrder()`, the single line that throws `AuthorizationError` when `locSup.userId !== userId` is replaced with a delegation lookup. If an active, non-expired delegation exists for `(po.officeLocationId, locSup.supervisorType)` naming the current `userId` as delegate, approval proceeds.

### 3.3 New Backend Routes (under location.routes.ts)

```
GET    /api/locations/:locationId/delegations          — list delegations (admin only)
POST   /api/locations/:locationId/delegations          — create delegation (admin only)
DELETE /api/locations/:locationId/delegations/:delegationId  — revoke delegation (admin only)
```

### 3.4 Frontend: Edit Location Modal — New "Temporary Delegates" Section

Inserted after the existing Supervisors collapsible section inside `EditLocationModal`. The section:
- Lists current active delegations for the location (fetched from the new GET endpoint)
- Shows: `[Role] → [Delegate Name] • Expires [date]` + Revoke button per row
- "Set Temporary Delegate" inline form with:
  - **Role** — dropdown filtered to supervisor types that have a primary supervisor already assigned at this location (excluding TECHNOLOGY_ASSISTANT and MAINTENANCE_WORKER)
  - **Delegate** — `UserSearchAutocomplete`
  - **Expires** — `datetime-local` input
  - **Reason** — optional text input (max 200 chars)

---

## 4. Implementation Steps

### Step 1 — Prisma Schema (`backend/prisma/schema.prisma`)

**Add new model:**
```prisma
model SupervisorDelegation {
  id             String         @id @default(uuid())
  locationId     String
  supervisorType String
  delegateUserId String
  expiresAt      DateTime
  reason         String?
  isActive       Boolean        @default(true)
  createdById    String
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  location       OfficeLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  delegate       User           @relation("SupervisorDelegationDelegate", fields: [delegateUserId], references: [id], onDelete: Cascade)
  createdBy      User           @relation("SupervisorDelegationCreatedBy", fields: [createdById], references: [id])

  @@index([locationId, supervisorType])
  @@index([delegateUserId])
  @@index([expiresAt])
  @@map("supervisor_delegations")
}
```

**Add back-relations on `OfficeLocation`:**
```prisma
supervisorDelegations SupervisorDelegation[]
```

**Add back-relations on `User`:**
```prisma
supervisorDelegations    SupervisorDelegation[] @relation("SupervisorDelegationDelegate")
delegationsCreated       SupervisorDelegation[] @relation("SupervisorDelegationCreatedBy")
```

### Step 2 — Migration SQL

**File:** `backend/prisma/migrations/20260630120000_add_supervisor_delegations/migration.sql`

```sql
CREATE TABLE "supervisor_delegations" (
  "id"             TEXT        NOT NULL,
  "locationId"     TEXT        NOT NULL,
  "supervisorType" TEXT        NOT NULL,
  "delegateUserId" TEXT        NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "reason"         TEXT,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  "createdById"    TEXT        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supervisor_delegations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supervisor_delegations_locationId_supervisorType_idx"
  ON "supervisor_delegations"("locationId", "supervisorType");

CREATE INDEX "supervisor_delegations_delegateUserId_idx"
  ON "supervisor_delegations"("delegateUserId");

CREATE INDEX "supervisor_delegations_expiresAt_idx"
  ON "supervisor_delegations"("expiresAt");

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "office_locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_delegateUserId_fkey"
  FOREIGN KEY ("delegateUserId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_delegations"
  ADD CONSTRAINT "supervisor_delegations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Step 3 — Backend Validators (`backend/src/validators/location.validators.ts`)

Add two new schemas:

```typescript
export const CreateDelegationSchema = z.object({
  supervisorType: SupervisorType,
  delegateUserId: z.string().uuid('Invalid user ID format'),
  expiresAt: z.string().datetime('Invalid datetime format'),
  reason: z.string().max(200).optional(),
});

export const DelegationParamSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format'),
  delegationId: z.string().uuid('Invalid delegation ID format'),
});

export type CreateDelegation = z.infer<typeof CreateDelegationSchema>;
```

### Step 4 — Backend Service (`backend/src/services/location.service.ts`)

Add `SupervisorDelegationWithDetails` return type and three new methods to `LocationService`:

```typescript
export interface SupervisorDelegationWithDetails {
  id: string;
  locationId: string;
  supervisorType: string;
  delegateUserId: string;
  expiresAt: Date;
  reason: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  delegate: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
    jobTitle: string | null;
  };
}

// Retrieve all delegations for a location (active + expired, for display)
async getDelegations(locationId: string): Promise<SupervisorDelegationWithDetails[]>

// Create a new delegation; throws ValidationError if supervisorType is a worker role
async createDelegation(
  locationId: string,
  data: { supervisorType: string; delegateUserId: string; expiresAt: Date; reason?: string },
  createdById: string,
): Promise<SupervisorDelegationWithDetails>

// Revoke (soft-delete) a delegation; throws NotFoundError if not found
async revokeDelegation(locationId: string, delegationId: string): Promise<void>
```

**Business rules in `createDelegation`:**
- Reject `supervisorType` of `TECHNOLOGY_ASSISTANT` or `MAINTENANCE_WORKER` (400 ValidationError — these are not PO approver roles)
- Reject `expiresAt` in the past (400 ValidationError)
- Verify the location exists (throw NotFoundError if not)

### Step 5 — Backend Controller (`backend/src/controllers/location.controller.ts`)

Add three handlers:

```typescript
export const getDelegations   // GET  /locations/:locationId/delegations
export const createDelegation // POST /locations/:locationId/delegations
export const revokeDelegation // DELETE /locations/:locationId/delegations/:delegationId
```

Each calls the corresponding `LocationService` method. `createDelegation` passes `req.user.id` as `createdById`.

### Step 6 — Backend Routes (`backend/src/routes/location.routes.ts`)

Add three routes, all requiring `requireAdmin` middleware (imported from `../middleware/auth`):

```typescript
import { requireAdmin } from '../middleware/auth';

router.get(
  '/locations/:locationId/delegations',
  validateRequest(LocationIdParamSchema, 'params'),
  requireAdmin,
  locationController.getDelegations,
);

router.post(
  '/locations/:locationId/delegations',
  validateRequest(LocationIdParamSchema, 'params'),
  validateRequest(CreateDelegationSchema, 'body'),
  requireAdmin,
  locationController.createDelegation,
);

router.delete(
  '/locations/:locationId/delegations/:delegationId',
  validateRequest(DelegationParamSchema, 'params'),
  requireAdmin,
  locationController.revokeDelegation,
);
```

`validateCsrfToken` is already applied to all routes in this router via `router.use(validateCsrfToken)` — no change needed there.

### Step 7 — PO Approval Service (`backend/src/services/purchaseOrder.service.ts`)

**Location of change:** lines 1154–1158 (the `if (locSup.userId !== userId)` block).

Replace the single `throw` with a delegation lookup:

```typescript
if (locSup.userId !== userId) {
  const now = new Date();
  const delegation = await this.prisma.supervisorDelegation.findFirst({
    where: {
      locationId: po.officeLocationId!,
      supervisorType: locSup.supervisorType,
      delegateUserId: userId,
      isActive: true,
      expiresAt: { gt: now },
    },
  });
  if (!delegation) {
    throw new AuthorizationError(
      'Only the assigned supervisor (or their active delegate) can approve at this stage',
    );
  }
  // delegation found — proceed as approved
}
```

This change applies to both SCHOOL (PRINCIPAL) and non-SCHOOL location types, since the same code path handles both (the `expectedSupervisorType` variable controls which type is queried for `locSup`, and `locSup.supervisorType` carries through to the delegation query).

No change needed for:
- Food service POs (Entra group check, no `locSup` lookup)
- DISTRICT_OFFICE POs (Finance Director group check)
- POs with no `officeLocationId` (Entra group fallback)

### Step 8 — Frontend Types (`frontend/src/types/location.types.ts`)

Add:

```typescript
export interface SupervisorDelegation {
  id: string;
  locationId: string;
  supervisorType: SupervisorType;
  delegateUserId: string;
  expiresAt: string;       // ISO datetime string
  reason: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  delegate: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
}

export interface CreateDelegationRequest {
  supervisorType: SupervisorType;
  delegateUserId: string;
  expiresAt: string;   // ISO datetime string (from datetime-local input)
  reason?: string;
}
```

### Step 9 — Frontend Service (`frontend/src/services/location.service.ts`)

Add to `locationService` object:

```typescript
async getDelegations(locationId: string): Promise<SupervisorDelegation[]> {
  const response = await api.get<SupervisorDelegation[]>(`/locations/${locationId}/delegations`);
  return response.data;
},

async createDelegation(locationId: string, data: CreateDelegationRequest): Promise<SupervisorDelegation> {
  const response = await api.post<SupervisorDelegation>(`/locations/${locationId}/delegations`, data);
  return response.data;
},

async revokeDelegation(locationId: string, delegationId: string): Promise<void> {
  await api.delete(`/locations/${locationId}/delegations/${delegationId}`);
},
```

### Step 10 — Frontend Edit Modal (`frontend/src/pages/SupervisorManagement.tsx`)

Add a new `DelegatesSection` sub-component (following the `WorkerAssignmentSection` pattern) and render it inside `EditLocationModal` immediately after the Supervisors section.

**State in `EditLocationModal`:**
```typescript
const [delegations, setDelegations] = useState<SupervisorDelegation[]>([]);
const [showDelegatesSection, setShowDelegatesSection] = useState(false);
const [showAddDelegate, setShowAddDelegate] = useState(false);
const [newDelegate, setNewDelegate] = useState({
  supervisorType: '' as SupervisorType | '',
  delegateUserId: null as string | null,
  expiresAt: '',
  reason: '',
});
```

**On mount (inside the EditLocationModal via useEffect):**
```typescript
useEffect(() => {
  locationService.getDelegations(location.id)
    .then(setDelegations)
    .catch(() => {/* silently ignore */});
}, [location.id]);
```

**Supervisor type options for delegation form:**  
Filtered to types with an existing primary supervisor at this location, excluding worker roles:
```typescript
const delegatableRoles = supervisors
  .filter(s =>
    s.isPrimary &&
    s.supervisorType !== 'TECHNOLOGY_ASSISTANT' &&
    s.supervisorType !== 'MAINTENANCE_WORKER'
  )
  .map(s => s.supervisorType);
```

**Delegation display:** Show all delegations from state. Active ones (isActive && expiresAt > now) show a green "Active" indicator; expired/revoked ones show muted styling. The Revoke button only appears for active ones.

**Section header chip:**  
`Temporary Delegates (N active)` — N is the count of active, non-expired delegations.

**Helper to format expiry:**
```typescript
const formatExpiry = (iso: string) => new Date(iso).toLocaleString();
```

**Revoke handler:**
```typescript
const handleRevoke = async (delegationId: string) => {
  await locationService.revokeDelegation(location.id, delegationId);
  const updated = await locationService.getDelegations(location.id);
  setDelegations(updated);
};
```

**Create handler:**
```typescript
const handleCreateDelegate = async () => {
  if (!newDelegate.supervisorType || !newDelegate.delegateUserId || !newDelegate.expiresAt) {
    setError('Role, delegate, and expiry date are required');
    return;
  }
  await locationService.createDelegation(location.id, {
    supervisorType: newDelegate.supervisorType as SupervisorType,
    delegateUserId: newDelegate.delegateUserId,
    expiresAt: new Date(newDelegate.expiresAt).toISOString(),
    reason: newDelegate.reason || undefined,
  });
  const updated = await locationService.getDelegations(location.id);
  setDelegations(updated);
  setShowAddDelegate(false);
  setNewDelegate({ supervisorType: '', delegateUserId: null, expiresAt: '', reason: '' });
};
```

**Minimum expiry:** The `datetime-local` input should have `min` set to the current datetime to prevent setting already-expired delegations.

---

## 5. Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `backend/prisma/migrations/20260630120000_add_supervisor_delegations/migration.sql` | DDL for new table |
| `.github/docs/subagent_docs/SUPERVISOR_DELEGATION_spec.md` | This spec |

### Modified Files
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `SupervisorDelegation` model + back-relations on `User` and `OfficeLocation` |
| `backend/src/validators/location.validators.ts` | Add `CreateDelegationSchema`, `DelegationParamSchema` |
| `backend/src/services/location.service.ts` | Add `SupervisorDelegationWithDetails` type + 3 new methods |
| `backend/src/controllers/location.controller.ts` | Add 3 new handlers |
| `backend/src/routes/location.routes.ts` | Add 3 new routes with `requireAdmin` |
| `backend/src/services/purchaseOrder.service.ts` | Replace hard throw with delegation lookup (lines 1154–1158) |
| `frontend/src/types/location.types.ts` | Add `SupervisorDelegation` and `CreateDelegationRequest` interfaces |
| `frontend/src/services/location.service.ts` | Add 3 delegation service methods |
| `frontend/src/pages/SupervisorManagement.tsx` | Add delegation state + `DelegatesSection` in `EditLocationModal` |

---

## 6. Dependencies

No new npm dependencies. All patterns use:
- Prisma 7 (existing) — no new queries outside existing patterns
- Zod 4 (existing) — `z.string().datetime()` for ISO 8601 validation
- MUI v7 (existing) — `datetime-local` via standard `<input type="datetime-local" className="form-input" />`
- `UserSearchAutocomplete` (existing component) — drop-in, no modification

---

## 7. Configuration Changes

None — no new environment variables, no Entra scopes, no email notifications.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Delegate is the PO requestor (separation of duties violation) | The existing requestor check at line 1013 runs **before** the supervisor stage check and blocks self-approval regardless of delegation |
| Delegate could approve at multiple stages | The existing multi-stage approval check at lines 1026–1043 blocks a user who already approved at any prior stage |
| Admin sets delegation to wrong location/role | Role dropdown is filtered to types with existing primary supervisors at that location; wrong matches are prevented by the exact `(locationId, supervisorType)` query |
| Delegation not cleaned up after expiry | No cleanup job needed — the query filters `expiresAt: { gt: now }` at approval time; expired records are inert |
| Food service POs bypassed unintentionally | Food service check uses Entra group, runs before the location supervisor block — delegation query is never reached for food service POs |
| Admin accidentally delegates a worker role | `createDelegation` service method rejects `TECHNOLOGY_ASSISTANT` and `MAINTENANCE_WORKER` with a 400; UI also filters these from the role dropdown |

---

## 9. Build Validation Plan

Run after implementation:
```powershell
scripts/preflight.ps1
```

This builds both Docker images (shared → backend → frontend), which validates:
- Prisma schema compiles and `prisma generate` succeeds
- Backend TypeScript compiles with new model types
- Frontend TypeScript compiles with new interface types

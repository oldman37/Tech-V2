# Admin Jobs Page — Implementation Specification

**Document type:** Research & Specification (Phase 1 output)  
**Date:** 2026-05-11  
**Author:** Research Subagent  
**Target:** Implementation Subagent

---

## 1. Current State Summary

### 1.1 Existing Backend Endpoints (`/api/admin/*`)

All admin routes are registered in `backend/src/routes/admin.routes.ts` and mounted at `/api/admin` in `server.ts`. Every route is guarded by `authenticate` + `requireAdmin` middleware (JWT cookie → role check).

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| `GET`  | `/api/admin/sync-status` | ✅ Exists | Returns user counts, last sync time, role breakdown, env-var group config flags |
| `POST` | `/api/admin/sync-users/all` | ✅ Exists | Synchronous — calls `UserSyncService.syncAllUsers()`, waits for result |
| `POST` | `/api/admin/sync-users/staff` | ✅ Exists | Synchronous — uses `ENTRA_ALL_STAFF_GROUP_ID` env var |
| `POST` | `/api/admin/sync-users/students` | ✅ Exists | Synchronous — uses `ENTRA_ALL_STUDENTS_GROUP_ID` env var |
| `POST` | `/api/admin/sync-users/group/:groupId` | ✅ Exists | Synchronous — arbitrary group by ID |
| `GET`  | `/api/admin/cron-jobs/status` | ✅ Exists | Returns scheduled job names + next run times |
| `POST` | `/api/admin/sync-supervisors/trigger` | ✅ Exists | **Fire-and-forget** — spawns `npx tsx scripts/sync-supervisor-assignments.ts` as a child process, returns immediately with "started" message. Does NOT return result counts. |
| `POST` | `/api/admin/jobs/sync-locations` | ❌ **Missing** | Required — needs new endpoint |
| `POST` | `/api/admin/jobs/sync-supervisors` | ❌ **Missing** (proper version) | Required — the `/trigger` endpoint exists but spawns external process; needs synchronous version |

### 1.2 Existing Services

**`backend/src/services/userSync.service.ts`**  
- `UserSyncService` class (takes `PrismaClient` + `Client` in constructor)
- `syncAllUsers()` → `SyncOperationResult`
- `syncGroupUsers(groupId)` → `SyncOperationResult`
- Returns: `{ added, updated, errors, deactivated, totalProcessed, durationMs, errorDetails }`
- All operations synchronous (awaits Graph API + DB)

**`backend/src/services/cronJobs.service.ts`**  
- Schedules a daily 2 AM supervisor sync via `node-cron`
- `triggerSupervisorSync()` — spawns `scripts/sync-supervisor-assignments.ts` as child process via `spawn('npx', ['tsx', scriptPath])`
- **Problem:** Uses child process spawn, cannot return result counts to the caller

### 1.3 Script Logic to Extract

**`backend/scripts/sync-locations-and-supervisors.ts`** — Combined script (older):
1. Deletes all `LocationSupervisor` records
2. Fetches each supervisor group from Entra (via Graph API)
3. For each member: looks up user in DB by email, reads their `officeLocation`
4. Uses a `locationMapping` dictionary to resolve location name → `{ code, type }` 
5. Calls `prisma.officeLocation.findFirst({ where: { code } })` — creates if missing
6. Creates `prisma.locationSupervisor.create(...)` records with `assignedBy: 'SYSTEM_SYNC'`

**`backend/scripts/sync-supervisor-assignments.ts`** — Newer version used by cron:
- Essentially same logic but with `departmentCode` overrides for district-level supervisors  
  (Director of Schools → `'DO'`, Finance Director → `'FD'`, etc.)
- This is the canonical version that should be extracted into a service

**Key insight:** Both scripts perform two distinct operations that can be two endpoints or one:
- **Location sync** — ensures `OfficeLocation` records exist (reads from Entra `officeLocation` field on user objects)
- **Supervisor assignment sync** — populates `LocationSupervisor` junction table

### 1.4 Prisma Schema — Relevant Models

```prisma
model OfficeLocation {
  id          String               @id @default(uuid())
  name        String               @unique
  code        String?              @unique
  type        String               // "SCHOOL" | "DEPARTMENT" | "DISTRICT_OFFICE"
  isActive    Boolean              @default(true)
  supervisors LocationSupervisor[]
  // ... equipment, rooms, purchase_orders
  @@map("office_locations")
}

model LocationSupervisor {
  id             String         @id @default(uuid())
  locationId     String
  userId         String
  supervisorType String         // "PRINCIPAL" | "VICE_PRINCIPAL" | "DIRECTOR_OF_SCHOOLS" | etc.
  isPrimary      Boolean        @default(false)
  assignedAt     DateTime       @default(now())
  assignedBy     String?        // "SYSTEM_SYNC" for automated; userId for manual
  @@unique([locationId, userId, supervisorType])
  @@map("location_supervisors")
}

model User {
  id               String    @id @default(uuid())
  officeLocation   String?   // Plain string from Entra — NOT a foreign key
  locationSupervisors LocationSupervisor[]
  // ...
  @@map("users")
}
```

**There is no existing `AdminJobRun` or job tracking model in the schema.**

### 1.5 Frontend Structure

**Pages:**
- `frontend/src/pages/admin/AdminSettings.tsx` — Existing admin settings at `/admin/settings`, uses hash-based tabs (`#general`, `#requisitions`, `#fiscal-year`)
- `frontend/src/pages/Users.tsx` — Shows sync panel using the mutation hooks

**Pattern established in `AdminSettings.tsx`:**
- MUI `Tabs` + tab panels with URL hash synchronization for deep-linking
- React Hook Form + Zod for forms
- TanStack Query `useQuery` / `useMutation`
- `useQueryClient().invalidateQueries()` on success

**Services:**
- `frontend/src/services/adminService.ts` — all admin API calls; exports `adminService` object
- `frontend/src/services/api.ts` — Axios instance with CSRF token management + proactive refresh

**Auth hooks/store:**
- `frontend/src/store/authStore.ts` — Zustand store, `user.roles` array, admin check: `user?.roles?.includes('ADMIN')`
- `frontend/src/components/ProtectedRoute.tsx` — wraps routes with `requireAdmin?: boolean` prop

**Query keys:**
- `queryKeys.admin.syncStatus()` → `['admin', 'syncStatus']` (already exists)
- `queryKeys.admin.all` → `['admin']`
- `queryKeys.locations.all` → `['locations']`

**Existing mutation hooks (`frontend/src/hooks/mutations/useAdminMutations.ts`):**
- `useSyncAllUsers()`, `useSyncStaffUsers()`, `useSyncStudentUsers()`
- Pattern: `useMutation({ mutationFn: () => adminService.X(), onSuccess: () => queryClient.invalidateQueries(...) })`

**Router (`frontend/src/App.tsx`):**
- Admin routes use `<ProtectedRoute requireAdmin>` wrapper
- Pattern: `/admin/settings`, `/admin/new-fiscal-year` (redirect)
- New route should follow: `/admin/jobs`

---

## 2. Architecture Decisions

### 2.1 Synchronous vs. Async Jobs

**Decision: Synchronous with extended timeout guidance**

**Rationale:**
- The existing user sync endpoints (`sync-users/staff`, `sync-users/students`) are already synchronous and return full result objects. This sets user expectations of getting result counts back immediately.
- The locations + supervisor sync involves Graph API calls (one per group, ~10–12 groups) plus DB writes. Estimated duration: 5–30 seconds depending on group sizes. This is within a reasonable HTTP timeout window.
- Async (fire-and-forget + polling) adds significant complexity: a job queue, a polling endpoint, a DB or in-memory store for job state, and frontend polling logic. This complexity is not warranted for infrequent admin-triggered actions.
- The existing `POST /api/admin/sync-supervisors/trigger` is fire-and-forget **only because it uses a child process script**. When refactored to a direct service call, it can return results synchronously.

**Timeout Risk Mitigation:**
- Nginx is already in the stack (see `frontend/nginx.conf`, `docker-compose.yml`). Ensure `proxy_read_timeout` is set to ≥ 120s for admin routes.
- Frontend: disable the refresh button during mutation (`isLoading`)  
- Backend: no specific timeout needed; Graph API calls complete within 30s for reasonable group sizes

### 2.2 Job Tracking in Database

**Decision: No new DB model — return results in the API response; store last-run metadata in a new lightweight `queryKeys.admin.jobStatus` query**

**Rationale:**
- A new `AdminJobRun` Prisma model requires a migration, adds schema complexity, and is over-engineered for 4 jobs that are triggered manually.
- The sync status endpoint `GET /api/admin/sync-status` already provides useful metadata (last sync time derived from `User.lastSync`).
- For supervisor/location syncs, the "last run" can be inferred from `LocationSupervisor.assignedAt` (newest record).

**What the UI will track:**
- In-component React state: `lastResult` (the response from the last mutation in this session)
- Between sessions: no persistence (jobs page will show "—" for last run until a trigger is done, or we can compute from DB on the new status endpoint)

### 2.3 New Service: `LocationSyncService`

Extract the sync-supervisor-assignments.ts logic into a proper backend service at:  
`backend/src/services/locationSync.service.ts`

This service will be callable from:
1. The new `/api/admin/jobs/sync-locations` endpoint
2. The new `/api/admin/jobs/sync-supervisors` endpoint  
3. The existing `cronJobsService.triggerSupervisorSync()` (replacing the child process spawn)

### 2.4 Rate Limiting for Job Endpoints

Apply a stricter per-route rate limit on job trigger endpoints. Express `express-rate-limit` is already used globally (500 req/15min). Add a job-specific limiter: **5 requests per 5 minutes per IP** on the `POST /api/admin/jobs/*` routes.

### 2.5 Page Integration Decision

**Decision: New separate page `/admin/jobs` rather than adding a 4th tab to `AdminSettings.tsx`**

**Rationale:**
- `AdminSettings.tsx` is already 700+ lines. Adding a 4th tab for jobs increases complexity.
- Jobs are operationally distinct from settings (they are actions, not configuration).
- Allows a separate navigation entry, cleaner code split.
- Pattern is identical to `/admin/settings` — same `ProtectedRoute requireAdmin` guard.

---

## 3. Backend Specification

### 3.1 New Service — `backend/src/services/locationSync.service.ts`

```typescript
export interface LocationSyncResult {
  locationsCreated: number;
  locationsVerified: number;
  assignmentsCreated: number;
  assignmentsSkipped: number;
  errors: number;
  errorDetails: Array<{ group: string; email?: string; message: string }>;
  durationMs: number;
}

export class LocationSyncService {
  constructor(
    private prisma: PrismaClient,
    private graphClient: Client
  ) {}

  /** Step 1: Sync OfficeLocation records from Entra user data */
  async syncLocations(): Promise<LocationSyncResult>

  /** Step 2: Sync LocationSupervisor assignments from Entra group membership */
  async syncSupervisorAssignments(): Promise<LocationSyncResult>

  /** Combined: run both steps in sequence */
  async syncAll(): Promise<{ locations: LocationSyncResult; supervisors: LocationSyncResult }>
}
```

**Key logic (from script):**

```
syncSupervisorAssignments():
  1. DELETE FROM location_supervisors (full wipe and rebuild)
  2. For each group in supervisorGroups array (10–12 groups):
     a. Call Graph API: GET /groups/{groupId}/members?$select=mail,officeLocation,displayName
     b. For each member:
        - Find user by email (case-insensitive) WHERE isActive = true
        - Resolve location: if group has departmentCode → use that; else use user.officeLocation
        - Look up locationMapping to get { code, type }
        - prisma.officeLocation.findFirst({ where: { code } }) — create if missing
        - prisma.locationSupervisor.create({ locationId, userId, supervisorType, isPrimary, assignedBy: 'SYSTEM_SYNC' })
  3. Return counts

syncLocations():
  - Similar but only creates/verifies OfficeLocation records without touching LocationSupervisor
  - Useful to run independently after adding a new school location
```

**Supervisor groups config** (from `sync-supervisor-assignments.ts`, env vars required):
```
ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID  → DIRECTOR_OF_SCHOOLS, primary, departmentCode: 'DO'
ENTRA_FINANCE_DIRECTOR_GROUP_ID     → FINANCE_DIRECTOR, primary, departmentCode: 'FD'
ENTRA_SPED_DIRECTOR_GROUP_ID        → SPED_DIRECTOR, not primary, departmentCode: 'SPED'
ENTRA_PRINCIPALS_GROUP_ID           → PRINCIPAL, primary
ENTRA_VICE_PRINCIPALS_GROUP_ID      → VICE_PRINCIPAL, not primary
ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID → MAINTENANCE_DIRECTOR, primary, departmentCode: 'MAINT'
ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID → TRANSPORTATION_DIRECTOR, primary, departmentCode: 'TRANS'
ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID  → TECHNOLOGY_DIRECTOR, primary, departmentCode: 'TECH'
ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID → AFTERSCHOOL_DIRECTOR, not primary
ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID → SUPERVISORS_OF_INSTRUCTION, not primary
ENTRA_NURSE_DIRECTOR_GROUP_ID       → NURSE_DIRECTOR, not primary
```

### 3.2 Update `cronJobs.service.ts`

Replace the child process spawn in `runSupervisorSync()` with a direct call to `LocationSyncService.syncSupervisorAssignments()`. This requires constructing a `graphClient` (same pattern as `admin.routes.ts` `createGraphClient()`).

```typescript
// In cronJobs.service.ts
private async runSupervisorSync(): Promise<void> {
  const graphClient = await createGraphClient(); // same helper as admin.routes
  const syncService = new LocationSyncService(prisma, graphClient);
  await syncService.syncSupervisorAssignments();
}
```

### 3.3 New Endpoints in `admin.routes.ts`

#### `POST /api/admin/jobs/sync-locations`
```typescript
router.post('/jobs/sync-locations', async (req: AuthRequest, res: Response) => {
  // Rate limited (job limiter, see 3.4)
  const graphClient = await createGraphClient();
  const syncService = new LocationSyncService(prisma, graphClient);
  
  loggers.admin.info('Location sync triggered', { triggeredBy: req.user?.email });
  const result = await syncService.syncLocations();
  
  res.json({
    success: true,
    message: `Location sync complete: ${result.locationsCreated} created, ${result.locationsVerified} verified`,
    detail: result,
  });
});
```

Response shape:
```json
{
  "success": true,
  "message": "Location sync complete: 2 created, 8 verified",
  "detail": {
    "locationsCreated": 2,
    "locationsVerified": 8,
    "assignmentsCreated": 0,
    "assignmentsSkipped": 0,
    "errors": 0,
    "errorDetails": [],
    "durationMs": 3200
  }
}
```

#### `POST /api/admin/jobs/sync-supervisors`
```typescript
router.post('/jobs/sync-supervisors', async (req: AuthRequest, res: Response) => {
  const graphClient = await createGraphClient();
  const syncService = new LocationSyncService(prisma, graphClient);
  
  loggers.admin.info('Supervisor sync triggered', { triggeredBy: req.user?.email });
  const result = await syncService.syncSupervisorAssignments();
  
  res.json({
    success: true,
    message: `Supervisor sync complete: ${result.assignmentsCreated} assignments created, ${result.errors} errors`,
    detail: result,
  });
});
```

#### `GET /api/admin/jobs/status`
Returns current state info to populate job cards on page load:
```typescript
router.get('/jobs/status', async (req: Request, res: Response) => {
  const [lastSupervisorAssignment, locationCount, supervisorCount] = await Promise.all([
    prisma.locationSupervisor.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.officeLocation.count({ where: { isActive: true } }),
    prisma.locationSupervisor.count(),
  ]);
  
  const lastUserSync = await prisma.user.findFirst({
    orderBy: { lastSync: 'desc' },
    select: { lastSync: true },
  });

  res.json({
    supervisorSync: {
      lastRunAt: lastSupervisorAssignment?.createdAt ?? null,
      currentCount: supervisorCount,
    },
    locationSync: {
      currentCount: locationCount,
    },
    userSync: {
      lastRunAt: lastUserSync?.lastSync ?? null,
    },
  });
});
```

### 3.4 Rate Limiting for Job Endpoints

Add in `admin.routes.ts` before the jobs routes:

```typescript
import rateLimit from 'express-rate-limit';

const jobLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many job triggers. Please wait before retrying.' },
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'unknown',
});

router.post('/jobs/sync-locations', jobLimiter, async (req, res) => { ... });
router.post('/jobs/sync-supervisors', jobLimiter, async (req, res) => { ... });
```

**Note:** Key by `user.id` (not IP) since admins come from the same network. User is guaranteed to exist at this point (set by `authenticate` middleware above the route).

### 3.5 Audit Logging

The `loggers.admin` logger (already used throughout `admin.routes.ts`) provides sufficient audit trail. Log at `info` level:
```typescript
loggers.admin.info('Admin job triggered', {
  job: 'sync-supervisors',       // or 'sync-locations', 'sync-users/staff', etc.
  triggeredBy: req.user?.email,
  userId: req.user?.id,
  resultSummary: { assignmentsCreated: result.assignmentsCreated, errors: result.errors },
  durationMs: result.durationMs,
});
```

---

## 4. Frontend Specification

### 4.1 Files to Create

| File | Description |
|------|-------------|
| `frontend/src/pages/admin/AdminJobsPage.tsx` | New page component |
| `frontend/src/hooks/mutations/useJobMutations.ts` | TanStack mutations for job triggers |
| `frontend/src/hooks/queries/useJobStatus.ts` | TanStack query for job status |

### 4.2 Files to Modify

| File | Change |
|------|--------|
| `frontend/src/services/adminService.ts` | Add job trigger + status methods |
| `frontend/src/lib/queryKeys.ts` | Add `queryKeys.admin.jobStatus()` key |
| `frontend/src/App.tsx` | Add `/admin/jobs` route |
| `frontend/src/components/layout/AppLayout.tsx` | Add navigation link (verify this file) |

### 4.3 Service Layer — `adminService.ts` additions

```typescript
export interface JobStatus {
  supervisorSync: { lastRunAt: string | null; currentCount: number };
  locationSync: { currentCount: number };
  userSync: { lastRunAt: string | null };
}

export interface JobResult {
  success: boolean;
  message: string;
  detail: {
    locationsCreated?: number;
    locationsVerified?: number;
    assignmentsCreated?: number;
    assignmentsSkipped?: number;
    added?: number;
    updated?: number;
    errors: number;
    errorDetails: Array<{ group?: string; entraId?: string; message: string }>;
    durationMs: number;
  };
}

// Add to adminService object:
getJobStatus: async (): Promise<JobStatus> => {
  const response = await api.get('/admin/jobs/status');
  return response.data;
},

syncLocations: async (): Promise<JobResult> => {
  const response = await api.post('/admin/jobs/sync-locations');
  return response.data;
},

syncSupervisors: async (): Promise<JobResult> => {
  const response = await api.post('/admin/jobs/sync-supervisors');
  return response.data;
},
```

### 4.4 Query Keys — `queryKeys.ts` addition

```typescript
admin: {
  all: ['admin'] as const,
  syncStatus: () => [...queryKeys.admin.all, 'syncStatus'] as const,
  jobStatus: () => [...queryKeys.admin.all, 'jobStatus'] as const,   // ADD THIS
},
```

### 4.5 Mutation Hooks — `useJobMutations.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

export function useSyncStaffUsers() { /* already exists — re-export or keep in useAdminMutations */ }

export function useSyncLocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminService.syncLocations(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
    },
  });
}

export function useSyncSupervisors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminService.syncSupervisors(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    },
  });
}
```

**Note:** `useSyncStaffUsers` and `useSyncStudentUsers` already exist in `useAdminMutations.ts`. Either import them from there or move all job mutations to the new file for organization.

### 4.6 Query Hook — `useJobStatus.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

export function useJobStatus() {
  return useQuery({
    queryKey: queryKeys.admin.jobStatus(),
    queryFn: () => adminService.getJobStatus(),
    staleTime: 30_000, // 30 seconds — this data doesn't change often
  });
}
```

### 4.7 Page Component — `AdminJobsPage.tsx`

**Route:** `/admin/jobs`  
**Guard:** `<ProtectedRoute requireAdmin>`

**UI layout (MUI):**

```
Page title: "Admin Jobs"
Subtitle: "Trigger background sync operations. These operations call Microsoft Entra ID (Azure AD) and may take up to 30 seconds."

[Warning Alert]: Jobs marked with ⚠ will clear and rebuild all existing records before re-syncing. Verify data before running in production.

Grid of 4 Job Cards (2-column on desktop, 1-column on mobile):

┌───────────────────────────────────────┐
│ Sync Staff Users                      │
│ Syncs all staff from Entra All-Staff  │
│ group. Updates roles & permissions.   │
│                                       │
│ Last run: [lastSyncedAt from status]  │
│ [Run Now] ← confirmation dialog first │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Sync Student Users                    │
│ Syncs all students from Entra         │
│ All-Students group.                   │
│                                       │
│ Last run: [from status]               │
│ [Run Now]                             │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ ⚠ Update Locations                    │
│ Creates/verifies OfficeLocation        │
│ records from Entra user data.         │
│ Safe to run multiple times.           │
│                                       │
│ Current count: [N] active locations   │
│ [Run Now]                             │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ ⚠ Update Supervisors                  │
│ CLEARS all supervisor-location        │
│ assignments then rebuilds from        │
│ Entra group membership.               │
│                                       │
│ Last rebuild: [from lastSupervisor]   │
│ Current assignments: [N]              │
│ [Run Now]                             │
└───────────────────────────────────────┘
```

**Per-card state machine:**
```
idle → (click Run Now) → confirm dialog open
confirm dialog: [Cancel] [Confirm Run] → confirmed triggers mutation → running
running → success (show result banner) or error (show error Alert)
```

**Job card props:**
```typescript
interface JobCardProps {
  title: string;
  description: string;
  warningText?: string;        // shown in amber Alert if destructive
  statusLine?: string;         // e.g. "Last run: May 11, 2026 2:00 AM"
  isRunning: boolean;
  lastResult?: string | null;  // e.g. "Synced 245 users (12 added, 233 updated)"
  lastError?: string | null;
  onRun: () => void;
  disabled?: boolean;
}
```

**Confirmation dialog text per job:**

| Job | Dialog Title | Dialog Body |
|-----|-------------|-------------|
| Sync Staff | "Sync Staff Users?" | "This will fetch all staff from Entra All-Staff group and update their records. Existing users will be updated; new users will be created." |
| Sync Students | "Sync Student Users?" | "This will fetch all students from Entra All-Students group and update their records." |
| Update Locations | "Update Office Locations?" | "This will create or verify office location records based on Entra user data. Existing locations will not be deleted." |
| Update Supervisors | "Rebuild Supervisor Assignments?" | "This will DELETE all existing supervisor-location assignments and rebuild them from Entra group membership. This action cannot be undone. Only run this if supervisor assignments are out of sync." |

**Result display (shown below card after run, inside an Alert):**
- Success: `<Alert severity="success">` — show `result.message` + duration
- Error: `<Alert severity="error">` — show error message; if `errorDetails` array has items, show expandable list

### 4.8 Route Registration — `App.tsx`

Add after the `/admin/settings` route:

```tsx
import AdminJobsPage from './pages/admin/AdminJobsPage'

// Inside <Routes>:
<Route
  path="/admin/jobs"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <AdminJobsPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

### 4.9 Navigation Link

Check `frontend/src/components/layout/AppLayout.tsx` (or wherever the sidebar nav is defined) for where to add an "Admin Jobs" link alongside the existing "Settings" link. It should appear in the Admin section of the nav, visible only when `user?.roles?.includes('ADMIN')`.

---

## 5. Security Requirements

### 5.1 Authentication & Authorization
- All new API endpoints are behind the existing `authenticate` + `requireAdmin` middleware chain — no changes needed.
- Frontend route protected by `<ProtectedRoute requireAdmin>`.

### 5.2 CSRF Protection
- The existing `provideCsrfToken` middleware applies to all routes; the Axios client in `api.ts` automatically reads and sends the `X-CSRF-Token` header on POST requests. No additional work needed.

### 5.3 Rate Limiting
- Job endpoints limited to 5 requests per 5 minutes per `user.id` (not IP, since all admins share an IP on-prem).
- Global limiter (500/15min) still applies in addition.

### 5.4 Audit Logging
- Every job trigger logs `{ job, triggeredBy (email), userId, timestamp, resultSummary }` via `loggers.admin.info`.
- Logs are persisted to the rotating file logger already configured in `backend/src/lib/logger.ts`.

### 5.5 Input Validation
- No user-provided input (all endpoints take no body); nothing to validate.
- Group IDs come from environment variables, not from the request body.

---

## 6. File Change Summary for Implementation Subagent

### Backend (new files)
- `backend/src/services/locationSync.service.ts` — **CREATE**

### Backend (modified files)
- `backend/src/routes/admin.routes.ts` — add `GET /jobs/status`, `POST /jobs/sync-locations`, `POST /jobs/sync-supervisors`, add `jobLimiter`
- `backend/src/services/cronJobs.service.ts` — replace `spawn` with direct `LocationSyncService` call

### Frontend (new files)
- `frontend/src/pages/admin/AdminJobsPage.tsx` — **CREATE**
- `frontend/src/hooks/mutations/useJobMutations.ts` — **CREATE** (or add to `useAdminMutations.ts`)
- `frontend/src/hooks/queries/useJobStatus.ts` — **CREATE** (or add to `useAdmin.ts`)

### Frontend (modified files)
- `frontend/src/services/adminService.ts` — add `getJobStatus`, `syncLocations`, `syncSupervisors`
- `frontend/src/lib/queryKeys.ts` — add `admin.jobStatus()` key
- `frontend/src/App.tsx` — add `/admin/jobs` route
- `frontend/src/components/layout/AppLayout.tsx` — add sidebar nav link (verify exact file path)

---

## 7. Key Implementation Notes for Implementation Subagent

1. **`LocationSyncService` must not be a singleton** — instantiate it per-request with a fresh `graphClient` (same pattern as `UserSyncService` in `admin.routes.ts`). The `createGraphClient()` helper function already exists in `admin.routes.ts`; extract it to a shared util or duplicate it in the service.

2. **`sync-supervisor-assignments.ts` is the canonical script** (not `sync-locations-and-supervisors.ts`). It has the `departmentCode` override feature for district-level supervisors. Use this as the reference for `LocationSyncService.syncSupervisorAssignments()`.

3. **Do NOT delete `sync-supervisor-assignments.ts`.** The cron service currently spawns it; until `cronJobs.service.ts` is updated to call the service directly, the script must remain.

4. **The `POST /api/admin/sync-supervisors/trigger` (existing endpoint) is separate** from the new `POST /api/admin/jobs/sync-supervisors`. The existing trigger endpoint should remain untouched (or be deprecated later). The new endpoint is the proper synchronous version.

5. **Frontend mutation hooks:** `useSyncStaffUsers` and `useSyncStudentUsers` already exist in `useAdminMutations.ts`. The new `AdminJobsPage` should import those from there and only the new location/supervisor mutations from `useJobMutations.ts`.

6. **Query key for job status:** Add `jobStatus: () => [...queryKeys.admin.all, 'jobStatus'] as const` to the `admin` key group in `queryKeys.ts`.

7. **Destructive warning on "Update Supervisors":** The job deletes ALL `LocationSupervisor` records before re-creating them. The confirmation dialog must make this very clear. Use `severity="warning"` Alert inside the card itself (not just in the dialog).

8. **Error details in `LocationSyncResult`:** Include the supervisor group name in each error detail (e.g., `{ group: 'Principals', email: 'user@domain.com', message: 'User not found in database' }`). The frontend should show a count of errors in the result banner, with an expandable list if errors > 0.

9. **Nginx timeout:** If the supervisor sync consistently runs near or above 30 seconds, add `proxy_read_timeout 120;` to the nginx admin route config. Document this in the spec comments.

10. **The `AdminJobsPage` is a "dumb" page** — it holds per-card local state (`lastResult`, `lastError`, `confirmOpen`). The heavy lifting is in the mutation hooks. Keep the page component's own state minimal.

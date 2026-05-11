# Admin Jobs — Configurable Schedule Extension Specification

**Document type:** Research & Specification (Phase 1 output)  
**Date:** 2026-05-11  
**Author:** Research Subagent  
**Target:** Implementation Subagent  
**Spec file:** `docs/SubAgent/admin_jobs_schedule_spec.md`

---

## 1. Research Summary

### 1.1 Cron Library Currently In Use

**`node-cron@4.2.1`** is already installed in `backend/package.json`.

`node-cron` v4 supports:
- Standard 5-field cron expressions (`minute hour dom month dow`)
- `timezone` option (project uses `America/Chicago`)
- `cron.schedule(expr, fn, options)` returns a `ScheduledTask` with `.stop()`, `.start()`, `.destroy()` methods
- No built-in "next run time" computation — a separate library (`cron-parser`) is needed for that

**Additional packages required:**

| Package | Side | Purpose | Already installed? |
|---------|------|---------|-------------------|
| `cron-parser` | Backend | Compute `nextRunAt` from a cron expression | ❌ No |
| `cronstrue` | Frontend | Human-readable cron description ("Every day at 3:00 AM") | ❌ No |

Both are widely-used, zero-CVE, MIT-licensed packages with no transient risk.

### 1.2 Current `cronJobs.service.ts` Architecture

| Aspect | Current State |
|--------|--------------|
| Library | `node-cron` v4 |
| Jobs scheduled | One: `supervisorSync` (daily 2 AM, or `SUPERVISOR_SYNC_SCHEDULE` env var) |
| Schedule source | Hard-coded / env var only (not DB) |
| Job map | `Map<string, ScheduledTask>` — in-memory only |
| Execution | Calls `LocationSyncService.syncSupervisorAssignments()` directly ✅ |
| Manual trigger | `triggerSupervisorSync()` — called by `POST /api/admin/sync-supervisors/trigger` |
| Overlap prevention | None — concurrent runs possible ⚠️ |
| Next-run info | Stub string only (`"Next run: 0 2 * * * (check cron schedule)"`) |
| DB involvement | None — completely stateless |

The `CronJobsService` is a singleton exported as `cronJobsService` and initialized in `server.ts` via `cronJobsService.start()`.

### 1.3 Existing Admin Job Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/admin/jobs/status` | Returns last-run metadata (derived from DB timestamps) |
| `POST` | `/api/admin/jobs/sync-locations` | Rate-limited (5/5min/user) |
| `POST` | `/api/admin/jobs/sync-supervisors` | Rate-limited (5/5min/user) |
| `POST` | `/api/admin/sync-users/staff` | Sync staff from Entra |
| `POST` | `/api/admin/sync-users/students` | Sync students from Entra |
| `GET` | `/api/admin/cron-jobs/status` | Returns jobs map (stub) |
| `POST` | `/api/admin/sync-supervisors/trigger` | **Legacy** fire-and-forget; kept for compatibility |

### 1.4 Existing Frontend Structure Summary

- **`AdminJobsPage.tsx`** (340 lines): 4 job cards, manual run only, confirmation dialog per job, in-component `cardState` for last result, uses `useJobStatus()` for DB-derived metadata
- **`useJobMutations.ts`**: `useSyncLocations()` + `useSyncSupervisors()`
- **`adminService.ts`**: Typed API wrappers; `getJobStatus()`, `syncLocations()`, `syncSupervisors()`
- **`queryKeys.ts`**: `queryKeys.admin.jobStatus()` → `['admin', 'jobStatus']`
- **Pattern**: TanStack Query, MUI, confirmation dialogs before destructive ops

### 1.5 Prisma Migration Naming Convention

Format: `YYYYMMDDHHMMSS_description_in_snake_case`  
Examples:
- `20260505120000_add_transportation_part_c_bus_and_drivers`
- `20260430232942_add_transportation_requests`

New migration should be: **`20260511120000_add_job_schedules`**

---

## 2. Production Best Practices Research

### 2.1 Storing Cron Expressions in PostgreSQL

**Pattern used in production Node.js/Prisma apps:**
- Store the raw cron expression string in DB (standard 5-field POSIX format)
- Store `enabled` boolean — when false, load from DB but do not register in the scheduler
- Store `nextRunAt` — compute from expression on every schedule update and after each run; cache in DB so frontend can display it without parsing client-side
- Store `lastRunAt`, `lastRunStatus`, `lastRunResult` — update after each execution
- Use `@updatedAt` for audit trail; also store `updatedBy` (userId)

### 2.2 Updating a Running `node-cron` Task Without Restarting

`node-cron` v4 `ScheduledTask` lifecycle:
```
task.stop()     — suspends execution (does not destroy)
task.destroy()  — removes from cron registry entirely
```

**Safe hot-swap pattern:**
```typescript
const existing = this.jobs.get(jobKey);
if (existing) {
  existing.stop();
  existing.destroy();
  this.jobs.delete(jobKey);
}
if (enabled) {
  const task = cron.schedule(cronExpr, handler, { timezone });
  this.jobs.set(jobKey, task);
}
```
This is safe to call from a PUT endpoint at runtime without restarting the server.

### 2.3 Overlap Prevention (Job Lock / Mutex)

Pattern: In-memory `isRunning` flag per job key. Because this is a single-process Node app (not multi-container), in-process flags are sufficient.

```typescript
private isRunning: Map<string, boolean> = new Map();

async runJob(jobKey: string): Promise<void> {
  if (this.isRunning.get(jobKey)) {
    throw new Error(`Job ${jobKey} is already running`);
  }
  this.isRunning.set(jobKey, true);
  try {
    await this.dispatch(jobKey);
  } finally {
    this.isRunning.set(jobKey, false);
  }
}
```

For multi-replica deployments (future), replace with a DB-level advisory lock or an `isRunning` flag in the `JobSchedule` table.

### 2.4 Computing "Next Run" Time (`cron-parser`)

`cron-parser` package (v4+) parses standard cron expressions and computes next run times:

```typescript
import { parseExpression } from 'cron-parser';

function computeNextRun(cronExpr: string, tz: string): Date {
  const interval = parseExpression(cronExpr, { tz });
  return interval.next().toDate();
}
```

Returns a JavaScript `Date` that can be stored in the `nextRunAt` Prisma field and returned in the API response.

### 2.5 Cron Expression Security (Preventing Injection)

User-supplied cron expressions are low-risk for injection (they are parsed, not executed as shell commands), but they can still be abused to:
1. Schedule extremely frequent jobs (DoS / resource exhaustion)  
2. Supply malformed expressions that crash the parser

**Validation strategy:**
1. **Server-side structural validate** — use `cron-parser`'s `parseExpression()` wrapped in try/catch; reject if it throws
2. **Frequency check** — parse the expression and compute: if `nextRun - now < 5 minutes`, reject with 400 "Schedule too frequent (minimum interval: 5 minutes)"
3. **Field count check** — require exactly 5 whitespace-delimited fields (no seconds field, no `@yearly` shortcuts)
4. **Zod schema** — enforce these constraints as a Zod refinement on the PUT route body
5. **Never eval/exec** the expression — only pass it to `cron-parser` and `node-cron` (both safe)

```typescript
// Zod validation
const cronExprSchema = z.string()
  .refine(expr => /^\S+ \S+ \S+ \S+ \S+$/.test(expr.trim()), 
    'Cron expression must have exactly 5 fields')
  .refine(expr => {
    try { parseExpression(expr); return true; } catch { return false; }
  }, 'Invalid cron expression')
  .refine(expr => {
    try {
      const next = parseExpression(expr).next().toDate();
      const after = parseExpression(expr, { currentDate: next }).next().toDate();
      return (after.getTime() - next.getTime()) >= 5 * 60 * 1000;
    } catch { return false; }
  }, 'Schedule too frequent — minimum interval is 5 minutes');
```

---

## 3. Database Specification

### 3.1 Prisma Model: `JobSchedule`

Add to `backend/prisma/schema.prisma`:

```prisma
model JobSchedule {
  id              String    @id @default(cuid())
  jobKey          String    @unique  // "sync-staff" | "sync-students" | "sync-locations" | "sync-supervisors"
  cronExpr        String              // e.g. "0 3 * * *"
  enabled         Boolean   @default(false)
  lastRunAt       DateTime?
  lastRunStatus   String?             // "success" | "error" | "skipped"
  lastRunResult   Json?               // { synced: 5, errors: 0, message: "..." }
  nextRunAt       DateTime?           // Computed and cached on schedule update / after each run
  updatedBy       String?             // userId of last admin who changed the schedule
  updatedAt       DateTime  @updatedAt
  createdAt       DateTime  @default(now())

  @@map("job_schedules")
}
```

**Notes:**
- Uses `cuid()` as primary key (consistent with newer models in this schema; older models use `uuid()`)
- `jobKey` is `@unique` — enforces one schedule per job type
- `lastRunResult` is `Json?` — stores structured result object (counts, error details)
- `nextRunAt` is computed and written to DB by the backend after every schedule change or job completion; frontend reads it directly without any client-side cron parsing

### 3.2 Migration

**Migration name:** `20260511120000_add_job_schedules`

**SQL created by Prisma:**
```sql
CREATE TABLE "job_schedules" (
  "id"            TEXT            NOT NULL,
  "jobKey"        TEXT            NOT NULL,
  "cronExpr"      TEXT            NOT NULL,
  "enabled"       BOOLEAN         NOT NULL DEFAULT false,
  "lastRunAt"     TIMESTAMP(3),
  "lastRunStatus" TEXT,
  "lastRunResult" JSONB,
  "nextRunAt"     TIMESTAMP(3),
  "updatedBy"     TEXT,
  "updatedAt"     TIMESTAMP(3)    NOT NULL,
  "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_schedules_jobKey_key" ON "job_schedules"("jobKey");
```

### 3.3 Seed Data

Add to `backend/prisma/seed.ts` (upsert pattern to be idempotent):

```typescript
const defaultSchedules = [
  {
    jobKey: 'sync-staff',
    cronExpr: '0 3 * * *',   // 3:00 AM daily
    enabled: false,
  },
  {
    jobKey: 'sync-students',
    cronExpr: '0 3 * * *',   // 3:00 AM daily
    enabled: false,
  },
  {
    jobKey: 'sync-locations',
    cronExpr: '0 4 * * 1',   // 4:00 AM every Monday
    enabled: false,
  },
  {
    jobKey: 'sync-supervisors',
    cronExpr: '0 4 * * 1',   // 4:00 AM every Monday
    enabled: false,
  },
];

for (const schedule of defaultSchedules) {
  await prisma.jobSchedule.upsert({
    where: { jobKey: schedule.jobKey },
    update: {},                    // Never overwrite admin's live settings on re-seed
    create: {
      ...schedule,
      nextRunAt: computeNextRun(schedule.cronExpr, 'America/Chicago'),
    },
  });
}
```

All 4 schedules are **disabled by default** — admin must explicitly enable each one in the UI.

---

## 4. Backend Architecture Specification

### 4.1 New Service: `SchedulerService`

**File:** `backend/src/services/scheduler.service.ts`

This service **replaces** `CronJobsService` as the central scheduler. `CronJobsService` can be deprecated and its `start()` call in `server.ts` replaced with `schedulerService.start()`.

#### 4.1.1 Responsibilities

1. **Startup**: Load all enabled `JobSchedule` rows from DB → register `node-cron` tasks
2. **`updateSchedule(jobKey, cronExpr, enabled, userId)`**: Validate → update DB → hot-swap cron task
3. **`runJobNow(jobKey)`**: Immediately execute the job handler (manual trigger path)
4. **`getSchedules()`**: Return all 4 schedule rows (with computed `nextRunAt`)
5. **Overlap prevention**: Per-job `isRunning` flag — skip (or throw) if already running
6. **Post-run**: Write `lastRunAt`, `lastRunStatus`, `lastRunResult`, `nextRunAt` back to DB

#### 4.1.2 Full Class Design

```typescript
// backend/src/services/scheduler.service.ts
import cron from 'node-cron';
import { parseExpression } from 'cron-parser';
import { PrismaClient } from '@prisma/client';
import { loggers } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { msalClient } from '../config/entraId';
import { Client } from '@microsoft/microsoft-graph-client';
import { LocationSyncService } from './locationSync.service';
import { UserSyncService } from './userSync.service';

type JobKey = 'sync-staff' | 'sync-students' | 'sync-locations' | 'sync-supervisors';

const TIMEZONE = process.env.TZ || 'America/Chicago';

export class SchedulerService {
  private jobs: Map<JobKey, ReturnType<typeof cron.schedule>> = new Map();
  private isRunning: Map<JobKey, boolean> = new Map();

  // Called once from server.ts on startup
  async start(): Promise<void> {
    const schedules = await prisma.jobSchedule.findMany();
    for (const schedule of schedules) {
      if (schedule.enabled) {
        this.registerTask(schedule.jobKey as JobKey, schedule.cronExpr);
      }
    }
    loggers.cron.info('SchedulerService started', {
      registered: schedules.filter(s => s.enabled).map(s => s.jobKey),
    });
  }

  // Register (or re-register) a cron task — called internally
  private registerTask(jobKey: JobKey, cronExpr: string): void {
    // Destroy old task first
    const existing = this.jobs.get(jobKey);
    if (existing) { existing.stop(); existing.destroy(); this.jobs.delete(jobKey); }

    const task = cron.schedule(cronExpr, async () => {
      await this.executeJob(jobKey, 'scheduled');
    }, { timezone: TIMEZONE });

    this.jobs.set(jobKey, task);
    loggers.cron.info('Cron task registered', { jobKey, cronExpr });
  }

  // Public: update schedule (from PUT /api/admin/jobs/schedules/:jobKey)
  async updateSchedule(
    jobKey: JobKey,
    cronExpr: string,
    enabled: boolean,
    userId: string
  ): Promise<void> {
    // Compute next run
    const nextRunAt = enabled ? computeNextRun(cronExpr) : null;

    await prisma.jobSchedule.update({
      where: { jobKey },
      data: { cronExpr, enabled, nextRunAt, updatedBy: userId },
    });

    // Hot-swap the cron task
    const existing = this.jobs.get(jobKey);
    if (existing) { existing.stop(); existing.destroy(); this.jobs.delete(jobKey); }

    if (enabled) {
      this.registerTask(jobKey, cronExpr);
    }
  }

  // Public: manual trigger (from POST /api/admin/jobs/:jobKey/run)
  async runJobNow(jobKey: JobKey): Promise<Record<string, unknown>> {
    return this.executeJob(jobKey, 'manual');
  }

  // Internal: shared execution path for both scheduled and manual runs
  private async executeJob(
    jobKey: JobKey,
    trigger: 'scheduled' | 'manual'
  ): Promise<Record<string, unknown>> {
    if (this.isRunning.get(jobKey)) {
      throw new Error(`Job "${jobKey}" is already running`);
    }
    this.isRunning.set(jobKey, true);
    const startedAt = Date.now();

    loggers.cron.info('Job started', { jobKey, trigger });

    let status: 'success' | 'error' = 'success';
    let result: Record<string, unknown> = {};

    try {
      result = await this.dispatch(jobKey);
      loggers.cron.info('Job completed', { jobKey, trigger, durationMs: Date.now() - startedAt });
    } catch (err: any) {
      status = 'error';
      result = { error: err.message };
      loggers.cron.error('Job failed', { jobKey, trigger, error: err });
    } finally {
      this.isRunning.set(jobKey, false);

      // Update DB with run outcome + next scheduled time
      const schedule = await prisma.jobSchedule.findUnique({ where: { jobKey } });
      const nextRunAt = schedule?.enabled ? computeNextRun(schedule.cronExpr) : null;

      await prisma.jobSchedule.update({
        where: { jobKey },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: status,
          lastRunResult: result,
          nextRunAt,
        },
      });
    }

    if (status === 'error') throw new Error((result as any).error);
    return result;
  }

  // Dispatches to the correct underlying service method
  private async dispatch(jobKey: JobKey): Promise<Record<string, unknown>> {
    const graphClient = await createGraphClient();

    switch (jobKey) {
      case 'sync-staff': {
        const groupId = process.env.ENTRA_ALL_STAFF_GROUP_ID;
        if (!groupId) throw new Error('ENTRA_ALL_STAFF_GROUP_ID not configured');
        const svc = new UserSyncService(prisma, graphClient);
        return await svc.syncGroupUsers(groupId) as unknown as Record<string, unknown>;
      }
      case 'sync-students': {
        const groupId = process.env.ENTRA_ALL_STUDENTS_GROUP_ID;
        if (!groupId) throw new Error('ENTRA_ALL_STUDENTS_GROUP_ID not configured');
        const svc = new UserSyncService(prisma, graphClient);
        return await svc.syncGroupUsers(groupId) as unknown as Record<string, unknown>;
      }
      case 'sync-locations': {
        const svc = new LocationSyncService(prisma, graphClient);
        return await svc.syncLocations() as unknown as Record<string, unknown>;
      }
      case 'sync-supervisors': {
        const svc = new LocationSyncService(prisma, graphClient);
        return await svc.syncSupervisorAssignments() as unknown as Record<string, unknown>;
      }
    }
  }

  // Public: list all schedules (enriched with isCurrentlyRunning)
  async getSchedules(): Promise<Array<Record<string, unknown>>> {
    const schedules = await prisma.jobSchedule.findMany({
      orderBy: { jobKey: 'asc' },
    });
    return schedules.map(s => ({
      ...s,
      isRunning: this.isRunning.get(s.jobKey as JobKey) ?? false,
    }));
  }

  stop(): void {
    this.jobs.forEach((task, key) => {
      task.stop(); task.destroy();
      loggers.cron.debug('Cron task stopped', { jobKey: key });
    });
    this.jobs.clear();
  }
}

// Helper exported for use in seeder / routes
export function computeNextRun(cronExpr: string): Date {
  return parseExpression(cronExpr, { tz: process.env.TZ || 'America/Chicago' })
    .next()
    .toDate();
}

async function createGraphClient(): Promise<Client> {
  const authResult = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return Client.init({
    authProvider: (done) => done(null, authResult?.accessToken ?? ''),
  });
}

export const schedulerService = new SchedulerService();
```

### 4.2 Cron Expression Validation (Zod Schema)

**File:** add to `backend/src/routes/admin.routes.ts` (or a shared `validation.ts`):

```typescript
import { z } from 'zod';
import { parseExpression } from 'cron-parser';

const cronExprSchema = z.string()
  .trim()
  .refine(
    expr => /^\S+ \S+ \S+ \S+ \S+$/.test(expr),
    { message: 'Cron expression must have exactly 5 fields (minute hour dom month dow)' }
  )
  .refine(
    expr => { try { parseExpression(expr); return true; } catch { return false; } },
    { message: 'Invalid cron expression' }
  )
  .refine(
    expr => {
      try {
        const iter = parseExpression(expr);
        const next = iter.next().toDate();
        const after = parseExpression(expr, { currentDate: next }).next().toDate();
        return (after.getTime() - next.getTime()) >= 5 * 60 * 1000;
      } catch { return false; }
    },
    { message: 'Schedule too frequent — minimum interval is 5 minutes' }
  );

const updateScheduleSchema = z.object({
  cronExpr: cronExprSchema,
  enabled: z.boolean(),
});
```

### 4.3 New API Endpoints

Add to `backend/src/routes/admin.routes.ts`:

#### `GET /api/admin/jobs/schedules`
Returns all 4 job schedules from DB, enriched with `isRunning` flag.

```typescript
router.get('/jobs/schedules', async (req: Request, res: Response) => {
  try {
    const schedules = await schedulerService.getSchedules();
    res.json({ schedules });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get job schedules', message: error.message });
  }
});
```

**Response shape:**
```json
{
  "schedules": [
    {
      "id": "clx...",
      "jobKey": "sync-staff",
      "cronExpr": "0 3 * * *",
      "enabled": false,
      "lastRunAt": null,
      "lastRunStatus": null,
      "lastRunResult": null,
      "nextRunAt": null,
      "updatedBy": null,
      "updatedAt": "2026-05-11T12:00:00.000Z",
      "createdAt": "2026-05-11T12:00:00.000Z",
      "isRunning": false
    },
    ...
  ]
}
```

#### `PUT /api/admin/jobs/schedules/:jobKey`
Update schedule expression and enabled state. Hot-swaps the running cron task.

```typescript
router.put('/jobs/schedules/:jobKey', async (req: AuthRequest, res: Response) => {
  const validJobKeys = ['sync-staff', 'sync-students', 'sync-locations', 'sync-supervisors'];
  const { jobKey } = req.params;

  if (!validJobKeys.includes(jobKey)) {
    return res.status(404).json({ error: 'Unknown job key' });
  }

  const parsed = updateScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
  }

  const { cronExpr, enabled } = parsed.data;

  try {
    await schedulerService.updateSchedule(
      jobKey as JobKey,
      cronExpr,
      enabled,
      req.user!.id
    );
    const schedules = await schedulerService.getSchedules();
    const updated = schedules.find(s => s.jobKey === jobKey);
    res.json({ success: true, schedule: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update schedule', message: error.message });
  }
});
```

#### `POST /api/admin/jobs/:jobKey/run`
Manual run trigger. Rate-limited (existing `jobLimiter`). Replaces job-specific endpoints.

```typescript
router.post('/jobs/:jobKey/run', jobLimiter, async (req: AuthRequest, res: Response) => {
  const validJobKeys = ['sync-staff', 'sync-students', 'sync-locations', 'sync-supervisors'];
  const { jobKey } = req.params;

  if (!validJobKeys.includes(jobKey)) {
    return res.status(404).json({ error: 'Unknown job key' });
  }

  loggers.admin.info('Manual job run triggered', {
    jobKey,
    triggeredBy: req.user?.email,
    userId: req.user?.id,
  });

  try {
    const result = await schedulerService.runJobNow(jobKey as JobKey);
    res.json({ success: true, message: `Job "${jobKey}" completed`, detail: result });
  } catch (error: any) {
    if (error.message.includes('already running')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: `Job "${jobKey}" failed`, message: error.message });
  }
});
```

### 4.4 `server.ts` Change

Replace:
```typescript
cronJobsService.start();
```
With:
```typescript
schedulerService.start().catch(err => {
  loggers.cron.error('SchedulerService startup failed', { error: err });
});
```

Import `schedulerService` from `./services/scheduler.service` and remove the `cronJobsService` import.

### 4.5 Backward Compatibility Decision

**Recommendation: Keep old endpoints, add deprecation note in comments.**

| Old Endpoint | New Endpoint | Decision |
|-------------|-------------|----------|
| `POST /api/admin/jobs/sync-locations` | `POST /api/admin/jobs/sync-locations/run` (alias) | **Keep old** — but now delegate to `schedulerService.runJobNow('sync-locations')` internally |
| `POST /api/admin/jobs/sync-supervisors` | `POST /api/admin/jobs/sync-supervisors/run` | **Keep old** — delegate to `schedulerService.runJobNow('sync-supervisors')` |
| `POST /api/admin/sync-supervisors/trigger` | N/A | **Keep old** (fire-and-forget for external callers) — also delegates to schedulerService |
| `GET /api/admin/cron-jobs/status` | `GET /api/admin/jobs/schedules` | **Keep old stub** — now calls `schedulerService.getSchedules()` |

This way the new frontend can use the cleaner `/jobs/:jobKey/run` pattern while nothing breaks.

### 4.6 Package Installation

```bash
# Backend
npm install cron-parser
npm install --save-dev @types/cron-parser  # if types not bundled

# Frontend
npm install cronstrue
```

Check `cron-parser` v4+ — types are bundled (`"types"` field in its package.json), so `@types/cron-parser` may not be needed.

---

## 5. Frontend Architecture Specification

### 5.1 New Query Key

Add to `frontend/src/lib/queryKeys.ts`:
```typescript
admin: {
  all: ['admin'] as const,
  syncStatus: () => [...queryKeys.admin.all, 'syncStatus'] as const,
  jobStatus: () => [...queryKeys.admin.all, 'jobStatus'] as const,
  jobSchedules: () => [...queryKeys.admin.all, 'jobSchedules'] as const,  // NEW
},
```

### 5.2 New Types in `adminService.ts`

```typescript
export interface JobSchedule {
  id: string;
  jobKey: string;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'error' | 'skipped' | null;
  lastRunResult: Record<string, unknown> | null;
  nextRunAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
  isRunning: boolean;
}

export interface UpdateSchedulePayload {
  cronExpr: string;
  enabled: boolean;
}
```

### 5.3 New Service Methods in `adminService.ts`

```typescript
// Get all job schedules
getJobSchedules: async (): Promise<{ schedules: JobSchedule[] }> => {
  const response = await api.get('/admin/jobs/schedules');
  return response.data;
},

// Update a job schedule
updateJobSchedule: async (jobKey: string, payload: UpdateSchedulePayload): Promise<{ success: boolean; schedule: JobSchedule }> => {
  const response = await api.put(`/admin/jobs/schedules/${jobKey}`, payload);
  return response.data;
},

// Run a job manually (new unified endpoint)
runJobNow: async (jobKey: string): Promise<JobResult> => {
  const response = await api.post(`/admin/jobs/${jobKey}/run`);
  return response.data;
},
```

### 5.4 New Hooks

#### `frontend/src/hooks/queries/useJobSchedules.ts`
```typescript
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';

export function useJobSchedules() {
  return useQuery({
    queryKey: queryKeys.admin.jobSchedules(),
    queryFn: () => adminService.getJobSchedules(),
    staleTime: 30_000,
    select: data => data.schedules,
  });
}
```

#### `frontend/src/hooks/mutations/useScheduleMutations.ts`
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { queryKeys } from '@/lib/queryKeys';
import type { UpdateSchedulePayload } from '@/services/adminService';

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobKey, payload }: { jobKey: string; payload: UpdateSchedulePayload }) =>
      adminService.updateJobSchedule(jobKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
    },
  });
}

export function useRunJobNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobKey: string) => adminService.runJobNow(jobKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobSchedules() });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobStatus() });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    },
  });
}
```

### 5.5 Redesigned `AdminJobsPage.tsx`

The page is redesigned to show schedule controls alongside the manual run button. The existing `JobCard` component is extended to `ScheduledJobCard`.

#### 5.5.1 `ScheduledJobCard` Props

```typescript
interface ScheduledJobCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  warningText?: string;
  schedule: JobSchedule | undefined;        // from DB
  isSavingSchedule: boolean;
  isRunningNow: boolean;                    // mutation pending
  onRunNow: () => void;
  onSaveSchedule: (cronExpr: string, enabled: boolean) => void;
}
```

#### 5.5.2 Card Layout (per card)

Each card displays, stacked vertically:

1. **Header row**: icon + title
2. **Description**: `Typography variant="body2"`
3. **Warning** (if destructive): `Alert severity="warning"`
4. **Schedule section** (new):
   - `FormControlLabel` with `Switch` for enabled/disabled
   - `TextField` for cron expression (monospace font)
   - Human-readable preview below the field: `cronstrue.toString(cronExpr)` wrapped in try/catch
   - Validation error if expression is invalid
   - "Save Schedule" `Button` (disabled when `isSavingSchedule` or expression unchanged)
5. **Next / Last run row**:
   - `Next run: {formatTimestamp(schedule.nextRunAt)}` — shows "Not scheduled" if disabled or null
   - `Last run: {formatTimestamp(schedule.lastRunAt)} — {StatusChip}`
   - `StatusChip`: MUI `Chip` with `color="success"/"error"` based on `lastRunStatus`
   - If `lastRunResult` has fields, show a brief summary line (e.g., "5 locations synced, 0 errors")
6. **"Run Now" button** row: same as current, disabled if `isRunningNow || schedule?.isRunning`

#### 5.5.3 Client-Side Cron Validation

```typescript
import cronstrue from 'cronstrue';

function getCronDescription(expr: string): { ok: boolean; text: string } {
  try {
    const text = cronstrue.toString(expr, { use24HourTimeFormat: false });
    return { ok: true, text };
  } catch {
    return { ok: false, text: 'Invalid cron expression' };
  }
}
```

Show the description as helper text below the `TextField`. If `ok === false`, show `error` state on the field and disable "Save Schedule".

#### 5.5.4 Confirmation Dialogs

| Action | Confirmation required? | Notes |
|--------|----------------------|-------|
| Enable schedule | ✅ Yes | "Enabling this schedule will run '...' automatically {cronstrue description}. Continue?" |
| Disable schedule | ❌ No | Save immediately |
| Change cron expr (enabled) | ✅ Yes same as enable | Show new human-readable schedule in body |
| Change cron expr (disabled) | ❌ No | Save immediately (no effect until enabled) |
| "Run Now" | ✅ Yes (existing pattern) | Reuse existing `ConfirmDialog` component |

#### 5.5.5 `AdminJobsPage.tsx` State Shape

```typescript
// Local draft state for edits (before save)
const [drafts, setDrafts] = useState<Record<JobKey, { cronExpr: string; enabled: boolean } | undefined>>({});
// Pending confirm
const [confirmAction, setConfirmAction] = useState<
  | { type: 'runNow'; jobKey: JobKey }
  | { type: 'enableSchedule'; jobKey: JobKey; cronExpr: string; enabled: boolean }
  | null
>(null);
// Last in-session run results (for jobs run manually in this session)
const [sessionResults, setSessionResults] = useState<Record<JobKey, { result: string | null; error: string | null }>>(...);
```

#### 5.5.6 Job Metadata (display names, descriptions, etc.)

```typescript
const JOB_CONFIGS: Record<JobKey, { title: string; description: string; icon: ReactNode; warningText?: string }> = {
  'sync-staff': {
    title: 'Sync Staff Users',
    description: 'Synchronize all staff accounts from the Microsoft Entra All-Staff group.',
    icon: <PeopleIcon />,
  },
  'sync-students': {
    title: 'Sync Student Users',
    description: 'Synchronize all student accounts from the Microsoft Entra All-Students group.',
    icon: <SchoolIcon />,
  },
  'sync-locations': {
    title: 'Update Locations',
    description: 'Creates or verifies office location records from the canonical location mapping.',
    icon: <LocationOnIcon />,
  },
  'sync-supervisors': {
    title: 'Update Supervisors',
    description: 'Rebuilds all supervisor-location assignments from Entra group membership.',
    icon: <SupervisorAccountIcon />,
    warningText: 'Destructive: clears ALL existing supervisor assignments before rebuilding.',
  },
};
```

#### 5.5.7 Polling / Refresh Strategy

- React Query `refetchInterval`: set to `15_000` (15s) on `useJobSchedules()` so `isRunning` status auto-refreshes while a job is running
- When `isRunning` transitions from `true` → `false` on any schedule, `onSuccess` of `useRunJobNow` already invalidates the cache; the polling handles the scheduled-run case

---

## 6. Migration Strategy

### 6.1 Step-by-Step for Implementation Subagent

1. **Install backend package**: `npm install cron-parser` in `backend/`
2. **Run Prisma migration**: `npx prisma migrate dev --name add_job_schedules` in `backend/`
3. **Create `scheduler.service.ts`** as specified in §4.1
4. **Update `server.ts`**: replace `cronJobsService.start()` with `schedulerService.start()`
5. **Add new routes** to `admin.routes.ts`: `GET /jobs/schedules`, `PUT /jobs/schedules/:jobKey`, `POST /jobs/:jobKey/run`
6. **Refactor old manual-run endpoints** to delegate to `schedulerService.runJobNow()` (backward compat)
7. **Add seed data** in `prisma/seed.ts`
8. **Install frontend package**: `npm install cronstrue` in `frontend/`
9. **Add new query key** `jobSchedules` to `queryKeys.ts`
10. **Add new types + service methods** to `adminService.ts`
11. **Create `useJobSchedules.ts`** and **`useScheduleMutations.ts`** hooks
12. **Rewrite `AdminJobsPage.tsx`** with new `ScheduledJobCard` component (keep `ConfirmDialog` as-is)

### 6.2 `GET /api/admin/jobs/status` — What Changes

The existing endpoint currently derives last-run times from DB timestamps (e.g., `LocationSupervisor.assignedAt`). After the migration:
- Update this endpoint to also read from `JobSchedule` rows for `lastRunAt`/`lastRunStatus`
- Or deprecate it entirely in favor of `GET /api/admin/jobs/schedules` (which returns richer data)
- **Recommendation**: Deprecate `GET /jobs/status` once the frontend is on the new `schedules` endpoint. Keep it returning its current shape during transition so the existing `useJobStatus()` hook (used by current page) still works during the changeover.

### 6.3 `CronJobsService` Fate

The old `cronJobsService` can be removed. Its only remaining external consumer is `admin.routes.ts` (`GET /api/admin/cron-jobs/status`). After migration:
- Update `GET /api/admin/cron-jobs/status` to call `schedulerService.getSchedules()` instead
- Delete `backend/src/services/cronJobs.service.ts`

---

## 7. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Cron injection (malicious expression crashes server) | Try/catch in `parseExpression()` validation |
| DoS via hyper-frequent schedule (e.g., every minute) | Minimum 5-minute interval check (§2.5) |
| Unauthorized schedule changes | `requireAdmin` middleware on all `/api/admin/*` routes (already in place) |
| Concurrent parallel job runs | `isRunning` per-job flag; 409 response if already running |
| `jobKey` path parameter injection | Explicit allowlist of 4 valid keys; 404 on anything else |
| Stored XSS from `lastRunResult` JSON | Rendered via React (`{JSON.stringify(...)}` or mapped fields), not `dangerouslySetInnerHTML` |

---

## 8. Key Decisions for the Implementation Subagent

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Cron library | `node-cron@4.2.1` (existing) | Already installed; supports timezone; hot-swap via `.destroy()` |
| 2 | Next-run computation | `cron-parser` (new backend dep) | Most widely-used, accurate, same expressions as node-cron |
| 3 | Human-readable display | `cronstrue` (new frontend dep) | Industry standard, 75M weekly downloads, zero deps |
| 4 | DB model | New `JobSchedule` model | Required for persistence across restarts; prior spec avoided it but that was for manual-only context |
| 5 | Overlap prevention | In-process `isRunning` Map | Single-process app; sufficient. Document for future multi-replica migration |
| 6 | Backward compat | Keep old endpoints, delegate to schedulerService | Zero breaking changes for any external consumers |
| 7 | Default state | All 4 schedules disabled by default | Avoids unexpected automated runs in new environments |
| 8 | Schedule update UX | Separate "Save Schedule" button per card | Prevents accidental schedule changes; matches form-submission pattern in AdminSettings |
| 9 | Polling | 15s refetchInterval on `useJobSchedules` | Updates `isRunning` and `lastRunAt` without WebSockets complexity |
| 10 | `CronJobsService` migration | Delete after `schedulerService` is in place | Reduces duplication; schedulerService is a superset |
| 11 | Migration timestamp | `20260511120000_add_job_schedules` | Follows existing project convention |
| 12 | Seed strategy | `upsert` with empty `update: {}` for existing rows | Idempotent; never overwrites admin's live settings on re-seed |

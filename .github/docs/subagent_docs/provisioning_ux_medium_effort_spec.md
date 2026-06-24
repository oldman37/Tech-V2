# Spec: Provisioning Page Medium-Effort UX Improvements

**Date:** 2026-06-24  
**Files affected:** backend + frontend (details below)  
**New dependencies:** None  

---

## Items in Scope

| # | Item |
|---|------|
| 1 | Top-of-page status banner |
| 6 | Last run info on Schedule card |
| 12 | Disable batch history section |

---

## Current State Analysis

### Item #1 / #6 — No Last-Run Data Exposed

The cron service (`cronJobs.service.ts`) already tracks `lastRunAt`, `lastRunDurationMs`, and `lastError` per job in its `jobState` map. When `runProvisioningSync()` completes, these are updated. However:

- The `JobState` interface does NOT store a run summary (created/updated/errors counts).
- No API endpoint exposes the provisioning job's in-memory state.
- The frontend has no query for last-run data; both the banner and the schedule card have to show static text.

### Item #12 — Batch History in DB, Not Exposed

The `provisioning_disable_batch` table stores all batches, including resolved ones (status `APPROVED` or `REJECTED`). The `GET /disable-batches` endpoint filters to `PENDING` only and returns nothing after a batch is resolved. No history endpoint exists.

---

## Proposed Solution Architecture

### Backend

**1. Extend `cronJobs.service.ts` — `JobState` + `runProvisioningSync`**

Add `lastRunSummary` to `JobState`:

```typescript
interface JobState {
  executing: boolean;
  lastRunAt: Date | null;
  lastRunDurationMs: number | null;
  lastError: string | null;
  lastRunSummary: {
    created: number;
    deprovisioned: number;
    reEnabled: number;
    updated: number;
    errors: number;
    testMode: boolean;
  } | null;
}
```

Default value for both entries in the initial map: `lastRunSummary: null`.

In `runProvisioningSync()`, after `const result = await runProvisioningJob(...)`, set:
```typescript
state.lastRunSummary = {
  created:       result.created.length,
  deprovisioned: result.deprovisioned.length,
  reEnabled:     result.reEnabled.length,
  updated:       result.updated,
  errors:        result.errors,
  testMode:      result.testMode,
};
```

Add public method:
```typescript
getProvisioningStatus(): {
  executing: boolean;
  lastRunAt: Date | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
  lastRunSummary: JobState['lastRunSummary'];
}
```

Implementation: returns the `provisioningSync` entry from `jobState`.

**2. New `GET /api/provisioning/status`**

Controller handler `getStatus` in `provisioning.controller.ts`:

```typescript
export const getStatus = async (_req: AuthRequest, res: Response): Promise<void> => {
  const [config, jobSchedule] = await Promise.all([
    prisma.provisioningConfig.findUnique({ where: { id: 'singleton' } }),
    prisma.jobSchedule.findUnique({ where: { jobKey: 'provisioning-sync' } }),
  ]);
  const cronStatus = cronJobsService.getProvisioningStatus();

  res.json({
    syncEnabled:       jobSchedule?.enabled ?? false,
    testMode:          config?.testMode ?? true,
    targetTenant:      config?.targetTenant ?? 'TEST',
    executing:         cronStatus.executing,
    lastRunAt:         cronStatus.lastRunAt?.toISOString() ?? null,
    lastRunDurationMs: cronStatus.lastRunDurationMs,
    lastRunError:      cronStatus.lastRunError,
    lastRunSummary:    cronStatus.lastRunSummary,
  });
};
```

Route: `router.get('/status', provisioning.getStatus);` — add before other routes (read-only, no CSRF).

**3. New `GET /api/provisioning/disable-batches/history`**

Controller handler `listDisableBatchHistory` in `provisioning.controller.ts`:

- Fetch the last 10 batches where `status != 'PENDING'`, ordered by `resolvedAt desc`.
- Return summary only (strip `pendingUsers`, add computed `accountCount`).

```typescript
export const listDisableBatchHistory = async (_req: AuthRequest, res: Response): Promise<void> => {
  const batches = await prisma.provisioningDisableBatch.findMany({
    where:   { status: { not: 'PENDING' } },
    orderBy: { resolvedAt: 'desc' },
    take:    10,
  });
  const result = batches.map(({ pendingUsers, ...rest }) => ({
    ...rest,
    accountCount: (pendingUsers as unknown[]).length,
  }));
  res.json(result);
};
```

Route: `router.get('/disable-batches/history', provisioning.listDisableBatchHistory);`
— Register **before** `router.post('/disable-batches/:id/approve', ...)` to avoid ambiguity (though methods differ, ordering is safer).

### Frontend

**`provisioningService.ts` — new types and methods**

```typescript
export interface ProvisioningStatus {
  syncEnabled: boolean;
  testMode: boolean;
  targetTenant: 'PRODUCTION' | 'TEST';
  executing: boolean;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
  lastRunSummary: {
    created: number;
    deprovisioned: number;
    reEnabled: number;
    updated: number;
    errors: number;
    testMode: boolean;
  } | null;
}

export interface DisableBatchHistoryItem {
  id: string;
  userType: string;
  triggeredBy: string;
  testMode: boolean;
  status: string;           // 'APPROVED' | 'REJECTED'
  accountCount: number;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}
```

Add to `provisioningService`:
```typescript
getStatus: async (): Promise<ProvisioningStatus> => {
  const res = await api.get<ProvisioningStatus>('/provisioning/status');
  return res.data;
},

getDisableBatchHistory: async (): Promise<DisableBatchHistoryItem[]> => {
  const res = await api.get<DisableBatchHistoryItem[]>('/provisioning/disable-batches/history');
  return res.data;
},
```

**`queryKeys.ts` — two new keys**

Inside `provisioning`:
```typescript
status: () => [...queryKeys.provisioning.all, 'status'] as const,
disableBatchHistory: () => [...queryKeys.provisioning.all, 'disable-batch-history'] as const,
```

**`ProvisioningPage.tsx` — three changes**

**A. New `StatusBanner` component (Item #1)**

Rendered above `TenantSwitcherCard`, replacing the current subtitle paragraph (or directly below the `<h1>`).

Queries `queryKeys.provisioning.status()` with `refetchInterval: 60_000`.

Layout: a single `Box` with a `Stack direction="row"` of chips and typography. Not a Card — compact, single line.

Status chips:
- `<Chip label={syncEnabled ? 'Sync Enabled' : 'Sync Disabled'} color={syncEnabled ? 'success' : 'default'} />`
- `<Chip label={testMode ? 'Test Mode' : 'Live Mode'} color={testMode ? 'primary' : 'error'} />`
- `<Chip label={targetTenant === 'TEST' ? 'Test Tenant' : 'Production Tenant'} color={targetTenant === 'TEST' ? 'warning' : 'error'} />`
- Last run summary: `<Typography variant="caption">Last run: {timeAgo(lastRunAt)} · {summary}</Typography>` where summary is `"X created · Y errors"` or `"Never"` if no run yet.

If `lastRunError`, show the caption in `error` color with `"FAILED"` prefix.

Helper function `timeAgo(iso: string | null): string`:
```typescript
function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
```

Loading state: 3 `<Skeleton>` chips in a row.

**B. Update `ScheduleEditorCard` (Item #6)**

Also queries `queryKeys.provisioning.status()` (same cache — no extra fetch).

Below the existing "Next scheduled run" caption, add:
```tsx
{status?.lastRunAt && (
  <Typography variant="caption" color={status.lastRunError ? 'error.main' : 'text.secondary'}>
    Last run: {timeAgo(status.lastRunAt)}
    {status.lastRunDurationMs && ` · ${formatDuration(status.lastRunDurationMs)}`}
    {status.lastRunSummary && !status.lastRunError && (
      ` · ${status.lastRunSummary.created} created · ${status.lastRunSummary.errors} errors`
    )}
    {status.lastRunError && ` · FAILED — ${status.lastRunError}`}
  </Typography>
)}
```

**C. New `DisableBatchHistorySection` component (Item #12)**

Rendered in `ProvisioningPage` after `<PendingDisablesCard />`.

Queries `queryKeys.provisioning.disableBatchHistory()` with `staleTime: 60_000`.

Hidden when: loading returns 0 items.

Structure: a `Card variant="outlined"` with a togglable `Collapse` (collapsed by default). The card header shows "Batch History" + item count chip, plus a chevron toggle button. When expanded, shows a `Table size="small"` with columns: Date · Type · Accounts · Triggered by · Resolved by · Outcome.

Outcome chip: `APPROVED` → `<Chip color="success" label="Approved" />`, `REJECTED` → `<Chip color="default" label="Rejected" />`.

No pagination needed (max 10 rows from backend).

After `approveMutation` or `rejectMutation` succeeds in `PendingDisablesCard`, also invalidate `queryKeys.provisioning.disableBatchHistory()`.

---

## Implementation Steps

1. **`backend/src/services/cronJobs.service.ts`**
   - Add `lastRunSummary` to `JobState` interface (default `null`)
   - Populate in `runProvisioningSync()` after `runProvisioningJob` resolves
   - Add `getProvisioningStatus()` method

2. **`backend/src/controllers/provisioning.controller.ts`**
   - Import `cronJobsService`
   - Add `getStatus` handler
   - Add `listDisableBatchHistory` handler

3. **`backend/src/routes/provisioning.routes.ts`**
   - Add `GET /status` before existing routes
   - Add `GET /disable-batches/history` before `/:id/approve` and `/:id/reject`

4. **`frontend/src/services/provisioningService.ts`**
   - Add `ProvisioningStatus` and `DisableBatchHistoryItem` interfaces
   - Add `getStatus` and `getDisableBatchHistory` methods

5. **`frontend/src/lib/queryKeys.ts`**
   - Add `status()` and `disableBatchHistory()` to `provisioning` key group

6. **`frontend/src/pages/admin/ProvisioningPage.tsx`**
   - Add `timeAgo()` helper
   - Add `StatusBanner` component
   - Update `ScheduleEditorCard` to use status query
   - Add `DisableBatchHistorySection` component
   - Update `PendingDisablesCard` to invalidate history on approve/reject success
   - Mount `StatusBanner` at top of page, `DisableBatchHistorySection` after pending card

---

## No Schema Changes Required

The `provisioningDisableBatch` table already stores resolved batches with `status`, `resolvedAt`, `resolvedBy`. No migration needed.

---

## Build Commands

- `docker compose -f docker-compose.dev.yml build backend` — validates shared tsc + backend tsc
- `docker compose -f docker-compose.dev.yml build frontend` — validates frontend tsc + vite build

## Success Criteria

- Both Docker image builds exit 0
- Status banner appears with correct colors for test/live/tenant state
- Schedule card shows last run info when a run has occurred (null state: no last run line shown)
- Batch history section appears (collapsed by default) when resolved batches exist, hidden when table is empty
- History updates after approving or rejecting a batch

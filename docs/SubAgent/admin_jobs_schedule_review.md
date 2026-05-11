# Admin Jobs — Scheduled Schedule Feature: Review Report

**Document type:** Review (Phase 2 output)  
**Date:** 2026-05-11  
**Reviewer:** Review Subagent  
**Spec reference:** `docs/SubAgent/admin_jobs_schedule_spec.md`  
**Status:** ⚠️ **NEEDS_REFINEMENT**

---

## 1. Overall Assessment

**NEEDS_REFINEMENT**

The implementation is architecturally sound and covers the vast majority of the spec correctly. Both builds pass cleanly. However, **2 critical issues** require fixes before this ships: a missing rate-limiter on the PUT endpoint and a server-crash risk on startup if the DB ever contains an invalid cron expression.

---

## 2. Build Results

### Backend (`c:\Tech-V2\backend`)

```
> tsc && node -e "require('fs').mkdirSync(...)"
```

**Result: ✅ CLEAN — 0 errors, 0 warnings**

### Frontend (`c:\Tech-V2\frontend`)

```
> tsc && vite build
✔ 12067 modules transformed.
dist/assets/index-vClSEAk2.js   1,287.26 kB │ gzip: 351.22 kB
✔ built in 2.26s
```

**Result: ✅ CLEAN — 0 TypeScript errors, 0 build errors**

Pre-existing Vite 8 deprecation warnings noted (unrelated to this feature):
- `esbuild` option deprecated — use `oxc` instead (vite-react-babel plugin)
- `optimizeDeps.esbuildOptions` deprecated — use `optimizeDeps.rolldownOptions`
- Chunk size warning (>500 kB) — pre-existing, unrelated

---

## 3. Critical Issues

### CRITICAL-1 — Missing Rate Limiter on `PUT /jobs/schedules/:jobKey`

**File:** `backend/src/routes/admin.routes.ts`, line 429  
**Spec requirement:** § Security: "Rate limiting on PUT and POST job endpoints"

The `jobLimiter` (5 req / 5 min / user) is correctly applied to:
- `POST /jobs/sync-locations` ✅
- `POST /jobs/sync-supervisors` ✅
- `POST /jobs/:jobKey/run` ✅

It is **not** applied to `PUT /jobs/schedules/:jobKey`:

```typescript
// CURRENT — no limiter
router.put('/jobs/schedules/:jobKey', async (req: AuthRequest, res: Response) => {

// REQUIRED
router.put('/jobs/schedules/:jobKey', jobLimiter, async (req: AuthRequest, res: Response) => {
```

**Risk:** An authenticated admin could hammer the PUT endpoint at high frequency, triggering rapid cron task hot-swaps, DB writes, and `computeNextRun()` calls (cron-parser invocations). With no limit this becomes a self-DoS vector; also any XSS-elevated attacker could abuse it.

**Fix:** Add `jobLimiter` as second argument on line 429.

---

### CRITICAL-2 — `start()` Will Crash Server on Invalid `cronExpr` in DB

**File:** `backend/src/services/scheduler.service.ts`, lines 57-70  
**Spec requirement:** § 6 Edge Cases: "What if `cronExpr` in DB is somehow invalid on startup? (should log error and skip, not crash)"

`registerTask()` passes the expression directly to `cron.schedule()`. If the DB ever contains a malformed expression (manual DB edit, broken migration, etc.) the call throws and propagates uncaught through `start()`, crashing the server process at boot.

```typescript
// CURRENT — will throw and crash
for (const schedule of schedules) {
  if (schedule.enabled) {
    this.registerTask(schedule.jobKey as JobKey, schedule.cronExpr);
  }
}

// REQUIRED — log and skip
for (const schedule of schedules) {
  if (schedule.enabled) {
    try {
      this.registerTask(schedule.jobKey as JobKey, schedule.cronExpr);
    } catch (err) {
      loggers.scheduler.error('Invalid cronExpr in DB — skipping job registration', {
        jobKey: schedule.jobKey,
        cronExpr: schedule.cronExpr,
        error: err,
      });
    }
  }
}
```

---

## 4. Recommended Findings

### REC-1 — `updateSchedule` Uses `update` Instead of `upsert` (P2025 Risk)

**File:** `backend/src/services/scheduler.service.ts`, line 111  
**Spec requirement:** § 6 Edge Cases: "`runJobNow` and `updateSchedule` should handle missing rows gracefully"

`prisma.jobSchedule.update({ where: { jobKey } })` throws Prisma error `P2025 Record to update not found` if the seed has not been run or if a row was manually deleted. A `upsert` would insert a sane default instead of crashing:

```typescript
await prisma.jobSchedule.upsert({
  where: { jobKey },
  update: { cronExpr, enabled, nextRunAt, updatedBy: userId },
  create: { jobKey, cronExpr, enabled, nextRunAt, updatedBy: userId },
});
```

---

### REC-2 — `executeJob` `finally` Block: Unhandled P2025 Masks Error and Result

**File:** `backend/src/services/scheduler.service.ts`, lines 166–182

The `finally` block calls `prisma.jobSchedule.update({ where: { jobKey } })`. If this throws (e.g., P2025 for a missing row), the exception escapes the `finally` block and propagates to the caller, **replacing** the original job error with a Prisma DB error. The caller receives a misleading error message.

Additionally, `isRunning.set(jobKey, false)` is correctly set **before** the async DB calls, so the mutex resets fine — but the DB write failure would surface as an unhandled `500` on the `POST /jobs/:jobKey/run` response.

```typescript
// RECOMMENDED — wrap the entire DB write in its own try/catch
} finally {
  this.isRunning.set(jobKey, false);
  try {
    const schedule = await prisma.jobSchedule.findUnique({ where: { jobKey } });
    const nextRunAt = schedule?.enabled ? computeNextRun(schedule.cronExpr) : null;
    await prisma.jobSchedule.update({
      where: { jobKey },
      data: { lastRunAt: new Date(), lastRunStatus: status, lastRunResult: result as Prisma.InputJsonValue, nextRunAt },
    });
  } catch (dbErr) {
    loggers.scheduler.error('Failed to persist job run result to DB', { jobKey, error: dbErr });
  }
}
```

---

### REC-3 — `cronJobsService` Still Running Alongside `SchedulerService` (Dual Supervisor Sync)

**File:** `backend/src/server.ts`, lines 171–176  
**Spec requirement:** § 4.4: "Replace `cronJobsService.start()` with `schedulerService.start()`"

Both services are started on boot:

```typescript
cronJobsService.start();             // legacy — runs supervisorSync at 2 AM (or SUPERVISOR_SYNC_SCHEDULE)
schedulerService.start().catch(…);  // new — runs sync-supervisors per DB schedule if enabled
```

`cronJobsService` schedules its own hard-coded supervisor sync with no awareness of the new `schedulerService`. If an admin enables `sync-supervisors` in the new UI with a similar time, **both services will fire the same job concurrently**, bypassing `schedulerService.isRunning` (since `cronJobsService` has its own execution path). The spec explicitly recommends removing the `cronJobsService.start()` call.

**Fix:** Comment out `cronJobsService.start()` in `server.ts` (keep the import and `stop()` calls for now if the old `GET /cron-jobs/status` endpoint still uses it).

---

### REC-4 — No Loading Skeleton on Initial Schedule Fetch

**File:** `frontend/src/pages/admin/AdminJobsPage.tsx`  
**Spec requirement:** § 5.5: "Loading skeleton shown while initial fetch"

`useJobSchedules()` returns `{ data: schedules }` where `schedules` is `undefined` during the initial load. The page renders all four `ScheduledJobCard` components immediately with default values (`cronExpr: '0 3 * * *'`, `enabled: false`). This can mislead an admin into thinking schedules are disabled before real data has arrived.

The spec calls for a `Skeleton` component (MUI) while `schedules === undefined`. A minimal fix:

```tsx
const { data: schedules, isLoading: isSchedulesLoading } = useJobSchedules();

// In the return:
if (isSchedulesLoading) {
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 1 }} />
      <Grid container spacing={3}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={320} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
```

---

## 5. Optional Findings

### OPT-1 — Unused `scheduleJobKey` Prop in `ScheduledJobCardProps`

**File:** `frontend/src/pages/admin/AdminJobsPage.tsx`, lines 110–127

`scheduleJobKey` is declared in the `ScheduledJobCardProps` interface and passed by the parent, but is **never used inside `ScheduledJobCard`**. It leaks implementation detail into the card props without purpose. Remove from both the interface and all call sites, or remove from the interface and only keep it in the parent scope.

---

### OPT-2 — Frontend Vite 8 `esbuild` Deprecation Warnings

Pre-existing, not introduced by this feature. The `vite-react-babel` plugin emits two deprecation warnings. The plugin should eventually be updated or replaced (`@vitejs/plugin-react` without Babel), but this is out of scope for this feature.

---

## 6. Passing Checks

| Check | Result |
|---|---|
| All admin routes have `authenticate` + `requireAdmin` middleware | ✅ Pass — `router.use(authenticate); router.use(requireAdmin)` |
| Rate limiting on POST job endpoints | ✅ Pass — `jobLimiter` applied to all POST run/sync routes |
| Cron expression validated server-side (field count, cron-parser, node-cron.validate, 5-min interval) | ✅ Pass — 4-step Zod validation schema |
| No `console.log` in scheduler.service.ts | ✅ Pass — all logging via `loggers.scheduler.*` |
| Overlap prevention (`isRunning` flag) | ✅ Pass — per-job Map, 409 on conflict |
| `updatedBy` audit trail on schedule updates | ✅ Pass — `userId` passed to `updateSchedule` and stored |
| No tokens in `localStorage` on frontend | ✅ Pass — HttpOnly cookies + header CSRF |
| Admin route guard on `/admin/jobs` | ✅ Pass — `<ProtectedRoute requireAdmin>` |
| `schedulerService.start()` called on server startup | ✅ Pass — `server.ts` line 175 |
| Enabled schedules loaded and registered on startup | ✅ Pass — `start()` iterates all enabled rows |
| `cancelTask()` destroys task before re-registering | ✅ Pass — `existing.stop(); existing.destroy()` |
| `isRunning` prevents overlapping executions | ✅ Pass — checked at top of `executeJob` |
| DB updated after each run (lastRunAt, lastRunStatus, lastRunResult, nextRunAt) | ✅ Pass — all 4 fields written in `finally` block |
| `computeNextRun()` uses cron-parser v5 API (`CronExpressionParser.parse()`) | ✅ Pass — used in scheduler.service.ts and seed.ts |
| Each card: cron input, cronstrue preview, enabled toggle, next/last run, save + run now | ✅ Pass |
| 15s polling via `refetchInterval` | ✅ Pass — `refetchInterval: 15_000` |
| "Save Schedule" disabled when no changes or invalid cron | ✅ Pass — `canSave = isDirty && cronDesc.ok` |
| Confirmation dialog before Run Now | ✅ Pass — `ConfirmDialog` component |
| Extra destructive warning for sync-supervisors | ✅ Pass — `warningText` prop + `Alert severity="warning"` |
| Result alert after manual run | ✅ Pass — `Collapse` with success/error `Alert` |
| No `any` types (except properly cast) | ✅ Pass — `err: unknown` throughout |
| TanStack Query v5 syntax | ✅ Pass |
| MUI Grid v2 `size` prop | ✅ Pass — `<Grid size={{ xs: 12, md: 6 }}>` |
| Frontend handles undefined schedule gracefully | ✅ Pass — defaults to `'0 3 * * *'` / disabled |
| Prisma model `JobSchedule` matches spec | ✅ Pass — all fields present, `cuid()` PK, `@@map("job_schedules")` |
| Seed uses upsert (idempotent) with `update: {}` | ✅ Pass |
| Both builds clean | ✅ Pass |

---

## 7. Summary Score Table

| Category | Score | Notes |
|---|---|---|
| Security | 4 / 5 | Missing rate limit on PUT endpoint (CRITICAL-1) |
| Build Validation | 5 / 5 | Both builds clean; warnings are pre-existing |
| Scheduler Correctness | 3 / 5 | Startup crash risk (CRITICAL-2), executeJob finally bug (REC-2), dual-service overlap (REC-3) |
| Frontend UX | 4 / 5 | Missing loading skeleton (REC-4) |
| Code Quality | 5 / 5 | Clean types; TanStack v5; Grid v2 |
| Edge Cases | 2 / 3 | Startup invalid cron crashes; updateSchedule P2025 risk; frontend undefined-schedule OK |

**Overall Grade: C+ / B-**  
**Verdict: ⚠️ NEEDS_REFINEMENT — 2 CRITICAL issues must be resolved before merge**

---

## 8. Required Fixes Summary

| # | Severity | File | Line | Fix |
|---|---|---|---|---|
| CRITICAL-1 | CRITICAL | `admin.routes.ts` | 429 | Add `jobLimiter` to `router.put('/jobs/schedules/:jobKey', ...)` |
| CRITICAL-2 | CRITICAL | `scheduler.service.ts` | 61–67 | Wrap `registerTask()` call in `start()` loop with try/catch → log and skip |
| REC-1 | RECOMMENDED | `scheduler.service.ts` | ~111 | Change `prisma.jobSchedule.update` to `upsert` in `updateSchedule` |
| REC-2 | RECOMMENDED | `scheduler.service.ts` | ~168 | Wrap `finally` block DB writes in try/catch; log failure without re-throwing |
| REC-3 | RECOMMENDED | `server.ts` | ~171 | Remove or comment out `cronJobsService.start()` to prevent dual supervisor sync |
| REC-4 | RECOMMENDED | `AdminJobsPage.tsx` | ~415 | Add MUI `Skeleton` grid while `isSchedulesLoading` is true |
| OPT-1 | OPTIONAL | `AdminJobsPage.tsx` | ~110 | Remove unused `scheduleJobKey` from `ScheduledJobCardProps` |

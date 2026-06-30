# Spec: Split Provisioning Schedule (Staff vs Student)

**Phase:** 1 — Research & Specification
**Feature:** provisioning_split_schedule

---

## Current State

`scheduler.service.ts` defines one provisioning job key:

- `provisioning-sync` — always calls `runProvisioningJob('ALL', 'cron', ...)`, processes both
  staff and student in a single run. Its cron schedule is managed from the ProvisioningPage config
  UI (`syncSchedule` / `syncEnabled` fields in `provisioningConfig`).

`AdminJobsPage.tsx` shows 5 schedule cards: sync-staff, sync-students, sync-locations,
sync-supervisors, provisioning-audit-cleanup. The `provisioning-sync` (ALL) card is intentionally
absent — it is surfaced on the ProvisioningPage instead.

No mechanism exists to run staff-only or student-only provisioning on independent cron schedules.

---

## Problem

Staff and student SIS data change at different rates. Running both in the same cron window is
wasteful when only one type has new data, and prevents finer control over timing.

---

## Proposed Solution

Add two new job keys — `provisioning-sync-staff` and `provisioning-sync-students` — to the
scheduler backend. Surface them as ScheduledJobCard instances on AdminJobsPage alongside the
existing schedule cards.

The existing `provisioning-sync` (ALL) remains untouched. Users can disable it via ProvisioningPage
and enable the split jobs independently.

No DB migration is needed: the `job_schedules` table stores arbitrary `jobKey` strings; new keys
are registered automatically on first `updateSchedule` call.

---

## Implementation Steps

### Step 1 — `backend/src/services/scheduler.service.ts`

1. Add `'provisioning-sync-staff'` and `'provisioning-sync-students'` to the `JobKey` union type.
2. Add both to `VALID_JOB_KEYS` array.
3. Add DEFAULT_CRON entries (both `'0 3 * * *'` — daily 3 AM, disabled by default).
4. Add two dispatch cases that mirror the existing `'provisioning-sync'` case but pass `'STAFF'`
   and `'STUDENT'` respectively:

```ts
case 'provisioning-sync-staff': {
  const cfg = await prisma.provisioningConfig.findUnique({ where: { id: 'singleton' } });
  const reportEmails = cfg?.reportEmails
    ? (cfg.reportEmails as string).split(',').map((r: string) => r.trim()).filter(Boolean)
    : undefined;
  const result = await runProvisioningJob('STAFF', 'cron', cfg?.testMode ?? true);
  await sendProvisioningReport(result, reportEmails);
  return {
    created:       result.created.length,
    deprovisioned: result.deprovisioned.length,
    reEnabled:     result.reEnabled.length,
    updated:       result.updated.length,
    errors:        result.errors,
    durationMs:    result.durationMs,
    testMode:      result.testMode,
  };
}
case 'provisioning-sync-students': {
  const cfg = await prisma.provisioningConfig.findUnique({ where: { id: 'singleton' } });
  const reportEmails = cfg?.reportEmails
    ? (cfg.reportEmails as string).split(',').map((r: string) => r.trim()).filter(Boolean)
    : undefined;
  const result = await runProvisioningJob('STUDENT', 'cron', cfg?.testMode ?? true);
  await sendProvisioningReport(result, reportEmails);
  return {
    created:       result.created.length,
    deprovisioned: result.deprovisioned.length,
    reEnabled:     result.reEnabled.length,
    updated:       result.updated.length,
    errors:        result.errors,
    durationMs:    result.durationMs,
    testMode:      result.testMode,
  };
}
```

### Step 2 — `frontend/src/pages/admin/AdminJobsPage.tsx`

1. Add `'provisioningStaff'` and `'provisioningStudents'` to the `JobKey` type.
2. Add `'provisioning-sync-staff'` and `'provisioning-sync-students'` to the `ScheduleJobKey` type.
3. Add initial entries for both keys in `cardState`.
4. Import `ManageAccountsIcon` and `GroupsIcon` from `@mui/icons-material`.
5. Add `confirmConfig` entries for both new jobs.
6. Add two `ScheduledJobCard` JSX blocks inside the Grid, each using `handleRunNow` and
   `handleSaveSchedule` with the new keys. Place them in a new section below the existing cards,
   under a "User Provisioning" divider/label so they are visually distinct from the Entra sync jobs.
7. Add the two new job keys to `handleConfirm`'s switch statement (using `handleRunNow`).

---

## What Is NOT Changing

- `provisioning-sync` (ALL) in scheduler — untouched
- ProvisioningPage config section (`syncSchedule` / `syncEnabled`) — untouched
- All provisioning service logic — untouched
- No DB migration, no schema change, no new API routes

---

## Risks

- Running `provisioning-sync-staff` and `provisioning-sync-students` simultaneously is safe — they
  operate on different UPN domains and write independent audit rows. The per-key `isRunning` guard
  only blocks the same key from overlapping itself.
- Running a split job concurrently with `provisioning-sync` (ALL) could cause duplicate work but not
  data corruption — Pass 1/2/3 logic is idempotent. User should disable the ALL schedule when using
  the split jobs.
- Both new jobs default to disabled, so no unintended runs occur after deploy.

---

## Build Commands

- Backend: `docker compose -f docker-compose.dev.yml build backend`
- Frontend: `docker compose -f docker-compose.dev.yml build frontend`
- Preflight: `scripts/preflight.ps1`

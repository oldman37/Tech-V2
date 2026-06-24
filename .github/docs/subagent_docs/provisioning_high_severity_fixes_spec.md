# Provisioning High-Severity Fixes — Phase 1 Spec

**Date:** 2026-06-24
**Findings addressed:** #1, #3, #10 (all HIGH from `provisioning_services_audit.md`)

---

## Findings Summary

| # | Finding | Root cause |
|---|---------|-----------|
| 1 | `/status` last-run data always null — banner/schedule card always show "Never" | `getStatus` reads from `cronJobsService` which is never started |
| 3 | `executing` flag can never be `true` | Same dead source as #1; live flag is private on `schedulerService` |
| 10 | Pass 1 never updates name fields or student grade | `givenName`/`surname`/`displayName`/`department` only set at create, never reconciled |

---

## Current State Analysis

### Finding #1 / #3 — Dead status source

`getStatus` (`provisioning.controller.ts:255-276`) builds all last-run fields from
`cronJobsService.getProvisioningStatus()`. That method reads in-memory state that is only
populated by `cronJobsService.runProvisioningSync()`, which is only called from
`cronJobsService.start()`. `cronJobsService.start()` is **never called** — `server.ts` starts
only `schedulerService` and the email worker.

The **real** last-run data already exists and is correct: `schedulerService.dispatch` writes
`lastRunAt`, `lastRunStatus`, and `lastRunResult` to the `job_schedules` row on every run
(`scheduler.service.ts:202-224`). `getStatus` already fetches that row (for `enabled`) and
ignores its run fields.

The `lastRunResult` JSON shape written by the provisioning-sync dispatch
(`scheduler.service.ts:284-298`) is:
```ts
{ created: number, deprovisioned: number, updated: number, errors: number, durationMs: number, testMode: boolean }
```
Note: `reEnabled` is missing from this shape — it needs to be added.

On error, `lastRunResult` = `{ error: string }` and `lastRunStatus` = `'error'`.

`executing` is stored in `schedulerService.isRunning` (a `Map<JobKey, boolean>`) which is
private. A public accessor needs to be added.

### Finding #10 — Name / grade reconciliation gap

`EntraUser` interface (`userProvision.service.ts:68-81`) and the Graph select query
(`userProvision.service.ts:225`) already fetch `givenName`, `surname`, `displayName`, and
`department` — no query changes required.

The UPDATE patch block (`userProvision.service.ts:534-572`) currently only checks:
- `accountEnabled` (re-enable)
- `officeLocation`
- `employeeType`
- `jobTitle` (staff only)

Missing from the patch for **both types**:
- `givenName` — compare against `sisRow.firstName`
- `surname` — compare against `sisRow.lastName`
- `displayName` — compare against `"${sisRow.firstName} ${sisRow.lastName}"` (matches create format at `:611-613`)

Missing from the patch for **students only**:
- `department` — compare against `"Grade ${row.grade}"`

**UPN is intentionally NOT reconciled.** The UPN is the sign-in identity and mail address;
regenerating it on a name change would break logins and mail routing. Keep existing UPN stable.

---

## Implementation Plan

### Step 1 — `scheduler.service.ts`: expose `isJobRunning` + add `reEnabled` to dispatch result

**Changes:**
1. Add public method `isJobRunning(jobKey: string): boolean` that reads `this.isRunning`.
2. In `dispatch` for `'provisioning-sync'`, add `reEnabled: result.reEnabled.length` to the
   returned object so the `JobSchedule.lastRunResult` JSON carries the full summary.

**Verify:** TypeScript compiles cleanly inside the Docker image build.

### Step 2 — `provisioning.controller.ts`: rewrite `getStatus` to use `JobSchedule` + `schedulerService`

**Changes:**
1. Replace `import { cronJobsService }` with `import { schedulerService }` (cronJobsService
   is only used in `getStatus` in this file; removing it cleans the import).
2. Rewrite the `getStatus` handler body:
   - `executing` ← `schedulerService.isJobRunning('provisioning-sync')`
   - `lastRunAt` ← `jobSchedule?.lastRunAt?.toISOString() ?? null`
   - `lastRunDurationMs` ← cast `lastRunResult?.durationMs` as number or null
   - `lastRunError` ← if `lastRunStatus === 'error'` then `lastRunResult?.error` else null
   - `lastRunSummary` ← if `lastRunStatus === 'success'` then map the result fields, else null
   - All other fields (`syncEnabled`, `testMode`, `targetTenant`) unchanged

**`lastRunSummary` shape** (matches existing `ProvisioningStatus` frontend type):
```ts
{
  created:       Number(lastRunResult['created'] ?? 0),
  deprovisioned: Number(lastRunResult['deprovisioned'] ?? 0),
  reEnabled:     Number(lastRunResult['reEnabled'] ?? 0),
  updated:       Number(lastRunResult['updated'] ?? 0),
  errors:        Number(lastRunResult['errors'] ?? 0),
  testMode:      Boolean(lastRunResult['testMode'] ?? true),
}
```

**Verify:** Status Banner and Schedule card now receive real data.

### Step 3 — `userProvision.service.ts`: add name + grade to Pass 1 UPDATE patch

**Location:** Inside the `updateTasks.push(async () => { ... })` block, after the existing
`employeeType` check and before the `if (type === 'STAFF')` jobTitle check.

**Changes to add:**
```ts
// Names — both staff and students
const expectedGivenName   = sisRow.firstName;
const expectedSurname     = sisRow.lastName;
const expectedDisplayName = `${sisRow.firstName} ${sisRow.lastName}`;

if (expectedGivenName   !== (entraUser.givenName   ?? '')) patch['givenName']   = expectedGivenName;
if (expectedSurname     !== (entraUser.surname      ?? '')) patch['surname']     = expectedSurname;
if (expectedDisplayName !== (entraUser.displayName  ?? '')) patch['displayName'] = expectedDisplayName;

// Grade — students only
if (type === 'STUDENT') {
  const sRow = sisRow as StudentRow;
  const expectedDepartment = `Grade ${sRow.grade}`;
  if (expectedDepartment !== (entraUser.department ?? '')) patch['department'] = expectedDepartment;
}
```

**Audit action string** — `wasDisabled` determines the action (`REENABLED` vs `UPDATED`).
Name/grade changes fall under `UPDATED` (or `DRY_RUN_UPDATE` in test mode). No new action
strings needed.

**Verify:** A student with a changed name or grade will now have those fields in the `patch`
object and receive a Graph PATCH call (or `DRY_RUN_UPDATE` audit in test mode).

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/scheduler.service.ts` | Add `isJobRunning()` public method; add `reEnabled` to provisioning-sync dispatch result |
| `backend/src/controllers/provisioning.controller.ts` | Rewrite `getStatus`; swap `cronJobsService` import for `schedulerService` |
| `backend/src/services/userProvision.service.ts` | Add name + grade fields to Pass 1 UPDATE patch |

No schema changes. No new dependencies. No migration needed.

---

## Build Commands

- Backend: `docker compose -f docker-compose.dev.yml build backend`
- Frontend: `docker compose -f docker-compose.dev.yml build frontend`
- Preflight: `scripts/preflight.ps1`

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Name patch fires on every run for accounts where Entra givenName/surname is null | Compare `sisRow.firstName !== (entraUser.givenName ?? '')` — empty string default prevents spurious patches on non-null empty strings, but a Graph null for a known name will be corrected, which is correct behaviour |
| `displayName` format diverges from what was set at create | Both create and reconcile use `"${firstName} ${lastName}"` — consistent |
| `reEnabled` added to `lastRunResult` breaks existing consumers | `getSchedules()` returns this as opaque JSON; the Admin Jobs page reads `lastRunResult` but only for display — adding a field is additive and safe |
| `executing` briefly wrong if server restarts mid-run | `isRunning` map is reset on server start; `executing` will read false. Acceptable — same behaviour as before |

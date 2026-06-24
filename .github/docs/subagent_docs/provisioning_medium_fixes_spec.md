# Provisioning Medium-Severity Fixes — Phase 1 Spec

**Date:** 2026-06-24
**Findings addressed:** #2, #4, #11, #14, #15 (MEDIUM / LOW-MED from `provisioning_services_audit.md`)
**Prerequisite:** HIGH-severity fixes (#1, #3, #10) already merged.

---

## Findings Summary

| # | Severity | Finding |
|---|----------|---------|
| 2 | MEDIUM | Manual "Run Now" (POST `/provisioning/run`) never updates `JobSchedule`, so last-run UI ignores manual runs |
| 4 | MEDIUM | `cronJobsService.start()` never called — provisioning + supervisor cron registrations are dead; `PROVISIONING_SYNC_SCHEDULE` / `SUPERVISOR_SYNC_SCHEDULE` are misleading dead config; refresh-token cleanup also never runs |
| 11 | LOW-MED | Blank SIS `School` clears Entra `officeLocation` (data loss); unmapped school names pass through verbatim with no visibility |
| 14 | MEDIUM | `sendProvisioningReport` suppresses the email when `created/deprovisioned/reEnabled` are all zero — error-only and update-only runs send no notification |
| 15 | LOW-MED | `sendProvisioningDisableAlert` silently no-ops when no admin recipient configured — held batches can go un-notified |

---

## Current State Analysis

### #2 — Manual run doesn't update last-run UI

`runProvisioning` (`provisioning.controller.ts:20-48`) calls `runProvisioningJob(...)` directly and returns the response without touching `JobSchedule`. The `getStatus` endpoint (after the HIGH fix) reads `lastRunAt`/`lastRunStatus`/`lastRunResult` from the `JobSchedule` row, which `schedulerService.executeJob` writes on every *scheduled* run. A manual run from the Provisioning page ("Run Now" button) therefore never appears in the Status Banner or Schedule card last-run data.

The Admin Jobs page has a second manual-run path — `schedulerService.runJobNow('provisioning-sync')` — which routes through `executeJob` and *does* update `JobSchedule`. The two manual-run surfaces are inconsistent.

**Fix:** After `runProvisioningJob` succeeds, write a `success` outcome to the `JobSchedule` row (same fields `executeJob` writes: `lastRunAt`, `lastRunStatus`, `lastRunResult`, `nextRunAt`). Wrapped in try/catch — DB write failure must not fail the HTTP response.

`computeNextRun` is already exported from `scheduler.service.ts`; import it alongside the existing `schedulerService` import in the controller.

### #4 — Dead cron scheduling in cronJobsService

`cronJobsService.start()` is **never called** in `server.ts`. This makes three jobs dead:
- `scheduleProvisioningSync` — reads `PROVISIONING_SYNC_SCHEDULE` env var; duplicates what `schedulerService` already does for `provisioning-sync`
- `scheduleSupervisorSync` — reads `SUPERVISOR_SYNC_SCHEDULE` env var; duplicates `schedulerService`'s `sync-supervisors`
- **`scheduleRefreshTokenCleanup`** — hardcoded `0 3 * * *`; deletes expired/revoked refresh tokens. This job has **no counterpart in `schedulerService`** — it is genuinely needed but silently dead

`server.ts` calls `cronJobsService.stop()` on shutdown (iterates an empty `jobs` Map — harmless no-op but misleading).

**Fix plan:**
1. Strip `cronJobsService` down to only what is unique: `scheduleRefreshTokenCleanup`, `start()`, `stop()`
2. Remove: `scheduleSupervisorSync`, `runSupervisorSync`, `triggerSupervisorSync`, `scheduleProvisioningSync`, `runProvisioningSync`, `getProvisioningStatus`, `getStatus`, `getScheduleExpression`, `jobState` map entries for `supervisorSync`/`provisioningSync`
3. Remove now-unused imports: `msalClient`, `Client`, `LocationSyncService`, `runProvisioningJob`, `sendProvisioningReport`
4. Wire `cronJobsService.start()` into `server.ts` startup so the refresh-token cleanup actually runs
5. Remove dead env vars from `.env.example`: `PROVISIONING_SYNC_SCHEDULE` and `SUPERVISOR_SYNC_SCHEDULE`

**Note:** `getProvisioningStatus` was the function previously read by the controller. The HIGH fixes already removed `cronJobsService` from the controller import. After stripping, the controller reference is gone.

### #11 — Blank school clears officeLocation; unmapped school verbatim

`mapOfficeLocation` (from `userSync.service.ts:34-81`) returns:
- `null` for blank/null input (`if (!entraLocation) return null`, line 35)
- The mapped canonical name for known inputs
- **The raw input string** for unknown inputs (fallback: `locationMap[normalized] ?? entraLocation`, line 80)

Current Pass 1 patch condition (`userProvision.service.ts:542`):
```ts
if (mappedLocation !== undefined && mappedLocation !== (entraUser.officeLocation ?? null)) {
  patch['officeLocation'] = mappedLocation;
}
```

`mapOfficeLocation` never returns `undefined` (return type is `string | null`), so `!== undefined` is always true — the guard is wrong. When `mappedLocation` is `null` (blank school), and the user has a real `officeLocation`, the condition fires and patches to `null` — silently clearing the location.

For unmapped schools: returns the raw SIS string (e.g. `"Some New School"`). This patches `officeLocation` with a non-canonical string, with no visibility.

**Fix:**
- Change the null check: `if (mappedLocation !== null && mappedLocation !== (entraUser.officeLocation ?? null))`  
  This skips the patch when school is blank, treating "unknown" as "leave unchanged".
- Add a log warning when the school is non-blank but the mapped value equals the input (unmapped case):
  ```ts
  if (sisRow.school && mappedLocation === sisRow.school) {
    loggers.server.warn('Provisioning: unmapped school — officeLocation pushed verbatim', { school: sisRow.school });
  }
  ```
  Detection: `mappedLocation === sisRow.school` is true only when the fallback branch fires (the locationMap entry was undefined, so `?? entraLocation` returned the exact input).

### #14 — Report suppressed on error-only and update-only runs

`sendProvisioningReport` (`email.service.ts:1472`):
```ts
if (result.created.length === 0 && result.deprovisioned.length === 0 && result.reEnabled.length === 0) return;
```

This bails before sending even when `result.errors > 0` (errors occurred but no account was created/disabled/re-enabled — e.g. Graph was partially down) or `result.updated > 0` (name/grade reconciliation produced field updates). Error-only runs are the case where admins most need the report.

**Fix:** Extend the guard to also check for errors and updates:
```ts
if (
  result.created.length === 0 &&
  result.deprovisioned.length === 0 &&
  result.reEnabled.length === 0 &&
  result.errors === 0 &&
  result.updated === 0
) return;
```

### #15 — Disable alert silently no-ops

`sendProvisioningDisableAlert` (`email.service.ts:1579-1584`):
```ts
const recipients = recipientOverride ?? (() => {
  const raw = process.env.PROVISIONING_ADMIN_EMAIL;
  if (!raw) return [] as string[];
  return raw.split(',').map((r) => r.trim()).filter(Boolean);
})();
if (recipients.length === 0) return;
```

Returns silently with no log. A held batch (already persisted to DB) produces no alert and is discoverable only via UI polling. This is a safety-critical signal.

**Fix:** Log a warning before returning:
```ts
if (recipients.length === 0) {
  loggers.email.warn(
    'Provisioning disable alert: no recipients configured — batch held but no alert sent',
    { batchId: params.batchId, count: params.count },
  );
  return;
}
```

---

## Implementation Plan

### Step 1 — `backend/src/services/cronJobs.service.ts`: Strip to refresh-token-only

Remove everything except `scheduleRefreshTokenCleanup`, `start()`, `stop()`. Remove dead imports.

### Step 2 — `backend/src/server.ts`: Wire cronJobsService.start()

Add `cronJobsService.start()` call alongside `schedulerService.start()` so the refresh-token cleanup actually runs.

### Step 3 — `backend/src/controllers/provisioning.controller.ts`: Write manual run to JobSchedule

After `result = await runProvisioningJob(...)` succeeds, upsert the `JobSchedule` row. Import `computeNextRun` from `scheduler.service.ts`.

### Step 4 — `backend/src/services/userProvision.service.ts`: Fix officeLocation patch

Change `mappedLocation !== undefined` to `mappedLocation !== null`. Add unmapped-school log warning.

### Step 5 — `backend/src/services/email.service.ts`: Fix report guard + disable alert log

Extend the `sendProvisioningReport` early-return condition to include `errors > 0` and `updated > 0`. Add warning log to `sendProvisioningDisableAlert` when recipients is empty.

### Step 6 — `.env.example`: Remove dead env vars

Remove `PROVISIONING_SYNC_SCHEDULE` section. Remove `SUPERVISOR_SYNC_SCHEDULE` section.

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/cronJobs.service.ts` | Strip to refresh-token cleanup only; remove dead imports/methods |
| `backend/src/server.ts` | Add `cronJobsService.start()` |
| `backend/src/controllers/provisioning.controller.ts` | Write manual run outcome to JobSchedule; import `computeNextRun` |
| `backend/src/services/userProvision.service.ts` | Fix officeLocation null guard; add unmapped-school warning log |
| `backend/src/services/email.service.ts` | Extend report guard; add disable-alert warning log |
| `.env.example` | Remove `PROVISIONING_SYNC_SCHEDULE` and `SUPERVISOR_SYNC_SCHEDULE` |

No schema changes. No new dependencies. No migration needed.

---

## Build Commands

- Backend: `docker compose -f docker-compose.dev.yml build backend`
- Frontend: `docker compose -f docker-compose.dev.yml build frontend`
- Preflight: `scripts/preflight.ps1`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `cronJobsService.start()` now called — duplicate scheduling if `schedulerService` also ran those jobs | Only `scheduleRefreshTokenCleanup` remains; provisioning/supervisor scheduling removed from `cronJobsService` entirely — no conflict |
| Removing `getProvisioningStatus` from cronJobsService breaks a caller | HIGH fix already removed `cronJobsService` from the provisioning controller. No other callers. Safe to remove. |
| Manual run write to JobSchedule fails (DB error) | Wrapped in try/catch — logs error but does not fail the HTTP 200 response |
| Report now sent on update-only runs (grade/name reconciliation) — higher email volume | Correct behaviour: operators should know name/grade updates happened. Quiet-night guard still works — a run with zero creates/disables/re-enables/errors/updates sends nothing |
| Removing `PROVISIONING_SYNC_SCHEDULE` from `.env.example` surprises operators | The comment makes clear the schedule is managed via the Admin UI → Jobs page, not env vars |

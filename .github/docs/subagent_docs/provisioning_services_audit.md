# Provisioning Services — Audit Findings

**Date:** 2026-06-24
**Scope:** The provisioning status/last-run/batch-history feature recently added, plus the
surrounding provisioning services it depends on.

**Files reviewed:**
- `backend/src/services/cronJobs.service.ts`
- `backend/src/services/scheduler.service.ts`
- `backend/src/services/userProvision.service.ts`
- `backend/src/services/userSync.service.ts` (`mapOfficeLocation`)
- `backend/src/services/email.service.ts` (`sendProvisioningReport`, `sendProvisioningDisableAlert`, `sendMail`, `escapeHtml`)
- `backend/src/utils/upnGenerator.ts`
- `backend/src/controllers/provisioning.controller.ts`
- `backend/src/routes/provisioning.routes.ts`
- `backend/src/validators/provisioning.validators.ts`
- `backend/src/server.ts`
- `backend/prisma/schema.prisma` (ProvisioningConfig / ProvisioningAudit / ProvisioningDisableBatch / JobSchedule)
- `frontend/src/services/provisioningService.ts`
- `frontend/src/lib/queryKeys.ts`
- `frontend/src/pages/admin/ProvisioningPage.tsx`

---

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | **HIGH** | `/status` last-run data is read from `cronJobsService`, whose scheduler is **never started** — banner & schedule "Last run" are permanently empty |
| 2 | **MEDIUM** | Manual "Run Now" (POST `/provisioning/run`) updates **no** run-status store, so it never appears in the new last-run UI |
| 3 | **MEDIUM** | `executing` flag in `/status` can never be `true` — same dead source as #1 |
| 4 | **MEDIUM** | `PROVISIONING_SYNC_SCHEDULE` env var is dead config; the real schedule lives only in the `JobSchedule` table |
| 5 | **LOW** | Batch History sorts by `resolvedAt` but displays `createdAt`, so visible dates look out of order |
| 6 | **LOW** | `(userSyncService as any).mapOfficeLocation(...)` reflectively calls a private method when the standalone export is already imported |
| 7 | **LOW** | New response types (`ProvisioningStatus`, `DisableBatchHistoryItem`) defined in the frontend rather than `@mgspe/shared-types` |
| 8 | **LOW** | Batch History does not auto-refresh when a new batch is held by a scheduled run |
| 9 | **INFO** | `RunSummary.testMode` is carried through the API but unused by the UI |
| 10 | **HIGH** | Pass 1 (UPDATE) never reconciles names (staff **and** students) or student grade (`department`) — only location, employeeType, re-enable, staff jobTitle. Confirmed requirement: staff and students do change names |
| 11 | **LOW-MED** | A blank SIS `School` clears Entra `officeLocation`; unmapped schools push the raw SIS string through unchanged |
| 12 | **LOW** | UPN allocation has a concurrency race — same-name accounts created in one run can collide (transient `FAILED`, self-heals next run) |
| 13 | **LOW** | `applyDisableBatch` disables the snapshot captured when the batch was held, without re-validating against current SIS at approval time |
| 14 | **MEDIUM** | `sendProvisioningReport` suppresses the entire report when created/deprovisioned/re-enabled are all zero — error-only and update-only runs send **no** email |
| 15 | **LOW-MED** | `sendProvisioningDisableAlert` silently no-ops when no recipient is configured — a held batch can go un-notified (visible only via UI polling) |

---

## HIGH

### 1. `/status` last-run data comes from a scheduler that is never started

**Location:** `backend/src/controllers/provisioning.controller.ts:255-276`,
`backend/src/services/cronJobs.service.ts:37-50, 166-257`, `backend/src/server.ts:9-25`

The new `getStatus` handler builds its last-run fields from
`cronJobsService.getProvisioningStatus()`:

```ts
const cronStatus = cronJobsService.getProvisioningStatus();
res.json({
  ...
  executing:         cronStatus.executing,
  lastRunAt:         cronStatus.lastRunAt?.toISOString() ?? null,
  lastRunDurationMs: cronStatus.lastRunDurationMs,
  lastRunError:      cronStatus.lastRunError,
  lastRunSummary:    cronStatus.lastRunSummary,
});
```

That in-memory state is only ever populated by `cronJobsService.runProvisioningSync()`
(`cronJobs.service.ts:199-232`), which is only invoked by the cron registered in
`cronJobsService.scheduleProvisioningSync()` — and that is only called from
`cronJobsService.start()` (`cronJobs.service.ts:47`).

**`cronJobsService.start()` is never called.** `server.ts` starts only
`schedulerService.start()` and the email worker; `cronJobsService` is referenced solely for
`stop()` on shutdown (`server.ts:29`). Confirmed: a repo-wide search for `.start()` in
`backend/src` returns only `schedulerService.start()`.

Consequently `getProvisioningStatus()` always returns its initial value:

```ts
{ executing: false, lastRunAt: null, lastRunDurationMs: null, lastRunError: null, lastRunSummary: null }
```

**Impact:**
- The Status Banner always renders **"Last run: Never"** (`ProvisioningPage.tsx:142-151`).
- The Schedule card's last-run line is gated on `jobStatus?.lastRunAt` and therefore **never
  renders** (`ProvisioningPage.tsx:590-600`).
- The chips (Sync Enabled / Test Mode / Tenant) still work because they come from the DB
  (`config` / `jobSchedule`), so the bug is easy to miss in a quick glance.

The real last-run data already exists: scheduled provisioning runs go through
`schedulerService.executeJob('provisioning-sync', ...)`, which writes `lastRunAt`,
`lastRunStatus`, and `lastRunResult` to the `JobSchedule` row
(`scheduler.service.ts:202-224`). `getStatus` **already fetches that row** for `enabled` and
then ignores its run fields.

**Recommendation:** Source last-run data from the `jobSchedule` record that `getStatus`
already queries:
- `lastRunAt` ← `jobSchedule.lastRunAt`
- `lastRunError` ← `jobSchedule.lastRunStatus === 'error' ? (lastRunResult.error) : null`
- `lastRunSummary` ← derive from `jobSchedule.lastRunResult` (it already contains
  `created/deprovisioned/updated/errors/durationMs/testMode`, see `scheduler.service.ts:291-298`)
- `lastRunDurationMs` ← `lastRunResult.durationMs`
- `executing` ← `schedulerService` would need to expose `isRunning('provisioning-sync')`
  (see #3).

Then drop the dependency on `cronJobsService.getProvisioningStatus()` (and consider deleting
the now-unused `lastRunSummary` plumbing added to `cronJobs.service.ts`, since that whole code
path is dead — see #4).

---

## MEDIUM

### 2. Manual "Run Now" results never surface in the last-run UI

**Location:** `backend/src/controllers/provisioning.controller.ts:21-49`

`runProvisioning` (POST `/provisioning/run`, the button in `RunJobCard`) calls
`runProvisioningJob(...)` directly and updates **neither** the `JobSchedule` row **nor**
`cronJobsService` state. So even after #1 is fixed to read from `JobSchedule`, a manual run
from the Provisioning page will not update "Last run".

Note the app has a second "run now" path — `schedulerService.runJobNow('provisioning-sync')`
from the Admin Jobs page — which *does* update `JobSchedule`. The two run buttons therefore
behave inconsistently with respect to run tracking.

**Recommendation:** Decide on one source of truth. Simplest: have the manual provisioning
endpoint record its outcome to the `JobSchedule` row (or route manual runs through
`schedulerService.runJobNow`) so all three execution paths (scheduled, admin-jobs manual,
provisioning-page manual) update the same last-run record.

### 3. `executing` can never be `true`

**Location:** `provisioning.controller.ts:267`, `cronJobs.service.ts:242-257`

Same root cause as #1: `executing` comes from the dead `cronJobsService` state. The live
in-progress flag for provisioning is `schedulerService.isRunning.get('provisioning-sync')`
(`scheduler.service.ts:175-200`), which is private and not exposed. The banner can therefore
never indicate an in-progress sync.

**Recommendation:** Add a small public accessor on `schedulerService`
(e.g. `isRunning(jobKey)`) and use it for `executing`.

### 4. `PROVISIONING_SYNC_SCHEDULE` is dead configuration

**Location:** `cronJobs.service.ts:166-197, 307-315`

`scheduleProvisioningSync()` reads `process.env.PROVISIONING_SYNC_SCHEDULE` and validates it,
but since `cronJobsService.start()` is never called this env var has no effect. The schedule
that actually governs provisioning is the `JobSchedule.cronExpr` row managed by
`schedulerService`. This is misleading for operators and a maintenance trap (someone may "fix"
the schedule via the env var and see no change).

**Recommendation:** Remove the provisioning (and, if also dead, supervisor) scheduling from
`cronJobsService`, or wire `cronJobsService.start()` in if it is genuinely intended to run.
Given `schedulerService` already owns `provisioning-sync` and `sync-supervisors`,
`cronJobsService`'s cron registration appears to be superseded/legacy. (Out of strict scope,
but it is the direct cause of #1/#3 and worth resolving together.)

---

## LOW

### 5. Batch History order vs. displayed column mismatch

**Location:** `provisioning.controller.ts:282-297`, `ProvisioningPage.tsx:1524-1530`

`listDisableBatchHistory` orders by `resolvedAt desc`, but the table's "Date" column displays
`formatTimestamp(item.createdAt)`. Rows can therefore appear chronologically out of order to a
viewer reading the Date column. Either sort by `createdAt`, or display `resolvedAt` (the field
the sort is on). Displaying `resolvedAt` is more meaningful for a *history of resolutions*.

### 6. Reflective private-method call in CREATE pass

**Location:** `userProvision.service.ts:596`

```ts
const mappedLocation = (userSyncService as any).mapOfficeLocation(sisRow.school) as string | null;
```

`mapOfficeLocation` is a private method on `UserSyncService` that merely delegates to the
standalone `mapOfficeLocation` export (`userSync.service.ts:387-388`) — which is **already
imported** and used directly in the UPDATE pass (`userProvision.service.ts:536`). The `as any`
cast defeats type-checking and would silently break if the private method is renamed. Use the
imported function directly for consistency with Pass 1.

### 7. Response types not in the shared-types contract

**Location:** `frontend/src/services/provisioningService.ts:69-97`, `cronJobs.service.ts:10-17`

`ProvisioningStatus` and `DisableBatchHistoryItem` (and the inline `lastRunSummary` shape,
duplicated between backend `RunSummary` and the frontend) are declared on the frontend rather
than in `@mgspe/shared-types`. The project contract is that request/response types shared by
both sides live in `shared/src`. This matches the *existing* provisioning types (which are also
frontend-local), so it is a pre-existing pattern rather than a regression — flagged for
consistency only.

### 8. Batch History does not refresh when a scheduled run holds a new batch

**Location:** `ProvisioningPage.tsx:1485-1494`

`DisableBatchHistorySection` uses `staleTime: 60_000` with no `refetchInterval`. The
`PendingDisablesCard` polls every 30s and history is invalidated on approve/reject, but a newly
*held* batch created by a background scheduled run won't appear (in pending) until that card's
poll, and history only changes on resolution. Acceptable for "history," but note the pending
list relies on polling while history relies on mutation invalidation — they can briefly
disagree.

---

## INFO

### 9. `RunSummary.testMode` unused by UI

`RunSummary`/`lastRunSummary` carries `testMode`, but `StatusBanner` and the Schedule card only
read `created` and `errors`. Harmless; keep if intended for future use, otherwise trim.

---

## Core reconciliation engine (`userProvision.service.ts`)

The three-pass engine (UPDATE → CREATE → DISABLE) is well-built and safe-by-default: in-memory
lookup maps avoid per-user Graph reads, concurrency is bounded (`runWithConcurrency`, limit 5),
the bulk-disable failsafe holds oversized batches for admin approval, dry-run is fully
supported, every action is audited, and passwords are stripped before audit. The findings below
are correctness gaps in *what gets reconciled*, not structural problems.

### 10. Pass 1 (UPDATE) under-reconciles: name changes (staff + students) and student grade are ignored — **HIGH**

**Location:** `userProvision.service.ts:534-572` (UPDATE patch), `:611-642` (name/grade set only at create)

The UPDATE patch only ever sets: `accountEnabled` (re-enable), `officeLocation`,
`employeeType`, and — for staff only — `jobTitle`. Name fields (`givenName`, `surname`,
`displayName`) and the student `department` (`Grade N`) are written **only at create**
(`:611-642`) and **never reconciled afterward**.

**Impact (confirmed requirement):** Staff and students do change names (marriage, legal name
change, corrected spelling), and that is a real, recurring case here — so existing accounts go
stale on name and are never corrected by a sync. Students additionally drift on grade every
year. This is a data-correctness defect, not a cosmetic one.

**Recommendation — make this a top fix:**
- In Pass 1, compare `givenName` / `surname` against the SIS row and patch on mismatch, for
  **both** staff and students.
- Recompute and patch `displayName` from the SIS first/last name on mismatch (define the
  canonical format once — current create uses `"${firstName} ${lastName}"`, `:611-613`).
- For students, compare `department` against `Grade ${row.grade}` and patch on mismatch.
- **Decide explicitly about the UPN.** The UPN is derived from the name (`upnGenerator.ts`), but
  it is also the sign-in identity and mail address. Changing `displayName`/`givenName`/`surname`
  is low-risk and should be done; **regenerating the UPN on a name change is a separate, higher-
  risk decision** (breaks sign-in, mail routing, and the `upnSet` collision logic) and should be
  handled deliberately — most districts keep the original UPN and only update display fields.
  Recommend: reconcile display/name fields now, leave UPN stable unless there is an explicit
  requirement to rename it.

### 11. Blank/unmapped SIS `School` mishandled

**Location:** `userProvision.service.ts:536-544`, `userSync.service.ts:34-81`

`mapOfficeLocation('')` returns `null` (`userSync.service.ts:35`), and Pass 1 treats
`mappedLocation !== undefined && mappedLocation !== (entraUser.officeLocation ?? null)` as a
reason to patch (`:542`). So a row with a **blank** `School` column will overwrite an existing
Entra `officeLocation` with `null` — silent data loss. Conversely, an **unmapped** school name
falls through `locationMap[normalized] ?? entraLocation` and pushes the **raw SIS string**
straight into `officeLocation`, so location quality depends entirely on `locationMap` staying
current. This is directly relevant to the Ridgemont Elementary → Obion County Middle School
rename (2026-07-01): the map already contains both keys, but any SIS spelling not in the map
writes through verbatim.

**Recommendation:** Skip the `officeLocation` patch when the mapped value is `null` (treat
"unknown" as "leave unchanged" rather than "clear"), and consider logging unmapped school names
so the map can be kept current.

### 12. UPN allocation race under concurrency

**Location:** `userProvision.service.ts:592-609`, `utils/upnGenerator.ts:49-90`

`resolveStaffUpn` / `resolveStudentUpn` probe `existsInEntra` (the in-memory `upnSet`), but the
caller only reserves the result with `upnSet.add(...)` **after** resolution returns (`:609`).
Because the `exists` check is `async` (yields to the event loop) and up to 5 create tasks run
concurrently, two same-name new accounts in one run can both resolve `jsmith@…` before either
reserves it. The second Graph `POST /users` then 409s and is logged `FAILED`.

**Impact:** Low — it surfaces as a transient error and self-heals on the next run (the first
account now exists in Entra), not as data corruption. Worth tightening if same-name intake
batches are common.

**Recommendation:** Reserve the candidate inside the resolver (pass a synchronous
"claim" callback that both checks and adds atomically), or process creates serially.

### 13. Batch approval disables a stale snapshot

**Location:** `userProvision.service.ts:359-418`

`applyDisableBatch` disables exactly the `pendingUsers` array captured when the batch was held.
If an account re-enrolls (reappears in the SIS) between the held run and the approval, it is
still disabled because the list is not re-validated against current SIS at approval time.

**Impact:** Low and bounded by how long batches sit pending, but in a busy enrollment window a
re-enrolled account could be wrongly disabled until the next run re-enables it (Pass 1
re-enable).

**Recommendation:** Document the snapshot semantics, or re-check each `pendingUser` against the
current SIS export at approval time before disabling.

---

## Email / report path (`email.service.ts`)

Both provisioning emails are well-implemented on the safety axes: every interpolated string
(display name, UPN, school, triggeredBy, batch ID, date, URL) is run through `escapeHtml`
(`email.service.ts:31-38`), so malicious SIS data (e.g. a student named `<script>…`) cannot
inject HTML into the report. Both functions are non-critical — they swallow errors and never
throw — and they route through the email queue via `sendMail` → `enqueueEmail`
(`email.service.ts:44-69`), which itself also swallows enqueue failures, so a mail problem can
never fail a provisioning run. That is the correct posture.

### 14. Report is suppressed unless an account was created/disabled/re-enabled

**Location:** `email.service.ts:1472`

```ts
if (result.created.length === 0 && result.deprovisioned.length === 0 && result.reEnabled.length === 0) return;
```

The report bails out before sending whenever those three arrays are empty — **even if the run
had errors or field updates**. Consequences:
- A run that **errored** (e.g. `errors = 12`) but created/disabled nothing sends **no report**,
  so the failure is invisible to report recipients (only the server log captures it).
- A run that only performed field **updates** (`updated > 0`) sends nothing — and this becomes
  more relevant if finding #10 is fixed to start patching student grade, since grade-only runs
  would then be silent.

**Recommendation:** Also send when `errors > 0` (and arguably when `updated > 0`). At minimum,
errors should always produce a report — an error-only run is exactly when an admin most needs
the email.

### 15. Disable alert silently no-ops with no recipient

**Location:** `email.service.ts:1579-1584`, caller `userProvision.service.ts:704-710`

When neither `recipientOverride` (the DB `adminEmails`) nor `PROVISIONING_ADMIN_EMAIL` is set,
`sendProvisioningDisableAlert` returns without sending and without logging. But the caller has
already **created and persisted a held batch** (`userProvision.service.ts:700-702`). The batch
therefore sits `PENDING` with no email notification — discoverable only if an admin happens to
open the Provisioning page (where `PendingDisablesCard` polls every 30s). For a safety-critical
"we paused a bulk disable" signal, silent no-op is risky.

**Recommendation:** Log a warning when a held batch produces no alert recipients, so the gap is
at least visible in logs/monitoring.

### Note (ties to #4)

The dead `cronJobsService.runProvisioningSync()` path calls `sendProvisioningReport(result)`
with **no** recipient override (`cronJobs.service.ts:207`), so it would ignore the DB
`reportEmails` config and use only `PROVISIONING_REPORT_EMAIL`. The **live** scheduled path
(`schedulerService.dispatch`) correctly passes `cfg.reportEmails` (`scheduler.service.ts:290`),
and the disable alert passes `config.adminEmails` (`userProvision.service.ts:710`), so the
active code respects DB config — this discrepancy only matters if `cronJobsService` is ever
wired in (see #4).

---

## Notes on what is correct

- Route ordering in `provisioning.routes.ts` places `/disable-batches/history` (GET) ahead of
  `/disable-batches/:id/...` (POST); no Express 5 ambiguity (different methods, but the order is
  defensive and fine).
- `listDisableBatchHistory` correctly strips the potentially large `pendingUsers` JSON and
  returns only `accountCount` (`provisioning.controller.ts:289-292`) — good payload hygiene.
- `reject` validates batch existence and `PENDING` status with proper 404/409 responses
  (`provisioning.controller.ts:308-316`).
- All new routes sit behind `authenticate, requireAdmin`, and mutating routes
  (`approve`/`reject`) carry `validateCsrfToken`; the read-only `status`/`history` correctly
  omit CSRF (`provisioning.routes.ts:8-19`).
- No Entra group IDs or raw Graph payloads are exposed by the new endpoints.
- The TEST-tenant-without-credentials guard in `runProvisioningJob`
  (`userProvision.service.ts:437-450`) correctly refuses a live run and only warns on dry runs.
- Both provisioning emails escape all interpolated SIS-sourced strings (`escapeHtml`) and are
  non-throwing/queue-backed, so external data cannot inject HTML and mail failures cannot fail a
  provisioning run (`email.service.ts:31-69, 1455-1628`).

---

## Suggested fix priority

1. **#10 (HIGH, must-fix)** — reconcile name fields (`givenName`/`surname`/`displayName`) for
   staff **and** students in Pass 1, plus student `department`/grade. Confirmed requirement:
   names change and currently never get corrected. Keep the UPN stable unless explicitly told to
   rename it (see #10 detail).
2. **#1** — re-point `/status` last-run fields at the `JobSchedule` row (high value, small,
   localized change in `getStatus`). This is what makes the shipped feature actually display data.
3. **#11** — stop clearing `officeLocation` on blank/unmapped schools; log unmapped names.
4. **#14** — send the report on `errors > 0` (and ideally `updated > 0`); error-only runs must
   not be silent.
5. **#3** — expose `schedulerService.isRunning(jobKey)` and use it for `executing`.
6. **#2** — unify manual-run tracking so "Run Now" updates the same record.
7. **#4** — remove/retire the dead `cronJobsService` provisioning scheduling.
8. **#15, #12, #13, #5, #6** — small correctness/consistency cleanups.

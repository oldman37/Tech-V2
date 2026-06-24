# Provisioning Page — Full Audit

**Date:** 2026-06-17
**Scope:** `frontend/src/pages/admin/ProvisioningPage.tsx`, `frontend/src/services/provisioningService.ts`, `backend/src/controllers/provisioning.controller.ts`, `backend/src/services/userProvision.service.ts`, `backend/src/services/scheduler.service.ts`, `backend/src/validators/provisioning.validators.ts`, `backend/src/routes/provisioning.routes.ts`, `backend/prisma/schema.prisma`
**Type:** Read-only audit — no code changed. Findings only.

---

## 0. Executive Summary

The Provisioning page is well structured: clean card decomposition, a shared TanStack
Query cache key, backend-enforced auth/CSRF, and a sensible three-pass reconciliation
service. The headline risks are operational, not architectural:

1. **Test Mode is not an offline simulation.** It skips *writes* only. It still reads the
   CSV from disk and makes live Microsoft Graph **read** calls. If either is misconfigured,
   a "test" run fails or returns misleading numbers.
2. **The CSV files are not always present** — a run fails with `ENOENT` when the SIS dump
   hasn't landed yet. The configured paths (`staff.csv`/`students.csv`) are correct; the
   problem is a file-availability race with the legacy system that consumes those files.
   This is the #1 reason a run shows `Errors`.
3. ~~**Selecting the TEST tenant silently falls back to PRODUCTION** when the
   `PROVISIONING_*` credentials are not all present — a safety footgun.~~ ✅ Fixed
4. ~~**The UI claims passwords are "stored encrypted"** but the column is plain `String`.~~ ✅ Fixed

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low / polish

---

## 1. Why Test Mode May Not Work

### 1.1 🔴 CSV files are not always present (file-availability race with the legacy system)
`backend/src/services/userProvision.service.ts:444-446`

```ts
const csvPath = type === 'STAFF'
  ? (process.env.SIS_STAFF_CSV ?? '/sis-data/staff.csv')
  : (process.env.SIS_STUDENT_CSV ?? '/sis-data/students.csv');
```

The configured paths (`staff.csv` / `students.csv`) are **correct** — that is the canonical
output the new system targets. The failure mode is timing: the legacy program ingests and
consumes those files, and until Synergy produces its next dump they are absent from
`/sis-data` (only transient artifacts like `SynergyStaff.csv` / `SynergyStudents.csv` may be
present). When the file is missing, `parseStaffCSV` throws `ENOENT`, `runForType` rethrows
(`:452-455`), and `runProvisioningJob` catches it as a fatal per-type error (`:416-422`).
Result: `Errors 2`, `Duration ~77ms`, nothing else. This happens in **test mode too**,
because the CSV is read before any write guard.

This is a known operational condition that persists until the legacy system is
decommissioned — not a path-config bug. The mitigation already implemented is surfacing the
error message to the UI (the `errorMessages` array). A pre-flight "is the CSV present and
how many rows?" check (see §4.2) would make the cause obvious instead of a bare error count.

### 1.2 🟠 Test Mode still requires working Graph credentials for the target tenant
`backend/src/services/userProvision.service.ts:461`

`fetchEntraUsersByUpnDomain(domain, client)` runs unconditionally — it is **not** guarded
by `if (!testMode)`. Test mode only gates the `.patch`/`.post` write calls (`:511`, `:590`,
`:676`). So a dry run still:
- authenticates to Graph,
- pages every user in the UPN domain,
- calls `mapOfficeLocation` and resolves UPNs.

If the active tenant's credentials are missing/expired, or the UPN domain has no users, a
"test" run fails or returns `Created 0 / Updated 0` that looks like a no-op but is really an
auth/data problem. This is by design (the service needs current Entra state to compute a
diff) but is not communicated anywhere in the UI.

### ~~1.3 🔴 Selecting "TEST" silently falls back to the PRODUCTION client~~ ✅ Fixed
`backend/src/services/userProvision.service.ts:105-119`

```ts
if (targetTenant === 'TEST' && tenantId && clientId && clientSecret) { ... test client ... }
return { client: graphClient, isTestTenant: false };  // <- main/PROD client
```

If `targetTenant === 'TEST'` but any one of `PROVISIONING_TENANT_ID` /
`PROVISIONING_CLIENT_ID` / `PROVISIONING_CLIENT_SECRET` is missing, the function returns
the **main production** `graphClient`. Consequences:
- In test mode: the dry-run diff is computed against **production** users (misleading, but
  no writes).
- In **live** mode with TEST selected: writes hit **production**. The "TEST tenant"
  selection gives a false sense of safety.

The UI's only guard is in `TenantSwitcherCard`:
`const hasTestCreds = Boolean(config?.testTenantId)` (`ProvisioningPage.tsx:135`), which
checks **only** `PROVISIONING_TENANT_ID`. A partially-configured set (tenant id present,
secret missing) shows no warning yet still falls back to prod.

**Fix:** have `getConfig` report whether *all three* `PROVISIONING_*` creds are present, and
surface a hard warning. Consider refusing a TEST-targeted run when creds are incomplete
rather than silently using prod.

### 1.4 🟡 Test runs ignore the disable threshold and can report alarming numbers
`backend/src/services/userProvision.service.ts:634`

The bulk-disable failsafe is `if (!testMode && toBeDisabled.length > DISABLE_THRESHOLD)`.
In test mode the cap is skipped, so PASS 3 lists **every** candidate as `DRY_RUN_DISABLE`.
If the CSV is partial/wrong (few rows), a dry run can mark thousands of accounts
"deprovisioned," which a live run would actually have **held** for approval. The test
result therefore does not predict live behavior. Recommend showing "a live run would hold
this batch (N > threshold)" when a dry run exceeds the threshold.

### 1.5 🟡 A fresh DB cannot test-run without default passwords
`backend/src/services/userProvision.service.ts:295-300`

`getOrSeedConfig` throws if there is no config row **and**
`PROVISIONING_DEFAULT_STAFF_PASSWORD` / `..._STUDENT_PASSWORD` are unset — even though test
mode never POSTs the password. First-time dry runs fail until passwords are seeded.

---

## 2. Coding Issues

### Frontend

#### ~~2.1 🟡 `ScheduleEditorCard` select-state sync is buggy~~ ✅ Fixed
~~`useState(presetLabel)` initialized before config loads, capturing `'Every 2 hours'` default.
`resolvedSelected` hack meant the user could never explicitly choose `'Every 2 hours'`.~~
Fixed by replacing with a nullable `selectedOverride` state (`null` = follow server state).
`selected = selectedOverride ?? presetLabel` — any explicit pick (including "Every 2 hours")
is stored in `selectedOverride`; the server value flows through only when nothing is selected.
Resets to `null` on save success so the UI re-syncs to the newly saved config.

#### ~~2.2 🟢 Controlled custom-cron field snaps back to the saved value~~ ✅ Fixed
~~`value={customCron || (isCustom ? currentCron : '')}` — clearing the field jumped back to
`currentCron` because `''` is falsy.~~
Fixed by changing `customCron` to `string | null` with `null` as the unset sentinel.
`cronFieldValue = customCron !== null ? customCron : (isCustom ? currentCron : '')` — an
empty string typed by the user stays empty.

#### 2.3 🟡 `RunJobCard` has a stale comment / unfulfilled intent
`ProvisioningPage.tsx:573-577`

```ts
// Initialise testMode from the server env flag once config loads
const { data: config } = useQuery({ ... });
```

`testMode` is hardcoded to `useState(true)` (`:567`) and never initialized from
`config.testModeEnv`. The behavior (always default to safe test mode) is fine; the comment
is misleading and should be removed or the intent implemented.

#### ~~2.4 🟡 `DISABLE_HELD` audit action has no chip color and is excluded from filters~~ ✅ Fixed
- ~~`actionChipColor` (`ProvisioningPage.tsx:65-77`) has no `DISABLE_HELD` case → renders as a
  grey `default` chip.~~
- ~~The audit "Real Runs" filter list omits it:
  `provisioning.controller.ts:58` → `['CREATED','UPDATED','DISABLED','SKIPPED','FAILED']`.
  `DISABLE_HELD` rows (written at `userProvision.service.ts:661-666`) appear only under the
  "All" filter — the one event an admin most wants to find is hidden from both sub-filters.~~

#### 2.5 🟢 Dead "TEST MODE" chip on disable batches
`ProvisioningPage.tsx:1090` renders `{batch.testMode && <Chip label="TEST MODE" .../>}`, but
a batch is only ever created in live mode (`userProvision.service.ts:634` requires
`!testMode`). `batch.testMode` is therefore always `false`; the chip is dead UI.

#### 2.6 🟢 `approveResult` only tracks the last-approved batch
`ProvisioningPage.tsx:1059` — single object keyed by one `id`. With multiple pending batches,
approving a second clears the first's result banner. Low impact.

### Backend

#### ~~2.7 🟡 Private method accessed via `as any`~~ ✅ Fixed
~~`(userSyncService as any).mapOfficeLocation(...)` bypassed the type system twice.~~
Extracted `mapOfficeLocation` as an exported standalone function at the top of
`userSync.service.ts`; the class private method now delegates to it. Imported directly
in `userProvision.service.ts` and replaced both `as any` call sites.

#### 2.8 🟢 `userSyncService` built with the main client regardless of target
`userProvision.service.ts:344`, `:478` — always `new UserSyncService(prisma, graphClient)`.
Safe today because `syncUser` is only called when `!isTestTenant`, but it's a latent trap:
if someone later removes that guard, test-tenant IDs would be synced through the prod client.
Worth a comment or a guard at construction.

#### ~~2.8a 🟠 Manual-run controller ignored DB `reportEmails` override~~ ✅ Fixed
`provisioning.controller.ts:runProvisioning` called `sendProvisioningReport(result)` with no
`recipientOverride`. The scheduler correctly read `cfg.reportEmails` and passed it; the
manual-run path silently used only `PROVISIONING_REPORT_EMAIL` env var. Fixed by fetching
`reportEmails` from the DB before the job and passing it as the override — matching the
scheduler pattern exactly.

#### 2.9 🟢 Email recipient fields are not validated as emails
`provisioning.validators.ts:15-16` — `reportEmails`/`adminEmails` are `z.string().nullable()`.
A typo'd address is accepted and silently fails at send time. Consider splitting on comma and
validating each with `z.string().email()`.

#### 2.10 🟢 Cross-type disable guard assumes ID shape
`userProvision.service.ts:621-627` distinguishes staff/student by "student employeeIds start
with `s`." Correct for current data, but a staff badge beginning with `s` would be
mis-bucketed. Document the invariant or key off a stored userType instead.

---

## 3. Security

#### ~~3.1 🟠 UI claims passwords are "stored encrypted" — they are not~~ ✅ Fixed
- `ProvisioningPage.tsx:828`: *"Passwords are stored encrypted and never displayed."*
- `schema.prisma:2063-2064`: `staffPassword String` / `studentPassword String` (plaintext).
- `provisioning.controller.ts:143,152` writes the raw value; `getConfig` returns `MASKED`
  (`:92-93`), so it is correctly **never returned** over the API — good.

The "never displayed" half is true; the "encrypted" half is false. Because these are initial
Entra passwords that must be sent to Graph in cleartext, true one-way hashing isn't possible,
but the column could be encrypted-at-rest (app-level or DB-level) and the UI copy corrected
in the meantime. At minimum, fix the misleading text.

#### 3.2 🟢 Routes are correctly locked down (positive finding)
`provisioning.routes.ts` — `router.use(authenticate, requireAdmin)` on every route, with
`validateCsrfToken` on all four mutating routes (`/run`, PATCH `/config`, approve, reject).
No authorization logic leaks to the frontend. This matches the CLAUDE.md security constraints.

---

## 4. UI / UX Improvements

1. ~~🟠 **Combine tenant + mode into one unambiguous run banner.**~~ ✅ Fixed

2. 🟠 **Pre-flight data check before running.** Surface the resolved CSV path, its
   last-modified time, and parsed row counts (staff/student) before the user clicks Run.
   This would have made the `ENOENT` (§1.1) obvious without reading container logs.

3. 🟠 **Hard warning when TEST is selected but creds are incomplete** (§1.3). `getConfig`
   should report `hasFullTestCreds` (all three `PROVISIONING_*` set), and the switcher should
   block or loudly warn instead of silently using production.

4. 🟡 **Strengthen the live-run confirmation.** `RunJobCard`'s confirm dialog (`:734-754`) is
   a single click. For a production-tenant live run, require typing `PRODUCTION` (or the
   tenant name) to enable the button.

5. 🟡 **Dry-run threshold preview** (§1.4): when a test run's deprovision count exceeds the
   threshold, show "a live run would hold this batch for approval."

6. 🟡 **Fix and humanize the schedule editor** (§2.1): derive the select from config, validate
   the cron field client-side, and preview the next 3 run times (the backend already computes
   `nextRunAt` via `computeNextRun`).

7. 🟡 **Audit log: include `DISABLE_HELD`** in the color map and the "Real Runs" filter
   (§2.4); add a CSV export button.

8. 🟢 **`RunJobCard` has no loading skeleton** while `config` loads (other cards do). The
   `TEST MODE ENV` chip and target-tenant caption pop in after a delay.

9. 🟢 **Remove the dead `TEST MODE` batch chip** (§2.5).

10. 🟢 **Auto-refresh after a run** already works (the run mutation invalidates
    `provisioning.audit()` at `:584`) — good; consider also scrolling the audit log into view.

---

## 5. Quick-Win Checklist

| # | Finding | Sev | Effort |
|---|---------|-----|--------|
| 1.1 | Pre-flight CSV presence/row-count check (race with legacy system) | 🔴 | medium |
| ~~1.3~~ | ~~Stop silent TEST→PROD fallback; report full-cred status~~ | ~~🔴~~ | ✅ Done |
| ~~3.1~~ | ~~Fix "stored encrypted" copy (and/or encrypt at rest)~~ | ~~🟠~~ | ✅ Done |
| ~~2.1~~ | ~~Fix schedule-editor select state~~ | ~~🟡~~ | ✅ Done |
| ~~2.4~~ | ~~`DISABLE_HELD` color + filter inclusion~~ | ~~🟡~~ | ✅ Done |
| ~~4.1~~ | ~~Unified live/prod run banner~~ | ~~🟠~~ | ✅ Done |
| 4.2 | Pre-flight CSV row-count check | 🟠 | medium |
| ~~2.7~~ | ~~Extract `mapOfficeLocation`, drop `as any`~~ | ~~🟡~~ | ✅ Done |

---

*This document is an audit only. No source files were modified. Implementing any of the above
should follow the standard Phase 1–7 workflow in `CLAUDE.md`.*

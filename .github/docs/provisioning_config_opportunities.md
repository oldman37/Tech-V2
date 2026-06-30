# Provisioning System — Configuration Opportunities

This document inventories every hardcoded value in the provisioning service and rates each one
for the benefit vs. effort of making it configurable. Nothing in here requires an immediate
code change — it is a menu of options to discuss and prioritise.

---

## What Is Already Configurable

Before listing gaps, here is what the system already lets you control through the UI or env:

| Setting | Where |
|---------|-------|
| Staff / student UPN domain | DB (`provisioningConfig`) |
| Test-tenant UPN domains | DB |
| Target tenant (PRODUCTION / TEST) | DB |
| Test mode (dry run) | DB + env override |
| Disable threshold (default 50) | DB |
| Report email addresses | DB |
| Admin alert email addresses | DB |
| Sync schedule (cron expression) | DB |
| Sync enabled / disabled | DB |
| Test-tenant credentials | env (`PROVISIONING_*`) |
| Role-group protection membership | Entra — group membership drives what is protected |

---

## Hardcoded Values and Opportunities

### 1. Individual UPN Protection List
**Priority: High**

**Current state:** The only way to protect an account from deprovisioning is to be a member of one
of the hardcoded role groups. There is no way to protect a single account by UPN.

**Why this matters:** You already have a concrete need — six accounts with `onPremisesImmutableId`
set for Kerberos authentication. Those six accounts will always need to be shielded from Pass 3
regardless of their role-group membership. Right now the only protection they have is that they
happen to belong to a role group. If that changes, they become deprovision candidates.

**Proposed control:** A `protectedUpns` field in `provisioningConfig` (comma-separated list in the
DB, editable in the UI). Pass 3 would merge this list with the role-group set before filtering.

**Risk:** Low. It is additive — only prevents disables, never forces them.

---

### 2. Skip Display Names (Service / Placeholder Account List)
**Priority: High**

**Current state:** Hardcoded in `userProvision.service.ts`:
```
'oc admin', 'content keeper', 'r mbroadcast',
'substitute nurse', 'occ demographics', 'user sped'
```
These accounts are silently skipped during CSV parsing because they are not real people.

**Why this matters:** When the district adds a new service account or renames an existing one,
a developer has to edit the source file and redeploy. This has already happened — these names
accumulated over time as accounts were discovered.

**Proposed control:** A `skipDisplayNames` field in `provisioningConfig` (newline or comma-separated,
editable in the UI). The parser would load this list from the DB instead of the constant.

**Risk:** Low. Removing an entry from the list would cause that account to be processed on the next
run; adding one skips it. Either direction is reversible by editing the list.

---

### 3. Audit Log Retention Period
**Priority: Medium**

**Current state:** Hardcoded at **730 days** (2 years) in `scheduler.service.ts` inside the
`provisioning-audit-cleanup` dispatch case.

**Why this matters:** Compliance requirements or storage costs may change. Right now adjusting
it requires a code change and redeploy.

**Proposed control:** An `auditRetentionDays` column in `provisioningConfig` (integer, default 730).
The cleanup job reads the value at runtime.

**Risk:** Very low. The cleanup job is non-destructive in the sense that rows it deletes are old
audit history, not live account data. The only risk is setting it too low accidentally.

---

### 4. Maximum Concurrent Graph API Requests
**Priority: Low–Medium**

**Current state:** Hardcoded at **5** (`MAX_CONCURRENT` in `userProvision.service.ts`). This caps
how many Entra account creations and updates run in parallel during a sync.

**Why this matters:** If Graph API throttling becomes an issue as your user base grows, or if you
want faster runs, you currently cannot tune this without a code change.

**Proposed control:** A `graphConcurrency` integer in `provisioningConfig` (range 1–20, default 5).

**Risk:** Setting it too high risks Graph throttling (429 errors), which the service does not
currently retry on. Keep this behind a note in the UI that 5–10 is the safe range.

---

### 5. Scheduled Run User Type
**Priority: Low–Medium**

**Current state:** The cron job always runs `runProvisioningJob('ALL', ...)` — it always processes
both STAFF and STUDENT in one run. There is no way to schedule STAFF-only or STUDENT-only cron runs.

**Why this matters:** Staff and student CSV exports may come on different schedules, or you may
want a more frequent staff-only sync without re-processing all students every time.

**Proposed control:** A `syncUserType` column in `jobSchedule` (or in `provisioningConfig`), values
`ALL | STAFF | STUDENT`, default `ALL`. The scheduler reads it when triggering the cron job.

**Risk:** Low for STAFF-only or STUDENT-only scheduling. The main risk is scheduling both types
independently and having them overlap — the existing "job already running" guard would prevent that.

---

### 6. Role Group Protection List
**Priority: Low**

**Current state:** The 17 role groups protected from deprovisioning are a hardcoded array of env-var
names in `userProvision.service.ts`. Adding or removing a group requires a code change.

**Why this matters:** You removed four groups earlier in this project with a code change. If the
district's role structure evolves, that pattern repeats.

**Proposed control:** A `protectionGroupIds` field in `provisioningConfig` (comma-separated Entra
group IDs, editable in the UI). The service would use this DB list instead of the hardcoded env-var
array. The env vars themselves could remain as a fallback seed for the initial config.

**Risk:** Medium. The hardcoded list was deliberately chosen — removing a group from the DB field
would immediately expose those members to deprovisioning on the next run. The UI should warn clearly
when a group is removed from this list.

---

### 7. CSV Column Header Mapping
**Priority: Low**

**Current state:** Staff and student CSV column names are hardcoded in `parseStaffCSV` and
`parseStudentCSV`:

| Type | Expected headers |
|------|-----------------|
| Staff | `BadgeNumber`, `First Name`, `Last Name`, `School`, `StaffType` |
| Student | `Student ID`, `Active`, `First Name`, `Middle Name`, `Last Name`, `School`, `Grade` |

If the SIS vendor changes a column name, the parser silently drops rows.

**Why this matters:** SIS exports sometimes change between versions or with district settings.
A silent drop looks like a mass deprovision to Pass 3.

**Proposed control:** A column-mapping config section (JSON or simple key=value pairs in the DB)
that lets you remap `BadgeNumber` → `Badge Number` etc. without a code change.

**Risk:** Medium complexity to implement correctly. A misconfigured mapping could cause the same
silent-drop problem. Mitigate with a validation step that aborts if the mapped columns are not
found in the CSV header row.

---

### 8. Student Active Status Filter
**Priority: Low**

**Current state:** Students are only included if `Active == 'A'` — hardcoded string comparison.
Inactive students (`'I'`, `'W'`, `'G'`, etc.) are silently excluded.

**Why this matters:** If the SIS changes its active status codes, active students could be excluded
and look like deprovision candidates to Pass 3.

**Proposed control:** A `studentActiveValues` field in `provisioningConfig` (comma-separated,
default `A`). The parser uses this set instead of the hardcoded `'A'`.

**Risk:** Low. Adding a value includes more students; removing one excludes them. Reversible.

---

## Recommendation

If you were to pick two items to implement first, the strongest candidates are:

1. **Individual UPN protection list** — you have a real immediate need (Kerberos accounts), and it
   closes a genuine gap in the current protection model.
2. **Skip display names** — a low-risk, high-frequency pain point that already has a history of
   requiring code changes.

Items 3–5 (retention, concurrency, scheduled user type) are solid medium-term improvements once
the core system is stable. Items 6–8 are lower urgency unless the SIS vendor causes a problem.

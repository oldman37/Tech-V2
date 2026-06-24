# User Provisioning via Microsoft Graph API — Plan of Action

## Difficulty Assessment: Low–Medium

The infrastructure for this is largely already in place. This project already has:
- A registered Entra ID app with a client secret (`ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_TENANT_ID`)
- `@microsoft/microsoft-graph-client` and `@azure/msal-node` installed and wired up
- A working `createGraphClient()` factory and a `graphClient` singleton in `backend/src/config/entraId.ts`
- A full `UserSyncService` that already reads users and group memberships from Graph
- An existing nightly cron pattern (`SUPERVISOR_SYNC_SCHEDULE`) to follow
- An existing SMB connection (`SMB_USER` / `SMB_PASS`) to `//10.0.10.83` already in `.env`

The only significant gaps are: **the app registration does not yet have write permission**,
and **the Synergy CSV share needs to be mounted into the backend container**.

---

## How It Works Today vs. After This Change

| | Today (PowerShell script) | After (Tech-V2 automated) |
|---|---|---|
| **Trigger** | Windows Task Scheduler | node-cron inside backend container |
| **Auth to Graph** | Certificate thumbprint (hardcoded) | Existing `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` |
| **Auth to Exchange** | Username + password file | Unchanged — EXO script still runs separately |
| **CSV source** | `\\10.0.10.83\homes\edupoint\` | Same share, mounted as Docker volume |
| **Account creation** | Not implemented | New — Graph `POST /users` with configurable initial password |
| **Initial password** | Not implemented | Separate configurable passwords for staff vs. students; `forceChangePasswordNextSignIn: true` always set; changeable from the web UI |
| **officeLocation updates** | Not implemented | New — Graph `PATCH /users/{id}` when school changes in Synergy |
| **Account disabling** | `Update-MgUser -AccountEnabled:$false` | Same via Graph, same logic |
| **Extension attributes** | `Set-Mailbox` via EXO | Unchanged — EXO script picks up new/updated accounts by `EmployeeId` |
| **Audit trail** | Log file on disk | Database table + log file |
| **Email report** | None | Per-run email to configured recipients — created / deprovisioned lists |
| **Test / dry-run mode** | None | Full reconciliation logic runs; Graph writes skipped; report still sent with `[TEST]` prefix |
| **Manual trigger / monitoring** | None | Web UI in Tech-V2 |

---

## What the Graph API Supports

The Graph API endpoint `POST https://graph.microsoft.com/v1.0/users` creates a cloud-only
Entra ID user account. It accepts a JSON body and returns the created user object with a
`201 Created` response.

### Required Fields

| Field | Type | Notes |
|---|---|---|
| `accountEnabled` | Boolean | `true` to activate the account immediately |
| `displayName` | String | Full name shown in the directory and address book |
| `mailNickname` | String | Mail alias / username prefix (no `@domain`) |
| `userPrincipalName` | String | Must use a verified domain — see UPN Generation below |
| `passwordProfile.password` | String | Must meet tenant password complexity requirements |
| `passwordProfile.forceChangePasswordNextSignIn` | Boolean | `true` is strongly recommended |

### Commonly Needed Optional Fields (School District Context)

| Field | Purpose |
|---|---|
| `givenName` / `surname` | First and last name separately |
| `jobTitle` | e.g. "Teacher", "Bus Driver", "Principal" — from `StaffType` |
| `department` | e.g. "Transportation", "Maintenance" |
| `officeLocation` | School or building assignment |
| `employeeId` | `BadgeNumber` (staff) or `s` + `Student ID` (students) |
| `usageLocation` | Hardcoded `US` — **required before assigning a license** |

---

## UPN Generation Rules

UPNs must conform to Microsoft's character restrictions: only `A–Z`, `a–z`, `0–9`, and
`` ' . - _ ! # ^ ~ `` are allowed. Accented/diacritic characters are **not** permitted.

### Normalization (applies to both staff and students)

Apply in this order before any slicing:

1. **Unicode NFD decomposition** — splits combined characters (`é` → `e` + combining accent)
2. **Strip all Unicode combining marks** (category Mn) — removes the accent, leaving the base letter
3. **Lowercase** the result
4. **Strip** apostrophes, hyphens, and spaces entirely (do not replace with anything)

This correctly handles:
- Spanish/French diacritics: `á é í ó ú ñ ü ç` → `a e i o u n u c`
- Apostrophes in names: `K'den` → `kden`, `Bry'Ella` → `bryella`
- Hyphens in names: `Brown-Carter` → `browncarter`, `Karson-Lee` → `karsonlee`
- Compound first names with spaces: `"John Brayton"` → `johnbrayton` (slice to 3 = `joh`)
- Camel-case compound names: `LilyAnn` → `lilyann` (slice to 3 = `lil`)

---

### Staff UPN Pattern

```
{first initial}{normalized last name}@ocboe.com
```

**Example:** Joseph Lewis → `jlewis@ocboe.com`

**Collision rule:** If the UPN already exists in Entra, append an incrementing number
starting at `2` and check again until a free UPN is found.

```
jlewis@ocboe.com   ← taken
jlewis2@ocboe.com  ← taken
jlewis3@ocboe.com  ← free → use this
```

**Known edge cases from the staff CSV:**

| Name | Normalized last | Result UPN |
|---|---|---|
| `Shantelle Brown-Carter` | `browncarter` | `sbrowncarter@ocboe.com` |
| `Cheryl King-Ogg` | `kingogg` | `ckingogg@ocboe.com` |
| `Allison Jimenez-Leal` | `jimenezleal` | `ajimenezleal@ocboe.com` |

**Deduplication before creation:** Staff appear in the CSV multiple times when they work
at multiple schools (same `BadgeNumber`, different `School`/`StaffType` rows). Before
generating a UPN or calling Graph, deduplicate by `BadgeNumber` — take the first row's
name fields and collect all `StaffType` values into an array.

**Placeholder/test accounts to filter out before provisioning:**

| Name | Reason to skip |
|---|---|
| `OC Admin` | Generic admin account |
| `Content Keeper` | Service/filtering account |
| `R Mbroadcast` | Broadcast service account |
| `Substitute Nurse` | Generic placeholder |
| `OCC Demographics` | Data account |
| `User SPED` | Generic placeholder |

---

### Student UPN Pattern

```
{first 3 of first name}{middle initial}{first 4 of last name}@students.ocboe.com
```

**Example:** Amiliah Elizabeth Smith → `ami` + `e` + `smit` = `amiesmit@students.ocboe.com`

**Collision rule:** Same as staff — append `2`, `3`, etc. until a free UPN is found.

**Edge cases from the student CSV:**

| Scenario | Example | Handling |
|---|---|---|
| No middle name | `Laynee Allmon` | Skip middle initial → `lay` + `allm` = `layallm` |
| First name < 3 chars | (hypothetical `Jo`) | Pad with `x` → `jox` |
| Last name < 4 chars | (hypothetical `Li`) | Use what's available, pad with `x` |
| Compound first name field | `"John Brayton"` Johnson | Strip space, slice 3 → `joh` |
| Apostrophe in first name | `K'den` Donnell | Strip → `kde` + initial + `donn` |
| Hyphen in last name | `Franco-Yonushewski` | Strip → `fran` |
| Compound last name with space | `Mora Arriola` | Strip space → `mora` |
| Diacritics | `Yocelin` → `yocelin` | Normalize first, then slice |

---

## Automated Architecture

### Overview

The provisioning job runs every two hours inside the existing backend container via node-cron —
the same code pattern as `SUPERVISOR_SYNC_SCHEDULE`, just on a different schedule. It is a **full SIS reconciliation**, not
just account creation. It handles three cases on every run:

| Case | Action |
|---|---|
| In Synergy CSV, **not** in Entra | **Create** new account via `POST /users` |
| In both Synergy CSV and Entra | **Update** `officeLocation`, `jobTitle`, `department` if changed via `PATCH /users/{id}` |
| In Entra with `ExtensionAttribute1 = Staff/Student`, **not** in CSV | **Disable** account via `PATCH /users/{id}` `accountEnabled: false` |

The update case is what handles school renames like Ridgemont Elementary → Obion County
Middle School on July 1, 2026. When Synergy starts exporting the new school name, the job
detects the mismatch against what is currently in Entra and patches it automatically.

```
[Synergy SIS]
      │  exports every 2 hours
      ▼
[\\10.0.10.83\homes\edupoint\]
  staff.csv
  students.csv
      │  mounted as Docker volume /sis-data/
      ▼
[Backend container — node-cron]
  ProvisioningJob runs at PROVISIONING_SYNC_SCHEDULE
      │
      ├─ Parse + deduplicate + filter CSV
      │
      ├─ UPDATE — CSV record matches existing Entra account (by EmployeeId):
      │    └─ Map School → officeLocation via locationMap
      │    └─ Compare to current Entra values
      │    └─ PATCH /users/{id} only if officeLocation, jobTitle, or department changed
      │    └─ Call UserSyncService.syncUser() to update Tech-V2 DB
      │
      ├─ CREATE — CSV record has no matching Entra account:
      │    └─ Generate UPN (with collision check against Graph)
      │    └─ POST /users to Graph
      │    └─ Add to ENTRA_ALL_STAFF_GROUP_ID / ENTRA_ALL_STUDENTS_GROUP_ID
      │    └─ Call UserSyncService.syncUser() to write to Tech-V2 DB
      │
      ├─ DISABLE — Entra account (ExtensionAttribute1 = Staff/Student) not in CSV:
      │    └─ PATCH /users/{id} with accountEnabled: false
      │    └─ Call UserSyncService.syncUser() to set isActive: false in DB
      │
      └─ Write audit log rows to provisioning_audit table
            │
            ▼
[UpdateCustomExtensionAttributes.ps1 — runs separately on its own schedule]
  Picks up new and updated accounts by EmployeeId match
  Sets CustomAttribute1, CustomAttribute2, etc. via Set-Mailbox
  No changes needed to the existing script
```

### Scheduling

Synergy dumps updated CSVs every two hours. The provisioning job and EXO script both run
on two-hour cycles, offset from each other so that the EXO script runs just before the
next provisioning run. This ensures `extensionAttribute1` is set on any newly created
account before the following provisioning cycle reads from the CSV again.

Example offset pattern (adjust to match your actual Task Scheduler times):
```
PROVISIONING_SYNC_SCHEDULE=0 */2 * * *    # runs at 0:00, 2:00, 4:00 ...
# EXO script runs at :30 past odd hours — set in Windows Task Scheduler separately
```

The maximum gap between account creation and `extensionAttribute1` being set is one
2-hour cycle. During that window the account exists in Entra but is not yet in the
All_Staff or All_Students dynamic group.

---

## Environment Variable Changes

### New variables to add to `.env` and `.env.example`

```bash
# =============================================================================
# PROVISIONING / SIS SYNC
# =============================================================================

# Cron expression for the provisioning job (runs every 2 hours, offset from EXO script).
# OPTIONAL — default: 0 */2 * * * (even hours in TZ timezone)
PROVISIONING_SYNC_SCHEDULE=0 */2 * * *

# Path inside the container where the Synergy CSV share is mounted.
# The share //10.0.10.83/homes/edupoint is mounted at this path via docker-compose.
# REQUIRED for provisioning to run.
SIS_STAFF_CSV=/sis-data/staff.csv
SIS_STUDENT_CSV=/sis-data/students.csv

# SMB share path for the Synergy CSV files.
# Uses the same SMB_USER / SMB_PASS credentials already in .env.
# REQUIRED for provisioning to run.
SIS_SMB_SHARE=//10.0.10.83/homes/edupoint
```

Note: `SMB_USER` and `SMB_PASS` are already in `.env` for the backup share — the same
credentials will be used for the Synergy share since it is on the same server.

### Docker Compose Change

Add a volume mount for the Synergy share in `docker-compose.dev.yml` (and prod compose)
for the backend service, similar to how the backup share is already mounted:

```yaml
volumes:
  - type: cifs
    source: //10.0.10.83/homes/edupoint
    target: /sis-data
    read_only: true          # provisioning only reads these files
    volume:
      nocopy: true
    driver_opts:
      username: "${SMB_USER}"
      password: "${SMB_PASS}"
      vers: "3.0"
```

Setting `read_only: true` is important — the backend only ever reads the CSVs, never writes.

---

## Web Interface: Monitoring & Manual Trigger

Since the process is automated, the web interface shifts from an upload/create tool to a
**monitoring and control dashboard** — useful for checking last night's run, triggering an
ad-hoc sync, or reviewing errors without digging through logs.

**Route:** `/admin/provisioning` (admin-only)

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Last Run                                                   │
│  2026-06-17 03:00 AM  │  Staff: 12 created, 0 failed       │
│                       │  Students: 47 created, 2 failed     │
│                       │  [View Details]                     │
├─────────────────────────────────────────────────────────────┤
│  [Run Staff Now]   [Run Students Now]   [Run Both Now]      │
│  (triggers an immediate provisioning run on demand)         │
├─────────────────────────────────────────────────────────────┤
│  Audit Log                                          [Export]│
│  Date/Time     │ Type    │ UPN                │ Status      │
│  2026-06-17... │ Staff   │ jsmith@ocboe.com   │ ✅ Created  │
│  2026-06-17... │ Student │ amiesmit@stud...   │ ✅ Created  │
│  2026-06-17... │ Student │ ---                │ ❌ Failed   │
│  (paginated, filterable by date / type / status)            │
└─────────────────────────────────────────────────────────────┘
```

The "Run Now" buttons POST to `/api/provisioning/run` with a `{ userType: 'STAFF' | 'STUDENT' | 'ALL' }` body. The backend runs the same job code that the cron calls — no separate code path.

---

## Extension Attributes — Hybrid Tenant Constraint

Because the tenant was formerly hybrid, extension attributes (`CustomAttribute1–15`)
are owned by Exchange Online, not Graph. **Graph cannot write them.**

**No changes needed.** The existing `UpdateCustomExtensionAttributes.ps1` already handles
this. It matches by `EmployeeId` — once Graph creates an account with the correct
`employeeId` stamped on it, the EXO script picks it up on its next run and sets all
the attributes automatically.

---

## ⚠️ School Changes — Action Required Before July 1, 2026

### Ridgemont Elementary → Obion County Middle School (July 1, 2026)

**This is the primary reason the job must be a full reconciliation, not just a create-only tool.**

Effective July 1, 2026, Synergy will begin exporting `"Obion County Middle School"` in
the `School` column for all current Ridgemont Elementary staff and students. On the first
nightly run after that date, the job will detect the mismatch between the Synergy CSV and
the Entra `officeLocation` field and automatically `PATCH` every affected account within the next 2-hour cycle.
`UserSyncService.syncUser()` then pulls the updated value into the Tech-V2 DB.

**Required before July 1:**

1. Add `"Obion County Middle School"` to the `locationMap` in
   `backend/src/services/userSync.service.ts` — without this the new name falls through
   to an unmapped raw string and won't match any `office_locations` record in the database
2. Keep `"Ridgemont Elementary"` in the map as an alias during the transition — any
   accounts not yet patched on the first run will still resolve correctly on subsequent runs
3. The provisioning job must be deployed and running before July 1 or the update step
   will not fire and `officeLocation` will be stale in both Entra and Tech-V2

```typescript
// backend/src/services/userSync.service.ts — additions needed before July 1
'ridgemont elementary': 'Obion County Middle School',
'ridgemont elementary school': 'Obion County Middle School',
'obion county middle school': 'Obion County Middle School',
```

### Closing Schools — No Action Required

`Black Oak Elementary` and `Obion County Special Education Service School` are also
closing next school year. No action is needed:

- Neither school is in the `locationMap` — accounts already fall through to the raw string
- Once closed, they stop appearing in Synergy CSV exports and the issue resolves itself
- Do **not** add them to the location map

---

## Step-by-Step Plan

### Step 1 — Add `User.ReadWrite.All` to the App Registration

1. Navigate to **Entra ID → App registrations → [your app]**
2. **API permissions → Add a permission → Microsoft Graph → Application permissions**
3. Search for and add: **`User.ReadWrite.All`**
4. Click **Grant admin consent** — requires a Global Admin

> **Note:** `User.ReadWrite.All` allows the app to create, read, update, and delete any
> user in the tenant. Guard the client secret carefully.

### Step 2 — Add `.env` Variables and Docker Volume Mount

Add the following to `.env`, `.env.example`, and the backend's env validation.
Add the CIFS volume mount for the Synergy share to `docker-compose.dev.yml`.

| Variable | Purpose | Default | Example |
|---|---|---|---|
| `PROVISIONING_SYNC_SCHEDULE` | Cron expression — runs every 2 hours, offset from EXO script | `0 */2 * * *` | `0 */2 * * *` |
| `SIS_STAFF_CSV` | Path inside container to staff CSV | — | `/sis-data/staff.csv` |
| `SIS_STUDENT_CSV` | Path inside container to student CSV | — | `/sis-data/students.csv` |
| `SIS_SMB_SHARE` | CIFS share path for Docker volume mount | — | `//10.0.10.83/homes/edupoint` |
| `PROVISIONING_REPORT_EMAIL` | Comma-separated recipient(s) for the per-run email report | — | `technology@ocboe.com` |
| `PROVISIONING_TEST_MODE` | When `true`, all Graph writes are skipped (dry run) | **`true`** | `false` |
| `PROVISIONING_DEFAULT_STAFF_PASSWORD` | Bootstrap initial password for staff accounts (seeds DB on first run; change via UI after that) | — | `OcBoe@2026!` |
| `PROVISIONING_DEFAULT_STUDENT_PASSWORD` | Bootstrap initial password for student accounts (seeds DB on first run; change via UI after that) | — | `Student@2026!` |

**Password bootstrap:** On the first provisioning run, if the `provisioning_config` row does not exist, the backend creates it using these env var values. After that the DB row is the source of truth — changing the env var alone has no effect. Use the web UI to update the passwords going forward.

`PROVISIONING_REPORT_EMAIL` — if not set, the report step is silently skipped.

`PROVISIONING_TEST_MODE` — defaults to `true` so the cron job is safe from day one.
Set to `false` only when you are ready to allow real account creation and deprovisioning.
The on-demand API endpoint always accepts a `testMode` body parameter that overrides
the env var for that single run.

### Step 3 — Add the Audit Log Migration

Create `backend/prisma/migrations/<timestamp>_add_provisioning/migration.sql` and
update `schema.prisma`:

```sql
-- Audit log for all provisioning actions
CREATE TABLE "provisioning_audit" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "triggeredBy"  TEXT         NOT NULL,  -- 'cron' or admin UPN
  "userType"     TEXT         NOT NULL,  -- 'STAFF' | 'STUDENT'
  "upn"          TEXT,
  "employeeId"   TEXT,
  "action"       TEXT         NOT NULL,  -- 'CREATED' | 'UPDATED' | 'DISABLED' | 'SKIPPED' | 'FAILED'
                                         -- or 'DRY_RUN_CREATE' | 'DRY_RUN_UPDATE' | 'DRY_RUN_DISABLE'
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "provisioning_audit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "provisioning_audit_createdAt_idx" ON "provisioning_audit"("createdAt" DESC);
CREATE INDEX "provisioning_audit_action_idx"    ON "provisioning_audit"("action");

-- Singleton config row for provisioning settings (passwords, etc.)
-- Populated on first run from env vars; managed via web UI after that.
CREATE TABLE "provisioning_config" (
  "id"                    TEXT         NOT NULL DEFAULT 'singleton',
  "staffPassword"         TEXT         NOT NULL,  -- initial password for new staff accounts
  "studentPassword"       TEXT         NOT NULL,  -- initial password for new student accounts
  "updatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedBy"             TEXT,                   -- UPN of admin who last changed it
  CONSTRAINT "provisioning_config_pkey" PRIMARY KEY ("id")
);
```

> **Note on password storage:** These are temporary initial passwords — every account is
> created with `forceChangePasswordNextSignIn: true`, so the stored value is only ever
> used once per account before the user replaces it. Treat the `provisioning_config` row
> with the same care as other sensitive config (restrict DB access accordingly).

### Step 4 — Implement UPN Generation Utility

`backend/src/utils/upnGenerator.ts`:
- Accepts raw name parts and user type (`STAFF` | `STUDENT`)
- Applies the full normalization pipeline (NFD → strip Mn → lowercase → strip `'`/`-`/spaces)
- Applies the appropriate slicing rule with padding for short names
- Accepts an async `exists(upn: string): Promise<boolean>` callback for collision resolution
- Returns `{ upn: string, mailNickname: string }`

### Step 5 — Add Obion County Middle School to the Location Map ✅ DONE

**Completed 2026-06-17.** In `backend/src/services/userSync.service.ts`, the following
entry was added under a new "Middle Schools" section:

```typescript
// Middle Schools (Ridgemont Elementary becomes OCMS effective 2026-07-01)
'obion county middle school': 'Obion County Middle School',
```

The existing Ridgemont entries continue to map to `'Ridgemont Elementary'` until July 1.
After that date, the provisioning job will PATCH Entra `officeLocation` to
`'Obion County Middle School'` for affected users, and the new map entry will handle
the resolved value on the next `syncUser()` call.

### Step 6 — Implement the Provisioning Service

`backend/src/services/userProvision.service.ts`:
- `parseStaffCSV(filePath)` → reads file, deduplicates by `BadgeNumber`, filters test accounts, returns map keyed by `employeeId`
- `parseStudentCSV(filePath)` → reads file, prepends `s` to Student IDs, returns map keyed by `employeeId`
- `reconcileUser(sisRow, entraUser, triggeredBy, testMode)` → compares mapped `officeLocation`, `jobTitle`, `department` against current Entra values; if `testMode` is false calls `PATCH /users/{id}` only if something changed; always writes audit log and calls `syncUser()` (real or dry-run)
- `provisionUser(sisRow, triggeredBy, testMode, initialPassword)` → generates UPN → if `testMode` is false: `POST /users` with `passwordProfile: { password: initialPassword, forceChangePasswordNextSignIn: true }` → `syncUser()`; always writes audit log
- `disableUser(entraUser, triggeredBy, testMode)` → if `testMode` is false: `PATCH /users/{id}` `accountEnabled: false` → `syncUser()`; always writes audit log
- `runProvisioningJob(userType, triggeredBy, testMode)` → reads `provisioning_config` from DB (seeding from env vars if the row doesn't exist yet), fetches all Entra staff/student accounts, loads CSV, runs three-pass reconciliation (update / create / disable) with bounded concurrency (max 5 parallel); `testMode` defaults to `process.env.PROVISIONING_TEST_MODE !== 'false'`

**Test mode behavior — what changes:**

| Action | Real run | Test / dry run |
|---|---|---|
| Read Synergy CSV | ✅ | ✅ |
| Fetch all Entra accounts | ✅ | ✅ |
| Compare fields, determine what needs changing | ✅ | ✅ |
| `POST /users` (create) | ✅ | ⛔ skipped |
| `PATCH /users/{id}` (update fields) | ✅ | ⛔ skipped |
| `PATCH /users/{id}` (disable) | ✅ | ⛔ skipped |
| `syncUser()` to update Tech-V2 DB | ✅ | ⛔ skipped |
| Write audit log row | `CREATED` / `UPDATED` / `DISABLED` | `DRY_RUN_CREATE` / `DRY_RUN_UPDATE` / `DRY_RUN_DISABLE` |
| Send email report | ✅ | ✅ with `[TEST]` subject prefix and "No changes were made" banner |

The dry-run audit rows give you a permanent record of what each test run would have done,
separate from real operation history, so you can compare runs over time.

> **Group membership note:** The provisioning service never calls `POST /groups/{id}/members`.
> The All_Staff and All_Students groups use **dynamic membership rules** in Entra:
> `extensionAttribute1 eq "Staff"` and `extensionAttribute1 eq "Student"` respectively.
> The existing EXO script (`UpdateCustomExtensionAttributes.ps1`) sets `extensionAttribute1`
> via `Set-Mailbox` after account creation — Entra then picks up the new account automatically
> on its next dynamic group evaluation (typically within minutes). No manual group add needed,
> and no retry logic required.

### Step 7 — Add the Email Report Function

Add `sendProvisioningReport()` to `backend/src/services/email.service.ts`, following the
same non-critical `sendMail()` pattern used by PO workflow notifications.

**Behavior:**
- Called at the end of `runProvisioningJob()` — always, regardless of errors
- If `PROVISIONING_REPORT_EMAIL` is not set, returns immediately (no-op)
- If both the created and deprovisioned lists are empty, no email is sent (quiet night = no noise)
- Failures in this function are caught and logged — never thrown

**Signature:**

```typescript
export async function sendProvisioningReport(result: {
  created:       Array<{ displayName: string; upn: string; school: string; userType: 'STAFF' | 'STUDENT' }>;
  deprovisioned: Array<{ displayName: string; upn: string; school: string; userType: 'STAFF' | 'STUDENT' }>;
  updated:       number;
  errors:        number;
  durationMs:    number;
  triggeredBy:   string;
  testMode:      boolean;
}): Promise<void>
```

**Email content — three sections:**

| Section | Content |
|---|---|
| **Test mode banner** | Prominent notice (only shown when `testMode: true`): "This was a dry run — no accounts were created or deprovisioned." |
| **Accounts Created** | Table: Display Name, UPN, School, Type — one row per user; "None" if empty. Header says "Would Be Created" in test mode. |
| **Accounts Deprovisioned** | Table: Display Name, UPN, Last Known School, Type — one row per user; "None" if empty. Header says "Would Be Deprovisioned" in test mode. |
| **Summary** | Updated (no detail needed), Errors (count), Run duration, Triggered by |

**Subject line:**
- Real run: `[SchoolWorks] Provisioning Report — {date} — {N} created, {N} deprovisioned`
- Test run: `[TEST] [SchoolWorks] Provisioning Report — {date} — {N} would be created, {N} would be deprovisioned`

The recipient list is `PROVISIONING_REPORT_EMAIL` split on commas, trimmed.
All user-supplied strings in the HTML body must pass through `escapeHtml()`.

### Step 8 — Register the Cron Job

In the backend's cron registration module (wherever `SUPERVISOR_SYNC_SCHEDULE` is wired up),
add a new job for `PROVISIONING_SYNC_SCHEDULE` that calls `runProvisioningJob('ALL', 'cron')`.

### Step 9 — Wire Up the On-Demand API

- `backend/src/routes/provisioning.routes.ts`
- `backend/src/controllers/provisioning.controller.ts`
  - `POST /api/provisioning/run` → body: `{ userType?: 'STAFF' | 'STUDENT' | 'ALL', testMode?: boolean }` → calls `runProvisioningJob` (admin only); `testMode` in the body overrides the env var for this single run
  - `GET /api/provisioning/audit` → paginated audit log query (admin only); accepts `?testMode=true/false` filter to show only real or dry-run rows
  - `GET /api/provisioning/config` → returns current config (admin only); **never returns the raw password values** — returns masked strings (`••••••••`) so the UI can show that passwords are set without exposing them
  - `PATCH /api/provisioning/config` → body: `{ staffPassword?: string, studentPassword?: string }` → updates the `provisioning_config` row; validates that the new password meets Entra complexity requirements (min 8 chars, 3 of 4: uppercase, lowercase, digit, symbol) before saving (admin only)

### Step 10 — Build the Frontend Dashboard

New page at `frontend/src/pages/Provisioning/`:
- Last run summary card — created / updated / disabled / failed counts; badge shows "TEST RUN" or "LIVE RUN"
- "Run Now" button group: **Test Run** (always safe) and **Live Run** (requires confirmation dialog before firing)
- Live Run button is disabled with a tooltip when `PROVISIONING_TEST_MODE=true` is still active server-side, so it's impossible to accidentally trigger a live run while test mode is on
- Audit log filter toggle: **All** / **Live only** / **Test only** — so test history doesn't obscure real history
- Paginated, filterable audit log table (MUI DataGrid) — filterable by action (CREATED / UPDATED / DISABLED / DRY_RUN_CREATE / DRY_RUN_DISABLE / FAILED)
- Error details expandable per failed row
- Note: "Report sent to [PROVISIONING_REPORT_EMAIL]" shown on last run summary if email is configured
- **Settings panel** — collapsible section (or separate Settings tab) on the dashboard:
  - **Staff initial password** — password input field showing masked value; Save button; real-time complexity validation (min 8 chars, uppercase, lowercase, digit, symbol)
  - **Student initial password** — same as above; separate field since students and staff may use different patterns
  - Both fields display last-updated timestamp and the UPN of whoever last changed them
  - Saving calls `PATCH /api/provisioning/config`; the API never echoes the stored value back, so the field reverts to a blank masked placeholder after save (enter a new value only when changing it)

---

## Permissions Summary

| Permission | Type | Purpose | Already Granted? |
|---|---|---|---|
| `User.Read` | Delegated | Signed-in user reads own profile | Yes |
| `User.ReadBasic.All` | Delegated | Read basic profile of other users | Yes |
| `GroupMember.Read.All` | Delegated | Read group memberships (sign-in flow) | Yes |
| `https://graph.microsoft.com/.default` | Application (client credentials) | All app permissions | Yes |
| `User.ReadWrite.All` | **Application** | **Create/update users — ADD THIS** | **No** |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **July 1 deadline missed** — locationMap not updated before Ridgemont rename | Add a calendar reminder; Step 5 is a 30-minute change that must ship before July 1 regardless of whether the full provisioning job is ready |
| `User.ReadWrite.All` allows deleting any user | Scope service code to create, update, and disable only; never expose a hard-delete endpoint |
| Update step patches a field incorrectly due to bad CSV data | Log both the old and new values in the audit table for every PATCH so changes are reviewable; the next run (within 2 hours) will self-correct if the CSV is fixed |
| SMB share unavailable at run time | Wrap file read in try/catch; log the failure and abort the run cleanly rather than crashing the container |
| Diacritic normalization misses a character | Log the raw name alongside the generated UPN in the audit table so mismatches are detectable |
| UPN collision detection makes N Graph calls per run | Cache all existing `@ocboe.com` and `@students.ocboe.com` UPNs at job start; check against the in-memory cache instead of hitting Graph per user |
| Extension attributes not set until next EXO script run | Acceptable — the delay is at most one 2-hour cycle given the offset scheduling; note this in the admin dashboard |
| Placeholder/test accounts get provisioned | Maintain the filter list in a config constant; log a warning when a filtered account is skipped |
| Staff duplicate rows cause duplicate creation attempts | Deduplication by `BadgeNumber` is mandatory in the parse step; fail loudly if `BadgeNumber` is blank |
| Password complexity failures | Generate passwords programmatically: min 12 chars, 1 upper, 1 lower, 1 digit, 1 symbol |
| New account not in All_Staff/All_Students immediately after creation | Expected — the EXO script sets `extensionAttribute1` on its next run (within one 2-hour cycle), after which Entra's dynamic group rule picks up the account automatically (typically within minutes of the attribute being set) |
| Rate limiting / throttling | Max 5 concurrent Graph calls; respect `Retry-After` on `429` responses |
| CIFS volume mount fails on container start | Add a startup log that confirms the mount is readable before the first cron tick |

---

## Effort Estimate

| Task | Effort | Deadline |
|---|---|---|
| Add `User.ReadWrite.All` permission + admin consent | 15 min | Before go-live |
| ~~Add Obion County Middle School to locationMap~~ ✅ Done | ~~30 min~~ | ~~Before July 1, 2026~~ |
| `.env` variables + `.env.example` update + Docker volume mount | 1 hour | Before go-live |
| Prisma schema + migration for audit log + provisioning_config | 1 hour | Before go-live |
| UPN generation utility + edge case coverage | 2–3 hours | Before go-live |
| Provisioning service (parse → update → create → disable → audit → sync) | 4–5 hours | Before go-live |
| Email report function (`sendProvisioningReport`) | 1 hour | Before go-live |
| Cron job registration | 30 min | Before go-live |
| On-demand API route + controller + config endpoints | 1.5 hours | Before go-live |
| Frontend monitoring dashboard + password settings panel | 3–5 hours | Before go-live |
| **Total** | **~14–18 hours** |

---

## Sources

- [Create User — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/user-post-users?view=graph-rest-1.0)
- [Working with users in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/users?view=graph-rest-1.0)
- [user: assignLicense — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/user-assignlicense?view=graph-rest-1.0)
- [Get access without a user (client credentials flow)](https://learn.microsoft.com/en-us/graph/auth-v2-service)
- [Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
- [OAuth 2.0 client credentials flow on the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow)
- [Why extension attributes can't be updated on former hybrid users — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1850101/why-is-it-not-possible-to-update-extension-attribu)
- [onPremisesExtensionAttributes resource type — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/onpremisesextensionattributes?view=graph-rest-1.0)

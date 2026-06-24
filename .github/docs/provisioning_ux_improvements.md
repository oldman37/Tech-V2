# Provisioning Page — UX Improvement Ideas

Current state: the page has five cards (Run Job, Pending Disables, Passwords,
Domains, Audit Log). Several important settings still live only in `.env` and
require a redeploy to change. This doc captures ideas for making the page
self-service for day-to-day administration.

---

## 1. Tenant Switcher (your idea)

**Problem:** The test tenant vs. production tenant is fixed in `.env`. Switching
requires editing the file and redeploying the backend.

**Proposal:** Add a "Target Tenant" toggle to the Run Job card — or its own card
— with two options:

- **Production** — uses `ENTRA_*` credentials from `.env`
- **Test** — uses `PROVISIONING_TENANT_ID/CLIENT_ID/CLIENT_SECRET` from `.env`

The credentials themselves stay in `.env` (they are secrets). The *selection*
(which set to use) is stored in the DB config row and readable/writable through
the existing `/provisioning/config` endpoint.

**UI:** A `ToggleButtonGroup` ("Production | Test") next to the existing "Target
tenant: …" caption. When Test is active, show an amber chip "USING TEST TENANT"
in the page header so it is never ambiguous.

**Safety:** Switching to Production while Test Mode is OFF should trigger the
same confirmation dialog as running live — both conditions must be met for a
destructive run.

**Backend work:** Add a `targetTenant` column (`'PRODUCTION' | 'TEST'`) to
`provisioning_config`. The service reads it instead of checking env-var presence
at call time.

---

## 2. Schedule Editor (your idea)

**Problem:** `PROVISIONING_SYNC_SCHEDULE` is a raw cron expression in `.env`.
Changing it requires a redeploy.

**Proposal:** A "Sync Schedule" card with a friendly preset dropdown plus an
optional custom cron input:

| Label | Cron |
|---|---|
| Every hour | `0 * * * *` |
| Every 2 hours (default) | `0 */2 * * *` |
| Every 4 hours | `0 */4 * * *` |
| Twice daily (6 AM & 6 PM) | `0 6,18 * * *` |
| Once daily at 2 AM | `0 2 * * *` |
| Custom… | (shows text input) |

Below the selector, display:
- A human-readable translation of the selected schedule: *"Runs every 2 hours"*
- **Next scheduled run:** `Today at 4:00 PM` (computed server-side)
- **Last completed run:** timestamp + outcome chips (N created · N disabled · N errors)

**Backend work:** Add a `syncSchedule` column to `provisioning_config`. The cron
job service reads this value from the DB at startup and whenever it changes,
replacing the env-var-driven schedule. The env var becomes the bootstrap default
only.

---

## 3. Disable Threshold — Move to UI

**Problem:** `PROVISIONING_DISABLE_THRESHOLD=50` is in `.env`. Changing it
requires a redeploy.

**Proposal:** Add a number field to a "Safety Settings" card:

- **Bulk-disable threshold:** `[50]` accounts — *"If more than this many accounts
  would be disabled in a single run, the job pauses and waits for admin approval."*
- Show a note: *"Set to 0 to disable the safeguard (not recommended)."*

This is already stored-implicitly (read from env at runtime). Moving it to the
DB config row means one PATCH to the config endpoint saves it.

---

## 4. Notification Email Lists — Move to UI

**Problem:** `PROVISIONING_ADMIN_EMAIL` and `PROVISIONING_REPORT_EMAIL` are in
`.env`. Adding or removing a recipient requires a redeploy.

**Proposal:** A "Notifications" card with two tag/chip inputs:

- **Run report recipients** — who receives the per-run created/disabled summary
  email. Default: `technology@ocboe.com`.
- **Disable alert recipients** — who receives the hold-for-approval alert email.
  Default: same or different list.

Each field is a comma-separated email list rendered as MUI chips (add by typing
and pressing Enter, remove by clicking ×). Stored in the DB config row as two
text columns.

---

## 5. Active Tenant Status Banner

**Problem:** The current tenant indicator is a small caption line that is easy to
miss. A live-mode run against production with the wrong tenant would be bad.

**Proposal:** A persistent status bar at the top of the page (below the page
title) that shows:

```
[PRODUCTION TENANT]  [LIVE MODE]  Next run: Today 4:00 PM
```
or
```
[TEST TENANT]  [TEST MODE — no writes]  Next run: Today 4:00 PM
```

Color-coded: amber for test tenant, red for production + live mode, green for
test mode regardless of tenant.

---

## 6. Last Run Summary Widget

**Problem:** To see the outcome of the last run you have to scroll the audit log
and mentally aggregate rows.

**Proposal:** A small summary row at the top of the Run Job card (or its own
mini-card) showing the most recent completed run:

```
Last run: Jun 17 at 2:00 AM · STAFF+STUDENT · LIVE
Created 3 · Disabled 1 · Updated 47 · 0 errors · 214s
```

Fetched from a new lightweight `GET /provisioning/last-run` endpoint that returns
the most recent `provisioning_audit` run-header row (or aggregated from the
existing audit table using the `triggeredBy` + timestamp grouping already there).

---

## 7. Disable Batch History

**Problem:** The Pending Disables card only shows `status = PENDING`. Once a
batch is approved or rejected it disappears. There is no way to see what was
previously held.

**Proposal:** Add a "Batch History" section below the pending card — a collapsed
table of the last 10 resolved batches showing: date, user type, count,
who triggered it, who resolved it, and the outcome (APPROVED/REJECTED). Useful
for audit trail and spotting patterns (e.g., the threshold fires every Monday
because of weekend roster changes).

---

## 8. Test-Run Before Live Confirmation

**Problem:** The live-run confirmation dialog warns the user but doesn't show
what will actually change. A nervous admin has no way to preview impact without
running a separate test run first.

**Proposal:** Change the live-run confirmation flow to a two-step process:

1. User clicks **Run Now** with Test Mode OFF.
2. Dialog opens: *"Run a preview first?"* with two buttons:
   - **Preview (test run)** — runs the job in test mode and shows the result
     inside the dialog before the user commits.
   - **Skip preview and run live** — existing behavior.
3. After a preview result is shown inside the dialog, the **Run Live** button
   activates.

This makes the safe path (preview → confirm) the natural flow, while still
allowing a direct live run for experienced users.

---

## 9. Scheduled Run — Skip Next / Pause All

**Problem:** There is no way to prevent the cron job from running at its next
scheduled time without editing `.env`. Useful when a CSV file is known to be
stale or during a data migration.

**Proposal:** Two controls in the Schedule card:

- **Skip next run** — sets a `skipNextRun: true` flag in the DB. The cron job
  checks this flag before executing and clears it after skipping. Shows a badge:
  *"Next scheduled run will be skipped."*
- **Pause sync** — sets `syncPaused: true`. All scheduled runs are skipped until
  unpaused. Shows a prominent amber banner on the page: *"Scheduled sync is
  paused."*

---

## 10. Cron Expression Human-Readable Preview

**Problem:** Raw cron expressions (`0 */2 * * *`) are not self-explanatory to
non-technical admins.

**Proposal:** Wherever a cron expression is displayed or edited, show a plain-
English translation beneath it. Either compute this client-side with a small
library (`cronstrue`) or from a backend utility. Example:

```
0 */2 * * *  →  "Every 2 hours"
0 2 * * 1    →  "At 2:00 AM, only on Monday"
```

If using a custom input, validate the expression and show an error if it is
malformed before allowing save.

---

## 11. Per-School Provisioning Stats (Audit Log Enhancement)

**Problem:** The audit log is a flat table. There is no way to quickly see which
school had the most new accounts or the most disables.

**Proposal:** Add a collapsible "Stats" section above the audit log table with a
small summary for the most recent real run: accounts created/disabled/updated
broken down by `officeLocation` (school). Useful for catching data issues (e.g.,
an entire school's worth of students disappeared from the CSV).

---

## Priority Ranking

| # | Idea | Effort | Value |
|---|---|---|---|
| 1 | Tenant Switcher | Medium | High — eliminates a common redeploy |
| 2 | Schedule Editor | Medium | High — most-requested config pain point |
| 3 | Disable Threshold in UI | Low | High — removes a redeploy for tuning |
| 4 | Notification Emails in UI | Low | High — removes a redeploy for email changes |
| 5 | Active Tenant Banner | Low | Medium — safety / visibility |
| 6 | Last Run Summary | Low | Medium — reduces audit-log diving |
| 7 | Batch History | Low | Medium — audit trail completeness |
| 8 | Preview before Live | Medium | Medium — reduces anxiety for new admins |
| 9 | Skip / Pause Schedule | Low | Medium — operational flexibility |
| 10 | Cron Human-Readable | Low | Low — nice-to-have polish |
| 11 | Per-School Stats | High | Low — useful but rarely needed |

---

## What Should Stay in `.env`

These should **never** move to the UI because they are secrets or bootstrap
values that must exist before the backend can start:

- `PROVISIONING_TENANT_ID / CLIENT_ID / CLIENT_SECRET` — OAuth secrets
- `PROVISIONING_STAFF_GROUP_ID / STUDENT_GROUP_ID` — Entra object IDs
- `ENTRA_ALL_STAFF_GROUP_ID / ENTRA_ALL_STUDENTS_GROUP_ID` — same
- `PROVISIONING_TEST_MODE` — env-level default (can be overridden in UI, but the
  env var acts as a hard floor when `true`: the service ignores a DB `false` if
  the env var is `true`, preventing accidental live runs on a test deployment)

# Provisioning UX Items 1–4 — Spec

**Feature name:** provisioning_ux_items_1to4  
**Date:** 2026-06-17  
**Items covered:** Tenant Switcher (#1), Schedule Editor (#2), Disable Threshold in UI (#3), Notification Emails in UI (#4)

---

## Current State Analysis

- `ProvisioningConfig` (singleton row) stores: passwords, UPN domains. All new settings are env-var only.
- `buildProvisioningGraphClient()` selects tenant by checking env-var presence — no DB override.
- `DISABLE_THRESHOLD` read from `process.env.PROVISIONING_DISABLE_THRESHOLD` at runtime.
- `PROVISIONING_REPORT_EMAIL` / `PROVISIONING_ADMIN_EMAIL` read from env vars in email functions.
- Provisioning cron (`cronJobsService.scheduleProvisioningSync()`) is **dead** — `cronJobsService.start()` is never called from `server.ts`. Only `schedulerService.start()` runs at startup, and it does not include `provisioning-sync`.
- `schedulerService` already supports dynamic schedule hot-swap via `updateSchedule()` and persists to `job_schedules` table.

---

## Problem Definition

Four settings require a container redeploy to change:
1. Which Entra tenant to target (test vs production)
2. How often the cron runs
3. The bulk-disable safety threshold
4. Who receives notification emails

---

## Proposed Solution Architecture

### Single DB migration

Adds 4 columns to `provisioning_config` and seeds the `provisioning-sync` job schedule:

```sql
ALTER TABLE "provisioning_config"
  ADD COLUMN "targetTenant"     TEXT    NOT NULL DEFAULT 'TEST',
  ADD COLUMN "disableThreshold" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "reportEmails"     TEXT,
  ADD COLUMN "adminEmails"      TEXT;

INSERT INTO "job_schedules" ("id","jobKey","cronExpr","enabled","nextRunAt","updatedAt","createdAt")
VALUES (
  'provisioning-sync-default-seed',
  'provisioning-sync',
  '0 */2 * * *',
  true,
  CURRENT_TIMESTAMP + INTERVAL '2 hours',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("jobKey") DO NOTHING;
```

### Item 1 — Tenant Switcher

- `targetTenant TEXT NOT NULL DEFAULT 'TEST'` column on `provisioning_config`
- `buildProvisioningGraphClient(targetTenant: 'PRODUCTION' | 'TEST' = 'TEST')` — chooses credentials based on param, not env-var presence alone
- `runProvisioningJob` reads `targetTenant` from DB config and passes to `buildProvisioningGraphClient`
- `getProvisioningDomains` and `applyDisableBatch` also use DB `targetTenant`
- Frontend: `ToggleButtonGroup` ("Production | Test") in `RunJobCard` + amber "USING TEST TENANT" chip in header when Test active; same confirmation dialog when switching to Production + Live

### Item 2 — Schedule Editor

- Schedule stored in `job_schedules` (jobKey `'provisioning-sync'`) — NOT in `provisioning_config`
- Fix the dead cron: add `'provisioning-sync'` to `schedulerService` `JobKey` + `DEFAULT_CRON` + `dispatch()`. The dispatch handler calls `runProvisioningJob('ALL', 'cron')` + `sendProvisioningReport(result, reportEmailsFromDb)`
- The migration seeds the initial `job_schedules` row so it starts running on next container restart
- `getConfig` response adds `syncSchedule`, `syncEnabled`, `nextRunAt` by reading from `job_schedules`
- `updateConfig` with `syncSchedule` / `syncEnabled` calls `schedulerService.updateSchedule('provisioning-sync', ...)` in addition to persisting the config row
- Frontend: preset dropdown (5 presets + Custom), custom cron TextField (shown when Custom selected), next-run display label. Human-readable label computed from the preset selection (no external library needed). Saved via existing PATCH `/api/provisioning/config`

### Item 3 — Disable Threshold in UI

- `disableThreshold INT NOT NULL DEFAULT 50` column on `provisioning_config`
- `getOrSeedConfig()` returns `disableThreshold`; PASS 3 uses `config.disableThreshold` instead of env var
- `getConfig` returns `disableThreshold`; `updateConfig` saves it
- Frontend: number TextField (`min=0 max=1000`) in new `SafetySettingsCard`

### Item 4 — Notification Emails in UI

- `reportEmails TEXT` (nullable) and `adminEmails TEXT` (nullable) columns on `provisioning_config` — comma-separated, mirrors env-var format
- `sendProvisioningReport(result, recipientOverride?: string[])` — uses override if provided, falls back to env var
- `sendProvisioningDisableAlert(params, recipientOverride?: string[])` — same pattern
- Callers that have config: pass parsed array; callers without config: pass nothing (env var used)
- `getOrSeedConfig()` returns `adminEmails` (parsed); `runForType` passes to `sendProvisioningDisableAlert`
- `scheduler.service.ts` dispatch reads config for `reportEmails` and passes to `sendProvisioningReport`
- Frontend: comma-separated `TextField` with live chip preview (split on comma) in `SafetySettingsCard`

---

## Implementation Steps

1. **`backend/prisma/schema.prisma`** — add 4 columns to `ProvisioningConfig`
2. **`backend/prisma/migrations/<ts>_add_provisioning_config_settings/migration.sql`** — ALTER TABLE + INSERT seed
3. **`backend/src/validators/provisioning.validators.ts`** — extend `UpdateProvisioningConfigSchema` with all new fields + update `.refine()`
4. **`backend/src/services/email.service.ts`** — add optional `recipientOverride` param to both provisioning email functions
5. **`backend/src/services/userProvision.service.ts`**:
   - `buildProvisioningGraphClient(targetTenant?)` — accept param
   - `getOrSeedConfig()` — return new fields
   - `runProvisioningJob` — read targetTenant + pass to buildProvisioningGraphClient
   - `runForType` — use `config.disableThreshold` + pass `config.adminEmails` to alert function
   - `getProvisioningDomains` + `applyDisableBatch` — read targetTenant from DB
6. **`backend/src/services/scheduler.service.ts`** — add `'provisioning-sync'` to JobKey, VALID_JOB_KEYS, DEFAULT_CRON, dispatch; import runProvisioningJob + sendProvisioningReport
7. **`backend/src/controllers/provisioning.controller.ts`** — `getConfig` returns new fields + schedule; `updateConfig` persists new fields + calls `schedulerService.updateSchedule` when schedule changes
8. **`frontend/src/services/provisioningService.ts`** — add new fields to `ProvisioningConfig` and `UpdateProvisioningConfigInput`
9. **`frontend/src/pages/admin/ProvisioningPage.tsx`** — add `TenantSwitcherCard`, `SafetySettingsCard`, `ScheduleEditorCard` components

---

## Schedule Presets (frontend)

| Label | Cron |
|---|---|
| Every hour | `0 * * * *` |
| Every 2 hours (default) | `0 */2 * * *` |
| Every 4 hours | `0 */4 * * *` |
| Once daily at 2 AM | `0 2 * * *` |
| Custom… | text input |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Switching to Production tenant while live mode is OFF causes a surprise live run | Tenant switcher confirmation mirrors the live-run dialog |
| Cron schedule seeded in migration might already exist from a previous manual insert | `ON CONFLICT ("jobKey") DO NOTHING` |
| `adminEmails` / `reportEmails` null on old rows → falls back to env var | Env var fallback preserved in email functions |
| Dynamic rescheduling fails if `schedulerService` hasn't registered 'provisioning-sync' yet | Seed migration ensures the DB row exists; `schedulerService.start()` registers it on startup |
| `cronJobsService` is imported but its supervisor/cleanup crons are also not running | Out of scope — noted in summary; do NOT delete or touch cronJobsService |

---

## Build Commands

- Backend: `docker compose -f docker-compose.dev.yml build backend`
- Frontend: `docker compose -f docker-compose.dev.yml build frontend`
- Preflight: `scripts/preflight.ps1`

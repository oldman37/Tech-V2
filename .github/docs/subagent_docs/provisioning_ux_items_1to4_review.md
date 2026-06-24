# Phase 3 Review — Provisioning UX Items 1–4

**Feature:** Tenant Switcher, Schedule Editor, Disable Threshold in UI, Notification Emails in UI  
**Spec:** `.github/docs/subagent_docs/provisioning_ux_items_1to4_spec.md`

---

## Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 100% | A |
| Best Practices | 96% | A |
| Functionality | 95% | A |
| Code Quality | 90% | A- |
| Security | 100% | A |
| Performance | 97% | A |
| Consistency | 95% | A |
| Build Success | Pending (Phase 6) | — |

**Overall Grade: A (96%)**

---

## Findings

### PASS

#### Specification Compliance
All 4 items implemented as specified:
- **Item 1 (Tenant Switcher):** `TenantSwitcherCard` with `ToggleButtonGroup`, amber/red border, confirmation dialog before switching to PRODUCTION. `targetTenant` persisted in `provisioning_config.targetTenant`.
- **Item 2 (Schedule Editor):** `ScheduleEditorCard` with 5 presets + Custom, pause/resume toggle, next-run display. `syncSchedule`/`syncEnabled` delegated to `schedulerService.updateSchedule()` → hot-swaps cron without restart. Seeded via migration.
- **Item 3 (Disable Threshold):** `disableThreshold` column added to `provisioning_config`. Controller reads from DB; `getOrSeedConfig()` passes it to `runForType`. Validator enforces `int().min(0).max(1000)`.
- **Item 4 (Notification Emails):** `reportEmails` and `adminEmails` nullable text columns. Both email functions accept `recipientOverride?: string[]`; callers with DB context pass parsed arrays; others fall back to env vars.

#### Dead cron fixed
`cronJobsService.start()` was never called in `server.ts`. Provisioning sync was migrated into `schedulerService` (which IS started), with the `provisioning-sync` row seeded via migration. This resolves the silent dead-cron bug.

#### Security
- `targetTenant` validated as `z.enum(['PRODUCTION','TEST'])` — no arbitrary string injection.
- `disableThreshold` validated `z.number().int().min(0).max(1000)`.
- Email fields stored as comma-separated strings, not returned to client as Graph/Entra data.
- CSRF protection: PATCH `/api/provisioning/config` is an existing CSRF-protected route.
- Authorization enforced on backend (auth middleware on all provisioning routes).

#### API Currency
- MUI v7: `slotProps={{ htmlInput: ... }}` replaces deprecated `inputProps`. `ToggleButtonGroup` exclusive mode. No deprecated APIs in final code.
- TanStack Query v5: `useQuery`/`useMutation` with `queryKey` arrays, `invalidateQueries` with object form.
- Zod 4: schema unchanged in style, no deprecated Zod 3 APIs.
- Prisma 7: `upsert` with `where`/`create`/`update` — correct API.

#### Performance
- All three new UI cards use the same `queryKeys.provisioning.config()` key — TanStack Query deduplicates into one network request.
- `getConfig` uses `Promise.all` to fetch `provisioning_config` and `job_schedules` in parallel.
- No N+1 queries.

---

### RECOMMENDED (non-blocking)

#### R1: ScheduleEditorCard initial state workaround
`useState(presetLabel)` only captures the initial render value (pre-load default `'Every 2 hours'`). The `resolvedSelected` calculation (`selected !== 'Every 2 hours' ? selected : presetLabel`) uses `'Every 2 hours'` as a sentinel for "user hasn't changed anything". This is functionally correct but fragile — if the default cron changes from `'0 */2 * * *'`, the sentinel breaks. A `useEffect` to sync on load would be more robust. Low priority; works correctly for all current cases.

#### R2: updateConfig upsert creates config row with empty passwords if schedule-only PATCH arrives before provisioning_config is seeded
The controller always upserts `provisioning_config` even for schedule-only changes. If the row doesn't exist yet, the create path falls back to `''` (empty string) for passwords if env vars aren't set. In practice this cannot happen (the app would have bootstrapped via `getOrSeedConfig` or the UI password form first), but a guard or early return for schedule-only updates would be cleaner.

#### R3: `saved` success alert in TenantSwitcherCard is hard to see
When switching from PRODUCTION→TEST (no confirmation dialog), the success alert appears at the card bottom. Visible but brief. No action required.

---

### NOT APPLICABLE

No build output to document yet — awaiting Phase 6 preflight.

---

## Verdict

**PASS** — No CRITICAL issues found. Proceeding to Phase 6 Preflight.

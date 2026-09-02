# Provisioning Audit Noise & Run-Status Visibility — Spec

**Date:** 2026-09-02
**Trigger:** User investigated a missing "student provisioning" report email. Root cause turned
out to be correct-by-design behavior (a fully quiet run sends no email — see
`sendProvisioningReport`, unchanged by this spec). While diagnosing, three real UX gaps were
found on `frontend/src/pages/admin/ProvisioningPage.tsx` that make it hard to tell "ran fine,
nothing to do" apart from "didn't run" / "broke". This spec covers those three.
**Type:** Feature / UX fix. No new dependencies (all changes use patterns — Prisma, MUI, TanStack
Query — already used elsewhere in this file), so the Dependency & Documentation Policy research
step is not required per CLAUDE.md's exemption list.
**No Prisma schema changes** — `ProvisioningAudit` gets fewer rows, not new columns;
`JobSchedule.lastRunResult` is already `Json?`, so adding a new key needs no migration.

---

## 1. Current State Analysis

### 1.1 Audit log noise
`backend/src/services/userProvision.service.ts:737-740` — inside the UPDATE pass, every
matched account whose computed patch is empty (i.e. nothing changed) writes its own
`ProvisioningAudit` row with `action: 'SKIPPED'`:

```ts
if (Object.keys(patch).length === 0) {
  await writeAudit({ triggeredBy, userType: type, upn: entraUser.userPrincipalName, employeeId: empId, action: 'SKIPPED' });
  return;
}
```

For a full student roster running every ~2 hours, this is the overwhelming majority of all
audit rows ever written. The cleanup cron (`scheduler.service.ts:246-253`,
`provisioning-audit-cleanup`, weekly) only prunes rows older than **730 days**, so these
accumulate for up to two years before pruning. On the admin page's Audit Log
(`ProvisioningPage.tsx:1610-1856`), `SKIPPED` rows dominate the default ("All") view and push
`CREATED`/`UPDATED`/`FAILED` rows across many pages.

### 1.2 No visible "ran successfully" signal on quiet runs
`SplitScheduleRow` (`ProvisioningPage.tsx:447-597`) already fetches each split job's full
`lastRunResult` via `useJobSchedules()` (`frontend/src/hooks/queries/useJobSchedules.ts`, backed
by `GET /api/admin/jobs/schedules` → `schedulerService.getSchedules()`, which already returns
`lastRunResult: Record<string, unknown> | null` per job — no backend gap here). But the row only
renders `lastRunAt` and a bare `FAILED` flag (`:581-586`):

```tsx
{schedule?.lastRunAt && (
  <Typography variant="caption" color={schedule.lastRunStatus === 'error' ? 'error.main' : 'text.secondary'}>
    Last run: {new Date(schedule.lastRunAt).toLocaleString()}
    {schedule.lastRunStatus === 'error' ? ' · FAILED' : ''}
  </Typography>
)}
```

The counts (`created`/`updated`/`errors`/etc.) that are already in `schedule.lastRunResult` are
never shown, so a fully-quiet successful run (`errors: 0`, all counts `0`) looks identical to "no
info available" — exactly the ambiguity that caused today's confusion.

### 1.3 Stale/misleading top-of-page status banner
`StatusBanner` (`ProvisioningPage.tsx:124-179`) reads `GET /api/provisioning/status` →
`getStatus` (`provisioning.controller.ts:285-318`), which queries **only** the legacy combined
`provisioning-sync` `JobSchedule` row — not `provisioning-sync-staff` /
`provisioning-sync-students`. On this deployment (and generally, once an admin uses the Split
Schedule card to run staff/students independently) the combined job is disabled and effectively
never runs, so:
- The `syncEnabled` chip can say "Sync Disabled" while both split schedules are actually enabled
  and running.
- The `Last run: … · N created · N errors` caption reflects a stale/irrelevant job, not the
  jobs actually doing the work.

This is the same class of bug as 1.2, one level up: the page has an authoritative per-job
answer (fixed by 1.2) and a summary banner that doesn't use it.

---

## 2. Problem Definition

1. The Audit Log is unusable as a change-history view because unchanged-account rows vastly
   outnumber meaningful ones, and those rows serve little purpose (they exist only as
   "confirmed checked, no change" — a narrow diagnostic case with no current UI for it anyway).
2. The Split Schedule cards can't answer "did the students run succeed today?" without leaving
   the page to check logs/DB — despite already having the data client-side.
3. The top status banner gives a global enabled/last-run signal that no longer matches how this
   deployment actually runs provisioning (split per type), and duplicates/conflicts with the
   split-schedule cards below it once those are fixed.

---

## 3. Proposed Solution

### 3.1 Stop writing per-account `SKIPPED` audit rows; count them instead

- `ProvisioningResult` (`userProvision.service.ts:64-75`): add `skipped: number`.
- `runProvisioningJob` (`:564-567`): initialize `skipped: 0` in the result object.
- Replace the `writeAudit(...action:'SKIPPED')` call (`:738`) with `result.skipped++` (no DB
  write). `result` is already threaded by reference into `runForType` and its closures, so this
  requires no new plumbing.
- Leave `CREATE_SKIPPED_DUPLICATE` (`:797-800`) untouched — that's a rare, meaningful safety
  event (a duplicate-account collision), not noise, and stays a real audit row.
- Plumb the new count through everywhere the existing counts already flow, so it's visible
  rather than silently discarded:
  - `provisioning.controller.ts` `runProvisioning` (`:55-66` HTTP response, `:34-42`
    `runResultJson` persisted to `JobSchedule.lastRunResult`): add `skipped: result.skipped`.
  - `scheduler.service.ts` — the three `dispatch` cases for `provisioning-sync`,
    `provisioning-sync-staff`, `provisioning-sync-students` (`:295-345`) each build a return
    object from `result`: add `skipped: result.skipped` to each.
  - Frontend `RunProvisioningResult` (`frontend/src/services/provisioningService.ts:12-23`): add
    `skipped: number`.
  - `RunJobCard`'s result `Alert` (`ProvisioningPage.tsx:939-946`): add `· Unchanged
    {lastResult.skipped}` to the summary line.
- No change to `sendProvisioningReport`'s quiet-run suppression check
  (`email.service.ts:1806-1814`) — `skipped` is intentionally not one of the gating fields, so
  email behavior is unaffected (per prior decision: no email changes in this pass).

### 3.2 Show real run status on the Split Schedule cards

In `SplitScheduleRow` (`ProvisioningPage.tsx`), replace the bare last-run caption with a status
line built from `schedule.lastRunResult`, mirroring the logic already in `StatusBanner`
(`:146-155`) but per split job:

```tsx
{schedule?.lastRunAt && (() => {
  const r = schedule.lastRunResult as Record<string, unknown> | null;
  const failed = schedule.lastRunStatus === 'error';
  const summary = !failed && r
    ? `${r.created ?? 0} created · ${r.updated ?? 0} updated · ${r.deprovisioned ?? 0} deprovisioned · ${r.errors ?? 0} errors`
    : null;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Chip
        label={failed ? 'Failed' : 'Success'}
        color={failed ? 'error' : 'success'}
        size="small"
        variant="outlined"
      />
      <Typography variant="caption" color={failed ? 'error.main' : 'text.secondary'}>
        {new Date(schedule.lastRunAt).toLocaleString()}
        {summary ? ` · ${summary}` : ''}
      </Typography>
    </Stack>
  );
})()}
```

This makes a fully-quiet run explicitly read as a green "Success" chip with "0 created · 0
updated · 0 deprovisioned · 0 errors" — directly answering "did today's student run succeed."
No backend change needed here — `lastRunResult` is already returned by
`GET /api/admin/jobs/schedules`.

### 3.3 Make the top status banner reflect the split jobs

- `getStatus` (`provisioning.controller.ts:285-318`): fetch all three schedules
  (`provisioning-sync`, `provisioning-sync-staff`, `provisioning-sync-students`) via one
  `findMany({ where: { jobKey: { in: [...] } } })` instead of a single `findUnique`. Compute
  `syncEnabled` as true if **any** of the three is `enabled` (today it's only true if the
  legacy combined job is enabled).
- Drop the single `lastRunAt`/`lastRunDurationMs`/`lastRunError`/`lastRunSummary` fields from
  the response and from `ProvisioningStatus` (`shared/src/api-types.ts:161-177`) — once 3.2
  ships, per-job last-run detail lives correctly on the Split Schedule cards, and a single
  merged "last run" number for the banner would either be stale (legacy job) or misleading
  (conflating two independently-scheduled jobs' counts into one line).
- `StatusBanner` (`ProvisioningPage.tsx:124-179`): remove the `lastRunText` caption; keep the
  three chips (`Sync Enabled/Disabled`, `Test/Live Mode`, `Test/Production Tenant`), now backed
  by the corrected `syncEnabled`.

---

## 4. Implementation Steps

1. **Backend — result plumbing** (`userProvision.service.ts`, `scheduler.service.ts`,
   `provisioning.controller.ts`): add `skipped`, replace the per-account audit write with a
   counter increment. → *verify:* a manual test-mode run against a CSV with only unchanged
   accounts returns `skipped: N`, `created`/`updated`/`deprovisioned` all `0`, and **no** new
   `provisioning_audit` rows are created for those accounts (spot-check via the existing
   `GET /api/provisioning/audit` endpoint or a read-only `SELECT count(*)`).
2. **Backend — status endpoint** (`provisioning.controller.ts` `getStatus`,
   `shared/src/api-types.ts` `ProvisioningStatus`): query all three job keys, recompute
   `syncEnabled`, drop the merged last-run fields. → *verify:* `GET /api/provisioning/status`
   returns `syncEnabled: true` when only the split jobs (not the combined one) are enabled.
3. **Frontend — types** (`frontend/src/services/provisioningService.ts`): add
   `skipped: number` to `RunProvisioningResult`.
4. **Frontend — RunJobCard**: show the skipped count in the run-result `Alert`.
5. **Frontend — SplitScheduleRow**: render the success/failed chip + counts summary per job (3.2).
6. **Frontend — StatusBanner**: remove the stale last-run caption (3.3).
7. Rebuild `shared` first (its type changed), then backend and frontend images, per the
   project's Docker build order.

---

## 5. Dependencies

None new. Uses existing Prisma client, MUI `Chip`/`Stack`/`Typography`, and TanStack Query
patterns already present in this exact file.

---

## 6. Configuration Changes

None. No env vars, no Prisma schema/migration changes (Json column absorbs the new `skipped`
key; `ProvisioningAudit` table is unchanged, just receives fewer rows going forward).

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Losing the ability to confirm a specific unchanged account was actually checked in a given run (previously discoverable via Audit Log search by UPN/Employee ID). | Accepted tradeoff per prior discussion — this is a narrow diagnostic case; the per-account check-by-check detail still exists in `loggers.server.debug` output if ever needed. `CREATE_SKIPPED_DUPLICATE` (a genuinely actionable event) is unaffected. |
| Existing (already-written) `SKIPPED` rows remain in the DB until the 730-day cleanup — the Audit Log's "All" view will still show old noise for a while. | Out of scope for this pass (no request to backfill-delete). Can be addressed later with a one-off cleanup if desired; new noise stops immediately after deploy. |
| Removing `lastRunSummary`/`lastRunAt`/etc. from `ProvisioningStatus` is a breaking shape change to a shared type. | Only consumer is `StatusBanner` in this same file, updated in the same change; no other frontend code references `ProvisioningStatus.lastRun*` (confirmed — sole usage is this page). |
| `getStatus` now does a 3-row query instead of 1. | Negligible — `job_schedules` is a tiny table (one row per known job key), already indexed on the unique `jobKey`. |

---

*Phase 1 output. Proceed to Phase 2 (Implementation) per `CLAUDE.md`.*

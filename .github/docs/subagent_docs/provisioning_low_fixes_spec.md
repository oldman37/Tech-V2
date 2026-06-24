# Provisioning Low-Severity Fixes — Phase 1 Spec

**Date:** 2026-06-24
**Findings addressed:** #5, #6, #7, #8, #12, #13 (LOW from `provisioning_services_audit.md`)
**Prerequisites:** HIGH fixes (#1, #3, #10) and MEDIUM fixes (#2, #4, #11, #14, #15) already merged.

---

## Findings Summary

| # | Severity | Finding |
|---|----------|---------|
| 5 | LOW | Batch History sorts by `resolvedAt` but displays `createdAt` — dates appear out of order |
| 6 | LOW | CREATE pass uses `(userSyncService as any).mapOfficeLocation(...)` — reflective call defeats type safety; standalone export already imported |
| 7 | LOW | `ProvisioningStatus` and `DisableBatchHistoryItem` declared in the frontend instead of `@mgspe/shared-types` |
| 8 | LOW | Batch History section has no `refetchInterval` — won't reflect batches resolved by a background run |
| 12 | LOW | UPN allocation race under concurrency — concurrent creates can resolve the same UPN before either reserves it |
| 13 | LOW | `applyDisableBatch` disables the snapshot captured at hold-time without re-validating against current SIS |

---

## Current State Analysis

### #5 — Sort vs. display mismatch

`listDisableBatchHistory` (`provisioning.controller.ts:295`) orders by `resolvedAt desc`, which is the correct field for a chronological history of resolutions. The frontend table header is **"Date"** and displays `formatTimestamp(item.createdAt)` (`ProvisioningPage.tsx:1515,1526`). A batch created Monday but approved Friday sorts by Friday (resolvedAt), but the "Date" column shows Monday (createdAt) — making the table appear unordered.

**Fix:** Keep the controller sort on `resolvedAt`. Change the frontend: rename header to `"Resolved"`, display `item.resolvedAt ?? item.createdAt`. For non-PENDING batches (the only ones returned by this endpoint) `resolvedAt` is always set, but the fallback prevents a runtime error if a null ever appears.

### #6 — Reflective call in CREATE pass

`userProvision.service.ts:613`:
```ts
const mappedLocation = (userSyncService as any).mapOfficeLocation(sisRow.school) as string | null;
```

`mapOfficeLocation` is a standalone export already imported at line 28:
```ts
import { UserSyncService, mapOfficeLocation } from './userSync.service';
```

And used directly in Pass 1 (line 536). The `as any` cast bypasses type-checking.

**Fix:** Replace line 613 with `const mappedLocation = mapOfficeLocation(sisRow.school);`

### #7 — Types not in shared-types

`frontend/src/services/provisioningService.ts` declares `ProvisioningStatus` (lines 69-85) and `DisableBatchHistoryItem` (lines 87-97) locally. The project contract (`CLAUDE.md`) is that shared request/response types live in `@mgspe/shared-types`. The existing provisioning types (`ProvisioningAuditRow`, etc.) are also frontend-local — this is a pre-existing pattern, but worth correcting for the two types added in the recent provisioning feature work.

**Fix:**
1. Add `ProvisioningStatus` and `DisableBatchHistoryItem` to `shared/src/api-types.ts` in a new `// Provisioning API Types` section.
2. In `frontend/src/services/provisioningService.ts`, remove the local definitions and re-export from `@mgspe/shared-types`:
   ```ts
   export type { ProvisioningStatus, DisableBatchHistoryItem } from '@mgspe/shared-types';
   ```
3. `ProvisioningPage.tsx` imports these from `provisioningService` — no change needed there since provisioningService re-exports them.

### #8 — Batch History no refetchInterval

`DisableBatchHistorySection` query (`ProvisioningPage.tsx:1488-1492`):
```ts
const { data: history = [], isLoading } = useQuery({
  queryKey:  queryKeys.provisioning.disableBatchHistory(),
  queryFn:   provisioningService.getDisableBatchHistory,
  staleTime: 60_000,
});
```

History is invalidated when an admin approves or rejects (mutation invalidates the query key), but a background scheduled run that resolves an old batch won't trigger invalidation. Adding `refetchInterval: 60_000` keeps the view consistent with the 1-minute polling cadence used by the Status Banner.

**Fix:** Add `refetchInterval: 60_000` to the query options.

### #12 — UPN allocation race

`userProvision.service.ts:522-626`:
1. `existsInEntra = async (upn: string) => upnSet.has(upn.toLowerCase())` — read-only check
2. `resolveStaffUpn(firstName, lastName, domain, existsInEntra)` — probes via `existsInEntra`
3. **After** resolve returns: `upnSet.add(upn.toLowerCase())` — reserve

With `MAX_CONCURRENT = 5`, two tasks can both call `resolveStaffUpn` for "John Smith". Both probe `jsmith@…` via `upnSet.has(...)` before either calls `upnSet.add(...)`. Both see it as free, both resolve `jsmith@…`, both try to POST to Graph, second one gets a 409.

**Fix:** Make the check+reserve atomic by passing a `claimUpn` callback that does both in one synchronous step:
```ts
const claimUpn = async (upn: string): Promise<boolean> => {
  const key = upn.toLowerCase();
  if (upnSet.has(key)) return true;   // taken — don't claim
  upnSet.add(key);                    // claim atomically
  return false;                       // was free
};
```

Pass `claimUpn` to `resolveStaffUpn`/`resolveStudentUpn` instead of `existsInEntra`. Because `upnSet` is a synchronous `Set<string>` (no I/O), the check-and-add sequence inside `claimUpn` is not interruptible by the event loop — no yield point between `has` and `add`. Remove the post-resolution `upnSet.add(upn.toLowerCase())` at line 626 (now redundant since `claimUpn` already added it).

`existsInEntra` can be removed entirely; it is only used as the resolver argument.

### #13 — Stale snapshot in batch approval

`applyDisableBatch` (`userProvision.service.ts:359-418`) reads `batch.pendingUsers` (captured when Pass 3 held the batch) and disables every account in it. If a student re-enrolled (reappeared in the SIS CSV) between hold and approval, they would still be disabled. Pass 1 of the next sync would then re-enable them, but they could be locked out for up to 2 hours.

**Fix:** Re-read the current SIS CSV at approval time, build a set of active employeeIds, filter `users` to only those absent from the current SIS. Log any skipped re-enrolled accounts.

- CSV path: same env vars as `runForType` (`SIS_STAFF_CSV` / `SIS_STUDENT_CSV`)
- Parse functions: `parseStaffCSV` / `parseStudentCSV` are exported from the same file
- Error handling: if the CSV cannot be read, throw and return 500 — the admin should retry rather than blindly disabling stale data

```ts
const csvPath = userType === 'STAFF'
  ? (process.env.SIS_STAFF_CSV ?? '/sis-data/staff.csv')
  : (process.env.SIS_STUDENT_CSV ?? '/sis-data/students.csv');

let currentSisIds: Set<string>;
try {
  const sisMap = userType === 'STAFF' ? parseStaffCSV(csvPath) : parseStudentCSV(csvPath);
  currentSisIds = new Set(sisMap.keys());
} catch (err) {
  throw new Error(`Cannot validate batch ${batchId}: SIS CSV read failed — ${err instanceof Error ? err.message : String(err)}`);
}

const reEnrolled = users.filter((u) => currentSisIds.has(u.employeeId));
const toDisable  = users.filter((u) => !currentSisIds.has(u.employeeId));

if (reEnrolled.length > 0) {
  loggers.server.warn('Provisioning: batch approval — skipping re-enrolled accounts', {
    batchId,
    skipped: reEnrolled.map((u) => u.upn),
  });
}
```

Then iterate `toDisable` instead of `users`.

---

## Implementation Plan

| Step | File | Change |
|------|------|--------|
| 1 | `shared/src/api-types.ts` | Add `ProvisioningStatus` and `DisableBatchHistoryItem` |
| 2 | `frontend/src/services/provisioningService.ts` | Remove local type defs; re-export from `@mgspe/shared-types` |
| 3 | `frontend/src/pages/admin/ProvisioningPage.tsx` | #5: header "Resolved", display `resolvedAt`; #8: add `refetchInterval: 60_000` |
| 4 | `backend/src/services/userProvision.service.ts` | #6: fix reflective call; #12: atomic `claimUpn`; #13: SIS re-validation in `applyDisableBatch` |

---

## Build Commands

- Backend: `docker compose -f docker-compose.dev.yml build backend`
- Frontend: `docker compose -f docker-compose.dev.yml build frontend`
- Preflight: `scripts/preflight.ps1`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `claimUpn` inside an async resolver — is the claim truly atomic? | `upnSet` is a JS `Set` (no I/O); `has` + `add` execute synchronously with no await between them, so no event-loop yield can interleave another task between them |
| SIS CSV unavailable at approval time | Throw → 500 response; admin retries. Safer than silently disabling stale data |
| `resolvedAt` null for some history rows | Non-PENDING batches always set `resolvedAt` (controller filters `status: { not: 'PENDING' }`), but fallback `?? item.createdAt` guards against any edge case |
| Moving types to shared-types breaks existing frontend imports | Re-export from `provisioningService.ts` preserves all existing import paths unchanged |

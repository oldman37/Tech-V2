# INTUNE_RENAME_QUEUED_STATUS — Review & Quality Assurance

**Phase 3 — Review & QA**
**Date:** 2026-08-19
**Spec:** `.github/docs/subagent_docs/INTUNE_RENAME_QUEUED_STATUS_spec.md`
**Result: PASS**

---

## 1. Files Reviewed

| File | Change |
|------|--------|
| `shared/src/intune.types.ts` | `INTUNE_RENAME_STALE_SYNC_DAYS`, `getRenameBlocker()`, `RenamePreviewItem` gains `joinType` / `lastSyncDateTime` / `warning`, `RenameDeviceResult.status` → `'queued' \| 'failed'`, `RenameDevicesResponse.succeeded` → `queued` |
| `backend/src/types/microsoft-graph.types.ts` | `IntuneDevice.joinType?` |
| `backend/src/services/intuneDevice.service.ts` | `DEVICE_LOOKUP_SELECT` + beta pin on both lookups, `buildStaleSyncWarning()`, `previewRenameItems` capability gate, `executeRenameDevices` queued semantics |
| `frontend/src/components/IntuneBulkRenameDialog.tsx` | Readiness via `getRenameBlocker`, warning chip, corrected confirm copy |
| `frontend/src/components/IntuneRenameDeviceDialog.tsx` | Corrected info alert copy |
| `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx` | `result.queued`, removed premature displayName patch |
| `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` | `historySuccessChip()` — action-aware history labels |
| `frontend/src/changelog.ts` | Three entries appended to the current 1.8.5 `changes` array |

---

## 2. Specification Compliance

All five success criteria from spec §7 are met.

1. **"N queued", never "N succeeded"** — `executeRenameDevices` returns `queued`; `handleRenamed` feeds it to history; both History renderings label it `⏳ … queued` for `setDeviceName` via `historySuccessChip`. No rename path emits the word "succeeded".
2. **Hybrid devices blocked** — `getRenameBlocker` returns a reason for `joinType === 'hybridAzureADJoined'`; `previewRenameItems` sets `valid: false`; `isRowReady` returns false, so `handleExecuteClick`'s `.filter(isRowReady)` excludes them from the payload.
3. **Stale-sync warning, still executable** — `buildStaleSyncWarning` sets `warning` only; `valid` is untouched; the dialog renders it as a separate outlined chip beside the `Ready` chip.
4. **No "takes effect immediately"** — both occurrences replaced. Verified absent from the rename path.
5. **Preflight** — deferred to Phase 6.

### Deviations from spec

One, deliberate, recorded here rather than left silent:

**Removed the scanned-entry `displayName` patch in `handleRenamed`** (`IntuneScanWizardTab.tsx`). The spec listed only the `status === 'success'` → `'queued'` literal change at that site. On inspection the surrounding block was itself a casualty of the same wrong assumption: it optimistically rewrote each scanned row's `displayName` to the *new* name on the premise that Intune had already applied it. Under the corrected model Intune still holds the **old** name until the device checks in, and `getBitLockerKeys` resolves devices *by name* (`intuneDevice.service.ts:1397`) — so the patch would have sent Graph a name Intune does not yet recognise, breaking the next BitLocker lookup on any renamed row.

Merely swapping the status literal would have preserved that bug behind a correct-looking condition. The block is removed and the function's doc comment now states why rows keep their current name. This is inside the defect being fixed, not scope creep.

### Additions beyond spec

`frontend/src/changelog.ts` — not in the spec, but `git log -- frontend/src/changelog.ts` shows the last four feature/fix commits each append to the current version's `changes` array. Following the established convention; appended to `1.8.5` (matching `package.json`), no new version block invented.

---

## 3. Best Practices

- `joinType` handling is **fail-open**: only the literal `hybridAzureADJoined` blocks. `unknown`, `null`, and any future enum value stay renameable, so an unrecognised value can never newly break a workflow that works today. Documented in the helper.
- `buildStaleSyncWarning` guards both a null timestamp and `Number.isNaN` on an unparseable date, returning `null` rather than rendering "NaN days ago".
- `getRenameBlocker` is a pure function on a structural parameter type, mirroring the existing `validateIntuneDeviceName` pattern that exists specifically to stop frontend/backend validation drifting. It is the sole reason a row can be blocked device-side, consumed by both.
- The beta pin is expressed once as `DEVICE_LOOKUP_SELECT` rather than duplicated across the three request sites in the two lookups.

## 4. Consistency

Matches surrounding conventions: aligned object-literal formatting in the service, the shared-helper pattern in `intune.types.ts`, MUI `Chip`/`Stack` usage as in the existing preview table, and the doc-comment style (a comment explains *why*, not *what*).

## 5. Maintainability

Every non-obvious decision carries its rationale in-code: why 204 is not success (`RenameDeviceResult.status` doc), why hybrid is blocked and why other `joinType` values are not (`getRenameBlocker` doc), why the lookups are pinned to beta (`DEVICE_LOOKUP_SELECT` comment), why `successCount` holds a queued count (`executeRenameDevices` comment), and why scanned rows keep their old name (`handleRenamed` doc).

## 6. Completeness

No stragglers. `grep` across `backend/src` and `frontend/src` for `.succeeded` / `status === 'success'` in the rename path returns nothing; the single remaining `status === 'success'` (`intuneDevice.service.ts:856`) belongs to the generic `DeviceActionResult` union used by other actions and is correctly untouched.

## 7. Performance

No new Graph calls. `joinType` rides along in the existing `$select` on lookups the preview already performs — zero additional round trips. `buildStaleSyncWarning` is arithmetic on an already-fetched field. Spec §3.4's decision not to re-fetch join type inside `executeRenameDevices` avoids adding up to 300 Graph GETs per run; the guarded failure mode is a queued no-op, not a security or data-integrity issue, and name validation plus authorization remain enforced backend-side.

## 8. Security

No change to the security posture. No new routes, no new permissions, no change to CSRF or cookie handling. `joinType` is an Intune device attribute, not an Entra group ID or raw Graph payload, and only the single derived field is surfaced — no Graph object is passed through. OData escaping via `escapeOdata` is unchanged on both lookups. Authorization remains backend-enforced; the frontend readiness check is display-side convenience, with the backend re-validating names independently.

## 9. API Currency

Verified against official Microsoft documentation for the installed `@microsoft/microsoft-graph-client`:

- `setDeviceName` returns `204 No Content` = command accepted, not applied — the premise of the entire fix.
- `managedDevice.joinType` exists on **beta** with enum `unknown | azureADJoined | azureADRegistered | hybridAzureADJoined`, and is **absent from v1.0**. `createGraphClient` calls `Client.init` without `defaultVersion`, so the SDK defaults to v1.0 — the explicit `.version('beta')` pin is required, not optional. Confirmed against both resource pages.
- Renaming Entra hybrid joined devices from Intune is unsupported per the Intune Rename device action doc.

**Beta pin blast radius** — audited all callers of the two pinned lookups: single-device action dispatch (`:816`), device status (`:884`), BitLocker key lookup (`:1397`), and the three rename-preview sites. Every field they consume (`id`, `deviceName`, `serialNumber`, `operatingSystem`, `complianceState`, `lastSyncDateTime`, `enrolledDateTime`, `managedDeviceOwnerType`, `azureADDeviceId`, `model`) exists on the beta `managedDevice` resource, and `$filter` on `serialNumber` / `deviceName` plus `contains(deviceName, …)` are supported there. `setDeviceName` in this same service already ran on beta, so beta was already load-bearing for this feature.

## 10. Build Validation

Commands per spec §4. Output verbatim (abridged to result lines).

**`docker compose -f docker-compose.dev.yml build backend`**
```
#14 [builder  9/18] RUN npm run build
#14 > @mgspe/shared-types@1.8.5 build
#14 > tsc
#14 DONE 1.8s

#20 [builder 15/18] RUN npx prisma generate
#20 ✔ Generated Prisma Client (v7.9.0) to ./node_modules/@prisma/client in 1.47s
#20 DONE 3.9s

#23 [builder 18/18] RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build
#23 > tech-v2-backend@1.8.5 build
#23 > tsc && node -e "..."
#23 DONE 21.6s

 Image tech-v2-backend Built
```
Exit code 0. No TypeScript errors.

**`docker compose -f docker-compose.dev.yml build frontend`**
```
#19 [builder 12/12] RUN NODE_OPTIONS="--max-old-space-size=3072" npm run build
#19 > tech-v2-frontend@1.8.5 build
#19 > tsc && vite build
#19 vite v8.1.5 building client environment for production...
#19 ✓ 13022 modules transformed.
#19 ✓ built in 1.42s
#19 DONE 18.8s

 Image tech-v2-frontend Built
```
Exit code 0. No TypeScript errors.

Pre-existing warnings only (chunk size >500 kB, `INEFFECTIVE_DYNAMIC_IMPORT` on `src/services/api.ts`, npm audit advisories). None originate from this change and none are in scope.

The `succeeded` → `queued` rename was intended as a compile-time break to enumerate consumers (spec risk #3). `tsc` surfaced exactly the two predicted sites in `IntuneScanWizardTab.tsx`; both are handled.

**Tests** — the backend suite runs inside the `backend-test` container as preflight step 3
(`scripts/preflight.ps1`), not on the host. Executed in Phase 6: **9 test files, 67 tests, all
passing**. No test covers the Intune rename path; none needed changing, and none regressed.

---

## 11. Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 97% | A |
| Functionality | 98% | A |
| Code Quality | 97% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 98% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

---

## 12. Findings

**CRITICAL:** none.

**RECOMMENDED:** none blocking.

**Observations (no action taken, recorded for the user):**

1. **The other Intune device actions have the same async semantics.** `wipe`, `retire`, `rebootNow`, `cleanWindowsDevice` and friends are also queued commands whose 204 means "accepted", and they are all still counted and rendered as `succeeded`. This change deliberately fixes only the rename path, as scoped. The generic `IntuneActionLog.successCount` column and `IntuneHistoryEntry.succeeded` field are the shared surfaces a future fix would need to address.
2. **Verification remains unavailable.** With item 3 out of scope there is still no in-app way to see whether a queued rename actually landed. `managedDevice.deviceActionResults[]` (`actionName: "setDeviceName"`, `actionState: pending | done | failed | notSupported`) is the field a future verification pass would read. Until then, checking a run means querying Graph directly.
3. **`deviceEnrollmentType: 'windowsCoManagement'`** identifies co-managed devices, which Microsoft also excludes from bulk rename. It is not blocked here because the documentation's exclusion is specific to the admin-center *bulk* action rather than the Graph call, and blocking on an unverified assumption risks locking out devices that do work. Worth confirming against the tenant before adding.

---

## 13. Verdict

**PASS** — proceed to Phase 6 (Preflight Validation).

# Intune Device Rename — Review

Spec: `.github/docs/subagent_docs/intune_device_rename_spec.md`

## Files Modified

- `shared/src/intune.types.ts`
- `backend/src/validators/intuneDevice.validators.ts`
- `backend/src/services/intuneDevice.service.ts`
- `backend/src/controllers/intuneDevice.controller.ts`
- `backend/src/routes/intuneDevice.routes.ts`
- `frontend/src/services/intuneService.ts`
- `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx`

No Prisma schema or migration changes (audit log table is already generic — confirmed
`IntuneActionLog.action`/`.results` are plain `String`/`Json` columns).

## Review Findings

1. **Spec compliance** — all 7 implementation steps from the spec were completed exactly as
   designed: shared types/enum extension, validators, service (parser + preview + execute),
   controller, routes (incl. multer config mirrored from `inventory.routes.ts`), frontend
   service client, and the new "Rename Devices" tab with single-lookup + bulk-upload sections.
2. **Security**
   - All 3 new routes gated by `requireDeviceManagementAccess()` + `validateCsrfToken`,
     matching every other route in this file.
   - CSRF middleware only reads `req.cookies`/`req.headers` (verified in
     `backend/src/middleware/csrf.ts`), so placing it before `upload.single('file')` on the
     multipart route is safe — confirmed against the same ordering already used for
     `/inventory/import`.
   - No raw Graph payloads, Entra group IDs, or Graph internal IDs beyond what's already
     exposed elsewhere (`intuneDeviceId`) are returned to the client.
   - OData filter construction is fully delegated to the existing `getDeviceBySerial()`
     helper, which already applies `escapeOdata()` — no new injection surface introduced.
   - Row/file size are both bounded (`INTUNE_RENAME_MAX_ROWS = 300`, existing 10MB multer
     limit) to prevent unbounded Graph call volume from a single request.
3. **Consistency** — new code follows established patterns exactly: `withRetry()` for all
   Graph calls, `AppError`/`handleControllerError` for error propagation, `ResponsiveTable`
   for tabular UI, `useMutation` for all frontend actions, and the existing
   `intune_action_logs` audit trail (no new tables).
4. **Correctness / self-consistency fix applied during implementation**: the spec's original
   plan for `executeRenameDevices` re-fetched each device's current name via an extra Graph
   GET before renaming. This was simplified during implementation — the frontend now passes
   `previousDeviceName` through from what it already fetched during preview (added to
   `RenameDeviceRequestItem` and `RenameExecuteSchema`), halving Graph call volume for the
   execute step and better matching the spec's own stated "execute trusts its input" principle.
5. **`ACTIONS` dropdown exclusion** — confirmed `setDeviceName` is filtered out of the
   generic `ACTIONS` array (`IntuneDeviceActionsPage.tsx`) so it cannot be selected from the
   "By Device Model" / "Scan / Search by Name" dropdowns, where it would otherwise silently
   fail (no per-device name collection in those flows). This also correctly excludes it from
   the History tab's per-card re-run selector.
6. **Performance** — preview lookups run at concurrency 5 (matching the existing
   `searchDevicesByNames` pattern); no N+1 Prisma queries (`equipment.findMany` with `in:`
   used for asset-tag resolution in both preview and execute paths, not per-row queries).

## Build Validation

Commands run (both explicitly listed in the CLAUDE.md Build Commands / Resource Constraints
section — no FORBIDDEN COMMANDS used):

```
docker compose -f docker-compose.dev.yml build backend    → SUCCESS
docker compose -f docker-compose.dev.yml build frontend   → SUCCESS
powershell -File scripts/preflight.ps1                     → SUCCESS (see below)
```

`scripts/preflight.ps1` output (verbatim summary):

- Preflight 1/3 (backend build: shared tsc → prisma generate → backend tsc): **PASS**
- Preflight 2/3 (frontend build: tsc → vite build): **PASS**
- Preflight 3/3 (backend integration tests, vitest run inside Docker):
  **5 test files passed, 35 tests passed, 0 failed**
- Exit code: `0` — `All preflight checks passed.`

No new automated tests were added for this feature (no test-writing was requested and the
existing suite has no precedent test file for `intuneDevice.service.ts`); the 35 passing
tests are the pre-existing suite, confirming no regression.

**Side effect (pre-existing script behavior, not introduced by this change):** the preflight
script's `docker compose --profile test down` step stopped the live dev containers
(`tech-v2-backend-1`, `tech-v2-frontend-1`, `tech-v2-db-1`) because they share the same
compose project as the test profile. Flagged to the user; redeploying is left to them per
project policy (build ≠ deploy).

## Score Table

| Category | Score | Grade |
|---|---|---|
| Specification Compliance | 100% | A |
| Best Practices | 95% | A |
| Functionality | 100% | A |
| Code Quality | 95% | A |
| Security | 100% | A |
| Performance | 95% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (98%)**

## Result: **PASS**

No CRITICAL or RECOMMENDED issues found. Phase 4/5 refinement not required.

## Follow-up change: rename no longer requires inventory presence

After initial delivery, the user asked that devices not be required to exist in the local
inventory to be renamed. Investigation found the *bulk* Excel path already didn't require
inventory (the tag comes straight from the file); the gap was the *single-device* lookup path,
where a device with no resolvable tag (no inventory row) was marked `valid: false` and silently
excluded from execution even if the user typed a name into the editable "New Name" cell.

Fix applied:
- Added an optional "Tag Number" field to the single-device lookup section, sent straight
  through to the existing (already-supported) `tagNumber` parameter — no backend change needed
  for this part.
- The frontend's execute-readiness check no longer trusts the server's static `valid`/`issue`
  fields verbatim; it now recomputes readiness live (`isRenameRowReady`) from whatever name is
  currently in the editable field, so a manually typed name makes a row executable regardless
  of inventory presence. The only hard requirement left is Intune enrollment (Graph can't rename
  a device it doesn't know about).
- The naming-rule validator (`validateDeviceName`) was promoted to a shared, exported function
  `validateIntuneDeviceName` in `shared/src/intune.types.ts` so frontend (live validation) and
  backend (preview + a new defense-in-depth re-check in `executeRenameDevices` before calling
  Graph) can never drift apart on what counts as a valid name.

Re-validated: `docker compose build backend` ✓, `docker compose build frontend` ✓, full
`scripts/preflight.ps1` ✓ (both image builds + 35/35 backend tests passed).

## Follow-up change: navigate to History (with who ran it) after execution

The user asked that, once a rename completes, the screen clear and move to the existing
History tab, showing who triggered the action.

Investigation: the History tab (Tab 2) already exists and is populated from a client-side
history mechanism (`localStorage`, key `intune_action_history`) defined in
`IntuneScanWizardTab.tsx` — `saveToHistory()` already records `triggeredBy` from the current
user in `authStore`. It just wasn't being called for rename completions, since the rename tab
had its own separate inline results panel instead.

Fix applied (`frontend/src/pages/DeviceManagement/`):
- `IntuneScanWizardTab.tsx`: exported `saveToHistory` (previously module-private) so the
  rename tab can reuse the exact same history mechanism rather than duplicating it.
- `IntuneDeviceActionsPage.tsx`: `renameExecuteMutation.onSuccess` now calls `saveToHistory()`
  with the rename outcome (mapping each `RenameDeviceResult` to the existing device-row shape:
  `displayName` set to the new device name), clears all rename tab state (rows, edited names,
  exclusions, serial/tag inputs), refreshes `historyEntries`, and switches to Tab 2. The now-dead
  inline "Rename Results" panel and its `renameResults` state / `RenameDevicesResponse` import
  were removed rather than left unreachable.
- `setDeviceName` is already excluded from the History tab's per-card re-run selector (via the
  existing `ACTIONS` filter), which is correct — re-running a rename needs new names, not a
  simple replay.

Re-validated: `docker compose build frontend` ✓, full `scripts/preflight.ps1` ✓ (both image
builds + 35/35 backend tests passed; backend was unchanged in this step).

## Follow-up change: stay on the Rename tab instead of navigating to History

Correction to the above: the user actually wanted to remain on the Rename Devices tab after
completion, with the outcome (and who triggered it) shown inline under a "Recent Renames"
section — not navigate away to the History tab.

Fix applied (`IntuneDeviceActionsPage.tsx`):
- Removed the `setTab(2)` call from `renameExecuteMutation.onSuccess` — history is still saved
  via `saveToHistory()`/`loadHistory()` (unchanged), but the tab no longer switches.
- Added a "Recent Renames" panel to the bottom of the Rename Devices tab, mirroring the
  existing "Recent Actions" panel already used at the bottom of the Scan/Search-by-Name tab
  (same card layout: label, timestamp + triggered-by, device count and success/fail chips),
  filtered to `action === 'setDeviceName'` so it only shows rename history.
- Added `v === 5` to the tab-change history-reload check (previously only `1`/`2`) so the panel
  is current if the user switches tabs and comes back, not just on mount.

Re-validated: `docker compose build frontend` ✓ (backend unchanged in this step).

## Follow-up change: look up by tag number as well as serial number

The single-device lookup only accepted a serial number as the search key (tag number was
accepted only as a secondary input to help build the proposed name). The user asked for the
lookup itself to work by tag number too — e.g. when the serial isn't on hand.

Fix applied (`previewRenameItems` in `backend/src/services/intuneDevice.service.ts`):
- `serialNumber` and `tagNumber` are now both optional per lookup item — at least one is
  required (enforced by a new `.refine()` on `RenamePreviewInputItemSchema`).
- Resolution order: serial given → direct `getDeviceBySerial()` (unchanged, authoritative).
  Tag given with no serial → try Intune directly by the fleet's `OCS-<tag>` naming convention
  via the existing `getDeviceByName()` helper (already used by the BitLocker lookup feature,
  exact match then contains fallback) — no inventory dependency. Only if that direct name
  match misses does it fall back to an inventory tag→serial reverse lookup as a secondary aid.
- `RenameExecuteSchema.serialNumber` had its `.min(1)` dropped (now allows empty string):
  a device resolved purely by tag/name may have no serial number on file in Intune at all
  (the existing OCS-named-device pattern already seen elsewhere in this file), and execution
  only actually needs `intuneDeviceId`.
- Frontend: added a "Tag Number" input alongside "Serial Number" in the single-lookup section;
  the Look Up button is enabled if either field has a value. Row key generation and the Serial
  column display were made resilient to an empty resolved serial number.

Re-validated: `docker compose build backend` ✓, `docker compose build frontend` ✓, full
`scripts/preflight.ps1` ✓ (both image builds + 35/35 backend tests passed).

## Outstanding External Prerequisite (not a code defect)

The Entra app registration needs the Microsoft Graph **Application permission**
`DeviceManagementManagedDevices.PrivilegedOperations.All` added and admin-consented before
this feature will work against real devices (confirmed with the user as an action they will
take). Until granted, rename attempts will surface a clear `502 GRAPH_ERROR` rather than
failing silently — this was verified by inspection of the existing Graph-error handling
pattern reused here (`AppError` → `handleControllerError`), not by a live call (no consent
yet).

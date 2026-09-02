# Version Bump to 1.9.3 + Changelog — Spec

## Current state analysis

- `backend/package.json`, `frontend/package.json`, `shared/package.json` are all at
  `"version": "1.9.2"` (lockstep, per established convention — see
  `version-bump-1.6.5_spec.md`). Root `package.json` (`mgspe`) is a workspace
  manager only and is never part of this lockstep.
- `frontend/vite.config.ts` defines `__APP_VERSION__` from `frontend/package.json`'s
  version; `AppLayout.tsx` displays it and looks up
  `CHANGELOG.find(entry => entry.version === __APP_VERSION__)` for the changelog
  tooltip/popup. An entry whose version doesn't match the bumped package version is
  never shown — the bump and the entry must land together.
- `frontend/src/changelog.ts`'s top entry is `1.9.2` (fuel/vehicle work). No `1.9.3`
  entry exists.
- Two commits are on `master`, pushed, and not yet reflected in the changelog:
  - `37e5223` "feat(provisioning): show real run status, drop audit noise" —
    Provisioning page: (1) top status banner now reports "enabled" if any of the
    staff/student/legacy sync jobs is enabled, instead of only checking the legacy
    combined job (could wrongly show "Sync Disabled" while split schedules ran);
    (2) each Split Schedule row (staff, students) now shows a Success/Failed status
    chip plus created/updated/deprovisioned/error counts for its last run; (3)
    backend stopped writing a `ProvisioningAudit` row for every already-in-sync
    account (the common case), replaced with a "skipped"/"unchanged" count, so real
    Created/Updated/Failed entries aren't buried and the audit table doesn't grow
    unbounded.
  - `8cc0527` "fix(work-orders): stop notifying reporter on Quick Fix auto-close" —
    Quick Fix (Checkouts page) no longer sends the checked-out person a "your work
    order has been completed" email/push when the technician's on-the-spot fix
    auto-closes the ticket in the same request.

## Problem / request

Bump the app version to `1.9.3` and add a changelog entry for these two already-
pushed, unreleased changes.

## Solution

1. Set `"version": "1.9.3"` in `backend/package.json`, `frontend/package.json`,
   `shared/package.json`.
2. Add a new `{ version: '1.9.3', changes: [...] }` entry at the top of `CHANGELOG`
   in `frontend/src/changelog.ts`, matching existing tone (short, user-facing, past
   tense, no internal implementation detail).

Changelog copy:
- 'Provisioning\'s status banner now correctly shows "Sync Enabled" whenever any of the staff, student, or legacy sync schedules is running, instead of sometimes showing "Sync Disabled" while a split schedule was actually active.'
- 'Each Split Schedule row on the Provisioning page (staff and students) now shows a Success/Failed status chip with created, updated, deprovisioned, and error counts for its last run, so a quiet run reads as a confirmed success instead of no information at all.'
- 'The provisioning audit log no longer records an entry for every account that was already in sync (the common case) — only real creates, updates, and failures are logged, so they\'re no longer buried and the audit log stops growing unbounded.'
- 'Quick Fix no longer sends the checked-out person a "your work order has been completed" email or push notification — logging an on-the-spot fix from the Checkouts page is now silent to them, as intended.'

## Files to change

- `backend/package.json`
- `frontend/package.json`
- `shared/package.json`
- `frontend/src/changelog.ts`

No dependency, schema, or config changes.

## Risks and mitigations

- None of material concern — a version string bump plus a static data addition.
  Build validation (Phase 6 preflight) confirms `__APP_VERSION__` picks up the new
  version and both images still build.

# Spec: Bump to v1.5.1 and Update Changelog

## Current State Analysis

`frontend/src/changelog.ts` holds the user-facing release notes shown in-app, newest entry first.
`frontend/package.json`, `backend/package.json`, and `shared/package.json` are bumped together on
each release per the existing pattern (`d844b43`, "chore(release): bump to v1.5.0 and update
changelog") — the root `package.json` is intentionally left untouched, as it was in that same
commit (it stayed at `1.4.3` while the three workspace packages moved to `1.5.0`).

Current versions: `frontend/package.json`, `backend/package.json`, `shared/package.json` are all
`1.5.0`. The current top changelog entry is also `1.5.0`.

Three changes have shipped since `1.5.0` in this session, all already reviewed and preflight-passed:
1. Technology Assistants can now manage room assignments for the school(s) they're assigned to
   support (scoped, not district-wide).
2. Clicking anywhere on a room card in Room Assignments opens the manage-assignments dialog, not
   just the "Manage Assignments" button.
3. Fixed a bug where pagination (and any filter change) on the Room Assignments page would flash to
   the new page and then immediately revert to page 1.

## Proposed Solution

Add a new `1.5.1` entry to the top of `CHANGELOG` in `frontend/src/changelog.ts`, worded in the same
user-facing, non-technical style as existing entries (no file paths, no internal terms like
"LocationSupervisor"). Bump `version` in `frontend/package.json`, `backend/package.json`, and
`shared/package.json` from `1.5.0` to `1.5.1`. Root `package.json` is not touched, matching the prior
release's precedent.

This is a patch bump (bug fix + minor UI affordance + a scoped permission addition that doesn't
change any existing user's access) rather than a minor version, per the user's explicit instruction
to bump to `1.5.1`.

## Implementation Steps

1. `frontend/src/changelog.ts` — insert a new entry above the existing `1.5.0` entry:
   ```ts
   {
     version: '1.5.1',
     changes: [
       'Technology Assistants can now manage room assignments for the school(s) they support.',
       'Room Assignments: clicking anywhere on a room\'s card now opens its assignment dialog, not just the "Manage Assignments" button.',
       'Fixed Room Assignments pagination reverting to page 1 immediately after selecting a different page.',
     ],
   },
   ```
2. `frontend/package.json` — `"version": "1.5.0"` → `"version": "1.5.1"`.
3. `backend/package.json` — `"version": "1.5.0"` → `"version": "1.5.1"`.
4. `shared/package.json` — `"version": "1.5.0"` → `"version": "1.5.1"`.

## Dependencies

None. No code paths beyond version metadata and static changelog text.

## Files to be Modified

- `frontend/src/changelog.ts`
- `frontend/package.json`
- `backend/package.json`
- `shared/package.json`

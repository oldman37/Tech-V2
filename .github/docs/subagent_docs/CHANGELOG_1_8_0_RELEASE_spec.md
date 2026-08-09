# Release: Bump to v1.8.0

## Current State Analysis

Version is tracked independently in three workspace `package.json` files —
`backend/package.json`, `frontend/package.json`, `shared/package.json` — all currently
at `1.7.5` (confirmed by grep). The root `package.json` (`1.4.3`) is not part of the
bump convention (confirmed against the `1.7.5` and `1.7.0` release precedents) — release
commits only touch the three workspace files plus `frontend/src/changelog.ts`.
`frontend/package.json`'s `version` field is injected at build time into
`__APP_VERSION__` via `frontend/vite.config.ts`
(`define: { __APP_VERSION__: JSON.stringify(pkg.version) }`); the sidebar and the
"What's New" popup both read it — no separate hardcoded version string to update.
`WhatsNewDialog.tsx` shows the popup automatically whenever the major or minor number
increases (`isFeatureRelease`), so a `1.7.5` → `1.8.0` bump requires a matching
`highlights` array, not just `changes`.

The current top changelog entry (`1.7.5`) already covers everything committed up
through `ed49d7c`. Everything built in this session since then is still uncommitted
working-tree/untracked-file changes:

- **Quick Fix** (new feature) — a "Quick Fix" action on the Checkouts page lets a
  technician log and immediately close a small device fix in one step, from a curated,
  admin-controlled list of categories, without leaving the Checkouts page. Requires a
  free-text note describing what was done, which becomes the work order's closing note.
- **Edit/delete your own work order posts** (new feature) — comments, status-change
  notes, priority-change notes, and (for the reporter) the work order description can
  now be edited or deleted after the fact, author-only, enforced server-side.
- **Move a device between carts** (new feature) — Add Device on a checked-out cart now
  offers "Move Device" when the scanned device is already checked out on a different
  cart, instead of only a hard block.
- Fixed a barcode scanner intermittently dropping characters when scanning into a text
  field (root cause: React Router's transition scheduling delaying input state
  updates).
- Fixed the back-to-top button overlapping pagination controls at the bottom of long
  lists.
- Fixed Active Checkouts table columns squeezing/wrapping illegibly at narrower
  desktop widths.
- Fixed (found via manual testing of the cart-move feature) moving or returning a
  device leaving a stale record behind in its old cart's item list, misrepresenting
  the cart as "partially returned."

## Problem Definition

Bump the app to `1.8.0` (per explicit user instruction — a minor bump, reflecting the
three new features above) and add a changelog entry with `highlights` for the three
major features and `changes` bullets for everything, including the bug fixes.

## Proposed Solution

1. Bump `version` to `1.8.0` in `backend/package.json`, `frontend/package.json`,
   `shared/package.json` (root `package.json` untouched, per existing convention).
2. Prepend a new `{ version: '1.8.0', highlights: [...], changes: [...] }` entry to
   `frontend/src/changelog.ts`, above the existing `1.7.5` entry.

## Implementation Steps

1. Edit the three `package.json` files' `version` field.
2. Edit `frontend/src/changelog.ts` to add the new entry (3 highlights, matching
   `changes` bullets for the highlighted features plus the 4 bug fixes).

## Dependencies / Configuration Changes

None.

## Risks and Mitigations

- **Risk:** None of substance — this is a metadata/documentation-only change (no
  runtime logic touched).
- **Note:** `backend/src/services/userProvision.service.ts` also has uncommitted
  changes in the working tree (ELL/ESL → Entra `country` attribute work), but per
  prior session notes that feature is intentionally blocked on a missing SIS export
  column and is not part of this release's user-facing changes — excluded from the
  changelog entry. Whether it ends up in the same commit as this bump is the user's
  call at commit time (this workflow never stages or commits).

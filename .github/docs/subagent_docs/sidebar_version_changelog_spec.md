# Sidebar Version Changelog Tooltip — Spec

## Current State Analysis

- The sidebar footer renders a static app version string at
  [AppLayout.tsx:225](frontend/src/components/layout/AppLayout.tsx#L225):
  `<div className="shell-sidebar-footer">v{__APP_VERSION__}</div>`
- `__APP_VERSION__` is a compile-time global injected by Vite's `define` config in
  [vite.config.ts:10](frontend/vite.config.ts#L10), sourced from `frontend/package.json`'s
  `version` field (currently `1.2.0`, mirrored in root `package.json`).
- Styling for the footer lives in
  [AppLayout.css:98-104](frontend/src/components/layout/AppLayout.css#L98-L104) — centered,
  bold, 0.85rem text with a top border.
- There is no changelog data anywhere in the repo (no `CHANGELOG.md`, no per-version notes
  file). Release notes currently only exist implicitly in git commit history.
- MUI v7.3.8 `Tooltip` is already used extensively across the frontend (e.g.
  `frontend/src/pages/Transportation/FuelStationsPage.tsx:301`), imported directly from
  `@mui/material`. No new dependency or version-sensitive API research is required — this is
  an already-exercised pattern in this codebase.

## Problem Definition

Hovering over the version number in the sidebar currently does nothing. The user wants
hovering over it to reveal what changed in that version (a changelog), without navigating
away from the current page.

## Proposed Solution

1. Add a small, manually-maintained changelog data file,
   `frontend/src/changelog.ts`, exporting a typed array of per-version entries:
   ```ts
   export interface ChangelogEntry {
     version: string;
     changes: string[];
   }

   export const CHANGELOG: ChangelogEntry[] = [
     {
       version: '1.2.0',
       changes: [
         'Add device rename via serial lookup and bulk Excel upload (Intune)',
         'Show approval notes in Notes section and PDF (Purchase Orders)',
         'Add school-only Ship To dropdown to PO request',
         'Add per-category asset tag requirement toggle (Work Orders)',
         'Add district phone number to PO PDF Bill To',
       ],
     },
   ];
   ```
   This mirrors the existing `__APP_VERSION__` convention of keying off the `package.json`
   version string, but as a plain importable module — no new build tooling, no Vite plugin,
   no markdown parsing. Entries for the current version (`1.2.0`) are seeded from the 5 most
   recent commits on `master` as a reasonable starting point.

2. In `AppLayout.tsx`, import `Tooltip` from `@mui/material` and `CHANGELOG` from
   `../../changelog`. Look up the entry matching `__APP_VERSION__` and wrap the existing
   footer `<div>` in a `Tooltip` whose `title` is a small `<ul>` of the `changes` array (or a
   fallback string, e.g. `"No changes recorded for this version"`, if no entry matches).

3. No changes to `vite.config.ts`, `vite-env.d.ts`, or CSS are required. The footer's
   existing class/styling is untouched; only the JSX gains a `Tooltip` wrapper.

## Implementation Steps

1. Create `frontend/src/changelog.ts` with the `ChangelogEntry` type and a `CHANGELOG` array
   seeded with one entry for `1.2.0` (bullets sourced from recent commit log, per above).
2. Edit `frontend/src/components/layout/AppLayout.tsx`:
   - Add `Tooltip` to the existing `@mui/material` import on line 5.
   - Import `CHANGELOG` from `../../changelog`.
   - Compute `const currentChangelog = CHANGELOG.find(e => e.version === __APP_VERSION__);`
     near the top of the component (or inline where the footer renders).
   - Replace the plain footer `div` with a `Tooltip` wrapping it, `title` built from
     `currentChangelog?.changes` (mapped to a `<ul>/<li>` list) or the fallback string.
3. No Prisma/schema/env changes; no backend changes; no new dependencies.

## Dependencies

- `@mui/material` `Tooltip` — already installed (`^7.3.8`), already used elsewhere in this
  codebase (e.g. `FuelStationsPage.tsx`). Per the Dependency & Documentation Policy, doc
  verification is not required for dependencies already exercised elsewhere in the project.

## Configuration Changes

None (no env vars, no Prisma schema, no MSAL/Graph scopes).

## Maintenance Note (for future versions)

Going forward, each version bump to `package.json` should be paired with a new entry
appended to `CHANGELOG` in `frontend/src/changelog.ts`. This is a manual-discipline step,
not automated by this change — flagged as a risk below.

## Risks and Mitigations

- **Risk:** Changelog data drifts out of sync with `package.json` version if a future release
  bumps the version without adding a `CHANGELOG` entry, leaving the tooltip showing the
  fallback "no changes recorded" message.
  **Mitigation:** The fallback message degrades gracefully (no crash, no blank tooltip) —
  acceptable given this is a manual data file by design (see Proposed Solution).
- **Risk:** None to backend, auth, or data — this is a frontend-only, read-only, static-data
  display change.

## Files to be Created/Modified

- **Create:** `frontend/src/changelog.ts`
- **Modify:** `frontend/src/components/layout/AppLayout.tsx`

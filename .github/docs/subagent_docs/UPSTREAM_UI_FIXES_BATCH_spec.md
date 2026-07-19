# Spec: Upstream UI Fixes Batch (5 fixes)

## Source

Five fix write-ups were supplied by the user, each documenting a bug found and
fixed in a separate local test copy of this repo, with root-cause analysis,
exact diffs, and a "recreate upstream" prompt:

1. `docs/work-order-status-priority-colors.md`
2. `docs/inventory-audit-dark-mode-contrast.md`
3. `docs/intune-test-mode-toggle-mobile-wrap.md`
4. `docs/work-order-back-button-location-filter.md`
5. `docs/mobile-dark-drawer-outline.md`

Phase 1 research consisted of verifying, file-by-file, that this repo
(upstream) matches the pre-fix state each doc assumes. All target files were
located at the exact paths named in the docs and read in full; current
content matches the "before" state of every diff exactly (confirmed via
direct `Read`, not assumed). No dependency additions, no version-sensitive
API usage, no Prisma/schema changes — all 5 fixes are frontend-only
(styling/state), so the Dependency & Documentation Policy's exemption for
"styling/UI-only changes" and "refactors without new external libraries"
applies; no external doc lookups were required.

## Problem definition (5 independent bugs)

1. **Work Order status/priority chip color collision** — `WorkOrderStatusChip`
   and `WorkOrderPriorityChip` both map their enum onto MUI's 7 stock `Chip`
   colors, causing OPEN/MEDIUM to both render blue (`info`), IN_PROGRESS/HIGH
   both orange (`warning`), RESOLVED/LOW both green (`success`), and
   ON_HOLD/CLOSED both grey (`default`, only CLOSED has `outlined` as a second
   cue). A chip's color alone is ambiguous as to which axis (status vs.
   priority) it represents.

2. **Inventory Audit dark-mode contrast** — `AuditItemRow.tsx` hardcodes
   light-mode-only hex colors for row background/border keyed by status and
   the `isAddition` flag; these never adapt when MUI's CSS-variable dark
   scheme is active, producing near-white rows with invisible text in dark
   mode. `UnresolvedItemsTable.tsx` uses MUI's static `grey.50` (identical in
   both schemes) for the resolve dialog's summary box. `AuditItemList.tsx`
   hardcodes MUI's default light-mode primary blue (`#1976d2`) for the
   "N added" text.

3. **Intune Test Mode toggle mobile wrap** — in both
   `IntuneScanWizardTab.tsx` and `IntuneDeviceActionsPage.tsx`, the Dry
   Run/Test Mode `Switch` + label is passed via MUI `Alert`'s `action` prop.
   `Alert`'s flex row defaults to `nowrap` and the action slot has no
   `flex-shrink: 0`, so on narrow viewports the long alert message text
   squeezes the action slot to near-zero width; combined with a global
   `overflow-wrap: break-word`, the label text shatters character-by-character
   instead of wrapping as a word.

4. **Work Orders "All Schools" filter reverts on Back** —
   `WorkOrderListPage.tsx`'s `location` filter defaults to `''`, which is
   also the value of the "All Schools" option. `useFilterParams`
   (`frontend/src/hooks/useFilterParams.ts`) omits any param from the URL
   when it equals the declared default, so choosing "All Schools" is
   indistinguishable from "no location filter set yet." A home-school
   auto-default effect re-fires on remount (e.g. after Back navigation from
   `/work-orders/:id`, a separate route) and silently overrides the user's
   explicit "All Schools" choice.

5. **Mobile dark-mode nav drawer gray outline** — `AppLayout.tsx` renders the
   mobile nav in a MUI `Drawer` whose `sx` only sets `width`/`top`/`height` on
   `.MuiDrawer-paper` — no `background-color`/`box-shadow` override. The
   child `<nav className="shell-sidebar shell-sidebar--mobile">` sets its own
   background per color scheme, but the Drawer's own unstyled `Paper` falls
   back to MUI's default dark `background.paper` + elevation overlay/shadow,
   which visibly mismatches the nav's own dark fill — showing as a gray
   outline framing the drawer. Invisible in light mode because MUI's default
   light Paper background (`#fff`) coincidentally matches the nav's own white
   background.

## Proposed solution / implementation steps

All 5 fixes are applied exactly as specified in the source docs (diffs
independently verified against current file content in Phase 1 — they apply
cleanly with no adaptation needed):

1. **`frontend/src/theme/theme.ts`** — add TS module augmentation for
   `@mui/material/styles` (`Palette`/`PaletteOptions`) and
   `@mui/material/Chip` (`ChipPropsColorOverrides`), then add 9 new palette
   tokens (`statusOpen/InProgress/OnHold/Resolved/Closed`,
   `priorityLow/Medium/High/Urgent`) to both `colorSchemes.light.palette` and
   `colorSchemes.dark.palette`, each with `main` + `contrastText`.
   **`WorkOrderStatusChip.tsx`** / **`WorkOrderPriorityChip.tsx`** — point
   their color-map `Record`s at the new tokens instead of shared MUI tokens.
   No JSX/behavior change.

2. **`AuditItemRow.tsx`** — delete the `statusColor`/`statusBorderColor` hex
   maps and the `isAddition` background override; replace the row `Box`'s
   `borderColor`/`backgroundColor` with `'divider'` / `'background.paper'`
   (status already conveyed by the existing icon + `Chip`). Remove the
   now-unused `AuditItemStatus` type import.
   **`UnresolvedItemsTable.tsx`** — `bgcolor: 'grey.50'` → `'action.hover'`.
   **`AuditItemList.tsx`** — `sx={{ color: '#1976d2' }}` → `sx={{ color:
   'info.main' }}`.

3. **`IntuneScanWizardTab.tsx`** and **`IntuneDeviceActionsPage.tsx`** (same
   markup shape, both occurrences) — on the Dry Run `Alert`'s `sx`, add
   `flexWrap: 'wrap'` and `'& .MuiAlert-action': { flexShrink: 0, pt: 0 }`;
   on the label `Typography`'s `sx`, add `whiteSpace: 'nowrap'`.

4. **`WorkOrderListPage.tsx`** (only — `useFilterParams.ts` is intentionally
   untouched, per the doc's explicit scope note, since ~15 other list pages
   depend on its current omit-default behavior) — add a second URL-tracked
   flag `locationChosen: ''` to the `useFilterParams` defaults; change the
   home-school auto-default effect's skip condition to
   `hasFilterParam('location') || hasFilterParam('locationChosen')`; set
   `locationChosen: '1'` in both the mobile-drawer and desktop location
   `<Select onChange>` handlers; reset `locationChosen: ''` in the "Clear
   Filters" handler.

5. **`AppLayout.css`** — add one dark-mode-scoped rule immediately after the
   existing `:root.dark .shell-sidebar--mobile` rule:
   `:root.dark .shell-drawer--mobile .MuiDrawer-paper { background-color:
   var(--slate-100, #1e293b); background-image: none; box-shadow: none; }`.
   No TSX change — `shell-drawer--mobile` is already applied to the `Drawer`
   in `AppLayout.tsx:324`.

## Dependencies

None — no new packages; all 5 fixes use only already-installed MUI v7 APIs
(`createTheme` `colorSchemes`, `sx` theme tokens, TS module augmentation
patterns already exercised elsewhere in this codebase, e.g.
`WorkOrderPriorityChip`/`WorkOrderStatusChip` already use `ChipProps['color']`
typing).

## Configuration changes

None — no env vars, no Prisma schema changes, no Graph/MSAL scope changes.

## Risks and mitigations

- **Risk:** new palette tokens collide with existing MUI token names →
  **Mitigation:** names (`statusOpen`, `priorityLow`, etc.) are unique,
  verified via grep; no existing `statusX`/`priorityX` palette keys exist.
- **Risk:** `locationChosen` flag interacts badly with the shared
  `useFilterParams` hook for other consumers → **Mitigation:** the hook
  itself is untouched; the flag is a WorkOrderListPage-local addition, no
  other page reads or writes it.
- **Risk:** CSS-only fixes (3, 5) regress other Alert/Drawer instances →
  **Mitigation:** fix 3's `sx` changes are scoped to the two named `Alert`
  instances only (not a global style); fix 5's selector
  `.shell-drawer--mobile .MuiDrawer-paper` matches only the one Drawer
  instance in `AppLayout.tsx`, confirmed via grep — no other `Drawer` in the
  app uses this class.
- **Risk:** removing `AuditItemRow`'s color maps changes status legibility →
  **Mitigation:** the status icon (`CheckCircleOutlineIcon`/`CancelOutlinedIcon`/
  `HelpOutlineIcon`, already theme-token-colored) and the status `Chip` both
  remain untouched and already convey the same information; this matches the
  existing convention already used by Work Orders (fix 1's `Chip`-only
  color pattern).

## Build/validation commands to be used in Phase 3/6

- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml build backend` (unaffected by
  these changes but run for parity/cache validation)
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS are used at any point.

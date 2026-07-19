# Fix: Inventory Audit item rows unreadable in dark mode

**Status:** Fixed and verified in this repo (preflight passed).
**Where:** Inventory Audit page — the per-room audit item list, the
unresolved-items resolve dialog, and the session summary header.

## Symptom

In dark mode, Inventory Audit item rows render as near-white cards with
text that is essentially invisible against them (reported via screenshot —
5 unverified item rows on the "Hillcrest Elementary" audit, all unreadable).

## Root cause

The frontend theme (`frontend/src/theme/theme.ts`) uses MUI v7's
CSS-variables theming (`createTheme({ cssVariables: { colorSchemeSelector:
'class' }, colorSchemes: { light, dark } })`), toggled via a `class` on the
root element. `ThemeProvider` in `main.tsx` does **not** set
`forceThemeRerender`.

Per MUI v7 docs, without `forceThemeRerender`, MUI's own components stay
correct across a color-scheme switch because their internal styles read
`(theme.vars || theme).palette.*`, which resolve to CSS custom properties
(`var(--mui-palette-*)`) that the browser repaints automatically when the
root `class` changes. Any inline style that instead uses a **literal
hex/rgb string** is frozen at whatever was hardcoded — it never
participates in the scheme switch at all.

Three spots in the Inventory Audit feature did exactly this:

1. `AuditItemRow.tsx` — a `statusColor` / `statusBorderColor` map plus an
   `isAddition` override, all hardcoded light-mode hex (`#e8f5e9`,
   `#ffebee`, `#fafafa`, `#a5d6a7`, `#ef9a9a`, `#e0e0e0`, `#e3f2fd`,
   `#90caf9`) used as the entire row `Box`'s background/border. This is the
   row in the reported screenshot.
2. `UnresolvedItemsTable.tsx` — `bgcolor: 'grey.50'` on the resolve
   dialog's equipment-summary box. `grey.50` is MUI's static grey scale
   (`#fafafa`), identical in both color schemes — not a semantic/adaptive
   token — so it produces the same near-white-box-with-light-text problem.
3. `AuditItemList.tsx` — `sx={{ color: '#1976d2' }}` on the "N added"
   summary text, hardcoded to MUI's default *light*-mode primary blue.

Compare with `frontend/src/components/work-orders/WorkOrderStatusChip.tsx`
and `WorkOrderPriorityChip.tsx`, which never exhibited this bug: Work
Orders conveys status/priority entirely through MUI `Chip`'s semantic
`color` prop (`color="success"` / `"error"` / etc.), never a custom
row/card background, so it's dark-mode-safe by construction.

## Fix

No new dependency, no behavior change — swapped hardcoded colors for
theme-adaptive `sx` string tokens, and (for the row background) removed
the custom tint entirely in favor of the pattern Work Orders already uses:
color lives only in the existing status icon and `Chip`, not the row
background.

### Files changed

- `frontend/src/components/inventory-audit/AuditItemRow.tsx`
- `frontend/src/components/inventory-audit/UnresolvedItemsTable.tsx`
- `frontend/src/components/inventory-audit/AuditItemList.tsx`

### Exact diffs

**`AuditItemRow.tsx`** — deleted the hex color maps and switched the row
to neutral theme tokens (status is still conveyed by the existing icon +
`Chip`, both already theme-token driven):

```diff
-  const statusColor: Record<AuditItemStatus, string> = {
-    PRESENT: '#e8f5e9',
-    MISSING: '#ffebee',
-    UNVERIFIED: '#fafafa',
-  };
-
-  const statusBorderColor: Record<AuditItemStatus, string> = {
-    PRESENT: '#a5d6a7',
-    MISSING: '#ef9a9a',
-    UNVERIFIED: '#e0e0e0',
-  };
-
-  // Addition items get a distinct light-blue background regardless of status
-  const backgroundColor = item.isAddition ? '#e3f2fd' : statusColor[item.status];
-  const borderColor = item.isAddition ? '#90caf9' : statusBorderColor[item.status];
-
   return (
     <Box
       sx={{
         ...
         borderRadius: 1,
         border: '1px solid',
-        borderColor,
-        backgroundColor,
-        transition: 'background-color 0.2s',
+        borderColor: 'divider',
+        backgroundColor: 'background.paper',
       }}
     >
```

Also removed the now-unused `AuditItemStatus` type import that only the
deleted maps referenced.

**`UnresolvedItemsTable.tsx`** — swap the static grey constant for the
adaptive token already used elsewhere in this same feature
(`AuditItemList.tsx`'s search box uses `backgroundColor: 'action.hover'`):

```diff
-          <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
+          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
```

**`AuditItemList.tsx`** — swap the hardcoded light-mode blue for the
semantic token, consistent with the `color="info"` `Chip` used for the
same "Added" concept a few lines above:

```diff
-                <Typography variant="body2" sx={{ color: '#1976d2' }}>{session.additionCount} added</Typography>
+                <Typography variant="body2" sx={{ color: 'info.main' }}>{session.additionCount} added</Typography>
```

## Verification performed

- `docker compose -f docker-compose.dev.yml build frontend` — `tsc && vite
  build` succeeded (caught and fixed one orphaned type import along the
  way: `AuditItemStatus` was left imported but unused after removing the
  color maps that referenced it).
- Full `scripts/preflight.ps1` — backend build, frontend build, and 38
  backend tests all passed (exit code 0).
- No state/prop/logic change — purely visual; the status icon and `Chip`
  that already convey PRESENT/MISSING/UNVERIFIED/Added are untouched.

## Local spec/review docs

- `.github/docs/subagent_docs/inventory_audit_dark_mode_contrast_spec.md`
- `.github/docs/subagent_docs/inventory_audit_dark_mode_contrast_review.md`

---

## Prompt for Claude — recreate this fix upstream

Paste the block below to a Claude instance working directly in the
upstream Tech-V2 repo (this fix was made in a local test copy and needs to
be reproduced there):

> In this repo, find the Inventory Audit feature's item-row component —
> the piece that renders one equipment item within an audit session as a
> bordered/colored row with a status icon, an equipment tag + name, a
> status `Chip`, and "In Room" / "Not In Room" buttons (search for the
> string `Not In Room` or a component named something like
> `AuditItemRow` to locate it; confirm the actual path in this repo rather
> than assuming — it was at
> `frontend/src/components/inventory-audit/AuditItemRow.tsx` in the repo
> this fix was developed in).
>
> Bug: in dark mode, item rows render as near-white/light-colored cards
> with unreadable (near-invisible) text. Root cause: the row's background
> and border colors are hardcoded light-mode-only hex values (e.g. pale
> green/red/grey/blue tints keyed by item status, plus a distinct tint for
> "added" items), assigned as literal `backgroundColor`/`borderColor`
> values in the component's `sx` prop. If this project's theme uses MUI's
> CSS-variables theming (check `createTheme` for a `cssVariables` option
> and/or `colorSchemes: { light, dark }`), any literal hex/rgb color
> bypasses that system entirely and never adapts to the active scheme —
> only `sx` string tokens (e.g. `'divider'`, `'background.paper'`,
> `'success.main'`) or MUI's own components (`Chip`, `Alert`, icons using
> `sx={{ color: 'success.main' }}`) resolve against the live theme and
> stay correct in both modes.
>
> Check whether the row already has some other status indicator — a
> colored icon and/or a status `Chip` (e.g. `color="success"` /
> `"error"` for present/missing, an outlined chip for unverified, an
> outlined info-colored "Added" chip for items added mid-audit). If so,
> those are already dark-mode-safe and are duplicating what the row
> background is (badly) trying to do. Fix by deleting the hardcoded color
> map(s) driving the row's background/border and replacing them with
> neutral theme tokens — `borderColor: 'divider'`,
> `backgroundColor: 'background.paper'` — so status coloring lives only in
> the icon/Chip, not the row background. Also check this repo's other
> feature areas (e.g. a Work Orders / ticketing list) for whether they
> already use this "color lives in the Chip only" convention for
> status/priority — if so, explicitly match that existing convention
> rather than inventing a new one.
>
> While you're in this component's file and its immediate siblings (the
> list/container component and any related dialog), grep for other
> hardcoded hex colors or MUI's static `grey.*` shades (e.g. `grey.50`,
> which is identical in both color schemes and not an adaptive token) used
> as a `bgcolor`/`color`, and swap them for the nearest adaptive token too
> (`action.hover` for a neutral highlighted box, `info.main` /
> `success.main` / etc. for semantic text) — don't stop at the first file
> if the same anti-pattern repeats nearby.
>
> This is a styling-only change — no state, props, business logic, or
> markup structure changes, and no new dependency. Remove any import that
> becomes unused as a result (e.g. a type that only the deleted color map
> referenced). Follow this repo's own contribution workflow (spec →
> implement → review → build/test validation → commit message) if one is
> defined in its root CLAUDE.md or equivalent; otherwise implement
> directly, then run whatever build/typecheck commands this repo defines
> and confirm they pass before considering the fix complete.

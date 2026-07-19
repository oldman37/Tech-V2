# Fix: Work Order status and priority chips share colors

**Status:** Fixed and verified in this repo (Phase 3 review PASS, preflight passed).
**Where:** Work Orders — the status/priority columns on the work order list
page and the status/priority chip pair on the work order detail page header.

## Symptom

The status chip and priority chip render side by side (list columns, and
next to each other in the detail header), but both draw from MUI's same 7
built-in semantic chip colors, so the same color means two different
things depending on which chip you're looking at:

- `info` (blue) → `OPEN` status **and** `MEDIUM` priority
- `warning` (orange) → `IN_PROGRESS` status **and** `HIGH` priority
- `success` (green) → `RESOLVED` status **and** `LOW` priority
- `default` (grey) → `ON_HOLD` **and** `CLOSED` status (only told apart by
  `CLOSED`'s `outlined` variant, not color)

A blue chip next to a work order could mean "this is open" or "this is
medium priority" — there was no way to tell at a glance which axis a color
belonged to.

## Root cause

`frontend/src/components/work-orders/WorkOrderStatusChip.tsx` and
`WorkOrderPriorityChip.tsx` each maintain an independent
`Record<Status|Priority, ChipProps['color']>` map, but both pick from the
same pool of 7 MUI tokens (`default` / `primary` / `secondary` / `error` /
`info` / `success` / `warning`). With 5 status values + 4 priority values
= 9 distinct concepts needing zero overlap, 7 tokens was never enough —
the two maps were guaranteed to collide once both dimensions used more
than 3–4 semantic colors each. `frontend/src/theme/theme.ts` only
overrode `primary`; `info`/`warning`/`success`/`default` were untouched
MUI stock colors, so nothing separated the two components' color spaces.

## Fix

No behavior change — added 9 new custom MUI theme palette tokens (5 for
status, 4 for priority) split into two hue families that never overlap:
status uses cool/neutral hues (blue, violet, slate, teal, charcoal),
priority keeps a warm severity ramp (green → amber → orange → red). Each
token has an explicit light-mode and dark-mode `main` + `contrastText`,
verified ≥4.5:1 WCAG AA contrast in both modes. Both chip components now
point at the new tokens instead of the shared MUI ones. `CLOSED` keeps its
existing `outlined` variant as a second, non-color cue distinguishing it
from `ON_HOLD`.

### Files changed

- `frontend/src/theme/theme.ts`
- `frontend/src/components/work-orders/WorkOrderStatusChip.tsx`
- `frontend/src/components/work-orders/WorkOrderPriorityChip.tsx`

### Exact diffs

**`theme.ts`** — added TS module augmentation (`Palette`/`PaletteOptions`
for the theme, `ChipPropsColorOverrides` so `Chip`'s `color` prop accepts
the new token names) and the 9 palette entries per color scheme:

```diff
 import { createTheme } from '@mui/material/styles';

+declare module '@mui/material/styles' {
+  interface Palette {
+    statusOpen: Palette['primary'];
+    statusInProgress: Palette['primary'];
+    statusOnHold: Palette['primary'];
+    statusResolved: Palette['primary'];
+    statusClosed: Palette['primary'];
+    priorityLow: Palette['primary'];
+    priorityMedium: Palette['primary'];
+    priorityHigh: Palette['primary'];
+    priorityUrgent: Palette['primary'];
+  }
+  interface PaletteOptions {
+    statusOpen?: PaletteOptions['primary'];
+    statusInProgress?: PaletteOptions['primary'];
+    statusOnHold?: PaletteOptions['primary'];
+    statusResolved?: PaletteOptions['primary'];
+    statusClosed?: PaletteOptions['primary'];
+    priorityLow?: PaletteOptions['primary'];
+    priorityMedium?: PaletteOptions['primary'];
+    priorityHigh?: PaletteOptions['primary'];
+    priorityUrgent?: PaletteOptions['primary'];
+  }
+}
+
+declare module '@mui/material/Chip' {
+  interface ChipPropsColorOverrides {
+    statusOpen: true;
+    statusInProgress: true;
+    statusOnHold: true;
+    statusResolved: true;
+    statusClosed: true;
+    priorityLow: true;
+    priorityMedium: true;
+    priorityHigh: true;
+    priorityUrgent: true;
+  }
+}
+
 export const theme = createTheme({
   cssVariables: {
     colorSchemeSelector: 'class',
   },
   colorSchemes: {
     light: {
       palette: {
         primary: {
           main: '#3b82f6',
           dark: '#2563eb',
         },
+        statusOpen: { main: '#2563eb', contrastText: '#ffffff' },
+        statusInProgress: { main: '#7c3aed', contrastText: '#ffffff' },
+        statusOnHold: { main: '#475569', contrastText: '#ffffff' },
+        statusResolved: { main: '#0f766e', contrastText: '#ffffff' },
+        statusClosed: { main: '#334155', contrastText: '#ffffff' },
+        priorityLow: { main: '#15803d', contrastText: '#ffffff' },
+        priorityMedium: { main: '#a16207', contrastText: '#ffffff' },
+        priorityHigh: { main: '#c2410c', contrastText: '#ffffff' },
+        priorityUrgent: { main: '#dc2626', contrastText: '#ffffff' },
       },
     },
     dark: {
       palette: {
         primary: {
           main: '#60a5fa',
           dark: '#3b82f6',
         },
+        statusOpen: { main: '#60a5fa', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        statusInProgress: { main: '#a78bfa', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        statusOnHold: { main: '#94a3b8', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        statusResolved: { main: '#2dd4bf', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        statusClosed: { main: '#cbd5e1', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        priorityLow: { main: '#4ade80', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        priorityMedium: { main: '#fbbf24', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        priorityHigh: { main: '#fb923c', contrastText: 'rgba(0, 0, 0, 0.87)' },
+        priorityUrgent: { main: '#f87171', contrastText: 'rgba(0, 0, 0, 0.87)' },
       },
     },
   },
 });
```

**`WorkOrderStatusChip.tsx`**:

```diff
 const STATUS_COLOR: Record<WorkOrderStatus, ChipProps['color']> = {
-  OPEN:        'info',
-  IN_PROGRESS: 'warning',
-  ON_HOLD:     'default',
-  RESOLVED:    'success',
-  CLOSED:      'default',
+  OPEN:        'statusOpen',
+  IN_PROGRESS: 'statusInProgress',
+  ON_HOLD:     'statusOnHold',
+  RESOLVED:    'statusResolved',
+  CLOSED:      'statusClosed',
 };
```

(`CLOSED`'s `variant={key === 'CLOSED' ? 'outlined' : 'filled'}` is unchanged.)

**`WorkOrderPriorityChip.tsx`**:

```diff
 const PRIORITY_COLOR: Record<WorkOrderPriority, ChipProps['color']> = {
-  LOW:    'success',
-  MEDIUM: 'info',
-  HIGH:   'warning',
-  URGENT: 'error',
+  LOW:    'priorityLow',
+  MEDIUM: 'priorityMedium',
+  HIGH:   'priorityHigh',
+  URGENT: 'priorityUrgent',
 };
```

## Verification performed

- Computed WCAG relative-luminance contrast ratios for all 9 tokens in
  both color schemes; every filled-chip pairing clears 4.5:1 AA (worst
  case 4.83:1, best case 14.14:1) — independently re-verified by the
  Phase 3 review agent.
- Confirmed no hex value repeats between the status set and the priority
  set, in either scheme.
- `docker compose -f docker-compose.dev.yml build frontend` — `tsc &&
  vite build` succeeded with zero type errors.
- Full `scripts/preflight.ps1` — backend build, frontend build, and 38
  backend tests all passed (exit code 0).
- No state/prop/logic change — purely a color-token swap; chip labels,
  sizes, and the `CLOSED` outlined variant are untouched. Confirmed via
  `git diff --stat` that only the 3 files above changed.

## Local spec/review docs

- `.github/docs/subagent_docs/work_order_status_priority_colors_spec.md`
- `.github/docs/subagent_docs/work_order_status_priority_colors_review.md`

---

## Prompt for Claude — recreate this fix upstream

Paste the block below to a Claude instance working directly in the
upstream Tech-V2 repo (this fix was made in a local test copy and needs
to be reproduced there):

> In this repo, find the Work Orders feature's status and priority chip
> components — small components that render a work order's status
> (Open/In Progress/On Hold/Resolved/Closed, or equivalent) and priority
> (Low/Medium/High/Urgent, or equivalent) as MUI `Chip`s, typically shown
> side by side in a work order list and/or detail view (search for a
> status-label map and a priority-label map, or component names like
> `WorkOrderStatusChip` / `WorkOrderPriorityChip` — confirm the actual
> paths in this repo rather than assuming; in the repo this fix was
> developed in they were at
> `frontend/src/components/work-orders/WorkOrderStatusChip.tsx` and
> `WorkOrderPriorityChip.tsx`).
>
> Bug: both chip components independently map their enum values onto
> MUI's built-in `Chip` `color` prop (the ~7 stock tokens: `default`,
> `primary`, `secondary`, `error`, `info`, `success`, `warning`). Because
> both components render next to each other and both draw from the same
> small token pool, several values collide onto the same visual color even
> though they mean different things — e.g. an "Open" status chip and a
> "Medium" priority chip might both render `info` (blue), or two different
> statuses might both render `default` (grey), so a chip's color alone
> doesn't reliably tell you what it represents. Read both components'
> color-mapping objects to find the exact current overlaps in this repo
> before designing the fix — the specific collisions may differ from the
> example above depending on how many status/priority values this repo
> has and which MUI tokens they currently use.
>
> Fix: since MUI's Chip only has ~7 semantic colors and a full status +
> priority set can easily need 8–9+ distinct colors with zero reuse across
> the two dimensions, extend this repo's MUI theme (find the file that
> calls `createTheme`, likely `frontend/src/theme/theme.ts` or similar)
> with new named custom palette tokens — one per status value, one per
> priority value — via `colorSchemes.light`/`colorSchemes.dark` (or
> `palette` directly if this repo's MUI version/theme doesn't use
> `colorSchemes`), each with an explicit `main` and `contrastText` for both
> light and dark mode. Use two visually separate hue families so status
> and priority can never look alike: a cool/neutral family for status
> (e.g. blue, violet, slate, teal, dark neutral) and a warm
> severity-ramp family for priority (green → amber/yellow → orange → red,
> low to urgent) — or whatever hue split makes sense for this repo's exact
> status/priority values, as long as no hex is shared between the two
> sets. Add TypeScript module augmentation for `@mui/material/styles`
> (`Palette`/`PaletteOptions`) and `@mui/material/Chip`
> (`ChipPropsColorOverrides`) so the new token names are valid values for
> `Chip`'s `color` prop and the theme compiles — check the installed MUI
> major version's own docs for the current augmentation pattern before
> writing it, since this API has changed across MUI major versions. Verify
> every new color against WCAG AA (≥4.5:1 contrast) for its paired text
> color in both light and dark mode (a simple relative-luminance contrast
> calculation is enough — don't skip this, since some naive color/text
> pairings especially in dark mode with light backgrounds and dark text,
> or vice versa, fail AA easily). Then update the two chip components'
> color-mapping objects to point at the new tokens instead of the old
> shared ones. If any status or priority value currently relies on
> something other than color alone to stay distinguishable (e.g. an
> `outlined` vs `filled` variant), keep that as-is — it's a useful second
> cue, not something to remove.
>
> This is a styling-only change — no state, props, labels, sizes, or
> business logic changes, and no new dependency (it only uses the MUI
> version already installed). Follow this repo's own contribution
> workflow (spec → implement → review → build/test validation → commit
> message) if one is defined in its root CLAUDE.md or equivalent;
> otherwise implement directly, then run whatever build/typecheck
> commands this repo defines and confirm they pass before considering the
> fix complete.

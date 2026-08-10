# Work Order Detail — Colored Chip Status Picker (Spec)

## Current State Analysis

`frontend/src/pages/WorkOrderDetailPage.tsx` renders the "New Status" field
inside the status composer (`activeAction === 'status'` block,
`WorkOrderDetailPage.tsx:1104-1121`) as an MUI `FormControl` + `Select` +
`MenuItem` list, filtered to the statuses allowed from the work order's
current status (`ALLOWED_NEXT_STATUSES`, `WorkOrderDetailPage.tsx:105-111`,
max 4 options). Below it, a static legend (`STATUS_KEY_LEGEND`,
`WorkOrderDetailPage.tsx:113-117`) explains what "In Progress" / "On Hold" /
"Long Term" mean, rendered as plain `Typography` lines
(`WorkOrderDetailPage.tsx:1134-1139`).

The most recent commit on this file (`9e896ad`, today) patched a mobile
usability problem: opening the status composer left the `Select` rendering
below the visible viewport, requiring a manual scroll. A `scrollIntoView`
effect was added on the composer's wrapping `Box` (`statusFieldRef`,
`WorkOrderDetailPage.tsx:676-681`) to mitigate it. That effect scrolls the
whole status section into view and is orthogonal to this change — it stays.

Status colors are already centralized: `WorkOrderStatusChip.tsx:8-14` defines
`STATUS_COLOR: Record<WorkOrderStatus, ChipProps['color']>` mapping each
status to a theme palette entry (`statusOpen`, `statusInProgress`,
`statusOnHold`, `statusLongTerm`, `statusClosed` — declared in
`frontend/src/theme/theme.ts:5-9,53-57,70-74`) and used to render the status
badge shown elsewhere on this same page (`WorkOrderDetailPage.tsx:865`) and
on the work order list page. `STATUS_COLOR` is not currently exported.

## Problem Definition

The user asked for alternatives to the dropdown for choosing the new status
and chose: replace the `Select`/`MenuItem` list with a row of colored,
tappable `Chip`s (one per allowed next status), reusing the same status
colors already shown on the status badge elsewhere in the app. This removes
a native menu overlay on mobile (the thing the prior commit had to work
around) and lets users recognize the target status by color instead of
reading a closed dropdown's currently-selected text.

Desktop layout is not a concern here — this section already sits in a single
column composer regardless of viewport; no responsive branching is needed.

## Proposed Solution

UI-only change. No new dependency (`Chip` is already imported in
`WorkOrderDetailPage.tsx:27`), no API/type changes — per the Dependency &
Documentation Policy this does not require external doc verification.

1. **Export `STATUS_COLOR` from `WorkOrderStatusChip.tsx`** (add the `export`
   keyword to the existing `const STATUS_COLOR = ...` declaration) so
   `WorkOrderDetailPage.tsx` can reuse the exact same status→color mapping
   instead of duplicating it. No behavior change to `WorkOrderStatusChip`
   itself.

2. **Replace the `FormControl`/`Select`/`MenuItem` block**
   (`WorkOrderDetailPage.tsx:1106-1121`) with a labeled row of `Chip`s:
   - A `Typography variant="caption" color="text.secondary"` label reading
     "New Status", matching the style already used for the legend directly
     below it (`WorkOrderDetailPage.tsx:1136`), replacing the `InputLabel`
     that is lost along with the `Select`.
   - A `Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}` containing
     one `Chip` per status in `STATUS_KEY_LEGEND`-equivalent filtered list —
     i.e. the same filter already used
     (`STATUSES.filter((s) => (ALLOWED_NEXT_STATUSES[workOrder.status] ?? []).includes(s.value))`).
   - Each `Chip`:
     - `label={s.label}`
     - `color={STATUS_COLOR[s.value]}`
     - `clickable` with `onClick={() => setNewStatus(s.value)}`
     - `variant={newStatus === s.value ? 'filled' : 'outlined'}` — selected
       status reads as a solid color-filled chip, unselected ones are
       outlined in that same color. This mirrors the existing convention in
       `WorkOrderStatusChip.tsx:28` (`CLOSED` uses `outlined`, others use
       `filled`) so "filled = active" reads consistently across the page.
     - `aria-pressed={newStatus === s.value}` — minimal toggle-button
       semantics for assistive tech, since the implicit `Select` semantics
       (labelled listbox with a selected option) go away.
     - `size="small"` to match the composer's existing small-scale controls.
   - No new component file — this is a small inline block, consistent with
     how the rest of the status/priority/assign fields are written directly
     in `WorkOrderDetailPage.tsx`.

3. **No change** to: `newStatus` state and its initialization
   (`WorkOrderDetailPage.tsx:656-658`), the `statusFieldRef` scroll effect,
   the `notifySubmitter` switch, the `STATUS_KEY_LEGEND` block, the submit
   button, or `handleStatusSubmit`. The chip row is a drop-in replacement for
   the `Select` only — it still just calls `setNewStatus`.

## Implementation Steps

1. `frontend/src/components/work-orders/WorkOrderStatusChip.tsx`: export
   `STATUS_COLOR`.
2. `frontend/src/pages/WorkOrderDetailPage.tsx`:
   - Import `STATUS_COLOR` from `@/components/work-orders/WorkOrderStatusChip`.
   - Replace the `FormControl`/`Select`/`MenuItem` block with the label +
     chip row described above.
   - Remove now-unused `FormControl`, `InputLabel`, `Select`, `MenuItem`
     imports **only if** nothing else in the file still uses them (verify
     before removing — `MenuItem`/`Select`/`FormControl`/`InputLabel` may be
     used by the priority or assign fields further down).

## Dependencies

None new. `Chip`, `Box`, `Typography` already imported and used elsewhere in
this file.

## Configuration Changes

None.

## Revision — Composer-Specific Chip Colors (User Feedback)

After the initial implementation, the user requested a color scheme specific
to this composer rather than reusing the status-badge palette
(`STATUS_COLOR`):

- **On Hold** (unselected): yellow text + yellow outline.
- **Closed** (unselected): red text + red outline.
- **Open / In Progress / Long Term** (unselected): neutral gray outline —
  chosen over keeping their existing badge colors (`statusOpen` is already
  blue) specifically to avoid clashing with the new "selected = blue" rule
  below (user-confirmed: "Neutral gray outline").
- **Any status, when selected**: solid filled blue, regardless of which
  status it is (user-confirmed: "Solid filled blue").

This supersedes the "reuse `STATUS_COLOR`" decision above **for this picker
only** — `WorkOrderStatusChip` (the read-only status badge shown elsewhere on
this page and on the list page) is unchanged and keeps its own palette.

### Revised Implementation

Rather than importing `STATUS_COLOR`, a small composer-local map covers only
the two statuses that need a non-default unselected color:

```ts
const STATUS_CHIP_COLOR: Partial<Record<WorkOrderStatus, ChipProps['color']>> = {
  ON_HOLD: 'warning',
  CLOSED:  'error',
};
```

`warning` / `error` are used rather than inventing new hex colors or theme
palette entries — they're MUI's built-in semantic colors, already used
elsewhere in this exact file for warning/error-toned chips
(`WorkOrderDetailPage.tsx:250,874`, `color="warning"`), and they render
amber/yellow and red respectively in this theme.

Each chip's `color`/`variant` becomes:

```tsx
color={newStatus === s.value ? 'primary' : (STATUS_CHIP_COLOR[s.value] ?? 'default')}
variant={newStatus === s.value ? 'filled' : 'outlined'}
```

`primary` is this theme's blue (`theme.ts` — `#3b82f6` light / `#60a5fa`
dark), matching the user's "turn blue" request without introducing a new
color.

Because `STATUS_COLOR` is no longer consumed by `WorkOrderDetailPage.tsx`
under this revision, the earlier `export` added to
`WorkOrderStatusChip.tsx:8` is reverted (no other file imports it — verified
via grep) to avoid leaving an unused export.

## Risks and Mitigations

- **Risk:** Removing `Select` drops native keyboard/listbox semantics.
  **Mitigation:** `Chip` with `onClick` renders as a focusable, keyboard-
  activatable element (MUI wraps it in `ButtonBase` when `onClick`/`clickable`
  is set); `aria-pressed` communicates selection state to assistive tech.
- **Risk:** Unused imports left behind if `Select`/`MenuItem`/`FormControl`/
  `InputLabel` were only used for this field.
  **Mitigation:** grep the file for remaining usages before deleting any
  import (Engineering Principle #3 — remove only what the change orphaned).
- **Risk:** Color-only differentiation is a colorblind-accessibility concern.
  **Mitigation:** each chip still carries its text label at all times (color
  is reinforcement, not the sole signal), and selected vs. unselected is
  additionally distinguished by filled vs. outlined variant, not color alone.

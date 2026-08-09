# Spec: Active Checkouts table wraps, clips, and distributes badly when narrowed

## Current state analysis

Confirmed against this repo (all three root causes present exactly as
described in the source doc, no divergence):

1. **`frontend/src/styles/global.css:368-372`** — `.table td { overflow-wrap:
   anywhere; }`. Two follow-up counter-guards already exist to undo its
   damage: `.table td .MuiChip-label` (391-396) and `.table td .MuiButton-root`
   (405-408), both forcing `white-space: nowrap`. `.responsive-table__expand-value`
   (657-661) has the same `anywhere`.
   - Note: `.MuiTableCell-root { overflow-wrap: anywhere; }` (377-379) is a
     **separate** rule for MUI tables that don't use `ResponsiveTable`'s
     column-fit calculation (Provisioning, Intune Device Actions, Line Items
     Editor, per its own comment). Out of scope — not part of this bug report,
     not part of the source fix, and changing it isn't necessary to fix
     `ResponsiveTable`. Left untouched per Surgical Changes.
2. **`frontend/src/components/responsive/ResponsiveTable.tsx`** — `estimateMinWidth`
   (line 55-61) budgets from header label text when no explicit `minWidth` is
   set on a column. `frontend/src/pages/DeviceManagement/CheckoutPage.tsx`'s
   `columns` array (144-277) supplies **no `minWidth`** on any of its 9
   columns (this repo has 9 data columns + 1 empty-label actions column at the
   time of this fix — Quick Fix has not yet been added here, so there are 4
   action buttons, matching the source repo's later-stated count exactly,
   before its own Quick Fix addition). The actions column (`key: 'actions',
   label: ''`) falls to `MIN_COLUMN_WIDTH_PX = 60` (line 51) while rendering 4
   labelled buttons (Check In / Edit / Assign or Replace Charger / Create
   Incident) needing far more.
   - Column drop priority (`getPriority`, line 63-69) defaults to array index
     when nothing is set; the actions column sits last in the array (index 8),
     so under the default rule it is dropped **first** among non-`hideOnMobile`
     columns when narrowed — backwards for an operational page.
   - The charger column (208-221) renders its serial with
     `whiteSpace: 'nowrap'` unconditionally (only the *truncation length* is
     mobile-gated via `chargerSerialDisplay(serial, isMobile)`, not the
     `nowrap` itself), making that cell's min-content width equal to the full
     serial. Confirmed `backend/src/validators/deviceAssignment.validators.ts`
     allows long serials (validated, shares a long prefix by design — checked
     to confirm the "opaque token" framing is accurate before applying
     `overflow-wrap: anywhere` there).
3. **`global.css:635-641`** — `.table td.responsive-table__expand-row` sets
   `display: grid` directly on the `<td>`. `ResponsiveTable.tsx:308` renders
   `<td colSpan={totalColSpan} className="responsive-table__expand-row">`
   with the hidden-column `<div>`s as direct children — no inner wrapper.
   Per CSS spec, `colspan` is only honored while the cell's used `display` is
   `table-cell`; overriding it to `grid` strips that and silently voids
   `colSpan`, confining the expand grid to column 1's width and stretching
   column 1 (an anonymous cell absorbs the oversized content and participates
   in column-1 sizing).

`.table-scroll-wrapper { overflow-x: auto; }` (global.css:628-631) wraps every
`.table` (`ResponsiveTable.tsx:233`), confirmed present — so switching
`overflow-wrap: anywhere` → `break-word` (which raises min-content width) will
degrade to a horizontal scrollbar rather than clipping, on this and every
other consumer of `.table`/`.responsive-table__expand-value`.

## Problem definition

Three independent, unrelated root causes co-occurring on one page:
(a) `overflow-wrap: anywhere` shreds ordinary words by also collapsing
min-content width to one character; (b) the column-fit budget is computed
from header text, not rendered content, so an empty-label actions column with
several buttons is drastically under-budgeted and columns don't drop until
far too late, then clip; (c) `display: grid` on a `<td>` silently discards its
`colSpan`, confining the expand-row content to column 1's width and
stretching that column.

## Proposed solution

Apply the same three-part fix as the source repo, scoped identically:

1. `.table td` and `.responsive-table__expand-value`:
   `overflow-wrap: anywhere` → `break-word`.
2. Split `.table td.responsive-table__expand-row` — keep `background-color`/
   `padding` on the `<td>`; move `display: grid` + `grid-template-columns` +
   `gap` to a new `.responsive-table__expand-grid` class on an inner wrapper
   `<div>` added in `ResponsiveTable.tsx`.
3. `CheckoutPage.tsx`: add explicit `minWidth` to all 9 columns sized to
   rendered content (not header text); set `priority: -3` on the actions
   column so it's the **last** column dropped, matching the source repo's
   reasoning (acting on a checkout is the page's purpose); change the charger
   serial span from `whiteSpace: 'nowrap'` to `overflowWrap: 'anywhere'`
   (opaque token, not prose — keeps the existing `title={serial}` tooltip for
   the full value).

`minWidth` values are re-derived for this repo's actual column content (same
method as the source fix: estimate against rendered text/component width, not
copied numbers) — see Implementation steps below for the exact values chosen
and why.

## Implementation steps

**`frontend/src/styles/global.css`**
- Line 371: `overflow-wrap: anywhere;` → `overflow-wrap: break-word;` (with a
  comment: `anywhere` also drops min-content width to a single character,
  which is why ordinary words were shredding).
- Line 660: same substitution on `.responsive-table__expand-value`.
- Lines 635-641: keep `background-color`/`padding` on
  `.table td.responsive-table__expand-row`; move `display: grid`,
  `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`, `gap` into a
  new `.responsive-table__expand-grid` rule, with a comment explaining a `td`
  overridden to `display: grid` loses table-cell semantics and its `colSpan`.

**`frontend/src/components/responsive/ResponsiveTable.tsx`**
- Wrap the `hiddenColumns.map(...)` output (currently direct children of the
  `<td className="responsive-table__expand-row">`) in
  `<div className="responsive-table__expand-grid">...</div>`, with a comment
  noting the `<td>` must stay `display: table-cell` for `colSpan` to work.
- This is a shared component — verify the change is a strict improvement for
  every other consumer of `ResponsiveTable`'s expand row (the `colSpan` bug
  was never working correctly anywhere, so this can only help).

**`frontend/src/pages/DeviceManagement/CheckoutPage.tsx`** — add `minWidth`
per column (estimated against this repo's actual rendered content, same 8px
CHAR_WIDTH_PX / 28px HEADER_PADDING_PX constants `ResponsiveTable` already
documents for its header-based estimate, cross-checked against what each cell
actually renders):

| Column | minWidth (px) | Basis |
|---|---|---|
| assigneeName | 140 | "Firstname Lastname" as a link |
| assigneeType | 100 | Chip label, never wraps |
| gradeLevel | 90 | Grade label text |
| assetTag | 150 | Asset tag (monospace) + " — " + device name |
| charger | 170 | Truncated/tail serial, monospace |
| location | 150 | Location name text |
| checkoutAt | 110 | "Aug 5, 2026"-style date, one line |
| checkoutCondition | 100 | `ConditionChip` |
| status | 120 | `DeviceStatusChip` |
| actions (empty label) | 180 | 4 labelled buttons wrapping to one column, widest label ("Assign Charger"/"Replace Charger") |

- `priority: -3` on the actions column.
- Charger cell: `style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}` →
  `style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}`, `title`
  tooltip unchanged.

This repo's actions column has 4 buttons (Check In, Edit,
Assign/Replace Charger, Create Incident) at the time of this fix — **not** 5;
the Quick Fix feature (`quick-fix-work-order-v2.md`) is a separate,
not-yet-implemented change to this same file being sequenced after this one.
`minWidth: 180` is sized for the widest single label wrapping to one column,
so it holds regardless of button count — re-confirm it's still adequate after
Quick Fix adds a 5th button, in that feature's own review.

## Dependencies

None — pure CSS/layout and column-definition changes, no new library.

## Configuration changes

None.

## Risks and mitigations

- **Risk:** `break-word` raises min-content width vs. `anywhere` everywhere
  `.table td` / `.responsive-table__expand-value` is used, which could make
  some other page's table prefer horizontal scroll where it previously
  (incorrectly) squeezed. **Mitigation:** confirmed `.table-scroll-wrapper`
  wraps every `.table` with `overflow-x: auto`, so the degrade path is a
  scrollbar, not clipping — a strict improvement.
- **Risk:** the expand-row wrapper-div change is in the shared
  `ResponsiveTable` component, affecting every page using it.
  **Mitigation:** the `colSpan` bug was not working correctly on any
  consumer before this fix (any page with hidden columns had the same
  confinement/stretch bug), so this is a strict improvement, not a behavior
  change consumers were relying on.
- **Risk:** hand-estimated `minWidth` values are not pixel-measured against
  this repo's actual fonts/padding (same caveat as the source fix).
  **Mitigation:** state this plainly in the review; the fit calculation is a
  heuristic by design and errs toward dropping a column slightly early rather
  than clipping; a manual resize sweep is recommended before treating this as
  visually confirmed.
- **Risk:** compile/build validation does not catch visual layout
  regressions. **Mitigation:** state plainly in the review that a manual
  browser resize sweep (full width down to the mobile breakpoint, expanding a
  row's dropdown at a few widths) is still needed.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml build backend` (unaffected;
  confirms no incidental breakage)
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS needed (presentation-only change; no schema, no host
npm, nothing database-touching).

# Spec: Dashboard module cards stretch to the tallest card in their row

## Current state analysis

`frontend/src/pages/Dashboard.tsx:73` (grid container, already fixed for column
sizing by `DASHBOARD_CARD_GRID_RESPONSIVE`):
```tsx
<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3 }}>
```
No `alignItems` is set, so CSS Grid defaults to `align-items: stretch`.

`frontend/src/pages/Dashboard.css:38-50` — the shared `.card` class used by
every module card in this grid (Inventory, Purchase Orders, Work Orders,
Users, Supervisors, Rooms, Reference Data) and by
`frontend/src/components/DashboardFieldTripCalendar.tsx:132` (`<div
className="card">`):
```css
.card {
  background: white;
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--slate-200);
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}
```
`height: 100%` on a grid item resolves against the grid area (row height),
not content — so it re-stretches the card even if `align-items: start` is
set on the container alone.

Every ordinary module card shares one structure (icon block, `<h3>` title,
one `<p>` description at `fontSize: 0.875rem`, `lineHeight: 1.5`, then a
full-width button). The `DashboardFieldTripCalendar` card renders an inline
month calendar and is several times taller than the others.

Current description strings and their rendered line count at the grid's
300px column minimum (verified against the actual JSX in `Dashboard.tsx`):
- "Manage equipment and assets" — 1 line
- "Create and track purchase orders" — 1 line
- "Submit and manage work orders" — 1 line
- "Manage users and permissions" — 1 line
- "Manage locations and supervisor assignments" — 2 lines
- "Manage rooms and spaces across locations" — 1 line
- "Manage brands, vendors, categories, models & funding sources" — up to 2
  lines at 300px; could reach 3 lines at narrower widths (see Risks).

## Problem definition

Two related symptoms:

1. CSS Grid's default `align-items: stretch`, compounded by `.card`'s
   `height: 100%`, stretches every card in a row to the height of the
   tallest — specifically the calendar card, leaving large empty space under
   the button of every ordinary card sharing its row.
2. Once stretching is removed, ordinary cards no longer line up with each
   other: a card with a 2-line description is visibly taller than one with a
   1-line description.

Desired behavior: cards with comparable content line up exactly; the
dramatically taller calendar card sizes to its own content without
inflating its row.

## Proposed solution

Scoped entirely to the dashboard grid container in `Dashboard.tsx` — no edit
to the shared `.card` class in `Dashboard.css`, since that class is also used
elsewhere and `height: 100%` may be intentional there:

```tsx
sx={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  alignItems: 'start',
  gap: 3,
  '& > .card': { height: 'auto' },
  '& > .card > p': { minHeight: '2.625rem' },
}}
```

- `alignItems: 'start'` stops Grid from stretching items to row height.
- `'& > .card': { height: 'auto' }` neutralizes `.card`'s `height: 100%` for
  this grid's direct children only.
- `'& > .card > p': { minHeight: '2.625rem' }` reserves exactly two lines
  (`0.875rem × 1.5 × 2`) for every card description, so 1-line and 2-line
  descriptions occupy identical vertical space and ordinary cards match by
  construction, without any stretching.

## Implementation steps

1. Edit the grid `Box`'s `sx` prop at `Dashboard.tsx:73` as above. No other
   file changes — no markup, content, icons, navigation, or click handlers
   are touched.

## Dependencies

None — pure CSS-in-JS (MUI `sx`) change, no new packages.

## Configuration changes

None.

## Risks and mitigations

- **Risk:** the Reference Data description ("Manage brands, vendors,
  categories, models & funding sources") could wrap to 3 lines at the grid's
  300px column floor, which would leave that card one line taller than its
  row-mates even with the 2-line `minHeight` reserved. **Mitigation:** this
  matches the known limitation already documented for this exact fix
  upstream; accepting it keeps the change minimal (raising to a 3-line
  `3.9375rem` minimum would add visible whitespace to every other card for a
  narrow-width edge case). Flagged here rather than silently fixed — a
  follow-up can raise the minimum if it's seen in practice.
- **Risk:** no live browser available in this environment to visually
  confirm rendered alignment. **Mitigation:** the change is a targeted,
  well-understood CSS mechanism (documented root cause, matching fix already
  verified working in a separate copy of this same page); build/typecheck
  validates compilation only, so a manual resize check in a real browser is
  recommended before treating this as fully confirmed.

## Build/validation commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate — also rebuilds backend and runs the
  backend test suite; unaffected by this change but run per workflow)

No backend changes, no Prisma migration, no FORBIDDEN COMMANDS involved.

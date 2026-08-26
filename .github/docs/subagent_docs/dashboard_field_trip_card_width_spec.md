# Spec: Field Trip Availability card renders at an inconsistent width

## Current state analysis
`frontend/src/pages/Dashboard.tsx`:
- Line 73: module cards live in `<Box sx={{ display: 'grid', gridTemplateColumns:
  'repeat(auto-fit, minmax(300px, 1fr))', gap: 3 }}>`.
- Lines 133-137: the Field Trip Availability card is rendered *after* that grid closes,
  inside its own `<Box sx={{ mt: 3, maxWidth: 420 }}>`.
- `frontend/src/components/DashboardFieldTripCalendar.tsx` line 132: the component's root
  is already `<div className="card">` (same class as every module card), and its calendar
  content is internally capped at `maxWidth: 360` (line 144).

## Problem definition
Because the card is not a member of the grid, its width comes from the arbitrary
`maxWidth: 420` wrapper rather than the grid's column tracks — landing between one column
and two columns plus gap, breaking the page's visual rhythm.

## Proposed solution architecture
Render the card as a plain grid item inside the same grid `Box`, and delete the separate
fixed-width wrapper. Width then comes from the identical `minmax(300px, 1fr)` track sizing
as every sibling card. A 2-column span is not warranted: the calendar's own content is
capped at 360px and fits inside a single column.

## Implementation steps
1. Move `{isStaff && <DashboardFieldTripCalendar />}` inside the grid `Box`, immediately
   before its closing tag; delete the `<Box sx={{ mt: 3, maxWidth: 420 }}>` wrapper.
   -> verify: `git diff` shows the wrapper removed and one line added inside the grid.
2. Frontend image build. -> verify: exits 0.

## Dependencies
None. No change to `DashboardFieldTripCalendar.tsx` or `Dashboard.css` — the `.card` class
already supplies padding/shadow/hover/`height: 100%`.

## Configuration changes
None.

## Risks and mitigations
- Risk: the `isStaff` gate is lost in the move. Mitigation: keep the conditional inline.
- Risk: content too wide for a 300px minimum column. Mitigation: the calendar's internal
  cap is `maxWidth: 360`, a maximum not a minimum, so it shrinks to the column.

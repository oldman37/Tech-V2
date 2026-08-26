# Spec: Dismiss button wraps mid-word on mobile (work order input-request banner)

## Current state
`frontend/src/pages/WorkOrderDetailPage.tsx` renders the "Input requested from
{name} by {name}" banner as an MUI `Alert severity="info"` whose `action` prop
carries a "Dismiss" `Button` (lines ~914-922). The Button has no `sx` prop.

## Problem
MUI renders `action` content in its own flex slot (`.MuiAlert-action`), which has
no `flex-shrink: 0`. On narrow viewports the Alert's flex row compresses that slot
below the button's natural width, so the label breaks mid-word ("DISMIS" / "S").

## Proposed solution
Add `sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}` to that Button.
- `whiteSpace: 'nowrap'` — stops the label itself from wrapping.
- `flexShrink: 0` — stops the action slot compressing below natural width.

## Implementation steps
1. Add the `sx` prop to the Dismiss Button. -> verify: `grep` shows the prop present.
2. Frontend image build. -> verify: `docker compose -f docker-compose.dev.yml build frontend` exits 0.

## Dependencies
None. Pure `sx` styling; MUI v7 already installed and `sx` is used throughout this file.

## Configuration changes
None.

## Risks and mitigations
- Risk: none functional — no state, props, handlers, or markup structure change.
- Visual-only change cannot be confirmed by `tsc`/`vite build`; flagged for manual check.

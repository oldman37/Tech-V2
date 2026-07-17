# Dark Mode Header Gradient Flip — Spec

## Current State Analysis
- `.shell-header` (light mode) at [AppLayout.css:16](frontend/src/components/layout/AppLayout.css#L16):
  `linear-gradient(90deg, #ffffff 0%, #e0e7ff 40%, var(--primary-blue, #3b82f6) 100%)` — light → light → blue, left to right.
- Dark mode override at [AppLayout.css:308-310](frontend/src/components/layout/AppLayout.css#L308-L310):
  `linear-gradient(90deg, #0f172a 0%, #1e3a8a 40%, var(--primary-blue, #3b82f6) 100%)` — dark navy → medium blue → bright blue, left to right (monotonically lightening).
- The SchoolWorks logo (`/schoolworks_logo.png`, rendered via `.shell-logo-full` at [AppLayout.tsx:287](frontend/src/components/layout/AppLayout.tsx#L287)) sits in `.shell-header-left`, i.e. at the 0% (leftmost) end of the gradient.
- The logo art is dark navy blue + green text on a transparent background — no light/white variant.

## Problem Definition
In dark mode, the gradient's darkest stop (`#0f172a`, near-black navy) sits directly behind the logo at the left edge of the header. A dark navy logo against a near-black background has low contrast and is hard to read.

## Proposed Solution
Reverse the color order of the dark-mode gradient only (light mode is unaffected and not in scope), so the brightest color sits at the left (behind the logo) and it darkens toward the right:

```css
:root.dark .shell-header {
  background: linear-gradient(90deg, var(--primary-blue, #3b82f6) 0%, #1e3a8a 60%, #0f172a 100%);
}
```

This keeps the same three colors and the same visual "weight" (mirrored stop positions: 0/40/100 → 100/60/0), just reversed, so the header still reads as an intentional brand gradient — it's now light-to-dark instead of dark-to-light, giving the logo a bright backdrop.

## Implementation Steps
1. Edit [AppLayout.css:309](frontend/src/components/layout/AppLayout.css#L309) — reverse the gradient stop order as above.
2. No other files reference this rule (confirmed via grep for `gradient` and `shell-header` across `frontend/src`).

## Dependencies
None — plain CSS value change, no new packages, no API surface touched.

## Configuration Changes
None.

## Risks and Mitigations
- **Risk:** Reversing could clash with `box-shadow` or text color (`color: #fff` at [AppLayout.css:17](frontend/src/components/layout/AppLayout.css#L17)) if the right-hand-side text/icons now sit against a near-black background instead of bright blue.
  - **Mitigation:** `.shell-user-info strong` already hardcodes `color: #ffffff` ([AppLayout.css:68](frontend/src/components/layout/AppLayout.css#L68)), which stays legible on `#0f172a`. No text color changes needed.
- **Risk:** Visual regression in light mode.
  - **Mitigation:** Change is scoped to the `:root.dark .shell-header` selector only; light-mode rule at line 16 is untouched.

## Build/Test Commands To Be Used In Phase 3/6
- `docker compose -f docker-compose.dev.yml build frontend` (styling-only change, frontend build is sufficient; backend is unaffected but preflight runs both per [scripts/preflight.ps1](scripts/preflight.ps1)).

# Hamburger Menu Dark-Mode Mobile Color — Spec

## Current State Analysis
- `.hamburger-btn` ([AppLayout.css:301-304](frontend/src/components/layout/AppLayout.css#L301-L304)): `color: var(--primary-blue, #3b82f6) !important;` — no light/dark or mobile/desktop variation.
- The button lives in `.shell-header-left` ([AppLayout.tsx:277-286](frontend/src/components/layout/AppLayout.tsx#L277-L286)), rendered at the 0% (leftmost) stop of `.shell-header`'s gradient. It is hidden on desktop via `@media (min-width: 769px) { .hamburger-btn { display: none !important; } }` ([AppLayout.css:291-294](frontend/src/components/layout/AppLayout.css#L291-L294)), so it is only visible in mobile view (≤768px).
- In dark mode, `--primary-blue` is redefined to `#60a5fa` (light blue) in [global.css:63](frontend/src/styles/global.css#L63), and the dark-mode header gradient (just flipped per `dark_header_gradient_flip_spec.md`) now places `var(--primary-blue)` (i.e. `#60a5fa`) at the 0% stop — the same left edge where the hamburger sits.
- Net effect: in dark mode + mobile view, the hamburger icon (`#60a5fa`) is drawn against a background of nearly the same color (`#60a5fa`), making it very low-contrast/hard to see.

## Problem Definition
The hamburger menu icon is not visible enough in dark mode on mobile because it shares the same light-blue color as the header background directly behind it.

## Proposed Solution
Add a dark-mode + mobile-scoped override that sets the hamburger icon to a dark shade of blue already used elsewhere in the dark-mode palette (`#1e3a8a`, used as the gradient's mid-stop in `:root.dark .shell-header` and in `global.css:144`), so it contrasts against the light backdrop:

```css
@media (max-width: 768px) {
  :root.dark .hamburger-btn {
    color: #1e3a8a !important;
  }
}
```

Scoping to `@media (max-width: 768px)` (matching the existing mobile breakpoint used throughout this file) ensures desktop dark mode is unaffected — the button is already hidden there, but this keeps the rule's intent explicit and consistent with the file's existing breakpoint convention.

## Implementation Steps
1. Add the above rule to `frontend/src/components/layout/AppLayout.css`, placed after the existing dark-mode section (after line 328) since it's dark-mode + mobile combined.

## Dependencies
None — plain CSS.

## Risks and Mitigations
- **Risk:** Value diverges from theme variables.
  - **Mitigation:** `#1e3a8a` is already a literal used twice in this codebase for the same "dark blue" role (gradient dark-mode mid-stop, global.css gradient), so this keeps a consistent literal-color convention already established for dark-mode-specific overrides in this file (see the comment at [AppLayout.css:306-307](frontend/src/components/layout/AppLayout.css#L306-L307) explaining why literals are used instead of CSS variables here).
- **Risk:** Light mode regression.
  - **Mitigation:** Selector requires `:root.dark`, scoped and unaffected outside that class.

## Build/Test Commands
- `docker compose -f docker-compose.dev.yml build frontend`

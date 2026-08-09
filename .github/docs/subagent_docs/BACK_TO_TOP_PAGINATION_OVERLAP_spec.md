# Spec: "Back to top" button overlaps TablePagination controls

## Current state analysis

- `frontend/src/components/layout/ScrollToTopButton.tsx` — a single global FAB,
  `position: fixed`, `bottom: {xs:16, sm:24}, right: {xs:16, sm:24}` (line
  41-50). Visibility is `el.scrollTop > VISIBILITY_THRESHOLD` (line 22), a
  scroll listener on a ref'd container passed in as `containerRef`.
- Rendered exactly once, confirmed via grep: only consumer is
  `frontend/src/components/layout/AppLayout.tsx` (plus the component's own
  file) — i.e. one global instance for the whole app, matching the source doc.
- List pages render MUI `TablePagination` in normal document flow directly
  below their table, with no `position: sticky/fixed` and no bottom offset of
  its own — so once a list is scrolled to the bottom, the fixed FAB
  (bottom-right) and `TablePagination`'s bottom-right controls (rows-per-page
  selector, next/last page arrows) occupy the same screen region. Worst on
  mobile where `TablePagination` wraps to two rows.
- This matches the source repo's diagnosis exactly — no divergence found.

## Problem definition

The FAB has no awareness of what's near the bottom of the scroll container; it
only tracks distance scrolled from the top. On any list page, once scrolled to
the end, it sits on top of `TablePagination`'s tappable controls.

## Proposed solution

Add a second, independent visibility condition to `ScrollToTopButton.tsx`:
hide the FAB once the container is within a fixed distance of its absolute
bottom (`scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_THRESHOLD`),
in addition to the existing scrolled-from-top check. One new constant, one new
distance computation, one extended boolean expression — no other files
change, since the component is already global.

Rejected alternative: moving/resizing the FAB. Its fixed offset is a single
shared value across every page; tuning it for one page's footer height risks
mis-clearing others. Hiding the button when content is genuinely near the
bottom is correct everywhere and not a loss of function — at that point "jump
to top" is redundant anyway.

## Implementation steps

1. In `ScrollToTopButton.tsx`, add `NEAR_BOTTOM_THRESHOLD = 150` next to the
   existing `VISIBILITY_THRESHOLD`, with a comment explaining its purpose
   (clearing a two-row, mobile-wrapped `TablePagination` bar plus padding).
2. In `handleScroll`, compute
   `distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight`
   and require `distanceFromBottom > NEAR_BOTTOM_THRESHOLD` in addition to the
   existing `scrollTop > VISIBILITY_THRESHOLD` check.
3. No breakpoint gating — apply the same 150px threshold at every screen
   size. The overlap is more visible on mobile (pagination more likely to
   wrap to two rows) but the fix itself is universal.

## Dependencies

None. Pure scroll-position arithmetic on values already read
(`scrollTop`/`scrollHeight`/`clientHeight` are standard DOM properties, no new
API, no library).

## Configuration changes

None.

## Risks and mitigations

- **Risk:** 150px under- or over-clears this repo's actual `TablePagination`
  height (padding/typography may differ from the source repo).
  **Mitigation:** flag in the review that this is a page-agnostic estimate,
  not a pixel-measured value, and that manual visual confirmation at a mobile
  viewport is still recommended — matching how the source fix was verified.
- **Risk:** regressing the existing "appears after scrolling down" behavior.
  **Mitigation:** the new condition is purely additive (`&&`), so on any page
  where the container never reaches its near-bottom band the button's
  existing behavior is unchanged.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml build backend` (unaffected;
  confirms no incidental breakage)
- `scripts/preflight.ps1` (Phase 6 gate)

No FORBIDDEN COMMANDS needed (no schema/migration, no host npm, nothing
database-touching).

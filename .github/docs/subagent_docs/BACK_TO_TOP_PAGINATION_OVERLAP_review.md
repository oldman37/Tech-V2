# Review: "Back to top" button overlaps TablePagination controls

## Spec compliance

Matches `.github/docs/subagent_docs/BACK_TO_TOP_PAGINATION_OVERLAP_spec.md`
exactly: one new constant (`NEAR_BOTTOM_THRESHOLD = 150`), one new distance
computation, one extended boolean expression, in
`frontend/src/components/layout/ScrollToTopButton.tsx` only. No breakpoint
gating added, matching the spec's explicit "no breakpoint gating" step.

## Best practices / consistency / maintainability

- Additive `&&` condition — the pre-existing "scrolled from top" behavior is
  unchanged wherever the new near-bottom condition doesn't apply.
- Comment on `NEAR_BOTTOM_THRESHOLD` documents *why* 150 and what it's sized
  to clear, matching the existing comment style on `VISIBILITY_THRESHOLD`.
- No page-level changes — correct, since the component is global and this is
  a page-agnostic collision (list pages all share the same
  `TablePagination`-in-flow layout).

## Completeness

Both symptoms from the bug report (bottom-right overlap generally, worse on
mobile where pagination wraps to two rows) are addressed by the same
page-agnostic fix — no separate mobile-only branch needed or added.

## Performance

Negligible — one extra subtraction per scroll event, already inside a passive
scroll listener that was doing comparable work.

## Security

Not applicable — no auth/data-boundary code touched.

## API currency

No new API surface; uses only already-referenced DOM scroll properties
(`scrollHeight`, `scrollTop`, `clientHeight`).

## Build validation

Commands run (both approved in the Phase 1 spec; no FORBIDDEN COMMANDS used):

```
scripts/preflight.ps1
```
Result: **pass, exit code 0**. Backend image build succeeded; frontend image
build (`tsc && vite build`) succeeded with zero type errors; backend test
suite: 7 files, 47/47 tests passed (unaffected — this is a frontend-only
change).

## Score table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | N/A | — |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Returns

- **PASS** — no refinement needed.
- Build result: preflight exit code 0.

## Verification still needed (manual, outside this workflow)

No browser automation was available in this environment to visually confirm
the FAB no longer overlaps `TablePagination`'s next-page control at the
bottom of a long list on a mobile viewport. The 150px threshold is a
page-agnostic estimate (matching the source repo's own approach), not a
pixel-measured value against this repo's actual `TablePagination` rendering.
A manual resize/scroll check on a mobile viewport is recommended before
treating the overlap as visually confirmed fixed.

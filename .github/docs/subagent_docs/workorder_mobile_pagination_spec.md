# Work Order List — Mobile Pagination Fix

## Current State Analysis

`frontend/src/pages/WorkOrderListPage.tsx` renders the work-order list using
`ResponsiveTable` (table on desktop, stacked cards on mobile, per the
screenshot) followed by a single MUI `<TablePagination>` (`WorkOrderListPage.tsx:641-649`)
that is rendered unconditionally, regardless of viewport.

`TablePagination`'s default MUI toolbar bundles a "Rows per page" label +
`<Select>`, an "x–y of z" label, and four 24px `IconButton`s (first/prev/next/last)
into one horizontal row. That row's natural width (~500px) exceeds a phone
viewport (~390-430px). The page has no horizontal scroll containment around
it, so the toolbar overflows the viewport and the prev/next arrow buttons are
pushed off-screen to the right — confirmed by the user's screenshot, which
shows a horizontal scrollbar at the very bottom of the page and no visible
pagination controls. Even when scrolled into view, the icon buttons are ~24-40px
tap targets, under the ~44px minimum recommended for touch.

The codebase already has an established mobile-pagination pattern:
`frontend/src/components/PaginationControls.tsx` renders a completely
different (non-MUI, 1-indexed) desktop UI, but on mobile (`isMobile` branch,
`PaginationControls.tsx:76-131`) it collapses to a simplified item-count line
+ centered `Prev`/`Next` button pair with `minHeight: 44px` / `minWidth: 44px`
touch targets and a `current / total` page indicator. `WorkOrderListPage.tsx`
does not use `PaginationControls` (it's a different, plain-CSS design system
built for pages like `Users.tsx`); `WorkOrderListPage.tsx` is fully MUI
(`Box`, `Paper`, `Button`, `Typography`, `Select` already imported). The fix
should follow the same *shape* of mobile UX (count line + large Prev/Next +
page indicator, no rows-per-page selector on mobile) but implemented with the
MUI components already used throughout this file, not by importing
`PaginationControls`.

`page` (0-indexed) and `rowsPerPage` are already derived from URL filter
state (`WorkOrderListPage.tsx:115-116`) via `useFilterParams`/`setFilters`,
and `totalCount` is already read from the query result
(`WorkOrderListPage.tsx:198`). `isMobile` is already available via
`useIsMobile()` (`WorkOrderListPage.tsx:124`), and is already used to branch
other parts of this same page's JSX (e.g. `WorkOrderListPage.tsx:274`, `:384`).

## Problem Definition

On mobile, the work-order list pagination controls are unusable: they render
off-screen to the right (require horizontal scrolling to find) and, once
found, are small icon buttons that are hard to tap accurately.

## Proposed Solution

Branch the pagination render on the existing `isMobile` flag, matching the
pattern already used elsewhere in this file:

- **Desktop (`!isMobile`)**: unchanged — keep the existing `<TablePagination>`
  exactly as-is (no regression risk for desktop users).
- **Mobile (`isMobile`)**: render a compact, MUI-based control:
  - An "x–y of z" item-count line (`Typography variant="body2"`).
  - Two large `Button`s — **Prev** and **Next** — each with `minHeight: 44,
    minWidth: 96` (matches the touch-target sizing already established in
    `PaginationControls.tsx`), `variant="outlined"`, disabled at the first/last
    page respectively.
  - A `current / total` page indicator between the two buttons.
  - No rows-per-page selector on mobile (matches the existing
    `PaginationControls` mobile precedent — rows-per-page is a low-value,
    high-space-cost control on a phone screen; desktop retains it unchanged).

All page-size math derives from state already on the page — no new query
params, no API changes, no new dependencies.

```
totalPages = max(1, ceil(totalCount / rowsPerPage))
Prev disabled when page === 0
Next disabled when page + 1 >= totalPages
onClick → setFilters({ page: String(page ± 1) })   // same call already used by TablePagination's onPageChange
```

## Implementation Steps

1. In `WorkOrderListPage.tsx`, add a `totalPages` derivation next to the
   existing `page`/`rowsPerPage`/`totalCount` reads.
2. Replace the unconditional `<TablePagination>` block (`WorkOrderListPage.tsx:641-649`)
   with `isMobile ? <mobile pagination Box> : <TablePagination ...same as today.../>`.
3. Build the mobile block from `Box`, `Typography`, `Button` — all already
   imported in this file. No new imports required.

## Dependencies

None new. Uses only `@mui/material` components already imported in this file
(`Box`, `Button`, `Typography`). No version-sensitive API surface is touched
(no new MUI component types), so the Dependency & Documentation Policy
research step is not applicable (styling/UI-only change using
already-exercised dependencies).

## Configuration Changes

None. No env vars, Prisma schema, or MSAL/Graph scopes affected.

## Risks & Mitigations

- **Risk**: Diverging mobile/desktop pagination UX.
  **Mitigation**: Desktop path is untouched; mobile path intentionally mirrors
  the existing `PaginationControls` mobile precedent, so the UX pattern is
  already validated elsewhere in the app.
- **Risk**: Off-by-one in page math (0-indexed `page` vs. 1-indexed display).
  **Mitigation**: Reuse the exact same `setFilters({ page: String(p) })` call
  already wired to `TablePagination`'s `onPageChange`, so no new page-index
  semantics are introduced.
- **Risk**: Scope creep — 19 other pages use the same unguarded
  `<TablePagination>` pattern.
  **Mitigation**: Out of scope. The user's report and screenshot are specific
  to the work-order list; only `WorkOrderListPage.tsx` is touched, per the
  Surgical Changes principle. Not fixing the other pages here.

## Build/Validation Commands Approved for This Change

- Phase 3 review: static/code-level review only (no Docker rebuild — this is
  a single-file, isolated JSX/TS change with no new dependencies).
- Phase 6 Preflight: `scripts/preflight.ps1` (backend + frontend Docker image
  builds + backend vitest) is the actual build gate and will compile this
  file's TypeScript inside the frontend image build.

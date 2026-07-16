# Work Order List — Description Column + Location Column Simplification

## Current State Analysis

`frontend/src/pages/WorkOrderListPage.tsx` renders the work order list via the generic
`ResponsiveTable` component (`frontend/src/components/responsive/ResponsiveTable.tsx`),
which switches to a card layout (`MobileCard`) automatically on mobile — no separate
mobile-specific markup is needed in the page itself.

Columns are defined as a `Column<WorkOrderSummary>[]` array (`woColumns`, lines 157–229).
The `officeLocation` column (lines 203–212) always renders `School / Room`. There is
currently no `description` column.

The `description` field is a scalar column on the `Ticket` Prisma model
(`backend/prisma/schema.prisma:1022`). The list endpoint
(`backend/src/services/work-orders.service.ts:376-385`, `getWorkOrderSummaryList` /
list query) uses Prisma `include: WORK_ORDER_SUMMARY_INCLUDE` (not `select`), which
means **all scalar fields — including `description` — are already returned by the API**
for every row in the list response. This is confirmed by the `search` filter at
`work-orders.service.ts:320-325`, which already queries against `description` server-side.

The gap is purely on the frontend typing/rendering side:
- `frontend/src/types/work-order.types.ts` — `WorkOrderSummary` interface (lines 46-65)
  does not declare `description`, even though the API already sends it.
- `shared/src/work-order.types.ts` — same gap, `WorkOrderSummary` (lines 109-126) omits
  `description` (only `WorkOrderDetail`, which extends it, declares `description: string`).
- `WorkOrderListPage.tsx` has no description column.

No backend changes are required. This is a frontend-only, additive change.

## Problem Definition

1. The location column always shows `School / Room`, which is redundant when the user
   has already filtered the list down to one school — the school name is repeated in
   every row for no informational gain.
2. There is no way to see the work order description from the list view; users must
   open each row individually.

## Proposed Solution

### 1. Location column — conditional school display

When a specific location filter is active (`locationFilter` is truthy), render room
name only. When no location filter is active ("All Schools"), keep the current
`School / Room` format. This is a pure render-function change using the existing
`locationFilter` variable already in scope in `WorkOrderListPage`.

### 2. Description column — truncated, with desktop tooltip

Add a new column, positioned after `officeLocation` (between Location and Submitted By)
using `wo.description`:
- Truncate with CSS (`text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden`,
  bounded `maxWidth`) rather than JS string slicing, so it degrades gracefully at any
  column width and doesn't need a hardcoded character count.
- Wrap in MUI `Tooltip` (already used elsewhere in this codebase — no new dependency)
  showing the full, untruncated description on hover. Tooltip is desktop-only
  behavior by nature (no hover on touch); no explicit mobile branching needed here.
- No `hideOnMobile` flag — on mobile, `MobileCard` already renders every non-flagged
  column as a label/value pair, with the value wrapping naturally in the card (no
  horizontal truncation pressure like a table cell has), so the full behavior is
  reasonable without a popout.
- Per explicit user decision: **no tap-to-popout dialog on mobile.** Tapping a row
  already navigates to `WorkOrderDetailPage`, which shows the full, untruncated
  description — a separate popout would duplicate that path for no benefit.

### 3. Type changes

Add `description: string` to `WorkOrderSummary` in both:
- `frontend/src/types/work-order.types.ts`
- `shared/src/work-order.types.ts` (kept in sync per the file's own header comment
  stating it "mirrors shared/src/work-order.types.ts")

No Prisma schema change, no migration, no backend service/controller change — the
field is already selected and returned.

## Implementation Steps

1. `frontend/src/types/work-order.types.ts` — add `description: string;` to
   `WorkOrderSummary`.
2. `shared/src/work-order.types.ts` — add `description: string;` to `WorkOrderSummary`
   (mirrors step 1, per file's stated sync convention; not imported by the frontend
   bundle but kept consistent for any backend/shared consumers).
3. `frontend/src/pages/WorkOrderListPage.tsx`:
   - Import `Tooltip` from `@mui/material`.
   - Update the `officeLocation` column's `render` to omit the school name when
     `locationFilter` is truthy.
   - Add a new `description` column with truncated text + `Tooltip`.

## Dependencies

None new. `@mui/material` `Tooltip` and `Box`/`sx` truncation are already used
throughout this codebase (verified via existing usages in `PurchaseOrderList.tsx`,
`TransportationUnitsPage.tsx`, etc.) — no version/API verification needed since this
follows an existing in-repo pattern (per CLAUDE.md Dependency Policy exemption for
"dependencies already exercised elsewhere in the codebase").

## Configuration Changes

None. No env vars, no Prisma schema changes, no MSAL/Graph scope changes.

## Risks and Mitigations

- **Risk:** Frontend and shared `WorkOrderSummary` types drift further apart in the
  future (they're already manually duplicated, e.g. `workOrderCategory` exists on the
  frontend copy but not the shared one).
  **Mitigation:** Out of scope to reconcile pre-existing drift; this change follows
  the existing convention of updating both copies for new fields actually used by the
  frontend.
- **Risk:** Long descriptions overflow the mobile card value.
  **Mitigation:** Not truncated on mobile (card layout has room to wrap); acceptable
  per user's explicit choice to skip the mobile popout and rely on full text being
  visible either in the card or one tap away on the detail page.
- **Risk:** None on backend/data — no query, schema, or permission-scope changes.

## Build/Test Plan (Phase 3/6)

- `docker compose -f docker-compose.dev.yml build frontend` (runs frontend `tsc` +
  `vite build` inside the image) — the only build affected, since backend and shared
  runtime code are untouched. `shared/src/work-order.types.ts` is a types-only file
  used by consumers that import `@mgspe/shared-types`; frontend does not depend on it
  at runtime per its own header comment, but backend does — so backend build is
  included as a safety check.
- Full `scripts/preflight.ps1` run at Phase 6 (builds both backend and frontend
  images) per CLAUDE.md's mandatory final gate — no narrower substitute.

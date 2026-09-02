# Provisioning Audit Log — Mobile Card View — Spec

## Current State Analysis

`frontend/src/pages/admin/ProvisioningPage.tsx` has three raw MUI `<Table>` usages
(`PendingDisablesCard`, `DisableBatchHistorySection`, `AuditLogSection`) — none use the
app's established `ResponsiveTable`/`MobileCard` pattern (`frontend/src/components/responsive/`)
that every other list page in the app uses to switch to a card layout under 768px
(`useIsMobile`, `BREAKPOINTS.mobile`). Confirmed: this page never adopted that pattern, so
the table renders as a raw HTML table on mobile — squeezed/overflowing instead of cards.

The user reported "the table" (singular) not going into card view — the `AuditLogSection`
table is the page's primary, most-viewed data table (paginated, filterable, with a
per-row expand-for-details interaction via `expandedId`/`toggleExpand` and a custom
`AuditDetailPanel` showing the patch/fields diff), so it's the target of this fix. The
other two tables (`PendingDisablesCard`'s nested per-batch account list,
`DisableBatchHistorySection`) are separate, lower-traffic tables not covered here.

## Problem Definition

On mobile (≤768px), `AuditLogSection`'s table should render as a stack of cards (matching
the app-wide `.mobile-card` visual language) instead of the current cramped/overflowing
`<table>`, while preserving all existing behavior: filters, search, pagination, and the
tap-to-expand detail panel (single card open at a time, same as the desktop table's
single-row expand today).

## Proposed Solution

Add a `useIsMobile()` branch inside `AuditLogSection`, alongside the existing desktop
`<TableContainer><Table>`, reusing the same state (`expandedId`, `toggleExpand`) and
existing helpers (`formatTimestamp`, `actionLabel`, `actionChipColor`, `AuditDetailPanel`)
unchanged. Cards are hand-composed with the app's existing shared CSS classes
(`.mobile-card`, `.mobile-card__header`, `.mobile-card__title`, `.mobile-card__subtitle`,
`.mobile-card__chevron`, `.mobile-card__details`, `.mobile-card__field`) — the same classes
`MobileCard`/`ResponsiveTable` use elsewhere — rather than routing through the generic
`ResponsiveTable` component itself.

**Why not just drop `ResponsiveTable` in?** It renders both desktop *and* mobile itself,
which would replace the hand-rolled desktop table (currently correct and unaffected by
this bug) with its own generic renderer — a much bigger blast radius than the reported
bug, and its `collapsible` mode only reveals additional flat `Column` entries, not the
freeform `AuditDetailPanel` (which renders a "Triggered by" line plus a dynamic
key/value diff of `details.patch`/`details.fields`). Hand-composing the mobile branch with
the same shared CSS classes keeps the desktop table untouched and preserves the exact
detail-panel behavior, while still matching the app's established mobile card look.

### Mobile card layout

- Title: UPN (monospace)
- Subtitle: formatted date/time · user type
- Chevron (rotates on expand, same visual as `MobileCard`)
- Always-visible row: Action chip (+ an "Error" chip if the entry failed)
- Tap toggles `expandedId` (same state already driving the desktop expand row) —
  expanding reveals Employee ID, Error (full text), Triggered By, and the existing
  `AuditDetailPanel`

## Files to Change

- `frontend/src/pages/admin/ProvisioningPage.tsx` only — add `useIsMobile` import, one
  `isMobile` check, and the new mobile card branch in `AuditLogSection`.

## Risks and Mitigations

- No backend changes, no data shape changes — purely a rendering branch.
- Desktop table markup is untouched, so no regression risk there.
- Reuses existing shared CSS classes (confirmed flat, non-structural selectors in
  `global.css` — safe to reuse outside the `MobileCard` component).

## Build Command

`docker compose -f docker-compose.dev.yml build frontend` (per CLAUDE.md Resource
Constraints).

# Spec: Remove the "RESOLVED" work order status

## Current state analysis

`TicketStatus` is a genuine Postgres enum (`backend/prisma/schema.prisma:977-983`):
`OPEN | IN_PROGRESS | ON_HOLD | RESOLVED | CLOSED`. It types:
- `Ticket.status` (table `tickets`, schema.prisma:1088)
- `TicketStatusHistory.fromStatus` (nullable) / `.toStatus` (table `ticket_status_history`, schema.prisma:1108-1123)

`RESOLVED` is referenced in 12 files (verified via repo-wide grep, zero
false negatives): `backend/prisma/schema.prisma`,
`backend/src/services/work-orders.service.ts`,
`backend/src/services/reports.service.ts`,
`backend/src/services/settings.service.ts`,
`backend/src/validators/work-orders.validators.ts`,
`backend/scripts/fy-verify.ts`, `shared/src/work-order.types.ts`,
`frontend/src/types/work-order.types.ts`,
`frontend/src/types/reports.types.ts`,
`frontend/src/services/settingsService.ts`,
`frontend/src/components/work-orders/WorkOrderStatusChip.tsx`,
`frontend/src/pages/WorkOrderListPage.tsx`,
`frontend/src/pages/WorkOrderDetailPage.tsx`,
`frontend/src/pages/admin/AdminSettings.tsx`, `frontend/src/theme/theme.ts`.

`Ticket.resolvedAt` (schema.prisma:1069) is a separate `DateTime?` column,
not part of the enum — it is read as a fallback source in
`reports.service.ts:111-115,161-166,217-218` (`resolvedAt ?? closedAt`) and
must be left in place.

`frontend/src/pages/ReportsPage.tsx:72-73` already excludes `RESOLVED`/`ON_HOLD`
from its displayed `STATUS_ORDER` (comment: "not used operationally") — no
code change needed there, it's already consistent with removing the status.

No backend test file references `TicketStatus`/`RESOLVED`
(`backend/src/__tests__/*.test.ts` — confirmed via grep), so no test files
need updating.

## Problem definition

`RESOLVED` is operationally indistinguishable from `CLOSED` for this
unified work-order ("Ticket") system — same permissions, same downstream
behavior. Remove it as a data-model simplification. Existing `RESOLVED`
tickets and their status-history rows become `CLOSED`.

## Proposed solution architecture

Standard Postgres enum-value removal, since `ALTER TYPE ... DROP VALUE`
does not exist:
1. Reassign existing `RESOLVED` data to `CLOSED` (tickets + status history).
2. Rename the old enum type, create a new one without `RESOLVED`, repoint
   both affected columns to it with an explicit cast, drop the old type.
3. Remove `RESOLVED` from every application-layer reference: Prisma schema,
   backend state machine + timestamp logic + stats seed, Zod validator,
   reports aggregate, fiscal-year rollover seeds, `fy-verify.ts` script,
   shared/frontend type unions + label maps + stats interfaces, status chip
   color map, list-page closed-bucket filter, detail-page dropdown +
   transition table, admin settings rollover-summary UI, theme's
   `statusResolved` palette token/module-augmentations.

Resulting state machine (unchanged reachability — `IN_PROGRESS -> CLOSED`
already existed):
```
OPEN         -> IN_PROGRESS, CLOSED
IN_PROGRESS  -> ON_HOLD, CLOSED
ON_HOLD      -> IN_PROGRESS, CLOSED
CLOSED       -> OPEN
```

## Implementation steps

1. `backend/prisma/schema.prisma` — drop `RESOLVED` from `enum TicketStatus`.
2. New file `backend/prisma/migrations/20260720150000_remove_resolved_ticket_status/migration.sql`:
   - `UPDATE tickets SET status='CLOSED', closedAt=COALESCE(closedAt, resolvedAt, now()) WHERE status='RESOLVED'`
   - `UPDATE ticket_status_history SET fromStatus='CLOSED' WHERE fromStatus='RESOLVED'`
   - `UPDATE ticket_status_history SET toStatus='CLOSED' WHERE toStatus='RESOLVED'`
   - rename/create/alter/drop `TicketStatus` enum without `RESOLVED`, re-pointing
     `tickets.status`, `ticket_status_history.fromStatus`, `ticket_status_history.toStatus`.
3. `backend/src/services/work-orders.service.ts` — remove `RESOLVED` from
   `VALID_TRANSITIONS` (both as a source state and as an `IN_PROGRESS` target),
   simplify `updateStatus()`'s timestamp branch (drop the `RESOLVED`-stamping
   branch and the `RESOLVED`-aware reopen branches, collapse into the existing
   `CLOSED`-only reopen branch), drop `RESOLVED: 0` from the stats seed.
4. `backend/src/services/reports.service.ts` — drop `RESOLVED: 0` from the
   status-count seed and from the `openCount` sum.
5. `backend/src/services/settings.service.ts` — drop `RESOLVED: 0` from the
   3 seed objects (empty-summary totals, real totals, per-department totals).
6. `backend/src/validators/work-orders.validators.ts` — drop `'RESOLVED'`
   from `TicketStatusEnum`.
7. `backend/scripts/fy-verify.ts` — drop `'RESOLVED'` from the local
   `statuses` array.
8. `shared/src/work-order.types.ts` and `frontend/src/types/work-order.types.ts`
   — drop `'RESOLVED'` from `WorkOrderStatus`; drop `RESOLVED: number` from
   `WorkOrderStatsSummary` (shared) / drop `RESOLVED: 'Resolved'` from
   `WORK_ORDER_STATUS_LABELS` (frontend).
9. `frontend/src/types/reports.types.ts` — drop `RESOLVED: number` from
   `WorkOrderStatusCounts`.
10. `frontend/src/services/settingsService.ts` — drop `RESOLVED: number`
    from both inline total-shape objects in `WorkOrderYearSummary`.
11. `frontend/src/components/work-orders/WorkOrderStatusChip.tsx` — drop
    `RESOLVED: 'statusResolved'` from `STATUS_COLOR`.
12. `frontend/src/pages/WorkOrderListPage.tsx` — change the closed-bucket
    filter from `['RESOLVED', 'CLOSED']` to `['CLOSED']`.
13. `frontend/src/pages/WorkOrderDetailPage.tsx` — drop the `RESOLVED` entry
    from `STATUSES`; drop `RESOLVED` from `IN_PROGRESS`'s allowed-next list
    and drop the whole `RESOLVED` key from `ALLOWED_NEXT_STATUSES`.
14. `frontend/src/pages/admin/AdminSettings.tsx` — drop `RESOLVED` from the
    local `WORK_ORDER_STATUS_LABELS`, from the status-rows tuple, from the
    `DeptCounts` type, and from `byDepartmentColumns`.
15. `frontend/src/theme/theme.ts` — remove `statusResolved` from the
    `Palette`/`PaletteOptions` module augmentations, the `ChipPropsColorOverrides`
    augmentation, and both light/dark palette entries (no other consumer besides
    `WorkOrderStatusChip.tsx`, confirmed by grep).

## Dependencies

None — no new packages; only edits to existing Prisma schema, Zod schemas,
and TypeScript already in use elsewhere in this repo (no Dependency &
Documentation Policy lookup required per CLAUDE.md's exclusion for "internal
code changes with no new dependencies").

## Configuration changes

None beyond the Prisma migration file itself. No env vars, no MSAL/Graph
scope changes.

## Risks and mitigations

- **Enum narrowing while rows reference the value being dropped** → mitigated
  by reassigning `tickets` and `ticket_status_history` rows to `CLOSED`
  *before* the type swap (migration steps 1-2 above, in that order).
- **Losing resolution-time reporting data** → `Ticket.resolvedAt` is left
  untouched; `closedAt` is backfilled from it on migrated rows so
  `resolvedAt ?? closedAt` in `reports.service.ts` still resolves correctly.
- **Missed reference causing a runtime bug** → every `RESOLVED` reference
  found via grep is enumerated above; after implementation, a repo-wide
  `RESOLVED` grep plus `docker compose build backend`/`frontend` (Prisma
  narrows the type at `generate`, so a stray reference fails `tsc`) are the
  completeness check in Phase 3.
- **Forbidden migration commands** — this is a hand-authored `migration.sql`
  file only; no `prisma migrate dev`/`reset` is run, per CLAUDE.md.

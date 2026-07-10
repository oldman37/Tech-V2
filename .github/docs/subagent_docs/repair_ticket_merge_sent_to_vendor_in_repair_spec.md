# Merge RepairTicket "sent_to_vendor" and "in_repair" statuses

Status: APPROVED — proceeding to implementation

## Current state

`RepairTicket.status` (`backend/prisma/schema.prisma:1441`, plain `String` column, not a DB enum) has 6 values: `pending|sent_to_vendor|in_repair|returned|unrepairable|cancelled`. In practice, sending a ticket to a vendor (`sent_to_vendor`) already sets `equipment.status = 'in_repair'` (a separate field — the device's own physical status) with no other side effect. The ticket's own `in_repair` step is then a second manual button click ("Mark In Repair") that changes nothing else — no side effects are coded for it in `repairTicket.service.ts`. It is a redundant step: the device is already "in repair" the moment it's sent to the vendor.

Confirmed via a read-only query against the live dev DB: 2 existing tickets currently sit at `status = 'in_repair'`, 1 at `sent_to_vendor`, 1 at `returned`, 5 at `cancelled`.

## Change

Remove `in_repair` as a distinct `RepairTicket.status` value. `sent_to_vendor` becomes the single step meaning "ticket sent out and device is being repaired." `pending -> sent_to_vendor -> returned/unrepairable/cancelled`.

**Data migration required:** existing tickets at `in_repair` must be collapsed into `sent_to_vendor` so they aren't orphaned with no valid next action once the UI stops recognizing that status. Since `status` is a plain string column (no DDL/enum type change), this is a data-only migration:

```sql
UPDATE repair_tickets SET status = 'sent_to_vendor' WHERE status = 'in_repair';
```

Not touched (different, unrelated concepts despite the same string value):
- `Equipment.status` enum's own `'in_repair'` value (device's physical status) — stays as-is; still set when a ticket is sent to vendor.
- Legacy `DamageIncident.status`'s `'in_repair'` value (already deprecated/frozen per the prior incident-workflow spec) — untouched.

## Files to change

- `backend/prisma/schema.prisma` — update the comment listing allowed values.
- `backend/prisma/migrations/<ts>_merge_repair_ticket_in_repair_status/migration.sql` — the UPDATE above.
- `shared/src/types.ts` — `RepairTicketStatus` union: drop `'in_repair'`.
- `backend/src/validators/repairTicket.validators.ts` — `UpdateRepairStatusSchema`'s `z.enum(...)`: drop `'in_repair'`.
- `backend/src/services/repairTicket.service.ts` — the active-ticket status list added in the previous incident-workflow fix (`['pending', 'sent_to_vendor', 'in_repair']`) loses `'in_repair'`.
- `backend/src/services/damageIncident.service.ts` — `deviceExchange`'s `hasActiveRepair` check, same list, same change.
- `backend/src/services/checkoutReport.service.ts` — two `status: { in: ['sent_to_vendor', 'in_repair'] }` filters become just `'sent_to_vendor'`.
- `frontend/src/pages/DeviceManagement/RepairTicketDetailPage.tsx` — remove the `status === 'sent_to_vendor'` → "Mark In Repair" button; show "Mark Returned"/"Mark Unrepairable" when `status === 'sent_to_vendor'` instead of `'in_repair'`.
- `frontend/src/components/DeviceManagement/RepairStatusStepper.tsx` — remove the "In Repair" step from the stepper.
- `frontend/src/pages/DeviceManagement/RepairTicketsPage.tsx` — remove `'in_repair'` from the status filter list.

## Risk

Low — plain string column, no enum/DDL change, single-row-shape data migration affecting 2 known rows, no other consumers found.

# Spec: Inventory table column-fit + permanent delete

Two independent fixes to `frontend/src/pages/InventoryManagement.tsx`,
confirmed against this repo's actual current state (not assumed from the
source document — this file has since been touched by the earlier
autofocus fix in this session, confirmed re-read after that change).

## Fix A — table overflows into a horizontal scrollbar

### Current state (verified)
- `frontend/src/components/responsive/ResponsiveTable.tsx` already supports
  `minWidth`, `priority` (column-drop order), and `actionsMinWidth` — the
  column-fit machinery itself needs no change, confirmed by reading its fit
  calculation.
- `InventoryManagement.tsx`'s 14-column `columns` array (lines 173-327,
  confirmed by direct read) has **zero** `minWidth` on any column, no
  `actionsMinWidth` passed to `<ResponsiveTable>`, `status` uses a plain
  `width: 100` hint (not read by the fit calculation) with no `priority`,
  and `serialNumber`/`poNumber` (lines 206-229, 274-297) use `white-space:
  nowrap` + `overflow: hidden` + `text-overflow: ellipsis` inside a
  percentage `max-width` — confirmed present exactly as described, this
  combination does not truncate in an auto-layout table.
- `rowActions` (lines 329-376) currently renders up to 4 buttons
  (Assign/Reactivate, Edit, History, Dispose) with no `actionsMinWidth` set
  on `<ResponsiveTable>` (confirmed via grep — no `actionsMinWidth` anywhere
  in this file currently).
- No trace of the alternative `flexWrap`/`actionsMinWidth={134}` fix
  described in a separate, older doc in this directory
  (`inventory-table-responsive-column-wrapping.md`) — confirmed absent from
  this file as it stands today. That older document is unrelated to this
  session's work; this fix proceeds independently, per this file's actual
  current state.

### Fix
Add `minWidth` to all 14 columns (values below, sized to rendered content —
not copied from any external source, chosen against this file's own font
stack: `0.8125rem` monospace for tag/serial/PO columns, default body size
elsewhere):

| Column | minWidth |
|---|---|
| Asset Tag | 150 |
| Item Name | 150 |
| Category | 120 |
| Brand | 120 |
| Model | 120 |
| Serial # | 140 |
| Location | 150 |
| Assigned To | 140 |
| Status | 120 |
| Value | 90 |
| Vendor | 120 |
| PO# | 90 |
| Funding | 130 |
| Purchase Date | 140 |

- `assetTag`, `serialNumber`, `poNumber`: switch from the broken
  nowrap/ellipsis styling to `overflowWrap: 'anywhere'` (opaque tokens, safe
  to wrap; keep the existing `title` attribute on serial/PO for the full
  value as a tooltip — `assetTag` has no `title` today and none is added,
  matching its existing render exactly otherwise).
- `status`: replace `width: 100` with `minWidth: 120` and add `priority: 0`
  so it survives column-dropping longer than its array-index position would
  (it currently sits after Category/Brand/Model/Serial/Location/Assigned
  To — all of which are less operationally useful on a scan than the status
  badge).
- `<ResponsiveTable>`: add `actionsMinWidth={296}` — sized for 5 `.btn-sm`
  ghost buttons (Assign/Reactivate, Edit, History, Dispose, and the new
  Permanently Delete from Fix B below) in a non-wrapping flex row plus cell
  padding. Confirmed no other prop on `<ResponsiveTable>` in this file needs
  to change.
- `purchaseDate`: `minWidth: 140` only — its existing nowrap/ellipsis span
  is left as-is (its header text, "Purchase Date", is already the wider
  constraint versus its rendered content, so the truncation bug doesn't
  manifest here the way it does for the two opaque-token columns).

No change to `ResponsiveTable.tsx` or any shared CSS — confirmed both are
already correct.

## Fix B — no way to permanently delete an inventory item

### Current state (verified)
- Backend hard-delete capability **already fully exists**:
  `DELETE /api/inventory/:id?permanent=true`
  (`backend/src/routes/inventory.routes.ts:192`,
  `backend/src/controllers/inventory.controller.ts:200-239`), admin-gated
  (`req.user.roles.includes('ADMIN')`, controller line 210), audit-logged on
  success (`writeAuditLog(..., 'INVENTORY_PERMANENT_DELETE', ...)`, line
  231). No restriction on the item's disposed/active state.
- `InventoryService.delete()` (`backend/src/services/inventory.service.ts:714`)
  already branches on `permanent`: `false` → soft-delete (marks disposed,
  writes an audit-log row); `true` → `this.prisma.equipment.delete({ where:
  { id } })` with **no FK safety check** — confirmed by reading the method
  body directly.
- Confirmed via grep across the whole frontend: **no frontend code anywhere
  calls this endpoint with `permanent=true`.** The only delete-shaped UI
  action, `handleDelete` (`InventoryManagement.tsx:96-103`), always calls
  `deleteMutation.mutate(item.id, ...)` via `useDeleteInventoryItem()`,
  which never passes `permanent`.
- `equipment` (`backend/prisma/schema.prisma`) has 11 relations to child
  records. Confirmed by reading each child model's FK declaration:
  - **4 cascade** (`onDelete: Cascade` present): `inventory_changes`,
    `EquipmentAttachment` (`attachments`), `MaintenanceHistory`
    (`maintenanceHistory`), `EquipmentAssignmentHistory`
    (`assignmentHistory`) — safe, no guard needed.
  - **7 do not cascade** (no `onDelete` specified on the FK, defaulting to a
    blocking behavior): `DeviceAssignment` (`deviceAssignments`),
    `RepairTicket` (`repairTickets`), `DamageIncident` (`damageIncidents`,
    nullable FK but still unguarded), `Ticket` via `"TicketEquipment"`
    (`tickets`), `InventoryAuditItem` (`auditItems`), `DeviceCartItem`
    (`cartItems`), `InventoryImportItem` (`importJobs`, nullable FK, still
    unguarded). A raw `equipment.delete()` on any item with a row in one of
    these 7 relations throws a Postgres FK violation (`P2003`), which this
    app's generic error handler surfaces as a confusing 400.
- `ConflictError` (`backend/src/utils/errors.ts:73`, `409`) is this
  codebase's existing pattern for "operation blocked by related state" —
  confirmed used identically elsewhere (`damageIncident.service.ts`,
  `deviceAssignment.service.ts`) with a `(message, meta?)` signature.
- `selectIsAdmin` already exists in `frontend/src/store/authStore.ts:94` —
  reused, not reinvented.

### Fix
1. **Backend guard** (`inventory.service.ts`, `delete()`): extend the
   existing `equipment.findUnique` lookup (no second round trip) with
   `include: { _count: { select: { deviceAssignments: true, repairTickets:
   true, damageIncidents: true, tickets: true, auditItems: true, cartItems:
   true, importJobs: true } } }`. When `permanent === true` and any count is
   non-zero, throw `ConflictError` naming exactly what's blocking it, before
   attempting the delete.
2. **Frontend hook** (`useInventoryMutations.ts`): new
   `usePermanentlyDeleteInventoryItem()`, calling
   `inventoryService.deleteItem(id, true)` — confirm `inventoryService.
   deleteItem` already accepts a `permanent` boolean second argument before
   assuming; if its current signature doesn't, extend it minimally. Kept
   entirely separate from `useDeleteInventoryItem()` — no change to the
   existing dispose flow's code.
3. **Frontend UI** (`InventoryManagement.tsx`): new "🗑️❌ Permanently
   Delete" (or similar distinct icon — never the same 🗑️ as Dispose, to
   avoid confusion) row-action button, rendered only when `useAuthStore
   (selectIsAdmin)` is true. Available for both active and disposed items.
   `window.confirm` + `alert`-on-error, matching this file's existing
   `handleDelete`/`handleReactivate` style exactly — no new dialog pattern.
4. Backend test coverage
   (`backend/src/__tests__/inventory-permanent-delete.test.ts`): clean
   delete succeeds; delete blocked with 409 + a message naming the blocking
   relation when a `DeviceAssignment` exists; a non-admin with real
   `TECHNOLOGY`-module access still gets 403 for `permanent=true`; the
   existing dispose path is unaffected for a non-admin. Test personas use
   only groups confirmed present in `backend/.env.test`
   (`ENTRA_TECH_ASSISTANTS_GROUP_ID` for the non-admin/tech-capable persona,
   matching the pattern already used in `repair-tickets-sortby.test.ts`) —
   never an undefined group.

### Deliberately not fixed (flagged only)
`InventoryService.bulkDelete()` has the identical unguarded-FK issue.
Confirmed via grep that no frontend code calls it — unreachable from any
current UI. Left untouched, out of scope. Also noted:
`BulkDeleteDisposedPage.tsx` (nav-labeled "Purge Disposed") performs a bulk
**dispose**, not a permanent delete — a pre-existing naming mismatch,
untouched.

## Dependencies
None new. Prisma 7 `_count` nested select (already used elsewhere in this
codebase, e.g. `work-orders.service.ts`, `purchaseOrder.service.ts` — grep
confirms the pattern is established).

## Configuration changes
None — no schema change, no migration.

## Risks and mitigations
- **Risk:** widened `actionsMinWidth` or new `minWidth`s regress layout on
  narrower desktop widths. **Mitigation:** values are additive column-fit
  hints only; `ResponsiveTable`'s existing drop-to-mobile-card behavior
  below the mobile breakpoint is unaffected (confirmed unchanged from Fix
  1's earlier, unrelated autofocus edit to this same file, which touched
  only the search input, lines apart from these columns).
- **Risk:** permanent-delete guard query adds latency. **Mitigation:** the
  `_count` is folded into the existing single lookup, no extra round trip.
- **Risk:** admin accidentally deletes a record with history because the
  guard has a gap. **Mitigation:** all 7 non-cascading relations are
  checked; the 4 cascading ones are correctly excluded from the guard
  (blocking on them would be wrong — they're supposed to cascade).

## Build validation commands (Phase 3/6)
- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- Full `scripts/preflight.ps1`

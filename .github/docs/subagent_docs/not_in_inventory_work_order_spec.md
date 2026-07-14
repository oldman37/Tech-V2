# Spec: "Equipment Not In My Inventory" Flag for Technology Work Orders

Status: DRAFT — Phase 1 (Research & Specification)
Owner: Orchestrating Agent (Tech-V2)
Date: 2026-07-14

---

## 1. Current State Analysis

The "Technology Request" flow the user is describing is the existing **unified work
order system** (`Ticket` model, `department = 'TECHNOLOGY'`), not a separate feature.
Relevant existing pieces:

- **Schema**: `backend/prisma/schema.prisma` — `model Ticket` (`@@map("tickets")`),
  lines ~1020-1085. Technology-specific columns: `equipmentId` (nullable FK to
  `equipment`). There is currently no boolean flag for "equipment not in inventory."
- **Asset-tag requirement**: `backend/src/services/work-orders.service.ts`
  (`createWorkOrder`, lines ~462-489). For `TECHNOLOGY` work orders, an equipment
  link is **required** unless the selected `WorkOrderCategory.requiresAssetTag`
  is explicitly `false`. Today a user who can't find their equipment in inventory
  search has no way to submit the request at all (validation throws
  `ValidationError('An asset tag is required for this category', 'equipmentId')`).
- **Auto-assignment to the school's tech assistant**: already implemented.
  `resolveAutoAssignee()` (lines ~435-456) looks up `LocationSupervisor` where
  `supervisorType = 'TECHNOLOGY_ASSISTANT'` and `locationId` = the work order's
  `officeLocationId`, preferring `isPrimary`. The resolved user is set as
  `assignedToId` on ticket creation.
- **Email notification**: already implemented. `sendAssignmentEmail()` (lines
  ~178-204) fires `sendWorkOrderAssigned()` (`backend/src/services/email.service.ts:320`)
  fire-and-forget after creation whenever an auto-assignee was resolved. So the
  school's Technology Assistant is already emailed on every new technology work
  order — this spec adds a **visually distinct callout** to that email plus a
  UI badge when equipment isn't in inventory, so the assistant knows this one
  needs investigation before it can be resolved normally.
- **"Mark as complete"**: already implemented via the existing status state
  machine (`VALID_TRANSITIONS` in `work-orders.service.ts`, and the mirrored
  `ALLOWED_NEXT_STATUSES` in `frontend/src/pages/WorkOrderDetailPage.tsx`).
  Any assigned staff member (permission level ≥ 3) can move `OPEN → IN_PROGRESS
  → RESOLVED/CLOSED`. Once the assistant identifies/adds the item, they can
  also link it via the existing `equipmentId` field on `updateWorkOrder`. No
  new endpoint is needed for "mark complete."
- **Frontend submission form**: `frontend/src/pages/NewWorkOrderPage.tsx`. The
  Technology-specific block (lines ~392-466) only renders the equipment
  Autocomplete when `assetTagRequired` is true, and blocks submission
  (`validate()`, lines ~82-93) if no `inventoryId` is selected in that case.
- **Contract**: `CreateWorkOrderDto` / `WorkOrderDetail` are duplicated in
  `shared/src/work-order.types.ts` and locally in
  `frontend/src/types/work-order.types.ts` (frontend intentionally does not
  import the shared package at runtime — both must be updated in lockstep).

### Conclusion
This feature is additive, not a new subsystem: one new nullable-safe boolean
column, one validator/service bypass of the existing asset-tag requirement,
one enrichment of an existing email function, and small UI additions
(checkbox + badge). No new routes, tables, or permission logic are required.

---

## 2. Problem Definition

A staff member submitting a Technology work order may have equipment that is
not yet recorded in the inventory system (e.g. a newly received device, or an
item whose asset tag is missing/unreadable). Today they are blocked from
submitting the request at all unless the selected category waives the asset
tag requirement. There is no way to say "I have equipment, but it's not in
your system" and still get help.

---

## 3. Proposed Solution

1. Add a checkbox to the Technology work order submission form:
   **"This equipment is not in my inventory."**
2. When checked:
   - The equipment Autocomplete is hidden/disabled and no longer required.
   - The ticket is created with a new `notInInventory: true` flag and no
     `equipmentId`.
3. On creation, the existing auto-assignment + email flow fires as it does
   today (routes to the `TECHNOLOGY_ASSISTANT` `LocationSupervisor` for the
   ticket's school). The email is enriched with a highlighted banner when
   `notInInventory` is true, so the assistant immediately understands this
   request needs inventory investigation, not just a repair.
4. The work order detail/list views show a **"Not in Inventory"** chip/badge
   for these tickets so they're easy to spot in the queue.
5. The assistant investigates, and — using functionality that **already
   exists** — either:
   - links the ticket to the equipment once it's added to inventory (existing
     `PUT /work-orders/:id` `equipmentId` field), and/or
   - progresses the ticket through the existing status workflow to
     `RESOLVED`/`CLOSED` ("mark as complete").

No new workflow states, endpoints, or permission checks are introduced.

---

## 4. Implementation Steps

### 4.1 Database (Prisma)

`backend/prisma/schema.prisma` — add one column to `model Ticket`, grouped with
the other Technology-specific fields (~line 1053-1056):

```prisma
// Technology-specific (nullable, only populated for TECHNOLOGY dept)
equipmentId      String?
equipment        equipment?         @relation("TicketEquipment", fields: [equipmentId], references: [id])
notInInventory   Boolean            @default(false)
```

Manually create the migration (container runs `prisma migrate deploy` on
startup — this file must ship in the same commit):

`backend/prisma/migrations/<YYYYMMDDHHMMSS>_add_not_in_inventory_to_tickets/migration.sql`
```sql
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "notInInventory" BOOLEAN NOT NULL DEFAULT false;
```

(Matches the exact style of the existing
`20260706120000_add_requires_asset_tag_to_work_order_categories` migration.)

### 4.2 Backend validators — `backend/src/validators/work-orders.validators.ts`

- `CreateWorkOrderSchema`: add
  `notInInventory: z.boolean().optional().default(false),`
  next to the other Technology-specific fields.
  Extend the existing `.superRefine()`:
  - If `department === 'MAINTENANCE' && notInInventory === true` → issue on
    `notInInventory` ("not valid for Maintenance work orders") — mirrors the
    existing `equipmentId`/`equipmentMfg` cross-checks in the same block.
  - If `notInInventory === true && equipmentId` → issue on `equipmentId`
    ("cannot both link existing equipment and flag as not in inventory").
- `UpdateWorkOrderSchema`: no change needed — an assistant clears the flag
  implicitly by setting `equipmentId` once the item is found (see 4.3).

### 4.3 Backend service — `backend/src/services/work-orders.service.ts`

**`createWorkOrder`** (~line 458):
- Skip the asset-tag-resolution block and the `requiresAssetTag` enforcement
  entirely when `data.notInInventory === true` (the whole `if
  (data.department === 'TECHNOLOGY' && !resolvedEquipmentId) {...}` block at
  lines ~475-489 short-circuits: `if (data.notInInventory) { /* skip */ }
  else { ...existing check... }`).
- Add `notInInventory: data.department === 'TECHNOLOGY' ? (data.notInInventory
  ?? false) : false` to the `tx.ticket.create({ data: {...} })` call.
- Pass `notInInventory` through to `sendAssignmentEmail` so the email can be
  enriched (see 4.4).

**`updateWorkOrder`**: when a caller sets `equipmentId` on a ticket that
currently has `notInInventory: true`, also set `notInInventory: false` in the
same update (the item has now been found/added — no new endpoint, just one
extra field in the existing `tx.ticket.update` data object, mirroring how
other implicit-clear behavior already works in this service, e.g. category
FK vs legacy `category` string).

### 4.4 Email — `backend/src/services/email.service.ts`

`sendWorkOrderAssigned()` (line 320): add an optional
`notInInventory?: boolean` field to the `workOrder` param object. When true,
render an additional highlighted block directly under the heading, e.g.:

```html
<div style="margin:12px 0;padding:12px;background-color:#FFF3E0;border-left:4px solid #E65100;">
  <strong>⚠ Equipment not found in inventory.</strong>
  The reporter indicated this equipment is not currently recorded in the
  inventory system. Please investigate and add/link the item once identified.
</div>
```

`sendAssignmentEmail()` in `work-orders.service.ts` (~line 178) passes
`ticket.notInInventory` through in the object it builds — only the creation
call site needs it (assignment-change email reuses the same function and
ticket row, which already carries the flag after the first send).

### 4.5 Shared + frontend types

- `shared/src/work-order.types.ts`: add `notInInventory: boolean` to
  `WorkOrderDetail`, `WorkOrderSummary` is unchanged (list view doesn't need
  full detail, but see 4.6 for the badge on the list — pull it in via the
  existing `WORK_ORDER_SUMMARY_INCLUDE` Prisma select and add to
  `WorkOrderSummary` too), and `notInInventory?: boolean` to
  `CreateWorkOrderDto`.
- `frontend/src/types/work-order.types.ts`: mirror the same three changes
  (this file intentionally duplicates the shared package per existing
  project convention — see file header comment).
- `backend/src/services/work-orders.service.ts`
  `WORK_ORDER_SUMMARY_INCLUDE`/`WORK_ORDER_DETAIL_INCLUDE` (~lines 69-83):
  Prisma returns all scalar columns by default only if no `select` is used;
  these consts use field-level selection objects, so add `notInInventory:
  true` to both.

### 4.6 Frontend — submission form

`frontend/src/pages/NewWorkOrderPage.tsx`:
- `FormState`: add `notInInventory: boolean` (default `false`).
- Render a `FormControlLabel`/`Checkbox` ("This equipment is not in my
  inventory") inside the existing Technology-specific block, above the
  Autocomplete, but only when `assetTagRequired` is true (if the category
  already waives the asset tag there's nothing to flag).
- When checked: clear `selectedEquipment`/`inventoryId`/`inventorySearch`
  (same pattern already used when switching to a `requiresAssetTag: false`
  category, lines ~276-283) and hide the Autocomplete.
- `validate()`: the existing `assetTagRequired && !form.inventoryId` check
  must also treat `form.notInInventory === true` as satisfying the
  requirement (equivalent to lowering `assetTagRequired` for validation
  purposes only).
- `handleSubmit`: include `notInInventory: form.notInInventory` in the DTO
  only when `department === 'TECHNOLOGY'`.

### 4.7 Frontend — detail & list views

- `frontend/src/pages/WorkOrderDetailPage.tsx`: render a `Chip` (e.g. color
  `warning`, label "Not in Inventory") next to the existing
  `WorkOrderStatusChip`/`WorkOrderPriorityChip` when `workOrder.notInInventory`
  is true.
- `frontend/src/pages/WorkOrderListPage.tsx`: add the same chip/indicator in
  the row/card for technology work orders so it's visible in the queue
  without opening each ticket. (Exact placement to be confirmed by reading
  the list page's row template during implementation — not fully inspected
  in this research pass.)

---

## 5. Dependencies

No new external dependencies. All changes use packages/APIs already in use
elsewhere in this exact module (Prisma 7 schema/migration pattern, Zod 4
`superRefine`, MUI v7 `Checkbox`/`Chip`, existing `sendMail` email pipeline).
Per the Dependency & Documentation Policy, doc verification is **not required**
for this change (internal change, no new libraries, copies existing in-repo
patterns).

---

## 6. Configuration Changes

None. No new env vars, Entra/Graph scopes, or settings.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A school has no `TECHNOLOGY_ASSISTANT` `LocationSupervisor` assigned, so `resolveAutoAssignee` returns `null` and no email is sent at all. | Pre-existing gap in the auto-assignment system, not introduced by this feature — out of scope here. Worth a separate follow-up (e.g. fall back to `TECHNOLOGY_DIRECTOR`), but not blocking this spec. |
| Reviewer/refinement scope creep: don't add a whole new "unresolved item" workflow like the Inventory Audit module has — that's a different subsystem and out of scope for this request. | Explicitly constrained above: reuse existing status transitions and `equipmentId` update path; no new statuses/endpoints. |
| Someone submits `notInInventory: true` **and** an `equipmentId` in the same request (bypassing the UI). | Blocked server-side by the new `superRefine` rule in 4.2 — fails closed. |
| Stale badge: ticket flagged `notInInventory` but assistant links equipment without the frontend clearing the flag. | Handled server-side in `updateWorkOrder` (4.3) — flag clears automatically whenever `equipmentId` is set, regardless of which UI path was used. |

---

## 8. Out of Scope

- Changing who can be a `TECHNOLOGY_ASSISTANT` or how that assignment is
  managed (existing `location.service.ts` / `locationSync.service.ts`).
- New ticket statuses beyond the existing `OPEN/IN_PROGRESS/ON_HOLD/RESOLVED/CLOSED`
  state machine — "mark as complete" reuses `RESOLVED`/`CLOSED`.
- Reminder emails or escalation if the assistant doesn't act — not requested.

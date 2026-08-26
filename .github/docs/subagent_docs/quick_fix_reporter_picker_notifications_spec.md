# Spec: Quick Fix — wrong reporter, no device choice, redundant notification

Three related corrections, implemented and verified sequentially.

## Fix 1 — attribute the ticket to the checked-out person, not the technician

### Current state
- `backend/src/validators/work-orders.validators.ts:146` — `QuickFixSchema` accepts only
  `{ equipmentId, categoryId, notes }`.
- `backend/src/services/work-orders.service.ts:755` — `quickFix(data, userId, permLevel,
  maintenanceRole)` calls `this.createWorkOrder({...}, userId)` (line 797), where `userId`
  is the technician who clicked the button. `createWorkOrder(data, reportedById)` (line 646)
  writes that straight into `Ticket.reportedById`.
- `QuickFixDialog.tsx` already holds `assignment.userId` / `assignment.user` from the
  Active Checkouts row it was opened from, but never sends it.

### FK compatibility — verified before designing
`schema.prisma`: `DeviceAssignment.userId` is an FK to `User`
(`@relation("DeviceAssignmentUser")`), and `Ticket.reportedById` is an FK to `User`
(`@relation("TicketReporter")`). **Both target the same `User` table** — staff and students
are both rows in it — so attributing a ticket to a student needs **no schema change**.

### Fix
Add required `reportedByUserId` to `QuickFixSchema`; resolve and validate the person in
`quickFix()`; pass `data.reportedByUserId` as `createWorkOrder`'s second argument. The
caller still performs the close step as themselves. The dialog sends `assignment.userId`.

### Known, accepted side effect
`updateStatus`'s `sendClosedEmail` on CLOSED is gated on `userId !== ticket.reportedById`.
Now that closer and reporter differ, the checked-out person receives a "your ticket was
closed" email. Correct, wanted behaviour — previously a silent no-op purely because of the
attribution bug.

### Known, accepted tradeoff
`assertTicketAccess`'s permLevel-3 branch treats `reportedById === userId` as one of three
ways a level-3 closer is in scope. That branch no longer trivially passes. `quickFix()`'s
existing try/catch around the close call (lines 801-819) already degrades gracefully —
returns the still-open ticket with a warn log, surfaced in the dialog as "created but could
not be automatically closed". Same fallback Quick Fix already had.

---

## Fix 2 — device picker: the person's own checkouts, their charger, "device not listed"

### Current state / data gaps
1. The dialog has no device field — it always uses the clicked row's `equipmentId`.
2. `deviceAssignment.service.ts:660` — `getByUser(userId)`'s `include` selects `equipment`
   and `checkedOutByUser` but **not** `chargerAssignment`, unlike every sibling query in the
   same file (`getActiveAssignments`, `getAllAssignments`, `checkinCharger`), which all use
   `chargerAssignment: { select: openChargerAssignmentSelect }`. A plain oversight.
3. `Charger` is deliberately not part of the `equipment` table (chargers skip full asset
   intake) and `Ticket.equipmentId` is an FK straight to `equipment`, so **a charger cannot
   be `Ticket.equipmentId`**. It must ride on the ticket another way.

### Fix
- `getByUser()` — add the missing `chargerAssignment` include, matching its siblings exactly.
- `QuickFixSchema` — `equipmentId` becomes optional/nullable, add optional/nullable
  `chargerId`, plus a `superRefine` making them mutually exclusive.
- `quickFix()` — resolve either an equipment or a charger, and in **both** cases re-verify
  server-side that the item is actually an active checkout of `reportedByUserId`. A charger
  resolves to its serial number, carried through the **existing**
  `notInInventory` / `notInInventoryTag` mechanism already used for "device not listed"
  (`work-orders.service.ts:708-709`) — **no schema change for chargers either**.
- `QuickFixDialog.tsx` — one MUI `Select` carries a single string value space, so ids are
  prefixed (`eq:` / `chg:`) to avoid collision, plus a `NOT_LISTED` sentinel. Default
  selection is the row's own device — switching is an *additional* choice, not a changed
  default. The frontend `quickFix()` wrapper and `useQuickFix()` payload types widen to match.

---

## Fix 3 — stop notifying the technician about their own already-closed ticket

### Current state — two independent mechanisms
`resolveAutoAssignee()` assigns by the equipment's location, so it almost always picks the
same technician running Quick Fix.
1. **Email + push.** `createWorkOrder` lines 734-736: `if (autoAssigneeId) {
   this.sendAssignmentEmail(...).catch(() => {}); }` — unconditional.
2. **Nav badge.** `requestBadges.service.ts:77` `countWorkOrders`, line 120:
   `if (t.assignedToId === userId && t.createdAt > since) changed.add(t.id);` — **status
   blind**. Quick Fix's close writes a `TicketStatusHistory` row, never a `TicketComment`,
   so this auto-assignment branch is the *only* signal that can ever see a Quick Fix ticket,
   and closing it does nothing to un-flag it.

### Fix
- `createWorkOrder(data, reportedById, options?: { notifyAssignee?: boolean })` — guard
  becomes `if (autoAssigneeId && (options?.notifyAssignee ?? true))`. The default preserves
  existing behaviour for every normal creation path.
- `quickFix()` passes `{ notifyAssignee: false }`.
- `countWorkOrders` — widen the `select` to include `status`, and add
  `&& t.status !== 'CLOSED'` to the auto-assignment branch. A **general** narrowing ("an
  assigned ticket that's already closed needs no further look"), not a Quick-Fix special
  case; it fully covers Quick Fix because Quick Fix is definitionally create-then-close.

No new "success" notification is added — the dialog's inline `Alert` already delivers that
confirmation synchronously, where the technician is already looking.

### Known, accepted tradeoff
If Quick Fix's close step later fails, the ticket stays OPEN and its auto-assignee now gets
**no** notification at all. Accepted: whoever ran Quick Fix sees the "could not be
automatically closed" warning directly in the dialog, and is almost always that same person.

---

## Implementation steps
1. Fix 1: schema field, service resolution + reporter swap, dialog payload.
   -> verify: backend + frontend builds exit 0.
2. Fix 2: `getByUser` include, schema `chargerId` + superRefine, service resolution +
   server-side re-verification, dialog picker, service/hook payload widening.
   -> verify: backend + frontend builds exit 0.
3. Fix 3: `createWorkOrder` opt-out flag, `quickFix` passes it, badge status narrowing.
   -> verify: backend build exits 0 and `request-badges.test.ts` still passes — specifically
   its existing test that a still-OPEN auto-assigned ticket counts for the assignee.

## Dependencies
None new.

## Configuration changes
**None. No Prisma schema change and no migration** — verified for all three fixes.

## Risks and mitigations
- Risk: trusting the dropdown's client-side filtering. Mitigation: server-side re-verify the
  device/charger is an active checkout of the attributed person; reject otherwise.
- Risk: id collision in a single `Select` value space. Mitigation: `eq:` / `chg:` prefixes.
- Risk: suppressing notifications for normal creation. Mitigation: the flag defaults to true;
  only Quick Fix opts out.
- Risk: over-narrowing the badge. Mitigation: only CLOSED is excluded, and only on the
  auto-assignment branch; the comment-based signals are untouched.

## Deliberately not changed
- Quick Fix's existing permLevel-3 gate and its close-failure fallback.
- The comment-driven badge signals.
- Every other `createWorkOrder` call site keeps default notification behaviour.

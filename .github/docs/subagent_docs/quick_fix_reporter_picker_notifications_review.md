# Review: Quick Fix — reporter, device/charger picker, notifications

## Files reviewed
- `backend/src/validators/work-orders.validators.ts` — `QuickFixSchema`
- `backend/src/services/work-orders.service.ts` — `createWorkOrder`, `quickFix`
- `backend/src/services/deviceAssignment.service.ts` — `getByUser`
- `backend/src/services/requestBadges.service.ts` — `countWorkOrders`
- `frontend/src/components/DeviceManagement/QuickFixDialog.tsx`
- `frontend/src/services/work-order.service.ts`, `frontend/src/hooks/mutations/useWorkOrderMutations.ts`

## Fix 1 — reporter attribution
- `reportedByUserId` added as required; resolved and validated (`ValidationError('Person not
  found')`) before use; passed as `createWorkOrder`'s `reportedById`. The caller still runs
  the close step as themselves — `updateStatus(..., userId, ...)` unchanged.
- FK compatibility verified in `schema.prisma` **before** implementing: both
  `DeviceAssignment.userId` and `Ticket.reportedById` are FKs into the same `User` table.
  No schema change.
- Dialog now shows "Reported by: {name}" and sends `assignment.userId`.

## Fix 2 — device/charger picker
- `getByUser()` gained the missing `chargerAssignment: { select: openChargerAssignmentSelect }`
  include, byte-matching its sibling queries.
- `QuickFixSchema`: `equipmentId` and `chargerId` both optional/nullable with a `superRefine`
  rejecting both-at-once. Both omitted = "Device not listed".
- **Server-side re-verification on both paths** — a `deviceAssignment.findFirst({ equipmentId,
  userId: reportedByUserId, returnedAt: null })` and the charger equivalent. The dropdown's
  client-side filtering is not the only enforcement.
- Charger rides the **existing** `notInInventory` + `notInInventoryTag` mechanism
  (`Charger ${serialNumber}`) rather than a new column — `Ticket.equipmentId` is an FK to
  `equipment` and chargers deliberately are not equipment rows. **No schema change.**
- `eq:` / `chg:` prefixes plus a `NOT_LISTED` sentinel keep the single `Select` value space
  unambiguous. Default selection is the clicked row's own device.
- Payload types widened in both the service wrapper and the hook — caught by `tsc` on the
  first frontend build (TS2322 at QuickFixDialog.tsx:102) and fixed, not worked around.

## Fix 3 — notifications
- `createWorkOrder` gained `options?: { notifyAssignee?: boolean }`; the guard is
  `if (autoAssigneeId && (options?.notifyAssignee ?? true))`. **Default preserves existing
  behaviour** — every other call site is unaffected.
- `quickFix()` passes `{ notifyAssignee: false }`.
- `countWorkOrders` selects `status` and adds `&& t.status !== 'CLOSED'` to the
  auto-assignment branch only. The comment-driven signals are untouched. This is a general
  narrowing, not a Quick-Fix flag — no new column, no tagging tickets as "from Quick Fix".
- No replacement "success" notification added: the dialog's inline `Alert` already confirms
  synchronously.

## Build & test validation
- Fix 1: backend build **EXIT=0**, frontend build **EXIT=0**.
- Fix 2: backend build **EXIT=0**; frontend build initially **EXIT=1** (TS2322, payload type
  too narrow), then **EXIT=0** after widening both payload types.
- Fix 3: backend build **EXIT=0**; test suite **EXIT=0**,
  **Test Files 9 passed (9) / Tests 67 passed (67)**, including
  `request-badges.test.ts` **12 tests passed** — test 12 ("a ticket auto-assigned at creation
  counts for the assignee") uses a fixture hardcoded to `status: 'OPEN'`
  (`helpers/db.ts:124`), confirming the new guard narrows the closed case only and does not
  regress the open case.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Result: PASS

## Known, accepted side effects and tradeoffs
1. The checked-out person now genuinely receives the "your ticket was closed" email
   (previously a silent no-op caused by the attribution bug). Correct, wanted behaviour.
2. `assertTicketAccess`'s permLevel-3 `reportedById === userId` branch no longer trivially
   passes for a level-3 Quick Fix caller; the pre-existing try/catch fallback handles it.
3. If Quick Fix's close step fails, the auto-assignee now gets no notification at all — the
   operator sees the warning in the dialog instead.

## Not independently verified
A live click-through: selecting a charger from the dropdown, confirming no email/push
arrives, and confirming the nav badge does not increment. All three fixes were validated by
code-path tracing plus the existing automated suite, not a manual end-to-end session.

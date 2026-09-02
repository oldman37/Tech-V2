# Spec: Suppress the "work order completed" notification for Quick Fix

## Current state analysis

- `backend/src/services/work-orders.service.ts` `quickFix()` (line 761) creates the
  ticket via `createWorkOrder({...}, data.reportedByUserId, { notifyAssignee: false })`
  (line 831-850) — `reportedById` is deliberately the checked-out person, not the
  caller. This attribution is intentional (see
  `.github/docs/subagent_docs/quick_fix_reporter_picker_notifications_spec.md`, Fix 1)
  and is NOT being changed here.
- `quickFix()` then immediately calls `this.updateStatus(created.id, { status:
  'CLOSED', notes: data.notes }, userId, permLevel, maintenanceRole)` (line 854-860),
  where `userId` is the technician running Quick Fix — always different from
  `created.reportedById`.
- `updateStatus()` (line 916), after committing the transaction, contains (line 977-979):
  ```ts
  if (data.status === 'CLOSED' && userId !== ticket.reportedById) {
    this.sendClosedEmail(id, ticket.ticketNumber, ticket.department, ticket.priority, ticket.officeLocationId, ticket.reportedById, data.notes).catch(() => {});
  }
  ```
  This guard exists to avoid notifying someone about their own action (added per
  `WORK_ORDER_CLOSED_NOTIFICATION_spec.md`). For every Quick Fix call, `userId !==
  ticket.reportedById` is always true, so `sendClosedEmail` always fires — sending the
  checked-out person a "your work order has been completed" email, and (via
  `sendWorkOrderClosed` → `sendMail()` → `notifyPushByEmails()`, confirmed at
  `email.service.ts:46-82`) a matching Web Push notification, from the single
  `context: 'work_order_closed'` call site.
- `quick_fix_reporter_picker_notifications_spec.md` (Fix 1, "Known, accepted side
  effect") explicitly called this out and accepted it as "correct, wanted behaviour"
  at the time. Per the current bug report, that determination is now reversed: Quick
  Fix exists purely to log an already-completed, on-the-spot fix, and must produce
  **no** notification of any kind to the reporter or assignee — that is the point of
  the flow.
- The codebase already has the exact opt-out shape needed, on the sibling
  notification: `createWorkOrder(data, reportedById, options?: { notifyAssignee?:
  boolean })` (line 646, guard at line 740: `if (autoAssigneeId && (options?.notifyAssignee ?? true))`),
  which `quickFix()` already uses (`{ notifyAssignee: false }`, line 849).
- `updateStatus()` has one other conditional notification, for `LONG_TERM` (line
  981): `if (data.status === 'LONG_TERM' && data.notifySubmitter && userId !==
  ticket.reportedById)`. Unreachable from `quickFix()` (which only ever transitions
  `OPEN → CLOSED`) and must not be touched.
- No test file for `quickFix()` or this notification exists yet
  (`backend/src/__tests__/` has no `workorders-quick-fix*` or similar file — confirmed
  via directory listing).
- `email_queue` is a real Prisma model (`prisma.email_queue`, `schema.prisma:1381`)
  written by `sendMail()` in `email.service.ts` with `context` and `relatedEntityId`
  columns — `sendWorkOrderClosed` writes `context: 'work_order_closed'`,
  `relatedEntityId: workOrder.workOrderId` (`email.service.ts:399-400`). This is the
  observable signal for the regression test — it covers both channels, since push is
  fanned out from the same `sendMail()` call, not a separate call site.
- Test helpers available in `backend/src/__tests__/helpers/db.ts`: `createTestUser`,
  `createTestLocation`, `createTestWorkOrder`, `cleanupTickets`, `cleanupUsers`,
  `cleanupLocations`, using a dedicated test Prisma client (`getTestPrisma()`) against
  `DATABASE_URL` (the test DB, not the persistent dev DB — vitest config supplies a
  separate connection string). None of these currently create `Equipment`,
  `DeviceAssignment`, or `WorkOrderCategory` rows — new inline setup will be needed
  for a `quickFix()` integration test since it requires an active device checkout and
  an opt-in category.
- Auth pattern for integration tests: `signTestAccessToken(makeTokenPayload(user,
  {...}))` from `helpers/auth.ts`, used with `supertest` against the exported `app`
  (`workorders-scope.test.ts` is the closest existing model).

## Problem definition

Quick Fix's create-then-close call sequence always satisfies `updateStatus()`'s
close-notification guard (`userId !== ticket.reportedById`), because the ticket is
attributed to the checked-out person while the close is performed by the technician.
This sends that bystander an unwanted "your work order has been completed" email and
push notification on every Quick Fix submission, defeating the flow's purpose (logging
an already-finished fix with no notification noise).

## Proposed solution

Mirror the existing `notifyAssignee` opt-out pattern on `createWorkOrder()`, applied to
`updateStatus()`'s closed-ticket notification:

1. Add an `options?: { suppressReporterNotification?: boolean }` parameter to
   `updateStatus()`, defaulted so every other call site (the `PUT /:id/status`
   controller — the only other caller) is unaffected.
2. Gate only the `CLOSED` notification branch with `&& !options?.suppressReporterNotification`.
   The `LONG_TERM` branch is untouched — it is unreachable from `quickFix()` and out
   of scope for this fix.
3. `quickFix()` passes `{ suppressReporterNotification: true }` on its close call.

## Implementation steps

1. `backend/src/services/work-orders.service.ts`:
   - Add the `options` parameter to `updateStatus()`'s signature (after
     `maintenanceRole`), with a doc comment explaining why (mirrors the existing
     `notifyAssignee` comment style on `createWorkOrder`).
   - Change the `CLOSED` notification condition at line 977 to also check
     `!options?.suppressReporterNotification`.
   - Update `quickFix()`'s `updateStatus(...)` call (line 854-860) to pass
     `{ suppressReporterNotification: true }` as the 6th argument.
   -> verify: backend image build exits 0 (type-checks the new parameter and call
      site).
2. `backend/src/__tests__/workorders-quick-fix-notifications.test.ts` (new) —
   integration test modeled on `workorders-scope.test.ts`'s setup/teardown shape:
   - Seed: office location, a `TECHNOLOGY`/opt-in `WorkOrderCategory`
     (`quickFix: true`, `isActive: true`, `module: 'TECHNOLOGY'`), a "checked-out
     person" user + an `Equipment` row + an active `DeviceAssignment` linking them, and
     a permLevel-3+ technician user/token to call the endpoint as.
   - Test 1 ("Quick Fix enqueues no completion notification"): `POST
     /api/work-orders/quick-fix` as the technician with a valid payload (
     `reportedByUserId`, `equipmentId`, `categoryId`, `issue`, `notes`); assert the
     response ticket is `CLOSED`; then query `prisma.email_queue.findMany({ where:
     { context: 'work_order_closed', relatedEntityId: ticket.id } })` (poll briefly,
     e.g. up to ~2s, since the send is fire-and-forget) and assert it stays empty.
   - Test 2 (control): seed a normal ticket via `createTestWorkOrder` reported by one
     user, close it via `PUT /:id/status` as a *different* user (existing behaviour,
     unmodified call site); assert a matching `email_queue` row *does* appear (poll up
     to ~5s). Proves Test 1's absence assertion is meaningful.
   - Cleanup: delete created tickets/email_queue rows/device assignment/equipment/
     category/users/location in FK-safe order in `afterAll`.
   -> verify: `docker compose -f docker-compose.dev.yml build backend` (which runs
      `npx vitest run` per the existing Dockerfile test stage — confirm exact command
      from `backend/Dockerfile`/`package.json` before relying on it; if the image
      build does not run tests, this step instead documents `npx vitest run` inside
      the backend container as the safe test command, never bare `npm test`/`npx
      vitest` per FORBIDDEN COMMANDS) exits 0, and the new suite passes.

## Dependencies

None — reuses the existing `sendMail`/`email_queue`/push pattern and the existing
`notifyAssignee`-style options-object convention already in this file. No new
package, no Prisma schema change, no shared-types change.

## Configuration changes

None. No `schema.prisma` edit, so no migration file is needed for this fix.

## Risks and mitigations

- Risk: broadening the suppression to affect the `LONG_TERM` notification too.
  Mitigation: the new flag is checked only in the `CLOSED` branch's condition; the
  `LONG_TERM` branch's condition is left character-for-character unchanged.
- Risk: silently changing behaviour for the normal `PUT /:id/status` close path.
  Mitigation: the new parameter is optional and defaults to `undefined`
  (falsy) — behaviourally identical to today for every caller except `quickFix()`.
  its own call site.
- Risk: test flakiness from asserting an absence on a fire-and-forget async send.
  Mitigation: short poll window (matches the pattern described as already verified
  in the reference fix write-up) plus the Test 2 control proving the detector fires
  when it should.
- Risk: unclear whether `docker compose build backend` actually executes the test
  suite as part of the image build. Mitigation: Phase 3 review confirms the actual
  test-invocation command against `backend/Dockerfile` before claiming build success
  implies test success, and documents actual command output verbatim either way.

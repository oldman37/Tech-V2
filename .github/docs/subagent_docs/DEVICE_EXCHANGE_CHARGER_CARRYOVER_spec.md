# Spec: Incident device exchange strands the paired charger, creating a phantom "Charger Outstanding" row

## Current state analysis

`backend/prisma/schema.prisma:1527` — `ChargerAssignment` is paired 1:1 with a
`DeviceAssignment` via `deviceAssignmentId String @unique`, with its own
independently-nullable `returnedAt`, and denormalised `userId`/`assigneeType`
copied from the parent checkout at creation time. The charger is tied to the
student *through* the device checkout, not directly.

`backend/src/services/damageIncident.service.ts:425` `deviceExchange()` runs
its own inline check-in/check-out inside one `$transaction`
(`damageIncident.service.ts:473-623`):
- check-in branch (`:484-523`): sets `DeviceAssignment.returnedAt` on the old
  laptop, resets `equipment.status`/`assignedToUserId`. **Never queries or
  touches `ChargerAssignment`.**
- check-out branch (`:525-592`): creates a fresh `DeviceAssignment` for the
  replacement laptop (`txCheckoutAssignment`, `include` at `:576-581` has no
  `chargerAssignment`). **Never creates or re-points a `ChargerAssignment`.**

By contrast, `backend/src/services/deviceAssignment.service.ts:404-486`
`checkin()` already handles the paired charger on normal check-in: marks it
returned or flags a missing-charger incident. `deviceExchange()` has no
equivalent logic, and — more importantly — no notion of the charger
*following* the device, which an exchange requires.

`getActiveAssignments()` (`deviceAssignment.service.ts:540-563`) keeps a row
visible while **either** side is open:
```ts
const activeOr = [{ returnedAt: null }, { chargerAssignment: { returnedAt: null } }];
```
So after an exchange, the charger assignment (still `returnedAt: null`, still
pointing at the now-closed old `DeviceAssignment`) keeps that old row visible
as a second row, rendered by `CheckoutPage.tsx`'s `isChargerOutstandingOnly(r)`
as "Charger Outstanding".

`deviceAssignment.service.ts:52` has a module-private
`openChargerAssignmentSelect` constant (`{ id, returnedAt, charger: { id,
serialNumber } }`) used by 6 queries in that file only — not exported, not
usable from `damageIncident.service.ts`.

Frontend: `frontend/src/types/deviceAssignment.types.ts:52` —
`DeviceAssignment.chargerAssignment?: OpenChargerAssignment | null` is
already optional, so no type change is needed for the response to carry it.
`frontend/src/services/deviceExchange.service.ts` types
`checkoutAssignment: DeviceAssignment | null` — already wide enough.
`frontend/src/pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx`'s
summary panel (`:245-273`, "Checked Out" block) currently renders asset tag,
assignee, and condition only — no charger line.

## Problem definition

A device exchange (check in a broken laptop, check out a replacement, in one
request) never moves the paired open `ChargerAssignment` from the old
checkout to the new one. The charger — which the student kept the whole
time — is left open on the closed old checkout, which the Active Checkouts
query surfaces as a second, phantom "Charger Outstanding" row instead of
following the student onto their new laptop's single row.

## Proposed solution

In `deviceExchange()`'s transaction, in the `data.checkout` branch, **only
when `data.checkin` is also present**, after the replacement
`DeviceAssignment` is created and its equipment marked `checked_out`: look up
the open `ChargerAssignment` for the old checkout
(`deviceAssignmentId: data.checkin.assignmentId`); if found and not yet
returned, re-point its `deviceAssignmentId` to the new `txCheckoutAssignment`
and re-sync its denormalised `userId`/`assigneeType` to the new checkout's
values. Do not touch `chargerId`, `checkoutAt`, `checkoutBy`, or `notes` (the
charger has been continuously checked out to this person) and do not call
`charger.update` (its `status` stays `checked_out` — it never left).

The unique constraint on `ChargerAssignment.deviceAssignmentId` is safe: the
target row was just created in this same transaction and the exchange never
attaches a charger to it elsewhere.

Add `chargerAssignment: { select: { id, returnedAt, charger: { select: { id,
serialNumber } } } }` (inline literal — same shape as
`openChargerAssignmentSelect`, not imported, since it is module-private in
`deviceAssignment.service.ts` and this is the only call site in
`damageIncident.service.ts` that needs it) to the check-out branch's
`include`, so the response reflects the re-pair and is consistently `null`
otherwise.

Frontend: add one line to the "Checked Out" block in
`WizardStep4DeviceExchange.tsx` showing the carried-over charger's serial
number when `checkoutAssignment.chargerAssignment` is present. No type
change needed — the field is already optional on `DeviceAssignment`.

## Implementation steps

1. `backend/src/services/damageIncident.service.ts` — `deviceExchange()`:
   inside the `if (data.checkout)` block, after `txCheckoutAssignment` is
   created and its equipment updated, add the `if (data.checkin) { ... }`
   re-pairing block described above; add `chargerAssignment` to the
   check-out `include`.
2. `frontend/src/pages/DeviceManagement/wizard/WizardStep4DeviceExchange.tsx` —
   one conditional `<Typography>` line under the existing "Checked Out"
   condition line.
3. `backend/src/__tests__/device-exchange-charger-carryover.test.ts` (new) —
   integration test following the `inventory-permanent-delete.test.ts`
   pattern (supertest against `app`, `getTestPrisma`/`createTestUser` from
   `./helpers/db`, `signTestAccessToken`/`makeTokenPayload`/`csrfPair` from
   `./helpers/auth`), authenticated as a user in
   `ENTRA_TECH_ASSISTANTS_GROUP_ID` (matches `requireDeviceManagementAccess()`
   on the route):
   - Seed a user, a broken-laptop `equipment` + open `DeviceAssignment`, an
     open `ChargerAssignment` on it, a replacement `equipment`, and an open
     `damageIncident` linking the device/user.
   - POST `/api/damage-incidents/:id/device-exchange` with both `checkin`
     and `checkout`. Assert: the charger assignment's `deviceAssignmentId`
     now equals the new checkout's id, `returnedAt` still null, `chargerId`
     unchanged, `charger.status` still `checked_out`, exactly one active
     `DeviceAssignment` for the student, old assignment closed, response
     `checkoutAssignment.chargerAssignment` present with the right serial.
   - Second case: same seed, POST with `checkin` only (skip-checkout) —
     assert the charger assignment is unchanged (still on the old
     assignment, still open).

## Dependencies

None — no new packages. No Prisma schema change (only an existing row's FK
and denormalised columns are updated), no migration.

## Configuration changes

None.

## Risks and mitigations

- **Risk:** re-pairing could fire when it shouldn't (e.g. checkout without
  checkin). **Mitigation:** the re-pair block is gated on `data.checkin`
  being present, matching the spec's requirement that a skip-checkin
  exchange (no old checkout to move the charger *from*) leaves the charger
  assignment untouched — this is the correct case for
  `checkinCharger()`/manual close, not this endpoint.
- **Risk:** double-move if an exchange is retried. **Mitigation:** the
  lookup filters `!openChargerAssignment.returnedAt`, so a charger already
  moved/returned is a no-op on retry.
- **Risk:** touching the physical `charger.status`. **Mitigation:**
  deliberately not touched — the charger never left the student, so no
  status transition applies here (unlike `checkin()`'s branch, which does
  update it because there the charger really is coming back).

## Build/validation commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` (or `scripts/preflight.ps1`, which runs all three)

No FORBIDDEN COMMANDS involved — the test suite runs against the scoped
`backend-test`/`db-test` containers, not the persistent dev database, and no
`prisma migrate dev`/`reset` is used since no schema change is needed.

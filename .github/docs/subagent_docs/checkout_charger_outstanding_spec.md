# Spec: Checking in a device drops the whole checkout row when the charger wasn't returned

## Current state analysis

### Data model (verified in `backend/prisma/schema.prisma`)
`ChargerAssignment` is paired 1:1 with `DeviceAssignment` (`deviceAssignmentId String
@unique`) and carries its own `returnedAt DateTime?` / `returnedBy String?`, independent of
`DeviceAssignment.returnedAt`. **No schema change and no migration are needed.**

### `checkin()` — `backend/src/services/deviceAssignment.service.ts:404`
- 409-guards re-checkin: `if (assignment.returnedAt) throw new AppError('Device has already
  been returned', 409, 'CONFLICT')` (line 415).
- **Unconditionally** sets `DeviceAssignment.returnedAt = new Date()` and resets
  `equipment.status: 'active'`, `assignedToUserId: null`. This is **correct** — the physical
  device really was handed back.
- Already correctly leaves `ChargerAssignment.returnedAt` null when
  `data.chargerReturned !== true`, setting `shouldCreateChargerIncident` instead (line 452).

### `getActiveAssignments()` — line 491, backs the Active Checkouts list
`const where: Prisma.DeviceAssignmentWhereInput = { returnedAt: null };` — strictly the
device's own timestamp. The moment a device is checked in, the whole row (device **and**
still-outstanding charger) vanishes from the list, even though the database correctly still
records the charger as unreturned.

Its free-text search `OR` (line 515) **already** contains
`{ chargerAssignment: { charger: { serialNumber: { contains: q, mode: 'insensitive' } } } }`.

### The latent third problem
The only code path that ever sets `ChargerAssignment.returnedAt` is inside `checkin()`,
which refuses to run twice (the 409 above). So widening the list query alone would create
rows stuck "charger outstanding" forever with no way to close them.

## Problem definition
1. Checking a device in with "charger returned? No" removes the entire checkout listing from
   Active Checkouts, so nothing shows the user is still holding the charger.
2. A charger serial is not findable in the Checkouts search box — **a direct consequence of
   (1)**, not a separate bug: the row is excluded by the top-level `returnedAt: null` filter
   before the search predicate is ever evaluated. Fixing (1) fixes (2) with no search change.

## Proposed solution architecture

### 1. Widen the active predicate
A row stays listed while **either** the device or its paired charger is outstanding. A
`where` object can only carry one `OR` key, so the existing search `OR` moves under `AND`
alongside the new active-predicate `OR`:

```ts
const activeOr: Prisma.DeviceAssignmentWhereInput[] = [
  { returnedAt: null },
  { chargerAssignment: { returnedAt: null } },
];
const andConditions: Prisma.DeviceAssignmentWhereInput[] = [{ OR: activeOr }];
const where: Prisma.DeviceAssignmentWhereInput = { AND: andConditions };
```

All pre-existing scalar filters (`userId`, `equipmentId`, `assigneeType`, `cartId` via
`sourceType`, `locationId` via `campusId`, `user.gradeLevel`) stay as top-level `where`
keys — Prisma ANDs those implicitly with `where.AND`, so filter composition is unchanged.

### 2. New charger-only checkin
`checkinCharger(deviceAssignmentId, performedByUserId)` in the same service: finds the
charger assignment by `deviceAssignmentId`, 404s if absent, 409s if already returned, and in
one transaction marks it returned (timestamp + `returnedBy`) and sets the physical
`charger.status: 'active'`. Returns the parent `DeviceAssignment` refreshed with full
relations so the frontend can use the response directly.

Wired up matching the sibling `assignCharger` endpoint's middleware stack exactly:
`POST /:id/charger/checkin` with `validateCsrfToken`, `requireDeviceManagementAccess()`,
`validateRequest(AssignmentIdParamSchema, 'params')`. No new Zod body schema (empty body);
`AssignmentIdParamSchema` is already imported in the routes file for the sibling route.
**No new permission tier.**

### 3. Frontend
- `frontend/src/services/deviceAssignment.service.ts` — `checkinCharger` client method.
- `frontend/src/pages/DeviceManagement/CheckoutPage.tsx`:
  - helper `isChargerOutstandingOnly(r) = !!r.returnedAt && !!r.chargerAssignment &&
    !r.chargerAssignment.returnedAt`
  - `status` column: a `Chip label="Charger Outstanding" color="warning"` instead of
    `DeviceStatusChip` — the equipment's real status ("Active"/available) would otherwise
    read as contradictory on a row still sitting in the checkouts list.
  - `actions` column: a single "Check In Charger" button instead of the Check In / Edit /
    Replace Charger / Quick Fix / Create Incident group — those all target the already-closed
    device side, and the plain Check In button would now hit the 409 in `checkin()`.
  - `chargerCheckinTarget` state + `chargerCheckinMutation` invalidating
    `['device-assignments', 'active']`, matching the existing `checkinMutation` pattern.
  - A small inline confirm `Dialog` (Cancel / "Check In Charger") beside the other
    target-based dialogs — no new component file for a single confirm action.

## Implementation steps
1. Restructure `getActiveAssignments`'s `where`. -> verify: all six pre-existing filters
   still assigned as top-level keys; search `OR` pushed into `andConditions`.
2. Add `checkinCharger` service function. -> verify: 404/409 paths and transaction.
3. Add controller passthrough + route. -> verify: middleware stack identical to `/:id/charger`.
4. Add frontend client method. -> verify: matches sibling signature style.
5. `CheckoutPage.tsx` helper, status chip, actions, mutation, dialog.
6. Backend + frontend image builds and the backend test suite. -> verify: all exit 0.

## Dependencies
None new.

## Configuration changes
**None. No Prisma schema change, no migration file** — `ChargerAssignment.returnedAt` /
`returnedBy` already exist.

## Risks and mitigations
- Risk: two `OR` keys silently overwriting each other. Mitigation: the `AND`-of-two-`OR`s
  structure, explicitly.
- Risk: breaking existing filter composition. Mitigation: leave every scalar filter as a
  top-level key; Prisma ANDs them with `where.AND`.
- Risk: charger-outstanding rows becoming unclosable. Mitigation: that is exactly why
  `checkinCharger` exists.

## Deliberately not changed
- **`checkin()`** — its unconditional device-side close and its 409 re-checkin guard are
  both correct; the 409 is precisely why `checkinCharger` is a separate endpoint.
- **`scanDevice()` / Quick Check** — scanning an already-returned device correctly reports
  "not currently checked out". The follow-up belongs on the Checkouts list, where the row
  now persists.
- **`getAllAssignments()`** — no `search` param, not called by any frontend page today.
- **`CheckinForm.tsx`** — its "was the charger returned?" question is already correct.
- **`frontend/src/types/deviceAssignment.types.ts`** — `returnedAt` is already nullable on
  both types; no type change needed.

# Spec: A user's Checkout History never lists the charger, only the laptop

## Current state analysis

`frontend/src/pages/DeviceManagement/UserCheckoutHistoryPage.tsx` Tab 0
(`:220-305`) renders `ResponsiveTable<typeof assignments[number]>` directly
over `assignments` (from `deviceAssignmentService.getByUser(userId)`,
typed `Promise<DeviceAssignment[]>`). Its 7 columns (Asset Tag, Device Name,
Type, Checked Out, Condition Out, Returned, Condition In) never read
`a.chargerAssignment` — there is no row for the charger at all.

`backend/src/services/deviceAssignment.service.ts:660-672` `getByUser()`
already includes the paired charger:
```ts
chargerAssignment: { select: openChargerAssignmentSelect },
```
`openChargerAssignmentSelect` (`:52-56`) is `{ id, returnedAt, charger: {
id, serialNumber } }` — no `checkoutAt`. It's used by 6 other queries in
this same file (`:92,383,523,607,648,669`), so it must stay unchanged; only
this one call site needs the extra field.

`ChargerAssignment` (`backend/prisma/schema.prisma:1527-1546`) is a child of
one `DeviceAssignment` (`deviceAssignmentId String @unique`) with its own
`checkoutAt`/`returnedAt`/`returnedBy` — independent lifecycles from the
laptop. There is no standalone charger-checkout record, so a "charger row"
must be synthesised from the nested relation on a device row.

`frontend/src/types/deviceAssignment.types.ts:26-30`:
```ts
export interface OpenChargerAssignment {
  id: string;
  returnedAt: string | null;
  charger: { id: string; serialNumber: string };
}
```
No `checkoutAt`. No charger detail route exists anywhere in the frontend
router — confirmed by there being no route referencing a charger id — so the
new row's identifier must be plain text, not a link.

## Problem definition

A student/staff member with a laptop and a charger checked out shows only
one row (the laptop) in their Checkout History tab. The charger — which can
be returned, replaced, or carried over independently of the laptop (device
exchange, standalone charger check-in) — is completely invisible on this
read-only history view.

## Proposed solution

1. Widen only the `getByUser()` call site's charger select with
   `checkoutAt` (spread the shared select, add one field) — not the shared
   `openChargerAssignmentSelect` constant.
2. Add `checkoutAt?: string` (optional) to `OpenChargerAssignment` on the
   frontend so every other producer/consumer of that type compiles
   unchanged.
3. On `UserCheckoutHistoryPage.tsx` Tab 0 only: introduce a discriminated
   union row type (`device` | `charger`), flatten each device assignment
   into a device row followed immediately by a charger row when
   `chargerAssignment` is present, and make every column's `render` branch
   on `row.kind`.

## Implementation steps

1. `backend/src/services/deviceAssignment.service.ts` — `getByUser()`:
   ```diff
   -      chargerAssignment: { select: openChargerAssignmentSelect },
   +      // `checkoutAt` is added here (not to the shared select) so the user
   +      // checkout-history page can render the charger as its own row with
   +      // its own checkout date.
   +      chargerAssignment: { select: { ...openChargerAssignmentSelect, checkoutAt: true } },
   ```
2. `frontend/src/types/deviceAssignment.types.ts` — add to
   `OpenChargerAssignment`:
   ```ts
   /** Present only from getByUser (user checkout history) — the charger's own checkout date. */
   checkoutAt?: string;
   ```
3. `frontend/src/pages/DeviceManagement/UserCheckoutHistoryPage.tsx`:
   - `HistoryRow` discriminated union + `buildHistoryRows()` helper (device
     variant = existing `DeviceAssignment`; charger variant = `{ id,
     serialNumber, checkoutAt, returnedAt, parentEquipmentId }`), inserting
     the charger row immediately after its parent device row.
   - Tab-0 table: `ResponsiveTable<HistoryRow>`, `rows={buildHistoryRows(assignments)}`,
     columns cast `as Column<HistoryRow>[]` (mirrors the existing Tab-1
     incidents cast in the same file). Column branches:
     - Asset Tag: device → existing monospace link; charger → serial number,
       monospace, no link.
     - Device Name: device → `equipment?.name ?? '—'`; charger → `"Charger"`.
     - Type: device → existing chip; charger → `"Charger"` chip, outlined.
     - Checked Out: device → `fmtDate(checkoutAt)`; charger →
       `fmtDate(row.checkoutAt)` (falls back to the parent's `checkoutAt` if
       ever missing, since the field is optional on the type).
     - Condition Out / Condition In: device unchanged; charger → `'—'`.
     - Returned: same "Active" chip vs. formatted-date renderer, applied to
       the row's own `returnedAt`.
   - `getRowKey`: prefix `'d-'`/`'c-'` to prevent id collisions.
   - `onRowClick`: charger → navigate to `parentEquipmentId`'s device page
     if known, else no-op; device → unchanged.
   - Tab 1, page header, empty state, all other queries: untouched.

## Dependencies

None — no new packages.

## Configuration changes

None. No Prisma schema change (only an existing nested relation's field
selection widened), no migration.

## Risks and mitigations

- **Risk:** widening the shared `openChargerAssignmentSelect` would change
  the payload shape for the 6 other call sites unnecessarily. **Mitigation:**
  spread + extend inline at the single `getByUser()` call site only, per
  spec — the shared constant is untouched.
- **Risk:** row-key collision between a device assignment id and a charger
  assignment id. **Mitigation:** `'d-'`/`'c-'` prefixes make collision
  impossible regardless of UUID collision odds.
- **Risk:** `checkoutAt` being optional on `OpenChargerAssignment` could read
  as `undefined` in the date formatter. **Mitigation:** `fmtDate` is only
  ever called with `row.checkoutAt` from a row already built by
  `buildHistoryRows()`, which falls back to the parent device's `checkoutAt`
  when the charger's own is absent (defensive, since only this one backend
  call site actually supplies it, but every other producer sets the field
  to `undefined` rather than omitting it entirely from the type).

## Build/validation commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` (or `scripts/preflight.ps1`)

No FORBIDDEN COMMANDS involved.

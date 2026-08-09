# Spec: Move a device already checked out in another cart

## Current state analysis

- **Page**: Checked-Out Carts (`/device-management/carts`,
  `frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx`) → "Add
  Device" button on a cart card/row → opens
  `frontend/src/components/DeviceManagement/AddDeviceToCartDialog.tsx`. This
  dialog only ever targets carts already in `checked_out` /
  `partially_returned` status (that's the whole premise of this page), and
  calls `deviceCartService.scanToCart(cart.id, { identifier })`.
- **Backend path**: `POST /api/device-carts/:id/scan` →
  `deviceCartController.scanToCart` → `deviceCartService.scanToCart` — for a
  non-draft cart (confirmed: always true on this page), it delegates to
  `addAndCheckoutCartItem(tx, cartId, equipmentId, ...)`
  (`backend/src/services/deviceCart.service.ts:386-462`). `addItem`
  (`POST /:id/items`, used by the equipmentId-based add flow) shares this
  same helper for non-draft carts (line 474-481) — confirmed both routes hit
  identical logic.
- **The exact blocker**: inside `addAndCheckoutCartItem`, the equipment's
  current active `DeviceAssignment` (`returnedAt: null`) is looked up; if one
  exists, the function unconditionally throws
  `new AppError('Device is currently checked out', 409, 'DEVICE_CHECKED_OUT')`
  (line 411-415) — **regardless of whether that assignment came from a
  direct personal checkout or from another cart.** The frontend surfaces
  this as a plain, dead-end error `Alert` with no recourse; the user has to
  leave the dialog, find the other cart, and manually return the item first.
- **`DeviceAssignment.cartId`** (`backend/prisma/schema.prisma:1428-1430`,
  comment: "set when this assignment was created through a cart checkout;
  NULL for single-device checkouts") is exactly the signal needed to tell
  the two cases apart — confirmed set by `addAndCheckoutCartItem` itself
  when it creates a new assignment (line 445) and by `commitCart` (same
  pattern, checked separately, unaffected by this change).
- **The reverse operation already exists**: `returnCartItem`
  (`deviceCart.service.ts:721-788`) closes a cart item's assignment
  (`returnedAt`/`returnCondition`/`returnedBy`), frees the equipment
  (`status: 'active'`), and recalculates the owning cart's `status`
  (`returned` if no items remain unreturned, else `partially_returned`).
  This is the exact logic a "move" needs to run against the *source* cart
  before checking the device into the *destination* cart — reusing it
  (extracted into a `tx`-parameterized helper) keeps the two operations
  bit-for-bit consistent and avoids duplicating the cart-status
  recalculation logic.
- **Shared request types**: `AddCartItemRequest`/`ScanToCartRequest` live in
  `shared/src/types.ts:329-338`, consumed by both
  `backend/src/validators/deviceCart.validators.ts` (independently, via
  Zod — not derived from the shared interfaces) and
  `frontend/src/types/deviceCart.types.ts` (re-exported from
  `@mgspe/shared-types`). Both sides need the new field added separately,
  per this repo's existing pattern (confirmed: the backend's Zod-inferred
  DTOs are hand-written, not generated from the shared interfaces).
- **Error response shape**: confirmed via
  `backend/src/utils/errorHandler.ts` — a `ConflictError(message, meta)`
  produces `{ error: 'CONFLICT', code: 'CONFLICT', message, meta }`, with
  the meaningful sub-code living in `meta.code` (matching the existing
  `DEVICE_ALREADY_IN_CART` convention at `deviceCart.service.ts:499`, e.g.
  `throw new ConflictError('Device is already in this cart', { code:
  'DEVICE_ALREADY_IN_CART' })`). This spec's new conflict follows the same
  convention so the frontend can distinguish it from the generic
  `DEVICE_CHECKED_OUT` `AppError` (which has no `meta` at all today).
- **Aside, not in scope**: `frontend/src/components/DeviceManagement/
  DeviceSearchPanel.tsx` also calls `scanToCart`/`addItem`, but is not
  imported anywhere in the app (confirmed via repo-wide grep) — dead code,
  noted per CLAUDE.md but not touched.

## Problem definition

On the Checked-Out Carts page, adding a device to a cart that's already
checked out via a *different* cart is a dead end: a generic "Device is
currently checked out" error with no way to proceed short of leaving the
dialog, finding the other cart, and manually returning the item there first.

## Proposed solution

1. Backend: when `addAndCheckoutCartItem` finds an active assignment whose
   `cartId` is set and differs from the destination cart, throw a
   **distinguishable** conflict (`meta.code: 'DEVICE_IN_ANOTHER_CART'`,
   carrying the source cart's id and a display label) instead of the
   generic `DEVICE_CHECKED_OUT`. A direct personal checkout (`cartId ===
   null`) keeps today's behavior unchanged — moving a device away from a
   *person* is a different, larger workflow and out of scope for this
   request, which is specifically about cart-to-cart moves.
2. Add an opt-in `moveFromOtherCart` flag to the same request. When true and
   the device is confirmed to be active in a different cart, atomically
   close out the device's item in the *source* cart (same effect as
   `returnCartItem`, carrying over the device's existing checkout condition
   since there's no condition input in this quick flow) and then continue
   the normal check-into-*destination*-cart logic, all inside the existing
   transaction.
3. Frontend: `AddDeviceToCartDialog` catches the new conflict code and shows
   an inline "This device is already checked out in **&lt;Cart&gt;**. Move it
   to this cart?" prompt with a "Move Device" action, instead of a dead-end
   error. Confirming re-submits the same scan with the flag set.

## Implementation steps

### 1. Shared types

`shared/src/types.ts` — add to both request interfaces:

```ts
export interface AddCartItemRequest {
  equipmentId: string;
  condition?: CheckoutCondition;
  notes?: string;
  /** If the device is already checked out in a different cart, move it here instead of erroring. */
  moveFromOtherCart?: boolean;
}

export interface ScanToCartRequest {
  /** barcode, qrCode, assetTag, or UUID */
  identifier: string;
  /** If the device is already checked out in a different cart, move it here instead of erroring. */
  moveFromOtherCart?: boolean;
}
```

### 2. Backend validators

`backend/src/validators/deviceCart.validators.ts` — add
`moveFromOtherCart: z.boolean().optional().default(false)` to both
`AddCartItemSchema` and `ScanToCartSchema`.

### 3. Backend service

`backend/src/services/deviceCart.service.ts`:

- Extract a new `tx`-parameterized helper, `returnAssignmentAndUpdateCart`,
  from `returnCartItem`'s transaction body (mark the assignment returned,
  free the equipment, recalculate the cart's status) so it can be called
  both standalone (wrapped in its own transaction, as `returnCartItem` does
  today) and from within `addAndCheckoutCartItem`'s existing transaction.
- `addAndCheckoutCartItem` gains a `moveFromOtherCart: boolean` parameter
  (default `false`). Where it currently unconditionally throws on an active
  assignment:
  - if the assignment's `cartId` is null or equals the destination cart,
    behavior is **unchanged** (throws the existing generic
    `DEVICE_CHECKED_OUT`);
  - if it's set to a *different* cart and `moveFromOtherCart` is false,
    throw the new `ConflictError('Device is currently checked out in
    another cart', { code: 'DEVICE_IN_ANOTHER_CART', cartId, cartLabel })`
    (label = source cart's `tagNumber ?? name ?? id`, looked up in the same
    transaction);
  - if it's set to a different cart and `moveFromOtherCart` is true, call
    `returnAssignmentAndUpdateCart` against the *source* cart/assignment
    (carrying over `activeAssignment.checkoutCondition` as the return
    condition, since this flow has no condition input) before falling
    through to the existing "already in this cart" check and item-creation
    logic, unchanged.
- `addItem` and `scanToCart` (both non-draft branches) forward
  `data.moveFromOtherCart` into `addAndCheckoutCartItem`.

### 4. Frontend

`frontend/src/components/DeviceManagement/AddDeviceToCartDialog.tsx`:

- `scanMutation`'s `mutationFn` takes `{ value: string; force?: boolean }`
  and passes `moveFromOtherCart: true` only when `force` is set.
- A small `getConflictMeta(error)` helper (mirrors the existing
  `getApiErrorMessage` helper) reads `error.response.data.meta`.
- `onError`: if `meta.code === 'DEVICE_IN_ANOTHER_CART'` and this wasn't
  already a forced attempt, set local `conflict` state
  (`{ identifier, cartLabel }`); otherwise clear it, so the plain error
  Alert renders as it does today.
- When `conflict` is set, render a `severity="warning"` `Alert` (dismissible
  via `onClose`) instead of the generic error Alert: "This device is
  already checked out in **&lt;cartLabel&gt;**. Move it to this cart?" with an
  inline "Move Device" action button that re-`mutate()`s with `force: true`
  using the captured identifier.
- Editing the identifier field clears any stale `conflict`; closing the
  dialog resets it along with existing state.

## Dependencies

None new — pure Prisma transaction logic and existing MUI components
(`Alert`'s `action`/`onClose` props are already used elsewhere in this
codebase, e.g. `WorkOrderDetailPage.tsx`'s input-request alerts).

## Configuration changes

None. No schema change — `DeviceAssignment.cartId` already exists and is
already populated correctly; this only adds new *logic* around it. No
migration needed.

## Risks and mitigations

- **Risk:** moving a device drops or misrepresents its physical condition,
  since this flow has no condition-input step. **Mitigation:** the source
  assignment's own `checkoutCondition` is carried forward as its
  `returnCondition` (i.e., "returned in the condition it was checked out
  in" — the same assumption already implicit in every other automatic
  system-driven state change in this codebase, and it does not touch
  `equipment.condition` any more or less than a manual return would).
- **Risk:** a race between two concurrent moves of the same device.
  **Mitigation:** `addAndCheckoutCartItem` already runs inside a
  `Serializable`-isolation transaction (confirmed at the `addItem`/
  `scanToCart` call sites) — unchanged, and the new logic is entirely
  inside that same transaction boundary, so a concurrent conflicting move
  will fail the transaction rather than corrupt state.
- **Risk:** a device checked out directly to a *person* (not a cart) could
  be silently offered for "move" too, encouraging the wrong workflow.
  **Mitigation:** explicitly scoped out — `activeAssignment.cartId === null`
  keeps throwing the existing generic error with no move offered.
- **Risk:** the source cart's status recalculation (`returned` /
  `partially_returned`) silently diverges between the standalone return
  endpoint and the new move path if the shared helper isn't used
  faithfully. **Mitigation:** both call the identical extracted helper, not
  two independent reimplementations.
- **Risk:** `addItem`'s equipmentId-based path (not exercised by this
  dialog, but sharing the same underlying function) behaves inconsistently
  if only `scanToCart`'s schema gets the new field. **Mitigation:** both
  `AddCartItemSchema` and `ScanToCartSchema` get the field, and both
  controller call sites forward it — no asymmetric API surface.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build backend` (also runs
  `prisma generate`, exercising the shared-types change through the
  backend's own type-check even though no schema/migration is involved)
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate — also runs the backend test suite)

No FORBIDDEN COMMANDS needed — no schema change, no migration, no host npm,
nothing database-touching beyond what preflight's own disposable test DB
already exercises.

## Verification plan (Phase 3, in addition to build)

No automated tests exist for `deviceCart.service.ts` today and none are
proposed here unless requested, matching this session's existing pattern.
Manual verification:

1. Check a device out into Cart A (commit it). On Cart B (also checked out),
   use Add Device and scan that same device — expect the new "already
   checked out in Cart A — Move it to this cart?" prompt, not the old dead
   end.
2. Click Move Device — expect success, the device appears in Cart B's item
   list, and Cart A's item list shows it as returned (via its existing
   `assignment.returnedAt` display, unchanged UI logic).
3. Confirm a device checked out **directly to a person** (no cart) still
   shows the original plain "Device is currently checked out" error with no
   move option.
4. Confirm scanning a device already in *this* cart still shows the
   pre-existing "Device is already in this cart" message, unaffected by
   this change.

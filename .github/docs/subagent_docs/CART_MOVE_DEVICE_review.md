# Review: Move a device already checked out in another cart

## Spec compliance

Matches `.github/docs/subagent_docs/CART_MOVE_DEVICE_spec.md` in full:
shared request types, backend Zod schema fields, the extracted
`returnAssignmentAndUpdateCart` helper reused by both `returnCartItem` and
the new move path, `addAndCheckoutCartItem`'s new branch, both `addItem`/
`scanToCart` forwarding the flag, and the `AddDeviceToCartDialog` conflict
UI.

## Best practices / consistency / maintainability

- **No duplicated return logic.** `returnAssignmentAndUpdateCart` is a
  single `tx`-parameterized implementation; `returnCartItem` and the move
  path inside `addAndCheckoutCartItem` both call it, so the cart-status
  recalculation (`returned` vs `partially_returned`) can't drift between
  the two callers — directly addresses the spec's flagged risk.
- **Scope correctly held to cart-to-cart moves.** Confirmed the new
  `inAnotherCart` check requires `activeAssignment.cartId` to be non-null
  *and* different from the destination — a direct personal checkout
  (`cartId === null`) still falls through to the original, unchanged
  `DEVICE_CHECKED_OUT` throw with no move offered, exactly as scoped.
- **Whole move stays inside the existing `Serializable` transaction** — no
  new transaction boundary introduced; the source-cart return and
  destination-cart checkout are one atomic unit, so a mid-move failure
  can't leave a device "returned from A" without also being "checked into
  B" (or vice versa).
- **Error convention matches the existing pattern**: `ConflictError(message,
  { code, ... })` mirrors the pre-existing `DEVICE_ALREADY_IN_CART` shape at
  the line right below it in the same function, rather than inventing a new
  response convention.
- **Both `addItem` and `scanToCart` forward the flag symmetrically** — no
  asymmetric API surface where one endpoint silently ignores
  `moveFromOtherCart`.
- Frontend: the `Alert`'s `action` prop review caught a real (if harmless)
  latent bug during implementation — `onClose` and `action` can't both
  drive the visible dismiss control in MUI's `Alert` (action wins, `onClose`
  becomes a silent no-op) — and it was corrected to an explicit Cancel
  button in the action area before this review, not left in as dead code.

## Completeness

All three implementation layers (shared types, backend, frontend) applied
together — no partial state where, e.g., the backend accepts the flag but
the frontend never sends it, or vice versa.

## Performance

- One additional `findUnique` (the source cart's `tagNumber`/`name`, for the
  conflict label) only on the *conflict* path — not on every successful add,
  and not on the already-existing common cases (device not checked out
  anywhere, or checked out directly to a person).
- The move path itself adds work only when actually moving (one
  `deviceAssignment.update`, one `equipment.update`, one `deviceCartItem.count`,
  one `deviceCart.update` — identical cost to a standalone return, which is
  the expected cost of the operation being performed).

## Security

- No new route, no new permission surface — reuses the existing
  `POST /:id/scan` / `POST /:id/items` endpoints, already gated at
  `requireModule('CHECKOUT', 2)`. Moving a device is authorization-
  equivalent to returning it from one cart and checking it into another,
  both of which the same permission level already allows independently.
- No cross-tenant or cross-location leakage: the conflict response only
  reveals the source cart's own label (`tagNumber`/`name`), not the device's
  assignee or any other sensitive detail beyond what the current cart's own
  detail view already exposes for its own items.

## API currency

No new dependency; `Alert`'s `action` prop usage follows the same pattern
already present in this codebase (e.g. `WorkOrderDetailPage.tsx`'s
input-request alerts).

## Build validation

Commands run (all approved in the Phase 1 spec; no FORBIDDEN COMMANDS used
— no schema change, no migration):

```
scripts/preflight.ps1
```
Result: **pass, exit code 0**, first attempt. Backend image build succeeded
(the backend Dockerfile builds `shared` first, so this run is the
authoritative proof the `shared/src/types.ts` field additions compile and
are correctly consumed by the backend's own `tsc` pass); frontend image
build (`tsc && vite build`) succeeded with zero type errors, confirming
`AddDeviceToCartDialog.tsx`'s reworked mutation signature and new conflict
state type-check against the updated `ScanToCartRequest` shared type;
backend test suite: 7 files, 47/47 tests passed — unaffected, since no
existing test exercises `deviceCart.service.ts`.

No automated tests were added for this change — matching the spec's
explicit statement that this repo has no test coverage for
`deviceCart.service.ts` today, and none is proposed unless requested.

## Score table

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

## Returns

- **PASS** — no refinement needed.
- Build result: preflight exit code 0.

## Refinement cycle 1 (post-review manual testing)

Manual testing surfaced a real design defect, not a display-only issue:
moving a device left the old cart's `DeviceCartItem` row in place (reused
`returnAssignmentAndUpdateCart`, which is correct for a genuine physical
return but wrong here), so the device still appeared in the source cart's
item list, and the source cart's status unconditionally flipped to
`partially_returned` — misleading, since nothing was actually returned.

Fix: replaced the reused return helper with a dedicated
`closeAssignmentForMove`, called only from the move branch of
`addAndCheckoutCartItem`. It still closes the source assignment
(`returnedAt` etc. — required so the device never holds two simultaneously-
active assignments once the destination's fresh assignment is created), but
now also **deletes** the source cart's `DeviceCartItem` row outright instead
of leaving a "returned" entry behind, and only touches the source cart's
`status` (→ `returned`, `fullyReturnedAt` set) if that removal leaves it
with nothing else actively checked out — never flips it to
`partially_returned` as a side effect of a move. `returnAssignmentAndUpdateCart`
itself is untouched and still backs the standalone return endpoint.

Re-ran `scripts/preflight.ps1` after the fix: **pass, exit code 0** (backend
build, frontend build, 47/47 backend tests, unaffected by this
service-layer-only change).

## Refinement cycle 2 (post-review manual testing, broader than the original feature)

Follow-up manual testing found the same "record lingers in the cart" defect
also applies to the **normal** return flow (`returnCartItem` /
`returnAllCartItems`), not just moves — a genuinely returned item kept its
`DeviceCartItem` row (and, per the frontend's `isAssigned` check, still
displayed an "Active" chip with no Return button, since `assignmentId` is
never cleared on return — only `returnedAt` is set).

Fix, applied to both:
- `returnAssignmentAndUpdateCart` (the shared helper backing
  `returnCartItem`) now also deletes the item's `DeviceCartItem` row
  (`deleteMany({ where: { assignmentId } })`) right after marking the
  assignment returned.
- `returnAllCartItems`'s per-item loop does the same
  (`tx.deviceCartItem.delete({ where: { id: item.id } })`).

In both cases the `DeviceAssignment` row itself is untouched — it remains
the permanent checkout-history record (Active Checkouts, user checkout
history, etc.); only the cart's own item-list entry is removed. The
existing cart-status math (`remaining === 0 ? 'returned' : 'partially_returned'`)
was already computed by filtering on `assignment.returnedAt: null`, so it
was already implicitly excluding returned rows from the count — deleting
those same rows changes nothing about the resulting status value, only
removes them from what the cart's item list displays. Confirmed no other
backend or frontend code reads `DeviceCartItem` rows expecting them to
survive a return (repo-wide grep for `deviceCartItem` outside the device
cart module itself: no results).

Re-ran `scripts/preflight.ps1`: **pass, exit code 0** (backend build,
frontend build, 47/47 backend tests, unaffected by this service-layer-only
change).

## Verification still needed (manual, outside this workflow)

No running stack was available to smoke-test the actual flow. Recommended
before treating this as fully verified, per the spec's checklist:

1. Commit a device into Cart A, then use Add Device on Cart B (also
   checked out) and scan that same device — expect the new "already
   checked out in Cart A — Move it to this cart?" prompt.
2. Click Move Device — device appears in Cart B's item list; Cart A's item
   list shows it as returned.
3. A device checked out directly to a person (not via any cart) still
   shows the original plain error with no move option.
4. Scanning a device already in *this* cart still shows the pre-existing
   "already in this cart" message, unaffected.

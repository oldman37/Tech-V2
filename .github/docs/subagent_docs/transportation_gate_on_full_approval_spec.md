# Gate Transportation Review on Full Field Trip Approval — Spec

## 1. Current State Analysis

Two independent, uncoordinated paths currently let a transportation request become visible/actionable to the Transportation Secretary/Director:

**Path A — automatic, correctly timed (keep as-is):**
`fieldTrip.service.ts` `approve()` (`backend/src/services/fieldTrip.service.ts:384-395`) — when a field trip's *own* approval chain reaches `nextStatus === 'APPROVED'` (i.e. Finance Director stage clears), any transportation request still in `DRAFT` for that trip is bulk-flipped to `PENDING_TRANSPORTATION` inside the same transaction. Separately, `fieldTrip.controller.ts` `approve()` (`backend/src/controllers/fieldTrip.controller.ts:239-253`) — also gated on `result.status === 'APPROVED'` — emails the `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` group via `sendFieldTripTransportationNotice`. This path is already correctly gated on full approval. No change needed here.

**Path B — manual, NOT gated on full approval (the bug):**
The teacher can independently open `/field-trips/:id/transportation` (Step 2) at any point after the *initial* trip submission and click Submit there (`TransportationRequestForm`, calling `fieldTripTransportationService.submit()`). `FieldTripTransportationService.submit()` (`backend/src/services/fieldTripTransportation.service.ts:231-270`) has **no check on the parent trip's status at all** — only that the transport record itself is `DRAFT`. This immediately flips it to `PENDING_TRANSPORTATION` and the controller (`fieldTripTransportation.controller.ts:92-144`) immediately emails the `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` group via `sendTransportationStep2SubmittedNotice` — regardless of how far along the trip's own approval chain is. A trip could still be sitting at `PENDING_SUPERVISOR` (stage 1 of 4) when this fires.

Once a record is `PENDING_TRANSPORTATION` via either path, `listPending()` (`fieldTripTransportation.service.ts:617-627`) returns it to any Transportation Secretary/Director unconditionally, and `approve()`/`deny()` (`fieldTripTransportation.service.ts:276-433`) allow action on it as long as `hasPrincipalApproval` (the Supervisor/principal stage only — stage 1 of 4) **or** `tripIsFullyApproved` — so Path B lets the secretary act after just the *first* of four approval stages.

**User-confirmed requirement:** the teacher-facing form and submit action must not change at all — same button, same immediate "submitted" confirmation. Only the transportation office's side (queue visibility, ability to act, notification) should be deferred until the trip has cleared **all** stages (Supervisor → Asst. Director of Schools → Director of Schools → Finance Director → `APPROVED`).

## 2. Problem Definition

Path B lets a transportation request reach the Transportation Secretary/Director's queue — and become approvable/deniable — before the field trip itself has finished its own approval chain. This is the literal cause of both gaps discussed this session:
- Secretary/Director acting on (or simply seeing) a request for a trip that might still be denied by a later stage.
- A transportation approval becoming orphaned if the trip is later denied — structurally prevented once transportation can never become actionable until the trip is already in its terminal `APPROVED` state (a trip cannot move from `APPROVED` back to `DENIED`).

## 3. Proposed Solution

No change to the trip-status auto-flip (Path A) or to the teacher-facing submit action/UI. All changes are on the read/gate side, scoped to `fieldTripTransportation.service.ts` and the one related notification:

1. **`listPending()`** — add `fieldTripRequest: { status: 'APPROVED' }` to the `where` clause, so a `PENDING_TRANSPORTATION` record submitted early via Path B simply doesn't appear in the queue until the trip itself is `APPROVED`. (Once the trip does reach `APPROVED`, Path A's own bulk-flip is a no-op for this record since it's already past `DRAFT` — the record just starts showing up, no double-transition.)

2. **`approve()` / `deny()`** — tighten the eligibility gate from `hasPrincipalApproval || tripIsFullyApproved` to `tripIsFullyApproved` only. Removes the stage-1-only bypass; closes the direct-URL/API loophole even if someone bypasses the queue UI. Update the error message from "...approved by the Building Principal" to "...received final approval" to match.

3. **Email timing** — `fieldTripTransportationController.submit()` currently always emails the Director group immediately. Change it to only send that email when `trip.status === 'APPROVED'` at the moment of submit (covers the legitimate case: teacher completes Part A *after* the trip was already approved — the existing "Complete Transportation Form" prompt on the trip detail page). When the trip is not yet fully approved, no email fires at submit time — the transportation office is instead notified later, at the correct moment, by the **existing** unmodified Secretary-group notice in `fieldTrip.controller.ts:239-253` (Path A), which already fires unconditionally whenever `transportationNeeded` is true and the trip reaches `APPROVED`. No new email code needed for the common case — it already exists and already fires at the right time.

4. **Teacher-facing behavior — explicitly unchanged.** `submit()` itself keeps transitioning `DRAFT → PENDING_TRANSPORTATION` immediately, no new validation added to it. The existing confirmation message on `FieldTripTransportationPage.tsx` ("Your transportation request has been submitted and is awaiting Transportation Director review.") stays accurate — it *is* submitted and *is* awaiting review, it just won't be actionable by anyone until the trip clears every stage. No frontend change required for the submitter-facing views.

## 4. Implementation Steps

1. `fieldTripTransportation.service.ts`: add the `fieldTripRequest.status: 'APPROVED'` filter to `listHistory()`'s counterpart query, `listPending()`'s `where` clause.
2. `fieldTripTransportation.service.ts`: `approve()` and `deny()` — drop `hasPrincipalApproval` from the eligibility check, keep `tripIsFullyApproved` only; update both error messages.
3. `fieldTripTransportation.controller.ts`: `submit()` handler — wrap the existing `sendTransportationStep2SubmittedNotice` call in `if (trip.status === 'APPROVED') { ... }`.
4. No schema change, no migration, no frontend change.
5. Build validation via `scripts/preflight.ps1` (Docker builds + existing test suite — the existing field-trip/transportation tests should still pass since this only narrows an already-loose gate; will fail loudly if any existing test relied on the stage-1 bypass).

## 5. Dependencies

None — no new packages, reuses existing Prisma query patterns and the existing email function.

## 6. Configuration Changes

None.

## 7. Risks & Mitigations

- **Risk:** An existing backend test may assert the old stage-1-bypass behavior (approving/denying transportation right after Supervisor approval, before full trip approval). **Mitigation:** `scripts/preflight.ps1` runs the full vitest suite — any such test will fail loudly and be visible in Phase 3 review; will be reconciled with the user if found (test likely needs updating to match the new intended behavior, not reverting the fix).
- **Risk:** A trip that bypasses the Supervisor stage entirely (submitter has no supervisor — `trip.status` can reach `APPROVED` without ever exercising `hasPrincipalApproval`) still needs to work. **Mitigation:** unaffected — `tripIsFullyApproved` (`trip.status === 'APPROVED'`) is the same check already used for that exact bypass case elsewhere in this file; nothing about that scenario changes.
- **Risk:** Transportation requests already sitting in `PENDING_TRANSPORTATION` today (submitted via Path B before the trip finished approving) will silently disappear from the queue after this ships, until their trip finishes approving. **Mitigation:** this is the intended behavior change — surfaced explicitly to the user as an expected, correct side effect, not a bug to fix.

## 8. Explicitly Out of Scope

- Any change to the teacher-facing Step 2 form, Submit button, or confirmation messaging.
- The Path A auto-flip / Secretary notice logic (already correct).
- Cancelling/reversing an already-`TRANSPORTATION_APPROVED` record if a trip is somehow later denied (structurally prevented by this fix — a trip cannot go from `APPROVED` back to `DENIED` in the current state model, so this scenario cannot occur once this ships).

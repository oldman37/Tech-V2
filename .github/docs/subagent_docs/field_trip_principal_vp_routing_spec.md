# Field Trip Approval Routing — Principal/Vice Principal Bug Fix

## Current State Analysis

The field trip approval workflow (`backend/src/services/fieldTrip.service.ts`) is a
linear chain:

```
DRAFT → PENDING_SUPERVISOR (skipped if no supervisor) → PENDING_ASST_DIRECTOR
      → PENDING_DIRECTOR → PENDING_FINANCE_DIRECTOR → APPROVED
```

`submit()` and `resubmit()` (`backend/src/services/fieldTrip.service.ts:260`,
`:594`) both decide the first pending status with:

```ts
const firstStatus =
  snapshot.supervisorEmails.length > 0 ? 'PENDING_SUPERVISOR' : 'PENDING_ASST_DIRECTOR';
```

`snapshot.supervisorEmails` comes from `buildFieldTripApproverSnapshot()`
(`backend/src/services/email.service.ts:574`), which reads the submitter's
`UserSupervisor` rows (`user_supervisors_user_supervisors_userIdTousers`) and maps
them to supervisor email addresses. If any exist, the request routes to
`PENDING_SUPERVISOR` and is emailed to those supervisor(s) — bypassing the
Assistant Director of Schools ("Assistant DOS") stage entirely.

`UserSupervisor` rows are populated by `backend/scripts/assign-user-supervisors.ts`.
For every active `@ocboe.com` user, it looks up the `LocationSupervisor` rows
(PRINCIPAL/VICE_PRINCIPAL type only) for that user's own `officeLocation` and creates
a `UserSupervisor` record pointing the user at those location supervisors. The only
exclusion is `locationSupervisor.userId === user.id` (skip self-supervision) — there
is **no exclusion for the target user themselves already being a Principal or Vice
Principal** (of the same building or elsewhere; a bad/legacy `officeLocation` value
on a Principal/VP account, or a data-entry mismatch, produces `UserSupervisor` rows
whose `supervisor` is a Vice Principal, potentially at a different building).

## Problem Definition

Principals and Vice Principals must **always** submit field trip requests directly
to the Assistant DOS (`PENDING_ASST_DIRECTOR`) — they must never be routed through
the `PENDING_SUPERVISOR` stage, regardless of what `UserSupervisor` rows exist for
their account.

Reported symptom: a Principal submitted a field trip request and it was routed to
a Vice Principal at a **different** school instead of the Assistant DOS, because a
stray/incorrect `UserSupervisor` row existed for that Principal's account.

Fixing only the data (re-running `assign-user-supervisors.ts` with a role
exclusion) would address future syncs but:
- `sync:supervisors:*` scripts are FORBIDDEN COMMANDS — the user must run them,
  not this workflow.
- It would not defend against any other stray/manually-created `UserSupervisor`
  row for a Principal/VP account (e.g. `assignedBy: 'MANUAL'` entries, which the
  sync script never touches, per its own docstring).

The fix must therefore be enforced at the routing decision itself, not rely solely
on `UserSupervisor` data hygiene.

## Proposed Solution

In `buildFieldTripApproverSnapshot()` (`backend/src/services/email.service.ts`),
before computing `supervisorEmails`, check whether the submitter is themselves a
Principal or Vice Principal via the authoritative `LocationSupervisor` table (the
same table `sync-supervisors.ts` populates from the Entra `Principals`/
`Vice Principals` groups, matched to the user's own building). If so, force
`supervisorEmails` to `[]`.

Because `submit()`/`resubmit()` already key off
`snapshot.supervisorEmails.length > 0`, this single change makes both paths route
Principals/VPs straight to `PENDING_ASST_DIRECTOR` with zero changes needed in
`fieldTrip.service.ts`.

```ts
const isPrincipalOrVicePrincipal = await prisma.locationSupervisor.findFirst({
  where: {
    userId: submitterId,
    supervisorType: { in: ['PRINCIPAL', 'VICE_PRINCIPAL'] },
  },
  select: { id: true },
});

const supervisorEmails: string[] = (user && !isPrincipalOrVicePrincipal)
  ? user.user_supervisors_user_supervisors_userIdTousers
      .map((us) => us.supervisor.email)
      .filter(Boolean)
  : [];
```

This matches the existing style used elsewhere in the codebase for the same
"is this user a location supervisor" check (e.g.
`transportationRequest.service.ts:354`, `purchaseOrder.service.ts:585`).

No schema change, no new dependency, no new environment variable — this is an
internal code change using an existing table already queried by other services.

## Implementation Steps

1. Edit `backend/src/services/email.service.ts` → `buildFieldTripApproverSnapshot()`:
   add the `LocationSupervisor` lookup and gate `supervisorEmails` on it.
2. No other files require changes — `fieldTrip.service.ts` submit/resubmit already
   branch correctly off an empty `supervisorEmails` array.

## Dependencies

None — uses existing Prisma client and existing `LocationSupervisor` model already
in `backend/prisma/schema.prisma`.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** A user who is a Principal/VP at one building but also legitimately
  needs supervisor-stage approval for a different reason.
  **Mitigation:** None known in this codebase — the user's stated requirement is
  that Principals/VPs *always* go straight to the Assistant DOS; this matches the
  existing `assign-user-supervisors.ts` design intent (which already tries, but
  fails, to exclude self-supervision for this exact reason).
- **Risk:** `LocationSupervisor` query adds one extra DB round-trip to
  `buildFieldTripApproverSnapshot()`.
  **Mitigation:** Negligible — indexed on `userId`/`supervisorType`
  implicitly via existing `@@index([supervisorType])`; called once per
  submit/resubmit, not in a loop.
- **Risk:** Existing bad `UserSupervisor` rows for Principals/VPs remain in the
  database (unused after this fix, but not cleaned up).
  **Mitigation:** Out of scope — no data deletion without explicit user approval;
  worth flagging to the user as a follow-up (they may want to run
  `sync:supervisors:all` themselves, which is a forbidden command for this
  workflow to execute).

## Build/Test Commands Approved for Phase 3

- `docker compose -f docker-compose.dev.yml build backend` (per project preflight)

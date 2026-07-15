# Field Trip Bus/Driver Daily Quota — Spec

## Current State Analysis

- `FieldTripRequest.transportationNeeded: Boolean` (`schema.prisma:675`) is answered on the base request form
  itself — `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx:860-882`, "Are buses needed for this trip?"
  Yes/No radio. When "No", the form requires a free-text `alternateTransportation` field (lines 884-898,
  "e.g., Parent drivers, walking, school van"). **This already is the car/alternate-transportation path** —
  it just isn't wired to any capacity logic today.
- The trip date is picked earlier in the same form, via `FieldTripDatePicker` (line 736), **before** the
  transportation question is answered. So at the moment a date is picked, the requester's bus/no-bus choice
  isn't known yet — the cap logic has to live at the "buses needed?" question, not at date-selection time.
- An "8 per day" cap **already exists**, but only as an advisory, client-side, count-everything mechanism:
  - `frontend/src/components/FieldTripDatePicker.tsx:34` and
    `frontend/src/components/DashboardFieldTripCalendar.tsx:46`: `const MAX_TRIPS_PER_DAY = 8;`
  - Backed by `backend/src/services/fieldTrip.service.ts:710` `getDateCounts(from, to)`, which counts **every**
    `FieldTripRequest` with `status: { notIn: ['DRAFT', 'DENIED'] }` — including `NEEDS_REVISION` — across
    each day in `[tripDate, returnDate ?? tripDate]`. It does not filter by `transportationNeeded`.
  - `FieldTripDatePicker.tsx:130-136` (`handleSelectDate`) and `:216/219` (`isFull`/`isUnavailable`)
    **fully block clicking** a date once `count >= 8`, with no server-side check anywhere backing this up —
    `createDraft`/`updateDraft`/`submit` in `fieldTrip.service.ts` never re-validate it.
- Per user decisions (confirmed): (1) the cap counts **1 slot per trip that needs a bus** (`transportationNeeded
  === true`), not per physical bus (`FieldTripTransportationRequest.busCount`, which isn't known until a
  separate later "Part A" step — see below); (2) the existing all-trips cap is **replaced** by this
  bus-specific one — non-bus trips no longer count against the 8 and are unlimited; (3) this becomes a
  **hard, backend-enforced** limit, not just advisory UI.
- `FieldTripTransportationRequest` (`schema.prisma:772+`) is a separate 1:1 sub-workflow (Part A/C) that only
  exists once the base trip is submitted (`transportationNeeded=true` required) and captures `busCount`,
  `needsDriver`, etc. — this is irrelevant to the new cap per the confirmed design (cap = 1 slot per trip,
  known at submission time from `transportationNeeded` alone), so **no changes needed there**.
- `submit()` (`fieldTrip.service.ts:211`) is the transition point `DRAFT → PENDING_SUPERVISOR` (or
  `PENDING_ASST_DIRECTOR`) — this is also the exact point a trip starts counting in `getDateCounts` (which
  excludes `DRAFT`). This is the correct enforcement point for the hard block, matching how the cap is
  already scoped.
- **Important wrinkle:** `resubmit()` (`fieldTrip.service.ts:539+`) transitions `NEEDS_REVISION → PENDING_*`.
  `NEEDS_REVISION` is **not** in `getDateCounts`'s exclusion list — a trip sent back for revision is already
  being counted against its date's cap while sitting in `NEEDS_REVISION`. So the capacity check on resubmit
  must **exclude the trip's own id**, otherwise it would count itself as one of the 8 competitors instead of
  recognizing it already holds a slot.
- Established checkbox-acknowledgment pattern already used twice in this codebase now (`DeviceActionConfirmDialog.tsx`
  lines 152-170; `FieldTripApproval.boardApprovalAcknowledged` added in the prior change to this file) — this
  spec follows the same shape: a persisted boolean acknowledgment flag + a required MUI `Checkbox`/
  `FormControlLabel` gating the primary action.

## Problem Definition

The bus/driver shortage means only 8 district-bus trips can run per calendar day. Today's "8 per day" cap
counts *all* trips (bus or not) and is purely a client-side visual block with no backend enforcement — a car
trip and a bus trip are treated identically, and nothing stops a user (or a bug) from submitting a 9th bus
trip on a full day. We need:

1. The cap to count only trips that need a district bus (`transportationNeeded === true`).
2. Once a date's bus quota is full, the requester must be prevented from choosing "buses needed" for that
   date, and instead must explicitly acknowledge they're arranging their own transportation.
3. Real (backend) enforcement, not just a UI suggestion.

## Proposed Solution Architecture

### 1. Schema change (Prisma)

Add one acknowledgment column to `FieldTripRequest` (mirrors `FieldTripApproval.boardApprovalAcknowledged`
added previously):

```prisma
model FieldTripRequest {
  ...
  busQuotaAcknowledged Boolean @default(false)
  ...
}
```

Migration: `backend/prisma/migrations/20260715130000_add_bus_quota_acknowledged/migration.sql`
```sql
ALTER TABLE "field_trip_requests" ADD COLUMN "busQuotaAcknowledged" BOOLEAN NOT NULL DEFAULT false;
```

### 2. Backend — capacity counting (`backend/src/services/fieldTrip.service.ts`)

- `getDateCounts()` (line 710): add `transportationNeeded: true` to the Prisma `where` clause so the
  calendar's per-day counts reflect bus-needing trips only. Everything else about the function (day-span
  iteration, exclusion of `DRAFT`/`DENIED`) stays the same.
- New private helper, colocated with `getDateCounts`:

  ```ts
  private async isBusQuotaFull(tripDate: Date, returnDate: Date | null, excludeId?: string): Promise<boolean> {
    const trips = await prisma.fieldTripRequest.findMany({
      where: {
        status: { notIn: ['DRAFT', 'DENIED'] },
        transportationNeeded: true,
        id: excludeId ? { not: excludeId } : undefined,
        tripDate: { lte: returnDate ?? tripDate },
        OR: [
          { returnDate: null, tripDate: { gte: tripDate } },
          { returnDate: { gte: tripDate } },
        ],
      },
      select: { tripDate: true, returnDate: true },
    });
    // Reuse the same per-day counting loop as getDateCounts, then check
    // whether any day in [tripDate, returnDate ?? tripDate] has count >= 8.
  }
  ```

  (Exact implementation should factor the shared day-counting loop out of `getDateCounts` into a private
  helper used by both, to avoid duplicating the date-iteration logic — see Implementation Steps.)

### 3. Backend — hard enforcement (`submit()` and `resubmit()`)

In `submit()` (line 211), after the existing `DRAFT` status check and before the `$transaction`:

```ts
if (trip.transportationNeeded) {
  if (await this.isBusQuotaFull(trip.tripDate, trip.returnDate)) {
    throw new ValidationError(
      'The district bus quota (8 per day) is full for the selected date(s). ' +
      'Please arrange alternate transportation to submit this request.',
    );
  }
} else if (await this.isBusQuotaFull(trip.tripDate, trip.returnDate) && !trip.busQuotaAcknowledged) {
  throw new ValidationError(
    'The bus quota is full for this date. You must acknowledge that you are arranging your own ' +
    'transportation before submitting.',
  );
}
```

In `resubmit()` (line 539), the same two branches, but **pass `trip.id` as `excludeId`** to `isBusQuotaFull`
since the trip's own `NEEDS_REVISION` row is already included in the day's count.

This means `busQuotaAcknowledged` only needs to be `true` when it actually matters (transportationNeeded is
false AND the date is at cap) — a trip on a non-full date with `transportationNeeded=false` is never blocked,
consistent with today's behavior for non-bus trips.

### 4. Backend — validators (`backend/src/validators/fieldTrip.validators.ts`)

Add to both `CreateFieldTripSchema` and `UpdateFieldTripSchema` (same optional/nullable shape as other
Step-3-style fields already in this file):

```ts
busQuotaAcknowledged: z.boolean().optional(),
```

`createDraft`/`updateDraft` in `fieldTrip.service.ts` get one new line each persisting
`data.busQuotaAcknowledged ?? false`, following the exact pattern already used for
`parentalPermissionReceived`.

### 5. Frontend — types (`frontend/src/types/fieldTrip.types.ts`)

Add `busQuotaAcknowledged?: boolean;` to `CreateFieldTripDto`/`UpdateFieldTripDto` (wherever those are
defined — mirrors `CreateFieldTripDto` in the backend validator).

### 6. Frontend — calendar components

- `frontend/src/components/FieldTripDatePicker.tsx`: `getDateCounts` now returns bus-only counts (per backend
  change). Remove `isFull` from the `isUnavailable` calculation (line 219) — **a date at 8/8 buses stays
  clickable**; only `isPast` blocks selection now. Change styling so a full date keeps a distinct badge (e.g.
  the existing amber/error color scheme) with updated tooltip wording:
  `"${count}/${MAX_TRIPS_PER_DAY} buses booked — full, but you can still book with your own transportation"`.
  Update the legend text (line ~312) from "Fully booked (8/8)" to "Bus quota full (8/8) — car/alternate
  transportation only".
- `frontend/src/components/DashboardFieldTripCalendar.tsx`: same tooltip/legend wording update (it never
  blocked clicks on full dates to begin with — it only blocks past dates — so no behavior change needed
  there beyond wording).

### 7. Frontend — request form (`frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`)

- Add a `useQuery` (reusing `fieldTripService.getDateCounts`, same as `FieldTripDatePicker` already does)
  scoped to `[form.tripDate, form.returnDate || form.tripDate]`, to determine
  `isBusQuotaFull = someday-in-range count >= 8`, recomputed whenever `form.tripDate`/`form.returnDate`
  change.
- In the "Are buses needed for this trip?" block (lines 860-882):
  - Disable the "Yes" `Radio` when `isBusQuotaFull`, with helper/caption text: `"Bus quota full for this
    date (8/8) — buses are not available. You must arrange your own transportation."`
  - If `form.transportationNeeded` was already `true` and the user changes the date to a full one, auto-flip
    it to `false` (mirrors the existing auto-clear of `alternateTransportation` at line 875 when switching
    the other direction).
- When `!form.transportationNeeded && isBusQuotaFull`: render a required checkbox (new local state
  `busQuotaAck`, reusing the `FormControlLabel`+`Checkbox` pattern from `DeviceActionConfirmDialog.tsx` /
  the board-approval checkbox added previously), label: *"I acknowledge the district bus quota for this date
  is full and I am arranging my own transportation."* This checkbox's value feeds `form.busQuotaAcknowledged`
  in the payload sent to `createDraft`/`updateDraft`/`submit`.
  - Gate the page's "Next"/"Submit" action: `disabled={... || (isBusQuotaFull && !form.transportationNeeded && !form.busQuotaAcknowledged)}`.
  - When `isBusQuotaFull` is false, reset `busQuotaAcknowledged` to `false` (no acknowledgment needed/shown).

## Dependencies

No new external dependencies — same Zod/Prisma/MUI/TanStack Query stack already exercised in this exact
workflow.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Race condition — two submissions near the boundary could both pass the check and jointly exceed
  8. *Mitigation:* accepted as-is; this is the same class of risk the existing (informal) cap already has,
  and a `SELECT ... FOR UPDATE`-style lock is disproportionate for a soft daily quota with human review
  downstream (Assistant Director/Director still see and can act on the trip).
- **Risk:** Self-counting on resubmit. *Mitigation:* `excludeId` param on `isBusQuotaFull`, documented above.
- **Risk:** Changing `FieldTripDatePicker`'s full-date behavior (no longer blocking clicks) is a visible UX
  change from today. *Mitigation:* this is the explicit, confirmed intent of the feature — a full date must
  remain selectable so the car/alternate-transportation path stays reachable.
- **Risk:** Existing in-flight trips (already `PENDING_*`/`NEEDS_REVISION` with `transportationNeeded=true`)
  on days that will retroactively become "full" once this ships. *Mitigation:* none needed — enforcement only
  runs at `submit()`/`resubmit()` time going forward; already-submitted trips are unaffected.
- **Risk:** Migration omitted breaks deploy. *Mitigation:* migration SQL file included in the same commit.

## Implementation Steps (ordered)

1. Edit `schema.prisma` — add `busQuotaAcknowledged` to `FieldTripRequest`.
2. Create migration SQL file.
3. Edit `fieldTrip.validators.ts` — add `busQuotaAcknowledged` to `CreateFieldTripSchema`/`UpdateFieldTripSchema`.
4. Edit `fieldTrip.service.ts`:
   a. Factor the day-span counting loop out of `getDateCounts` into a shared private helper.
   b. Scope `getDateCounts` to `transportationNeeded: true`.
   c. Add `isBusQuotaFull(tripDate, returnDate, excludeId?)` using the shared helper.
   d. Persist `busQuotaAcknowledged` in `createDraft`/`updateDraft`.
   e. Add the hard-block guard to `submit()` and `resubmit()`.
5. Edit frontend `types/fieldTrip.types.ts` — extend `CreateFieldTripDto`/`UpdateFieldTripDto`.
6. Edit `FieldTripDatePicker.tsx` — stop blocking full dates; update wording.
7. Edit `DashboardFieldTripCalendar.tsx` — update wording only.
8. Edit `FieldTripRequestPage.tsx` — bus-cap query, disable "Yes" when full, acknowledgment checkbox, gate
   Next/Submit.
9. Build backend Docker image → build frontend Docker image (Phase 3/6).

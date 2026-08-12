# Transportation Approval History, Post-Approval Edit & Resend Email — Spec

## 1. Current State Analysis

The Part C transportation approval workflow lives in:
- Schema: `FieldTripTransportationRequest` (`backend/prisma/schema.prisma:802`)
- Service: `backend/src/services/fieldTripTransportation.service.ts`
- Controller: `backend/src/controllers/fieldTripTransportation.controller.ts`
- Routes: `backend/src/routes/fieldTrip.routes.ts:219-303` (mounted under `/api/field-trips/:id/transportation/*`)
- Frontend page: `frontend/src/pages/FieldTrip/FieldTripTransportationPage.tsx`
- Frontend form (Part C, director/secretary side): `frontend/src/components/fieldtrip/TransportationPartCForm.tsx`

Confirmed in production (via read-only investigation this session):
- `approve()`/`deny()` are gated at `permLevel >= 3` in the `FIELD_TRIPS` module (`groupAuth.ts:88-103`), which includes `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` and `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` at level 3, plus several unrelated director roles and Admin at higher levels (existing behavior, out of scope to change here).
- Once approved/denied, `transportRequest.status` becomes terminal (`TRANSPORTATION_APPROVED` / `TRANSPORTATION_DENIED`) — there is currently **no way to edit Part C fields afterward**, and **no persistent record of who approved/denied what** beyond the single `approvedById`/`deniedById` + timestamp columns on the row itself (no audit trail, so any future edit would silently overwrite those columns with no history).
- `sendTransportationApproved()` / `sendTransportationDenied()` (`backend/src/services/email.service.ts:970-1060`) are fired once, non-blocking, at approve/deny time. There is no resend mechanism. A working precedent for a "resend" endpoint exists at `backend/src/controllers/invoice.controller.ts:105-113` (`POST /invoices/:id/resend`).
- The submitter-facing view (`FieldTripTransportationPage.tsx`, `isOwner` branch, lines 157-193) never renders `approvedBy`/`deniedBy` — out of scope for this spec (not requested), noted for awareness only.

List-page precedent to follow for the new history view: `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` (filterable, paginated, `ResponsiveTable` + `MobileFilterBar` + `useFilterParams`, row click → detail).

Audit-trail precedent to follow for the new history table: `FieldTripStatusHistory` (`schema.prisma:783-800`), populated inside the same Prisma transaction as each status change in `fieldTrip.service.ts` (e.g. lines 279-287, 397-406).

## 2. Problem Definition

The Transportation Secretary/Director has no way to:
1. Review a history of transportation requests they've already approved/denied (with what was decided, when, and by whom) to "double check" past decisions.
2. Edit Part C details (transportation type, cost, bus count, **driver names**, notes) on an already-`TRANSPORTATION_APPROVED` request — e.g. when a driver assignment changes after the fact.
3. Resend the approval/denial notification email to the submitter, either because they report not receiving it, or because a post-approval edit changed the details and the submitter needs the update.

## 3. Proposed Solution

### 3.1 Schema — new `TransportationApprovalHistory` audit table

Append-only log, one row per approve/deny/edit/resend action on a `FieldTripTransportationRequest`. Modeled directly on `FieldTripStatusHistory`.

```prisma
model TransportationApprovalHistory {
  id                       String    @id @default(uuid())
  transportationRequestId  String
  action                   String    // 'APPROVED' | 'DENIED' | 'EDITED' | 'EMAIL_RESENT'
  performedById            String
  performedByName          String    // cached display name, same pattern as changedByName
  performedAt              DateTime  @default(now())
  notes                    String?   @db.Text   // optional free-text note (e.g. reason for edit)
  changes                  Json?     // { fieldName: { from, to }, ... } — populated only for 'EDITED'

  transportationRequest    FieldTripTransportationRequest @relation(fields: [transportationRequestId], references: [id], onDelete: Cascade)
  performedBy              User      @relation("TransportationApprovalHistoryActor", fields: [performedById], references: [id])

  @@index([transportationRequestId])
  @@index([performedById])
  @@index([performedAt])
  @@map("transportation_approval_history")
}
```

Add relation fields:
- `FieldTripTransportationRequest`: `approvalHistory TransportationApprovalHistory[]`
- `User`: `transportationApprovalHistoryActions TransportationApprovalHistory[] @relation("TransportationApprovalHistoryActor")`

**Migration file** (manually created, per project convention — the container runs `prisma migrate deploy` on startup, it does not generate migrations):
`backend/prisma/migrations/20260811150000_add_transportation_approval_history/migration.sql`, mirroring the exact DDL style of `20260430153409_add_field_trip_models/migration.sql`.

Every existing `approve()`/`deny()` call will additionally write an `APPROVED`/`DENIED` row here (in the same Prisma transaction as the status update), so the audit trail is populated going forward from day one. (Historical pre-existing approvals/denials on production, e.g. Allyson Lewis's 12 approvals, will not be backfilled — out of scope; the trail starts from deploy.)

### 3.2 Backend — edit-after-approval endpoint

New service method `FieldTripTransportationService.editApproved(userId, fieldTripId, permLevel, data)`:
- Requires `permLevel >= 3` (same gate as `approve`/`deny` — reuse, don't invent a new tier).
- Only allowed when `transportRequest.status === 'TRANSPORTATION_APPROVED'` (editing a `TRANSPORTATION_DENIED` record is out of scope — a denial should be reversed by contacting the requester to resubmit, not silently edited into an approval; this matches the "change the bus driver" example, which implies an already-approved trip).
- Accepts the same editable field set as `ApproveTransportationSchema` (transportationType, transportationCost, transportationBusCount, driverNames, notes) — full Part C set, per your confirmation.
- Diffs old vs. new values for changed fields only, writes one `TransportationApprovalHistory` row with `action: 'EDITED'`, `changes: {...}`, inside a `$transaction` alongside the update.
- Reuses the existing `ApproveTransportationSchema` validator (already enforces driver-count-matches-bus-count) rather than declaring a new one — same shape, so no new Zod schema needed beyond a thin re-export/alias for clarity (`EditApprovedTransportationSchema = ApproveTransportationSchema`).
- Does **not** auto-send an email (edits and resends are explicit, separate actions per your ask — an edit alone doesn't spam the teacher; the secretary chooses when to resend).

New route: `PUT /api/field-trips/:id/transportation/edit` (PUT because it's a targeted update of an existing approved resource, matching the existing `PUT /:id/transportation` draft-edit convention), gated `requireModule('FIELD_TRIPS', 3)`.

### 3.3 Backend — resend email endpoint

New service method `FieldTripTransportationService.resendEmail(userId, fieldTripId, permLevel)`:
- Requires `permLevel >= 3`.
- Only allowed when `status` is `TRANSPORTATION_APPROVED` or `TRANSPORTATION_DENIED` (nothing to resend before a decision exists).
- Re-invokes the **existing** `sendTransportationApproved` / `sendTransportationDenied` email functions with the **current** row data (so if an edit happened first, the resend reflects the up-to-date details — satisfies both "they didn't get it" and "a change was made" in one action, per your ask).
- Writes a `TransportationApprovalHistory` row with `action: 'EMAIL_RESENT'` (no `changes`, optional `notes`).
- Controller-level, non-blocking pattern matching `approve`/`deny` (log failure, don't fail the request) is not appropriate here — resend's entire purpose is the email, so the controller `await`s `sendMail` and returns a 502-style error via `handleControllerError` if it throws, rather than silently succeeding with nothing sent.

New route: `POST /api/field-trips/:id/transportation/resend-email`, gated `requireModule('FIELD_TRIPS', 3)`.

### 3.4 Backend — history list endpoint

New service method `FieldTripTransportationService.listHistory(userId, permLevel, filters)`:
- Requires `permLevel >= 3`.
- Returns `FieldTripTransportationRequest` rows where `status IN ('TRANSPORTATION_APPROVED', 'TRANSPORTATION_DENIED')`, including the parent trip, `approvedBy`/`deniedBy`, and the new `approvalHistory` relation (ordered `performedAt asc`) so the frontend can render a full timeline per row.
- Supports optional query filters: `status`, `from`/`to` (trip date range) — same filter shape as `TransportationRequestsPage`, for consistency.

New route: `GET /api/field-trips/transportation/history`, gated `requireModule('FIELD_TRIPS', 3)`. Must be registered before `/:id/transportation` for the same reason `/transportation/pending` is (Express path-matching order — see comment at `fieldTrip.routes.ts:219-222`).

### 3.5 Frontend — history list page

New page `frontend/src/pages/FieldTrip/FieldTripTransportationHistoryPage.tsx`, modeled directly on `TransportationRequestsPage.tsx`:
- `ResponsiveTable` columns: Trip Date, School, Teacher, Status (chip), Approved/Denied By, Decided At.
- Filters: Status (Approved/Denied), trip date From/To — via `useFilterParams` (URL-persisted, same as the existing page).
- Row click → navigates to the existing `/field-trips/:id/transportation` route (reusing `FieldTripTransportationPage`, extended per 3.6) rather than a new detail page, since all the Part C data/actions already live there.
- New route registered in `App.tsx`: `/field-trips/transportation/history`.
- New nav entry alongside the existing Transportation Director "Pending Approval" queue link (wherever that's currently surfaced in the nav — to be located and matched during implementation).

### 3.6 Frontend — edit & resend on `FieldTripTransportationPage`

Extend `TransportationPartCForm.tsx` (currently read-only display once `TRANSPORTATION_APPROVED`/`TRANSPORTATION_DENIED` for non-owners, per `FieldTripTransportationPage.tsx:196-205`):
- When `status === 'TRANSPORTATION_APPROVED'` and viewer is non-owner with `permLevel >= 3`: show an "Edit" button that switches the existing approved-fields display into the same editable form fields already used for the initial Part C approval, prefilled with current values. Submits to the new `edit` endpoint.
- Show a "Resend Email" button whenever `status` is `TRANSPORTATION_APPROVED` or `TRANSPORTATION_DENIED` (non-owner, `permLevel >= 3`), calling the new resend endpoint, with a success/error toast (reuse whatever snackbar/toast pattern the app already uses elsewhere — to confirm the exact hook during implementation).
- Render the `approvalHistory` timeline (action, who, when, changed fields) beneath the Part C summary — reuse `FieldTripApprovalStepper`'s visual style if it generalizes cleanly, otherwise a simple MUI `Timeline`/list, whichever requires less new code (decide during implementation, not a new dependency either way — MUI Lab `Timeline` is not currently installed; default to a simple list to avoid adding a dependency unless it's already present).

### 3.7 Types

Extend `frontend/src/types/fieldTrip.types.ts`:
- New `TransportationApprovalHistoryEntry` interface matching the Prisma model shape.
- Add `approvalHistory?: TransportationApprovalHistoryEntry[]` to `FieldTripTransportationRequest`.
- New `EditApprovedTransportationDto` (same shape as the existing approve DTO).

Extend `frontend/src/services/fieldTripTransportation.service.ts` with `editApproved()`, `resendEmail()`, `listHistory()` client methods, following the existing method style in that file.

## 4. Implementation Steps

1. Schema: add `TransportationApprovalHistory` model + both relation fields; write migration SQL.
2. Validators: add `EditApprovedTransportationSchema` (alias of `ApproveTransportationSchema`), `TransportationHistoryQuerySchema` (status/from/to, optional).
3. Service: `editApproved()`, `resendEmail()`, `listHistory()` in `fieldTripTransportation.service.ts`; wire `TransportationApprovalHistory` row creation into existing `approve()`/`deny()` too.
4. Controller: `editApproved`, `resendEmail`, `listHistory` handlers in `fieldTripTransportation.controller.ts`.
5. Routes: register the three new routes in `fieldTrip.routes.ts` (history route before `/:id/transportation` per existing ordering rule).
6. Frontend types + service client methods.
7. Frontend: new `FieldTripTransportationHistoryPage.tsx` + route + nav entry.
8. Frontend: extend `TransportationPartCForm.tsx` with edit mode, resend button, and history timeline.
9. Build validation per Phase 3/6 (Docker image builds only — no host npm, no migrations run by Claude).

## 5. Dependencies

No new external dependencies. All work uses packages already in use (Express 5, Prisma 7, Zod 4, React 19, MUI v7, TanStack Query v5) — no version-sensitive API research required beyond what's already established in this codebase (confirmed via Dependency Policy: internal-pattern-reuse is exempt from the mandatory external-docs check).

## 6. Configuration Changes

None (no new env vars, no Entra scope changes — reuses existing `FIELD_TRIPS` permission module and existing `sendMail` transport).

## 7. Risks & Mitigations

- **Risk:** New migration not applied because the file is missing from the commit. **Mitigation:** migration SQL is authored and committed alongside the schema change, per project constraint (never rely on `prisma migrate dev`).
- **Risk:** Editing an approved request without re-sending an email could leave the submitter unaware of a change. **Mitigation:** explicit, separate "Resend Email" action is always available right next to Edit; not auto-firing an email on every edit avoids accidental spam but requires the secretary to remember to click resend — acceptable tradeoff since it's their explicit workflow ask.
- **Risk:** `permLevel >= 3` for `FIELD_TRIPS` is broader than "just transportation staff" (includes Principals, SPED Director, etc., per existing `groupAuth.ts`). **Mitigation:** out of scope to narrow — matches the exact existing gate on `approve`/`deny`, so the new edit/resend/history actions carry no *new* exposure beyond what already exists today.
- **Risk:** History table grows unbounded over time. **Mitigation:** no pagination limit is being removed elsewhere in the app for similar tables (`FieldTripStatusHistory` is unbounded too); acceptable at this data volume (tens of records/month).

## 8. Explicitly Out of Scope

- Backfilling `TransportationApprovalHistory` for pre-existing approved/denied production records.
- Showing approver identity to the submitter (`isOwner` view) — separate gap noted in prior conversation, not requested here.
- Editing `TRANSPORTATION_DENIED` records.
- Tightening the `FIELD_TRIPS` permLevel 3 gate to transportation-specific roles only.

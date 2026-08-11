# Spec: Notification badges on the Requests nav section

## Current state analysis (verified against this repo — several claims in the
source document did NOT hold and are corrected below)

### Nav structure
`frontend/src/components/layout/AppLayout.tsx`:
- `NAV_SECTIONS` (line 49) has a `title: 'Requests'` section (line 69) with
  exactly 5 items: Purchase Orders (`/purchase-orders`), Work Orders
  (`/work-orders`), Field Trips (`/field-trips`), Field Trip Approvals
  (`/field-trips/approvals`), Transportation Requests
  (`/transportation-requests`) — confirmed exact paths.
- `openGroup` state (line 162) initializes by checking whether the current
  path starts with any item's path in a *titled* section; the first section
  (Dashboard/Reports/My Equipment) has no title and is always rendered.
  **Confirmed: on `/dashboard` (the landing route), no titled section
  matches, so `openGroup` is `null` and every section — including
  Requests — starts collapsed.** The rollup badge on the collapsed section
  header is therefore load-bearing, exactly as the source doc claimed.
- `isActive` (line 225-243) already implements longest-prefix-wins matching
  so `/field-trips/approvals` doesn't also highlight `/field-trips` — this
  exact logic will be reused for the mark-visited effect.
- `renderSidebarContent` filters items per-role before rendering (line 195);
  the rollup badge must sum only `visibleItems`, not the full section array.

### Existing "last viewed" mechanism — confirmed present, confirmed left alone
`TicketView` model (`schema.prisma:1152`) with `userId`/`ticketId`/
`lastViewedAt`, driving `hasUnreadComments` on the Work Orders list via
`getUnreadTicketIds()` (`backend/src/services/work-orders.service.ts:538`).
This operates per-ticket, not per-nav-section — left untouched, exactly as
planned. `RequestSectionView` (new) will coexist as a separate,
coarser-grained mechanism.

### Work Orders unread-comment logic — logic to mirror, verified exactly
`getUnreadTicketIds()` (`work-orders.service.ts:538-560`): a comment counts
if `authorId != userId`, `isSystem: false`, and
`isInternal: false` unless `permLevel >= 3` (line 556) — this exact
permLevel gate must be reused for the badge's WORK_ORDERS count.

**Assignment special case, confirmed:** `assign()`
(`work-orders.service.ts:1015-1037`) updates `ticket.assignedToId` and, in
the same transaction, creates a `ticketComment` with `isSystem: true`,
`isInternal: true`, body `` `Work order assigned to ${assigneeName} by
${assignerName}` ``. There is no `assignedAt` column on `Ticket`. Because
`getUnreadTicketIds` explicitly excludes `isSystem: true` comments, a fresh
assignment with no discussion produces **no signal** under the plain
new-comment rule — confirmed this is a real gap, not a hypothetical one.
**Chosen mechanism:** a second query branch matching `ticketComment` rows
with `isSystem: true`, `authorId != userId`, `body: { startsWith: 'Work
order assigned to' }`, `createdAt > lastVisitedAt`, on tickets where
`assignedToId = userId`. This couples the badge to the literal comment text
in `assign()` — called out explicitly as a maintenance note in the code
comment, not hidden.

### Purchase Orders
`RequisitionStatusHistory` (`schema.prisma:347-362`): `purchaseOrderId`,
`changedById`, `changedAt`. `purchase_orders.requestorId` is the submitter
field (confirmed). Count = rows where `purchaseOrder.requestorId = userId`,
`changedById != userId`, `changedAt > lastVisitedAt`.

### Field Trips
`FieldTripStatusHistory` (`schema.prisma:782-797`) and `FieldTripApproval`
(`schema.prisma:761-778`), both with `changedById`/`actedById` and
`changedAt`/`actedAt`. `FieldTripRequest.submittedById` is the submitter
(consistent with `getMyApprovalHistory`, line 731). Count = rows in either
table where the parent trip's `submittedById = userId`, actor `!= userId`,
timestamp `> lastVisitedAt`.

### Field Trip Approvals
`fieldTrip.service.ts`, `getPendingApprovals(userId, permLevel, isAdmin)`
(line 667-720) — confirmed NOT currently split into a separate where-builder.
**Plan:** extract the `orConditions`-building logic (lines 670-713,
behavior-preserving, no logic change) into
`buildPendingApprovalsWhere(userId, permLevel, isAdmin)` returning
`{ orConditions }` or `null` if nothing eligible, called by both
`getPendingApprovals()` (unchanged return shape/behavior) and a new
`countPendingApprovalsSince(userId, permLevel, isAdmin, since)`, which reuses
the same `where` and adds `submittedAt: { gt: since }` — wait: submittedAt is
when the trip entered the pipeline, not when it entered *this approver's*
stage. Using `submittedAt` would undercount trips that have been pending
since before `since` but only reached this approver's stage after `since`.
**Correction applied:** count instead uses the *entry-into-stage* signal
already available — for non-supervisor stages, the most recent
`FieldTripStatusHistory.toStatus` matching the trip's current `status` value,
`changedAt > since`; for `PENDING_SUPERVISOR`, trips with no status-history
row yet (freshly submitted) count via `submittedAt > since`, OR a status
history row transitioning back into `PENDING_SUPERVISOR` (a denial-restart
path, if this codebase has one — confirmed **not present**: statuses only
move forward in `PENDING_STATUSES`, no revert transition exists, so the
simpler `submittedAt > since` OR "the most recent relevant
`FieldTripStatusHistory.changedAt` for this trip's current status `>
since`" covers it). Implemented as: eligible trips (via
`buildPendingApprovalsWhere`) with either no status history for the current
status transition (fall back to `submittedAt`) or the latest matching
history row's `changedAt > since`.

### Transportation Requests
`TransportationRequest` (`schema.prisma:1232+`) confirmed 4 approval/denial
timestamp columns: `supervisorApprovedAt`, `supervisorDeniedAt`,
`approvedAt`, `deniedAt` (secretary-level) — no status-history table for this
model, matching the doc. `updatedAt` deliberately not used (bumps on
submitter's own edits). Count = requests where `submittedById = userId` AND
(`supervisorApprovedAt > since` OR `supervisorDeniedAt > since` OR
`approvedAt > since` OR `deniedAt > since`) AND the relevant actor field
(`supervisorApprovedById`/`supervisorDeniedById`/`approvedById`/`deniedById`)
`!= userId` (self-approval isn't a real workflow here, but excluded for
consistency with every other section's "not my own change" rule).

### Route-mount-order bug — confirmed present exactly as described
`backend/src/app.ts`:
- `inventoryAuditRoutes` mounted at bare `/api` (line 235,
  `router.use(requireModule('TECHNOLOGY', 2))` path-less, confirmed at
  `inventoryAudit.routes.ts:46`, after `authenticate`/`validateCsrfToken`
  also path-less).
- `roomCheckoutRoutes` mounted at bare `/api` (line 236, same pattern,
  confirmed at `roomCheckout.routes.ts:29`).
- `notificationPreferencesRoutes` mounted at line 240 — **after** both,
  confirmed structurally exposed to the same inherited-403 bug. Per user
  decision: **flagged only, not fixed in this change** (see "Known issue,
  not fixed" below).
- New `requestBadgesRoutes` must mount **before** line 235 to avoid
  inheriting the same wrongly-scoped `403 Requires TECHNOLOGY level 2`.

### Test environment
`backend/.env.test` confirmed groups: `ENTRA_ADMIN_GROUP_ID`,
`ENTRA_ALL_STAFF_GROUP_ID`, `ENTRA_SCHOOL_MAINTENANCE_GROUP_ID`,
`ENTRA_PRINCIPALS_GROUP_ID`, `ENTRA_TECH_ASSISTANTS_GROUP_ID`.
`ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` is **not defined** — confirmed absent,
matching the doc's caution; any new test persona must use a group that
actually exists in this file.

### Design-system verification (color — resolved via direct pixel sampling,
not the source doc's unverified hex values)
- `frontend/src/styles/global.css`: `--primary-blue: #3b82f6` (light) /
  `#60a5fa` (dark) — this repo's actual active-nav blue, **not** `#2968ed` as
  the source doc claimed. `.nav-item--active` (AppLayout.css:198) uses a
  `linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-dark)
  100%)` background with white text.
- `--emerald-100`/`--emerald-800` already exists as a theme-aware
  success-badge pair (`global.css:23-24` light, `:78-79` dark), used by
  `.badge-success` — considered and **not** reused, per explicit user
  direction to extract the logo's own colors instead.
- Logo colors sampled by decoding `frontend/public/schoolworks_logo.png`
  pixel data directly (PNG chunks parsed, zlib-inflated, scanlines
  unfiltered, dominant colors clustered by frequency) rather than estimated:
  - Dominant navy cluster: `#002469` (~40k pixels, tightest cluster of the
    wordmark + gear icon).
  - Dominant green cluster: `#5bb33a` (~15k+ pixels across several
    near-identical shades, the "Works" wordmark + bottom accent bar).
  - A blue accent bar also exists at ~`#1f73ee`, unrelated to and distinct
    from `--primary-blue` (`#3b82f6`) — not used for this badge, avoiding any
    visual confusion with the existing nav-active blue.
  - WCAG contrast computed directly (sRGB→linear→relative luminance→ratio):
    green bg (`#5bb33a`) / navy text (`#002469`) = **5.46:1**, passes AA
    (4.5:1) for normal text. Navy bg / white text = 14.42:1 (used for the
    active-item inversion case). Green bg / white text = 2.64:1 (confirms
    white-on-green would fail AA — this is exactly why the active-item case
    inverts to white-bg/navy-text rather than keeping green-bg/white-text).
  - These colors are a **self-contained pair** (badge bg + badge text both
    change together) and don't depend on the page's light/dark background,
    so no separate `:root.dark` override is needed for the base badge — only
    the active-item inversion state needs an explicit rule, matching how
    `.nav-item--active` itself has no separate dark-mode block either
    (confirmed: no `:root.dark .nav-item--active` rule exists).

### `.nav-soon` shape reference
`AppLayout.css:238-246` — pill radius `9999px`, `padding: 0.125rem 0.5rem`,
`font-size: 0.625rem`, `font-weight: 600` — badge will match this shape.

## Problem definition
No at-a-glance indicator exists when something changes on a Requests-section
item while the user is away (new assignment, comment, status change) —
distinct from email/toast notifications, which are easy to miss.

## Proposed solution
(Design rationale — one-timestamp-per-section, personal scope only, exclude
own changes, seed-to-now, rollup on collapse, `refetchOnWindowFocus` —
matches the source doc's design exactly; verified against this repo's actual
schema/nav/permission model above, not assumed.)

### Prisma schema addition
```prisma
enum RequestSection {
  WORK_ORDERS
  PURCHASE_ORDERS
  FIELD_TRIPS
  FIELD_TRIP_APPROVALS
  TRANSPORTATION_REQUESTS
}

model RequestSectionView {
  id            String         @id @default(uuid())
  userId        String
  section       RequestSection
  lastVisitedAt DateTime       @default(now())
  user          User           @relation("RequestSectionViewer", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, section])
  @@index([userId])
  @@map("request_section_views")
}
```
Add `requestSectionViews RequestSectionView[] @relation("RequestSectionViewer")`
to `User` (matching this schema's existing back-relation naming style, e.g.
`ticketViews TicketView[] @relation("TicketViewer")` at line 554).

Migration file (manually authored, per project constraints — no
`prisma migrate dev`):
`backend/prisma/migrations/20260810140000_add_request_section_views/migration.sql`
```sql
CREATE TYPE "RequestSection" AS ENUM ('WORK_ORDERS', 'PURCHASE_ORDERS', 'FIELD_TRIPS', 'FIELD_TRIP_APPROVALS', 'TRANSPORTATION_REQUESTS');

CREATE TABLE "request_section_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "RequestSection" NOT NULL,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_section_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "request_section_views_userId_section_key" ON "request_section_views"("userId", "section");
CREATE INDEX "request_section_views_userId_idx" ON "request_section_views"("userId");

ALTER TABLE "request_section_views" ADD CONSTRAINT "request_section_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Backend files (new)
- `backend/src/services/requestBadges.service.ts` — five count functions
  (one per section, per the counting rules above) + `getBadgeCounts(userId,
  permLevel, isAdmin)` aggregator + `markSectionVisited(userId, section)`
  (upsert `lastVisitedAt: now()`) + first-read seeding (if no row, create one
  at `now()` and return `0` for that section, matching the doc's seeding
  requirement).
- `backend/src/validators/requestBadges.validators.ts` — `z.nativeEnum` (Zod
  4 — confirmed installed version in `backend/package.json`; `z.nativeEnum`
  remains valid in Zod 4 for a TS enum) for the section param on the
  mark-visited endpoint.
- `backend/src/controllers/requestBadges.controller.ts` — `GET /` (all
  counts) and `POST /:section/visited` (mark + return the now-zeroed count),
  thin, mirrors `notificationPreferences.controller.ts` style exactly
  (try/catch → `handleControllerError`).
- `backend/src/routes/requestBadges.routes.ts` — `router.use(authenticate)`
  only (no `requireModule`; every count is scoped to `req.user!.id`), mirrors
  `notificationPreferences.routes.ts` structure.
- `backend/src/__tests__/request-badges.test.ts` — cases enumerated below.

### Backend files (modified)
- `backend/prisma/schema.prisma` — enum + model + `User` back-relation.
- `backend/src/services/fieldTrip.service.ts` — extract
  `buildPendingApprovalsWhere()`, add `countPendingApprovalsSince()`, per
  above (behavior-preserving for the existing method).
- `backend/src/app.ts` — mount `requestBadgesRoutes` at
  `/api/request-badges` immediately before `app.use('/api',
  inventoryAuditRoutes)` (currently line 235), with a comment explaining why
  the ordering is load-bearing (same comment shape as the source doc's
  diff, adapted to this file's actual surrounding lines).

### Frontend files (new)
- `frontend/src/types/requestBadges.types.ts` — `RequestSection` union type
  + `RequestBadgeCounts` response shape.
- `frontend/src/services/requestBadges.service.ts` — `getBadgeCounts()`,
  `markSectionVisited(section)`, following this codebase's existing service
  file conventions (thin wrapper over the shared `api` client).
- `frontend/src/hooks/queries/useRequestBadges.ts` — `useRequestBadges()`
  (TanStack Query v5: `useQuery` with `refetchOnWindowFocus: true` and a
  background poll interval — confirmed v5 `refetchInterval`/
  `refetchOnWindowFocus` options are stable, unchanged API from v4 for these
  two options) and `useMarkSectionVisited()` (`useMutation`, invalidates the
  badges query key on success).

### Frontend files (modified)
- `frontend/src/lib/queryKeys.ts` — `requestBadges: { all: ['requestBadges']
  as const }`, matching the existing per-domain key-factory shape in this
  file.
- `frontend/src/components/layout/AppLayout.tsx` — add a `badgeKey?:
  RequestSection` field to the 5 Requests `NavItem` entries; render a
  `.nav-badge` span next to each item's label when its count > 0; render a
  rollup badge on the `Requests` section header summing `visibleItems`'
  counts; a `useEffect` keyed on `location.pathname` that finds the
  longest-prefix-matching badged item (reusing the existing `isActive`
  prefix-matching logic, extracted into a small shared helper so both the
  highlight logic and the mark-visited logic call the identical matcher) and
  calls `useMarkSectionVisited()` for it.
- `frontend/src/components/layout/AppLayout.css` — `.nav-badge` (pill shape
  matching `.nav-soon`'s dimensions, colors per above) and
  `.nav-item--active .nav-badge` (inversion override).

## Known issue, not fixed (per explicit user decision)
`notification-preferences` route is mounted after the same two offending
routers (`app.ts:240`, after line 235-236) and is structurally exposed to the
identical inherited-403 bug for any non-`TECHNOLOGY`-level-2 user calling
`GET/PATCH /api/notification-preferences/email`. **No existing test exercises
this with a non-technology user**, so this is a currently-undetected,
real (not hypothetical) bug — flagged here for the user's awareness and a
future fix, explicitly left unfixed in this change per user decision to
scope the mount-order fix to only the new route being added.

## Dependencies
None new. Zod 4 (`z.nativeEnum`), Prisma 7 (nested relation counts, upsert),
TanStack Query v5 (`useQuery`/`useMutation`, `refetchOnWindowFocus`) — all
already exercised elsewhere in this codebase; no version-specific API
concerns beyond what's already in use.

## Configuration changes
- New Prisma model + migration (above).
- No new env vars.

## Risks and mitigations
- **Risk:** badge counts leak data outside a user's normal visibility scope.
  **Mitigation:** every count query is scoped to `submittedById`/
  `assignedToId`/`reportedById = req.user!.id` — never the broader
  supervisor/admin visibility scope used by list endpoints.
- **Risk:** route-mount fix accidentally weakens the `TECHNOLOGY level 2`
  gate for the two existing routers. **Mitigation:** only the *mount
  position* of the new router changes; `inventoryAuditRoutes` and
  `roomCheckoutRoutes` and their internal `requireModule` calls are
  untouched.
- **Risk:** the WORK_ORDERS assignment-detection query (comment-body
  `startsWith` match) breaks silently if `assign()`'s comment text ever
  changes. **Mitigation:** documented inline at both call sites with a
  comment cross-referencing the other file.
- **Risk:** first-deploy badge flood. **Mitigation:** seed-to-`now()` on
  first read, per spec.

## Build validation commands (Phase 3/6)
- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- Full `scripts/preflight.ps1` (isolated `db-test` container, applies the new
  migration via `prisma migrate deploy` inside that container — never the
  persistent dev database).

## New backend test cases (`request-badges.test.ts`)
1. First read for a user with no `RequestSectionView` rows seeds all 5 to 0.
2. Another user's non-internal comment on the caller's own work order is
   counted.
3. The caller's own comment is not counted.
4. An internal comment below permLevel 3 is not counted; at permLevel >= 3
   it is.
5. A fresh assignment to the caller with zero comments is counted (the
   system-comment branch).
6. A purchase-order status change by someone else on the caller's own PO is
   counted; the caller's own status change is not.
7. A field-trip approval/status-history change by someone else on the
   caller's own trip is counted.
8. A trip entering the caller's approval stage after `lastVisitedAt` is
   counted for FIELD_TRIP_APPROVALS; a trip that was already pending at that
   stage before `lastVisitedAt` is not (tests the stage-entry-timestamp
   fix, not `submittedAt`).
9. A transportation request the caller submitted, approved/denied by someone
   else, is counted; the submitter's own edit (`updatedAt` bump only, no
   approval timestamp change) is not.
10. Visiting a section (`POST /:section/visited`) clears that section's
    count and returns `0`.
11. An invalid `:section` value is rejected with 400.
12. The endpoint requires authentication (401 unauthenticated).
13. **Route-mount regression test:** a non-`TECHNOLOGY`-level-2 user (using
    `ENTRA_TECH_ASSISTANTS_GROUP_ID` or another confirmed-defined test
    persona with no tech access) can call `GET /api/request-badges` and get
    a real 200, not the previously-inherited 403 — this is the same class of
    check the source doc's own before/after run demonstrated, run here
    against this repo's actual test fixtures.

Test personas: use only groups confirmed present in `backend/.env.test`
(`ENTRA_ADMIN_GROUP_ID`, `ENTRA_ALL_STAFF_GROUP_ID`,
`ENTRA_SCHOOL_MAINTENANCE_GROUP_ID`, `ENTRA_PRINCIPALS_GROUP_ID`,
`ENTRA_TECH_ASSISTANTS_GROUP_ID`) — never an undefined group, which grants no
access and can make a rejection test pass for the wrong reason (this exact
mistake is documented as having happened once already in this repo's history,
per `inventory-table-scrollbar-and-permanent-delete.md`'s Fix 2 section — a
useful cautionary precedent even though that file describes a different,
unverified checkout).

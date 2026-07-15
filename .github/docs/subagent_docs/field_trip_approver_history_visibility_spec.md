# Field Trip Approver History Visibility — Spec

## Current State Analysis

`FieldTripService.getPendingApprovals()` (`backend/src/services/fieldTrip.service.ts:621`)
scopes results strictly to trips whose **current** `status` matches a stage the
calling user is authorized to act on (`eligibleStatuses` derived from `permLevel`).

The frontend `FieldTripApprovalPage` (`frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`)
renders exactly that list under the "Field Trip Approvals" tab, with no other
approver-facing list surface for field trips.

Sequence for the reported bug:
1. Teacher submits trip → `PENDING_SUPERVISOR`.
2. Supervisor approves → status advances to `PENDING_ASST_DIRECTOR`. The trip
   disappears from the Supervisor's "Field Trip Approvals" tab (expected — it's
   no longer awaiting their action).
3. Assistant Director approves → status advances to `PENDING_DIRECTOR`. The
   trip disappears from the Assistant Director's tab too — but there is no
   other page where the Assistant Director can find it again, even though the
   request continues to move through the workflow.

Note: `FieldTripService.getById()` (`backend/src/services/fieldTrip.service.ts:587`)
already permits **any** user with `permLevel >= 3` to view an individual trip
by ID. The gap is discoverability — approvers have no list surface to find a
trip they previously acted on. The fix adds that list surface; no detail-page
permission change is required.

## Problem Definition

Once an approver acts on a field trip request (approve/deny/send-back), it
vanishes from their view. Approvers need a durable way to look back at requests
they've acted on, regardless of where the request currently sits in the
approval chain.

## Proposed Solution

Add a new "approval history" list, scoped to trips the current user has
personally acted on (an existing `FieldTripApproval` row with `actedById ===
userId`), independent of the trip's current status. Surface it as a second tab
next to the existing "Field Trip Approvals" tab.

### Backend

**`backend/src/services/fieldTrip.service.ts`**
Add a method on `FieldTripService`, placed after `getPendingApprovals`:

```ts
async getMyApprovalHistory(userId: string) {
  return prisma.fieldTripRequest.findMany({
    where:   { approvals: { some: { actedById: userId } } },
    orderBy: { updatedAt: 'desc' },
    include: TRIP_LIST_INCLUDE,
  });
}
```

Reuses the existing `TRIP_LIST_INCLUDE` shape (same shape already consumed by
the frontend `FieldTripRequest` type / `approvalColumns`). No new Prisma
relations needed — `FieldTripApproval.actedById` already exists and is indexed
implicitly via the FK to `fieldTripRequestId`; this is a simple `some` filter
on an existing relation, consistent with query patterns already used elsewhere
in this file (`getMyRequests`, `getPendingApprovals`).

**`backend/src/controllers/fieldTrip.controller.ts`**
Add a handler mirroring `getPendingApprovals`:

```ts
export const getMyApprovalHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await fieldTripService.getMyApprovalHistory(req.user!.id);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

**`backend/src/routes/fieldTrip.routes.ts`**
Add a route in the "Collection routes" block (before `/:id`), same permission
gate as `pending-approvals` (level 3 — approvers only; a non-approver has no
approval history to view):

```ts
/**
 * GET /api/field-trips/approval-history
 * List field trip requests the current user has personally approved, denied,
 * or sent back, regardless of the trip's current status.
 */
router.get(
  '/approval-history',
  requireModule('FIELD_TRIPS', 3),
  fieldTripController.getMyApprovalHistory,
);
```

No Zod validator needed (no params/body — same as `pending-approvals`).
No Prisma schema or migration changes — this only adds a read query against
existing tables/columns.

### Frontend

**`frontend/src/services/fieldTrip.service.ts`**
Add, next to `getPendingApprovals`:

```ts
getApprovalHistory: async (): Promise<FieldTripRequest[]> => {
  const res = await api.get<FieldTripRequest[]>(`${BASE}/approval-history`);
  return res.data;
},
```

**`frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`**
Add a third tab, "My Approval History", following the existing tab pattern
(mobile `<select>` + desktop `<Tabs>`). Add a `useQuery` gated by
`enabled: activeTab === 2` (same lazy-fetch pattern already used for the
"Transportation Pending" tab), and render it with the existing `ResponsiveTable`
using the same `approvalColumns` (the `status` column already shows current
status — e.g. `APPROVED`, `DENIED`, `PENDING_DIRECTOR` — which communicates
where the request stands now). `emptyMessage`: "You have not yet acted on any
field trip requests." Row click still navigates to `/field-trips/:id`, which
is already permitted for `permLevel >= 3` users per `getById`.

No new types needed — `FieldTripRequest` already covers the response shape.

## Implementation Steps

1. Backend: add `getMyApprovalHistory` to `FieldTripService`.
2. Backend: add controller handler `getMyApprovalHistory`.
3. Backend: register `GET /api/field-trips/approval-history` route (level 3),
   positioned before `/:id` alongside the other collection routes.
4. Frontend: add `getApprovalHistory` to `fieldTripService`.
5. Frontend: add "My Approval History" tab to `FieldTripApprovalPage` (tab
   index 2), wired to the new query, reusing `approvalColumns`.

## Dependencies

None — uses existing Prisma models, existing Express/Zod/TanStack Query/MUI
patterns already exercised elsewhere in this file. No new packages.

## Configuration Changes

None (no env vars, no Prisma schema/migration changes).

## Risks and Mitigations

- **Risk:** `approvals: { some: { actedById: userId } }` could be slow without
  an index. **Mitigation:** `FieldTripApproval.fieldTripRequestId` and
  `actedById` are queried the same way `getPendingApprovals`'s duplicate-guard
  already filters by `actedById` (`fieldTrip.service.ts:296-304`); table size
  for this internal ops tool is small, no index migration warranted.
- **Risk:** Scope creep toward "show admins/all trips" list. **Mitigation:**
  explicitly scoped to `actedById === userId` only, per the reported issue —
  approvers see trips they personally acted on, not a global history.

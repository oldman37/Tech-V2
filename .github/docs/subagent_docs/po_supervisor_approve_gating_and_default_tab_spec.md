# Spec: Fix Supervisor Approve-Button Gating & Extend Default "Pending My Approval" Tab

## 1. Current State Analysis

### Item 1 — Missing Approve button for a valid supervisor

`frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx:289-304` independently re-derives
which user is the "assigned supervisor" for a PO's entity location, purely to decide whether to
show the Approve/Reject buttons at the `submitted` stage:

```ts
const assignedSupervisorId = (() => {
  if (!po.officeLocationId) return null;
  const supervisors = po.officeLocation?.supervisors;
  if (!supervisors || supervisors.length === 0) return null;
  let expectedType: string | undefined;
  if (isFoodService) {
    expectedType = 'FOOD_SERVICES_SUPERVISOR';
  } else if ((po.officeLocation as any)?.type === 'SCHOOL') {
    expectedType = 'PRINCIPAL';
  }
  if (expectedType) {
    const match = supervisors.find((s: any) => s.supervisorType === expectedType);
    return match?.userId ?? supervisors[0]?.userId ?? null;
  }
  return supervisors[0]?.userId ?? null;
})();
```

For non-SCHOOL, non-food-service locations (e.g. a Department like "Maintenance Department"),
this falls through to `supervisors[0]?.userId` — the first entry of whatever
`po.officeLocation.supervisors` the backend included, with no ordering guarantee.

That `supervisors` array (`purchaseOrder.service.ts:520-529`) is populated with
`where: { isPrimary: true }` only — no `supervisorType` filter — so a single location can
contribute multiple entries, one per primary supervisor type. Confirmed against the database
for "Maintenance Department" (`office_locations` id `99acd8f1-e34c-4163-a2a8-3a6f24741864`):

| userId | supervisorType | isPrimary |
|---|---|---|
| ff58a93f… (Timothy Barbour) | MAINTENANCE_DIRECTOR | true |
| abf17731… (Joseph Lewis) | TECHNOLOGY_ASSISTANT | true |
| a700dea2… (Gregory Blankenship) | MAINTENANCE_WORKER | true |

Postgres does not guarantee row order without an `ORDER BY` clause (none is specified), so
`supervisors[0]` can be any of the three depending on physical storage order — which is why the
symptom reproduced in production (schoolworks.ocboe.com) but not in the local dev database,
where the same query happened to return Timothy Barbour first.

Meanwhile, the actual backend authorization check for approving at the `submitted` stage
(`purchaseOrder.service.ts:1241-1274`, and identically at submit-time routing,
`purchaseOrder.service.ts:847-866`) does filter correctly:

```ts
const locSup = await this.prisma.locationSupervisor.findFirst({
  where: {
    locationId: po.officeLocationId,
    isPrimary: true,
    user: { isActive: true },
    ...(expectedSupervisorType
      ? { supervisorType: expectedSupervisorType }
      : { supervisorType: { notIn: ['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER'] } }),
  },
});
```

After that exclusion, exactly one row remains (Timothy Barbour, MAINTENANCE_DIRECTOR) — so the
backend deterministically authorizes his approval regardless of row order. The bug is confined
to the frontend's separate, incomplete re-implementation of this same filter, which is used only
to decide button visibility (`canApprove`/`canReject` at `PurchaseOrderDetail.tsx:316-321`) — a
real approval attempt via direct API call would already succeed for Timothy today, but the
button never renders for him to trigger it.

### Item 2 — Default list tab for supervisor-tier approvers

`frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx:116` currently defaults the tab to
`'pending'` only for `isDosApprover`:

```ts
const [tab, setTab] = useState<TabKey>(isDosApprover ? 'pending' : 'mine');
```

The "Pending My Approval" tab itself is visible to anyone with `permLevel >= 3`
(`TABS` array, `PurchaseOrderList.tsx:66`) — DOS (permLevel 6), Finance Directors (permLevel 5),
and every location-supervisor role (permLevel 3, e.g. Maintenance Director, Principals,
Transportation/Technology/SPED/CTE/Pre-K/Afterschool/Nurse Directors) all qualify. Per user
confirmation, this fix should extend to all supervisor-tier approvers, not just Maintenance
Director specifically, since there is no per-department flag (like `isDosApprover`) to key off
and the underlying problem — landing on "My Requests" when the user's real job on this page is
approving — is identical for every one of these roles.

`permLevel` is already read synchronously from `user.permLevels.REQUISITIONS` via
`useRequisitionsPermLevel()` (`frontend/src/hooks/queries/useRequisitionsPermLevel.ts`), which
returns `isLoading: false` always — it derives directly from the already-loaded auth store user
object, gated by `ProtectedRoute` before this page ever mounts. No race condition, same reasoning
already documented for the existing DOS default-tab fix.

## 2. Problem Definition

1. The Approve/Reject buttons on the PO detail page can fail to render for the correct,
   authorized supervisor when their location has more than one primary `LocationSupervisor`
   record of different types (e.g. a MAINTENANCE_DIRECTOR alongside a MAINTENANCE_WORKER and a
   TECHNOLOGY_ASSISTANT), because the frontend's own gating logic doesn't exclude the same
   non-approver supervisor types that the backend's authorization check excludes.
2. Only Director of Schools approvers currently default to the "Pending My Approval" tab; all
   other supervisor-tier approvers (permLevel >= 3) still land on "My Requests" by default, even
   though approving POs is their primary reason for visiting this page.

## 3. Solution

### 3a. `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Add a module-level constant listing the supervisor types that never act as the PO approver,
mirroring the backend's `notIn` list exactly:

```ts
const NON_APPROVER_SUPERVISOR_TYPES = ['TECHNOLOGY_ASSISTANT', 'MAINTENANCE_WORKER'];
```

Update the generic (non-SCHOOL, non-food-service) branch of `assignedSupervisorId` to filter
out those types before taking the first match, instead of blindly using `supervisors[0]`:

```ts
return supervisors.find((s: any) => !NON_APPROVER_SUPERVISOR_TYPES.includes(s.supervisorType))?.userId ?? null;
```

This makes the frontend's visibility gate match the backend's actual authorization decision
deterministically, independent of Postgres row order.

No other logic in the file changes — `canApprove`/`canReject`, the SCHOOL/PRINCIPAL branch, and
the food-service branch are already correct and untouched.

### 3b. `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

Change the tab initializer from the `isDosApprover`-only check to the same `permLevel >= 3`
threshold already used to gate the "pending" tab's visibility:

```ts
const [tab, setTab] = useState<TabKey>(permLevel >= 3 ? 'pending' : 'mine');
```

`permLevel` is already destructured at the top of the component (`useRequisitionsPermLevel()`,
line 86) and is available before this initializer runs. `isDosApprover` remains in use elsewhere
in the file (Food Service Approval tab visibility) — unaffected.

## 4. Dependencies

None — pure internal TypeScript/React changes to existing files. No new packages, no Prisma
schema changes, no new environment variables.

## 5. Risks and Mitigations

- **Item 1 fix risk:** none identified — this only narrows an already-too-permissive fallback
  (`supervisors[0]`) to match exactly what the backend already enforces. It cannot grant a button
  to anyone the backend wouldn't already authorize, since the backend re-checks independently on
  every mutating request.
- **Item 2 fix risk:** Finance Directors and Food Service PO Entry users (permLevel 4-5) will now
  also land on "Pending My Approval" by default instead of "My Requests". This is the intended,
  user-confirmed generalization. If a supervisor-tier user has no POs pending their approval, the
  tab still renders correctly empty — no functional regression, same as the existing DOS case.

## 6. Build Validation

`docker compose -f docker-compose.dev.yml build frontend` (frontend-only change; no backend or
shared package files touched).

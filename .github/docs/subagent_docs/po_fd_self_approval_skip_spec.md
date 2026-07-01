# PO Finance Director Self-Approval Skip — Spec

## Current State Analysis

The PO approval chain is: `submitted -> supervisor_approved -> finance_director_approved -> dos_approved -> po_issued`
(`backend/src/services/purchaseOrder.service.ts:5`).

A separate Food Service chain already skips the Finance Director stage entirely:
`submitted -> supervisor_approved -> dos_approved` (`getFoodServiceApprovalRequirements`,
`purchaseOrder.service.ts:160-167`), selected purely by the stored `workflowType` column
(`'standard' | 'food_service'`) at `approvePurchaseOrder` (`purchaseOrder.service.ts:1012-1014`).

Separation-of-duties is enforced at `purchaseOrder.service.ts:1055-1064`: a requestor may never
approve their own PO. When the Finance Director submits her own PO:

1. It moves normally through the supervisor stage (her location's real supervisor approves,
   or the existing self-supervisor bypass applies if applicable — unrelated to this change).
2. It reaches `supervisor_approved`, which requires Finance Director group membership to advance
   (`purchaseOrder.service.ts:1109-1127`).
3. Because she is both the requestor and the (only) Finance Director group member, the self-approval
   check at line 1055 blocks her every time. The frontend does not know about this rule
   (`PurchaseOrderDetail.tsx:247` `canActAtFdStage` never checks `requestorId`), so it still renders
   the Approve button, which then fails with "Separation of duties" when clicked.
4. There is no delegation mechanism for the Finance Director stage (the `SupervisorDelegation` model
   used at `purchaseOrder.service.ts:1023-1043` is scoped to the supervisor stage only).

Result: her PO is stuck at `supervisor_approved` indefinitely.

## Problem Definition

When the requestor of a standard-workflow PO is themselves a Finance Director group member, the PO
must skip the `finance_director_approved` stage and route directly from `supervisor_approved` to
Director of Schools — mirroring the existing Food Service skip pattern — instead of leaving the PO
stuck behind a self-approval block. The frontend must also stop offering a Finance Director approve
action on such a PO and instead offer the Director of Schools action at that stage.

## Proposed Solution

Add a dedicated boolean column, `skipFinanceDirectorApproval`, to `purchase_orders`, set once at
creation time (mirrors the existing `entityType` "cached at create" pattern). This is kept separate
from `workflowType` (`'standard' | 'food_service'`) because `workflowType` also drives frontend tab
filtering, list badges, and Food-Service-specific routing (FS Supervisor stage, FS PO Entry stage)
that must NOT change for these POs — only the Finance-Director hop should be skipped; the PO stays a
normal `standard` PO in every other respect (visible in "All"/"My Requests" tabs, issued by the
normal PO Entry group, etc.).

`skipFinanceDirectorApproval` is computed server-side only, from the requestor's Entra group
membership at creation time (`req.user.groups`, already available on `AuthRequest` — same source used
throughout this file for `userGroups`), never from client input. This avoids adding a client-settable
enum value that could be used to bypass the Finance Director stage.

### Why not reuse `workflowType: 'food_service'`?

Reusing the food-service value (or adding a third `workflowType` enum member) would also change:
frontend tab filtering (`PurchaseOrderList.tsx:150-151` forces `workflowType=standard` on all
non-food-service tabs, which would hide her own PO from "My Requests"/"All"), the Stage 4 PO-Entry
queue clause (`workflowType: 'standard'` at `purchaseOrder.service.ts:390`, which would misroute
issuance to the Food Service PO Entry group), and list/detail labels ("Food Services Supervisor
Approved"). A separate boolean avoids all of that collateral impact.

## Implementation Steps

### Backend — schema

- `backend/prisma/schema.prisma`: add `skipFinanceDirectorApproval Boolean @default(false)` to
  `purchase_orders`, next to `workflowType`, with a doc comment.
- `backend/prisma/migrations/20260701120000_add_po_skip_finance_director_approval/migration.sql`:
  ```sql
  ALTER TABLE "purchase_orders" ADD COLUMN "skipFinanceDirectorApproval" BOOLEAN NOT NULL DEFAULT false;
  ```

### Backend — `purchaseOrder.service.ts`

- `createPurchaseOrder(data, requestorId, userGroups: string[])`: new `userGroups` parameter.
  Compute `skipFinanceDirectorApproval = resolvedWorkflowType !== 'food_service' && !!fdGroupId &&
  userGroups.includes(fdGroupId)` and persist it on create.
- Rename `getFoodServiceApprovalRequirements()` -> `getFinanceDirectorSkipApprovalRequirements()`
  (same body/shape: `submitted -> supervisor_approved -> dos_approved`); update its doc comment to
  note it is shared by Food Service POs and Finance-Director-self-requested POs. Update the single
  call site.
- `approvePurchaseOrder`: compute `const skipFd = po.workflowType === 'food_service' ||
  po.skipFinanceDirectorApproval;` once, right after loading `po`. Use it to:
  - select `getFinanceDirectorSkipApprovalRequirements()` vs `getApprovalRequirements()`
    (replaces the `po.workflowType === 'food_service'` check at line 1012).
  - at the `supervisor_approved` group gate (lines 1092-1128), branch on `skipFd` instead of
    `po.workflowType === 'food_service'` to require the DoS group instead of the FD group; generalize
    the thrown message so it doesn't say "Food Service" when the PO isn't food service.

### Backend — `getPurchaseOrders` pending-approval query

- Stage 2 (Finance Director queue, `purchaseOrder.service.ts:370-374`): add
  `skipFinanceDirectorApproval: false` to the existing `{ status: 'supervisor_approved', workflowType:
  'standard' }` clause so her own PO never appears in any Finance Director's queue.
- Stage 3b (DoS queue, `purchaseOrder.service.ts:381-384`): extend from
  `{ status: 'supervisor_approved', workflowType: 'food_service' }` to also match
  `{ status: 'supervisor_approved', skipFinanceDirectorApproval: true }` (via `OR`), so DoS sees it.
- Stage 4 (PO Entry queue) needs no change — the PO keeps `workflowType: 'standard'`, so it already
  surfaces to the normal PO Entry group once `dos_approved`, not the Food Service PO Entry group.

### Backend — `purchaseOrder.controller.ts`

- `createPurchaseOrder` handler: pass `req.user!.groups ?? []` as the new third argument.
- `submitPurchaseOrder` handler (~line 183) and `approvePurchaseOrder` handler (~line 251): extend
  the `po.workflowType === 'food_service'` check used to decide "notify DoS instead of Finance
  Director after supervisor approval" to `po.workflowType === 'food_service' ||
  po.skipFinanceDirectorApproval`.

### Frontend

- `frontend/src/types/purchaseOrder.types.ts`: add `skipFinanceDirectorApproval?: boolean;` to
  `PurchaseOrderSummary`.
- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`:
  - Add a `skipsFd = isFoodService || po.skipFinanceDirectorApproval` boolean.
  - Add a new stage/label set (draft/submitted/supervisor_approved/dos_approved/po_issued with
    "Supervisor Approved" / "Awaiting Director of Schools Approval" / "Approve as Director of
    Schools" wording — distinct from the Food Service wording) selected when
    `po.skipFinanceDirectorApproval` is true (and not a Food Service or District Office PO).
  - Update `canActAtFdStage` to `!skipsFd && ...` and `canActAtDosStage` to check `skipsFd`
    instead of `isFoodService` alone, so the FD-approve button disappears for her own PO and the
    DoS-approve button appears at `supervisor_approved` instead.
- `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`: update the `pendingLabels.supervisor_approved`
  ternary (line ~249) to also treat `po.skipFinanceDirectorApproval` as "Awaiting Director of Schools
  Approval" so the DoS's "Pending My Approval" list shows the correct label.

## Dependencies

None — no new packages. `workflowType`/`skipFinanceDirectorApproval` are plain Prisma `String`/`Boolean`
columns (no Postgres enum type), so no destructive schema changes; Express 5/Prisma 7/Zod 4 APIs
already in use elsewhere in this file are unaffected.

## Risks and Mitigations

- **Multiple Finance Director group members**: this change skips the stage unconditionally whenever
  the requestor is an FD group member, regardless of whether a different FD could have approved
  instead. This matches the explicit request ("autoskip to DOS when the FD submits") and mirrors the
  unconditional Food Service skip; not treated as a bug for this change.
- **District Office + Finance-Director-requestor combination**: if the FD's own PO is tied to a
  DISTRICT_OFFICE location, the *supervisor* stage itself already routes to the Finance Director
  group (`purchaseOrder.service.ts:1163-1182`), which would still block her before reaching
  `supervisor_approved`. This is a pre-existing, separate gap (same class of bug, different stage)
  and is out of scope for this change; not modified here.
- **Existing stuck PO**: because `skipFinanceDirectorApproval` is only set at creation time, any PO
  she already submitted before this change ships will keep `skipFinanceDirectorApproval = false` and
  remain stuck. She will need to have that specific PO's flag corrected manually (a one-off `UPDATE`,
  not part of this code change) or resubmit/recreate it after deploy — flagging this for the user,
  not fixing automatically since it touches live data.

## Build/Test Commands (approved for Phase 3/6)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (runs both of the above)

No other commands are in scope. No FORBIDDEN COMMANDS are used.

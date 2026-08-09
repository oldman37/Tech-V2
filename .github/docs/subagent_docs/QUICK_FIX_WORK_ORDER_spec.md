# Spec: "Quick Fix" — log and close a small device fix in one step

## Current state analysis

All prerequisites from the source doc confirmed present in this repo, with
two divergences flagged below.

- `Ticket` model (`backend/prisma/schema.prisma:1050`) has the OPEN→CLOSED
  lifecycle; `VALID_TRANSITIONS.OPEN → CLOSED` requires `minLevel: 3`
  (`work-orders.service.ts:44-49,66-70`).
- Route → controller → service layering confirmed:
  `backend/src/routes/work-orders.routes.ts` →
  `backend/src/controllers/work-orders.controller.ts` →
  `backend/src/services/work-orders.service.ts`.
- Zod validators at `backend/src/validators/work-orders.validators.ts`.
  `CreateWorkOrderSchema.description` is `min(10).max(5000)` (line 84).
  `UpdateStatusSchema` has a `superRefine` rejecting `CLOSED` with blank
  `notes` (line 169-176, message "Actions Taken is required to close a work
  order").
- `equipment` model (lowercase, `schema.prisma:47`) has `assetTag`,
  `isDisposed`, `officeLocationId` — all present.
- `WorkOrderCategory` model (`schema.prisma:1380-1396`) has `module`,
  `isActive`, `requiresAssetTag`, `sortOrder`, `@@unique([name, module])`; no
  `quickFix` column yet. Admin CRUD screen:
  `frontend/src/components/reference-data/WorkOrderCategoriesTab.tsx`.
- `deviceAssignment.types.ts`'s `DeviceAssignment` has `equipmentId`,
  `equipment.assetTag`, `equipment.name`, `userId`, `user` — all present.
- Module-scoped permission levels: `req.user.permLevel`, applied via
  `requireModule(module, minLevel)` (`backend/src/utils/groupAuth.ts`) —
  confirmed used identically throughout `work-orders.routes.ts`.
- `createWorkOrder(data: CreateWorkOrderDto, reportedById: string)` and
  `updateStatus(id, data, userId, permLevel, maintenanceRole?)` signatures on
  `WorkOrderService` match the source doc exactly
  (`work-orders.service.ts:642,778-784`).
- `assertTicketAccess`'s branch structure (permLevel ≥5 unconditional;
  ≤2 reporter-only; 3 with `county_wide`/`school_only`/default; 4 with
  `director`/default) matches the source doc's enumerated branches exactly
  (`work-orders.service.ts:299-351`).

**Divergence 1 — category names.** This repo's seed migration
(`backend/prisma/migrations/20260518214803_seed_work_order_categories/migration.sql`)
seeds exactly the same two non-final names the source doc flagged:
`Hardware Failure` (not `Hardware Issue`) and `New Equipment Setup` (not
`Equipment Setup`), both `TECHNOLOGY`, both currently active. The other four
target categories (`Software Issue`, `Network / Connectivity`,
`Account / Access`, `Other`) already match. **This repo has no `SmartBoard` or
`Document Camera` category at all** (unlike the source repo) — not a problem,
they simply don't need a quick-fix flag; the migration's `IN (...)` list only
touches rows that exist.

**Divergence 2 — `CheckoutPage.tsx`'s actions column already has `minWidth`
and `priority` set**, from this session's prior `active-checkouts-responsive-
column-wrapping` fix (item 3), which the source doc explicitly anticipated
("the working tree this fix was made in also carried an unrelated,
uncommitted 'Quick Fix work order' feature touching the same file... those
hunks are deliberately excluded"). Current actions column
(`CheckoutPage.tsx:247-277` at time of writing):

```tsx
{
  key:      'actions',
  label:    '',
  minWidth: 180,
  priority: -3,
  render:   (r) => { /* Check In, Edit, Assign/Replace Charger, Create Incident */ },
},
```

This spec adds a 5th button inside that same `render` — `minWidth`/`priority`
are untouched. Per item 3's review note, re-confirming `minWidth: 180` is
still adequate with 5 buttons is folded into this item's own review.

## Problem definition

Logging a trivial on-the-spot device fix today requires either the full "New
Work Order" form or nothing — there is no lightweight, one-step way to create
and immediately close a low-priority ticket from where a technician already
has the device identified (the Active Checkouts row).

## Proposed solution

Add `POST /api/work-orders/quick-fix`: creates a `TECHNOLOGY`/`LOW` ticket for
an already-identified device and immediately closes it via the existing
`updateStatus` transition, gated to an admin-curated subset of
`WorkOrderCategory` rows via a new opt-in `quickFix` boolean column. Add a
`QuickFixDialog` on the Checkouts page row actions, and a "Show in Quick Fix"
toggle on the category admin screen. Matches the source doc's design exactly
— no repo-specific redesign needed, only the two renames and the confirmed
signatures above.

## Implementation steps

### 1. Schema

`backend/prisma/schema.prisma`, `WorkOrderCategory` model — add after
`requiresAssetTag`:

```prisma
  /// Opt-in: only categories flagged here appear in the Checkouts page Quick Fix dropdown.
  quickFix         Boolean                 @default(false)
```

Default `false` — opt-in, so the list can't silently regrow as categories are
added.

### 2. Migration (hand-written, per this repo's own CLAUDE.md policy — no
`prisma migrate dev`)

New file, timestamped to sort after
`20260805190000` (the newest existing migration —
confirm against `backend/prisma/migrations/` at implementation time, since
another migration may land first):
`backend/prisma/migrations/<ts>_add_quick_fix_to_work_order_categories/migration.sql`:

```sql
-- Add an opt-in "show in Quick Fix" flag to work order categories.
--
-- The Quick Fix dropdown and the full New Work Order form read the same
-- work_order_categories rows. Quick Fix only applies to student device fixes, so
-- infrastructure categories must stay available to the work order form while
-- being hidden from Quick Fix. A separate flag is the only way to do that
-- without deactivating them.

ALTER TABLE work_order_categories
  ADD COLUMN IF NOT EXISTS "quickFix" BOOLEAN NOT NULL DEFAULT false;

-- Rename for consistency before flagging, so the flags below match final names.
-- The NOT EXISTS guards protect the @@unique([name, module]) constraint: a failed
-- migration stops the backend container from starting, so skip rather than error
-- if a category already exists under the new name.
UPDATE work_order_categories SET name = 'Hardware Issue'
WHERE module = 'TECHNOLOGY' AND name = 'Hardware Failure'
  AND NOT EXISTS (SELECT 1 FROM work_order_categories
                  WHERE module = 'TECHNOLOGY' AND name = 'Hardware Issue');

UPDATE work_order_categories SET name = 'Equipment Setup'
WHERE module = 'TECHNOLOGY' AND name = 'New Equipment Setup'
  AND NOT EXISTS (SELECT 1 FROM work_order_categories
                  WHERE module = 'TECHNOLOGY' AND name = 'Equipment Setup');

-- Flag the curated set. Every statement here is idempotent (safe to re-run).
UPDATE work_order_categories
SET "quickFix" = true
WHERE module = 'TECHNOLOGY'
  AND name IN (
    'Hardware Issue',
    'Software Issue',
    'Network / Connectivity',
    'Account / Access',
    'Equipment Setup',
    'Other'
  );
```

Verified against this repo's actual seeded rows (see Divergence 1) — the
`IN (...)` list matches what will actually exist by the time this runs.

### 3. Backend — Quick Fix endpoint

`backend/src/validators/work-orders.validators.ts` — add:

```ts
export const QuickFixSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID'),
  categoryId:  z.string().uuid('Invalid category ID'),
});
export type QuickFixDto = z.infer<typeof QuickFixSchema>;
```

`backend/src/services/work-orders.service.ts` — add `quickFix` method after
`createWorkOrder`, exactly as specified in the source doc (permLevel < 3
guard; equipment lookup scoped to `isDisposed: false`; category lookup
scoped to `module: 'TECHNOLOGY', isActive: true, quickFix: true`; description
`Quick Fix: <category name>`; explicit `notInInventory: false`; conditional
`officeLocationId` spread from equipment; close via `updateStatus` wrapped in
try/catch returning the still-open ticket with a warn-level log on failure).

`backend/src/controllers/work-orders.controller.ts` — add `quickFix` handler
after `createWorkOrder`, following the same
`parse → resolve user/permLevel/maintenanceRole → delegate → mapTicket →
res.status(201).json` shape as the existing handler, with
`handleControllerError` in catch.

`backend/src/routes/work-orders.routes.ts` — register
`POST /quick-fix` with `validateRequest(QuickFixSchema, 'body')` and
`requireModule('WORK_ORDERS', 3)`, positioned after the existing
`POST /` create route and **before** the `/:id` block (matching the existing
precedent of `/stats/summary` and `/input-requests/mine` both being
registered ahead of `/:id` in this same file).

### 4. Backend — expose `quickFix` on the category API

`backend/src/validators/workOrderCategory.validators.ts` — add `quickFix` to
`GetWorkOrderCategoriesQuerySchema` (string→boolean transform, mirroring the
existing `isActive` transform), `CreateWorkOrderCategorySchema`
(`z.boolean().optional().default(false)`), `UpdateWorkOrderCategorySchema`
(`z.boolean().optional()`).

`backend/src/services/workOrderCategory.service.ts` — add `quickFix?:
boolean` to `WorkOrderCategoryQuery`, destructure in `findAll`, spread into
`where` as `...(quickFix !== undefined && { quickFix })`.

### 5. Frontend — types, service, hook

`frontend/src/types/workOrderCategory.types.ts` — add `quickFix: boolean` to
`WorkOrderCategory`; `quickFix?: boolean` to `CreateWorkOrderCategoryDto`,
`UpdateWorkOrderCategoryDto`, `WorkOrderCategoryQueryParams`.

`frontend/src/services/workOrderCategoryService.ts` — in `getAll`, append
`quickFix` to the query string when defined, mirroring the existing
`isActive` line.

`frontend/src/services/work-order.service.ts` — add `quickFix` wrapper after
`create`, `POST ${BASE}/quick-fix`, returning `WorkOrderDetail`.

`frontend/src/hooks/mutations/useWorkOrderMutations.ts` — add
`useQuickFix()`, invalidating `queryKeys.workOrders.all` **only** (Quick Fix
doesn't touch the checkout assignment, so `device-assignments` queries must
not be invalidated).

### 6. Frontend — the dialog

New file `frontend/src/components/DeviceManagement/QuickFixDialog.tsx`,
mirroring `AssignChargerDialog.tsx`'s sibling pattern exactly (confirmed:
`getApiErrorMessage` helper, `{ assignment, open, onClose }` props shape).
Device line, category `Select` (query scoped to
`module: 'TECHNOLOGY', isActive: true, quickFix: true, sortBy: 'sortOrder'`),
Cancel/Submit, success/warning `Alert` per the source doc's exact copy
(`Work order {workOrderNumber} created and closed.` /
`...was created but could not be automatically closed.` with a link to the
detail page).

### 7. Frontend — wire into `CheckoutPage.tsx`

Insert a 5th button (`BuildIcon`, "Quick Fix") into the existing actions
column's `render`, between "Assign/Replace Charger" and "Create Incident",
with `e.stopPropagation()` (rows are clickable). Add `quickFixTarget` state
and render `<QuickFixDialog>` alongside the other conditional dialogs. Do
**not** touch the column's `minWidth: 180` / `priority: -3` — added by item 3
in this same session; re-validate adequacy with 5 buttons in this item's own
Phase 3 review rather than bumping the number speculatively.

### 8. Frontend — admin toggle

`WorkOrderCategoriesTab.tsx` — add `fQuickFix` state alongside
`fRequiresAssetTag`, gated the same way (`module === 'TECHNOLOGY'`): reset on
`openCreate`/seed on `openEdit`, include in both `create`/`update` payloads, a
`Switch` labelled "Show in Quick Fix" with the source doc's exact caption, a
desktop table column (`Shown`/`Hidden`), a mobile card badge — all following
the existing `requiresAssetTag` pattern in the same file line-for-line.

## Dependencies

None new. `@mui/icons-material` (`BuildIcon`) is already a project dependency
(used throughout `CheckoutPage.tsx` for other action icons).

## Configuration changes

Schema + hand-written migration (above). No env vars, no MSAL/Graph scopes.

## Risks and mitigations

- **Risk:** migration runs against a repo where the seed names have already
  been manually renamed or the seed migration was skipped.
  **Mitigation:** every statement is idempotent (`IF NOT EXISTS` guards,
  `ON CONFLICT`-safe flagging by name) — safe to re-run, and a mismatch
  silently flags zero rows rather than erroring, which is surfaced by smoke
  test step 1 in Verification.
- **Risk:** `notInInventory` omitted at the `quickFix` call site into
  `createWorkOrder` — compiles fine on older TS inference but the
  Zod-inferred output type makes it required. **Mitigation:** pass it
  explicitly (`notInInventory: false`); the `tsc` build in Phase 3 catches
  this if missed.
- **Risk:** `maintenanceRole` dropped when calling `updateStatus` inside
  `quickFix`. **Mitigation:** resolve and forward it exactly as
  `updateStatus`'s own controller does; a silent omission compiles but
  changes the access decision for maintenance-role callers — flagged
  explicitly for the Phase 3 reviewer to check.
- **Risk:** `/quick-fix` registered after `/:id` and matched as an id.
  **Mitigation:** registered directly after `POST /` and before the `/:id`
  block, per step 3 above and the existing `/stats/summary` precedent in the
  same file.
- **Risk:** category flag enforced only by the dropdown filter, not
  server-side. **Mitigation:** `quickFix` service method re-validates
  `category.quickFix === true` itself (see step 3) — a crafted request
  selecting a hidden category is rejected regardless of what the UI sent.
- **Risk:** `minWidth: 180` on the actions column (set by item 3) becomes too
  narrow with a 5th button. **Mitigation:** flagged for explicit
  re-verification in this item's Phase 3 review rather than assumed fine.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate — also runs the backend test suite
  against a real, disposable `db-test` container, which is how the migration
  gets exercised via `prisma migrate deploy`)

FORBIDDEN COMMANDS check: no `prisma migrate dev`/`reset`, no `db push
--force-reset`, no sync scripts, no foreground `npm run dev` — none needed or
used. The migration SQL is hand-written per this repo's own CLAUDE.md policy,
matching how the source doc itself was built.

## Verification plan (Phase 3, in addition to build)

1. Confirm the 6 renamed/flagged categories load in the Quick Fix dropdown
   and that the 4 non-flagged TECHNOLOGY categories (`Printer / Copier`,
   `Phone / VoIP`, `Projector / Display`, `Security Camera`) still appear on
   the full New Work Order form — proves curation via flag, not deactivation.
2. Pick `Other` (shortest name) — proves the `Quick Fix: ` prefix satisfies
   `description.min(10)`.
3. Confirm the created ticket lands in the closed-work-order count.
4. No automated tests are proposed for this flow, matching the source doc —
   none exist for either page today.

# Spec: Quick Fix — record the issue, not just the fix

## Current state analysis

The bug report handed to this workflow describes two changes. Verifying
against this repo before implementing (per CLAUDE.md's "think before
coding"):

1. **"Add an issue field"** — `backend/src/validators/work-orders.validators.ts:146-168`
   `QuickFixSchema` currently has `reportedByUserId`, `equipmentId`,
   `chargerId`, `categoryId`, and `notes` (the closing "Actions Taken" note,
   `min(1)`/`max(1000)`). There is **no field for what was wrong** — still
   true in this repo. `work-orders.service.ts:837`, `quickFix()`, still
   hardcodes:
   ```ts
   description: `Quick Fix: ${category.name}`,
   ```
   `frontend/src/pages/WorkOrderDetailPage.tsx:503-506` renders `Category`
   as its own field (`workOrder.workOrderCategory?.name ?? workOrder.category`),
   independent of `description` — confirmed safe to drop the category name
   from the description text.
   `frontend/src/components/DeviceManagement/QuickFixDialog.tsx` has a
   Device select, a Category select, and one `TextField` ("What did you
   do?", the `notes` field) — no issue field. **This part of the bug is
   still present and needs fixing.**

2. **"Stop notifying the auto-assigned worker"** — **already fixed in this
   repo.** `work-orders.service.ts:646-748` `createWorkOrder()` already
   takes an `options?: { notifyAssignee?: boolean }` parameter, defaulted to
   notify (`options?.notifyAssignee ?? true` at `:740`), and `quickFix()`
   already calls it with `{ notifyAssignee: false }` (`:851`). This matches
   the 1.9.0 changelog entry "Quick Fix ... no longer sends a 'new ticket
   assigned to you' notification or nav badge for a ticket it closed in the
   same breath." **No action needed — verified via code, not assumed from
   the bug report, and left untouched.**

Frontend payload/type threading points for the new field:
- `frontend/src/services/work-order.service.ts:80` `quickFix()` — inline
  object type, no shared interface.
- `frontend/src/hooks/mutations/useWorkOrderMutations.ts:33-45` `useQuickFix()` —
  same inline object type, duplicated.
- `frontend/src/components/DeviceManagement/QuickFixDialog.tsx` — `notes`
  state/TextField at `:49,184-196`; submit guard at `:97,212`.

## Problem definition

Quick Fix's created work order description is a fixed placeholder
(`Quick Fix: <category name>`) rather than the technician's own account of
what was wrong, because there was no free-text field on the form guaranteed
to satisfy `description`'s `min(10)` when Quick Fix was built. The ticket's
history records the fix but never the original issue.

## Proposed solution

Add a required `issue` field to `QuickFixSchema`, bounded the same way
`description` is elsewhere in this validator file (`min(10)`/`max(5000)`),
and source the ticket's `description` from it instead of the hardcoded
prefix. Thread `issue: string` through every layer: validator → service →
frontend API wrapper → mutation hook → dialog component, with the new field
rendered **above** the existing "What did you do?" field so the two read
issue-then-resolution.

## Implementation steps

1. `backend/src/validators/work-orders.validators.ts` — add to
   `QuickFixSchema`:
   ```ts
   // Required — becomes the ticket's description.
   issue: z.string().trim().min(10, 'Please describe the issue (at least 10 characters)').max(5000, 'Issue must be 5000 characters or less'),
   ```
2. `backend/src/services/work-orders.service.ts` — `quickFix()`: replace
   `description: \`Quick Fix: ${category.name}\`` with
   `description: data.issue`.
3. `frontend/src/services/work-order.service.ts` — add `issue: string` to
   `quickFix()`'s inline payload type.
4. `frontend/src/hooks/mutations/useWorkOrderMutations.ts` — add
   `issue: string` to `useQuickFix()`'s inline payload type.
5. `frontend/src/components/DeviceManagement/QuickFixDialog.tsx`:
   - New `issue` state, reset in `handleClose`.
   - New required `TextField` ("What's the issue?", multiline, same sizing
     as the existing notes field), positioned **above** "What did you do?".
   - Include `issue: trimmedIssue` in the `quickFix.mutateAsync(...)` call.
   - Extend the Submit-button disabled guard and `handleSubmit`'s early
     return to also require a non-empty trimmed issue.

## Dependencies

None — no new packages, no external API surface touched.

## Configuration changes

None. No Prisma schema change — `description` already exists and already
accepts free text.

## Risks and mitigations

- **Risk:** dropping the category-name prefix loses information shown
  nowhere else. **Mitigation:** confirmed `WorkOrderDetailPage.tsx` renders
  `Category` as its own field independent of `description` — nothing is
  lost.
- **Risk:** re-implementing the already-fixed notification suppression
  and accidentally changing its default/behavior for other callers.
  **Mitigation:** left entirely untouched — verified current, correct
  behavior via code inspection rather than assumed broken from the bug
  report's stale description.

## Build/validation commands (approved for Phase 3 / Phase 6)

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test` (or `scripts/preflight.ps1`)

No FORBIDDEN COMMANDS involved — no schema/migration change, no live-DB
scripts.

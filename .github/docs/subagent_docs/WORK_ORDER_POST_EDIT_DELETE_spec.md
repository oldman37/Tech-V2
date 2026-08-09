# Spec: Edit and delete your own work order posts

## Current state analysis

All prerequisites from the source doc confirmed present, with one repo-
specific UI-layout difference and one pre-existing gap noted below.

- `Ticket` (`backend/prisma/schema.prisma:1050`) has `description`,
  `reportedById`.
- `TicketComment` (`schema.prisma:1126-1143`) has `authorId`, `body`,
  `isInternal`, **and `isSystem` already present** (`isSystem Boolean
  @default(false)` — the "critically check" item from the source doc; no
  flag needs adding).
- `TicketStatusHistory` (`schema.prisma:1186-1201`) has `changedById`,
  `fromStatus`, `toStatus`, `notes`.
- `TicketPriorityHistory` (`schema.prisma:1203-1218`) has `changedById`,
  `notes`.
- Route → controller → service layering confirmed:
  `backend/src/routes/work-orders.routes.ts` →
  `backend/src/controllers/work-orders.controller.ts` →
  `backend/src/services/work-orders.service.ts`.
- Zod validators at `backend/src/validators/work-orders.validators.ts`.
- Scoped-access helper: `private assertTicketAccess(ticket, userId, permLevel,
  maintenanceRole?)` on `WorkOrderService` (`work-orders.service.ts:299-351`)
  — branch structure confirmed identical to the source doc (permLevel ≥5
  unconditional pass; ≤2 reporter-only; 3 with `county_wide`/`school_only`/
  default; 4 with `director`/default).
- Module-scoped permission levels: `req.user.permLevel`, `requireModule
  (module, minLevel)` — used identically throughout `work-orders.routes.ts`.
- Detail page: `frontend/src/pages/WorkOrderDetailPage.tsx` — renders a
  merged comments+history activity feed (`ActivityItem` union, sorted by
  timestamp, `CommentCard`/`StatusHistoryCard`/`PriorityHistoryCard`
  sub-components, lines 588-618) below a separate Description `Paper`
  (lines 569-576). Matches the source doc's structural description exactly.
- Seed "created" history row: `createWorkOrder`
  (`work-orders.service.ts:713-722`) writes `TicketStatusHistory` with
  `fromStatus: null, notes: 'Work order created', changedById: reportedById`
  — confirmed, drives the `fromStatus !== null` guard exactly as the source
  doc specifies.
- `CreateWorkOrderSchema.description`: `min(10).max(5000)`
  (`work-orders.validators.ts:84`). `AddCommentSchema.body`: `min(1).max(5000)`
  (`work-orders.validators.ts:212`). `UpdateStatusSchema.notes`: `max(1000)`
  (`work-orders.validators.ts:166`) — all confirmed, mirrored exactly by the
  new edit schemas per the source doc's design.

**Divergence 1 (pre-existing gap, not introduced by and not fixed by this
change).** `addComment` (`work-orders.service.ts:1046-1072`) does **not**
call `assertTicketAccess` today — it only checks the ticket exists. This is
narrower than the source doc's premise ("a scoped-access helper used by
existing mutations"). This spec's new `assertOwnComment` helper **does**
call `assertTicketAccess` regardless, per the source doc's constraint #3 (a
user who lost scoped access to a location must not be able to reach back
into it for a post they once wrote) — this is a new, stricter guarantee
introduced specifically for edit/delete, not a modification of `addComment`
itself. `addComment`'s own gap is out of scope for this task (Surgical
Changes: not touching unrelated code) and is noted here only so the
reviewer doesn't mistake it for something this change should have fixed.

**Divergence 2 (frontend type gap, exactly as the source doc predicted).**
`frontend/src/types/work-order.types.ts`'s `WorkOrderComment`
(lines 71-79) has **no `isSystem` field**. Confirmed the backend's
`WORK_ORDER_DETAIL_INCLUDE.comments` (`work-orders.service.ts:95-99`) uses a
bare `include` (no `select`) for the comment relation, so `isSystem` (and,
once added, `editedAt`) already ship in every API response — this is purely
a missing TS field, not a backend gap. Confirmed via the source doc's own
"verify this upstream" instruction.

**Divergence 3 (UI structure differs slightly from the source doc's literal
description, functionally equivalent).** The source doc describes a
"pencil icon in the card header, right-aligned" for the description and
"pencil + trash icons in the comment header row" for comments. This repo's
`CommentCard`/`StatusHistoryCard`/`PriorityHistoryCard` are separate
sub-components (not one generic renderer) with a header row already
containing name/badges/timestamp (`WorkOrderDetailPage.tsx:138-148` for
comments, similarly for history cards) — the pencil/trash icons are added to
that existing header row structure, and the Description `Paper`
(`WorkOrderDetailPage.tsx:569-576`) gets a `Box` header row added (it
currently has none, just a bare `Typography` title) to hold the edit pencil.
Functionally identical placement to the source doc; implementation is
component-local rather than shared-header-row because these are already
three distinct sub-components in this repo.

## Problem definition

Anything posted to a work order (comment, status/priority note, description)
is permanent today. The only remedy for a mistake is an admin deleting the
entire work order. Add author-only edit (and, for comments, delete), with no
admin/supervisor override — a deliberate, tested product decision — while
keeping status/priority transitions themselves, their timestamps and authors,
and the seed "created" record fully immutable.

## Proposed solution

Four new nullable "edited at" timestamps (one per editable thing), five new
endpoints (update/delete comment, update status-history notes, update
priority-history notes, update description), a shared three-gate
authorization check (belongs-to-ticket → scoped access → authorship) per
operation, and inline edit affordances added to the existing
`CommentCard`/`StatusHistoryCard`/`PriorityHistoryCard` components and the
Description `Paper` — matching the source doc's design exactly, adapted to
this repo's actual (functionally equivalent) component structure per
Divergence 3.

## Implementation steps

### 1. Schema — four "edited at" timestamps

`backend/prisma/schema.prisma`:

```prisma
model Ticket {
  // ...existing fields...
  description         String
  /// Set whenever `description` is changed after creation — drives the "edited" marker
  descriptionEditedAt DateTime?
}

model TicketComment {
  // ...existing fields...
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  /// Set when the author edits `body` — drives the "edited" marker. Distinct from
  /// updatedAt, which Prisma also sets on insert and on any non-body write.
  editedAt   DateTime?
}

model TicketStatusHistory {
  // ...existing fields...
  notes         String?
  /// Set when the author edits `notes` — drives the "edited" marker
  notesEditedAt DateTime?
}

model TicketPriorityHistory {
  // ...existing fields...
  notes         String?
  notesEditedAt DateTime?
}
```

Nullable, not boolean — every existing row is correctly "never edited" with
no backfill. `TicketComment.updatedAt` is NOT reused (Prisma sets it on
insert and on any future non-body write — can't answer "did a human edit
this?").

### 2. Migration — hand-written (per this repo's own CLAUDE.md policy)

New file, timestamped after the newest existing migration (this session's
own `20260808120000_add_quick_fix_to_work_order_categories` — confirm no
other migration has landed since at implementation time):
`backend/prisma/migrations/<ts>_add_work_order_post_edit_delete/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "descriptionEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_comments" ADD COLUMN "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_status_history" ADD COLUMN "notesEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ticket_priority_history" ADD COLUMN "notesEditedAt" TIMESTAMP(3);
```

Purely additive nullable columns, no backfill, no index (never filtered/
sorted on, only read back with rows already fetched). Table names confirmed
via `@@map`: `tickets`, `ticket_comments`, `ticket_status_history`,
`ticket_priority_history` (all present in `schema.prisma`).

### 3. Backend — validators

`backend/src/validators/work-orders.validators.ts` — add after
`WorkOrderIdParamSchema`/near the comment and status schemas:

```ts
export const WorkOrderCommentParamSchema = z.object({
  id:        z.string().uuid('Invalid work order ID format'),
  commentId: z.string().uuid('Invalid comment ID format'),
});

export const UpdateCommentSchema = z.object({
  body: z.string().min(1, 'Comment cannot be empty').max(5000, 'Comment must be 5000 characters or less'),
});

export const WorkOrderHistoryEntryParamSchema = z.object({
  id:      z.string().uuid('Invalid work order ID format'),
  entryId: z.string().uuid('Invalid entry ID format'),
});

// Nullable: clearing the note back to empty is the "delete" affordance for a
// history note — the history row itself must survive.
export const UpdateHistoryNotesSchema = z.object({
  notes: z.string().max(1000).nullable(),
});

export const UpdateDescriptionSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description must be 5000 characters or less'),
});

export type UpdateCommentDto      = z.infer<typeof UpdateCommentSchema>;
export type UpdateHistoryNotesDto = z.infer<typeof UpdateHistoryNotesSchema>;
export type UpdateDescriptionDto  = z.infer<typeof UpdateDescriptionSchema>;
```

Limits mirror the create-side exactly (comment 1-5000, notes ≤1000,
description 10-5000, all confirmed against this repo's own schemas above) so
an edit can never produce a value the create path would reject.

### 4. Backend — service methods

`backend/src/services/work-orders.service.ts` — add after `addComment`
(comment methods) and near `updateStatus`/`updatePriority`
(history-notes methods) and near `updateWorkOrder` (description method).
Every method runs three gates in this order: (1) row belongs to the ticket
in the URL; (2) caller has scoped access (`assertTicketAccess`); (3) caller
is the author.

```ts
  /**
   * Loads a comment, asserting it belongs to `ticketId`, that the caller still
   * has access to the work order, that the caller wrote it, and that it is not
   * a system-generated comment (assignment / input request).
   */
  private async assertOwnComment(
    ticketId: string,
    commentId: string,
    userId: string,
    permLevel: number,
    maintenanceRole: MaintenanceRole,
    action: 'edit' | 'delete',
  ) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.ticketId !== ticketId) throw new NotFoundError('Comment', commentId);

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Work order', ticketId);

    await this.assertTicketAccess(ticket, userId, permLevel, maintenanceRole);

    if (comment.isSystem) {
      throw new AuthorizationError(`System-generated comments cannot be ${action}d`);
    }
    if (comment.authorId !== userId) {
      throw new AuthorizationError(`You can only ${action} your own comments`);
    }

    return comment;
  }

  async updateComment(ticketId: string, commentId: string, data: UpdateCommentDto, userId: string, permLevel: number, maintenanceRole?: MaintenanceRole) {
    await this.assertOwnComment(ticketId, commentId, userId, permLevel, maintenanceRole, 'edit');

    const updated = await this.prisma.ticketComment.update({
      where: { id: commentId },
      data:  { body: data.body, editedAt: new Date() },
      include: { author: { select: { id: true, displayName: true, email: true } } },
    });

    loggers.workOrders.info('Comment edited', { ticketId, commentId, userId });
    return updated;
  }

  async deleteComment(ticketId: string, commentId: string, userId: string, permLevel: number, maintenanceRole?: MaintenanceRole) {
    await this.assertOwnComment(ticketId, commentId, userId, permLevel, maintenanceRole, 'delete');

    await this.prisma.ticketComment.delete({ where: { id: commentId } });

    loggers.workOrders.info('Comment deleted', { ticketId, commentId, userId });
  }

  /**
   * Edit the notes ("Actions Taken") on a status history entry. The transition
   * itself is immutable — only the note text changes, and the entry can never
   * be deleted. The seed "Work order created" entry (fromStatus === null) is
   * not editable.
   */
  async updateStatusHistoryNotes(ticketId: string, entryId: string, data: UpdateHistoryNotesDto, userId: string, permLevel: number, maintenanceRole?: MaintenanceRole) {
    const entry = await this.prisma.ticketStatusHistory.findUnique({ where: { id: entryId } });
    if (!entry || entry.ticketId !== ticketId) throw new NotFoundError('Status history entry', entryId);

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Work order', ticketId);

    await this.assertTicketAccess(ticket, userId, permLevel, maintenanceRole);

    if (entry.fromStatus === null) {
      throw new AuthorizationError('The work order creation entry cannot be edited');
    }
    if (entry.changedById !== userId) {
      throw new AuthorizationError('You can only edit your own notes');
    }

    const updated = await this.prisma.ticketStatusHistory.update({
      where: { id: entryId },
      data:  { notes: data.notes, notesEditedAt: new Date() },
      include: { changedBy: { select: { id: true, displayName: true, email: true } } },
    });

    loggers.workOrders.info('Status history notes edited', { ticketId, entryId, userId });
    return updated;
  }

  /** Same as updateStatusHistoryNotes, minus the fromStatus guard — priority
   *  history has no equivalent immutable seed row. */
  async updatePriorityHistoryNotes(ticketId: string, entryId: string, data: UpdateHistoryNotesDto, userId: string, permLevel: number, maintenanceRole?: MaintenanceRole) {
    const entry = await this.prisma.ticketPriorityHistory.findUnique({ where: { id: entryId } });
    if (!entry || entry.ticketId !== ticketId) throw new NotFoundError('Priority history entry', entryId);

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Work order', ticketId);

    await this.assertTicketAccess(ticket, userId, permLevel, maintenanceRole);

    if (entry.changedById !== userId) {
      throw new AuthorizationError('You can only edit your own notes');
    }

    const updated = await this.prisma.ticketPriorityHistory.update({
      where: { id: entryId },
      data:  { notes: data.notes, notesEditedAt: new Date() },
      include: { changedBy: { select: { id: true, displayName: true, email: true } } },
    });

    loggers.workOrders.info('Priority history notes edited', { ticketId, entryId, userId });
    return updated;
  }

  /**
   * Edit the work order description. Restricted to the reporter — the person
   * who wrote it. Separate from updateWorkOrder (level 3+) because a reporter
   * is commonly level 1-2 and must not gain access to the other fields on that
   * endpoint.
   */
  async updateDescription(id: string, data: UpdateDescriptionDto, userId: string, permLevel: number, maintenanceRole?: MaintenanceRole) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError('Work order', id);

    await this.assertTicketAccess(ticket, userId, permLevel, maintenanceRole);

    if (ticket.reportedById !== userId) {
      throw new AuthorizationError('You can only edit the description of a work order you submitted');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data:  { description: data.description, descriptionEditedAt: new Date() },
      include: WORK_ORDER_DETAIL_INCLUDE,
    });

    loggers.workOrders.info('Work order description edited', { ticketId: id, userId });
    return updated;
  }
```

**Also stamp the marker on `updateWorkOrder`** (the existing level-3 endpoint
that can also change the description, `work-orders.service.ts:744-772`) —
add to its `data:` object:

```ts
        descriptionEditedAt: data.description !== undefined && data.description !== ticket.description
          ? new Date()
          : undefined,
```

Without this, a description edited through the existing staff endpoint would
show no marker and the feed would misrepresent it.

### 5. Backend — controllers and routes

`backend/src/controllers/work-orders.controller.ts` — thin handlers matching
the existing pattern (parse → resolve `req.user!.id`/`permLevel`/
`getMaintenanceRole(req.user!.groups ?? [])` → delegate → catch via
`handleControllerError`). `updateComment`/`updateStatusHistoryNotes`/
`updatePriorityHistoryNotes` return `res.json(mapTicket-or-raw...)` (comment
and history entries aren't `Ticket` rows, so no `mapTicket` — return the
updated row directly, matching `addComment`'s existing
`res.status(201).json(comment)` pattern, no field rename needed);
`deleteComment` returns `res.status(204).send()`; `updateDescription`
returns `res.json(mapTicket(ticket))` (this one *is* a `Ticket` row, matching
every other work-order-returning handler in this file).

`backend/src/routes/work-orders.routes.ts` — register after the existing
`POST /:id/comments`, before `DELETE /:id`:

```ts
router.put(
  '/:id/comments/:commentId',
  validateRequest(WorkOrderCommentParamSchema, 'params'),
  validateRequest(UpdateCommentSchema, 'body'),
  requireModule('WORK_ORDERS', 2),
  workOrdersController.updateComment,
);

router.delete(
  '/:id/comments/:commentId',
  validateRequest(WorkOrderCommentParamSchema, 'params'),
  requireModule('WORK_ORDERS', 2),
  workOrdersController.deleteComment,
);

router.put(
  '/:id/status-history/:entryId/notes',
  validateRequest(WorkOrderHistoryEntryParamSchema, 'params'),
  validateRequest(UpdateHistoryNotesSchema, 'body'),
  requireModule('WORK_ORDERS', 1),
  workOrdersController.updateStatusHistoryNotes,
);

router.put(
  '/:id/priority-history/:entryId/notes',
  validateRequest(WorkOrderHistoryEntryParamSchema, 'params'),
  validateRequest(UpdateHistoryNotesSchema, 'body'),
  requireModule('WORK_ORDERS', 1),
  workOrdersController.updatePriorityHistoryNotes,
);

router.put(
  '/:id/description',
  validateRequest(WorkOrderIdParamSchema, 'params'),
  validateRequest(UpdateDescriptionSchema, 'body'),
  requireModule('WORK_ORDERS', 1),
  workOrdersController.updateDescription,
);
```

Levels chosen as "the level required to have created that kind of record in
the first place" (comment: 2, matching `POST /:id/comments`; history/
description: 1, since the actual gate is the authorship check in the
service) — **not** the real gate; a user with no work-order access at all
still can't reach the handler.

**Why `/description` is a separate route, not a lowered `PUT /:id`:** that
endpoint requires level 3, but a reporter is commonly level 1-2. Lowering it
would expose every other field on that endpoint (location, category,
equipment links) to reporters.

`router.use(authenticate)` and `router.use(validateCsrfToken)` are already
applied at the top of `work-orders.routes.ts` (confirmed lines 38, 41) —
covers every route below, including these five, with no per-route change
needed.

### 6. Frontend — types, service, hooks

`frontend/src/types/work-order.types.ts`:

```ts
export interface WorkOrderComment {
  // ...existing fields...
  /** System-generated (assignment, input request) — never editable or deletable. */
  isSystem: boolean;
  /** Non-null once the author has edited the body. */
  editedAt: string | null;
}

export interface WorkOrderStatusHistoryEntry {
  // ...existing fields...
  notesEditedAt: string | null;
}

export interface WorkOrderPriorityHistoryEntry {
  // ...existing fields...
  notesEditedAt: string | null;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  // ...existing fields...
  descriptionEditedAt: string | null;
}
```

`isSystem` addition is purely a TS-interface fix — confirmed present in
every API response already (Divergence 2 above); no backend `select` change
needed.

`frontend/src/services/work-order.service.ts` — five wrappers alongside
`addComment`:

```ts
  updateComment: async (id: string, commentId: string, body: string) => {
    const res = await api.put(`${BASE}/${id}/comments/${commentId}`, { body });
    return res.data;
  },

  deleteComment: async (id: string, commentId: string): Promise<void> => {
    await api.delete(`${BASE}/${id}/comments/${commentId}`);
  },

  updateStatusHistoryNotes: async (id: string, entryId: string, notes: string | null) => {
    const res = await api.put(`${BASE}/${id}/status-history/${entryId}/notes`, { notes });
    return res.data;
  },

  updatePriorityHistoryNotes: async (id: string, entryId: string, notes: string | null) => {
    const res = await api.put(`${BASE}/${id}/priority-history/${entryId}/notes`, { notes });
    return res.data;
  },

  updateDescription: async (id: string, description: string): Promise<WorkOrderDetail> => {
    const res = await api.put<WorkOrderDetail>(`${BASE}/${id}/description`, { description });
    return res.data;
  },
```

`frontend/src/hooks/mutations/useWorkOrderMutations.ts` — five `useMutation`
hooks, following the file's existing `{ id, ... }` param-object convention.
Invalidation scoped per the source doc:

- `useUpdateStatusHistoryNotes` / `useUpdatePriorityHistoryNotes` →
  `queryKeys.workOrders.detail(id)` only;
- `useUpdateComment` / `useDeleteComment` / `useUpdateDescription` →
  `detail(id)` **and** `lists()` — the list row carries a comment count
  (`_count.comments`, confirmed in `WORK_ORDER_DETAIL_INCLUDE`) and the
  unread flag, both of which a comment or description edit can affect.

### 7. Frontend — the detail page

`frontend/src/pages/WorkOrderDetailPage.tsx` — add near the top-level
helpers (alongside `formatDate`):

```tsx
function EditedMarker({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
      edited {formatDate(at)}
    </Typography>
  );
}

/**
 * Shared inline editor for a comment body, a history note, or the description.
 * Owns its own draft/saving/error state so each item can be edited independently
 * without threading state through the page. `onSave` rejecting keeps the editor
 * open and surfaces the API message; resolving leaves the parent to unmount it.
 */
function InlineEditForm({
  initialValue, label, minLength = 1, allowEmpty = false, onSave, onCancel,
}: {
  initialValue: string;
  label: string;
  minLength?: number;
  allowEmpty?: boolean;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft]   = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const trimmed  = draft.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < minLength;
  const isEmpty  = trimmed.length === 0;
  const invalid  = tooShort || (isEmpty && !allowEmpty);

  const handleSave = async () => {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(apiMessage ?? 'Unable to save your changes. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        label={label}
        multiline
        minRows={2}
        fullWidth
        size="small"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={saving || invalid}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}
```

**`CommentCard`** — add `canManage: boolean` and `onEdited`/`onDeleted`
callback props (or inline mutation calls, matching the page's existing
pattern of hooks called at the top level and passed down where needed — the
source doc leaves each card owning its own `isEditing` state, so
`CommentCard` itself calls `useUpdateWorkOrderComment`/
`useDeleteWorkOrderComment` internally, needing only `workOrderId` and
`comment` as props). Own `isEditing`/`isConfirmingDelete` state. Pencil icon
+ trash icon in the header row (next to the existing timestamp
`Typography`), shown only when `canManage`. Delete opens an MUI `Dialog`:
"This comment will be permanently removed from the work order. This cannot
be undone." Renders `<EditedMarker at={comment.editedAt} />` next to the
timestamp.

**`StatusHistoryCard`** / **`PriorityHistoryCard`** — same shape, pencil
only (no trash — history entries can never be deleted), `allowEmpty` passed
to `InlineEditForm` (clearing a note is the intended "remove" affordance).
`StatusHistoryCard`'s `canManage` additionally requires
`entry.fromStatus !== null` (the seed "created" row is never editable, even
by the reporter who authored it).

**Description `Paper`** — add a header `Box` (currently just a bare
`Typography`) with the title on the left and a pencil `IconButton` on the
right, shown only when `user?.id === workOrder.reportedBy.id`. Uses
`InlineEditForm` with `minLength={10}` (matching `UpdateDescriptionSchema`).
Renders `<EditedMarker at={workOrder.descriptionEditedAt} />` under the
description text.

All `canManage` checks are **display convenience only** — the backend
re-checks authorship on every request, per the source doc's explicit
constraint.

## Dependencies

None new. All MUI components used (`Dialog`, `IconButton`, icons) are
already imported/used elsewhere in this file or the project.

## Configuration changes

Schema + hand-written migration (above). No env vars, no MSAL/Graph scopes.

## Risks and mitigations

- **Risk:** authorship checked before the belongs-to-ticket / access checks,
  leaking whether a comment id exists on a ticket the caller can't see.
  **Mitigation:** `assertOwnComment` and the two history-notes methods run
  the three gates in the fixed order specified in step 4 — verified in the
  code above and re-checked explicitly in Phase 3 review.
- **Risk:** a valid comment/entry id from a different work order accepted
  through this ticket's URL. **Mitigation:** every method's first check is
  `row.ticketId !== ticketId → NotFoundError`.
- **Risk:** a machine-generated comment (`isSystem: true`) edited/deleted by
  its nominal author (the user who triggered the assignment/input-request
  action). **Mitigation:** `assertOwnComment` throws before the authorship
  check reaches a real user id, specifically for `isSystem` rows.
- **Risk:** the seed "Work order created" status entry rewritten by the
  reporter (who is also its `changedById`). **Mitigation:**
  `updateStatusHistoryNotes`'s `fromStatus === null` guard, checked before
  the authorship check.
- **Risk:** `descriptionEditedAt` not stamped when a description is changed
  through the pre-existing `updateWorkOrder` (level-3) endpoint, so the
  marker silently lies. **Mitigation:** step 4's addition to
  `updateWorkOrder`'s `data:` object, conditioned on the description
  actually changing.
- **Risk:** an admin (permLevel 5) bypasses `assertTicketAccess`
  unconditionally and is expected to then be rejected by the authorship
  check — if that rejection is accidentally skipped or short-circuited, the
  no-override guarantee silently breaks. **Mitigation:** explicit Phase 3
  review check that every method's authorship check runs unconditionally
  after `assertTicketAccess`, with no early return for high permission
  levels.
- **Risk:** `TicketComment.updatedAt` reused instead of the new `editedAt`
  as the "edited" signal. **Mitigation:** confirmed in step 1's schema that
  `editedAt` is a distinct new column; `updatedAt` is never read for this
  purpose in the service methods above.

## Build/test commands approved for Phase 3

- `docker compose -f docker-compose.dev.yml build backend`
- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate — also exercises the migration via
  `prisma migrate deploy` against a real, disposable test database, and runs
  the existing 47-test backend suite to confirm no regression)

FORBIDDEN COMMANDS check: no `prisma migrate dev`/`reset`, no `db push
--force-reset`, no sync scripts, no foreground `npm run dev` — none needed.

## Verification plan (Phase 3, in addition to build)

No automated tests are proposed for this flow — matching this repo's
existing pattern of not adding speculative test coverage, and Simplicity
First (write tests when asked, not proactively for every change). The
source doc's own repo added a 12-case test suite; this repo has none for
work orders' comment/history endpoints today and none is proposed here
unless requested. Manual verification (documented as still-needed in the
Phase 3 review, matching how items 1-4 in this session were verified):

1. Post a comment, edit it — text changes, `edited <date>` appears.
2. Delete it — confirm dialog, then it disappears entirely.
3. Log in as someone else — no pencil/trash icons on that comment.
4. As an admin, confirm still unable to edit/delete another user's comment.
5. Close a work order with an Actions Taken note, edit that note — text and
   marker change, status transition/timestamp unchanged, no delete control.
6. Confirm "Work order created" has no pencil, even for the reporter.
7. Confirm an assignment/input-request comment has no controls.
8. As the reporter, edit the description — changes, marker appears. As
   anyone else, confirm no pencil.

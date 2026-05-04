# Field Trip Approval — Stage Stepper & Resend/Send-Back Spec

**Date:** 2026-05-04  
**Scope:** `c:\Tech-V2` (backend + frontend)  
**Features:**
1. Approval Stage Stepper / Progress UI on `FieldTripDetailPage`
2. Resend & Send-Back Workflow (`NEEDS_REVISION` state)

---

## Research Findings

### Current Status Values
`FieldTripRequest.status` is a **plain string field** (not a Prisma enum). Defined in:
- `backend/src/validators/fieldTrip.validators.ts` → `FIELD_TRIP_STATUSES` const array
- `frontend/src/types/fieldTrip.types.ts` → `FieldTripStatus` union type

Current values:
```
DRAFT | PENDING_SUPERVISOR | PENDING_ASST_DIRECTOR |
PENDING_DIRECTOR | PENDING_FINANCE_DIRECTOR | APPROVED | DENIED
```

**`NEEDS_REVISION` does NOT exist** — must be added.  
**`RECALLED` does NOT exist** — not needed; spec uses `NEEDS_REVISION` exclusively.

### Approval Chain (ordered)
```
DRAFT
  → PENDING_SUPERVISOR       (perm level 3 — L3 supervisor; scoped to direct reports)
  → PENDING_ASST_DIRECTOR    (perm level 4 — L4 Asst. Director of Schools)
  → PENDING_DIRECTOR         (perm level 5 — L5 Director of Schools)
  → PENDING_FINANCE_DIRECTOR (perm level 6 — L6 Finance Director)
  → APPROVED
```
Skip rule: if submitter has no supervisor emails in snapshot → first stop is `PENDING_ASST_DIRECTOR`.

### FieldTripApproval.stage Values
`SUPERVISOR` | `ASST_DIRECTOR` | `DIRECTOR` | `FINANCE_DIRECTOR`

### PO Stepper Pattern (to replicate exactly)
Source: `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

Pattern:
- MUI `Stepper` component (`orientation="vertical"`) from `@mui/material`
- Imports: `Step`, `StepContent`, `StepLabel`, `Stepper`
- `WORKFLOW_STAGES` array: `{ status: string; label: string }[]` in order
- `activeStageIndex = WORKFLOW_STAGES.findIndex(s => s.status === current_status)`
- Each step uses `po.statusHistory?.find(h => h.toStatus === stage.status)` to get date/actor
- `completed` flag: `idx <= activeStageIndex`
- Denial state: renders `<Alert severity="error">` instead of stepper
- Placed inside a `<Paper sx={{ p: 3 }}>` titled "Status Timeline"

### Existing Edit Page
Route: `/field-trips/:id/edit` → `FieldTripRequestPage`  
Currently enforces `isReadOnly = existingTrip.status !== 'DRAFT'`.  
This guard must be expanded to also allow editing when `status === 'NEEDS_REVISION'`.

---

## Feature 1 — Approval Stage Stepper/Progress UI

### Goal
Replace the flat "Approval History" section on `FieldTripDetailPage` with a visual MUI vertical stepper that mirrors the `PurchaseOrderDetail` "Status Timeline" block.

### Component Design

#### Ordered Stage Definitions
```typescript
// Place at top of FieldTripDetailPage.tsx

const FIELD_TRIP_WORKFLOW_STAGES: { status: FieldTripStatus; label: string; stage: string }[] = [
  { status: 'DRAFT',                    label: 'Draft Created',                       stage: '' },
  { status: 'PENDING_SUPERVISOR',       label: 'Pending Supervisor Approval',         stage: 'SUPERVISOR' },
  { status: 'PENDING_ASST_DIRECTOR',    label: 'Pending Asst. Director Approval',     stage: 'ASST_DIRECTOR' },
  { status: 'PENDING_DIRECTOR',         label: 'Pending Director of Schools Approval', stage: 'DIRECTOR' },
  { status: 'PENDING_FINANCE_DIRECTOR', label: 'Pending Finance Director Approval',   stage: 'FINANCE_DIRECTOR' },
  { status: 'APPROVED',                 label: 'Approved',                            stage: '' },
];
```

#### Active Step Derivation
```typescript
const isDenied = trip.status === 'DENIED';
const isNeedsRevision = trip.status === 'NEEDS_REVISION';

const activeStageIndex = (isDenied || isNeedsRevision)
  ? -1
  : FIELD_TRIP_WORKFLOW_STAGES.findIndex(s => s.status === trip.status);
```

#### Step Content
For each step, look up a matching entry in `trip.statusHistory` (where `toStatus === stage.status`) to display:
- Timestamp: `changedAt`
- Actor: `changedByName`
- Notes (if any): `notes`

For each step with a matching `FieldTripApproval` record (match by `stage` field), additionally display:
- Approver name: `actedByName`
- Action: `APPROVED` chip (green) or `DENIED` chip (red)

#### Denial State
```tsx
{isDenied && (
  <Alert severity="error" sx={{ mt: 1 }}>
    This request was denied.{trip.denialReason ? ` Reason: ${trip.denialReason}` : ''}
  </Alert>
)}
```

#### NEEDS_REVISION State (see Feature 2)
```tsx
{isNeedsRevision && (
  <Alert severity="warning" sx={{ mt: 1 }}>
    Sent back for revision.{trip.revisionNote ? ` Reason: ${trip.revisionNote}` : ''}
  </Alert>
)}
```

### Placement in Detail Page
- **Remove** the existing "Approval History" `<Paper>` block (the flat `ApprovalRow` list)
- **Insert** a new `<Paper sx={{ p: 3, mb: 3 }}>` block titled "Approval Progress" **after** the "Submission Info" paper and **before** any dialogs
- The stepper replaces the approval history block entirely; the individual approval records are surfaced within each step's `StepContent`

### Backend Changes Needed
None. All data is already returned from `GET /api/field-trips/:id`:
- `trip.statusHistory[]` — ordered history entries with `toStatus`, `changedAt`, `changedByName`, `notes`
- `trip.approvals[]` — records with `stage`, `action`, `actedByName`, `actedAt`, `denialReason`, `notes`

### MUI Imports to Add to FieldTripDetailPage
```typescript
import {
  Step,
  StepContent,
  StepLabel,
  Stepper,
} from '@mui/material';
```

---

## Feature 2 — Resend & Send-Back Workflow

### Overview
- Any current-stage approver can **send back** a trip for revision instead of hard-denying it
- The trip enters `NEEDS_REVISION` state; the submitter sees a reason and can edit+resubmit
- Resubmission restarts the full approval chain from `PENDING_SUPERVISOR` (or `PENDING_ASST_DIRECTOR` if no supervisor snapshot)
- This is **not** a DENIED state — the trip remains alive and editable

---

### 2A. Schema Changes

#### File: `backend/prisma/schema.prisma` → `FieldTripRequest` model

Add the following two fields inside `FieldTripRequest`, in the "Workflow State" block (after `denialReason`):

```prisma
  revisionNote          String?                 @db.Text   // Reason set by approver when sending back
  submissionCount       Int                     @default(0) // Increments on each resubmit
```

#### Prisma Migration Required
After schema edit, run:
```bash
npx prisma migrate dev --name add_field_trip_revision_fields
```

Migration will add two nullable/default columns — **non-breaking**, no data loss.

#### No Enum Change Required
Because `status` is a plain `String` column, adding `NEEDS_REVISION` only requires updating:
1. The `FIELD_TRIP_STATUSES` const array in `backend/src/validators/fieldTrip.validators.ts`
2. The `FieldTripStatus` union type in `frontend/src/types/fieldTrip.types.ts`

---

### 2B. Backend — New Validators

#### File: `backend/src/validators/fieldTrip.validators.ts`

Add `NEEDS_REVISION` to `FIELD_TRIP_STATUSES`:
```typescript
export const FIELD_TRIP_STATUSES = [
  'DRAFT',
  'PENDING_SUPERVISOR',
  'PENDING_ASST_DIRECTOR',
  'PENDING_DIRECTOR',
  'PENDING_FINANCE_DIRECTOR',
  'APPROVED',
  'DENIED',
  'NEEDS_REVISION',   // ← new
] as const;
```

Add new Zod schemas at end of file:
```typescript
// POST /field-trips/:id/send-back
export const SendBackTripSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason must be 1000 characters or less'),
  notes: z.string().max(500).optional(),
});
export type SendBackTripDto = z.infer<typeof SendBackTripSchema>;

// POST /field-trips/:id/resubmit  (no body required — uses existing data)
export const ResubmitTripSchema = z.object({}).strict();
export type ResubmitTripDto = z.infer<typeof ResubmitTripSchema>;
```

---

### 2C. Backend — Service Methods

#### File: `backend/src/services/fieldTrip.service.ts`

Add two new methods to `FieldTripService` class:

---

**`sendBack(userId, id, permLevel, reason, notes?)`**

Logic:
1. `findOrThrow(id)` → must be in a `PENDING_*` status
2. Verify `permLevel >= STAGE_MIN_LEVEL[trip.status]` — only the current-stage approver may send back
3. Resolve sender display name from `prisma.user.findUnique`
4. In a `prisma.$transaction`:
   - Create `FieldTripApproval` record: `stage = STATUS_TO_STAGE[trip.status]`, `action = 'SENT_BACK'`
   - Update `FieldTripRequest`:
     - `status = 'NEEDS_REVISION'`
     - `revisionNote = reason`
     - Clear existing approvals: **do not delete** (history preserved), but clear `approvals` via `FieldTripApproval` delete where `fieldTripRequestId = id` (wipe all previous approvals so the resubmitted trip starts fresh at L3)
     - `approvedAt = null`
   - Create `FieldTripStatusHistory` entry: `fromStatus = trip.status`, `toStatus = 'NEEDS_REVISION'`, `notes = reason`
5. Return updated trip (include `TRIP_WITH_RELATIONS`)

> **Note on approval deletion:** Clearing approvals ensures the stepper shows a clean slate after resubmit. Consider soft-deleting or marking them as "pre-revision" vs "post-revision" for audit purposes. Recommended approach: preserve existing approvals but tag them with a `revisionRound` counter derived from `submissionCount`.

**Revised approach — preserve audit trail with rounds:**
Instead of deleting, add a `SENT_BACK` action value to the vocabulary. Since `FieldTripApproval.action` is a plain string, simply use `'SENT_BACK'`. The stepper can filter `approvals` to the **latest submission round** by comparing `actedAt >= trip.submittedAt` (the last resubmit timestamp).

---

**`resubmit(userId, id, submitterName, snapshot)`**

Logic:
1. `findOrThrow(id)` → must be `NEEDS_REVISION`
2. `trip.submittedById !== userId` → throw `AuthorizationError`
3. Determine `firstStatus` from snapshot (same logic as `submit()`)
4. In `prisma.$transaction`:
   - Update `FieldTripRequest`:
     - `status = firstStatus`
     - `submittedAt = new Date()` (reset submission timestamp — used as round boundary)
     - `submissionCount = trip.submissionCount + 1`
     - `revisionNote = null` (clear after resubmit so UI doesn't keep showing old banner)
     - `approverEmailsSnapshot = snapshot` (rebuild fresh snapshot)
   - Create `FieldTripStatusHistory` entry: `fromStatus = 'NEEDS_REVISION'`, `toStatus = firstStatus`, `notes = 'Resubmitted by submitter'`
5. Return updated trip

---

### 2D. Backend — Controller

#### File: `backend/src/controllers/fieldTrip.controller.ts`

Add to imports:
```typescript
import {
  SendBackTripSchema,
  ResubmitTripSchema,
} from '../validators/fieldTrip.validators';
import {
  sendFieldTripSentBack,      // new email function
  sendFieldTripResubmitted,   // new email function (optional)
} from '../services/email.service';
```

---

**`POST /api/field-trips/:id/send-back` controller handler:**

```typescript
export const sendBack = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data      = SendBackTripSchema.parse(req.body);
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;
    const id        = req.params.id as string;

    const { updated, senderName } = await fieldTripService.sendBack(
      userId, id, permLevel, data.reason, data.notes,
    );

    // Notify submitter (non-critical)
    try {
      await sendFieldTripSentBack(updated.submitterEmail, updated, senderName, data.reason);
    } catch (emailErr) {
      logger.error('Failed to send field trip send-back email', {
        id,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    res.json(updated);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

**`POST /api/field-trips/:id/resubmit` controller handler:**

Follows the same pattern as `submit` — rebuilds approver snapshot via `buildFieldTripApproverSnapshot` before calling service. If Graph is unreachable, returns 503 early (same guard as `submit`).

```typescript
export const resubmit = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId        = req.user!.id;
  const submitterName = req.user!.name;
  const id            = req.params.id as string;

  // Rebuild approver snapshot — abort if Graph unavailable
  let snapshot: FieldTripApproverSnapshot;
  try {
    snapshot = await buildFieldTripApproverSnapshot(userId);
  } catch {
    res.status(503).json({
      error:   'SERVICE_UNAVAILABLE',
      message: 'Unable to resolve approver emails. Please try again in a few minutes.',
    });
    return;
  }

  try {
    const result = await fieldTripService.resubmit(userId, id, submitterName, snapshot);

    // Send supervisor notification (non-critical)
    try {
      if (result.status === 'PENDING_SUPERVISOR' && snapshot.supervisorEmails.length > 0) {
        await sendFieldTripToSupervisor(snapshot.supervisorEmails, result, submitterName);
      } else if (result.status === 'PENDING_ASST_DIRECTOR' && snapshot.asstDirectorEmails.length > 0) {
        await sendFieldTripAdvancedToApprover(
          snapshot.asstDirectorEmails,
          result,
          submitterName,
          getStageName('PENDING_ASST_DIRECTOR'),
        );
      }
    } catch (emailErr) {
      logger.error('Failed to send field trip resubmit email', {
        id,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

### 2E. Backend — Routes

#### File: `backend/src/routes/fieldTrip.routes.ts`

Add to imports:
```typescript
import {
  SendBackTripSchema,
  FieldTripIdParamSchema,
} from '../validators/fieldTrip.validators';
```

Add new route handlers (after the existing `/deny` route):
```typescript
/**
 * POST /api/field-trips/:id/send-back
 * Current-stage approver sends back for revision (NEEDS_REVISION).
 * Minimum level 3 required; service validates exact level for the current stage.
 */
router.post(
  '/:id/send-back',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(SendBackTripSchema, 'body'),
  requireModule('FIELD_TRIPS', 3),
  fieldTripController.sendBack,
);

/**
 * POST /api/field-trips/:id/resubmit
 * Submitter resubmits a NEEDS_REVISION request. Restarts approval chain from L3.
 * Minimum level 2 (all staff with field trips access).
 */
router.post(
  '/:id/resubmit',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.resubmit,
);
```

---

### 2F. Email Service

#### File: `backend/src/services/email.service.ts`

Add two new email functions (follow existing `sendFieldTripDenied` pattern):

**`sendFieldTripSentBack(submitterEmail, trip, senderName, reason)`**
- To: submitter email
- Subject: `[Field Trip] Sent Back for Revision — {destination}`
- Body: Inform submitter their trip was sent back, include reason, include link to edit page

**`sendFieldTripResubmitted(approverEmails, trip, submitterName)`** *(optional/low priority)*
- To: supervisor (same audience as initial submit)
- Subject: `[Field Trip] Resubmitted — {destination}`
- Informs approvers that a revised trip is ready for review

---

### 2G. Frontend — Type Updates

#### File: `frontend/src/types/fieldTrip.types.ts`

```typescript
// Add NEEDS_REVISION to the union
export type FieldTripStatus =
  | 'DRAFT'
  | 'PENDING_SUPERVISOR'
  | 'PENDING_ASST_DIRECTOR'
  | 'PENDING_DIRECTOR'
  | 'PENDING_FINANCE_DIRECTOR'
  | 'APPROVED'
  | 'DENIED'
  | 'NEEDS_REVISION';   // ← new

// Add new fields to FieldTripRequest interface
revisionNote?:    string | null;   // ← new
submissionCount?: number;          // ← new

// Add to FIELD_TRIP_STATUS_LABELS
NEEDS_REVISION: 'Needs Revision',

// Add to FIELD_TRIP_STATUS_COLORS
NEEDS_REVISION: 'warning',

// Add new DTOs
export interface SendBackTripDto {
  reason: string;
  notes?: string;
}
```

---

### 2H. Frontend — API Service

#### File: `frontend/src/services/fieldTrip.service.ts`

Add two new service methods:

```typescript
sendBack: async (id: string, data: SendBackTripDto): Promise<FieldTripRequest> => {
  const res = await api.post<FieldTripRequest>(`${BASE}/${id}/send-back`, data);
  return res.data;
},

resubmit: async (id: string): Promise<FieldTripRequest> => {
  const res = await api.post<FieldTripRequest>(`${BASE}/${id}/resubmit`, {});
  return res.data;
},
```

---

### 2I. Frontend — FieldTripDetailPage Changes

#### File: `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`

**1. New state variables:**
```typescript
const [sendBackDialogOpen, setSendBackDialogOpen]     = useState(false);
const [sendBackReason, setSendBackReason]             = useState('');
```

**2. New mutations:**
```typescript
const sendBackMutation = useMutation({
  mutationFn: ({ id, reason }: { id: string; reason: string }) =>
    fieldTripService.sendBack(id, { reason }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['field-trips', id] });
    queryClient.invalidateQueries({ queryKey: ['field-trips', 'pending-approvals'] });
    setSendBackDialogOpen(false);
    setSendBackReason('');
    setActionError(null);
  },
  onError: (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Failed to send back';
    setActionError(msg);
  },
});

const resubmitMutation = useMutation({
  mutationFn: (id: string) => fieldTripService.resubmit(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['field-trips', id] });
    setActionError(null);
  },
  onError: (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Failed to resubmit';
    setActionError(msg);
  },
});
```

**3. Permission-gated button visibility:**

```typescript
// Existing isPending check
const isPending         = PENDING_STATUSES.has(trip.status);
const isOwner           = trip.submittedById === user?.id;
const isNeedsRevision   = trip.status === 'NEEDS_REVISION';

// Approver can send back (and NOT be the owner)
const canSendBack    = isPending && !isOwner;   // same gate as approve/deny

// Only submitter can resubmit when NEEDS_REVISION
const canResubmit    = isNeedsRevision && isOwner;
```

**4. NEEDS_REVISION banner — insert after existing denial banner:**
```tsx
{isNeedsRevision && (
  <Alert severity="warning" sx={{ mb: 3 }}>
    <Typography variant="subtitle2" gutterBottom>Sent Back for Revision</Typography>
    {trip.revisionNote && (
      <Typography variant="body2">{trip.revisionNote}</Typography>
    )}
  </Alert>
)}
```

**5. "Send Back for Revision" button — add inside the actions Paper alongside Approve/Deny:**
```tsx
{canSendBack && (
  <Button
    variant="outlined"
    color="warning"
    startIcon={<UndoIcon />}
    onClick={() => setSendBackDialogOpen(true)}
  >
    Send Back for Revision
  </Button>
)}
```

**6. "Resubmit" button — show for submitter when NEEDS_REVISION:**
```tsx
{canResubmit && (
  <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.lighter' }}>
    <Typography variant="subtitle2" gutterBottom>Action Required</Typography>
    <Typography variant="body2" sx={{ mb: 1.5 }}>
      This request has been sent back for revision. Please edit and resubmit when ready.
    </Typography>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button
        variant="outlined"
        startIcon={<EditIcon />}
        onClick={() => navigate(`/field-trips/${trip.id}/edit`)}
      >
        Edit Request
      </Button>
      <Button
        variant="contained"
        color="warning"
        onClick={() => resubmitMutation.mutate(trip.id)}
        disabled={resubmitMutation.isPending}
      >
        {resubmitMutation.isPending ? <CircularProgress size={20} /> : 'Resubmit for Approval'}
      </Button>
    </Box>
  </Paper>
)}
```

**7. Send Back dialog:**
```tsx
<Dialog open={sendBackDialogOpen} onClose={() => setSendBackDialogOpen(false)} maxWidth="sm" fullWidth>
  <DialogTitle>Send Back for Revision</DialogTitle>
  <DialogContent>
    <Typography variant="body2" color="text.secondary" gutterBottom>
      This will return the request to the submitter for modifications. Provide a reason.
    </Typography>
    <TextField
      fullWidth multiline minRows={3}
      label="Reason for Revision"
      value={sendBackReason}
      onChange={(e) => setSendBackReason(e.target.value)}
      sx={{ mt: 2 }}
      required
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setSendBackDialogOpen(false)}>Cancel</Button>
    <Button
      variant="contained" color="warning"
      onClick={() => {
        if (!sendBackReason.trim()) return;
        sendBackMutation.mutate({ id: trip.id, reason: sendBackReason.trim() });
      }}
      disabled={sendBackMutation.isPending || !sendBackReason.trim()}
    >
      {sendBackMutation.isPending ? <CircularProgress size={20} /> : 'Send Back'}
    </Button>
  </DialogActions>
</Dialog>
```

**8. New MUI icon import:**
```typescript
import UndoIcon from '@mui/icons-material/Undo';
```

---

### 2J. Frontend — FieldTripRequestPage (Edit Page)

#### File: `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`

Currently:
```typescript
const isReadOnly = existingTrip && existingTrip.status !== 'DRAFT';
```

Change to:
```typescript
const isReadOnly = existingTrip &&
  existingTrip.status !== 'DRAFT' &&
  existingTrip.status !== 'NEEDS_REVISION';
```

The "Submit for Approval" button at the final step should use the existing `submit` flow unchanged — the backend's `resubmit` endpoint is only used from the detail page "Resubmit" button, which fires after the submitter has navigated to the edit page, made changes (saved as draft-equivalent via `update`), then returned to the detail page.

> **Important UX Decision:** Two resubmission paths exist:
> - **Edit then resubmit:** Navigate to edit page → save changes → return to detail page → click "Resubmit for Approval"
> - **Resubmit as-is:** Click "Resubmit for Approval" directly from the detail page (no edits needed)
>
> Both call `POST /api/field-trips/:id/resubmit`. The edit step only calls `PUT /api/field-trips/:id` to persist changes; the actual status transition is triggered by the explicit resubmit action.

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| `send-back` by non-authorized user | Service checks `permLevel >= STAGE_MIN_LEVEL[trip.status]` — only current-stage approver level can act |
| Submitter sending back their own trip | `!isOwner` gate on frontend; backend's `STAGE_MIN_LEVEL` check (perm ≥ 3) prevents level-2 submitters |
| `resubmit` by non-submitter | Service checks `trip.submittedById !== userId` → throws `AuthorizationError` |
| Resubmitting a non-`NEEDS_REVISION` trip | Service checks `trip.status !== 'NEEDS_REVISION'` → throws `ValidationError` |
| Sending back a non-pending trip | Service checks `!STAGE_MIN_LEVEL[trip.status]` → throws `ValidationError` |
| Input injection via `reason` field | Zod schema: `min(10).max(1000)` string validation |
| CSRF | Covered by existing `validateCsrfToken` router middleware (applies to all POST routes) |
| Auth | Both routes sit behind `authenticate` middleware (existing router-level `router.use(authenticate)`) |

---

## Summary of All File Changes

### Backend
| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `revisionNote String? @db.Text` and `submissionCount Int @default(0)` to `FieldTripRequest` |
| `backend/prisma/migrations/` | New migration: `add_field_trip_revision_fields` |
| `backend/src/validators/fieldTrip.validators.ts` | Add `NEEDS_REVISION` to `FIELD_TRIP_STATUSES`; add `SendBackTripSchema`, `ResubmitTripSchema` |
| `backend/src/services/fieldTrip.service.ts` | Add `sendBack()` and `resubmit()` methods to `FieldTripService` class |
| `backend/src/controllers/fieldTrip.controller.ts` | Add `sendBack` and `resubmit` controller functions |
| `backend/src/routes/fieldTrip.routes.ts` | Register `POST /:id/send-back` and `POST /:id/resubmit` routes |
| `backend/src/services/email.service.ts` | Add `sendFieldTripSentBack()` function |

### Frontend
| File | Change |
|---|---|
| `frontend/src/types/fieldTrip.types.ts` | Add `NEEDS_REVISION` to `FieldTripStatus`; add `revisionNote?`, `submissionCount?` to `FieldTripRequest`; add `NEEDS_REVISION` label/color; add `SendBackTripDto` |
| `frontend/src/services/fieldTrip.service.ts` | Add `sendBack()` and `resubmit()` methods |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | Replace flat approval history with MUI Stepper; add send-back button/dialog; add resubmit button; add NEEDS_REVISION banner |
| `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx` | Allow edit when `status === 'NEEDS_REVISION'` |

---

## Open Questions / Decisions for Implementer

1. **Approval record preservation on send-back:** Spec recommends keeping approval records and using `submittedAt` as a round boundary for filtering in the stepper. Confirm this vs. deleting pre-revision approvals.
2. **`FieldTripApproval.action` vocabulary:** Adding `'SENT_BACK'` as a new action string (alongside `'APPROVED'` and `'DENIED'`). Verify downstream consumers (PDF generator, email templates) handle this gracefully.
3. **Skip-supervisor logic on resubmit:** Should `resubmit` always use the fresh snapshot from Graph, or fall back to the existing `approverEmailsSnapshot` if Graph is temporarily unavailable? Current spec rebuilds from Graph (same as `submit`).
4. **Transportation sub-request on resubmit:** If a transportation request was already submitted (`SUBMITTED` or `PENDING_TRANSPORTATION`), should it also be reset? Recommend: leave transportation sub-request status untouched on resubmit — it is a separate workflow.

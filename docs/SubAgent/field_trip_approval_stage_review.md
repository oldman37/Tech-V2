# Field Trip Approval Stage Stepper & Send-Back/Resubmit — Code Review

**Date:** 2026-05-04  
**Reviewer:** Subagent #3 (QA)  
**Spec Reference:** `docs/SubAgent/field_trip_approval_stage_spec.md`  
**Result:** ✅ **PASS**  
**Overall Grade:** A (93/100)

---

## Build Validation

| Target | Command | Result |
|--------|---------|--------|
| Backend | `cd c:\Tech-V2\backend ; npx tsc --noEmit` | ✅ **0 errors** |
| Frontend | `cd c:\Tech-V2\frontend ; npx tsc --noEmit` | ✅ **0 errors** |

Both builds are clean. No TypeScript errors.

---

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 91/100 | A- |
| Best Practices | 92/100 | A- |
| Functionality | 96/100 | A |
| Code Quality | 90/100 | A- |
| Security | 97/100 | A+ |
| Performance | 91/100 | A- |
| Consistency | 95/100 | A |
| Build Success | 100/100 | A+ |
| **Overall** | **93/100** | **A** |

---

## Security Checklist

| Item | Status | Notes |
|------|--------|-------|
| `authenticate` on both new routes | ✅ | `router.use(authenticate)` at line 41 of `fieldTrip.routes.ts` — applies to ALL routes on the router |
| `send-back`: only current-stage approver | ✅ | Service checks `permLevel < STAGE_MIN_LEVEL[trip.status]` → throws `AuthorizationError` |
| `resubmit`: only original submitter | ✅ | Service checks `trip.submittedById !== userId` → throws `AuthorizationError` |
| Zod validation on `reason` (min 10 chars) | ✅ | `SendBackTripSchema`: `reason: z.string().min(10).max(1000)` |
| No `console.log` — structured logger only | ✅ | All logging via `logger.info` / `logger.error` (pino) |
| Custom error classes | ✅ | `NotFoundError`, `ValidationError`, `AuthorizationError` used in service layer |
| No untyped `any` | ✅ | No `any` types found in new code |
| Error messages sanitized for client | ✅ | `handleControllerError` mediates all service errors; email errors logged not exposed |

---

## File-by-File Review

### 1. `backend/prisma/schema.prisma`
**Status: ✅ PASS**

- `revisionNote String? @db.Text` — present ✅
- `submissionCount Int @default(0)` — present ✅
- Placed correctly in the "Workflow State" block after `denialReason` ✅
- Migration `20260504182341_add_field_trip_revision_fields` exists with correct SQL:
  ```sql
  ALTER TABLE "field_trip_requests" ADD COLUMN "revisionNote" TEXT,
  ADD COLUMN "submissionCount" INTEGER NOT NULL DEFAULT 0;
  ```
  Non-breaking, backward-compatible migration ✅

---

### 2. `backend/src/validators/fieldTrip.validators.ts`
**Status: ✅ PASS**

- `NEEDS_REVISION` added to `FIELD_TRIP_STATUSES` const array ✅
- `SendBackTripSchema` with `reason: z.string().min(10).max(1000)` + optional `notes` ✅
- `ResubmitTripSchema` exported as `z.object({}).strict()` ✅
- TypeScript types exported via `z.infer<>` ✅

---

### 3. `backend/src/services/fieldTrip.service.ts`
**Status: ✅ PASS**

**`sendBack(userId, id, permLevel, reason, notes?)`**
- `STAGE_MIN_LEVEL` lookup guards against non-pending states → `ValidationError` ✅
- Permission level check `permLevel < minLevel` → `AuthorizationError` ✅
- `prisma.$transaction` wraps: `FieldTripApproval` create (action=`SENT_BACK`), `FieldTripRequest` update (status=`NEEDS_REVISION`, `revisionNote=reason`, `approvedAt=null`), `FieldTripStatusHistory` create ✅
- Returns `{ updated, senderName }` ✅

**`resubmit(userId, id, submitterName, snapshot)`**
- Status guard: `NEEDS_REVISION` only → `ValidationError` ✅
- Submitter ownership check → `AuthorizationError` ✅
- `submissionCount: { increment: 1 }` ✅
- `revisionNote: null` cleared on resubmit ✅
- `submittedAt: new Date()` reset as round boundary ✅
- Approval history **preserved** (audit trail intact) — correct per spec recommendation ✅
- Returns updated trip ✅

**Minor Observation:**
- The `FieldTripApproval` record for `SENT_BACK` stores the revision reason in `denialReason` (line ~451). This field was semantically designed for `DENIED` actions. Functionally works, but the field name is misleading for this action. The spec explicitly endorses this approach; noted for future schema refinement.

---

### 4. `backend/src/controllers/fieldTrip.controller.ts`
**Status: ✅ PASS**

- `sendBack` handler: re-parses `SendBackTripSchema.parse(req.body)` at line 282 — this is redundant since route middleware already validated; however it matches the exact same pattern used in `approve` (line 194) and `deny` (line 251), so it is **consistent** with the codebase convention ✅
- `resubmit` handler: snapshot rebuild in a separate try/catch with 503 guard matches the `submit` controller pattern exactly ✅
- `req.user!.name` confirmed valid — `AuthRequest.user.name: string` defined in `auth.ts` ✅
- Email sends wrapped in non-blocking try/catch with `logger.error` on failure ✅
- `handleControllerError(error, res)` used in all catch blocks ✅

---

### 5. `backend/src/routes/fieldTrip.routes.ts`
**Status: ✅ PASS**

```
POST /:id/send-back  → validateRequest(params) → validateRequest(body) → requireModule('FIELD_TRIPS', 3) → sendBack
POST /:id/resubmit   → validateRequest(params) → requireModule('FIELD_TRIPS', 2) → resubmit
```

- Router-level `router.use(authenticate)` at line 41 covers both routes ✅
- `send-back` correctly requires level 3 (supervisor tier) ✅
- `resubmit` correctly requires level 2 (all staff with field trips access) ✅
- Both param schemas use `FieldTripIdParamSchema` (UUID validation) ✅

---

### 6. `frontend/src/types/fieldTrip.types.ts`
**Status: ✅ PASS**

- `NEEDS_REVISION` in `FieldTripStatus` union ✅
- `revisionNote?: string | null` on `FieldTripRequest` ✅
- `submissionCount?: number` on `FieldTripRequest` ✅
- `FIELD_TRIP_STATUS_LABELS.NEEDS_REVISION = 'Needs Revision'` ✅
- `FIELD_TRIP_STATUS_COLORS.NEEDS_REVISION = 'warning'` ✅
- `SendBackTripDto` interface exported ✅

---

### 7. `frontend/src/services/fieldTrip.service.ts`
**Status: ✅ PASS**

- `sendBack(id, data)` → `POST /field-trips/:id/send-back` ✅
- `resubmit(id)` → `POST /field-trips/:id/resubmit` with empty body ✅
- Follows existing object-literal service pattern ✅
- Types from `fieldTrip.types.ts` used correctly ✅

---

### 8. `frontend/src/components/fieldtrip/FieldTripApprovalStepper.tsx`
**Status: ✅ PASS**

- Correct 6-step `FIELD_TRIP_WORKFLOW_STAGES` array (DRAFT → PENDING_SUPERVISOR → PENDING_ASST_DIRECTOR → PENDING_DIRECTOR → PENDING_FINANCE_DIRECTOR → APPROVED) ✅
- `activeStageIndex = -1` when `isDenied || isNeedsRevision` ✅
- `completed = idx <= activeStageIndex` ✅
- `DENIED`: renders `<Alert severity="error">` with `denialReason` ✅
- `NEEDS_REVISION`: renders `<Alert severity="warning">` with `revisionNote` ✅
- `StepContent` displays `changedAt`, `changedByName`, `notes` from `statusHistory` ✅
- `APPROVED` chip (green) shown when matching approval record found ✅
- Replicates PurchaseOrderDetail pattern ✅

**Issue #1 — Duplicate NEEDS_REVISION Banner (MEDIUM)**  
File: `FieldTripDetailPage.tsx` (~line 285) + `FieldTripApprovalStepper.tsx` (~line 88)  
Both the detail page and the stepper render an identical amber "Sent Back for Revision" `Alert`. When `isNeedsRevision`, the page renders the warning banner AND then immediately below renders the `<FieldTripApprovalStepper>` which also renders the same banner. The user sees **two** amber alerts.

**Recommended fix:** Remove the standalone `Alert` from `FieldTripDetailPage.tsx` (the `{isNeedsRevision && <Alert severity="warning">...` block at ~line 285) and rely solely on the stepper to render it, since the stepper already displays the `revisionNote` in its alert with the same information.

---

### 9. `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`
**Status: ✅ PASS with minor issues**

- `sendBackDialogOpen` / `sendBackReason` state ✅
- `resubmitDialogOpen` state declared and used ✅
- `sendBackMutation` with `onSuccess` invalidating both relevant query keys ✅
- `resubmitMutation` with confirm dialog ✅
- `canSendBack = isPending && !isOwner` ✅
- `canResubmit = isNeedsRevision && isOwner` ✅
- Send Back dialog: min-length guard in UI (`sendBackReason.trim().length < 10`) matches backend Zod validation ✅
- `inputProps={{ maxLength: 1000 }}` on send-back TextField matches backend max ✅
- "Edit & Revise" button visible in header when `isNeedsRevision && isOwner` ✅
- Resubmit confirm dialog before mutation ✅

**Issue #2 — `UndoIcon` missing on Send Back button (MINOR)**  
File: `FieldTripDetailPage.tsx` (~line 267)  
The spec requires `startIcon={<UndoIcon />}` on the Send Back button (and recommends `import UndoIcon from '@mui/icons-material/Undo'`). The implementation omits the icon. The button is functional; this is purely cosmetic.

**Issue #3 — `showActionButtons` and `canSendBack` are identical (MINOR)**  
File: `FieldTripDetailPage.tsx` (~line 170–171)  
```typescript
const showActionButtons = isPending && !isOwner;  // line 170
const canSendBack       = isPending && !isOwner;  // line 171
```
Both constants evaluate the same expression. The `canSendBack` check is nested inside `{showActionButtons && ...}`, making it always true inside that block. No bug, but one variable is redundant. Consolidate or document intent.

---

### 10. `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx`
**Status: ✅ PASS**

```typescript
// line 566
const isReadOnly = existingTrip && existingTrip.status !== 'DRAFT' && existingTrip.status !== 'NEEDS_REVISION';
```

- Edit guard correctly unlocked for `NEEDS_REVISION` ✅
- Spec implementation matches exactly ✅
- All form fields respect `isReadOnly` ✅

---

## All Issues Summary

| # | Severity | File | Location | Description |
|---|----------|------|----------|-------------|
| 1 | **MEDIUM** | `FieldTripDetailPage.tsx` | ~L285 | Duplicate NEEDS_REVISION amber alert — page AND stepper both render it |
| 2 | MINOR | `FieldTripDetailPage.tsx` | ~L267 | `UndoIcon` missing on Send Back button (spec-required icon) |
| 3 | MINOR | `FieldTripDetailPage.tsx` | L170–171 | `showActionButtons` and `canSendBack` are identical expressions — one is redundant |
| 4 | INFO | `fieldTrip.controller.ts` | L282 | Secondary `SendBackTripSchema.parse()` call after middleware validation — harmless, consistent with existing `approve`/`deny` pattern |
| 5 | INFO | `fieldTrip.service.ts` | ~L451 | `FieldTripApproval.denialReason` field reused for `SENT_BACK` reason — semantically misleading but spec-endorsed |
| 6 | INFO | `email.service.ts` | — | `sendFieldTripResubmitted()` not implemented — marked optional in spec, acceptable omission |

---

## Completeness Checklist

| Spec Requirement | Status |
|-----------------|--------|
| 6-step stepper with correct statuses | ✅ |
| NEEDS_REVISION amber alert with revisionNote | ✅ (minor: duplicated on detail page) |
| DENIED red alert | ✅ |
| Send Back dialog with reason text field | ✅ |
| Resubmit confirm dialog | ✅ |
| Edit page allows editing when NEEDS_REVISION | ✅ |
| Prisma migration in place | ✅ |
| `revisionNote` + `submissionCount` in schema | ✅ |
| `NEEDS_REVISION` in status constants/types (backend + frontend) | ✅ |
| `sendBack()` permission check (current-stage approver only) | ✅ |
| `resubmit()` ownership check (submitter only) | ✅ |
| Zod min(10) validation on reason | ✅ |
| Buttons only visible to correct users | ✅ |
| Email notification on send-back | ✅ |
| TypeScript clean build (backend + frontend) | ✅ |

---

## Recommended Fixes (Prioritized)

### Fix 1 — Remove duplicate NEEDS_REVISION banner (MEDIUM)
**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx`  
Remove the standalone banner block (~line 285–291):
```tsx
{/* NEEDS_REVISION banner — REMOVE this block; stepper renders it */}
{isNeedsRevision && (
  <Alert severity="warning" sx={{ mb: 3 }}>
    <Typography variant="subtitle2" gutterBottom>Sent Back for Revision</Typography>
    {trip.revisionNote && (
      <Typography variant="body2">{trip.revisionNote}</Typography>
    )}
  </Alert>
)}
```

### Fix 2 — Add `UndoIcon` to Send Back button (MINOR)
**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx`  
Add import and `startIcon`:
```typescript
import UndoIcon from '@mui/icons-material/Undo';
```
```tsx
<Button variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={...}>
  Send Back for Revision
</Button>
```

### Fix 3 — Consolidate redundant constants (MINOR)
**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx`  
Remove `canSendBack`; use `showActionButtons` inside the actions block directly.

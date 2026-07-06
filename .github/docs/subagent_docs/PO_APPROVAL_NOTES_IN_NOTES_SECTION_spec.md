# PO Approval Notes Shown in Notes Section — Specification

## Current State Analysis

`frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` already has full end-to-end support for approval-stage notes — this is not net-new functionality, just a display gap:

- **Approve dialog** (lines 137-138, ~824-864 render) already captures an optional free-text `approveNotes` and sends it via `handleApprove` (lines 322-340) to `POST /:id/approve`.
- **Backend** (`backend/src/controllers/purchaseOrder.controller.ts:217-224`, `backend/src/services/purchaseOrder.service.ts` `approvePurchaseOrder`) validates it via `ApproveSchema.notes` (`backend/src/validators/purchaseOrder.validators.ts:102-110`, max 1000 chars, optional) and persists it as a row in `RequisitionStatusHistory` (`backend/prisma/schema.prisma:346-362`) keyed by `toStatus` — one row per stage transition (`submitted→supervisor_approved`, `supervisor_approved→finance_director_approved`, `*→dos_approved`), with `changedById`/`changedAt`.
- **`getPurchaseOrderById`** (`purchaseOrder.service.ts:504-532`) already includes the full `statusHistory` array (with `changedBy` name) in the single-PO GET response — no backend change needed.
- **Status Timeline** (`PurchaseOrderDetail.tsx:597-654`) already renders each stage's `historyEntry.notes` italicized under that stage's `StepContent` (lines 621-646), including a legacy substitution for old auto-generated "locationId:" routing notes.
- **The one gap**: the general **Notes** block (`PurchaseOrderDetail.tsx:539-545`) only renders `po.notes` — the requisitioner's free-text field captured at PO creation (`CreatePurchaseOrderSchema.notes`, shared schema, max 2000 chars). It does not also surface the approver-authored notes that are already sitting in `po.statusHistory`.

Confirmed distinct data source: the auto-generated submit-time routing note (`"Routed to supervisor: X"` / `"Routed to location supervisor"`, set in `purchaseOrder.service.ts:963-967`) is stored on the **`submitted`** transition, not on an approval stage — so filtering to only `supervisor_approved` / `finance_director_approved` / `dos_approved` naturally excludes it and shows only genuine approver-typed commentary.

## Problem Definition

When a supervisor (or Finance Director / Director of Schools) approves a PO and adds an optional note, that note is currently visible only in the Status Timeline (per-stage, inside the vertical stepper). Add the same approval notes to the Notes section of the PO detail page, so they're visible in both places.

## Proposed Solution Architecture

Frontend-only change, `PurchaseOrderDetail.tsx`. No backend or shared-schema changes — `po.statusHistory` (typed via `PurchaseOrderStatusHistory` in `frontend/src/types/purchaseOrder.types.ts:114-128`) is already fetched and already on the `po` object used by this page.

1. **Derive the list of approval notes** as a plain `const` near the existing `activeStageIndex` computation (`PurchaseOrderDetail.tsx:372-376`, same un-memoized style already used throughout this component body):
   ```ts
   const APPROVAL_NOTE_STATUSES: POStatus[] = ['supervisor_approved', 'finance_director_approved', 'dos_approved'];
   const approvalNoteEntries = (po.statusHistory ?? [])
     .filter((h) => APPROVAL_NOTE_STATUSES.includes(h.toStatus as POStatus) && !!h.notes)
     .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
   ```
   Sorting ascending by `changedAt` matches the chronological top-to-bottom order the Status Timeline already presents (statusHistory itself arrives newest-first per the backend `orderBy: { changedAt: 'desc' }`).

2. **Render a new "Approval Notes" block** in the Notes section, right after the existing `po.notes` block and before `po.denialReason` (`PurchaseOrderDetail.tsx:539-555`), reusing `WORKFLOW_STAGES` (already computed per-workflow-variant at line 178-184) to get the correct human label for each stage (so food-service/route-to-FD/FD-skip variants show the right approver title, consistent with the Timeline):
   ```tsx
   {approvalNoteEntries.length > 0 && (
     <>
       <Divider sx={{ my: 2 }} />
       <Typography variant="caption" color="text.secondary">Approval Notes</Typography>
       {approvalNoteEntries.map((h) => (
         <Box key={h.id} sx={{ mt: 1 }}>
           <Typography variant="caption" color="text.secondary" display="block">
             {WORKFLOW_STAGES.find((s) => s.status === h.toStatus)?.label ?? h.toStatus}
             {' — '}{h.changedBy.firstName} {h.changedBy.lastName}, {formatDate(h.changedAt)}
           </Typography>
           <Typography variant="body2" whiteSpace="pre-line" sx={{ wordBreak: 'break-word' }}>
             {h.notes}
           </Typography>
         </Box>
       ))}
     </>
   )}
   ```
   Rendered independently of `po.notes` (shows even if the requisitioner left no general notes, as long as an approver added one).

## Implementation Steps

1. Add `APPROVAL_NOTE_STATUSES` + `approvalNoteEntries` const in `PurchaseOrderDetail.tsx` near line 376 (after `activeStageIndex`).
2. Insert the new "Approval Notes" JSX block between the existing `po.notes` block and the `po.denialReason` block (lines 539-555).
3. No other files change — `POStatus` type, `PurchaseOrderStatusHistory` type, and `po.statusHistory` data are all already in place.

## Dependencies

None new.

## Configuration Changes

None.

## Risks and Mitigations

- **Risk:** Duplicating the legacy "locationId:" note-substitution logic from the Timeline. **Mitigation:** not needed — that substitution only ever applies to the `submitted`-stage auto-routing note (confirmed at `purchaseOrder.service.ts:963-967`), which is excluded by `APPROVAL_NOTE_STATUSES` filtering to only human-approval stages. No duplicate substitution logic required.
- **Risk:** Denial reason double-rendering. **Mitigation:** `denied` is not in `APPROVAL_NOTE_STATUSES`, so the denial path is untouched and still handled solely by the existing `po.denialReason` block.
- **Risk:** Long approval-note lists cluttering the summary panel. **Mitigation:** in practice at most 3 entries (one per approval stage); acceptable given the existing Notes section already handles arbitrary-length free text the same way.

## Files to Modify

- `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx`

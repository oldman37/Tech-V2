# PO Status Timeline — Remove Stale District Office Routing Note — Spec

## Current State Analysis

`submitPurchaseOrder` (`purchaseOrder.service.ts:954-960`) computes a `routingNote` string stored on
the `requisitionStatusHistory` row created for the `draft -> submitted` transition. For District
Office POs it hardcodes: `'District Office: routed to Finance Director at supervisor stage'`. This
note is displayed verbatim, in italics, under the "Submitted for Approval" step in the Status
Timeline on the PO detail page (`PurchaseOrderDetail.tsx:609-634`, which renders
`historyEntry.notes`).

This is the same explanatory text just removed from the Requisition Wizard's "First Approver" info
box (`po_district_office_wizard_caption_removal_spec.md`) for the same reason: it described the old
two-stage-FD-approval flow. Now that District Office POs always carry `skipFinanceDirectorApproval =
true` (per `po_fd_supervisor_double_approval_skip_spec.md`), the timeline's own stage label already
reads "Approve as Finance Director" for this step — the note is redundant.

## Problem Definition

Remove the hardcoded District Office routing note so newly-submitted District Office POs no longer
show this redundant italic note under "Submitted for Approval" in the timeline.

## Proposed Solution

Change the `isDistrictOffice` branch of `routingNote` (`purchaseOrder.service.ts:954-955`) from the
hardcoded string to `undefined`, falling through to no note — consistent with how a PO with no
resolvable supervisor name and no office location already gets `undefined` (no note) today. No other
branch of the ternary (`supervisorName` / generic `officeLocationId` fallback) is touched.

This only affects **future** submissions — `requisitionStatusHistory` rows already written with the
old note text are historical data and are not modified (out of scope, matches the precedent set by
the earlier double-approval-skip spec's stance on not touching live data).

## Implementation Steps

- `backend/src/services/purchaseOrder.service.ts:954-955`: change
  `isDistrictOffice ? 'District Office: routed to Finance Director at supervisor stage' : ...` to
  `isDistrictOffice ? undefined : ...`.

## Dependencies

None — no schema, no API shape change (`notes` is already nullable/optional on
`requisitionStatusHistory`), no new library.

## Risks and Mitigations

- Already-submitted District Office POs keep their old note text in history — cosmetic-only,
  historical record, not corrected retroactively (not requested).

## Build/Test Commands (approved for Phase 3)

- `docker compose -f docker-compose.dev.yml build backend` (only backend service touched)

Phase 6 (`scripts/preflight.ps1`) remains deferred pending the user's review of the container-teardown
issue from earlier in this session.

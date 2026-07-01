# PO Requisition Wizard — Remove Stale District Office Caption — Spec

## Current State Analysis

`RequisitionWizard.tsx:622-633` renders a "First Approver" info box when the requestor selects a
`DISTRICT_OFFICE`-type location. It shows "Finance Director" as the first approver, plus a secondary
caption: "District Office: routed to Finance Director at supervisor stage"
(`RequisitionWizard.tsx:630`).

That caption was written when District Office POs required two separate Finance Director approvals
(once "as supervisor", once at the finance_director_approved stage) — the caption was clarifying that
the *supervisor* stage specifically routes to the Finance Director, implying a distinction between
"supervisor" and "Finance Director" approval. Now that
`po_fd_supervisor_double_approval_skip_spec.md` has shipped, District Office POs always carry
`skipFinanceDirectorApproval = true`: the Finance Director approves once, directly, and the PO then
goes straight to the Director of Schools — there is no separate "supervisor" role in this flow to
distinguish from. The caption is now redundant/confusing given "First Approver: Finance Director" is
already stated directly above it.

## Problem Definition

Remove the now-redundant caption line so the info box just states the first approver plainly, matching
how the equivalent non-district-office info box (lines 634-647) has no extra qualifying caption beyond
the supervisor type.

## Proposed Solution

Delete the `<Typography variant="caption" color="text.secondary">District Office: routed to Finance
Director at supervisor stage</Typography>` element (`RequisitionWizard.tsx:629-631`). No other markup,
props, or logic changes — the surrounding `Box`/conditional (`watchedEntityType === 'DISTRICT_OFFICE'
&& watchedOfficeLocationId`) and the "First Approver" / "Finance Director" lines stay exactly as-is.

## Implementation Steps

- `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx`: remove lines 629-631 (the caption
  `Typography` element) from the District Office info box.

## Dependencies

None — UI text removal only, no new libraries, no API/behavior change. Per the Dependency &
Documentation Policy, styling/UI-only changes do not require external documentation verification.

## Risks and Mitigations

None identified — purely a display-text removal; no functional or authorization logic touched.

## Build/Test Commands (approved for Phase 3)

- `docker compose -f docker-compose.dev.yml build frontend` (only the frontend image is affected)

Phase 6 (`scripts/preflight.ps1`) is deferred pending the user's review of the container-teardown issue
that script's test-cleanup step caused during the prior task in this session — not run as part of this
change until the user confirms it's safe to re-run.

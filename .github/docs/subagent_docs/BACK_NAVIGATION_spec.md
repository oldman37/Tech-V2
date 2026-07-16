# Back Navigation — Specification

## Current State Analysis

The app has a shared `frontend/src/components/layout/PageBackButton.tsx` whose `to` prop is
documented as "Explicit route to navigate to. If omitted, uses `navigate(-1)`." The
`navigate(-1)` path already exists but is reached by only 3 of 22 call sites.

Back buttons currently fall into three groups:

1. **`PageBackButton` with a hardcoded `to`** (19 call sites across 17 files) — always jumps to a
   fixed section route regardless of where the user came from.
2. **Hand-rolled back buttons** (19 call sites across 19 files) that bypass the shared component and
   call `navigate('/some-route')` directly.
3. **Correct already** — 3 `PageBackButton` call sites with no `to` (FieldTripDetailPage,
   FieldTripTransportationDetail x2).

## Problem Definition

A user who reaches a detail page from the dashboard, a search result, or a cross-section link is
sent to that section's list page when pressing Back, not to the screen they actually came from.
Back must return to the previous screen.

## Proposed Solution Architecture

`navigate(-1)` unconditionally. Per user decision (2026-07-16), there is **no route fallback** for
cold deep-links; Back is strictly the browser's back.

### 1. `PageBackButton` — remove the `to` prop

Removing `to` (rather than merely ignoring it) makes the invariant structural: no call site can
reintroduce a hardcoded back destination without a type error.

```tsx
interface PageBackButtonProps {
  label?: string;   // defaults to "Back"
  onClick?: () => void;
  sx?: SxProps<Theme>;
}
// handleClick: onClick ? onClick() : navigate(-1)
```

`onClick` and `label` are retained (pre-existing API surface; not dead code introduced by this
change).

### 2. Call sites — drop `to`, normalize destination-specific labels

Labels that name a destination ("Back to Requests", "Back to Field Trip", "Back to Repair Tickets")
become factually wrong once the destination is dynamic. Normalize to the default "Back".

### 3. Hand-rolled buttons — change target in place

Replace `navigate('/route')` with `navigate(-1)` in the existing JSX rather than converting each
page to `PageBackButton`. Rationale: minimum change, zero visual risk (some use `size="small"` or
`IconButton`, which `PageBackButton` does not model). Consolidation is noted as follow-up, not done
here.

Remove `useNavigate`/`navigate` bindings only where **this** change orphans them.

### Explicitly out of scope (not "back to previous screen" buttons)

- `DmRolloverPage.tsx:371,434` — wizard step-back (`handleBack`), moves between form steps.
- `wizard/WizardStep3IncidentBlock.tsx:133` — wizard step-back (`onBack`).
- `IncidentWizard.tsx:604` — labeled "Cancel" (`handleClose`), a discard action.

## Implementation Steps

1. Edit `PageBackButton.tsx` to drop `to` → verify: `to` absent from interface and body.
2. Remove `to`/destination labels from all 19 call sites → verify: `grep "<PageBackButton" ` shows no `to=`.
3. Change 19 hand-rolled back buttons to `navigate(-1)` → verify: no back button retains a literal route.
4. Prune orphaned `navigate`/`useNavigate`/`id` bindings → verify: frontend `tsc` (noUnusedLocals) passes.
5. Preflight → verify: `scripts/preflight.ps1` exit code 0.

## Dependencies

None added. `react-router-dom` ^7.12.0 already installed; `navigate(-1)` is stable v6/v7 API and
already used in-repo. No new-dependency doc verification required.

## Configuration Changes

None. No env vars, no Prisma schema change, no migration, no backend/API change. Frontend-only.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Cold deep-link (email/bookmark/refresh) has no history entry — Back may exit the app or no-op | Accepted by explicit user decision; fallback option was presented and declined |
| Removing `to` breaks a call site passing it | Compile-time error via `tsc` in preflight — cannot ship silently |
| Orphaned `navigate` imports fail `noUnusedLocals` | Caught by frontend `tsc` in preflight |
| Back after a redirect-on-submit returns to a stale form | Pre-existing behavior of the 3 already-correct call sites; unchanged by this work |

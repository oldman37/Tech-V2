# Back Navigation — Review

Spec: `.github/docs/subagent_docs/BACK_NAVIGATION_spec.md`

## Summary

40 back buttons across 38 files now call `navigate(-1)`. The `to` prop is gone from
`PageBackButton`, so a hardcoded back destination is now a compile-time error rather than a
convention someone can drift from.

## Verification

Grep sweep confirms **no** button labeled "Back" (or carrying `ArrowBackIcon`) routes to a literal
path. Remaining `ArrowBackIcon` sites with non-`navigate(-1)` handlers are the documented
exclusions:

| Site | Handler | Why excluded |
|---|---|---|
| `DmRolloverPage.tsx:371,434` | `handleBack` | Wizard step-back within a form |
| `wizard/WizardStep3IncidentBlock.tsx:133` | `onBack` | Wizard step-back within a form |
| `IncidentWizard.tsx:604` | `handleClose` | Labeled "Cancel" — discard action |

Orphan check: every `navigate` binding in the touched files is still used (either by `navigate(-1)`
or by unrelated redirects, e.g. `FuelEntryPage.tsx:98` post-submit redirect). Nothing to prune;
`tsc` with `noUnusedLocals` confirms.

## Deviation from spec

Two error-state buttons not in the original inventory were converted:
`WorkOrderDetailPage.tsx:363` and `PurchaseOrderDetail.tsx:192` ("Back to list"/"Back to List").
Rationale: the spec already converted the analogous error-state button at
`TransportationRequestDetailPage.tsx:189`; leaving these hardcoded would make identical situations
behave differently. Labels normalized to "Back".

## Build Validation

`scripts/preflight.ps1` — **exit code 0**. (Script runs 3 steps; CLAUDE.md Phase 6 Step 3 still
describes 2 — doc drift, unrelated to this change.)

```
==> Preflight 1/3: backend image build   -> naming to docker.io/library/tech-v2-backend:latest done
==> Preflight 2/3: frontend image build  -> tsc && vite build
                                            ✓ 12992 modules transformed
                                            ✓ built in 2.73s
==> Preflight 3/3: backend integration tests (vitest run inside Docker)
     Test Files  6 passed (6)
     Duration    5.75s
All preflight checks passed.
```

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 95% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 90% | A- |
| Build Success | 100% | A |

**Overall Grade: A (98%)**

Functionality 95%: cold deep-links have no history entry, so Back exits the app or no-ops — a known
and explicitly accepted consequence of the no-fallback decision, not a defect.

Consistency 90%: 19 pages still hand-roll a back button instead of using `PageBackButton`. Behavior
is now uniform; the duplication is not. Consolidation is a follow-up, deliberately not bundled here.

## Result

**PASS** — no refinement cycle required.

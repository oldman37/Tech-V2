# Tab URL State — Review

Spec: `.github/docs/subagent_docs/TAB_URL_STATE_spec.md`

## Summary

Tab selection now lives in the URL on the two pages that lost it. The reported case is fixed:
Approval History → open a trip → Back returns to `/field-trip-approvals?tab=2`, still on Approval
History.

## Reported Scenario Traced

| Step | Action | URL | Result |
|---|---|---|---|
| 1 | Open approvals | `/field-trip-approvals` | tab 0, "Field Trip Approvals" (default, omitted) |
| 2 | Click "Approval History" | `/field-trip-approvals?tab=2` | entry replaced |
| 3 | Open a trip | `/field-trips/{id}` | pushed |
| 4 | Press Back | `/field-trip-approvals?tab=2` | **Approval History restored** |

Tab-gated queries (`enabled: activeTab === 2`) are unaffected — only where the value is stored moved.

## Root Cause of the Miss

The previous rollout's survey grepped for filter-shaped state (`*Filter`, `search`, `statusBucket`).
`const [activeTab, setActiveTab] = useState(0)` matched none of those patterns despite a tab being
exactly as much "which view was I on" as a filter. This review's survey covered all
`[tab|activeTab|tabValue|currentTab|selectedTab, set*]` state in `pages/` — four hits, all triaged.

## Triage of All Tab State

| Page | Verdict |
|---|---|
| `FieldTrip/FieldTripApprovalPage` | **Fixed** — reported |
| `DeviceManagement/UserCheckoutHistoryPage` | **Fixed** — same defect; tabs navigate to device/incident details |
| `admin/AdminSettings` | **No change** — already URL-backed via `navigate({ hash }, { replace: true })` + a hash-sync effect; Back already restores |
| `DeviceManagement/IntuneDeviceActionsPage` | **No change** — rows toggle a selection set rather than navigate, so no detail page to return from; its `setTab(1)` carries in-memory `preloadedDevices`/`preloadedAction` that a restored URL could not reproduce |

## Orphan Check

`useState` became unused in both converted files and its import was removed (this is the TS6133
class that failed the previous change's first preflight — caught pre-emptively here). Neither file
had a conflicting local `filters` binding (the TS2451 class). Confirmed by `tsc`.

## Build Validation

`scripts/preflight.ps1` — **exit code 0**, first run, no refinement cycle.

```
==> Preflight 1/3: backend image build   -> OK
==> Preflight 2/3: frontend image build  -> tsc && vite build
                                            ✓ 12993 modules transformed
                                            ✓ built in 1.69s
==> Preflight 3/3: backend integration tests
     Test Files  6 passed (6)
All preflight checks passed.
```

## Limitation

Compile-time and inspection only; not exercised in a browser, as deploying is the user's decision.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 90% | A- |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (99%)**

Functionality 90%: not browser-verified.

## Result

**PASS** — no refinement cycle required.

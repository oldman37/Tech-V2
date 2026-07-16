# List Filter URL State — Review

Spec: `.github/docs/subagent_docs/LIST_FILTER_URL_STATE_spec.md`

## Summary

Filter state for `WorkOrderListPage` now lives in the URL via a new shared `useFilterParams` hook.
The reported case — closed maintenance tickets → open a ticket → Back → open technology tickets —
is fixed: Back now returns to `/work-orders?status=closed&department=MAINTENANCE`.

## Reported Scenario Traced

| Step | Action | URL | Result |
|---|---|---|---|
| 1 | Land on list | `/work-orders` | defaults: open + user's default department |
| 2 | Click "Closed" | `/work-orders?status=closed` | entry replaced, not pushed |
| 3 | Select "Maintenance" | `/work-orders?status=closed&department=MAINTENANCE` | entry replaced |
| 4 | Open a ticket | `/work-orders/{id}` | pushed |
| 5 | Press Back | `/work-orders?status=closed&department=MAINTENANCE` | **closed maintenance restored** |

## Edge Cases Verified by Inspection

- **"All Departments" when the user has a default department.** `'' !== 'TECHNOLOGY'`, so
  `?department=` is written rather than deleted; `get()` returns `''` (not `null`), so the default
  does not silently reassert. Correct.
- **Default-valued params omitted.** `page: '0'` and `status: 'open'` equal their defaults and are
  deleted, keeping URLs short.
- **TA default location.** Fresh visit (no `location` param) applies the assigned location; Back
  (param present) skips the effect; "All Schools" (`?location=`) is `has`-true and so is not
  overwritten.
- **Filter changes do not spam history.** `replace: true` means Back from the list still goes to the
  previous *page*, not backwards through each filter edit.
- **Hand-edited params.** `Number(filters.page) || 0` absorbs `?page=abc`; the backend independently
  validates its own query input.

## Deviation from spec

None functionally. One incidental rename: the local `const filters: WorkOrderQuery` (the object
passed to `useWorkOrderList`) became `const query`, since `filters` is now the hook's return value.

## Build Validation

`scripts/preflight.ps1` — **exit code 0**.

```
==> Preflight 1/3: backend image build   -> cached, OK
==> Preflight 2/3: frontend image build  -> tsc && vite build
                                            ✓ 12993 modules transformed
                                            ✓ built in 1.94s
==> Preflight 3/3: backend integration tests (vitest run inside Docker)
     Test Files  6 passed (6)
All preflight checks passed.
```

## Limitation

Verification is compile-time plus code inspection. The flow has **not** been exercised in a browser,
because deploying the rebuilt image is the user's decision. Confidence in the traced scenario is
high; confirmation requires `docker compose -f docker-compose.dev.yml up -d frontend` and a click
through.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 90% | A- |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 95% | A |
| Consistency | 85% | B+ |
| Build Success | 100% | A |

**Overall Grade: A- (96%)**

Functionality 90%: not browser-verified (see Limitation).

Performance 95%: search rewrites the URL per keystroke. No history entries are created and no extra
fetches occur beyond what the pre-existing undebounced `useState` already triggered, so this is not
a regression — but debouncing search would be a genuine improvement.

Consistency 85%: every other filtered list page still holds filters in `useState` and exhibits the
same bug. That is the agreed follow-up, not a defect in this change.

## Result

**PASS** — no refinement cycle required.

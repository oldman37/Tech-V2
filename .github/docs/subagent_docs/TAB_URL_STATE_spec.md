# Tab URL State — Specification

Follows `LIST_FILTER_URL_STATE_ROLLOUT_spec.md`. Same bug class, missed by that rollout.

## Current State Analysis

Reported: viewing the field trip **Approval History** tab, opening a trip, and pressing Back returns
to the **Field Trip Approvals** tab.

`FieldTripApprovalPage.tsx:46` holds `const [activeTab, setActiveTab] = useState(0)`. Tab 0 is
"Field Trip Approvals", tab 2 is "Approval History". Rows in every tab navigate to
`/field-trips/:id`. Back returns to `/field-trip-approvals`, the component remounts, and `activeTab`
re-initializes to `0`.

**Why the prior rollout missed it:** that survey grepped for filter-shaped state (`*Filter`,
`search`, `statusBucket`). A bare `useState(0)` holding a tab index matched nothing, even though a
tab is exactly as much "which view was I on" as a filter is.

## Problem Definition

Tab selection is part of the view the user expects Back to restore. Two pages lose it.

## Scope

| Page | Param | Rationale |
|---|---|---|
| `FieldTrip/FieldTripApprovalPage` | `tab`:'0' | Reported. Tabs 0/1/2 all navigate to a detail route |
| `DeviceManagement/UserCheckoutHistoryPage` | `tab`:'0' | Same bug: tabs "Checkout History"/"Incidents"; rows navigate to device and incident details |

### Excluded, with reasons

- **`admin/AdminSettings`** — already URL-backed. `handleTabChange` calls
  `navigate({ hash }, { replace: true })` and an effect syncs `activeTab` from `location.hash`, so
  Back already restores the tab. No defect; changing it would duplicate mechanisms.
- **`DeviceManagement/IntuneDeviceActionsPage`** — no back-button defect. Its `onRowClick` toggles a
  selection set rather than navigating, so there is no detail page to return from. Its `setTab(1)`
  is an internal workflow hand-off carrying in-memory state (`preloadedDevices`, `preloadedAction`)
  that a restored URL could not reproduce — putting that tab in the URL would let a Back or refresh
  land on a tab whose required state is gone.

## Proposed Solution Architecture

Reuse `useFilterParams`; no hook change. Per page:

```ts
const [filters, setFilters] = useFilterParams({ tab: '0' });
const activeTab = Number(filters.tab) || 0;
// setters: setFilters({ tab: String(v) })
```

Tab `0` equals the default and so stays out of the URL; `?tab=2` appears only when the user leaves
the default tab. Both pages' tab-gated queries (`enabled: activeTab === 1`) keep working unchanged,
since only the value's storage location moves.

## Implementation Steps

1. Convert `FieldTripApprovalPage` → verify: `?tab=2` restores Approval History.
2. Convert `UserCheckoutHistoryPage` → verify: `tsc`.
3. Preflight → verify: exit code 0.

## Dependencies

None added; existing in-repo hook.

## Configuration Changes

None. Frontend-only; no API, schema, or migration change.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `Number('abc')` → NaN from a hand-edited `?tab=` | `Number(...) \|\| 0` falls back to the first tab |
| Out-of-range `?tab=9` renders no tab panel | MUI Tabs shows no selection and each panel is `activeTab === n` gated, so the page renders without its table rather than crashing; same as the pre-existing behavior for an invalid index |
| Other missed instances of this class | Survey covered all `[tab/activeTab/tabValue/currentTab/selectedTab, set*]` state in `pages/`; the four hits are triaged above |

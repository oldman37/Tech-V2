# Spec: Default Purchase Order Tab for Director of Schools Approvers

## 1. Current State Analysis

`frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx:113` initializes the tab filter state
as `const [tab, setTab] = useState<TabKey>('mine')` — "My Requests" — for every user, including
Director of Schools (DOS) approvers, who instead primarily care about POs awaiting their
approval ("Pending My Approval", `tab === 'pending'`, line 66).

The `isDosApprover` flag already exists on `user.permLevels` (derived server-side in
`auth.controller.ts` from `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` membership) and is already read
in this exact component at line 92 for the Food Service Approval tab's visibility.

`PurchaseOrderDetail.tsx:428` uses `<PageBackButton to="/purchase-orders" />`, an explicit route
push (not `navigate(-1)`), which remounts `PurchaseOrderList` fresh — so the tab's `useState`
initializer runs again on every "back to list" navigation. There is no query param, location
state, or sessionStorage preserving the previously selected tab. Fixing the initializer therefore
covers both "open the PO list directly" and "back button from a PO detail page" in one change —
they are the same code path.

## 2. Problem Definition

Director of Schools approvers should land on "Pending My Approval" by default instead of "My
Requests," both when opening the Purchase Orders list directly and when navigating back to it
from a PO detail page.

## 3. Solution

`frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`: change the tab state initializer from
a hardcoded `'mine'` to `isDosApprover ? 'pending' : 'mine'`. `isDosApprover` is already computed
above this line (line 92) from `user.permLevels.isDosApprover`, itself gated by
`ProtectedRoute`'s auth-loading check, so it is populated before this component ever mounts — no
race condition, same reasoning as the Work Orders department-default feature implemented
earlier this session.

No backend change needed — this is a pure frontend default, not an authorization change. The
"pending" tab's visibility/query logic (`visibleTabs`, `buildFilters`) is untouched; DOS approvers
already had access to that tab, this only changes which tab is selected on mount.

## 4. Risks

None beyond the trivial: if a DOS approver somehow lost approval visibility mid-session, the
existing `activeTab` fallback (`visibleTabs.find(...) ? tab : visibleTabs[0]?.key ?? 'mine'`,
already in the component) degrades gracefully — unchanged by this fix.

## 5. Build Validation

`docker compose -f docker-compose.dev.yml build frontend` — PASSED.

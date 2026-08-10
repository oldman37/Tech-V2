# Page Back-Navigation Audit — Spec

## Current State Analysis

Following up on the work-order-close navigation fix, the user asked for a full
audit across the app:

1. Every page has a Back button at the top.
2. Every page's Back button (and any button that functions like one) returns to
   the actual previous page, not a hardcoded destination.
3. Finishing Cart Assignment should land on the Checked-Out Carts page
   (`/device-management/carts`), not the Checkouts page
   (`/device-management/checkouts`).

Clarified scope with the user (AskUserQuestion): "every page" includes
sidebar-nav landing pages (Dashboard-adjacent pages like Inventory, Checkouts,
Work Orders list, etc.), not just drill-down/detail pages — except the main
Dashboard itself, which stays as-is (it's the app's home / the fallback
destination `useGoBack` already resolves to everywhere else).

The app already has a shared primitive for this: `PageBackButton`
(`frontend/src/components/layout/PageBackButton.tsx`), which wraps `useGoBack()`
(`frontend/src/hooks/useGoBack.ts` — `navigate(-1)` when there's a router history
entry to pop, else replace with `/dashboard`). Some pages instead hand-roll an
equivalent `<Button startIcon={<ArrowBackIcon />} onClick={goBack}>` using the
same `useGoBack()` hook directly (all of Device Management's already-covered
pages follow this pattern). Both are acceptable — the actual requirement is
"resolves through `useGoBack()`", not literally "renders `PageBackButton`".

Auditing all 58 routed page components in `frontend/src/App.tsx` (excluding
`/login` and `/maintenance`, which are pre-auth/interstitial) against
`PageBackButton` and `useGoBack` usage found 26 pages with no back-navigation
mechanism at all:

- `pages/ReportsPage.tsx`, `pages/Users.tsx`, `pages/admin/AdminSettings.tsx`,
  `pages/admin/ProvisioningPage.tsx`, `pages/SupervisorManagement.tsx`,
  `pages/InventoryManagement.tsx`, `pages/DisposedEquipment.tsx`,
  `pages/BulkDeleteDisposedPage.tsx`, `pages/MyEquipment.tsx`,
  `pages/ReferenceDataManagement.tsx`,
  `pages/PurchaseOrders/PurchaseOrderList.tsx`, `pages/WorkOrderListPage.tsx`,
  `pages/RoomAssignments/RoomAssignmentsPage.tsx`,
  `pages/FieldTrip/FieldTripListPage.tsx`,
  `pages/FieldTrip/FieldTripApprovalPage.tsx`, `pages/NotificationSettings.tsx`,
  `pages/AccessDenied.tsx`,
  `pages/TransportationRequests/TransportationRequestsPage.tsx`,
  `pages/DeviceManagement/index.tsx`,
  `pages/DeviceManagement/IntuneDeviceActionsPage.tsx`,
  `pages/incidents/IncidentsPage.tsx`, `pages/InventoryAuditPage.tsx`,
  `pages/InventoryAuditHistoryPage.tsx`, `pages/UnresolvedInventoryPage.tsx`,
  `pages/Transportation/index.tsx`.
- `pages/incidents/IncidentWizardPage.tsx` is a special case: it renders no
  layout of its own, delegating entirely to `IncidentWizard`
  (`components/incidents/IncidentWizard.tsx`), which already renders its own
  back-styled Close button when `fullPage` — but that button's destination was
  wired to a hardcoded `navigate('/incidents')` in `IncidentWizardPage.tsx`
  rather than real back-navigation (see Problem #2 below; this route is also
  entered from `CheckoutPage.tsx` and `QuickCheckPage.tsx`, not only from the
  Incidents list, so a hardcoded destination loses the actual origin exactly
  like the original work-order bug).

All other routed pages (32) already had working back-navigation, either via
`PageBackButton` (20 pages — all of Transportation, most of FieldTrip/PurchaseOrders/
TransportationRequests, plus `WorkOrderDetailPage`/`NewWorkOrderPage`) or a
hand-rolled `useGoBack()` button (Device Management's checkout/repair/invoice/
report/detail pages).

For item 3, `CartAssignmentWizardPage.tsx`'s completion screen renders
`CartCheckoutConfirmation` (`components/DeviceManagement/CartCheckoutConfirmation.tsx`),
whose "View Checkouts" button hardcodes `navigate('/device-management/checkouts')`.

## Problem Definition

1. 26 pages have no way to navigate back at all besides the browser's native
   back button (which the PWA install path doesn't reliably expose).
2. `IncidentWizardPage`'s Close button hardcodes `/incidents` as the
   destination regardless of actual origin (Checkout page, Quick Check page, or
   the Incidents list), losing context the same way the work-order-close bug did.
3. Finishing a cart assignment sends the user to the Checkouts page instead of
   the Checked-Out Carts page, where the cart they just created actually lives.

## Proposed Solution

1. Add `<PageBackButton />` as the first element of each of the 26 pages' main
   content render (matching the existing convention seen across the app —
   inserted once per genuine content branch, not on pure loading/error states,
   except where a branch is itself a distinct content view, e.g.
   `InventoryAuditPage`'s "no active audit" entry screen and
   `Transportation/index.tsx`'s two permission-level views, which each get one).
   Import path (relative vs. `@/` alias) matches each file's own existing import
   style, or its nearest sibling's established `PageBackButton` import when one
   already exists in the same directory (e.g. all `FieldTrip/*` and
   `TransportationRequests/*` pages use the relative form).
2. `IncidentWizardPage.tsx`: replace `onClose={() => navigate('/incidents')}`
   with `onClose={goBack}` (`useGoBack()`), so the wizard's Close button returns
   to wherever it was actually opened from.
3. `CartCheckoutConfirmation.tsx`: change the button's target from
   `/device-management/checkouts` to `/device-management/carts` and relabel it
   "View Checked-Out Carts" (icon swapped from `ListAltIcon` to `ShoppingCartIcon`
   to match the Checked-Out Carts sidebar entry's cart iconography, distinct from
   the "New Cart" button's `AddShoppingCartIcon`).

`AccessDenied.tsx` needed a small structural change (not just an insertion):
its root `<Box>` is a flex-centering wrapper for the card, so the Back button
was placed in its own `<Box sx={{ p: 3, pb: 0 }}>` above it, both wrapped in a
`<>` fragment, rather than becoming a flex child of the centered layout.

No new dependencies, no API/schema changes — this is entirely frontend
navigation wiring using an existing shared hook/component.

## Implementation Steps

1. For each of the 26 pages, add the `PageBackButton` import and render it as
   the first child of the page's outermost content wrapper.
2. Fix `IncidentWizardPage.tsx`'s `onClose` to use `useGoBack()`.
3. Fix `CartCheckoutConfirmation.tsx`'s completion button target/label/icon.

## Dependencies

None.

## Risks and Mitigations

- **Risk:** Missed a page during the audit (58 routes is a lot to track by hand).
  **Mitigation:** Enumerated every `<Route>` element in `App.tsx` directly (the
  single source of truth for routed components) rather than relying on the
  `pages/` directory listing, which includes non-routed files (dialogs, etc.).
- **Risk:** Inserting `<PageBackButton />` breaks a page's layout (e.g. a flex
  wrapper that centers its only child).
  **Mitigation:** Read each page's actual return JSX before editing; restructured
  `AccessDenied.tsx` specifically because its wrapper was a centering flex box.
- **Risk:** TypeScript/build breakage from a bad insertion point or unused icon
  import left behind.
  **Mitigation:** `docker compose -f docker-compose.dev.yml build frontend`
  (`tsc && vite build`) run after all edits — see Review doc.

## Validation

- `docker compose -f docker-compose.dev.yml build frontend` — type-checks and
  builds every edited file.
- `scripts/preflight.ps1` — full backend + frontend gate before delivery.

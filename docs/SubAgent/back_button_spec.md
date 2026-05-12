# Back Button Specification — Tech-V2 Frontend

## 1. Overview

This document analyzes the current state of back-button navigation across all frontend pages and recommends a consistent approach for adding back buttons where missing.

**Tech Stack**: React 18, React Router v6 (`BrowserRouter`, `useNavigate`), Material-UI (MUI)  
**Layout**: All authenticated pages wrap in `<AppLayout>` (sidebar + header shell)  
**Routing**: Flat route definitions in `App.tsx`; no nested `<Outlet>` layouts  

---

## 2. Complete Page Inventory & Back Button Status

### Legend
- ✅ **HAS** — Page already has a back button or breadcrumb navigation
- ❌ **MISSING** — Page has no back navigation element
- ➖ **N/A** — Back button not appropriate (top-level / login / dashboard)

### 2.1 Top-Level / Non-Navigable Pages

| # | Page File | Route | Back Button | Notes |
|---|-----------|-------|:-----------:|-------|
| 1 | `pages/Login.tsx` | `/login` | ➖ N/A | Auth page, no app shell |
| 2 | `pages/Dashboard.tsx` | `/dashboard` | ➖ N/A | Home page — nothing to go "back" to |
| 3 | `pages/AccessDenied.tsx` | `/access-denied` | ➖ N/A | Error state with logout button |

### 2.2 List / Index Pages (Top-Level Navigation Targets)

These are primary sidebar navigation destinations. A back button is **not typically needed** since users navigate via the sidebar.

| # | Page File | Route | Back Button | Notes |
|---|-----------|-------|:-----------:|-------|
| 4 | `pages/Users.tsx` | `/users` | ❌ Missing | Admin list page |
| 5 | `pages/SupervisorManagement.tsx` | `/supervisors` | ❌ Missing | Admin list page |
| 6 | `pages/InventoryManagement.tsx` | `/inventory` | ❌ Missing | Tech list page |
| 7 | `pages/DisposedEquipment.tsx` | `/disposed-equipment` | ❌ Missing | Tech list page |
| 8 | `pages/EquipmentSearch.tsx` | `/equipment-search` | ❌ Missing | Tech search page |
| 9 | `pages/MyEquipment.tsx` | `/my-equipment` | ❌ Missing | User's own equipment |
| 10 | `pages/ReferenceDataManagement.tsx` | `/reference-data` | ❌ Missing | Admin tabbed page |
| 11 | `pages/RoomManagement.tsx` | (redirected to ref-data) | ❌ Missing | Redirected via route |
| 12 | `pages/PurchaseOrders/PurchaseOrderList.tsx` | `/purchase-orders` | ❌ Missing | List page |
| 13 | `pages/WorkOrderListPage.tsx` | `/work-orders` | ❌ Missing | List page |
| 14 | `pages/FieldTrip/FieldTripListPage.tsx` | `/field-trips` | ❌ Missing | List page |
| 15 | `pages/FieldTrip/FieldTripApprovalPage.tsx` | `/field-trips/approvals` | ❌ Missing | Approval queue |
| 16 | `pages/TransportationRequests/TransportationRequestsPage.tsx` | `/transportation-requests` | ❌ Missing | List page |
| 17 | `pages/RoomAssignments/RoomAssignmentsPage.tsx` | `/room-assignments` | ❌ Missing | Admin page |
| 18 | `pages/admin/AdminSettings.tsx` | `/admin/settings` | ❌ Missing | Admin settings |
| 19 | `pages/admin/AdminJobsPage.tsx` | `/admin/jobs` | ❌ Missing | Admin page |

### 2.3 Detail / Form / Child Pages (Back Buttons Expected)

| # | Page File | Route | Back Button | Pattern | Target |
|---|-----------|-------|:-----------:|---------|--------|
| 20 | `pages/PurchaseOrders/PurchaseOrderDetail.tsx` | `/purchase-orders/:id` | ✅ HAS | **Breadcrumbs** (`<Breadcrumbs>` + `<RouterLink>`) | `/purchase-orders` |
| 21 | `pages/PurchaseOrders/RequisitionWizard.tsx` | `/purchase-orders/new` | ✅ HAS | **IconButton** (`<ArrowBackIcon>` in `<IconButton>`) | `/purchase-orders` |
| 22 | `pages/WorkOrderDetailPage.tsx` | `/work-orders/:id` | ✅ HAS | **Breadcrumbs** (`<Breadcrumbs>` + `<RouterLink>`) | `/work-orders` |
| 23 | `pages/NewWorkOrderPage.tsx` | `/work-orders/new` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/work-orders` |
| 24 | `pages/FieldTrip/FieldTripDetailPage.tsx` | `/field-trips/:id` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/field-trips` |
| 25 | `pages/FieldTrip/FieldTripRequestPage.tsx` | `/field-trips/new`, `/field-trips/:id/edit` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/field-trips` |
| 26 | `pages/FieldTrip/FieldTripTransportationPage.tsx` | `/field-trips/:id/transportation` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/field-trips/:id` |
| 27 | `pages/FieldTrip/FieldTripTransportationDetail.tsx` | `/field-trips/:id/transportation/view` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `navigate(-1)` |
| 28 | `pages/TransportationRequests/TransportationRequestDetailPage.tsx` | `/transportation-requests/:id` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/transportation-requests` |
| 29 | `pages/TransportationRequests/TransportationRequestFormPage.tsx` | `/transportation-requests/new` | ✅ HAS | **Button** (`<Button startIcon={<ArrowBackIcon />}>`) | `/transportation-requests` |

---

## 3. Existing Implementation Patterns

Three distinct back-navigation patterns are used across pages that already have back buttons:

### Pattern A: MUI Button with ArrowBackIcon (Most Common — 7 pages)
```tsx
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

<Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/parent-route')}>
  Back
</Button>
```
**Used by**: FieldTripDetailPage, FieldTripRequestPage, FieldTripTransportationPage, FieldTripTransportationDetail, NewWorkOrderPage, TransportationRequestDetailPage, TransportationRequestFormPage

### Pattern B: MUI Breadcrumbs with RouterLink (2 pages)
```tsx
import { Breadcrumbs, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

<Breadcrumbs sx={{ mb: 2 }}>
  <Link component={RouterLink} to="/parent-route" underline="hover" color="inherit">
    Parent Page
  </Link>
  <Typography color="text.primary">Current Page</Typography>
</Breadcrumbs>
```
**Used by**: PurchaseOrderDetail, WorkOrderDetailPage

### Pattern C: IconButton with ArrowBackIcon (1 page)
```tsx
<IconButton onClick={() => navigate('/purchase-orders')} size="small">
  <ArrowBackIcon />
</IconButton>
```
**Used by**: RequisitionWizard

### Navigation Target Strategy
- **8 of 10 pages**: Use explicit route strings (e.g., `navigate('/field-trips')`) — **deterministic, preferred**
- **2 of 10 pages**: Use `navigate(-1)` (browser history back) — only in `FieldTripTransportationDetail.tsx`

---

## 4. Recommended Approach

### 4.1 Create a Shared `PageBackButton` Component

Create a single reusable component that standardizes back navigation. Use **Pattern A** (Button with ArrowBackIcon) as the standard since it's the most widely used (7/10 existing implementations).

**File**: `frontend/src/components/layout/PageBackButton.tsx`

```tsx
import { Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

interface PageBackButtonProps {
  /** Explicit route to navigate to. If omitted, uses navigate(-1). */
  to?: string;
  /** Button label. Defaults to "Back". */
  label?: string;
  /** Additional MUI sx props. */
  sx?: Record<string, unknown>;
}

export function PageBackButton({ to, label = 'Back', sx }: PageBackButtonProps) {
  const navigate = useNavigate();

  return (
    <Button
      variant="text"
      startIcon={<ArrowBackIcon />}
      onClick={() => (to ? navigate(to) : navigate(-1))}
      sx={sx}
    >
      {label}
    </Button>
  );
}
```

### 4.2 Which Pages Should Get Back Buttons

**Should NOT get a back button** (top-level sidebar targets & special pages):
- `Login.tsx` — not inside app shell
- `Dashboard.tsx` — home page
- `AccessDenied.tsx` — error state page
- All list/index pages (rows 4–19 above) — users arrive via sidebar; back button would be redundant with sidebar navigation

**Should already have back buttons (and do)** (detail/form child pages):
- All 10 pages in section 2.3 — already implemented ✅

### 4.3 Assessment: No Missing Back Buttons in Child Pages

**All detail and form pages already have functioning back navigation.** The pages without back buttons are list/index pages that serve as primary navigation targets accessible from the sidebar — adding back buttons to these would be redundant and potentially confusing.

### 4.4 Optional Enhancement: Unify Existing Implementations

If consistency is desired, the existing ad-hoc implementations could be replaced with the shared `PageBackButton` component. This is a **refactor for consistency only** — no functional gap exists.

#### Files to modify (optional refactor):

| File | Current Pattern | Replace With |
|------|----------------|--------------|
| `pages/FieldTrip/FieldTripDetailPage.tsx` | Pattern A inline | `<PageBackButton to="/field-trips" />` |
| `pages/FieldTrip/FieldTripRequestPage.tsx` | Pattern A inline | `<PageBackButton to="/field-trips" />` |
| `pages/FieldTrip/FieldTripTransportationPage.tsx` | Pattern A inline | `<PageBackButton to={'/field-trips/' + id} label="Back to Field Trip" />` |
| `pages/FieldTrip/FieldTripTransportationDetail.tsx` | Pattern A + `navigate(-1)` | `<PageBackButton />` (defaults to -1) |
| `pages/NewWorkOrderPage.tsx` | Pattern A inline | `<PageBackButton to="/work-orders" />` |
| `pages/PurchaseOrders/RequisitionWizard.tsx` | Pattern C (IconButton) | `<PageBackButton to="/purchase-orders" />` |
| `pages/TransportationRequests/TransportationRequestDetailPage.tsx` | Pattern A inline | `<PageBackButton to="/transportation-requests" label="Back to Requests" />` |
| `pages/TransportationRequests/TransportationRequestFormPage.tsx` | Pattern A inline | `<PageBackButton to="/transportation-requests" label="Back to Requests" />` |

**Note**: `PurchaseOrderDetail.tsx` and `WorkOrderDetailPage.tsx` use **Breadcrumbs** (Pattern B), which is a richer navigation pattern. These should be **kept as-is** — breadcrumbs provide more context than a simple back button.

---

## 5. Route Hierarchy Reference

```
/login                                    → Login (no shell)
/dashboard                                → Dashboard (home)
/users                                    → Users (admin list)
/supervisors                              → SupervisorManagement (admin list)
/inventory                                → InventoryManagement (tech list)
/disposed-equipment                       → DisposedEquipment (tech list)
/equipment-search                         → EquipmentSearch (tech search)
/my-equipment                             → MyEquipment (user list)
/reference-data                           → ReferenceDataManagement (admin tabs)
/purchase-orders                          → PurchaseOrderList (list)
  /purchase-orders/new                    → RequisitionWizard (form) ← back to /purchase-orders
  /purchase-orders/:id                    → PurchaseOrderDetail (detail) ← breadcrumb to /purchase-orders
/work-orders                              → WorkOrderListPage (list)
  /work-orders/new                        → NewWorkOrderPage (form) ← back to /work-orders
  /work-orders/:id                        → WorkOrderDetailPage (detail) ← breadcrumb to /work-orders
/field-trips                              → FieldTripListPage (list)
  /field-trips/new                        → FieldTripRequestPage (form) ← back to /field-trips
  /field-trips/approvals                  → FieldTripApprovalPage (approval queue)
  /field-trips/:id                        → FieldTripDetailPage (detail) ← back to /field-trips
  /field-trips/:id/edit                   → FieldTripRequestPage (edit) ← back to /field-trips
  /field-trips/:id/transportation         → FieldTripTransportationPage ← back to /field-trips/:id
  /field-trips/:id/transportation/view    → FieldTripTransportationDetail ← navigate(-1)
/transportation-requests                  → TransportationRequestsPage (list)
  /transportation-requests/new            → TransportationRequestFormPage (form) ← back to /transportation-requests
  /transportation-requests/:id            → TransportationRequestDetailPage (detail) ← back to /transportation-requests
/room-assignments                         → RoomAssignmentsPage (admin)
/admin/settings                           → AdminSettings (admin config)
/admin/jobs                               → AdminJobsPage (admin)
/access-denied                            → AccessDenied (error)
```

---

## 6. Summary

| Metric | Count |
|--------|-------|
| Total page components | 29 |
| Pages with back button / breadcrumbs | 10 |
| Pages without (but don't need one) | 19 |
| Pages missing a back button that should have one | **0** |
| Existing shared BackButton component | **None** (all inline) |

**Conclusion**: All child/detail/form pages already have back navigation. No functional gaps exist. The only opportunity is a **consistency refactor** to extract the repeated inline pattern into a shared `PageBackButton` component, reducing boilerplate in 8 files.

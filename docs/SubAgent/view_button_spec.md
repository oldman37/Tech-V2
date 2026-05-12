# View Button / Actions Column — Audit & Implementation Spec

## 1. Reference Implementation: Purchase Orders

The **Purchase Order list page** (`frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`) is the canonical example of a "View" action button on a list page.

### Pattern Details

- **Table component**: `ResponsiveTable<T>` from `@/components/responsive`
- **Actions column**: rendered automatically by `ResponsiveTable` when the `rowActions` prop is provided. The component adds a `<th>Actions</th>` header and a `<td>` per row with `e.stopPropagation()` to prevent row-click from firing.
- **View button**: MUI `<Button size="small" variant="outlined">View</Button>`
- **On click**: `navigate('/purchase-orders/${po.id}')` (same as `onRowClick`)
- **Row click**: Entire row is also clickable (`onRowClick`) — both mechanisms navigate to the detail page.
- **Row key**: `po.id` (UUID string)
- **Detail route**: `/purchase-orders/:id` → `<PurchaseOrderDetail />`

### Exact Code (lines 508–524)

```tsx
<ResponsiveTable<PurchaseOrderSummary>
  columns={poColumns}
  rows={rows}
  getRowKey={(po) => po.id}
  onRowClick={(po) => navigate(`/purchase-orders/${po.id}`)}
  loading={isLoading}
  emptyMessage="No purchase orders found."
  rowActions={(po) => (
    <Button
      size="small"
      variant="outlined"
      onClick={() => navigate(`/purchase-orders/${po.id}`)}
    >
      View
    </Button>
  )}
/>
```

### How ResponsiveTable Renders Actions

From `frontend/src/components/responsive/ResponsiveTable.tsx`:

- **Desktop**: Adds an extra `<th style={{ width: 'auto', textAlign: 'right' }}>Actions</th>` column header, and per row a `<td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>` that renders the `rowActions(row)` ReactNode.
- **Mobile**: Passes `rowActions` to `MobileCard`, which renders them at the bottom of each card.

---

## 2. Complete Operations/List Page Audit

### Pages Using `ResponsiveTable` with `rowActions` (HAVE action column)

| # | Page | File | rowActions Content | Has View Button? | Detail Route |
|---|------|------|--------------------|------------------|--------------|
| 1 | **Purchase Orders** | `pages/PurchaseOrders/PurchaseOrderList.tsx` | MUI `<Button variant="outlined">View</Button>` | ✅ YES | `/purchase-orders/:id` |
| 2 | **Inventory Management** | `pages/InventoryManagement.tsx` | Assign 🔗, Edit ✏️, History 📜, Dispose 🗑️, Reactivate ♻️ | ❌ No View button (no detail page exists) | N/A — no detail route |
| 3 | **Disposed Equipment** | `pages/DisposedEquipment.tsx` | Reactivate ♻️ button only | ❌ No View button (no detail page exists) | N/A — no detail route |
| 4 | **Users** | `pages/Users.tsx` | Supervisors + Activate/Deactivate buttons | ❌ No View button (no detail page exists) | N/A — no detail route |

### Pages Using `ResponsiveTable` WITHOUT `rowActions` (NO action column)

| # | Page | File | Has `onRowClick`? | Detail Route | Needs View Button? |
|---|------|------|-------------------|--------------|-------------------|
| 5 | **Work Orders** | `pages/WorkOrderListPage.tsx` | ✅ `navigate('/work-orders/${wo.id}')` | `/work-orders/:id` → `WorkOrderDetailPage` | ✅ YES |
| 6 | **Field Trip List** | `pages/FieldTrip/FieldTripListPage.tsx` | ✅ `navigate('/field-trips/${row.id}')` | `/field-trips/:id` → `FieldTripDetailPage` | ✅ YES |
| 7 | **Field Trip Approvals (Tab 0)** | `pages/FieldTrip/FieldTripApprovalPage.tsx` | ✅ `navigate('/field-trips/${row.id}')` | `/field-trips/:id` → `FieldTripDetailPage` | ✅ YES |
| 8 | **Field Trip Approvals (Tab 1 - Transportation)** | `pages/FieldTrip/FieldTripApprovalPage.tsx` | ✅ `navigate('/field-trips/${row.fieldTripRequestId}/transportation/view')` | `/field-trips/:id/transportation/view` | ✅ YES |
| 9 | **Transportation Requests** | `pages/TransportationRequests/TransportationRequestsPage.tsx` | ✅ `navigate('/transportation-requests/${row.id}')` | `/transportation-requests/:id` → `TransportationRequestDetailPage` | ✅ YES |
| 10 | **Equipment Search** | `pages/EquipmentSearch.tsx` | ✅ Opens `EquipmentDetailDrawer` (drawer, not route) | N/A — drawer-based detail view | ⚠️ MAYBE — currently opens a drawer, not a route |

### Pages Using Custom MUI `<Table>` (NOT ResponsiveTable)

| # | Page | File | Has Actions Column? | Detail Route | Needs View Button? |
|---|------|------|--------------------|--------------|--------------------|
| 11 | **My Equipment** | `pages/MyEquipment.tsx` | ✅ Has Actions column with `ViewIcon` + `InfoIcon` IconButtons | N/A — inline detail display, not a route | ❌ SKIP — already has view/info icon buttons |

### Pages Using Neither (Card layouts, Custom CRUD tables, etc.)

| # | Page | File | Table Type | Needs View Button? |
|---|------|------|-----------|-------------------|
| 12 | **Room Assignments** | `pages/RoomAssignments/RoomAssignmentsPage.tsx` | MUI Card grid layout, not a table | ❌ SKIP — card-based UI |
| 13 | **Supervisor Management** | `pages/SupervisorManagement.tsx` | Custom card/accordion layout per location | ❌ SKIP — not a tabular list |
| 14 | **Reference Data Management** | `pages/ReferenceDataManagement.tsx` | Custom `CrudTableShell` with inline edit/delete | ❌ SKIP — admin CRUD tables |
| 15 | **Room Management** | `pages/RoomManagement.tsx` | Custom paginated table with inline actions | ❌ SKIP — admin CRUD table |
| 16 | **Dashboard** | `pages/Dashboard.tsx` | Dashboard widgets, not a list page | ❌ SKIP |

---

## 3. Router Configuration Summary

From `frontend/src/App.tsx`, all detail routes:

| Entity | List Route | Detail Route | Detail Component |
|--------|-----------|--------------|-----------------|
| Purchase Orders | `/purchase-orders` | `/purchase-orders/:id` | `PurchaseOrderDetail` |
| Work Orders | `/work-orders` | `/work-orders/:id` | `WorkOrderDetailPage` |
| Field Trips | `/field-trips` | `/field-trips/:id` | `FieldTripDetailPage` |
| Field Trip Transportation | — | `/field-trips/:id/transportation/view` | `FieldTripTransportationDetail` |
| Transportation Requests | `/transportation-requests` | `/transportation-requests/:id` | `TransportationRequestDetailPage` |
| Equipment Search | `/equipment-search` | N/A (drawer-based) | `EquipmentDetailDrawer` |

---

## 4. Implementation Plan

### Pages That Need a View Button Added (5 changes)

#### 4.1 Work Orders — `pages/WorkOrderListPage.tsx`

- **Table type**: `ResponsiveTable<WorkOrderSummary>`
- **Row ID field**: `wo.id` (string/UUID)
- **Target route**: `/work-orders/${wo.id}`
- **Current**: Has `onRowClick` but no `rowActions`
- **Change**: Add `rowActions` prop with View button

```tsx
rowActions={(wo) => (
  <Button
    size="small"
    variant="outlined"
    onClick={() => navigate(`/work-orders/${wo.id}`)}
  >
    View
  </Button>
)}
```

**Note**: Will need to add `Button` to the MUI imports (already imported).

#### 4.2 Field Trip List — `pages/FieldTrip/FieldTripListPage.tsx`

- **Table type**: `ResponsiveTable<FieldTripRequest>`
- **Row ID field**: `row.id` (string/UUID)
- **Target route**: `/field-trips/${row.id}`
- **Current**: Has `onRowClick` but no `rowActions`
- **Change**: Add `rowActions` prop with View button

```tsx
rowActions={(row) => (
  <Button
    size="small"
    variant="outlined"
    onClick={() => navigate(`/field-trips/${row.id}`)}
  >
    View
  </Button>
)}
```

**Note**: Must add `Button` to MUI imports (`import { ..., Button } from '@mui/material'` — already imported for "New Request" button).

#### 4.3 Field Trip Approvals — `pages/FieldTrip/FieldTripApprovalPage.tsx`

- **Two separate `ResponsiveTable` instances**:
  - **Tab 0 (Field Trip Approvals)**: `ResponsiveTable<FieldTripRequest>`
    - Row ID: `row.id`
    - Target route: `/field-trips/${row.id}`
  - **Tab 1 (Transportation Pending)**: `ResponsiveTable<FieldTripTransportationRequest>`
    - Row ID: `row.id`
    - Target route: `/field-trips/${row.fieldTripRequestId}/transportation/view`
- **Current**: Both have `onRowClick` but no `rowActions`
- **Change**: Add `rowActions` to both

Tab 0:
```tsx
rowActions={(row) => (
  <Button
    size="small"
    variant="outlined"
    onClick={() => navigate(`/field-trips/${row.id}`)}
  >
    View
  </Button>
)}
```

Tab 1:
```tsx
rowActions={(row) => (
  <Button
    size="small"
    variant="outlined"
    onClick={() => navigate(`/field-trips/${row.fieldTripRequestId}/transportation/view`)}
  >
    View
  </Button>
)}
```

**Note**: Must add `Button` to MUI imports (currently imports `Alert, Box, Chip, Tab, Tabs, Typography`).

#### 4.4 Transportation Requests — `pages/TransportationRequests/TransportationRequestsPage.tsx`

- **Table type**: `ResponsiveTable<TransportationRequest>`
- **Row ID field**: `row.id` (string/UUID)
- **Target route**: `/transportation-requests/${row.id}`
- **Current**: Has `onRowClick` but no `rowActions`
- **Change**: Add `rowActions` prop with View button

```tsx
rowActions={(row) => (
  <Button
    size="small"
    variant="outlined"
    onClick={() => navigate(`/transportation-requests/${row.id}`)}
  >
    View
  </Button>
)}
```

**Note**: `Button` is already imported from MUI.

### Pages to SKIP (no changes needed)

| Page | Reason |
|------|--------|
| Purchase Orders | ✅ Already has View button — reference implementation |
| Inventory Management | Has rowActions (Edit/Assign/History/Dispose) but no detail route exists; adding View is not applicable |
| Disposed Equipment | Has rowActions (Reactivate) but no detail route; not applicable |
| Equipment Search | Uses a detail drawer, not route. Adding View would be inconsistent |
| My Equipment | Already has View/Info icon buttons in custom MUI Table |
| Users | Has rowActions (Supervisors/Status toggle) but no user detail page route |
| Room Assignments | Card layout, not a list table |
| Supervisor Management | Card/accordion layout, not a list table |
| Reference Data Management | Admin CRUD tables with inline edit/delete |
| Room Management | Admin CRUD table with inline actions |
| Dashboard | Not a list page |

---

## 5. Files to Modify (Summary)

| File | Change |
|------|--------|
| `frontend/src/pages/WorkOrderListPage.tsx` | Add `rowActions` with View button to `ResponsiveTable` |
| `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` | Add `rowActions` with View button to `ResponsiveTable` |
| `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` | Add `rowActions` with View button to both `ResponsiveTable` instances (Tab 0 + Tab 1), add `Button` to imports |
| `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` | Add `rowActions` with View button to `ResponsiveTable` |

**Total: 4 files, 5 table instances to update.**

---

## 6. Consistency Notes

- All View buttons should use the same pattern: `<Button size="small" variant="outlined">View</Button>`
- All View buttons use `onClick` with `navigate()` to the same route as `onRowClick`
- The `onRowClick` handler remains — the View button is an explicit visual affordance for discoverability, complementing the clickable row
- `ResponsiveTable` already handles `e.stopPropagation()` on the Actions cell, preventing double-navigation

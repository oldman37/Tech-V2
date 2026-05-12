# Table Consistency Spec: Field Trip & Transportation Request Pages

## Overview

This spec compares the table list-page implementations of the **reference pages** (Purchase Orders, Work Orders) against the **target pages** (Field Trip List, Field Trip Approval, Transportation Requests) and details every difference that must be resolved.

---

## 1. Reference Pages — Detailed Documentation

### 1A. PurchaseOrderList (`frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`)

#### Page Layout
- **Wrapper**: `<Box sx={{ p: 3 }}>`
- **Header**: Outer `<Box>` with `display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3`
- **Title**: `<Typography variant="h5" fontWeight={700}>Purchase Orders</Typography>` with subtitle `<Typography variant="body2" color="text.secondary">`
- **Action Button**: `<Button variant="contained" startIcon={<AddIcon />}>New Requisition</Button>` (conditionally disabled/hidden)

#### Tabs
- `<Tabs variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }}>`
- Mobile-specific tab styling: `'& .MuiTab-root': { minWidth: 'auto', px: 1.5, fontSize: '0.8rem' }`

#### Filter Bar (Desktop)
- Wrapped in `<Paper sx={{ p: 2, mb: 2 }}>`
- Inner `<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>`
- Components:
  - `<TextField size="small" placeholder="Search..." />` with `SearchIcon` in `startAdornment`, `sx={{ minWidth: 240 }}`
  - `<Select size="small" displayEmpty sx={{ minWidth: 180 }}>` for status filter
  - `<TextField size="small" type="date" label="From" sx={{ width: 150 }} />` for date range
  - `<TextField size="small" type="date" label="To" sx={{ width: 150 }} />` for date range
  - `<Select size="small" sx={{ minWidth: 160 }}>` for fiscal year
  - `<Select size="small" sx={{ minWidth: 160 }}>` for workflow type
  - `<Button size="small" variant="text">Clear Filters</Button>` (conditional)

#### Filter Bar (Mobile)
- Uses `<MobileFilterBar>` component with `filterCount`, `searchPlaceholder`, `onOpenFilters`
- Expandable `<Paper sx={{ p: 2, mt: 1 }}>` drawer with stacked `<Select fullWidth>` controls
- `<Button size="small" variant="text">Clear Filters</Button>`

#### Table
- Wrapped in `<Paper>` (no `variant` prop — default `elevation`)
- `<ResponsiveTable<PurchaseOrderSummary>>` with props:
  - `columns={poColumns}`
  - `rows={rows}`
  - `getRowKey={(po) => po.id}`
  - `onRowClick={(po) => navigate(\`/purchase-orders/${po.id}\`)}`
  - `loading={isLoading}`
  - `emptyMessage="No purchase orders found."`
  - `rowActions` → `<Button size="small" variant="outlined">View</Button>`

#### Pagination
- `<TablePagination>` **inside** the `<Paper>`, conditional on `!isLoading && totalCount > 0`
- Props: `component="div"`, `count={totalCount}`, `rowsPerPageOptions={[10, 25, 50, 100]}`

#### Column Definitions
```tsx
const poColumns: Column<PurchaseOrderSummary>[] = [
  {
    key: 'reqNumber',
    label: 'Req #',
    isPrimary: true,
    render: (po) => <span style={{ fontFamily: 'monospace' }}>{po.reqNumber ?? '—'}</span>,
  },
  {
    key: 'poNumber',
    label: 'PO #',
    hideOnMobile: true,
    render: (po) => <span style={{ fontFamily: 'monospace' }}>{po.poNumber ?? '—'}</span>,
  },
  {
    key: 'description',
    label: 'Title / Description',
    isSecondary: true,
    render: (po) => (
      <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
        {po.description}
      </span>
    ),
  },
  {
    key: 'requestorId',
    label: 'Requested By',
    hideOnMobile: true,
    render: (po) => `${po.User.firstName} ${po.User.lastName}`,
  },
  {
    key: 'vendorId',
    label: 'Vendor',
    render: (po) => po.vendors?.name ?? '—',
  },
  {
    key: 'status',
    label: 'Status',
    render: (po) => (
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip label={PO_STATUS_LABELS[po.status]} color={PO_STATUS_CHIP_COLOR[po.status]} size="small" />
        {po.workflowType === 'food_service' && (
          <Chip label="Food Service" size="small" variant="outlined" color="secondary" />
        )}
      </Box>
    ),
  },
  {
    key: 'createdAt',
    label: 'Date',
    render: (po) => formatDate(po.createdAt),
  },
  {
    key: 'amount',
    label: 'Total',
    align: 'right',
    render: (po) => formatCurrency(po.amount),
  },
];
```

#### Date Formatting
```tsx
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
```

#### Currency Formatting
```tsx
const formatCurrency = (val: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val));
```

#### Status Chips
- Uses imported `PO_STATUS_LABELS` and `PO_STATUS_CHIP_COLOR` maps
- `<Chip label={...} color={...} size="small" />`

#### Error State
- `<Alert severity="error" sx={{ mb: 2 }}>` with message from response or fallback

---

### 1B. WorkOrderListPage (`frontend/src/pages/WorkOrderListPage.tsx`)

#### Page Layout
- **Wrapper**: `<Box sx={{ p: 3 }}>`
- **Header**: Outer `<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 3 }}>`
  - Left side: icon + title + FY chip grouped in `<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>`
  - `<ConfirmationNumberIcon color="primary" />`
  - `<Typography variant="h5" fontWeight={600}>Work Orders</Typography>`
  - `<Chip icon={<CalendarTodayIcon />} label="FY ..." size="small" color="default" variant="outlined" sx={{ ml: 1 }} />`
- **Action Button**: `<Button variant="contained" startIcon={<AddIcon />}>New Work Order</Button>` with `sx={{ ...(isMobile && { width: '100%' }) }}`

#### Filter Bar (Desktop)
- **NOT** wrapped in Paper — uses bare `<Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>`
- Same search `<TextField>` pattern but with `InputProps` (older MUI API) instead of `slotProps`
- Select dropdowns for department, status, priority, location, fiscal year

#### Filter Bar (Mobile)
- Uses `<MobileFilterBar>` with `activeFilterCount`, expandable Paper drawer identical to PO pattern

#### Table
- Wrapped in `<Paper variant="outlined">` (explicit outlined variant)
- Same `<ResponsiveTable>` pattern with `rowActions`

#### Pagination
- `<TablePagination>` **outside** the Paper, after it — NOT inside
- Same options: `rowsPerPageOptions={[10, 25, 50, 100]}`

#### Column Definitions
```tsx
const woColumns: Column<WorkOrderSummary>[] = [
  {
    key: 'workOrderNumber',
    label: 'Work Order #',
    isPrimary: true,
    render: (wo) => <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{wo.workOrderNumber}</span>,
  },
  {
    key: 'department',
    label: 'Department',
    hideOnMobile: true,
    render: (wo) => (
      <Chip label={wo.department === 'TECHNOLOGY' ? 'Tech' : 'Maint.'} size="small"
        color={wo.department === 'TECHNOLOGY' ? 'primary' : 'secondary'} variant="outlined" />
    ),
  },
  {
    key: 'status',
    label: 'Status',
    isSecondary: true,
    render: (wo) => <WorkOrderStatusChip status={wo.status} />,
  },
  {
    key: 'priority',
    label: 'Priority',
    render: (wo) => <WorkOrderPriorityChip priority={wo.priority} />,
  },
  {
    key: 'officeLocation',
    label: 'Location',
    render: (wo) => <span>{wo.officeLocation?.name ?? '—'}{wo.room ? ` / ${wo.room.name}` : ''}</span>,
  },
  {
    key: 'assignedTo',
    label: 'Assigned To',
    hideOnMobile: true,
    render: (wo) => wo.assignedTo?.displayName ?? wo.assignedTo?.email ?? '—',
  },
  {
    key: 'createdAt',
    label: 'Created',
    render: (wo) => formatDate(wo.createdAt),
  },
];
```

#### Date Formatting
```tsx
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
```

#### Status Chips
- Uses dedicated `<WorkOrderStatusChip>` and `<WorkOrderPriorityChip>` components

---

## 2. Target Pages — Detailed Documentation

### 2A. FieldTripListPage (`frontend/src/pages/FieldTrip/FieldTripListPage.tsx`)

#### Page Layout
- **Wrapper**: `<Box sx={{ p: 3 }}>` ✅ matches
- **Header**: `<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3 }}>` ✅ matches
- **Title**: `<Typography variant="h4" component="h1">` ❌ uses `h4` not `h5`; no `fontWeight`
- **Action Button**: `<Button variant="contained" startIcon={<AddIcon />}>New Request</Button>` ✅ similar

#### Filter Bar
- **NONE** ❌ — No search, no status filter, no date filter, no MobileFilterBar

#### Table
- **NOT wrapped in Paper** ❌ — `<ResponsiveTable>` rendered directly
- Same `<ResponsiveTable>` props pattern ✅
- `emptyMessage` includes suggestion text: `'No field trip requests found. Click "New Request" to create one.'`

#### Pagination
- **NONE** ❌ — No `<TablePagination>`, data is client-side sorted only

#### Column Definitions
```tsx
const columns: Column<FieldTripRequest>[] = [
  { key: 'destination',    label: 'Destination',         isPrimary: true, render: (row) => row.destination },
  { key: 'teacherName',    label: 'Teacher',             isSecondary: true, hideOnMobile: true },
  { key: 'tripDate',       label: 'Trip Date',           render: ... },
  { key: 'schoolBuilding', label: 'School / Building',   hideOnMobile: true },
  { key: 'studentCount',   label: 'Students' },
  { key: 'status',         label: 'Status',              render: (row) => <StatusChip status={...} /> },
  { key: 'submittedAt',    label: 'Submitted',           hideOnMobile: true, render: ... },
];
```

#### Status Chips
- Local `StatusChip` component using `FIELD_TRIP_STATUS_LABELS` / `FIELD_TRIP_STATUS_COLORS`
- `<Chip label={label} color={color} size="small" />` ✅ matches pattern

#### Date Formatting
- Inline: `new Date(row.tripDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` ✅ matches

#### Error State
- `<Alert severity="error" sx={{ mb: 2 }}>` ✅ matches

---

### 2B. FieldTripApprovalPage (`frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`)

#### Page Layout
- **Wrapper**: `<Box sx={{ p: 3 }}>` ✅ matches
- **Title**: `<Typography variant="h4" component="h1" sx={{ mb: 1 }}>` ❌ uses `h4` not `h5`; no `fontWeight`
- **Subtitle**: `<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>` ✅ (PO does similar)
- **No Action Button** (appropriate — this is an approvals page)

#### Tabs
- `<Tabs variant={isMobile ? 'scrollable' : 'standard'} scrollButtons={isMobile ? 'auto' : undefined} sx={{ mb: 3 }}>`
- ❌ Uses conditional `variant` — PO always uses `variant="scrollable"`, `scrollButtons="auto"`, `allowScrollButtonsMobile`
- ❌ No mobile tab styling override (`'& .MuiTab-root'` sizing)
- ❌ `mb: 3` instead of `mb: 2`

#### Filter Bar
- **NONE** ❌ — No search, no filters, no MobileFilterBar

#### Table
- **NOT wrapped in Paper** ❌ — `<ResponsiveTable>` rendered directly
- Two separate `<ResponsiveTable>` instances (field trip approvals + transportation pending)
- Same base props pattern ✅

#### Pagination
- **NONE** ❌ — No `<TablePagination>`

#### Column Definitions (approvalColumns)
```tsx
const approvalColumns: Column<FieldTripRequest>[] = [
  { key: 'destination',    label: 'Destination',   isPrimary: true },
  { key: 'tripDate',       label: 'Trip Date',     render: ... },
  { key: 'submittedBy',    label: 'Submitted By',  isSecondary: true, render: ... },
  { key: 'schoolBuilding', label: 'School',        hideOnMobile: true },
  { key: 'studentCount',   label: 'Students',      hideOnMobile: true },
  { key: 'status',         label: 'Status',        render: (row) => <StatusChip ... /> },
  { key: 'submittedAt',    label: 'Submitted',     hideOnMobile: true, render: ... },
];
```

#### Column Definitions (transportColumns)
```tsx
const transportColumns: Column<FieldTripTransportationRequest>[] = [
  { key: 'destination',  label: 'Destination',       isPrimary: true, render: ... },
  { key: 'tripDate',     label: 'Trip Date',         render: ... },
  { key: 'submittedBy',  label: 'Submitted By',      isSecondary: true, render: ... },
  { key: 'school',       label: 'School',            hideOnMobile: true, render: ... },
  { key: 'busCount',     label: 'Buses' },
  { key: 'status',       label: 'Transport Status',  render: (row) => <TransportStatusChip ... /> },
  { key: 'submittedAt',  label: 'Submitted',         hideOnMobile: true, render: ... },
];
```

#### Status Chips
- Local `StatusChip` and `TransportStatusChip` functions
- `<Chip label={label} color={color} size="small" />` ✅

---

### 2C. TransportationRequestsPage (`frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`)

#### Page Layout
- **Wrapper**: `<Box sx={{ p: 3 }}>` ✅ matches
- **Header**: `<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3 }}>` ✅ matches
- **Title**: `<Typography variant="h4" component="h1">` ❌ uses `h4` not `h5`; no `fontWeight`
- **Action Button**: `<Button variant="contained" startIcon={<AddIcon />}>New Request</Button>` ✅

#### Filter Bar (Desktop)
- **NOT wrapped in Paper** ❌ — uses bare `<Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>`
  - ❌ `mb: 3` instead of `mb: 2`
- Uses `<FormControl>` + `<InputLabel>` + `<Select>` pattern ❌ — reference pages use `<Select displayEmpty>` directly
- Has status, date-from, date-to filters
- **No search field** ❌
- `<Button variant="text">Clear Filters</Button>` ✅

#### Filter Bar (Mobile)
- **No MobileFilterBar** ❌ — date pickers are hidden on mobile via `{!isMobile && (...)}`
- Only shows the status `<Select>` dropdown

#### Table
- **NOT wrapped in Paper** ❌ — `<ResponsiveTable>` rendered directly
- Same base props pattern ✅

#### Pagination
- **NONE** ❌ — No `<TablePagination>`

#### Column Definitions
```tsx
const columns: Column<TransportationRequest>[] = [
  { key: 'tripDate',          label: 'Trip Date',          render: ... },
  { key: 'school',            label: 'School',             isPrimary: true },
  { key: 'groupOrActivity',   label: 'Group / Activity',   isSecondary: true },
  { key: 'sponsorName',       label: 'Sponsor',            hideOnMobile: true },
  { key: 'busCount',          label: 'Buses' },
  { key: 'studentCount',      label: 'Students',           hideOnMobile: true },
  { key: 'submittedBy',       label: 'Submitter',          hideOnMobile: true, render: ... },
  { key: 'status',            label: 'Status',             render: ... },
];
```

#### Status Chips
- Inline render: `<Chip label={TRANSPORTATION_REQUEST_STATUS_LABELS[status]} color={TRANSPORTATION_REQUEST_STATUS_COLORS[status]} size="small" />`
- ✅ Pattern matches (though not extracted to a component)

#### Date Formatting
- Inline, same `toLocaleDateString` format ✅

---

## 3. ResponsiveTable Component API

**File**: `frontend/src/components/responsive/ResponsiveTable.tsx`

### Column<T> Interface
| Prop | Type | Description |
|------|------|-------------|
| `key` | `keyof T \| string` | Data key or identifier |
| `label` | `string` | Column header text |
| `render` | `(row: T) => ReactNode` | Custom cell renderer |
| `hideOnMobile` | `boolean` | Hide in mobile card view |
| `isPrimary` | `boolean` | Card title on mobile |
| `isSecondary` | `boolean` | Card subtitle on mobile |
| `sortable` | `boolean` | Enable header sort (desktop) |
| `width` | `string \| number` | Column width hint |
| `align` | `'left' \| 'center' \| 'right'` | Text alignment |

### ResponsiveTableProps<T>
| Prop | Type | Description |
|------|------|-------------|
| `columns` | `Column<T>[]` | Column definitions |
| `rows` | `T[]` | Data array |
| `getRowKey` | `(row: T) => string \| number` | Unique key extractor |
| `onRowClick` | `(row: T) => void` | Row click handler |
| `rowActions` | `(row: T) => ReactNode` | Per-row action buttons |
| `loading` | `boolean` | Loading state flag |
| `emptyMessage` | `string` | Empty state text |
| `sort` | `SortState` | Controlled sort state |
| `onSortChange` | `(sort: SortState) => void` | Sort change callback |
| `className` | `string` | Custom wrapper class |

### MobileFilterBar Props
| Prop | Type | Description |
|------|------|-------------|
| `searchValue` | `string` | Current search text |
| `onSearchChange` | `(value: string) => void` | Search change handler |
| `filterCount` | `number` | Active filter badge count |
| `onOpenFilters` | `() => void` | Open filter drawer |
| `searchPlaceholder` | `string` | Search placeholder text |
| `children` | `ReactNode` | Extra inline controls |

---

## 4. Detailed Comparison: Every Difference

### 4.1 Title / Header Typography

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation Requests |
|--------|---------------|----------------|-----------------|---------------------|------------------------|
| Variant | `h5` | `h5` | `h4` ❌ | `h4` ❌ | `h4` ❌ |
| `fontWeight` | `700` | `600` | none ❌ | none ❌ | none ❌ |
| `component` | none | none | `"h1"` | `"h1"` | `"h1"` |
| Subtitle | Yes (`body2`) | No (FY chip instead) | No | Yes (`body2`) | No |
| Page Icon | No | Yes (`ConfirmationNumberIcon`) | No | No | No |

**Target**: All target pages should use `variant="h5"` with `fontWeight={600}`.

### 4.2 Filter Bar — Desktop

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation Requests |
|--------|---------------|----------------|-----------------|---------------------|------------------------|
| Search field | ✅ `<TextField>` + `SearchIcon` | ✅ `<TextField>` + `SearchIcon` | ❌ None | ❌ None | ❌ None |
| Wrapper | `<Paper sx={{ p: 2, mb: 2 }}>` | `<Box>` (no Paper) | N/A | N/A | `<Box sx={{ gap: 2, mb: 3 }}>` |
| Status filter | ✅ `<Select displayEmpty>` | ✅ `<Select displayEmpty>` | ❌ None | ❌ None | ✅ `<FormControl>` + `<Select>` ❌ different pattern |
| Date filters | ✅ From/To date pickers | ❌ None | ❌ None | ❌ None | ✅ From/To (hidden on mobile) |
| Clear button | ✅ Conditional | ❌ None | ❌ None | ❌ None | ✅ |
| Bottom margin | `mb: 2` | `mb: 2` | N/A | N/A | `mb: 3` ❌ |

**Note**: PO wraps filters in Paper; WO does not. Since both are reference, targets can use either, but should be **consistent within the target set**. Best pattern to follow: WO's `<Box>` approach for simpler pages (Field Trip, Transportation), PO's `<Paper>` approach for complex filter sets.

### 4.3 Filter Bar — Mobile

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation Requests |
|--------|---------------|----------------|-----------------|---------------------|------------------------|
| `MobileFilterBar` | ✅ | ✅ | ❌ None | ❌ None | ❌ None |
| Expandable drawer | ✅ Paper drawer | ✅ Paper drawer | N/A | N/A | ❌ Only hides date pickers |

### 4.4 Table Wrapper

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation Requests |
|--------|---------------|----------------|-----------------|---------------------|------------------------|
| Paper wrapper | `<Paper>` (elevation) | `<Paper variant="outlined">` | ❌ None | ❌ None | ❌ None |

**Target**: All target pages should wrap `<ResponsiveTable>` in `<Paper variant="outlined">` (WO pattern).

### 4.5 Pagination

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation Requests |
|--------|---------------|----------------|-----------------|---------------------|------------------------|
| Has pagination | ✅ Inside Paper | ✅ Outside Paper | ❌ | ❌ | ❌ |
| Server-side | ✅ | ✅ | N/A (client-side sort) | N/A | N/A |
| `rowsPerPageOptions` | `[10,25,50,100]` | `[10,25,50,100]` | N/A | N/A | N/A |

**Note**: Field Trip and Transportation pages currently fetch full data sets. Pagination can be added as client-side pagination if the dataset is small, or server-side if the API supports it. At minimum, they should show a `<TablePagination>` for consistency.

### 4.6 Row Actions

| Aspect | PO | WO | Field Trip List | Field Trip Approval | Transportation |
|--------|----|----|-----------------|---------------------|----------------|
| `rowActions` | ✅ `<Button size="small" variant="outlined">View</Button>` | ✅ Same | ✅ Same ✅ | ✅ Same ✅ | ✅ Same ✅ |

All pages consistently use `rowActions` with View button. ✅

### 4.7 Import Paths

| Aspect | PO (Reference) | WO (Reference) | Field Trip List | Field Trip Approval | Transportation |
|--------|---------------|----------------|-----------------|---------------------|----------------|
| Imports | `@/components/responsive` | `@/components/responsive` | `../../components/responsive` ❌ | `../../components/responsive` ❌ | `../../components/responsive` ❌ |
| Hooks | `@/hooks/useResponsive` | `@/hooks/useResponsive` | `../../hooks/useResponsive` ❌ | `../../hooks/useResponsive` ❌ | `../../hooks/useResponsive` ❌ |

**Target**: Use `@/` alias imports for consistency.

### 4.8 Select Component Pattern

| Aspect | PO / WO (Reference) | Transportation Requests |
|--------|---------------------|------------------------|
| Pattern | `<Select displayEmpty>` directly | `<FormControl>` + `<InputLabel>` + `<Select label="Status">` |

**Target**: Use the simpler `<Select displayEmpty>` directly with a `<MenuItem value="">All</MenuItem>` placeholder.

---

## 5. Changes Required Per File

### 5A. `frontend/src/pages/FieldTrip/FieldTripListPage.tsx`

#### 5A.1 — Title Typography
**Before:**
```tsx
<Typography variant="h4" component="h1">
  My Field Trip Requests
</Typography>
```
**After:**
```tsx
<Typography variant="h5" fontWeight={600}>
  My Field Trip Requests
</Typography>
```

#### 5A.2 — Add Import for Filter/Search Components
**Before:**
```tsx
import {
  Alert,
  Box,
  Button,
  Chip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
```
**After:**
```tsx
import { useState } from 'react';
// ... existing useMemo import
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
```

#### 5A.3 — Add Filter State
Add state for search, status filter, pagination, and mobile filter drawer:
```tsx
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState<FieldTripStatus | ''>('');
const [page, setPage] = useState(0);
const [rowsPerPage, setRowsPerPage] = useState(25);
const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
```

#### 5A.4 — Add Desktop Filter Bar
After the header `<Box>`, before the error Alert, insert:
```tsx
{isMobile ? (
  <Box sx={{ mb: 2 }}>
    <MobileFilterBar
      searchValue={search}
      onSearchChange={(value) => { setSearch(value); setPage(0); }}
      filterCount={(statusFilter ? 1 : 0)}
      onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
      searchPlaceholder="Search field trips…"
    />
    {filterDrawerOpen && (
      <Paper sx={{ p: 2, mt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as FieldTripStatus | ''); setPage(0); }}
            displayEmpty
            fullWidth
          >
            <MenuItem value="">All Statuses</MenuItem>
            {Object.entries(FIELD_TRIP_STATUS_LABELS).map(([val, label]) => (
              <MenuItem key={val} value={val}>{label}</MenuItem>
            ))}
          </Select>
          <Button size="small" variant="text" onClick={() => { setStatusFilter(''); setSearch(''); setPage(0); setFilterDrawerOpen(false); }}>
            Clear Filters
          </Button>
        </Box>
      </Paper>
    )}
  </Box>
) : (
  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
    <TextField
      size="small"
      placeholder="Search field trips…"
      value={search}
      onChange={(e) => { setSearch(e.target.value); setPage(0); }}
      InputProps={{
        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
      }}
      sx={{ minWidth: 220 }}
    />
    <Select
      size="small"
      displayEmpty
      value={statusFilter}
      onChange={(e) => { setStatusFilter(e.target.value as FieldTripStatus | ''); setPage(0); }}
      sx={{ minWidth: 160 }}
    >
      <MenuItem value="">All Statuses</MenuItem>
      {Object.entries(FIELD_TRIP_STATUS_LABELS).map(([val, label]) => (
        <MenuItem key={val} value={val}>{label}</MenuItem>
      ))}
    </Select>
  </Box>
)}
```

#### 5A.5 — Wrap Table in Paper + Add Pagination
**Before:**
```tsx
<ResponsiveTable<FieldTripRequest>
  columns={columns}
  rows={sortedTrips}
  ...
/>
```
**After:**
```tsx
<Paper variant="outlined">
  <ResponsiveTable<FieldTripRequest>
    columns={columns}
    rows={filteredTrips}
    ...
  />
</Paper>

<TablePagination
  component="div"
  count={filteredTrips.length}
  page={page}
  rowsPerPage={rowsPerPage}
  rowsPerPageOptions={[10, 25, 50, 100]}
  onPageChange={(_, p) => setPage(p)}
  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
/>
```

#### 5A.6 — Add Client-Side Filtering Logic
Add a `filteredTrips` memo that filters `sortedTrips` by search and status, and slices for pagination:
```tsx
const filteredTrips = useMemo(() => {
  let result = sortedTrips;
  if (statusFilter) result = result.filter((t) => t.status === statusFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((t) =>
      t.destination?.toLowerCase().includes(q) ||
      t.teacherName?.toLowerCase().includes(q) ||
      t.schoolBuilding?.toLowerCase().includes(q)
    );
  }
  return result;
}, [sortedTrips, statusFilter, search]);

const paginatedTrips = useMemo(
  () => filteredTrips.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
  [filteredTrips, page, rowsPerPage],
);
```

#### 5A.7 — Update Imports to Use `@/` Aliases
**Before:**
```tsx
import { useIsMobile } from '../../hooks/useResponsive';
import { fieldTripService } from '../../services/fieldTrip.service';
import type { FieldTripRequest, FieldTripStatus, StatusChipColor } from '../../types/fieldTrip.types';
import { FIELD_TRIP_STATUS_LABELS, FIELD_TRIP_STATUS_COLORS } from '../../types/fieldTrip.types';
import { ResponsiveTable, Column } from '../../components/responsive';
```
**After:**
```tsx
import { useIsMobile } from '@/hooks/useResponsive';
import { fieldTripService } from '@/services/fieldTrip.service';
import type { FieldTripRequest, FieldTripStatus, StatusChipColor } from '@/types/fieldTrip.types';
import { FIELD_TRIP_STATUS_LABELS, FIELD_TRIP_STATUS_COLORS } from '@/types/fieldTrip.types';
import { ResponsiveTable, MobileFilterBar, Column } from '@/components/responsive';
```

---

### 5B. `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`

#### 5B.1 — Title Typography
**Before:**
```tsx
<Typography variant="h4" component="h1" sx={{ mb: 1 }}>
  Field Trip Approvals
</Typography>
```
**After:**
```tsx
<Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
  Field Trip Approvals
</Typography>
```

#### 5B.2 — Tabs Styling Consistency
**Before:**
```tsx
<Tabs
  value={activeTab}
  onChange={(_, v) => setActiveTab(v)}
  variant={isMobile ? 'scrollable' : 'standard'}
  scrollButtons={isMobile ? 'auto' : undefined}
  sx={{ mb: 3 }}
>
```
**After:**
```tsx
<Tabs
  value={activeTab}
  onChange={(_, v) => setActiveTab(v)}
  variant="scrollable"
  scrollButtons="auto"
  allowScrollButtonsMobile
  sx={{
    mb: 2,
    ...(isMobile && {
      '& .MuiTab-root': { minWidth: 'auto', px: 1.5, fontSize: '0.8rem' },
    }),
  }}
>
```

#### 5B.3 — Wrap Tables in Paper
**Before:**
```tsx
<ResponsiveTable<FieldTripRequest>
  columns={approvalColumns}
  rows={trips ?? []}
  ...
/>
```
**After:**
```tsx
<Paper variant="outlined">
  <ResponsiveTable<FieldTripRequest>
    columns={approvalColumns}
    rows={trips ?? []}
    ...
  />
</Paper>
```
(Same for the transportation `<ResponsiveTable>`)

#### 5B.4 — Add `Paper` to MUI Imports
**Before:**
```tsx
import {
  Alert,
  Box,
  Button,
  Chip,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
```
**After:**
```tsx
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
```

#### 5B.5 — Update Imports to Use `@/` Aliases
**Before:**
```tsx
import { useIsMobile } from '../../hooks/useResponsive';
import { ResponsiveTable, Column } from '../../components/responsive';
import { fieldTripService }               from '../../services/fieldTrip.service';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
```
**After:**
```tsx
import { useIsMobile } from '@/hooks/useResponsive';
import { ResponsiveTable, Column } from '@/components/responsive';
import { fieldTripService }               from '@/services/fieldTrip.service';
import { fieldTripTransportationService } from '@/services/fieldTripTransportation.service';
```

---

### 5C. `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`

#### 5C.1 — Title Typography
**Before:**
```tsx
<Typography variant="h4" component="h1">
  Transportation Requests
</Typography>
```
**After:**
```tsx
<Typography variant="h5" fontWeight={600}>
  Transportation Requests
</Typography>
```

#### 5C.2 — Add Search Field to Filter Bar
Add a `<TextField>` search field at the beginning of the filter `<Box>`:
```tsx
<TextField
  size="small"
  placeholder="Search transportation requests…"
  value={searchFilter}
  onChange={(e) => setSearchFilter(e.target.value)}
  InputProps={{
    startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
  }}
  sx={{ minWidth: 220 }}
/>
```

#### 5C.3 — Replace FormControl/InputLabel/Select with Direct Select
**Before:**
```tsx
<FormControl size="small" sx={{ minWidth: isMobile ? '100%' : 160 }}>
  <InputLabel>Status</InputLabel>
  <Select
    value={statusFilter}
    label="Status"
    onChange={(e) => setStatusFilter(e.target.value)}
  >
    <MenuItem value="">All</MenuItem>
    ...
  </Select>
</FormControl>
```
**After:**
```tsx
<Select
  size="small"
  displayEmpty
  value={statusFilter}
  onChange={(e) => setStatusFilter(e.target.value)}
  sx={{ minWidth: isMobile ? '100%' : 160 }}
>
  <MenuItem value="">All Statuses</MenuItem>
  ...
</Select>
```

#### 5C.4 — Fix Filter Bar Bottom Margin
**Before:**
```tsx
<Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
```
**After:**
```tsx
<Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
```

#### 5C.5 — Add Mobile Filter Support
Replace the current mobile handling (hiding date pickers) with `<MobileFilterBar>`:
```tsx
{isMobile ? (
  <Box sx={{ mb: 2 }}>
    <MobileFilterBar
      searchValue={searchFilter}
      onSearchChange={setSearchFilter}
      filterCount={(statusFilter ? 1 : 0) + (fromFilter ? 1 : 0) + (toFilter ? 1 : 0)}
      onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
      searchPlaceholder="Search transportation requests…"
    />
    {filterDrawerOpen && (
      <Paper sx={{ p: 2, mt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Select size="small" displayEmpty value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)} fullWidth>
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="PENDING">Pending Review</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="DENIED">Denied</MenuItem>
          </Select>
          <TextField size="small" label="Trip Date From" type="date" value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField size="small" label="Trip Date To" type="date" value={toFilter}
            onChange={(e) => setToFilter(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <Button size="small" variant="text"
            onClick={() => { setStatusFilter(''); setFromFilter(''); setToFilter(''); setSearchFilter(''); setFilterDrawerOpen(false); }}>
            Clear Filters
          </Button>
        </Box>
      </Paper>
    )}
  </Box>
) : (
  /* desktop filter bar (existing but updated) */
)}
```

#### 5C.6 — Wrap Table in Paper + Add Pagination
**Before:**
```tsx
<ResponsiveTable<TransportationRequest>
  columns={columns}
  rows={requests ?? []}
  ...
/>
```
**After:**
```tsx
<Paper variant="outlined">
  <ResponsiveTable<TransportationRequest>
    columns={columns}
    rows={paginatedRows}
    ...
  />
</Paper>

<TablePagination
  component="div"
  count={filteredRows.length}
  page={page}
  rowsPerPage={rowsPerPage}
  rowsPerPageOptions={[10, 25, 50, 100]}
  onPageChange={(_, p) => setPage(p)}
  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
/>
```

#### 5C.7 — Add Missing Import + State
Add imports:
```tsx
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import SearchIcon from '@mui/icons-material/Search';
import { MobileFilterBar } from '@/components/responsive';
```
Add state:
```tsx
const [searchFilter, setSearchFilter] = useState('');
const [page, setPage] = useState(0);
const [rowsPerPage, setRowsPerPage] = useState(25);
const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
```

#### 5C.8 — Update Imports to Use `@/` Aliases
**Before:**
```tsx
import { transportationRequestService } from '../../services/transportationRequest.service';
import type { ... } from '../../types/transportationRequest.types';
import { ... } from '../../types/transportationRequest.types';
import { ResponsiveTable, Column } from '../../components/responsive';
import { useIsMobile } from '../../hooks/useResponsive';
```
**After:**
```tsx
import { transportationRequestService } from '@/services/transportationRequest.service';
import type { ... } from '@/types/transportationRequest.types';
import { ... } from '@/types/transportationRequest.types';
import { ResponsiveTable, MobileFilterBar, Column } from '@/components/responsive';
import { useIsMobile } from '@/hooks/useResponsive';
```

---

## 6. Files to Modify

| File | Change Type |
|------|-------------|
| `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` | Major — add filters, search, Paper wrapper, pagination, fix title, fix imports |
| `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` | Moderate — fix title, fix tabs, add Paper wrapper, fix imports |
| `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` | Major — add search, fix filter pattern, add MobileFilterBar, add Paper wrapper, add pagination, fix title, fix imports |

---

## 7. Summary of All Differences

| # | Category | Reference Pattern | Target Delta |
|---|----------|-------------------|--------------|
| 1 | Title variant | `h5` with `fontWeight={600}` | All 3 targets use `h4` with no fontWeight |
| 2 | Title `component` prop | Not set | Targets set `component="h1"` (unnecessary) |
| 3 | Desktop search field | `<TextField>` with `SearchIcon` adornment | Missing on all 3 targets |
| 4 | Desktop filter wrapper | `<Box>` or `<Paper>` with `mb: 2` | Transportation uses `mb: 3`; others have no filters |
| 5 | Select pattern | `<Select displayEmpty>` directly | Transportation uses `<FormControl>`+`<InputLabel>`+`<Select>` |
| 6 | Mobile filter bar | `<MobileFilterBar>` component | Missing on all 3 targets |
| 7 | Mobile filter drawer | Expandable `<Paper>` with stacked filters | Missing on all 3 targets |
| 8 | Table Paper wrapper | `<Paper>` or `<Paper variant="outlined">` | Missing on all 3 targets |
| 9 | Pagination | `<TablePagination>` with `[10,25,50,100]` | Missing on all 3 targets |
| 10 | Import path style | `@/` alias paths | Relative `../../` paths |
| 11 | `MobileFilterBar` import | Imported from `@/components/responsive` | Not imported in any target |
| 12 | Tabs styling | `variant="scrollable"`, `allowScrollButtonsMobile`, mobile font sizing | Approval page uses conditional variant, no mobile sizing |

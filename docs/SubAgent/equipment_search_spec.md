# Advanced Equipment Search — Frontend Specification (H5)

**Document Version:** 1.0  
**Date:** 2026-03-04  
**Author:** Copilot Research Agent  
**Status:** Ready for Implementation

---

## 1. Executive Summary

This spec defines a new **Advanced Equipment Search** page (`/equipment-search`) for the Tech-V2 frontend. It is a dedicated **lookup/discovery tool** — distinct from the manage-and-edit `InventoryManagement` page. The primary use case is a tech searching for a specific device by any identifier (asset tag, serial number, PO number, vendor name, etc.) and quickly navigating to its detail/edit view.

**No backend changes are required.** Every filter described here is already exposed by `GET /api/inventory` as of the current codebase analysis.

---

## 2. Backend API Analysis

### 2.1 Route

```
GET /api/inventory
Permission required: TECHNOLOGY level 1+
Auth: JWT bearer token (cookie-based via authenticate middleware)
CSRF: Read-only (GET) — no CSRF token needed
```

### 2.2 All Supported Query Parameters (`GetInventoryQuerySchema`)

| Parameter | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (1–1000, default: 50) |
| `search` | string (max 200) | Full-text search across `assetTag`, `name`, `serialNumber`, `description`, `notes` |
| `locationId` | UUID | Filter by legacy `locations` record |
| `officeLocationId` | UUID | Filter by `OfficeLocation` (campus/site) |
| `roomId` | UUID | Filter by specific room |
| `categoryId` | UUID | Filter by equipment category |
| `status` | enum | `active` \| `available` \| `maintenance` \| `storage` \| `disposed` \| `lost` \| `damaged` \| `reserved` |
| `isDisposed` | boolean (string `"true"/"false"`) | Filter disposed vs. active records |
| `brandId` | UUID | Filter by brand |
| `vendorId` | UUID | Filter by vendor |
| `modelId` | UUID | Filter by model |
| `sortBy` | string (max 50) | Column to sort by |
| `sortOrder` | `"asc"` \| `"desc"` | Sort direction |
| `minPrice` | decimal string | Minimum purchase price |
| `maxPrice` | decimal string | Maximum purchase price |
| `purchaseDateFrom` | ISO datetime string | Purchase date range start |
| `purchaseDateTo` | ISO datetime string | Purchase date range end |
| `disposedDateFrom` | ISO datetime string | Disposal date range start |
| `disposedDateTo` | ISO datetime string | Disposal date range end |

### 2.3 Service-Level Search Behavior

The `search` parameter in `InventoryService.findAll()` builds an `OR` query across:
- `assetTag` (contains, case-insensitive)
- `name` (contains, case-insensitive)
- `serialNumber` (contains, case-insensitive)
- `description` (contains, case-insensitive)
- `notes` (contains, case-insensitive)

**Note:** `poNumber` and `vendor.name` are **NOT** included in the `search` OR clause. They require their respective `vendorId` filter or a dedicated exact param.

### 2.4 Backend Gap Analysis

| Filter Needed | Backend Support | Notes |
|---|---|---|
| Keyword (assetTag + name + serial) | ✅ `search` param | Also covers description + notes |
| Asset tag exact | ✅ `search` param | Contains match (not exact-only, but sufficient) |
| Serial number | ✅ `search` param | Contains match |
| PO number text search | ⚠️ **PARTIAL** | `poNumber` is a field on `equipment` but there is no dedicated `poNumber` query param. Must use `search` which doesn't currently include `poNumber` in its OR clause. |
| Vendor | ✅ `vendorId` dropdown filter | Exact match by vendor UUID |
| Brand | ✅ `brandId` | Exact match by brand UUID |
| Category | ✅ `categoryId` | Exact match by category UUID |
| Office location / campus | ✅ `officeLocationId` | |
| Room | ✅ `roomId` | |
| Status | ✅ `status` | Full enum supported |
| Assigned / Unassigned | ✅ `isDisposed` for base, but **no `assignedToUserId=null` param** | No direct "unassigned" filter — workaround: client-side filtering on result set, or future backend param |
| Purchase date range | ✅ `purchaseDateFrom` / `purchaseDateTo` | |
| Price range | ✅ `minPrice` / `maxPrice` | |

**Recommended minor backend additions (optional, post-MVP):**
1. Add `poNumber` to the `search` OR clause in `InventoryService.findAll()` so keyword search covers PO numbers.
2. Add `isAssigned` boolean query param (`assignedToUserId IS NOT NULL`).

---

## 3. Prisma Schema — Equipment Model Fields

Relevant fields from `model equipment` in `schema.prisma`:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `assetTag` | String (unique) | Human-readable identifier |
| `serialNumber` | String? | Device serial |
| `name` | String | Equipment name |
| `description` | String? | |
| `brandId` | FK → `brands` | |
| `modelId` | FK → `models` | |
| `locationId` | FK → `locations` | Legacy building/room location |
| `officeLocationId` | FK → `OfficeLocation` | Campus/site (used in UI) |
| `roomId` | FK → `Room` | Specific room at a location |
| `categoryId` | FK → `categories` | |
| `assignedToUserId` | FK → `User` | Person the equipment is assigned to |
| `purchaseDate` | DateTime? | |
| `purchasePrice` | Decimal(10,2)? | |
| `fundingSource` | String? | Free-text legacy field |
| `fundingSourceId` | FK → `FundingSource` | Structured funding source |
| `poNumber` | String? | Purchase order number |
| `vendorId` | FK → `vendors` | |
| `status` | String | `active`, `available`, `maintenance`, `storage`, `disposed`, `lost`, `damaged`, `reserved` |
| `condition` | String? | `excellent`, `good`, `fair`, `poor`, `broken` |
| `isDisposed` | Boolean | |
| `disposedDate` | DateTime? | |
| `disposedReason` | String? | |
| `warrantyExpires` | DateTime? | |
| `barcode` | String? (unique) | |
| `notes` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## 4. Legacy System Reference (`equipSearch.php`)

The legacy PHP search supported five discrete search modes submitted via separate buttons:

1. **Tag Search** — `equip_tag LIKE '$tag'`
2. **Serial Search** — `equip_serial LIKE '$serial'`
3. **PO Search** — `equip_po = '$po'` (exact)
4. **Vendor Search** — `equip_vendor LIKE '$vendor'`
5. **Location Search** — School + Room + Funds dropdowns

**Legacy results columns:** School, Room, Tag#, Type, Brand, Model, Serial, PO#, Price, Funds, Purchase Date, Disposal Date, Vendor

**Key insight:** The legacy tool treated each identifier as its own search mode. The new page should unify these into a single keyword bar **plus** a rich filter panel — a major UX improvement.

---

## 5. Frontend UI/UX Patterns (Established Conventions)

From analysis of `InventoryManagement.tsx` and `DisposedEquipment.tsx`:

### 5.1 Layout Pattern
- Top-level wrapper: `<div>` → `<main className="page-content">` → `<div className="container">`
- Page header: `<div className="page-header">` with `<h2 className="page-title">` and `<p className="page-description">`
- Cards: `<div className="card">` and `<div className="card mb-6">`
- Grid layouts: `<div className="grid grid-cols-4 gap-4">`

### 5.2 Form Elements
- Text inputs: `<input className="form-input" />`
- Select dropdowns: `<select className="form-select">`
- Labels: `<label className="form-label">`
- Buttons: `className="btn btn-primary"`, `btn-secondary"`, `"btn-ghost"`, `"btn-sm"`

### 5.3 Table Pattern
- `<table className="table">` with `<thead>/<tbody><tr><th>/<td>` structure
- Card wrapper with `padding: 0, overflowX: 'auto'`
- Loading spinner: inline CSS `border + borderTop animation: spin`
- Empty state: centered text message

### 5.4 Pagination Pattern
- `paginationModel: { page: number (0-based), pageSize: number }`
- Pagination controls in `borderTop` div inside the card
- Page sizes: 25, 50, 100
- Shows "Showing X to Y of Z items"

### 5.5 Status Badge Pattern
```tsx
const getStatusBadgeClass = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: 'badge-success',
    available: 'badge-success',
    maintenance: 'badge-error',
    ...
  };
  return statusMap[status] || 'badge-error';
};
// Usage: <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span>
```

### 5.6 Service Call Pattern
```tsx
import inventoryService from '../services/inventory.service';
const response = await inventoryService.getInventory({ page, limit, ...filters });
setItems(response.items);
setTotal(response.total);
```

### 5.7 Reference Data Loading Pattern (from DisposedEquipment.tsx)
```tsx
import { locationService } from '../services/location.service';
import { categoriesService } from '../services/referenceDataService';
// Load in useEffect, store in state arrays, map to <option> elements
```

---

## 6. New Page Specification: Advanced Equipment Search

### 6.1 Route & Navigation

| Property | Value |
|---|---|
| **Route path** | `/equipment-search` |
| **Component file** | `frontend/src/pages/EquipmentSearch.tsx` |
| **Nav section** | Inventory |
| **Nav label** | Equipment Search |
| **Nav icon** | 🔍 |
| **Auth** | `<ProtectedRoute>` (no `requireAdmin`) |
| **Permission** | TECHNOLOGY level 1+ (same as inventory view) |

**Nav location in `AppLayout.tsx`** — add between "Inventory" and "Disposed Equipment":
```tsx
{ label: 'Equipment Search', icon: '🔍', path: '/equipment-search' },
```

### 6.2 Page Purpose & Key Differences from `InventoryManagement`

| Aspect | InventoryManagement | EquipmentSearch |
|---|---|---|
| Primary goal | Browse + manage all inventory | Find a specific device fast |
| Filter panel | Minimal (search + status + disposed toggle) | Comprehensive (10+ filters, large filter section) |
| Actions per row | Edit, History, Delete, Assign, Reactivate | View/Navigate only (read-only lookup) |
| Stat cards | Yes (total, active, disposed, value) | No (not needed — pure search) |
| isDisposed default | `false` (active only) | All records by default (search everything) |
| Result click | Edit in-place dialog | Navigate to `/inventory` with item highlighted OR open detail drawer |
| Columns | Asset Tag, Name, Category, Brand, Location, Assigned To, Status, Value | Wider set: + Serial #, Model, PO #, Vendor, Room, Purchase Date, Purchase Price |
| Export | CRUD-oriented | Search-result export |

### 6.3 Filter Panel Specification

Layout: two rows of 4 columns each (8 filter slots), plus a row of date pickers, plus action buttons.

#### Row 1 — Identifier Filters
| # | Label | Input Type | Maps To | Notes |
|---|---|---|---|---|
| 1 | Keyword Search | `<input type="text">` | `search` | Searches assetTag, name, serialNumber, description, notes. Spans 2 columns. |
| 2 | Asset Tag | `<input type="text">` | `search` (pre-filled with tag prefix, or dedicated field) | Hint: "Exact or partial asset tag" |
| 3 | Serial Number | `<input type="text">` | `search` | Hint: "Exact or partial serial #" |
| 4 | PO Number | `<input type="text">` | `search` | Until `poNumber` is added to backend OR clause, use `search`. Display note. |

**Implementation note:** Because the API's `search` param is broad (assetTag + name + serial + description + notes), dedicated "asset tag" and "serial" fields should be combined into the single `search` param when submitted. This matches the legacy approach and avoids backend changes. Alternatively, the three fields can be OR'd client-side into a single `search` call — but since only one call is made at a time, the UX should indicate that entering a specific field will search all fields.

**Better approach:** Use `search` as the unified keyword box spanning 2 cols. Keep "Asset Tag Only" and "Serial Only" as informational placeholders that feed into `search`. This matches backend capability exactly.

#### Row 2 — Category/Reference Filters
| # | Label | Input Type | Maps To | API Param |
|---|---|---|---|---|
| 1 | Category | `<select>` | `categoriesService.getAll()` | `categoryId` |
| 2 | Brand | `<select>` | `brandsService.getAll()` | `brandId` |
| 3 | Vendor | `<select>` | `vendorsService.getAll()` | `vendorId` |
| 4 | Model | `<select>` | `modelsService.getAll()` | `modelId` |

#### Row 3 — Location & Status Filters
| # | Label | Input Type | Maps To | API Param |
|---|---|---|---|---|
| 1 | Campus / Office Location | `<select>` | `locationService.getAllLocations()` | `officeLocationId` |
| 2 | Room | `<select>` (depends on locationId) | Filtered room list | `roomId` |
| 3 | Status | `<select>` | Enum values | `status` |
| 4 | Show Disposed | `<select>` | `All` / `Active Only` / `Disposed Only` | `isDisposed` |

#### Row 4 — Date Range Filters
| # | Label | Input Type | API Param |
|---|---|---|---|
| 1 | Purchase Date From | `<input type="date">` | `purchaseDateFrom` |
| 2 | Purchase Date To | `<input type="date">` | `purchaseDateTo` |
| 3 | Price Min | `<input type="number">` | `minPrice` |
| 4 | Price Max | `<input type="number">` | `maxPrice` |

#### Filter Action Buttons
```
[🔍 Search]  [Clear Filters]  [⬇️ Export Excel]
```

### 6.4 Results Table Columns

| Column | Source Field | Notes |
|---|---|---|
| Asset Tag | `item.assetTag` | Bold, clickable link |
| Name | `item.name` | |
| Status | `item.status` | Badge with color (`badge-success` / `badge-error`) |
| Category | `item.category?.name` | |
| Brand | `item.brand?.name` | |
| Model | `item.model?.name` | |
| Serial # | `item.serialNumber` | `—` if null |
| PO # | `item.poNumber` | `—` if null |
| Vendor | `item.vendor?.name` | `—` if null |
| Campus/Location | `item.officeLocation?.name` | |
| Room | `item.room?.name` | `—` if null |
| Assigned To | `item.assignedToUser?.displayName \|\| firstName + lastName` | "Unassigned" if null |
| Purchase Date | `item.purchaseDate` | Formatted `toLocaleDateString()` |
| Purchase Price | `item.purchasePrice` | `$X,XXX.XX` format |

Total: 14 columns. The table must be horizontally scrollable (`overflowX: 'auto'`).

### 6.5 Row Click / Navigation Behavior

**Option A (Recommended for MVP):** Each row's Asset Tag cell is a link that navigates to `/inventory` with the item's asset tag pre-populated in the search box. This reuses the existing edit flow.

Use React Router `useNavigate`:
```tsx
const navigate = useNavigate();
const handleRowClick = (item: InventoryItem) => {
  navigate(`/inventory?highlight=${item.id}`);
};
```
(Note: `InventoryManagement.tsx` would need a small update to read and highlight `?highlight=<id>` from the URL query string — this is a Phase 2 enhancement.)

**Option B (Full MVP):** Open a read-only **Detail Drawer** (right-side slide-in panel) showing all item fields. Include an "Edit" button that opens `InventoryFormDialog`. This keeps the user on the search page.

**Recommendation:** Implement Option B — the Detail Drawer — because it preserves search context (filters + scroll position). The drawer is a new component specific to this page.

### 6.6 Detail Drawer Component

**File:** `frontend/src/components/inventory/EquipmentDetailDrawer.tsx`

**Props:**
```tsx
interface EquipmentDetailDrawerProps {
  item: InventoryItem | null;
  open: boolean;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
}
```

**Layout:**
- Fixed right panel, full viewport height, width ~480px
- Overlay backdrop
- Header: Asset Tag + Name + Close button
- Body: two-column key/value grid of all 14+ fields
- Footer: `[Edit Item]` `[View History]` `[Close]` buttons
- Edit button opens `InventoryFormDialog` (already exists)
- History button opens `InventoryHistoryDialog` (already exists)

**CSS classes to use:** `.card`, `.form-label`, `.badge`, `.btn`, `.btn-primary`, `.btn-ghost`

### 6.7 Auto-Search Behavior

- **On mount:** Execute initial search with default params (all items, page 1, limit 25)
- **On filter change:** Do NOT auto-search on change (too many requests). Use explicit `[Search]` button.
- **Exception:** Clear Filters button resets state AND re-triggers search immediately.
- **Keyboard shortcut:** `Enter` key in any filter input triggers search.

### 6.8 State Structure

```tsx
interface SearchFilters {
  search: string;               // keyword (unified)
  categoryId: string;
  brandId: string;
  vendorId: string;
  modelId: string;
  officeLocationId: string;
  roomId: string;
  status: string;               // '' = all
  isDisposed: string;           // '' = all, 'true', 'false'
  purchaseDateFrom: string;
  purchaseDateTo: string;
  minPrice: string;
  maxPrice: string;
}

interface PaginationModel {
  page: number;       // 0-based (converted to 1-based for API)
  pageSize: number;   // default 25
}

// Component state
const [items, setItems] = useState<InventoryItem[]>([]);
const [loading, setLoading] = useState(false);   // false on mount (no auto-fetch)
const [total, setTotal] = useState(0);
const [paginationModel, setPaginationModel] = useState<PaginationModel>({ page: 0, pageSize: 25 });
const [filters, setFilters] = useState<SearchFilters>({ ...defaultFilters });
const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
const [drawerOpen, setDrawerOpen] = useState(false);
const [editDialogOpen, setEditDialogOpen] = useState(false);
const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

// Reference data
const [categories, setCategories] = useState<Category[]>([]);
const [brands, setBrands] = useState<Brand[]>([]);
const [vendors, setVendors] = useState<Vendor[]>([]);
const [models, setModels] = useState<EquipmentModel[]>([]);
const [officeLocations, setOfficeLocations] = useState<OfficeLocationOption[]>([]);
const [rooms, setRooms] = useState<RoomOption[]>([]);
```

### 6.9 API Filters Construction

```tsx
const buildApiFilters = (): InventoryFilters => ({
  page: paginationModel.page + 1,
  limit: paginationModel.pageSize,
  search: filters.search || undefined,
  categoryId: filters.categoryId || undefined,
  brandId: filters.brandId || undefined,
  vendorId: filters.vendorId || undefined,
  modelId: filters.modelId || undefined,
  officeLocationId: filters.officeLocationId || undefined,
  roomId: filters.roomId || undefined,
  status: (filters.status as EquipmentStatus) || undefined,
  isDisposed: filters.isDisposed === 'true' ? true : filters.isDisposed === 'false' ? false : undefined,
  purchaseDateFrom: filters.purchaseDateFrom ? new Date(filters.purchaseDateFrom).toISOString() : undefined,
  purchaseDateTo: filters.purchaseDateTo ? new Date(filters.purchaseDateTo).toISOString() : undefined,
  minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
  maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
});
```

### 6.10 Reference Data Loading

Load all dropdown data once on mount:

```tsx
useEffect(() => {
  const loadReferenceData = async () => {
    const [cats, brnds, vnds, locs] = await Promise.all([
      categoriesService.getAll({ limit: 500 }),
      brandsService.getAll({ limit: 500, isActive: true }),
      vendorsService.getAll({ limit: 500, isActive: true }),
      locationService.getAllLocations(),
    ]);
    setCategories(cats.items);
    setBrands(brnds.items);
    setVendors(vnds.items);
    setOfficeLocations(locs.map(l => ({ id: l.id, name: l.name })));
  };
  loadReferenceData();
}, []);
```

**Room cascading:** When `officeLocationId` changes, fetch rooms for that location:
```tsx
useEffect(() => {
  if (filters.officeLocationId) {
    // fetch rooms by location
    roomService.getRoomsByLocation(filters.officeLocationId).then(setRooms);
  } else {
    setRooms([]);
    setFilters(prev => ({ ...prev, roomId: '' }));
  }
}, [filters.officeLocationId]);
```

---

## 7. App.tsx Changes Required

### 7.1 Import
```tsx
import EquipmentSearch from './pages/EquipmentSearch'
```

### 7.2 New Route
Add after the `/disposed-equipment` route:
```tsx
<Route
  path="/equipment-search"
  element={
    <ProtectedRoute>
      <AppLayout>
        <EquipmentSearch />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

---

## 8. AppLayout.tsx Changes Required

In `NAV_SECTIONS`, inside the `Inventory` section, add before `Disposed Equipment`:

```tsx
{
  title: 'Inventory',
  items: [
    { label: 'Inventory', icon: '📦', path: '/inventory' },
    { label: 'Equipment Search', icon: '🔍', path: '/equipment-search' },  // NEW
    { label: 'Disposed Equipment', icon: '🗑️', path: '/disposed-equipment' },
    { label: 'Reference Data', icon: '🏷️', path: '/reference-data', adminOnly: true },
  ],
},
```

---

## 9. Files to Create / Modify

| Action | File | Notes |
|---|---|---|
| **CREATE** | `frontend/src/pages/EquipmentSearch.tsx` | Main page component |
| **CREATE** | `frontend/src/components/inventory/EquipmentDetailDrawer.tsx` | Right-side detail drawer |
| **MODIFY** | `frontend/src/App.tsx` | Add `/equipment-search` route |
| **MODIFY** | `frontend/src/components/layout/AppLayout.tsx` | Add nav link |

---

## 10. Detailed Component Structure

### `EquipmentSearch.tsx` Structure

```
EquipmentSearch
├── Page Header (title + description)
├── Filter Panel (card)
│   ├── Row 1: Keyword Search (span 2) + Category + Brand
│   ├── Row 2: Model + Vendor + Campus/Location + Room
│   ├── Row 3: Status + Show Disposed + Purchase Date From + Purchase Date To
│   ├── Row 4: Price Min + Price Max + [spacer] + [spacer]
│   └── Action Row: [Search] [Clear] [Export Excel]
├── Results Info Bar ("X results found" or "No search performed yet")
├── Results Table (card, overflowX auto)
│   ├── Loading Spinner
│   ├── Empty State
│   └── Table
│       ├── thead: 14 columns
│       └── tbody: rows (each row clickable → opens drawer)
└── Pagination Controls
    └── (25 / 50 / 100 rows, prev/next)

EquipmentDetailDrawer (overlay)
├── Header: Asset Tag + Name + [×]
├── Body: Grid of field/value pairs
│   ├── Status badge
│   ├── Category / Brand / Model
│   ├── Serial # / PO # / Vendor
│   ├── Campus / Room
│   ├── Assigned To
│   ├── Purchase Date / Price
│   ├── Funding Source
│   ├── Condition
│   ├── Notes
│   └── Created / Updated timestamps
└── Footer: [Edit Item] [View History] [Close]
```

### `EquipmentDetailDrawer.tsx` Structure

```tsx
// Overlay: fixed inset-0 backdrop with z-index
// Panel: fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl
// Uses existing InventoryFormDialog and InventoryHistoryDialog
```

Implement drawer via inline CSS (no MUI):
```tsx
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 }} onClick={onClose} />
<div style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: '480px', background: 'white', zIndex: 1001, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)' }}>
```

---

## 11. UX Considerations

### 11.1 Empty State (Before First Search)
Show a friendly prompt:
```
🔍 Search for equipment
Use the filters above and click Search to find any device by asset tag,
serial number, PO number, vendor, location, or any combination.
```

### 11.2 No Results State
```
No equipment found matching your search criteria.
Try broadening your filters or check for typos.
```

### 11.3 Column Sort
- Click on column header to sort
- `sortBy` + `sortOrder` params are already supported by the API
- Visual indicator: `▲` / `▼` arrow on active sort column
- Default sort: `createdAt desc`

### 11.4 Large Result Sets
- Default page size: 25 (smaller than InventoryManagement's 50 — search results are browsed)
- Show total count prominently: `"Found 342 items matching your search"`

### 11.5 Keyboard Accessibility
- `Enter` in any filter input triggers search
- `Escape` closes the detail drawer
- Tab order: Keyword → Category → Brand → Model → Vendor → Location → Room → Status → Disposed → Dates → Prices → Search button

---

## 12. Export Behavior

Re-use `inventoryService.exportInventory()` with current filters:
```tsx
const handleExport = async () => {
  setExporting(true);
  try {
    await inventoryService.exportInventory({
      format: 'xlsx',
      filters: buildApiFilters(),
    });
  } finally {
    setExporting(false);
  }
};
```

---

## 13. Status Badge Color Map

```tsx
const getStatusBadgeClass = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: 'badge-success',
    available: 'badge-success',
    maintenance: 'badge-error',
    storage: 'badge-error',
    disposed: 'badge-error',
    lost: 'badge-error',
    damaged: 'badge-error',
    reserved: 'badge-error',
  };
  return statusMap[status] || 'badge-error';
};
```

---

## 14. Summary of Findings

### What Already Works (No Backend Changes Needed for MVP)
- Full-text keyword search across 5 fields via `search` param
- All dropdown filters: category, brand, vendor, model, location, room, status
- `isDisposed` boolean filter
- Date range filters (purchase, disposed)
- Price range filters
- Pagination + sorting
- All required `InventoryItem` fields are already in the type and returned by the API

### Minor Backend Gap (Post-MVP Optional Enhancement)
- `poNumber` is not included in the `search` OR clause in `InventoryService.findAll()`. Adding it would take one line in the service file. Until then, PO number search will not work via the keyword box.
- No `isAssigned` filter param (assigned vs. unassigned). Client-side note-only for MVP.

### Key Design Decisions
1. **Unified keyword box** (not 5 separate search buttons like legacy) — modern UX
2. **Detail Drawer** instead of navigation — preserves search context
3. **No stats cards** — this is a lookup tool, not a management dashboard
4. **Default `isDisposed: undefined`** — searches everything (active + disposed combined) because a tech looking for a device doesn't always know its disposal status
5. **Explicit Search button** — not auto-search on filter change, to avoid unnecessary API calls while user is still configuring filters
6. **Read-only results** — no inline edit/delete/create actions (user can open drawer → Edit)

---

*Spec complete. Ready for Implementation Phase (Subagent H5).*

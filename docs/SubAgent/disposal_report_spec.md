# Disposal Management Report — Frontend Page Specification

**Created:** 2026-03-04  
**Author:** Research SubAgent  
**Status:** Ready for Implementation

---

## 1. Executive Summary

The Tech-V2 system already has full backend infrastructure for tracking disposed equipment. The `equipment` table carries `isDisposed`, `disposedDate`, `disposedReason`, and `disposalDate` fields. The existing `GET /api/inventory` endpoint accepts `isDisposed=true` to return only disposed records. One **minor backend enhancement** is needed (add `disposedDateFrom`/`disposedDateTo` filter support) before implementing the frontend page.

---

## 2. Current Backend State

### 2.1 Equipment Model — Disposal-Related Fields (schema.prisma)

```prisma
model equipment {
  id             String    @id @default(uuid())
  assetTag       String    @unique
  serialNumber   String?
  name           String
  status         String    @default("active")   // becomes "disposed"
  isDisposed     Boolean   @default(false)       // ← primary disposal flag
  disposedDate   DateTime?                       // ← set by soft-delete (DELETE /api/inventory/:id)
  disposedReason String?                         // ← can be set on update
  disposalDate   DateTime?                       // ← additional date field (legacy import)
  notes          String?
  brandId        String?
  modelId        String?
  categoryId     String?
  officeLocationId String?
  roomId         String?
  vendorId       String?
  fundingSourceId String?
  fundingSource  String?
  poNumber       String?
  purchaseDate   DateTime?
  purchasePrice  Decimal?  @db.Decimal(10, 2)
  assignedToUserId String?
  // ... all relations
  @@index([isDisposed])
}
```

### 2.2 Existing Disposal API Endpoints

#### `GET /api/inventory`
The primary endpoint used for the disposal report.

**Key query parameters:**
| Parameter | Type | Description |
|---|---|---|
| `isDisposed` | `"true" \| "false"` | **Filter by disposal flag** |
| `status` | string | Can also filter by `"disposed"` |
| `page` | number | Page number (1-based) |
| `limit` | number | Page size (default 50) |
| `search` | string | Search across assetTag, name, serialNumber |
| `officeLocationId` | string | Filter by office location UUID |
| `roomId` | string | Filter by room UUID |
| `categoryId` | string | Filter by category UUID |
| `brandId` | string | Filter by brand UUID |
| `vendorId` | string | Filter by vendor UUID |
| `sortBy` | string | Field to sort by |
| `sortOrder` | `"asc" \| "desc"` | Sort direction |
| `purchaseDateFrom` | ISO date string | Purchase date range start |
| `purchaseDateTo` | ISO date string | Purchase date range end |

**Current Gap:** No `disposedDateFrom` / `disposedDateTo` parameters exist. These must be added to support filtering by date of disposal.

**Response shape:**
```typescript
{
  items: InventoryItem[];   // array of equipment records with full relations
  total: number;            // total matching records
  page: number;
  limit: number;
  totalPages: number;
}
```

**InventoryItem shape (disposal-relevant fields):**
```typescript
{
  id: string;
  assetTag: string;
  serialNumber?: string | null;
  name: string;
  status: string;          // "disposed"
  isDisposed: boolean;     // true
  disposedDate?: string | null;   // ISO datetime string
  disposedReason?: string | null;
  disposalDate?: string | null;   // secondary date (from legacy import)
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  poNumber?: string | null;
  fundingSource?: string | null;
  notes?: string | null;
  brand?: { id: string; name: string } | null;
  model?: { id: string; name: string; modelNumber?: string | null } | null;
  category?: { id: string; name: string } | null;
  officeLocation?: { id: string; name: string; type: string } | null;
  vendor?: { id: string; name: string } | null;
  room?: { id: string; name: string } | null;
  fundingSourceRef?: { id: string; name: string } | null;
}
```

#### `DELETE /api/inventory/:id` (soft delete)
When called without `?permanent=true`, the service performs:
```typescript
await prisma.equipment.update({
  where: { id },
  data: {
    isDisposed: true,
    disposedDate: new Date(),
    status: 'disposed',
  },
});
```
This is how items enter the disposed state. `disposedReason` is **not** set during soft-delete — it must be set via a `PUT /api/inventory/:id` update call.

#### `PUT /api/inventory/:id`
Used to set `disposedReason`, `disposedDate`, `disposalDate`, and to reactivate (`isDisposed: false, status: 'active'`).

#### `POST /api/inventory/export`
Exports full inventory including a "Disposed: Yes/No" column. Can be called with `filters: { isDisposed: true }` to export only disposed items. Returns `.xlsx` blob. The controller handles the blob download.

---

## 3. Required Backend Changes

### 3.1 Add `disposedDateFrom` / `disposedDateTo` Query Params

**File:** `c:\Tech-V2\backend\src\validators\inventory.validators.ts`  
**Change:** Add to `GetInventoryQuerySchema`:
```typescript
disposedDateFrom: z.string().optional(),
disposedDateTo: z.string().optional(),
```

**File:** `c:\Tech-V2\backend\src\controllers\inventory.controller.ts`  
**Change:** Destructure new params alongside `purchaseDateFrom`/`purchaseDateTo` in `getInventory()`:
```typescript
const { ..., disposedDateFrom, disposedDateTo } = req.query;
// In the query object:
disposedDateFrom: disposedDateFrom ? new Date(disposedDateFrom as string) : undefined,
disposedDateTo: disposedDateTo ? new Date(disposedDateTo as string) : undefined,
```

**File:** `c:\Tech-V2\backend\src\types\inventory.types.ts`  
**Change:** Add to `InventoryQuery` interface:
```typescript
disposedDateFrom?: Date;
disposedDateTo?: Date;
```

**File:** `c:\Tech-V2\backend\src\services\inventory.service.ts`  
**Change:** Destructure new params in `findAll()` and add `where` clause:
```typescript
const { ..., disposedDateFrom, disposedDateTo } = query;

// After existing purchaseDate filter:
if (disposedDateFrom || disposedDateTo) {
  where.disposedDate = {};
  if (disposedDateFrom) where.disposedDate.gte = disposedDateFrom;
  if (disposedDateTo) where.disposedDate.lte = disposedDateTo;
}
```

---

## 4. Legacy System Reference (disposed.php)

The legacy PHP page at `c:\wwwroot\disposed.php`:

- **Access control:** `$_SESSION['techLevel'] <= 1` — admin only (note: legacy system inverted the numbering)
- **Data source:** Two-table join: `dispose` table (tag + notes) + `equip` table (the rest)
- **No filters at all** — displayed every disposed item, sorted by `dispose_tag`
- **Columns displayed:**
  1. Tag# (linked to `updateDispose.php`)
  2. Disposal Date (`equip_dispose` field)
  3. Vendor (`equip_vendor`)
  4. Type / Category (`equip_type`)
  5. Brand (`equip_brand`)
  6. Model (`equip_model`)
  7. Serial Number (`equip_serial`)
  8. PO# (`equip_po`)
  9. Price (`equip_price`)
  10. Funds / Funding Source (`equip_funds`)
  11. Purchase Date (`equip_install`)
  12. Disposal Info / Notes (sub-row, colspan=10)

The new page should replicate all these columns and add the improvements described below.

---

## 5. Frontend Patterns (Match Existing Codebase)

### 5.1 State Management
- **NOT TanStack Query** — uses plain `useState` + `useEffect`
- Pattern: `const [items, setItems] = useState<InventoryItem[]>([])` + `fetchData()` called in `useEffect`
- Loading state: `const [loading, setLoading] = useState(true)`
- Error state: `const [error, setError] = useState<string | null>(null)`

### 5.2 API Calls
- Import from `'../services/inventory.service'` (singleton instance, default export)
- Example: `const response = await inventoryService.getInventory({ isDisposed: true, ...filters })`
- The `InventoryFilters` type (from `'../types/inventory.types'`) should be extended with `disposedDateFrom`/`disposedDateTo`

### 5.3 UI Components
- **No MUI** — uses custom CSS design system via class names
- Table: `<table className="table">` with `<thead>/<tbody>/<tr>/<th>/<td>`
- Cards: `<div className="card">`
- Buttons: `<button className="btn btn-primary">`, `btn-secondary`, `btn-ghost`, `btn-sm`
- Form controls: `<input className="form-input">`, `<select className="form-select">`
- Labels: `<label className="form-label">`
- Badges: `<span className="badge badge-error">`, `badge-success`
- Grid: `<div className="grid grid-cols-4 gap-4">`
- Page header: `<div className="page-header"><h2 className="page-title">`, `<p className="page-description">`
- Container: `<div className="container">`
- Main wrapper: `<div><main className="page-content"><div className="container">...`
- Loading spinner: inline `borderRadius: '50%', animation: 'spin 1s linear infinite'`

### 5.4 Pagination Pattern
- State: `const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 })`
- Pass to service: `page: paginationModel.page + 1` (service is 1-based, state is 0-based)
- Controls: Previous/Next buttons with disabled state + page counter, rows-per-page select

### 5.5 Export Pattern
```typescript
const handleExport = async () => {
  setExporting(true);
  try {
    await inventoryService.exportInventory({ format: 'xlsx', filters });
  } catch (err: unknown) { ... }
  finally { setExporting(false); }
};
```

---

## 6. Proposed Page Design

### 6.1 File to Create
```
c:\Tech-V2\frontend\src\pages\DisposedEquipment.tsx
```

### 6.2 Route to Add in App.tsx
```tsx
import DisposedEquipment from './pages/DisposedEquipment'

// Inside <Routes>:
<Route
  path="/disposed-equipment"
  element={
    <ProtectedRoute>
      <AppLayout>
        <DisposedEquipment />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```
**Note:** Does NOT use `requireAdmin` — TECHNOLOGY level 1+ can view (same as inventory).

### 6.3 Nav Link to Add in AppLayout.tsx
Add to the `'Inventory'` section in `NAV_SECTIONS`:
```typescript
{
  title: 'Inventory',
  items: [
    { label: 'Inventory', icon: '📦', path: '/inventory' },
    { label: 'Disposed Equipment', icon: '🗑️', path: '/disposed-equipment' },
    { label: 'Reference Data', icon: '🏷️', path: '/reference-data', adminOnly: true },
  ],
},
```

### 6.4 Page Header
- Title: `Disposed Equipment`
- Description: `View all equipment that has been disposed or decommissioned`

### 6.5 Stats Row (optional, 3 cards)
Using existing `getStats()` endpoint, show:
1. Total Disposed Items (`stats.disposedItems`)
2. Total Original Value (sum of `purchasePrice` for disposed — calculated client-side from the current page fetch, or optionally derived from stats if available)
3. Most recent disposal date

### 6.6 Filter Panel

| Filter | Element | Notes |
|---|---|---|
| Search | `<input className="form-input">` | Searches assetTag, name, serialNumber |
| Office Location | `<select className="form-select">` | Fetches from `locationService.getLocations()` |
| Category | `<select className="form-select">` | Fetches from `referenceDataService.getCategories()` |
| Disposal Date From | `<input type="date" className="form-input">` | Maps to `disposedDateFrom` query param |
| Disposal Date To | `<input type="date" className="form-input">` | Maps to `disposedDateTo` query param |
| Clear Filters button | `<button className="btn btn-secondary btn-sm">` | Resets all filters |

### 6.7 Table Columns

| # | Column Header | Data Field | Notes |
|---|---|---|---|
| 1 | Asset Tag | `item.assetTag` | Bold |
| 2 | Name | `item.name` | |
| 3 | Category | `item.category?.name` | |
| 4 | Brand | `item.brand?.name` | |
| 5 | Model | `item.model?.name` | |
| 6 | Serial # | `item.serialNumber` | |
| 7 | Location | `item.officeLocation?.name` | |
| 8 | Disposal Date | `item.disposedDate \|\| item.disposalDate` | Formatted as locale date |
| 9 | Disposal Reason | `item.disposedReason` | |
| 10 | PO # | `item.poNumber` | |
| 11 | Purchase Price | `item.purchasePrice` | Formatted as `$X,XXX.XX` |
| 12 | Funding Source | `item.fundingSourceRef?.name \|\| item.fundingSource` | |
| 13 | Purchase Date | `item.purchaseDate` | Formatted as locale date |
| 14 | Actions | — | Reactivate button (`♻️`, level 2+) |

### 6.8 Action: Reactivate
```typescript
const handleReactivate = async (item: InventoryItem) => {
  if (!window.confirm(`Reactivate "${item.name}" (${item.assetTag})?`)) return;
  try {
    await inventoryService.updateItem(item.id, {
      isDisposed: false,
      status: 'active',
      disposedDate: null,
      disposedReason: null,
      disposalDate: null,
    });
    fetchDisposedItems();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to reactivate item');
  }
};
```
Reactivate button should only render if user is admin (`user?.roles?.includes('ADMIN')`) or if the app expands permission checks later — for now show it to all authenticated users with TECHNOLOGY access.

### 6.9 Export Button
```
⬇️ Export Excel
```
Calls `inventoryService.exportInventory({ format: 'xlsx', filters: { isDisposed: true, ...activeFilters } })`. Uses existing `POST /api/inventory/export` which handles blobs and initiates download.

### 6.10 Pagination
Identical to `InventoryManagement.tsx`: `{ page: 0, pageSize: 50 }` state, Previous/Next buttons, rows-per-page select (25/50/100), "Showing X to Y of Z items" label.

---

## 7. Security

| Concern | Decision |
|---|---|
| View access | `TECHNOLOGY level 1+` (same as inventory) — no `requireAdmin` on the route |
| Reactivate action | `TECHNOLOGY level 2+` — the `PUT /api/inventory/:id` endpoint already enforces `checkPermission('TECHNOLOGY', 2)` on the backend. Frontend should optionally hide the reactivate button for level-1 users, but backend is the authoritative gate. |
| Export | `TECHNOLOGY level 1+` — `POST /api/inventory/export` already enforces `checkPermission('TECHNOLOGY', 1)` |

---

## 8. Frontend Type Extensions Needed

**File:** `c:\Tech-V2\frontend\src\types\inventory.types.ts`  
Add to `InventoryFilters` interface:
```typescript
disposedDateFrom?: string;
disposedDateTo?: string;
```

**File:** `c:\Tech-V2\frontend\src\services\inventory.service.ts`  
No changes needed — the existing `getInventory(filters)` method already serialises all `InventoryFilters` key/value pairs into URL params generically.

---

## 9. Implementation Steps (Ordered)

### Step 1 — Backend: Validator
Edit `c:\Tech-V2\backend\src\validators\inventory.validators.ts`  
Add `disposedDateFrom` and `disposedDateTo` as optional string fields to `GetInventoryQuerySchema`.

### Step 2 — Backend: Types
Edit `c:\Tech-V2\backend\src\types\inventory.types.ts`  
Add `disposedDateFrom?: Date` and `disposedDateTo?: Date` to the `InventoryQuery` interface.

### Step 3 — Backend: Controller
Edit `c:\Tech-V2\backend\src\controllers\inventory.controller.ts`  
Destructure `disposedDateFrom` and `disposedDateTo` from `req.query` in `getInventory()` and pass to the service query object (parse with `new Date()`).

### Step 4 — Backend: Service
Edit `c:\Tech-V2\backend\src\services\inventory.service.ts`  
Destructure new params in `findAll()` and add Prisma where clause filtering `disposedDate` by date range.

### Step 5 — Frontend: Types
Edit `c:\Tech-V2\frontend\src\types\inventory.types.ts`  
Add `disposedDateFrom?: string` and `disposedDateTo?: string` to `InventoryFilters`.

### Step 6 — Frontend: Page Component
Create `c:\Tech-V2\frontend\src\pages\DisposedEquipment.tsx`  
Implement the full page per Section 6 above. Model structure closely after `InventoryManagement.tsx`.

### Step 7 — Frontend: App Router
Edit `c:\Tech-V2\frontend\src\App.tsx`  
Import `DisposedEquipment` and add the `/disposed-equipment` route per Section 6.2.

### Step 8 — Frontend: Sidebar Navigation
Edit `c:\Tech-V2\frontend\src\components\layout\AppLayout.tsx`  
Add the `Disposed Equipment` nav item to the `'Inventory'` section per Section 6.3.

---

## 10. Files to Modify / Create

| Action | File |
|---|---|
| MODIFY | `c:\Tech-V2\backend\src\validators\inventory.validators.ts` |
| MODIFY | `c:\Tech-V2\backend\src\types\inventory.types.ts` |
| MODIFY | `c:\Tech-V2\backend\src\controllers\inventory.controller.ts` |
| MODIFY | `c:\Tech-V2\backend\src\services\inventory.service.ts` |
| MODIFY | `c:\Tech-V2\frontend\src\types\inventory.types.ts` |
| CREATE | `c:\Tech-V2\frontend\src\pages\DisposedEquipment.tsx` |
| MODIFY | `c:\Tech-V2\frontend\src\App.tsx` |
| MODIFY | `c:\Tech-V2\frontend\src\components\layout\AppLayout.tsx` |

---

## 11. Source References

1. `c:\Tech-V2\backend\src\routes\inventory.routes.ts` — all inventory HTTP routes and permission levels
2. `c:\Tech-V2\backend\src\controllers\inventory.controller.ts` — soft-delete logic and export handler
3. `c:\Tech-V2\backend\src\services\inventory.service.ts` — `findAll()` where-clause builder and `delete()` soft-dispose logic
4. `c:\Tech-V2\backend\prisma\schema.prisma` — `equipment` model with all disposal fields and indexes
5. `c:\Tech-V2\frontend\src\pages\InventoryManagement.tsx` — reference for all frontend patterns (state, table, pagination, export, filter panel)
6. `c:\Tech-V2\frontend\src\components\layout\AppLayout.tsx` — sidebar `NAV_SECTIONS` structure
7. `c:\Tech-V2\frontend\src\App.tsx` — existing route patterns and `ProtectedRoute` usage
8. `c:\Tech-V2\frontend\src\services\api.ts` — Axios instance with cookie auth and CSRF handling
9. `c:\Tech-V2\frontend\src\types\inventory.types.ts` — `InventoryItem`, `InventoryFilters`, `InventoryListResponse` types
10. `c:\wwwroot\disposed.php` — legacy system columns, access control model, and data fields

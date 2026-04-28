# Quick-Wins Implementation Specification

**Project:** Tech-V2  
**Date:** 2026-03-03  
**Author:** Research & Specification Agent  
**Purpose:** Precise, implementation-ready spec for the five quick-win features

---

## Executive Summary — Key Decisions

After reading the codebase thoroughly, the actual work remaining is **much smaller** than the stated feature list implies. Most items are already fully or partially implemented:

| Feature | Status | Remaining Work |
|---|---|---|
| 1. Nav Shell / AppLayout | ✅ DONE — CSS-based sidebar + top bar exists | None (optional MUI upgrade) |
| 2. Dashboard stats | ✅ DONE — already wired to `/api/inventory/stats` | None (already works) |
| 3. Reference Data admin page | ✅ DONE — tabbed page + backend + service all exist | None |
| 4. Inventory export | ✅ BACKEND DONE — route & controller fully implemented | Add Export button to frontend |
| 5. Dead package cleanup | ❌ NOT DONE | Remove 3 packages |

The only meaningful code change is: **(a) add the Export button to `InventoryManagement.tsx`, and (b) remove dead packages.**

---

## Section 1: Current State

### 1.1 Routing Structure (`App.tsx`)

```
/login                 → <Login />                           (public)
/dashboard             → ProtectedRoute → AppLayout → <Dashboard />
/users                 → ProtectedRoute(requireAdmin) → AppLayout → <Users />
/supervisors           → ProtectedRoute(requireAdmin) → AppLayout → <SupervisorManagement />
/rooms                 → ProtectedRoute(requireAdmin) → AppLayout → <RoomManagement />
/inventory             → ProtectedRoute → AppLayout → <InventoryManagement />
/my-equipment          → ProtectedRoute → AppLayout → <MyEquipment />
/reference-data        → ProtectedRoute(requireAdmin) → AppLayout → <ReferenceDataManagement />
/                      → Navigate to /dashboard
*                      → Navigate to /dashboard
```

Every protected page is already wrapped in `<AppLayout>`. There is no legacy `/funding-sources` route. The nav shell is already in place.

### 1.2 Pages That Exist

| File | Route |
|---|---|
| `frontend/src/pages/Login.tsx` | `/login` |
| `frontend/src/pages/Dashboard.tsx` | `/dashboard` |
| `frontend/src/pages/Users.tsx` | `/users` |
| `frontend/src/pages/SupervisorManagement.tsx` | `/supervisors` |
| `frontend/src/pages/RoomManagement.tsx` | `/rooms` |
| `frontend/src/pages/InventoryManagement.tsx` | `/inventory` |
| `frontend/src/pages/MyEquipment.tsx` | `/my-equipment` |
| `frontend/src/pages/ReferenceDataManagement.tsx` | `/reference-data` |
| `frontend/src/pages/FundingSourceManagement.tsx` | _no route (orphaned)_ |

`FundingSourceManagement.tsx` has **no route** in `App.tsx`. Its functionality is fully duplicated inside the `FundingSourcesTab` component in `ReferenceDataManagement.tsx`.

### 1.3 What `Dashboard.tsx` Currently Renders

1. Calls `inventoryService.getStats()` via `useEffect` → stores in `stats: InventoryStatistics | null`  
2. If `stats` is populated, renders **4 stat cards** in a `grid grid-cols-4 gap-6` div:
   - Total Items (`stats.totalItems`)  
   - Active (`stats.activeItems`)  
   - Disposed (`stats.disposedItems`)  
   - Total Value (`$stats.totalValue`)  
3. Renders a **module card grid** with navigation shortcuts (Inventory, POs, Maintenance, Users, Supervisors, Rooms, Reference Data, Reports).  

All cards use plain CSS utility classes (`card`, `btn`, `grid`, etc.). No MUI components are used.

### 1.4 Inventory Export Route — Actual State

The export route is **NOT commented out**. It is fully active in `inventory.routes.ts`:

```typescript
// POST /api/inventory/export
router.post(
  '/inventory/export',
  validateRequest(ExportInventorySchema, 'body'),
  checkPermission('TECHNOLOGY', 1),
  inventoryController.exportInventory
);
```

And the controller `exportInventory` in `inventory.controller.ts` is **fully implemented**:

- Accepts optional `filters` in the request body (same shape as `getInventory` query params)
- Fetches up to 10,000 matching items via `inventoryService.findAll()`
- Builds 23-column rows (Asset Tag, Name, Category, Brand, Model, Serial #, Status, Condition, Location, Room, Assigned To, Purchase Date, Purchase Price, Vendor, Funding Source, PO Number, Barcode, Warranty Expires, Disposed, Disposal Date, Notes, Created At)
- Uses `xlsx` (`XLSX.utils.json_to_sheet`, `XLSX.write`) to produce a buffer
- Sets `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Sets `Content-Disposition: attachment; filename="inventory-export-YYYY-MM-DD.xlsx"`
- Sends the buffer directly

**The only missing piece is the frontend Export button.** See Section 7.

### 1.5 FundingSource Routes / Controller Pattern

Registered in `server.ts` as `app.use('/api/funding-sources', fundingSourceRoutes)`.

Pattern (used for all reference data routes):
1. `router.use(authenticate)` — all routes require auth
2. `router.use(validateCsrfToken)` — all routes are CSRF-protected
3. Per-route: `checkPermission('TECHNOLOGY', level)` → controller function

Controller functions: parse with Zod schema → delegate to service singleton → `res.json(result)` → `handleControllerError(error, res)` on failure.

### 1.6 Dead Packages

**Backend `package.json`:**
- `passport-azure-ad@^4.3.5` — **no imports in any `src/` file**. The app uses JWT/cookie auth instead of passport.
- `csv-parse@^6.1.0` — only imported in `backend/scripts/import-rooms.ts` (a utility script, not part of the server). Not needed for production runtime.

**Frontend `package.json`:**
- `@azure/msal-react@^3.0.23` — no imports found anywhere in `src/`. The app uses cookie/JWT auth; MSAL is not used for the React component tree.
- `@azure/msal-browser@^4.27.0` — imported in `src/config/authConfig.ts` (creates `msalInstance`, `loginRequest`, `graphScopes`) but **`authConfig.ts` itself is never imported anywhere else in the codebase**. This file is dead code.

---

## Section 2: Prisma Models for Reference Data

### `brands`

```prisma
model brands {
  id          String      @id @default(uuid())
  name        String      @unique
  description String?
  website     String?
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  equipment   equipment[]
  models      models[]
}
```

### `categories`

```prisma
model categories {
  id               String       @id @default(uuid())
  name             String       @unique
  description      String?
  parentId         String?                        // self-referential FK
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  categories       categories?  @relation("categoriesTocategories", fields: [parentId], references: [id])
  other_categories categories[] @relation("categoriesTocategories")
  equipment        equipment[]
}
```

No `isActive` field. Deletion is hard-delete (blocked by FK if children or equipment exist).

### `models`

```prisma
model models {
  id             String      @id @default(uuid())
  name           String
  brandId        String                           // FK → brands (CASCADE delete)
  modelNumber    String?
  description    String?
  specifications String?
  isActive       Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  equipment      equipment[]
  brands         brands      @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@unique([name, brandId])                       // composite uniqueness
}
```

### `vendors`

```prisma
model vendors {
  id              String            @id @default(uuid())
  name            String            @unique
  contactName     String?
  email           String?
  phone           String?
  address         String?
  website         String?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  purchase_orders purchase_orders[]
  equipment       equipment[]
}
```

### `FundingSource` (mapped to `funding_sources`)

```prisma
model FundingSource {
  id          String      @id @default(uuid())
  name        String      @unique
  description String?
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  equipment   equipment[]

  @@index([isActive])
  @@index([name])
  @@map("funding_sources")
}
```

---

## Section 3: Nav Shell Spec

### 3.1 Current State — Already Implemented

`frontend/src/components/layout/AppLayout.tsx` is **fully implemented** with:
- Top header (logo, title, user name, email, logout button)
- Left sidebar with named sections and nav items
- Emoji icons (not MUI icons)
- Active state highlighting via `location.pathname === item.path`
- `adminOnly` filtering via `user?.roles?.includes('ADMIN')`
- Custom CSS in `AppLayout.css`

### 3.2 Nav Items (Current)

| Section | Label | Icon | Path | Admin Only | Status |
|---|---|---|---|---|---|
| _(none)_ | Dashboard | 🏠 | `/dashboard` | No | Active |
| _(none)_ | My Equipment | 💻 | `/my-equipment` | No | Active |
| Inventory | Inventory | 📦 | `/inventory` | No | Active |
| Inventory | Reference Data | 🏷️ | `/reference-data` | Yes | Active |
| Operations | Purchase Orders | 📋 | — | No | Disabled |
| Operations | Maintenance | 🔧 | — | No | Disabled |
| Admin | Users | 👥 | `/users` | Yes | Active |
| Admin | Supervisors | 🏢 | `/supervisors` | Yes | Active |
| Admin | Rooms | 🚪 | `/rooms` | Yes | Active |
| _(none)_ | Reports | 📊 | — | No | Disabled |

### 3.3 Component Tree (Current — No Changes Needed)

```
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={
      <ProtectedRoute>          ← auth guard (redirects to /login if not authed)
        <AppLayout>             ← sidebar + top bar shell
          <Dashboard />         ← page content
        </AppLayout>
      </ProtectedRoute>
    } />
    ...
  </Routes>
</BrowserRouter>
```

### 3.4 Recommendations

**No refactoring is required.** The shell works correctly. If a future upgrade to MUI `<Drawer>` is desired, that is a cosmetic change and out of scope for quick wins.

---

## Section 4: Dashboard Stats Spec

### 4.1 What `/api/inventory/stats` Returns

`GET /api/inventory/stats` → `inventoryService.getStatistics()` returns:

```typescript
interface InventoryStatistics {
  totalItems: number;                           // equipment.count()
  totalValue: number;                           // sum(purchasePrice) where isDisposed=false
  activeItems: number;                          // count where status='active' AND isDisposed=false
  disposedItems: number;                        // count where isDisposed=true
  itemsByStatus: Array<{
    status: string;                             // e.g. "active", "inactive", "maintenance"
    count: number;
  }>;
  itemsByLocation: Array<{
    locationId: string;
    locationName: string;
    count: number;
    totalValue: number;
  }>;
  itemsByCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  recentItems: InventoryItemWithRelations[];    // last 10 items added
}
```

### 4.2 Current Dashboard Implementation

Dashboard **already consumes this endpoint** correctly — `inventoryService.getStats()` calls `GET /api/inventory/stats`. The 4 stat cards already render `totalItems`, `activeItems`, `disposedItems`, and `totalValue`.

The implementation uses raw CSS (`card`, `grid grid-cols-4`) not MUI. It works correctly.

### 4.3 Optional Enhancement (Not Required for Quick Win)

If migration to MUI components is desired:
- Replace `.grid.grid-cols-4` with `<Grid container spacing={3}>`
- Replace `.card` with `<Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>`
- No data or API changes needed

### 4.4 Possible Extra Stat Cards

Using existing data (`itemsByStatus` and `itemsByCategory`):
- Items in Maintenance (`itemsByStatus.find(s => s.status === 'maintenance')?.count`)
- Top category count (`itemsByCategory[0]?.categoryName + count`)

These are optional and require no backend work.

---

## Section 5: Reference Data Backend Spec

### 5.1 Current State — Already Fully Implemented

**File:** `backend/src/routes/referenceData.routes.ts`  
**Controller:** `backend/src/controllers/referenceData.controller.ts`  
**Registered in server.ts:** `app.use('/api', referenceDataRoutes)`

All routes are live:

| Method | Path | Permission | Handler |
|---|---|---|---|
| GET | `/api/brands` | TECHNOLOGY ≥ 1 | `getBrands` |
| GET | `/api/brands/:id` | TECHNOLOGY ≥ 1 | `getBrand` |
| POST | `/api/brands` | TECHNOLOGY ≥ 2 | `createBrand` |
| PUT | `/api/brands/:id` | TECHNOLOGY ≥ 2 | `updateBrand` |
| DELETE | `/api/brands/:id` | TECHNOLOGY ≥ 2 | `deleteBrand` |
| GET | `/api/vendors` | TECHNOLOGY ≥ 1 | `getVendors` |
| GET | `/api/vendors/:id` | TECHNOLOGY ≥ 1 | `getVendor` |
| POST | `/api/vendors` | TECHNOLOGY ≥ 2 | `createVendor` |
| PUT | `/api/vendors/:id` | TECHNOLOGY ≥ 2 | `updateVendor` |
| DELETE | `/api/vendors/:id` | TECHNOLOGY ≥ 2 | `deleteVendor` |
| GET | `/api/categories` | TECHNOLOGY ≥ 1 | `getCategories` |
| GET | `/api/categories/:id` | TECHNOLOGY ≥ 1 | `getCategory` |
| POST | `/api/categories` | TECHNOLOGY ≥ 2 | `createCategory` |
| PUT | `/api/categories/:id` | TECHNOLOGY ≥ 2 | `updateCategory` |
| DELETE | `/api/categories/:id` | TECHNOLOGY ≥ 2 | `deleteCategory` |
| GET | `/api/equipment-models` | TECHNOLOGY ≥ 1 | `getModels` |
| GET | `/api/equipment-models/:id` | TECHNOLOGY ≥ 1 | `getModel` |
| POST | `/api/equipment-models` | TECHNOLOGY ≥ 2 | `createModel` |
| PUT | `/api/equipment-models/:id` | TECHNOLOGY ≥ 2 | `updateModel` |
| DELETE | `/api/equipment-models/:id` | TECHNOLOGY ≥ 2 | `deleteModel` |

**No backend work is required.**

### 5.2 Validation Patterns (for reference)

The existing `fundingSource.validators.ts` pattern applies. Each entity has:
- `GetXxxQuerySchema` — `z.object({ page, limit, search, isActive, sortBy, sortOrder })`
- `CreateXxxSchema` — `z.object({ name: z.string().min(1).max(200), ...optionalFields })`
- `UpdateXxxSchema` — `CreateXxxSchema.partial().extend({ isActive: z.boolean().optional() })`

For `models`, `CreateModelSchema` requires `brandId: z.string().uuid()` and has `@@unique([name, brandId])` enforcement at DB level.

For `categories`, there is no `isActive` — updates and hard-deletes only.

---

## Section 6: Reference Data Frontend Spec

### 6.1 Current State — Already Fully Implemented

**File:** `frontend/src/pages/ReferenceDataManagement.tsx` (781 lines)  
**Route:** `/reference-data` (admin-only, already in App.tsx)  
**Service:** `frontend/src/services/referenceDataService.ts`

The page has **5 MUI `<Tab>` panels**:

| Tab Index | Label | Entity | Service | Backend Path |
|---|---|---|---|---|
| 0 | Brands | `Brand` | `brandsService` | `/api/brands` |
| 1 | Vendors | `Vendor` | `vendorsService` | `/api/vendors` |
| 2 | Categories | `Category` | `categoriesService` | `/api/categories` |
| 3 | Models | `EquipmentModel` | `modelsService` | `/api/equipment-models` |
| 4 | Funding Sources | `FundingSource` | `fundingSourceService` | `/api/funding-sources` |

Each tab includes: search filter, show-inactive toggle (where applicable), data table with actions, and a MUI `<Dialog>` create/edit form.

**No frontend work is required for Reference Data.**

### 6.2 `FundingSourceManagement.tsx` — Orphaned File

`FundingSourceManagement.tsx` is a standalone page that:
- Has no route in `App.tsx`
- Is fully replicated by the `FundingSourcesTab` inside `ReferenceDataManagement.tsx`

**Recommendation:** Delete `FundingSourceManagement.tsx` as dead code. No redirect needed since the route never existed.

### 6.3 Service Signatures (Already Exist)

`referenceDataService.ts` exports:
- `brandsService.getAll(params?)`, `.create(data)`, `.update(id, data)`, `.deactivate(id)`
- `vendorsService.getAll(params?)`, `.create(data)`, `.update(id, data)`, `.deactivate(id)`
- `categoriesService.getAll(params?)`, `.create(data)`, `.update(id, data)`, `.delete(id)`
- `modelsService.getAll(params?)`, `.create(data)`, `.update(id, data)`, `.deactivate(id)`

`fundingSourceService.ts` exports:
- `.getAll(params?)`, `.getById(id)`, `.create(data)`, `.update(id, data)`, `.softDelete(id)`, `.hardDelete(id)`

---

## Section 7: Inventory Export Spec

### 7.1 Backend — Already Complete

**Route:** `POST /api/inventory/export` (active, no code changes needed)  
**Permission:** TECHNOLOGY ≥ 1 (all authenticated inventory users can export)  
**Validation schema:** `ExportInventorySchema` — accepts `{ format?: string; filters?: InventoryFilters }`

**Controller `exportInventory` behavior:**
1. Extracts `filters` from `req.body`
2. Calls `inventoryService.findAll({ page: 1, limit: 10000, ...filters })`
3. Maps each item to 23 columns (see Section 1.4 for full column list)
4. Builds xlsx workbook with auto-width columns
5. Streams buffer with `Content-Disposition: attachment; filename="inventory-export-YYYY-MM-DD.xlsx"`

**xlsx library** — already installed as `xlsx@^0.18.5` in `backend/package.json`.

### 7.2 Frontend — What Needs to Be Added

**File to edit:** `frontend/src/pages/InventoryManagement.tsx`

**What to add:**
1. An **Export button** in the page header / toolbar area
2. A service call to `POST /api/inventory/export` with the current `filters` state
3. Client-side `<a download>` trigger to save the returned blob

**Placement:** Next to the existing "Import" button (the `<ImportInventoryDialog>` trigger) in the toolbar area.

**Implementation — service function to add to `inventory.service.ts`:**

```typescript
exportInventory: async (filters?: Partial<InventoryFilters>): Promise<void> => {
  const response = await api.post(
    '/inventory/export',
    { filters },
    { responseType: 'blob' }          // critical: get raw binary
  );
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `inventory-export-${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Implementation — button in `InventoryManagement.tsx`:**

```tsx
const [exporting, setExporting] = useState(false);

const handleExport = async () => {
  setExporting(true);
  try {
    await inventoryService.exportInventory(filters);
  } catch (err: any) {
    setError(err.response?.data?.message || 'Export failed');
  } finally {
    setExporting(false);
  }
};

// In JSX, near Import button:
<Button
  variant="outlined"
  onClick={handleExport}
  disabled={exporting}
  startIcon={exporting ? <CircularProgress size={16} /> : undefined}
>
  {exporting ? 'Exporting...' : 'Export'}
</Button>
```

**Required imports to add to `InventoryManagement.tsx`:**
- `Button`, `CircularProgress` from `@mui/material` (if not already imported — check existing imports)

---

## Section 8: Dead Package Cleanup

### 8.1 Backend — `backend/package.json`

#### Remove: `passport-azure-ad@^4.3.5`

- **Reason:** No `import` or `require('passport-azure-ad')` in any file under `backend/src/`. The app uses JWT cookie-based auth with `jsonwebtoken` directly.
- **Verify before removal:** `grep -r "passport-azure-ad" backend/src/` — expect 0 results.
- **Source file cleanup:** None required.

#### Remove: `csv-parse@^6.1.0`

- **Reason:** Only imported in `backend/scripts/import-rooms.ts` (a one-off utility), which is NOT part of the production server bundle.
- **Risk:** If `scripts/import-rooms.ts` is ever run again, `csv-parse` would need reinstalling. Document this caveat.
- **Source file cleanup:** No changes to `backend/src/`. `backend/scripts/import-rooms.ts` line 14 (`import { parse } from 'csv-parse/sync'`) will break if the script is run without the package — acceptable since it is a dev utility.

**Command:**
```bash
cd backend
npm uninstall passport-azure-ad csv-parse
```

### 8.2 Frontend — `frontend/package.json`

#### Remove: `@azure/msal-react@^3.0.23`

- **Reason:** Zero imports found in `frontend/src/**`. Not used anywhere.
- **Source file cleanup:** None required.

#### Remove: `@azure/msal-browser@^4.27.0` + delete `src/config/authConfig.ts`

- **Reason:** The only consumer of `@azure/msal-browser` is `frontend/src/config/authConfig.ts`. That file (`msalConfig`, `msalInstance`, `loginRequest`, `graphScopes`) is never imported anywhere in the codebase. Both the file and the package are dead code.
- **Source file cleanup:** Delete `frontend/src/config/authConfig.ts`.
- **Verify before removal:** `grep -r "authConfig" frontend/src/` — expect 0 results (or only the config file itself).

**Command:**
```bash
cd frontend
npm uninstall @azure/msal-browser @azure/msal-react
# Then delete:
# frontend/src/config/authConfig.ts
```

### 8.3 Post-Cleanup Validation

After removals:
1. Run `cd backend && npx tsc --noEmit` — should produce 0 errors.
2. Run `cd frontend && npx tsc --noEmit` — should produce 0 errors (after deleting `authConfig.ts`).
3. Start both backend and frontend dev servers and verify login + inventory pages work.

---

## Implementation Order

Given that most features are already done, the implementation sequence for what remains is:

1. **Add Export button to `InventoryManagement.tsx`** — ~30 lines of code (Section 7.2)
2. **Remove dead packages** — 2 `npm uninstall` commands + delete 1 file (Section 8)
3. *(Optional)* Delete orphaned `FundingSourceManagement.tsx` (Section 6.2)

Total estimated implementation time: **~1 hour.**

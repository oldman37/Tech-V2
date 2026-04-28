# Specification: Merge Locations & Rooms into Reference Data Tabbed Page

**File:** `c:\Tech-V2\docs\SubAgent\reference_data_locations_rooms_merge_spec.md`  
**Date:** 2026-03-11  
**Sprint/Phase:** Reference Data Consolidation  
**Author:** Research Agent

---

## 1. Executive Summary

This spec covers adding **Locations** and **Rooms** as two new tabs in the existing `ReferenceDataManagement.tsx` page (`/reference-data`), consolidating all reference data management into one place. The standalone `/rooms` route will redirect to the new tab. There is **no standalone `/locations` route** to remove — location management currently lives inside `SupervisorManagement.tsx` (`/supervisors`); the new Locations tab will provide a lighter-weight location CRUD alongside the existing supervisor-assignment workflow.

**No backend changes are needed.** All API endpoints already exist and are production-ready.

---

## 2. Research Findings

### 2.1 Current File Inventory

| File | Purpose | Status |
|---|---|---|
| `frontend/src/pages/ReferenceDataManagement.tsx` | Tabbed page: Brands, Vendors, Categories, Models, Funding Sources | ✅ Exists |
| `frontend/src/pages/RoomManagement.tsx` | Standalone room CRUD at `/rooms` | ✅ Exists — to be redirected |
| `frontend/src/pages/LocationsManagement.tsx` | **Does not exist** | ❌ N/A |
| `frontend/src/pages/SupervisorManagement.tsx` | Manages OfficeLocations + supervisor assignments at `/supervisors` | ✅ Exists — location CRUD embedded here |
| `frontend/src/services/location.service.ts` | `locationService.getAllLocations()`, `createLocation()`, `updateLocation()`, `deleteLocation()` | ✅ Exists |
| `frontend/src/services/roomService.ts` | `roomService.getRooms()`, `createRoom()`, `updateRoom()`, `deleteRoom()` | ✅ Exists |
| `frontend/src/hooks/queries/useLocations.ts` | `useLocations()`, `useLocation(id)` | ✅ Exists |
| `frontend/src/hooks/queries/useRooms.ts` | `usePaginatedRooms(params)`, `useRoomsWithPagination()`, `useRoom(id)` | ✅ Exists |
| `frontend/src/hooks/mutations/useLocationMutations.ts` | `useCreateLocation()`, `useUpdateLocation()`, `useDeleteLocation()` | ✅ Exists |
| `frontend/src/components/RoomFormModal.tsx` | Room create/edit modal — usable as-is | ✅ Exists |
| `frontend/src/types/location.types.ts` | `OfficeLocation`, `CreateLocationRequest`, `UpdateLocationRequest`, `LocationType` | ✅ Exists |
| `frontend/src/types/room.types.ts` | `Room`, `RoomWithLocation`, `CreateRoomRequest`, `UpdateRoomRequest`, `RoomType`, `RoomQueryParams` | ✅ Exists |
| `backend/src/routes/location.routes.ts` | REST routes for `/locations` | ✅ Exists |
| `backend/src/routes/room.routes.ts` | REST routes for `/rooms` | ✅ Exists |

### 2.2 Dual Location Model Issue (Prisma Schema)

The database contains **two separate location models** — this must be understood to avoid confusion:

| Model | Table | Purpose | Used By |
|---|---|---|---|
| `locations` (lowercase) | `locations` | **Legacy model** from PHP era. Fields: `buildingName`, `roomNumber`, `floor`, `capacity`. Has `equipment[]`, `maintenance_orders[]`, `user_rooms[]` | Legacy equipment import scripts only |
| `OfficeLocation` (PascalCase) | `office_locations` | **Active model** — the campus/school location. Fields: `name`, `code`, `type`, `address`, `city`, `state`, `zip`, `phone`, `isActive`. Has `rooms Room[]`, `supervisors LocationSupervisor[]`, `equipment[]`, `purchase_orders[]` | All active frontend + backend code |
| `Room` (PascalCase) | (table: `rooms`) | Active room model. Belongs to `OfficeLocation` via `locationId`. Fields: `name`, `type`, `building`, `floor`, `capacity`, `isActive`, `notes` | Active frontend + backend code |

**Decision:** All frontend work uses `OfficeLocation` and `Room`. The `locations` (legacy) model is irrelevant to this feature.

### 2.3 Current Tab Structure in `ReferenceDataManagement.tsx`

```
Tab 0: Brands        — BrandsTab()
Tab 1: Vendors       — VendorsTab()
Tab 2: Categories    — CategoriesTab()
Tab 3: Models        — ModelsTab()
Tab 4: Funding Sources — FundingSourcesTab()
```

Tab state is managed by `const [tab, setTab] = useState(0)` — no URL persistence. The main component renders `<Tabs>` from MUI and `<TabPanel>` wrapper components. Each tab is a standalone function component (co-located in the same file). Each tab handles its own load/state/modal internally using `useState` + `useCallback` + `useEffect`.

### 2.4 What `CrudTableShell` Provides

All existing tabs use the `CrudTableShell` helper component defined in the same file. It provides:
- Page header with title, description, + Add button
- Search input + optional "Show inactive" toggle 
- Conditional loading/empty/error states
- MUI `<table>` with configurable headers
- Consistent layout matching `.btn`, `.card`, `.badge-*` CSS classes from `global.css`

The Locations and Rooms tabs **must** use this same `CrudTableShell` pattern for UI consistency.

### 2.5 Current Navigation Structure (`AppLayout.tsx`)

```
Admin section:
  - "Users"                       → /users       (adminOnly)
  - "Locations & Supervisors"     → /supervisors  (adminOnly)
  - "Rooms"                       → /rooms        (adminOnly)  ← TO BE REMOVED
```

```
Inventory section:
  - "Reference Data"              → /reference-data (adminOnly)
```

### 2.6 All Backend API Endpoints (already exist, no changes needed)

**Locations Routes** (`location.routes.ts`) — all use `authenticate` + `validateCsrfToken`:
```
GET    /locations                       → getOfficeLocations
GET    /locations/:id                   → getOfficeLocation
POST   /locations                       → createOfficeLocation
PUT    /locations/:id                   → updateOfficeLocation
DELETE /locations/:id                   → deleteOfficeLocation (soft delete)
POST   /locations/:locationId/supervisors → assignSupervisor
DELETE /locations/:locationId/supervisors/:userId/:supervisorType → removeSupervisor
GET    /users/:userId/supervised-locations
GET    /supervisors/type/:type
GET    /locations/:locationId/supervisor/:supervisorType
```

**Rooms Routes** (`room.routes.ts`) — all use `authenticate` + `validateCsrfToken`:
```
GET    /rooms                           → getRooms (paginated, filterable)
GET    /rooms/stats                     → getRoomStats
GET    /rooms/:id                       → getRoom
POST   /rooms                           → createRoom
PUT    /rooms/:id                       → updateRoom
DELETE /rooms/:id                       → deleteRoom (soft delete by default)
GET    /locations/:locationId/rooms     → getRoomsByLocation
```

---

## 3. Frontend Changes (Full Specification)

### 3.1 URL-Based Tab Navigation

**Current:** `const [tab, setTab] = useState(0)` — tab state is lost on page reload or navigation.

**Required:** Upgrade to URL-based tab navigation using `useSearchParams` so tabs are deep-linkable:
- `/reference-data` → defaults to tab 0 (Brands)
- `/reference-data?tab=locations` → opens Locations tab
- `/reference-data?tab=rooms` → opens Rooms tab

**Implementation in `ReferenceDataManagement.tsx` main component:**

```tsx
import { useSearchParams } from 'react-router-dom';

const TAB_NAMES = ['brands', 'vendors', 'categories', 'models', 'funding-sources', 'locations', 'rooms'] as const;
type TabName = typeof TAB_NAMES[number];

const ReferenceDataManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabName | null;
  const tabIndex = TAB_NAMES.indexOf(tabParam as TabName);
  const tab = tabIndex >= 0 ? tabIndex : 0;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSearchParams({ tab: TAB_NAMES[newValue] });
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 className="page-title">Reference Data</h2>
          <p className="page-description">
            Manage brands, vendors, categories, models, funding sources, locations, and rooms
          </p>
        </div>
      </div>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={handleTabChange} aria-label="reference data tabs">
          <Tab label="Brands" />
          <Tab label="Vendors" />
          <Tab label="Categories" />
          <Tab label="Models" />
          <Tab label="Funding Sources" />
          <Tab label="Locations" />
          <Tab label="Rooms" />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}><BrandsTab /></TabPanel>
      <TabPanel value={tab} index={1}><VendorsTab /></TabPanel>
      <TabPanel value={tab} index={2}><CategoriesTab /></TabPanel>
      <TabPanel value={tab} index={3}><ModelsTab /></TabPanel>
      <TabPanel value={tab} index={4}><FundingSourcesTab /></TabPanel>
      <TabPanel value={tab} index={5}><LocationsTab /></TabPanel>
      <TabPanel value={tab} index={6}><RoomsTab /></TabPanel>
    </div>
  );
};
```

> **Note:** Add `useSearchParams` import from `react-router-dom` at the top of the file.

### 3.2 LocationsTab Component

**Purpose:** Basic CRUD for `OfficeLocation` records (name, code, type, address). Supervisor assignment is **not** included — that stays in `SupervisorManagement.tsx`.

**Data source:** `locationService` from `../services/location.service`  
**Types:** `OfficeLocation`, `CreateLocationRequest`, `UpdateLocationRequest`, `LocationType` from `../types/location.types`

**Table columns:** Name | Code | Type | City/State | Phone | Status | Actions

**Form fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | ✅ | Unique |
| `code` | text | ❌ | Short code (e.g., "SFMH"), unique |
| `type` | select | ✅ | Values: `SCHOOL`, `DISTRICT_OFFICE`, `DEPARTMENT` |
| `address` | text | ❌ | Street address |
| `city` | text | ❌ | |
| `state` | text | ❌ | Max 50 chars |
| `zip` | text | ❌ | Max 20 chars |
| `phone` | text | ❌ | |
| `isActive` | switch | Edit only | Defaults true on create |

**Actions:**
- **Edit**: opens modal pre-filled with current values
- **Deactivate** (if active): calls `locationService.updateLocation(id, { isActive: false })`
- **Reactivate** (if inactive): calls `locationService.updateLocation(id, { isActive: true })`
- Delete/hard-delete: **not recommended** — locations link to equipment and purchase orders. Only soft-deactivation.

**Full component outline:**

```tsx
// ─── LOCATIONS TAB ────────────────────────────────────────────────────────

function LocationsTab() {
  const [items, setItems] = useState<OfficeLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeLocation | null>(null);

  // form fields
  const [fName, setFName] = useState('');
  const [fCode, setFCode] = useState('');
  const [fType, setFType] = useState<LocationType>('SCHOOL');
  const [fAddress, setFAddress] = useState('');
  const [fCity, setFCity] = useState('');
  const [fState, setFState] = useState('');
  const [fZip, setFZip] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fIsActive, setFIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const all = await locationService.getAllLocations();
      // Filter client-side: getAllLocations returns OfficeLocationWithSupervisors[]
      const filtered = all.filter(loc => {
        const matchesSearch = !search || loc.name.toLowerCase().includes(search.toLowerCase())
          || (loc.code?.toLowerCase().includes(search.toLowerCase()) ?? false);
        const matchesActive = showInactive ? true : loc.isActive;
        return matchesSearch && matchesActive;
      });
      setItems(filtered);
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message ?? 'Failed to load locations');
    } finally { setLoading(false); }
  }, [search, showInactive]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null); setFName(''); setFCode(''); setFType('SCHOOL');
    setFAddress(''); setFCity(''); setFState(''); setFZip(''); setFPhone('');
    setFIsActive(true); setFormError(null); setModalOpen(true);
  };

  const openEdit = (loc: OfficeLocation) => {
    setEditing(loc); setFName(loc.name); setFCode(loc.code ?? '');
    setFType(loc.type as LocationType); setFAddress(loc.address ?? '');
    setFCity(loc.city ?? ''); setFState(loc.state ?? ''); setFZip(loc.zip ?? '');
    setFPhone(loc.phone ?? ''); setFIsActive(loc.isActive);
    setFormError(null); setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!fName.trim()) { setFormError('Name is required'); return; }
    if (!fType) { setFormError('Type is required'); return; }
    setFormLoading(true); setFormError(null);
    try {
      const payload: CreateLocationRequest = {
        name: fName.trim(),
        code: fCode.trim() || undefined,
        type: fType,
        address: fAddress.trim() || undefined,
        city: fCity.trim() || undefined,
        state: fState.trim() || undefined,
        zip: fZip.trim() || undefined,
        phone: fPhone.trim() || undefined,
      };
      if (editing) {
        await locationService.updateLocation(editing.id, { ...payload, isActive: fIsActive });
      } else {
        await locationService.createLocation(payload);
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e.response?.data?.message ?? e.message ?? 'Failed to save');
    } finally { setFormLoading(false); }
  };

  const handleDeactivate = async (loc: OfficeLocation) => {
    if (!window.confirm(`Deactivate "${loc.name}"? This location will no longer appear in dropdowns.`)) return;
    try {
      await locationService.updateLocation(loc.id, { isActive: false });
      await load();
    } catch (e: any) { alert(e.response?.data?.message ?? e.message); }
  };

  const handleReactivate = async (loc: OfficeLocation) => {
    try {
      await locationService.updateLocation(loc.id, { isActive: true });
      await load();
    } catch (e: any) { alert(e.response?.data?.message ?? e.message); }
  };

  const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
    SCHOOL: 'School',
    DISTRICT_OFFICE: 'District Office',
    DEPARTMENT: 'Department',
  };

  return (
    <>
      <CrudTableShell
        title="Locations" description="Office locations, schools, and departments"
        loading={loading} error={error} searchValue={search} onSearchChange={setSearch}
        showInactive={showInactive} onShowInactiveChange={setShowInactive}
        onAddClick={openCreate} addLabel="+ Add Location"
        headers={['Name', 'Code', 'Type', 'City / State', 'Phone', 'Status', 'Actions']}
        empty={items.length === 0}
      >
        {items.map((loc) => (
          <tr key={loc.id}>
            <td style={{ fontWeight: 500 }}>{loc.name}</td>
            <td>{loc.code || <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>
              <span className="badge badge-secondary">
                {LOCATION_TYPE_LABELS[loc.type as LocationType] ?? loc.type}
              </span>
            </td>
            <td>{[loc.city, loc.state].filter(Boolean).join(', ') || <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>{loc.phone || <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>
              <span className={`badge ${loc.isActive ? 'badge-success' : 'badge-secondary'}`}>
                {loc.isActive ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(loc)}>Edit</button>
                {loc.isActive
                  ? <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(loc)}>Deactivate</button>
                  : <button className="btn btn-sm btn-secondary" onClick={() => handleReactivate(loc)}>Reactivate</button>
                }
              </div>
            </td>
          </tr>
        ))}
      </CrudTableShell>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Location' : 'Add Location'}</DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField fullWidth required label="Name" value={fName}
            onChange={(e) => setFName(e.target.value)} disabled={formLoading} sx={{ mb: 2 }} />
          <TextField fullWidth label="Code" value={fCode}
            onChange={(e) => setFCode(e.target.value)} disabled={formLoading}
            helperText="Short identifier (e.g. SFMH)" sx={{ mb: 2 }} />
          <TextField fullWidth required select label="Type" value={fType}
            onChange={(e) => setFType(e.target.value as LocationType)} disabled={formLoading} sx={{ mb: 2 }}>
            <MenuItem value="SCHOOL">School</MenuItem>
            <MenuItem value="DISTRICT_OFFICE">District Office</MenuItem>
            <MenuItem value="DEPARTMENT">Department</MenuItem>
          </TextField>
          <TextField fullWidth label="Address" value={fAddress}
            onChange={(e) => setFAddress(e.target.value)} disabled={formLoading} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField fullWidth label="City" value={fCity}
              onChange={(e) => setFCity(e.target.value)} disabled={formLoading} />
            <TextField label="State" value={fState}
              onChange={(e) => setFState(e.target.value)} disabled={formLoading}
              inputProps={{ maxLength: 50 }} sx={{ width: 90, flexShrink: 0 }} />
            <TextField label="ZIP" value={fZip}
              onChange={(e) => setFZip(e.target.value)} disabled={formLoading}
              inputProps={{ maxLength: 20 }} sx={{ width: 110, flexShrink: 0 }} />
          </Box>
          <TextField fullWidth label="Phone" value={fPhone}
            onChange={(e) => setFPhone(e.target.value)} disabled={formLoading} sx={{ mb: 2 }} />
          {editing && (
            <FormControlLabel
              control={<Switch checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} disabled={formLoading} />}
              label="Active"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)} disabled={formLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={formLoading}
            startIcon={formLoading ? <CircularProgress size={18} /> : undefined}>
            {editing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

**New imports to add at the top of `ReferenceDataManagement.tsx`:**
```tsx
import locationService from '../services/location.service';
import roomService from '../services/roomService';
import type { OfficeLocation, CreateLocationRequest, LocationType } from '../types/location.types';
import type { RoomWithLocation, CreateRoomRequest, UpdateRoomRequest, RoomType, RoomQueryParams } from '../types/room.types';
```

### 3.3 RoomsTab Component

**Purpose:** Full CRUD for `Room` records, with location filter dropdown and pagination. Adapts the existing `RoomManagement.tsx` page logic into a tab-format component using `CrudTableShell`.

**Key difference from `RoomManagement.tsx`:** The tab version does NOT use `useSearchParams` for state persistence (that makes sense for a standalone page but not for a sub-tab). Instead, it uses local state for filters. Pagination is simplified.

**Reuse existing code:**
- `RoomFormModal` component from `../components/RoomFormModal`
  > **Note:** `RoomFormModal` is a custom modal (not MUI Dialog) that renders only when `isOpen=true`. It internally fetches locations. It can be used as-is.
- `usePaginatedRooms` hook from `../hooks/queries/useRooms`
- `roomService` from `../services/roomService`

**Table columns:** Room Name | Type | Building | Floor | Capacity | Location | Status | Actions

**Filter controls (above the table, reusing `CrudTableShell` pattern):**
- Location filter (select dropdown, populated from `locationService.getAllLocations()`)
- Type filter (select dropdown with all 16 RoomType values)
- Status filter (Active / Inactive / All)
- Search text input

**The `CrudTableShell` handles the search input natively. For additional filters (location, type, status), render them inside the `CrudTableShell`'s table area or add an extra filter row above the shell.**

**Full component outline:**

```tsx
// ─── ROOMS TAB ──────────────────────────────────────────────────────────────

function RoomsTab() {
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomWithLocation | null>(null);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<RoomType | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const queryParams: RoomQueryParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    locationId: locationFilter || undefined,
    type: typeFilter || undefined,
    search: search || undefined,
    isActive: showInactive ? undefined : true,
  };

  const { data, isLoading, isError, error, refetch } = usePaginatedRooms(queryParams);
  const rooms = data?.rooms ?? [];
  const pagination = data?.pagination;

  useEffect(() => {
    locationService.getAllLocations()
      .then(setLocations)
      .catch(() => { /* silent */ });
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [search, locationFilter, typeFilter, showInactive]);

  const handleCreate = async (data: CreateRoomRequest) => {
    await roomService.createRoom(data);
    await refetch();
  };
  const handleUpdate = async (data: UpdateRoomRequest) => {
    if (!editingRoom) return;
    await roomService.updateRoom(editingRoom.id, data);
    await refetch();
  };
  const handleFormSubmit = async (data: CreateRoomRequest | UpdateRoomRequest) => {
    if (editingRoom) await handleUpdate(data as UpdateRoomRequest);
    else await handleCreate(data as CreateRoomRequest);
  };
  const handleToggleActive = async (room: RoomWithLocation) => {
    try {
      await roomService.updateRoom(room.id, { isActive: !room.isActive });
      await refetch();
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to update room'); }
  };
  const handleDelete = async (roomId: string, name: string) => {
    if (!window.confirm(`Deactivate room "${name}"?`)) return;
    try {
      await roomService.deleteRoom(roomId, false);
      await refetch();
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to deactivate room'); }
  };

  const getRoomTypeLabel = (type: RoomType | null) =>
    type ? type.replace(/_/g, ' ') : 'General';

  // Extra filter bar rendered inside CrudTableShell header area can be passed as
  // a separate prop or placed directly in the component before CrudTableShell.
  // Recommended: render the location/type/status selects ABOVE the CrudTableShell.

  return (
    <>
      {/* Extra filters not handled by CrudTableShell */}
      <div className="card mb-4">
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label className="form-label">Location</label>
            <select value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)} className="form-select">
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label className="form-label">Type</label>
            <select value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as RoomType | '')} className="form-select">
              <option value="">All Types</option>
              <option value="CLASSROOM">Classroom</option>
              <option value="OFFICE">Office</option>
              <option value="GYM">Gym</option>
              <option value="CAFETERIA">Cafeteria</option>
              <option value="LIBRARY">Library</option>
              <option value="LAB">Lab</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="SPORTS">Sports</option>
              <option value="MUSIC">Music</option>
              <option value="MEDICAL">Medical</option>
              <option value="CONFERENCE">Conference</option>
              <option value="TECHNOLOGY">Technology</option>
              <option value="TRANSPORTATION">Transportation</option>
              <option value="SPECIAL_ED">Special Ed</option>
              <option value="GENERAL">General</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
      </div>

      <CrudTableShell
        title="Rooms" description="Rooms and spaces across all locations"
        loading={isLoading}
        error={isError ? (error?.message || 'Failed to load rooms') : null}
        searchValue={search} onSearchChange={setSearch}
        showInactive={showInactive} onShowInactiveChange={setShowInactive}
        onAddClick={() => { setEditingRoom(null); setIsModalOpen(true); }}
        addLabel="+ Add Room"
        headers={['Room', 'Location', 'Type', 'Building', 'Floor', 'Capacity', 'Status', 'Actions']}
        empty={rooms.length === 0}
      >
        {rooms.map((room) => (
          <tr key={room.id} style={{ opacity: !room.isActive ? 0.6 : 1 }}>
            <td style={{ fontWeight: 500 }}>
              {room.name}
              {room.notes && (
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
                  {room.notes}
                </div>
              )}
            </td>
            <td>{room.location.name}</td>
            <td>
              <span className="badge badge-secondary">{getRoomTypeLabel(room.type)}</span>
            </td>
            <td>{room.building || <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>{room.floor ?? <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>{room.capacity ?? <em style={{ opacity: 0.5 }}>—</em>}</td>
            <td>
              <span className={`badge ${room.isActive ? 'badge-success' : 'badge-secondary'}`}>
                {room.isActive ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-secondary"
                  onClick={() => { setEditingRoom(room); setIsModalOpen(true); }}>Edit</button>
                <button className="btn btn-sm btn-secondary"
                  onClick={() => handleToggleActive(room)}>
                  {room.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                {room.isActive && (
                  <button className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(room.id, room.name)}>Delete</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </CrudTableShell>

      {/* Simple pagination controls */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-sm btn-secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
          <span style={{ lineHeight: '1.75rem', fontSize: '0.875rem' }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} rooms)
          </span>
          <button className="btn btn-sm btn-secondary"
            disabled={currentPage >= pagination.totalPages}
            onClick={() => setCurrentPage(p => p + 1)}>Next</button>
        </div>
      )}

      <RoomFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingRoom(null); }}
        onSubmit={handleFormSubmit}
        room={editingRoom}
        title={editingRoom ? 'Edit Room' : 'Create Room'}
      />
    </>
  );
}
```

**Additional imports needed at top of `ReferenceDataManagement.tsx`:**
```tsx
import { usePaginatedRooms } from '../hooks/queries/useRooms';
import RoomFormModal from '../components/RoomFormModal';
```

### 3.4 File Organization Recommendation (Optional but Suggested)

`ReferenceDataManagement.tsx` is already large (~900+ lines with 5 tabs). Adding 2 more tabs will make it ~1300+ lines. It is recommended (but not required for this sprint) to extract each tab into a separate file:

```
src/pages/ReferenceData/
  BrandsTab.tsx
  VendorsTab.tsx
  CategoriesTab.tsx
  ModelsTab.tsx
  FundingSourcesTab.tsx
  LocationsTab.tsx        ← new
  RoomsTab.tsx            ← new
  CrudTableShell.tsx      ← extracted shared component
```

`ReferenceDataManagement.tsx` would then import and compose them. **This extraction is optional for now** — the immediate goal is to get the tabs working correctly first.

---

## 4. Routing Changes (`App.tsx`)

### 4.1 Current Routes

```tsx
<Route path="/rooms" element={<ProtectedRoute requireAdmin><AppLayout><RoomManagement /></AppLayout></ProtectedRoute>} />
<Route path="/reference-data" element={<ProtectedRoute requireAdmin><AppLayout><ReferenceDataManagement /></AppLayout></ProtectedRoute>} />
```

There is **no `/locations` route** in `App.tsx`. Location management is accessed through `/supervisors`.

### 4.2 Required Route Changes

**Remove** the `/rooms` standalone route and **add a redirect** in its place:

```tsx
// REMOVE this:
<Route
  path="/rooms"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <RoomManagement />
      </AppLayout>
    </ProtectedRoute>
  }
/>

// ADD this redirect:
<Route
  path="/rooms"
  element={<Navigate to="/reference-data?tab=rooms" replace />}
/>
```

**Also add** an import for `Navigate` if not already present (it is already imported as `Navigate` in the current `App.tsx`).

**Remove** the import of `RoomManagement`:
```tsx
// REMOVE:
import RoomManagement from './pages/RoomManagement'
```

### 4.3 Complete Final Route List (relevant section)

```tsx
<Route path="/rooms" element={<Navigate to="/reference-data?tab=rooms" replace />} />
<Route
  path="/reference-data"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <ReferenceDataManagement />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

---

## 5. Navigation Changes (`AppLayout.tsx`)

### 5.1 Current Admin Section

```tsx
{
  title: 'Admin',
  items: [
    { label: 'Users', icon: '👥', path: '/users', adminOnly: true },
    { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors', adminOnly: true },
    { label: 'Rooms', icon: '🚪', path: '/rooms', adminOnly: true },  // ← REMOVE
  ],
},
```

### 5.2 Required Navigation Changes

**Remove** the "Rooms" nav item from the Admin section. Rooms are now accessible via Reference Data → Rooms tab.

```tsx
{
  title: 'Admin',
  items: [
    { label: 'Users', icon: '👥', path: '/users', adminOnly: true },
    { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors', adminOnly: true },
    // "Rooms" removed — moved to /reference-data?tab=rooms
  ],
},
```

**No change needed** for "Locations & Supervisors" navigation item. The `/supervisors` page still provides supervisor assignment functionality not available in the Reference Data tab.

---

## 6. Backend Changes

**No backend changes are required.** All necessary API endpoints already exist:

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /locations` | List all locations | `authenticate` |
| `POST /locations` | Create location | `authenticate` + CSRF |
| `PUT /locations/:id` | Update location | `authenticate` + CSRF |
| `DELETE /locations/:id` | Soft-delete location | `authenticate` + CSRF |
| `GET /rooms` | List rooms (paginated, filterable) | `authenticate` |
| `POST /rooms` | Create room | `authenticate` + CSRF |
| `PUT /rooms/:id` | Update room | `authenticate` + CSRF |
| `DELETE /rooms/:id` | Soft-delete room | `authenticate` + CSRF |

---

## 7. Security Considerations

### 7.1 Frontend Access Control

All Reference Data routes (including the new Locations and Rooms tabs) are already guarded by:
```tsx
<ProtectedRoute requireAdmin>
```

The `ProtectedRoute` component with `requireAdmin` checks `user?.roles?.includes('ADMIN')` from the auth store. No change needed.

### 7.2 Backend Permission Gap (Document and Address)

**Current state (gap):** Location and room backend routes use only `authenticate` middleware. Unlike the reference data routes (which use `checkPermission('TECHNOLOGY', 1|2)`), location/room endpoints have **no role or permission check** beyond token validity. Any authenticated user can call `POST /rooms`, `DELETE /locations/:id`, etc. directly.

**Recommendation:** Add permission checks to location and room mutation endpoints:

```typescript
// In location.routes.ts — add permission check to write operations:
router.post('/locations', checkPermission('TECHNOLOGY', 2), validateRequest(...), locationController.createOfficeLocation);
router.put('/locations/:id', checkPermission('TECHNOLOGY', 2), validateRequest(...), locationController.updateOfficeLocation);
router.delete('/locations/:id', checkPermission('TECHNOLOGY', 2), validateRequest(...), locationController.deleteOfficeLocation);

// In room.routes.ts — add permission check to write operations:
router.post('/rooms', checkPermission('TECHNOLOGY', 2), validateRequest(...), roomController.createRoom);
router.put('/rooms/:id', checkPermission('TECHNOLOGY', 2), validateRequest(...), roomController.updateRoom);
router.delete('/rooms/:id', checkPermission('TECHNOLOGY', 2), validateRequest(...), roomController.deleteRoom);
```

> **Note:** This is a standalone security improvement, not strictly required for the UI merge. It should be tracked as a follow-up task if not addressed in this sprint.

### 7.3 CSRF Protection

Both `location.routes.ts` and `room.routes.ts` already apply `router.use(validateCsrfToken)` at the router level. No changes needed.

### 7.4 Input Validation

The existing `CreateOfficeLocationSchema`, `UpdateOfficeLocationSchema`, `CreateRoomSchema`, and `UpdateRoomSchema` Zod validators in the backend are already applied via `validateRequest` middleware. No changes needed.

### 7.5 No Raw SQL

All existing location and room backend services use Prisma exclusively. The frontend components described in this spec rely only on the existing service layer. No raw SQL is introduced.

---

## 8. What Happens to Existing Pages

| Page | Action | Reason |
|---|---|---|
| `RoomManagement.tsx` | **Keep file, stop routing to it** | File may be referenced by other parts; keep as dead code until confirmed safe, or delete after redirect is verified |
| `SupervisorManagement.tsx` | **No change** | Still needed for supervisor assignment workflow; now also complemented by the Locations tab in Reference Data |
| `/locations` route | **N/A — never existed** | There is no `/locations` route in App.tsx to remove |
| `/rooms` route | **Replace with redirect** to `/reference-data?tab=rooms` | Bookmarks and external links still work |

---

## 9. Step-by-Step Implementation Order

Execute in this order to minimize the chance of breaking existing functionality:

### Step 1 — Add new imports to `ReferenceDataManagement.tsx`
Add imports for:
- `useSearchParams` from `react-router-dom`
- `locationService` from `../services/location.service`
- `roomService` from `../services/roomService`
- `usePaginatedRooms` from `../hooks/queries/useRooms`
- `RoomFormModal` from `../components/RoomFormModal`
- Types: `OfficeLocation`, `CreateLocationRequest`, `LocationType` from `../types/location.types`
- Types: `RoomWithLocation`, `CreateRoomRequest`, `UpdateRoomRequest`, `RoomType`, `RoomQueryParams` from `../types/room.types`

### Step 2 — Add `LocationsTab` function component
Insert the full `LocationsTab` component (section 3.2) into `ReferenceDataManagement.tsx` after the `FundingSourcesTab` function and before the main `ReferenceDataManagement` component.

### Step 3 — Add `RoomsTab` function component
Insert the full `RoomsTab` component (section 3.3) after `LocationsTab`.

### Step 4 — Upgrade main component to URL-based tabs
Replace `const [tab, setTab] = useState(0)` with the `useSearchParams`-based tab navigation. Add tabs 5 (Locations) and 6 (Rooms) to the `<Tabs>` element and add two new `<TabPanel>` blocks.

### Step 5 — Update page description
Update the `<p className="page-description">` to include "locations" and "rooms".

### Step 6 — Build and verify `ReferenceDataManagement.tsx`
Run `npm run build` in `frontend/`. Fix any TypeScript errors before proceeding.

### Step 7 — Update `AppLayout.tsx`
Remove the "Rooms" nav item from the Admin section.

### Step 8 — Update `App.tsx`
Replace the `/rooms` route with the `<Navigate>` redirect to `/reference-data?tab=rooms`. Remove the `RoomManagement` import.

### Step 9 — Build the full frontend
Run `npm run build` in `frontend/`. Verify no errors.

### Step 10 — Manual verification
- Navigate to `/reference-data` — confirm all 7 tabs appear
- Click Locations tab — confirm locations list loads
- Create, edit, deactivate a location — confirm CRUD works
- Click Rooms tab — confirm rooms load with location filter working
- Create, edit, deactivate a room — confirm CRUD works
- Navigate directly to `/rooms` — confirm redirect to `/reference-data?tab=rooms`
- Confirm `/supervisors` page still works with supervisor assignment

---

## 10. Files Changed Summary

| File | Change Type | Description |
|---|---|---|
| `frontend/src/pages/ReferenceDataManagement.tsx` | **Modified** | Add URL tab navigation; add `LocationsTab` and `RoomsTab` components; add new imports |
| `frontend/src/App.tsx` | **Modified** | Replace `/rooms` route with `<Navigate>` redirect; remove `RoomManagement` import |
| `frontend/src/components/layout/AppLayout.tsx` | **Modified** | Remove "Rooms" nav link from Admin section |
| `frontend/src/pages/RoomManagement.tsx` | **Kept as-is** | Can be deleted after verification but not required |

---

## 11. Open Questions / Follow-up Work

1. **Backend permission hardening (Security):** Add `checkPermission('TECHNOLOGY', 2)` to location and room mutation routes. Currently these are accessible to any authenticated user.

2. **Supervisor assignment in Locations tab:** The Locations tab in Reference Data provides basic CRUD only. If it becomes confusing to have two places managing locations (`/supervisors` + Reference Data), consider adding a "View Supervisors →" link in the Locations tab that redirects to `/supervisors?locationId=xxx`.

3. **Legacy `locations` model cleanup:** The `locations` table (lowercase, legacy) is used by `maintenance_orders` and `user_rooms`. At some point this should be migrated to use `OfficeLocation.id` + `Room.id` to consolidate. This is tracked separately in MASTER_PLAN as a schema issue.

4. **`RoomManagement.tsx` deletion:** After the redirect is live and verified, `RoomManagement.tsx` can be safely deleted. The `PaginationControls` component it uses is also used by other pages, so that file stays.

5. **Tab file extraction:** If `ReferenceDataManagement.tsx` grows beyond maintainable size, extract each `*Tab` function into `src/pages/ReferenceData/*.tsx` files as described in section 3.4.

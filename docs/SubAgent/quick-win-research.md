# Quick Win Research — Tech-V2 Codebase Snapshot
*Generated: 2026-03-03*

---

## Directory Listings

### `frontend/src/` (all files, recursive)

```
c:\Tech-V2\frontend\src\vite-env.d.ts
c:\Tech-V2\frontend\src\main.tsx
c:\Tech-V2\frontend\src\index.css
c:\Tech-V2\frontend\src\App.tsx
c:\Tech-V2\frontend\src\App.css

pages/
  c:\Tech-V2\frontend\src\pages\Dashboard.tsx
  c:\Tech-V2\frontend\src\pages\Dashboard.css
  c:\Tech-V2\frontend\src\pages\Login.tsx
  c:\Tech-V2\frontend\src\pages\Login.css
  c:\Tech-V2\frontend\src\pages\Users.tsx
  c:\Tech-V2\frontend\src\pages\Users.backup.tsx
  c:\Tech-V2\frontend\src\pages\SupervisorManagement.tsx
  c:\Tech-V2\frontend\src\pages\RoomManagement.tsx
  c:\Tech-V2\frontend\src\pages\MyEquipment.tsx
  c:\Tech-V2\frontend\src\pages\InventoryManagement.tsx
  c:\Tech-V2\frontend\src\pages\FundingSourceManagement.tsx

components/
  c:\Tech-V2\frontend\src\components\ProtectedRoute.tsx
  c:\Tech-V2\frontend\src\components\PaginationControls.tsx
  c:\Tech-V2\frontend\src\components\LocationsManagement.tsx
  c:\Tech-V2\frontend\src\components\UserSearchAutocomplete.tsx
  c:\Tech-V2\frontend\src\components\RoomFormModal.tsx
  c:\Tech-V2\frontend\src\components\inventory\InventoryHistoryDialog.tsx
  c:\Tech-V2\frontend\src\components\inventory\InventoryFormDialog.tsx
  c:\Tech-V2\frontend\src\components\inventory\ImportInventoryDialog.tsx
  c:\Tech-V2\frontend\src\components\inventory\AssignmentHistoryList.tsx
  c:\Tech-V2\frontend\src\components\inventory\AssignmentDialog.tsx
  c:\Tech-V2\frontend\src\components\inventory\AssignmentCard.tsx

services/
  c:\Tech-V2\frontend\src\services\api.ts
  c:\Tech-V2\frontend\src\services\authService.ts
  c:\Tech-V2\frontend\src\services\adminService.ts
  c:\Tech-V2\frontend\src\services\assignment.service.ts
  c:\Tech-V2\frontend\src\services\fundingSourceService.ts
  c:\Tech-V2\frontend\src\services\inventory.service.ts
  c:\Tech-V2\frontend\src\services\location.service.ts
  c:\Tech-V2\frontend\src\services\roomService.ts
  c:\Tech-V2\frontend\src\services\supervisorService.ts
  c:\Tech-V2\frontend\src\services\userService.ts

store/
  c:\Tech-V2\frontend\src\store\authStore.ts

lib/
  c:\Tech-V2\frontend\src\lib\queryKeys.ts
  c:\Tech-V2\frontend\src\lib\queryClient.ts

hooks/queries/
  c:\Tech-V2\frontend\src\hooks\queries\useUsers.ts
  c:\Tech-V2\frontend\src\hooks\queries\useSupervisors.ts
  c:\Tech-V2\frontend\src\hooks\queries\useRooms.ts
  c:\Tech-V2\frontend\src\hooks\queries\useLocations.ts
  c:\Tech-V2\frontend\src\hooks\queries\useAdmin.ts

hooks/mutations/
  c:\Tech-V2\frontend\src\hooks\mutations\useUserMutations.ts
  c:\Tech-V2\frontend\src\hooks\mutations\useSupervisorMutations.ts
  c:\Tech-V2\frontend\src\hooks\mutations\useLocationMutations.ts
  c:\Tech-V2\frontend\src\hooks\mutations\useAdminMutations.ts

types/
  c:\Tech-V2\frontend\src\types\room.types.ts
  c:\Tech-V2\frontend\src\types\location.types.ts
  c:\Tech-V2\frontend\src\types\inventory.types.ts
  c:\Tech-V2\frontend\src\types\fundingSource.types.ts
  c:\Tech-V2\frontend\src\types\assignment.types.ts

config/
  c:\Tech-V2\frontend\src\config\authConfig.ts

styles/
  c:\Tech-V2\frontend\src\styles\global.css
```

### `backend/src/routes/`

```
admin.routes.ts
assignment.routes.ts
auth.routes.ts
fundingSource.routes.ts
inventory.routes.ts
location.routes.ts
room.routes.ts
user.routes.ts
```

### `backend/src/controllers/`

```
assignment.controller.ts
auth.controller.ts
fundingSource.controller.ts
inventory.controller.ts
location.controller.ts
room.controller.ts
user.controller.ts
```

### `backend/src/services/`

```
assignment.service.ts
cronJobs.service.ts
fundingSource.service.ts
inventory.service.ts
inventoryImport.service.ts
location.service.ts
room.service.ts
user.service.ts
userSync.service.ts
```

---

## File Contents

---

### 1. `frontend/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import Users from './pages/Users'
import SupervisorManagement from './pages/SupervisorManagement'
import RoomManagement from './pages/RoomManagement'
import { InventoryManagement } from './pages/InventoryManagement'
import MyEquipment from './pages/MyEquipment'
import FundingSourceManagement from './pages/FundingSourceManagement'
import { ProtectedRoute } from './components/ProtectedRoute'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requireAdmin>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisors"
          element={
            <ProtectedRoute requireAdmin>
              <SupervisorManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms"
          element={
            <ProtectedRoute requireAdmin>
              <RoomManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <InventoryManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-equipment"
          element={
            <ProtectedRoute>
              <MyEquipment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/funding-sources"
          element={
            <ProtectedRoute>
              <FundingSourceManagement />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

---

### 2. `frontend/src/pages/Dashboard.tsx`

```tsx
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/authService';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

export const Dashboard = () => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="page-wrapper">
      <header className="app-header">
        <div className="container">
          <div className="app-header-content">
            <h1>Tech Management System</h1>
            <div className="header-user-info">
              <div className="user-details">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
              </div>
              <button onClick={handleLogout} className="btn btn-ghost">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        <div className="container">
          <div className="page-header">
            <h2 className="page-title">Welcome, {user?.firstName || user?.name}</h2>
            <p className="page-description">Tech Department Management Portal</p>
          </div>

          <div className="card mb-8">
            <div className="card-header">
              <h3 className="card-title">Your Profile</h3>
            </div>
            <div className="grid grid-cols-2">
              <div>
                <p className="form-label">Name</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user?.name}</p>
              </div>
              <div>
                <p className="form-label">Email</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user?.email}</p>
              </div>
              {user?.jobTitle && (
                <div>
                  <p className="form-label">Job Title</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user.jobTitle}</p>
                </div>
              )}
              {user?.department && (
                <div>
                  <p className="form-label">Department</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user.department}</p>
                </div>
              )}
              <div>
                <p className="form-label">Role</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user?.roles?.join(', ') || 'N/A'}</p>
              </div>
              <div>
                <p className="form-label">Groups</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--slate-900)' }}>{user?.groups?.length || 0} group(s)</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="card">
              <div className="feature-icon inventory">INV</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Inventory</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Manage equipment and assets</p>
              <button onClick={() => navigate('/inventory')} className="btn btn-primary" style={{ width: '100%' }}>Manage Inventory</button>
            </div>

            <div className="card">
              <div className="feature-icon purchase">PO</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Purchase Orders</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Create and track purchase orders</p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled>Coming Soon</button>
            </div>

            <div className="card">
              <div className="feature-icon maintenance">MNT</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Maintenance</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Submit and manage maintenance requests</p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled>Coming Soon</button>
            </div>

            <div className="card">
              <div className="feature-icon users">USR</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Users</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Manage users and permissions</p>
              {user?.roles?.includes('ADMIN') ? (
                <button onClick={() => navigate('/users')} className="btn btn-primary" style={{ width: '100%' }}>Manage Users</button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled>Admin Only</button>
              )}
            </div>

            <div className="card">
              <div className="feature-icon settings">SUP</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Supervisors</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Manage locations and supervisor assignments</p>
              {user?.roles?.includes('ADMIN') ? (
                <button onClick={() => navigate('/supervisors')} className="btn btn-primary" style={{ width: '100%' }}>Manage Supervisors</button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled>Admin Only</button>
              )}
            </div>

            <div className="card">
              <div className="feature-icon rooms">ROOM</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Rooms</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Manage rooms and spaces across locations</p>
              {user?.roles?.includes('ADMIN') ? (
                <button onClick={() => navigate('/rooms')} className="btn btn-primary" style={{ width: '100%' }}>Manage Rooms</button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled>Admin Only</button>
              )}
            </div>

            <div className="card">
              <div className="feature-icon settings">FS</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Funding Sources</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Manage funding source reference data for equipment</p>
              <button onClick={() => navigate('/funding-sources')} className="btn btn-primary" style={{ width: '100%' }}>Manage Funding Sources</button>
            </div>

            <div className="card">
              <div className="feature-icon reports">RPT</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Reports</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>View and export reports</p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled>Coming Soon</button>
            </div>

            <div className="card">
              <div className="feature-icon settings">CFG</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--slate-900)' }}>Settings</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--slate-600)', marginBottom: '1.25rem', lineHeight: 1.5 }}>Configure system settings</p>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled>Coming Soon</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
```

---

### 3. `frontend/src/pages/InventoryManagement.tsx`

```tsx
/**
 * Inventory Management Page
 * Main page for viewing and managing inventory items
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import inventoryService from '../services/inventory.service';
import { InventoryItem, InventoryFilters, InventoryStatistics } from '../types/inventory.types';
import InventoryFormDialog from '../components/inventory/InventoryFormDialog';
import InventoryHistoryDialog from '../components/inventory/InventoryHistoryDialog';
import ImportInventoryDialog from '../components/inventory/ImportInventoryDialog';
import { AssignmentDialog } from '../components/inventory/AssignmentDialog';

interface PaginationModel {
  page: number;
  pageSize: number;
}

export const InventoryManagement = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [paginationModel, setPaginationModel] = useState<PaginationModel>({
    page: 0,
    pageSize: 50,
  });

  // Modal states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Filter state
  const [filters, setFilters] = useState<InventoryFilters>({
    search: '',
    status: undefined,
    isDisposed: false,
  });

  // Stats
  const [stats, setStats] = useState<InventoryStatistics | null>(null);

  useEffect(() => {
    fetchInventory();
  }, [paginationModel, filters]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await inventoryService.getInventory({
        page: paginationModel.page + 1,
        limit: paginationModel.pageSize,
        ...filters,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await inventoryService.getStats();
      setStats(statsData);
    } catch (err) {
      // Silent fail - stats are optional enhancement
    }
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setFormDialogOpen(true);
  };

  const handleEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormDialogOpen(true);
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`Mark "${item.name}" (${item.assetTag}) as disposed?`)) {
      return;
    }

    try {
      await inventoryService.deleteItem(item.id);
      fetchInventory();
      fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete item');
    }
  };

  const handleViewHistory = (item: InventoryItem) => {
    setSelectedItem(item);
    setHistoryDialogOpen(true);
  };

  const handleExport = async () => {
    try {
      await inventoryService.exportInventory({
        format: 'xlsx',
        filters,
      });
    } catch (err: any) {
      alert('Export failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleFormSuccess = () => {
    setFormDialogOpen(false);
    fetchInventory();
    fetchStats();
  };

  const handleImportSuccess = () => {
    setImportDialogOpen(false);
    fetchInventory();
    fetchStats();
  };

  const handleAssign = (item: InventoryItem) => {
    setSelectedItem(item);
    setAssignmentDialogOpen(true);
  };

  const handleAssignmentSuccess = () => {
    setAssignmentDialogOpen(false);
    fetchInventory();
  };

  const getStatusBadgeClass = (status: string): string => {
    const statusMap: Record<string, string> = {
      active: 'badge-success',
      available: 'badge-success',
      maintenance: 'badge-error',
      disposed: 'badge-error',
      storage: 'badge-error',
      damaged: 'badge-error',
      lost: 'badge-error',
      reserved: 'badge-error',
    };
    return statusMap[status] || 'badge-error';
  };

  return (
    <div className="page-wrapper">
      <header className="app-header">
        <div className="container">
          <div className="app-header-content">
            <h1>Tech Management System</h1>
            <div className="header-user-info">
              <div className="user-details">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
              </div>
              <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">
                ← Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content">
        <div className="container">
          <div className="page-header">
            <h2 className="page-title">Inventory Management</h2>
            <p className="page-description">Manage all equipment and assets</p>
          </div>

          <div className="card mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={fetchInventory} className="btn btn-ghost btn-sm" title="Refresh">
                🔄 Refresh
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setImportDialogOpen(true)} className="btn btn-secondary">
                  ⬆️ Import
                </button>
                <button onClick={handleExport} className="btn btn-secondary">
                  ⬇️ Export
                </button>
                <button onClick={handleCreate} className="btn btn-primary">
                  + Add Item
                </button>
              </div>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-4 gap-6 mb-6">
              <div className="card">
                <p className="form-label">Total Items</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                  {stats.totalItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Active</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--emerald-800)' }}>
                  {stats.activeItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Disposed</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--red-800)' }}>
                  {stats.disposedItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Total Value</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                  ${stats.totalValue.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="badge badge-error" style={{ padding: '1rem', display: 'block', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          <div className="card mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div style={{ gridColumn: '1 / 3' }}>
                <label className="form-label">Search</label>
                <input
                  type="text"
                  placeholder="Asset tag, name, serial number..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                  className="form-select"
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="available">Available</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="storage">Storage</option>
                  <option value="disposed">Disposed</option>
                </select>
              </div>
              <div>
                <label className="form-label">Show Disposed</label>
                <select
                  value={filters.isDisposed ? 'true' : 'false'}
                  onChange={(e) => setFilters({ ...filters, isDisposed: e.target.value === 'true' })}
                  className="form-select"
                >
                  <option value="false">Active Only</option>
                  <option value="true">Disposed Only</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFilters({ search: '', status: undefined, isDisposed: false })}
                className="btn btn-secondary btn-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{
                  width: '3rem',
                  height: '3rem',
                  border: '4px solid var(--slate-200)',
                  borderTop: '4px solid var(--primary-blue)',
                  borderRadius: '50%',
                  margin: '0 auto 1rem',
                  animation: 'spin 1s linear infinite'
                }} />
                <p style={{ color: 'var(--slate-600)' }}>Loading inventory...</p>
              </div>
            )}

            {!loading && (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset Tag</th>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Brand</th>
                      <th>Location</th>
                      <th>Assigned To</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td><strong style={{ fontWeight: 600 }}>{item.assetTag}</strong></td>
                        <td>{item.name}</td>
                        <td>{item.category?.name || 'N/A'}</td>
                        <td>{item.brand?.name || 'N/A'}</td>
                        <td>{item.officeLocation?.name || 'Unassigned'}</td>
                        <td>
                          {item.assignedToUser ? (
                            <span title={item.assignedToUser.email}>
                              {item.assignedToUser.displayName ||
                               `${item.assignedToUser.firstName} ${item.assignedToUser.lastName}`}
                            </span>
                          ) : item.room ? (
                            <span>{item.room.name}</span>
                          ) : (
                            <span style={{ color: 'var(--slate-400)' }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>
                          {item.purchasePrice ? `$${parseFloat(item.purchasePrice as any).toFixed(2)}` : 'N/A'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleAssign(item)} className="btn btn-sm btn-ghost" title="Assign">🔗</button>
                            <button onClick={() => handleEdit(item)} className="btn btn-sm btn-ghost" title="Edit">✏️</button>
                            <button onClick={() => handleViewHistory(item)} className="btn btn-sm btn-ghost" title="History">📜</button>
                            <button onClick={() => handleDelete(item)} className="btn btn-sm btn-ghost" title="Delete" style={{ color: 'var(--red-800)' }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--slate-200)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                    Showing {((paginationModel.page) * paginationModel.pageSize) + 1} to{' '}
                    {Math.min((paginationModel.page + 1) * paginationModel.pageSize, total)} of {total} items
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Rows per page:</label>
                    <select
                      value={paginationModel.pageSize}
                      onChange={(e) => setPaginationModel({ ...paginationModel, pageSize: parseInt(e.target.value), page: 0 })}
                      className="form-select"
                      style={{ width: 'auto' }}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <button
                      onClick={() => setPaginationModel({ ...paginationModel, page: paginationModel.page - 1 })}
                      disabled={paginationModel.page === 0}
                      className="btn btn-secondary btn-sm"
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                      Page {paginationModel.page + 1} of {Math.ceil(total / paginationModel.pageSize)}
                    </span>
                    <button
                      onClick={() => setPaginationModel({ ...paginationModel, page: paginationModel.page + 1 })}
                      disabled={(paginationModel.page + 1) * paginationModel.pageSize >= total}
                      className="btn btn-secondary btn-sm"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <InventoryFormDialog
        open={formDialogOpen}
        item={selectedItem}
        onClose={() => setFormDialogOpen(false)}
        onSuccess={handleFormSuccess}
      />
      <InventoryHistoryDialog
        open={historyDialogOpen}
        item={selectedItem}
        onClose={() => setHistoryDialogOpen(false)}
      />
      <ImportInventoryDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onSuccess={handleImportSuccess}
      />
      <AssignmentDialog
        open={assignmentDialogOpen}
        equipment={selectedItem}
        onClose={() => setAssignmentDialogOpen(false)}
        onSuccess={handleAssignmentSuccess}
      />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default InventoryManagement;
```

---

### 4. `frontend/src/pages/FundingSourceManagement.tsx`

```tsx
/**
 * Funding Source Management Page
 *
 * Allows users with TECHNOLOGY >= 2 permissions to manage the FundingSource
 * reference-data table.  Follows the InventoryManagement page-shell pattern
 * (plain CSS classes) with MUI Dialog for the create/edit form.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { z } from 'zod';
import fundingSourceService from '../services/fundingSourceService';
import type {
  FundingSource,
  CreateFundingSourceRequest,
  UpdateFundingSourceRequest,
} from '../types/fundingSource.types';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

const FundingSourceManagement = () => {
  const navigate = useNavigate();

  const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FundingSource | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadFundingSources = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const result = await fundingSourceService.getAll({
        search: search || undefined,
        isActive: showInactive ? undefined : true,
        sortBy: 'name',
        sortOrder: 'asc',
        limit: 500,
      });
      setFundingSources(result.items);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setPageError(e.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to load funding sources'));
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    loadFundingSources();
  }, [loadFundingSources]);

  const openCreateModal = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormIsActive(true);
    setFormErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (fs: FundingSource) => {
    setEditing(fs);
    setFormName(fs.name);
    setFormDescription(fs.description ?? '');
    setFormIsActive(fs.isActive);
    setFormErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = async () => {
    const parsed = formSchema.safeParse({
      name: formName,
      description: formDescription || undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        errs[issue.path[0] as string] = issue.message;
      });
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    setFormLoading(true);
    setFormError(null);

    try {
      if (editing) {
        const payload: UpdateFundingSourceRequest = {
          name: formName,
          description: formDescription || null,
          isActive: formIsActive,
        };
        await fundingSourceService.update(editing.id, payload);
      } else {
        const payload: CreateFundingSourceRequest = {
          name: formName,
          description: formDescription || null,
        };
        await fundingSourceService.create(payload);
      }
      closeModal();
      await loadFundingSources();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setFormError(e.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to save funding source'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = async (fs: FundingSource) => {
    if (!window.confirm(`Deactivate "${fs.name}"? It will no longer appear in dropdown lists but existing equipment references will be preserved.`)) {
      return;
    }
    try {
      await fundingSourceService.softDelete(fs.id);
      await loadFundingSources();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to deactivate funding source'));
    }
  };

  const handleReactivate = async (fs: FundingSource) => {
    try {
      await fundingSourceService.update(fs.id, { isActive: true });
      await loadFundingSources();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to reactivate funding source'));
    }
  };

  const handleHardDelete = async (fs: FundingSource) => {
    if (!window.confirm(`Permanently delete "${fs.name}"? This action is permanent and cannot be undone.`)) {
      return;
    }
    try {
      await fundingSourceService.hardDelete(fs.id);
      await loadFundingSources();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to permanently delete funding source'));
    }
  };

  return (
    <div className="page-wrapper">
      <header className="app-header">
        <div className="container">
          <div className="app-header-content">
            <h1>Funding Source Management</h1>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="page-content">
        <div className="container">
          <div className="page-header">
            <div>
              <h2 className="page-title">Funding Sources</h2>
              <p className="page-description">
                Manage the reference list of funding sources used for equipment purchases.
              </p>
            </div>
            <button className="btn btn-primary" onClick={openCreateModal}>
              + Add Funding Source
            </button>
          </div>

          <div className="card mb-4">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search funding sources..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ flex: '1 1 auto', minWidth: '200px', maxWidth: '400px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            </div>
          </div>

          {pageError && (
            <div className="alert alert-error mb-4">{pageError}</div>
          )}

          <div className="card">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <CircularProgress size={32} />
              </div>
            ) : fundingSources.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                No funding sources found.{' '}
                <button onClick={openCreateModal} className="btn btn-link" style={{ display: 'inline', padding: 0 }}>
                  Add one now.
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundingSources.map((fs) => (
                      <tr key={fs.id}>
                        <td style={{ fontWeight: 500 }}>{fs.name}</td>
                        <td style={{ color: 'var(--slate-600)' }}>
                          {fs.description || <em style={{ opacity: 0.5 }}>—</em>}
                        </td>
                        <td>
                          <span className={`badge ${fs.isActive ? 'badge-success' : 'badge-secondary'}`}>
                            {fs.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(fs)} title="Edit">Edit</button>
                            {fs.isActive ? (
                              <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(fs)} title="Deactivate">Deactivate</button>
                            ) : (
                              <>
                                <button className="btn btn-sm btn-secondary" onClick={() => handleReactivate(fs)} title="Reactivate">Reactivate</button>
                                <button className="btn btn-sm btn-danger" onClick={() => handleHardDelete(fs)} title="Permanently Delete">Permanently Delete</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={modalOpen} onClose={closeModal} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Funding Source' : 'Add Funding Source'}</DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            fullWidth required label="Name" value={formName}
            onChange={(e) => setFormName(e.target.value)}
            error={!!formErrors.name} helperText={formErrors.name}
            disabled={formLoading} sx={{ mb: 2 }}
          />
          <TextField
            fullWidth label="Description" multiline rows={3} value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            error={!!formErrors.description} helperText={formErrors.description}
            disabled={formLoading} sx={{ mb: 2 }}
          />
          {editing && (
            <FormControlLabel
              control={<Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} disabled={formLoading} />}
              label="Active"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal} disabled={formLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={formLoading}
            startIcon={formLoading ? <CircularProgress size={18} /> : undefined}>
            {editing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FundingSourceManagement;
```

---

### 5. `frontend/src/services/api.ts`

```typescript
import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// In-memory CSRF token cache — populated from the X-CSRF-Token response header
let csrfToken: string | null = null;

// Methods that require a CSRF token
const CSRF_PROTECTED_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// Create axios instance with cookie support
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor — attach CSRF token to all state-changing requests
api.interceptors.request.use(
  (config) => {
    if (config.method && CSRF_PROTECTED_METHODS.has(config.method.toLowerCase())) {
      if (csrfToken) {
        config.headers['x-xsrf-token'] = csrfToken;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — cache CSRF token + handle token refresh
api.interceptors.response.use(
  (response) => {
    const tokenFromHeader = response.headers['x-csrf-token'];
    if (tokenFromHeader) {
      csrfToken = tokenFromHeader;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await axios.post(
          `${API_URL}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );
        return api(originalRequest);
      } catch (refreshError) {
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

### 6. `frontend/src/services/fundingSourceService.ts`

```typescript
/**
 * Funding Source Service
 * Handles all API calls for FundingSource reference-data management.
 */

import { api } from './api';
import type {
  FundingSource,
  FundingSourceListResponse,
  CreateFundingSourceRequest,
  UpdateFundingSourceRequest,
  FundingSourceQueryParams,
} from '../types/fundingSource.types';

const fundingSourceService = {
  getAll: async (params?: FundingSourceQueryParams): Promise<FundingSourceListResponse> => {
    const q = new URLSearchParams();
    if (params?.page !== undefined) q.append('page', String(params.page));
    if (params?.limit !== undefined) q.append('limit', String(params.limit));
    if (params?.search) q.append('search', params.search);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.sortBy) q.append('sortBy', params.sortBy);
    if (params?.sortOrder) q.append('sortOrder', params.sortOrder);

    const qs = q.toString();
    const res = await api.get<FundingSourceListResponse>(
      `/funding-sources${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  getById: async (id: string): Promise<FundingSource> => {
    const res = await api.get<FundingSource>(`/funding-sources/${id}`);
    return res.data;
  },

  create: async (data: CreateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.post<FundingSource>('/funding-sources', data);
    return res.data;
  },

  update: async (id: string, data: UpdateFundingSourceRequest): Promise<FundingSource> => {
    const res = await api.put<FundingSource>(`/funding-sources/${id}`, data);
    return res.data;
  },

  softDelete: async (id: string): Promise<{ message: string; item: FundingSource }> => {
    const res = await api.delete<{ message: string; item: FundingSource }>(
      `/funding-sources/${id}`,
    );
    return res.data;
  },

  hardDelete: async (id: string): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`/funding-sources/${id}/hard`);
    return res.data;
  },
};

export default fundingSourceService;
```

---

### 7. `frontend/src/services/inventory.service.ts`

```typescript
/**
 * Inventory Service
 * Handles all API calls for inventory management
 */

import api from './api';
import {
  InventoryItem,
  InventoryListResponse,
  InventoryStatistics,
  InventoryFilters,
  CreateInventoryRequest,
  UpdateInventoryRequest,
  InventoryHistoryEntry,
  ImportJobStatus,
  ExportOptions,
} from '../types/inventory.types';

class InventoryService {
  async getInventory(filters: InventoryFilters = {}): Promise<InventoryListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await api.get(`/inventory?${params.toString()}`);
    return response.data;
  }

  async getStats(): Promise<InventoryStatistics> {
    const response = await api.get('/inventory/stats');
    return response.data;
  }

  async getItem(id: string): Promise<InventoryItem> {
    const response = await api.get(`/inventory/${id}`);
    return response.data;
  }

  async getHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const response = await api.get(`/inventory/${id}/history`);
    return response.data;
  }

  async createItem(data: CreateInventoryRequest): Promise<InventoryItem> {
    const response = await api.post('/inventory', data);
    return response.data;
  }

  async updateItem(id: string, data: UpdateInventoryRequest): Promise<InventoryItem> {
    const response = await api.put(`/inventory/${id}`, data);
    return response.data;
  }

  async deleteItem(id: string, permanent = false): Promise<void> {
    await api.delete(`/inventory/${id}${permanent ? '?permanent=true' : ''}`);
  }

  async bulkUpdate(
    itemIds: string[],
    updates: UpdateInventoryRequest
  ): Promise<{ updated: number; failed: number; errors: any[] }> {
    const response = await api.post('/inventory/bulk-update', { itemIds, updates });
    return response.data;
  }

  async getInventoryByLocation(locationId: string): Promise<InventoryItem[]> {
    const response = await api.get(`/locations/${locationId}/inventory`);
    return response.data;
  }

  async getInventoryByRoom(roomId: string): Promise<InventoryItem[]> {
    const response = await api.get(`/rooms/${roomId}/inventory`);
    return response.data;
  }

  async importInventory(
    fileData: string,
    fileName: string,
    options?: any
  ): Promise<{ jobId: string; message: string }> {
    const response = await api.post('/inventory/import', { fileData, fileName, options });
    return response.data;
  }

  async getImportJobStatus(jobId: string): Promise<ImportJobStatus> {
    const response = await api.get(`/inventory/import/${jobId}`);
    return response.data;
  }

  async exportInventory(options: ExportOptions): Promise<void> {
    const response = await api.post('/inventory/export', options, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const fileName = `inventory-export-${new Date().toISOString().split('T')[0]}.${options.format}`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
}

export default new InventoryService();
```

---

### 8. `frontend/src/store/authStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  entraId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  groups: string[];
  roles?: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      clearAuth: () =>
        set({ user: null, isAuthenticated: false }),

      setLoading: (loading) =>
        set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

---

### 9. `frontend/src/lib/queryKeys.ts`

```typescript
/**
 * Centralized Query Key Management
 */

export const queryKeys = {
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (page: number, limit: number, search?: string) =>
      [...queryKeys.users.lists(), { page, limit, search }] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
    permissions: (id: string) => [...queryKeys.users.detail(id), 'permissions'] as const,
    allPermissions: () => [...queryKeys.users.all, 'permissions'] as const,
    supervisorsList: () => [...queryKeys.users.all, 'supervisorsList'] as const,
  },

  locations: {
    all: ['locations'] as const,
    lists: () => [...queryKeys.locations.all, 'list'] as const,
    list: () => [...queryKeys.locations.lists()] as const,
    details: () => [...queryKeys.locations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.locations.details(), id] as const,
  },

  supervisors: {
    all: ['supervisors'] as const,
    lists: () => [...queryKeys.supervisors.all, 'list'] as const,
    list: () => [...queryKeys.supervisors.lists()] as const,
    userSupervisors: (userId: string) =>
      [...queryKeys.supervisors.all, 'user', userId] as const,
    search: (userId: string, query: string) =>
      [...queryKeys.supervisors.all, 'search', userId, query] as const,
  },

  admin: {
    all: ['admin'] as const,
    syncStatus: () => [...queryKeys.admin.all, 'syncStatus'] as const,
  },

  rooms: {
    all: ['rooms'] as const,
    lists: () => [...queryKeys.rooms.all, 'list'] as const,
    list: (params?: {
      page?: number;
      limit?: number;
      locationId?: string;
      type?: string;
      isActive?: boolean;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.rooms.lists(), params] as const,
    details: () => [...queryKeys.rooms.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.rooms.details(), id] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
```

---

### 10. `frontend/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin) {
    const isAdmin = user?.roles?.includes('ADMIN');

    if (!isAdmin) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You don't have permission to access this page.</p>
          <p style={{ marginTop: '20px', color: '#666' }}>
            Your current role: {user?.roles?.join(', ') || 'Unknown'}
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
};
```

---

### 11. `backend/src/server.ts`

```typescript
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import locationRoutes from './routes/location.routes';
import roomRoutes from './routes/room.routes';
import inventoryRoutes from './routes/inventory.routes';
import assignmentRoutes from './routes/assignment.routes';
import fundingSourceRoutes from './routes/fundingSource.routes';
import { cronJobsService } from './services/cronJobs.service';
import { provideCsrfToken, getCsrfToken } from './middleware/csrf';
import { logger, loggers } from './lib/logger';
import { requestId, httpLogger } from './middleware/requestLogger';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);
app.use(httpLogger);
app.use(provideCsrfToken);

app.get('/api/csrf-token', getCsrfToken);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', locationRoutes);
app.use('/api', roomRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', assignmentRoutes);
app.use('/api/funding-sources', fundingSourceRoutes);

app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Tech Department Management API v2',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      users: '/api/users/*',
      locations: '/api/locations/*',
      equipment: '/api/equipment/*',
      purchaseOrders: '/api/purchase-orders/*',
      maintenance: '/api/maintenance/*',
    },
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.path}` });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  loggers.error.error('Global error handler', {
    error: { message: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined, name: err.name },
    requestId: req.id,
    url: req.url,
    method: req.method,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

app.listen(PORT, () => {
  loggers.server.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`,
  });
  cronJobsService.start();
});

process.on('SIGTERM', () => { loggers.server.info('SIGTERM signal received'); cronJobsService.stop(); process.exit(0); });
process.on('SIGINT', () => { loggers.server.info('SIGINT signal received'); cronJobsService.stop(); process.exit(0); });

export default app;
```

---

### 12. `backend/src/routes/inventory.routes.ts`

```typescript
/**
 * Inventory Routes
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { checkPermission } from '../middleware/permissions';
import {
  InventoryIdParamSchema,
  LocationIdParamSchema,
  RoomIdParamSchema,
  GetInventoryQuerySchema,
  CreateInventorySchema,
  UpdateInventorySchema,
  BulkUpdateInventorySchema,
  ImportInventorySchema,
  ExportInventorySchema,
  ImportJobIdParamSchema,
} from '../validators/inventory.validators';
import * as inventoryController from '../controllers/inventory.controller';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  },
});

router.use(authenticate);
router.use(validateCsrfToken);

// GET /api/inventory
router.get('/inventory', validateRequest(GetInventoryQuerySchema, 'query'), checkPermission('TECHNOLOGY', 1), inventoryController.getInventory);

// GET /api/inventory/stats
router.get('/inventory/stats', checkPermission('TECHNOLOGY', 1), inventoryController.getInventoryStats);

// GET /api/inventory/:id
router.get('/inventory/:id', validateRequest(InventoryIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 1), inventoryController.getInventoryItem);

// GET /api/inventory/:id/history
router.get('/inventory/:id/history', validateRequest(InventoryIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 1), inventoryController.getInventoryHistory);

// POST /api/inventory
router.post('/inventory', validateRequest(CreateInventorySchema, 'body'), checkPermission('TECHNOLOGY', 2), inventoryController.createInventoryItem);

// PUT /api/inventory/:id
router.put('/inventory/:id', validateRequest(InventoryIdParamSchema, 'params'), validateRequest(UpdateInventorySchema, 'body'), checkPermission('TECHNOLOGY', 2), inventoryController.updateInventoryItem);

// DELETE /api/inventory/:id
router.delete('/inventory/:id', validateRequest(InventoryIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 2), inventoryController.deleteInventoryItem);

// POST /api/inventory/bulk-update
router.post('/inventory/bulk-update', validateRequest(BulkUpdateInventorySchema, 'body'), checkPermission('TECHNOLOGY', 2), inventoryController.bulkUpdateInventory);

// GET /api/locations/:locationId/inventory
router.get('/locations/:locationId/inventory', validateRequest(LocationIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 1), inventoryController.getInventoryByLocation);

// GET /api/rooms/:roomId/inventory
router.get('/rooms/:roomId/inventory', validateRequest(RoomIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 1), inventoryController.getInventoryByRoom);

// POST /api/inventory/import
router.post('/inventory/import', upload.single('file'), checkPermission('TECHNOLOGY', 3), inventoryController.importInventory);

// GET /api/inventory/import
router.get('/inventory/import', checkPermission('TECHNOLOGY', 3), inventoryController.getImportJobs);

// GET /api/inventory/import/:jobId
router.get('/inventory/import/:jobId', validateRequest(ImportJobIdParamSchema, 'params'), checkPermission('TECHNOLOGY', 3), inventoryController.getImportJobStatus);

// POST /api/inventory/export — COMMENTED OUT (Phase 6 TODO)
// router.post('/inventory/export', validateRequest(ExportInventorySchema, 'body'), checkPermission('TECHNOLOGY', 1), inventoryController.exportInventory);

export default router;
```

---

### 13. `backend/src/controllers/inventory.controller.ts` — Lines 1–100

```typescript
/**
 * Inventory Controller
 *
 * Handles HTTP requests and responses for inventory management endpoints.
 * Delegates business logic to InventoryService.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InventoryService } from '../services/inventory.service';
import { InventoryImportService } from '../services/inventoryImport.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const inventoryService = new InventoryService(prisma);
const importService = new InventoryImportService(prisma);

/**
 * Get inventory items with filters and pagination
 * GET /api/inventory
 */
export const getInventory = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      search,
      locationId,
      officeLocationId,
      roomId,
      categoryId,
      status,
      isDisposed,
      brandId,
      vendorId,
      modelId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      purchaseDateFrom,
      purchaseDateTo,
    } = req.query;

    const query = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string | undefined,
      locationId: locationId as string | undefined,
      officeLocationId: officeLocationId as string | undefined,
      roomId: roomId as string | undefined,
      categoryId: categoryId as string | undefined,
      status: status as string | undefined,
      isDisposed: isDisposed === 'true' ? true : isDisposed === 'false' ? false : undefined,
      brandId: brandId as string | undefined,
      vendorId: vendorId as string | undefined,
      modelId: modelId as string | undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      purchaseDateFrom: purchaseDateFrom ? new Date(purchaseDateFrom as string) : undefined,
      purchaseDateTo: purchaseDateTo ? new Date(purchaseDateTo as string) : undefined,
    };

    const result = await inventoryService.findAll(query);

    logger.info('Inventory items retrieved', {
      userId: req.user?.id,
      count: result.items.length,
      total: result.total,
      page: result.page,
    });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * Get inventory statistics for dashboard
 * GET /api/inventory/stats
 */
export const getInventoryStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await inventoryService.getStatistics();

    logger.info('Inventory statistics retrieved', {
      userId: req.user?.id,
      totalItems: stats.totalItems,
    });

    res.json(stats);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

### 14. `backend/prisma/schema.prisma` — Lines 1–200

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

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

model categories {
  id               String       @id @default(uuid())
  name             String       @unique
  description      String?
  parentId         String?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  categories       categories?  @relation("categoriesTocategories", fields: [parentId], references: [id])
  other_categories categories[] @relation("categoriesTocategories")
  equipment        equipment[]
}

model equipment {
  id                  String                @id @default(uuid())
  assetTag            String                @unique
  serialNumber        String?
  name                String
  description         String?
  brandId             String?
  modelId             String?
  locationId          String?
  categoryId          String?
  purchaseDate        DateTime?
  purchasePrice       Decimal?              @db.Decimal(10, 2)
  status              String                @default("active")
  condition           String?
  isDisposed          Boolean               @default(false)
  disposedDate        DateTime?
  disposedReason      String?
  notes               String?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
  // NEW FIELDS FOR INVENTORY MVP
  officeLocationId    String?
  fundingSource       String?
  fundingSourceId     String?
  poNumber            String?
  vendorId            String?
  roomId              String?
  disposalDate        DateTime?
  // Additional inventory fields
  warrantyExpires     DateTime?
  assignedToUserId    String?
  barcode             String?               @unique
  qrCode              String?
  maintenanceSchedule String?
  lastMaintenanceDate DateTime?
  customFields        Json?
  // Relations
  brands              brands?               @relation(fields: [brandId], references: [id])
  categories          categories?           @relation(fields: [categoryId], references: [id])
  locations           locations?            @relation(fields: [locationId], references: [id])
  models              models?               @relation(fields: [modelId], references: [id])
  officeLocation      OfficeLocation?       @relation(fields: [officeLocationId], references: [id])
  vendor              vendors?              @relation(fields: [vendorId], references: [id])
  room                Room?                 @relation(fields: [roomId], references: [id])
  fundingSourceRef    FundingSource?        @relation(fields: [fundingSourceId], references: [id])
  assignedToUser      User?                 @relation("EquipmentAssignedTo", fields: [assignedToUserId], references: [id])
  inventory_changes   inventory_changes[]
  importJobs          InventoryImportItem[]
  attachments         EquipmentAttachment[]
  maintenanceHistory  MaintenanceHistory[]
  assignmentHistory   EquipmentAssignmentHistory[]

  @@index([assetTag])
  @@index([locationId])
  @@index([status])
  @@index([officeLocationId])
  @@index([isDisposed])
  @@index([categoryId])
  @@index([roomId])
  @@index([assignedToUserId])
  @@index([barcode])
  @@index([officeLocationId, status])
  @@index([categoryId, status])
  @@index([fundingSourceId])
}

model inventory_changes {
  id            String    @id @default(uuid())
  equipmentId   String
  changeType    String
  fieldChanged  String?
  oldValue      String?
  newValue      String?
  changedBy     String
  changedByName String
  changedAt     DateTime  @default(now())
  notes         String?
  equipment     equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)

  @@index([changedAt])
  @@index([equipmentId])
  @@index([changedBy])
}

model EquipmentAttachment {
  id          String    @id @default(uuid())
  equipmentId String
  fileName    String
  fileUrl     String
  fileType    String
  fileSize    Int
  description String?
  uploadedBy  String
  uploadedAt  DateTime  @default(now())
  equipment   equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [uploadedBy], references: [id])

  @@index([equipmentId])
  @@map("equipment_attachments")
}

model MaintenanceHistory {
  id              String    @id @default(uuid())
  equipmentId     String
  maintenanceType String
  description     String
  performedBy     String
  performedDate   DateTime
  cost            Decimal?  @db.Decimal(10, 2)
  notes           String?
  nextDueDate     DateTime?
  createdAt       DateTime  @default(now())
  equipment       equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [performedBy], references: [id])

  @@index([equipmentId])
  @@index([performedDate])
  @@map("maintenance_history")
}

model EquipmentAssignmentHistory {
  id              String    @id @default(uuid())
  equipmentId     String
  assignmentType  String    // "user", "room", "location", "unassign"
  assignedToId    String?
  assignedToType  String?   // "User", "Room", "OfficeLocation"
  assignedToName  String
  assignedBy      String
  assignedByName  String
  assignedAt      DateTime  @default(now())
  unassignedAt    DateTime?
  notes           String?
  equipmentName   String
  equipmentTag    String
  createdAt       DateTime  @default(now())

  equipment       equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [assignedBy], references: [id])

  @@index([equipmentId])
  @@index([assignedToId, assignedToType])
  @@index([assignedBy])
  @@index([assignedAt])
  @@map("equipment_assignment_history")
}

model LocationSupervisor {
  id             String         @id @default(uuid())
  locationId     String
  userId         String
  supervisorType String
  isPrimary      Boolean        @default(false)
  assignedAt     DateTime       @default(now())
  // (continues beyond line 200...)
}
```

---

## Key Findings Summary

### Architecture
- **Frontend**: React 18 + TypeScript SPA. Plain CSS class-based styling (custom design system — no MUI layout wrappers, only MUI dialogs in FundingSource/Inventory forms). React Router v6, Zustand for auth state (persisted to localStorage), no TanStack Query wiring yet on inventory/funding pages (direct `useState`/`useEffect` fetches).
- **Backend**: Express + TypeScript. All routes grouped under `/api/*`. Middleware stack: helmet → CORS → rate-limit → body-parser → cookie-parser → requestId → httpLogger → CSRF provider.

### Routes Registered (server.ts)
| Prefix | File |
|---|---|
| `/api/auth` | auth.routes.ts |
| `/api/users` | user.routes.ts |
| `/api/admin` | admin.routes.ts |
| `/api` (locations) | location.routes.ts |
| `/api` (rooms) | room.routes.ts |
| `/api` (inventory) | inventory.routes.ts |
| `/api` (assignments) | assignment.routes.ts |
| `/api/funding-sources` | fundingSource.routes.ts |

### Permission Model
Inventory uses `checkPermission('TECHNOLOGY', level)`:
- Level 1 → read
- Level 2 → create/update/delete
- Level 3 → import jobs

### Notable Gaps / Quick Win Opportunities
1. **`queryKeys.ts` missing `inventory` and `fundingSources` entries** — inventory/funding pages use raw `useState` rather than TanStack Query. Adding these keys + hooks would improve consistency and cache invalidation.
2. **Export route commented out** — `POST /api/inventory/export` is disabled (Phase 6 TODO). Frontend calls it but gets a 404.
3. **`ProtectedRoute` only checks `ADMIN` role** — no TECHNOLOGY permission tier check at the route level; permission enforcement is purely backend middleware.
4. **`vendorId` filter exposed in controller** but no vendor filter in the UI filters panel.
5. **`fundingSource` (free-text string) AND `fundingSourceId` (FK) both exist** on `equipment` — legacy dual-field pattern; migration to FK-only is a cleanup opportunity.
6. **`queryKeys` has no `fundingSources` namespace** — FundingSourceManagement uses service directly without any caching layer.

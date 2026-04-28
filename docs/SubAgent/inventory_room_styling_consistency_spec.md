# Inventory & Room Management Styling Consistency Specification

**Generated:** February 20, 2026  
**Purpose:** Refactor InventoryManagement.tsx and RoomManagement.tsx to match the consistent styling pattern used across the Tech-V2 application.

---

## Executive Summary

This specification documents the refactoring plan to bring InventoryManagement.tsx and RoomManagement.tsx into alignment with the consistent design system used throughout the Tech-V2 application. The goal is to remove Material-UI dependencies and custom CSS in favor of the standardized global.css classes and HTML structure patterns.

---

## 1. Current State Analysis

### 1.1 Reference Implementation Pattern (Consistent Pages)

**Pages Following the Pattern:**
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Users.tsx`
- `frontend/src/pages/SupervisorManagement.tsx`

**Standard Structure:**
```tsx
<div className="page-wrapper">
  <header className="app-header">
    <div className="container">
      <div className="app-header-content">
        <h1>Application Title</h1>
        <div className="header-user-info">
          <div className="user-details">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="btn btn-ghost">Logout / Navigation</button>
        </div>
      </div>
    </div>
  </header>

  <main className="page-content">
    <div className="container">
      <div className="page-header">
        <h2 className="page-title">Page Title</h2>
        <p className="page-description">Page description</p>
      </div>

      {/* Content cards, filters, tables */}
    </div>
  </main>
</div>
```

**Standard CSS Classes:**
- **Layout:** `page-wrapper`, `app-header`, `container`, `page-content`, `page-header`
- **Typography:** `page-title`, `page-description`, `card-title`, `card-subtitle`, `form-label`
- **Cards:** `card`, `card-header`
- **Buttons:** `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`, `btn-lg`
- **Forms:** `form-input`, `form-select`
- **Tables:** `table` (with standard thead/tbody structure)
- **Badges:** `badge`, `badge-success`, `badge-error`
- **Grid:** `grid`, `grid-cols-1`, `grid-cols-2`, `grid-cols-3`, `grid-cols-4`
- **Utilities:** `flex`, `flex-col`, `items-center`, `justify-between`, `text-center`, `mt-4`, `mb-6`, `gap-4`, etc.

**Standard Modal Pattern:**
```tsx
<div style={{ 
  position: 'fixed', 
  inset: 0, 
  backgroundColor: 'rgba(0, 0, 0, 0.5)', 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'center', 
  zIndex: 50,
  padding: '1rem'
}}>
  <div className="card" style={{ maxWidth: '56rem', width: '100%', maxHeight: '90vh', overflow: 'hidden', padding: 0 }}>
    <div className="card-header" style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      backgroundColor: 'var(--slate-50)', 
      padding: '1.5rem' 
    }}>
      <div>
        <h2 className="card-title">Modal Title</h2>
        <p className="card-subtitle">Optional subtitle</p>
      </div>
      <button onClick={onClose} style={{ 
        background: 'none', 
        border: 'none', 
        cursor: 'pointer', 
        color: 'var(--slate-400)' 
      }}>
        {/* Close icon SVG */}
      </button>
    </div>

    <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(90vh - 180px)' }}>
      {/* Modal content */}
    </div>

    <div style={{ 
      padding: '1.5rem', 
      borderTop: '1px solid var(--slate-200)', 
      display: 'flex', 
      justifyContent: 'flex-end',
      gap: '0.75rem',
      backgroundColor: 'var(--slate-50)' 
    }}>
      <button className="btn btn-secondary">Cancel</button>
      <button className="btn btn-primary">Submit</button>
    </div>
  </div>
</div>
```

### 1.2 Inconsistent Pages Analysis

#### 1.2.1 InventoryManagement.tsx

**Current Issues:**
1. ❌ Uses Material-UI components extensively:
   - `Box`, `Button`, `Card`, `TextField`, `MenuItem`, `Typography`, `Chip`, `IconButton`, `Tooltip`, `Stack`, `Alert`
   - `DataGrid` from @mui/x-data-grid
   - Material Icons
2. ❌ Has custom CSS file: `InventoryManagement.css` (minimal usage, can be removed)
3. ❌ No `page-wrapper` or `app-header` structure
4. ❌ No user info display or navigation in header
5. ❌ Uses MUI-specific styling with `sx` props
6. ❌ Starts directly with `<Box sx={{ p: 3 }}>`

**Current Structure:**
```tsx
<Box sx={{ p: 3 }}>
  <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
    {/* Header with title and buttons */}
  </Box>
  
  {stats && <Box sx={{ display: 'grid', ... }}>
    {/* Stats cards using MUI Card */}
  </Box>}
  
  {error && <Alert severity="error" />}
  
  <Card sx={{ p: 2, mb: 3 }}>
    {/* Filters using TextField, MenuItem */}
  </Card>
  
  <Card>
    <DataGrid rows={items} columns={columns} ... />
  </Card>

  {/* MUI Dialogs */}
</Box>
```

**Functionality to Preserve:**
- ✅ Pagination (page, pageSize)
- ✅ Filtering (search, status, isDisposed)
- ✅ Statistics display (totalItems, activeItems, disposedItems, totalValue)
- ✅ CRUD operations (create, edit, delete)
- ✅ View history functionality
- ✅ Import/export functionality
- ✅ Column definitions and data formatting
- ✅ Status badges with color coding
- ✅ Action buttons (Edit, History, Delete) per row

#### 1.2.2 RoomManagement.tsx

**Current Issues:**
1. ❌ Has custom CSS file: `RoomManagement.css` (377 lines of redundant styling)
2. ❌ Uses inconsistent class names:
   - `btn-primary` instead of `btn btn-primary`
   - `badge-blue`, `badge-purple`, etc. (custom color classes not in global.css)
3. ❌ Missing `page-wrapper` structure
4. ❌ No `app-header` with user info and logout
5. ❌ Custom `page-header` class that differs from standard
6. ❌ Custom table styling instead of standard `.table`
7. ❌ Uses emoji icons in buttons instead of standard button patterns

**Current Structure:**
```tsx
<div className="room-management">
  <div className="page-header">
    {/* Custom header without user info */}
  </div>

  <div className="stats-grid">
    {/* Custom styled stats cards */}
  </div>

  <div className="filters-section">
    {/* Custom styled filters */}
  </div>

  <div className="rooms-container">
    {/* Custom styled rooms table grouped by location */}
  </div>

  <RoomFormModal ... />
</div>
```

**Functionality to Preserve:**
- ✅ Filters (locationId, type, search, isActive)
- ✅ Statistics summary (total, active, inactive, locations count)
- ✅ Rooms grouped by location display
- ✅ CRUD operations (create, edit, delete/deactivate, toggle active)
- ✅ Room type labels and badge colors
- ✅ Building, floor, capacity display
- ✅ Location-based grouping
- ✅ RoomFormModal integration

---

## 2. Target State Specification

### 2.1 InventoryManagement.tsx Refactoring

#### 2.1.1 New HTML Structure

```tsx
import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import inventoryService from '../services/inventory.service';
import { InventoryItem, InventoryFilters, InventoryStatistics } from '../types/inventory.types';
import InventoryFormDialog from '../components/inventory/InventoryFormDialog';
import InventoryHistoryDialog from '../components/inventory/InventoryHistoryDialog';
import ImportInventoryDialog from '../components/inventory/ImportInventoryDialog';

export const InventoryManagement = () => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  /* ... existing state ... */

  const handleLogout = async () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="page-wrapper">
      {/* HEADER: Standard app header with user info */}
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

      {/* MAIN CONTENT */}
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header">
            <h2 className="page-title">Inventory Management</h2>
            <p className="page-description">Manage all equipment and assets</p>
          </div>

          {/* Action Buttons */}
          <div className="card mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                onClick={fetchInventory}
                className="btn btn-ghost btn-sm"
                title="Refresh"
              >
                🔄 Refresh
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  onClick={() => setImportDialogOpen(true)}
                  className="btn btn-secondary"
                >
                  ⬆️ Import
                </button>
                <button 
                  onClick={handleExport}
                  className="btn btn-secondary"
                >
                  ⬇️ Export
                </button>
                <button 
                  onClick={handleCreate}
                  className="btn btn-primary"
                >
                  + Add Item
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
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

          {/* Error Message */}
          {error && (
            <div className="badge badge-error" style={{ padding: '1rem', display: 'block', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          {/* Filters */}
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

          {/* Data Table (replacing MUI DataGrid) */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
                      <th>Status</th>
                      <th>Value</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ fontWeight: 600 }}>{item.assetTag}</strong>
                        </td>
                        <td>{item.name}</td>
                        <td>{item.category?.name || 'N/A'}</td>
                        <td>{item.brand?.name || 'N/A'}</td>
                        <td>{item.officeLocation?.name || 'Unassigned'}</td>
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
                            <button 
                              onClick={() => handleEdit(item)}
                              className="btn btn-sm btn-ghost"
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button 
                              onClick={() => handleViewHistory(item)}
                              className="btn btn-sm btn-ghost"
                              title="History"
                            >
                              📜
                            </button>
                            <button 
                              onClick={() => handleDelete(item)}
                              className="btn btn-sm btn-ghost"
                              title="Delete"
                              style={{ color: 'var(--red-800)' }}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
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

      {/* DIALOGS - Keep existing dialog components */}
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
    </div>
  );
};

// Helper function for status badge classes
const getStatusBadgeClass = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: 'badge-success',
    available: 'badge-success',
    maintenance: 'badge-error',
    disposed: 'badge-error',
    storage: 'badge-error',
  };
  return statusMap[status] || 'badge-error';
};
```

#### 2.1.2 Material-UI Component Mapping

| Material-UI Component | Standard Replacement |
|----------------------|---------------------|
| `<Box>` | `<div>` with inline styles or utility classes |
| `<Button variant="contained">` | `<button className="btn btn-primary">` |
| `<Button variant="outlined">` | `<button className="btn btn-secondary">` |
| `<Card>` | `<div className="card">` |
| `<TextField>` | `<input className="form-input">` or `<select className="form-select">` |
| `<Typography variant="h4">` | `<h2 className="page-title">` or inline styles |
| `<Typography variant="body2">` | `<p className="form-label">` or `<p>` with styles |
| `<Chip>` | `<span className="badge badge-success">` |
| `<Alert severity="error">` | `<div className="badge badge-error">` |
| `<DataGrid>` | `<table className="table">` with custom pagination |
| `<IconButton>` | `<button className="btn btn-sm btn-ghost">` |
| `<Tooltip>` | HTML `title` attribute |
| `<Stack direction="row">` | `<div style={{ display: 'flex', gap: '0.75rem' }}>` |

#### 2.1.3 Imports to Remove

```tsx
// REMOVE these imports:
import {
  Box,
  Button,
  Card,
  TextField,
  MenuItem,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';

// ADD these imports:
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
```

#### 2.1.4 Files to Delete

- `frontend/src/pages/InventoryManagement.css` (no longer needed)

### 2.2 RoomManagement.tsx Refactoring

#### 2.2.1 New HTML Structure

```tsx
import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import roomService from '../services/roomService';
import locationService from '../services/location.service';
import { RoomWithLocation, CreateRoomRequest, UpdateRoomRequest, RoomType } from '../types/room.types';
import { OfficeLocation } from '../types/location.types';
import RoomFormModal from '../components/RoomFormModal';

export const RoomManagement = () => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  /* ... existing state ... */

  const handleLogout = async () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="page-wrapper">
      {/* HEADER: Standard app header */}
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

      {/* MAIN CONTENT */}
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 className="page-title">Room Management</h2>
              <p className="page-description">Manage rooms and spaces across all locations</p>
            </div>
            <button onClick={openCreateModal} className="btn btn-primary">
              + Add Room
            </button>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-4 gap-6 mb-6">
            <div className="card">
              <p className="form-label">Total Rooms</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                {stats.total}
              </p>
            </div>
            <div className="card">
              <p className="form-label">Locations</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                {locations.length}
              </p>
            </div>
            <div className="card">
              <p className="form-label">Active</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--emerald-800)' }}>
                {rooms.filter(r => r.isActive).length}
              </p>
            </div>
            <div className="card">
              <p className="form-label">Inactive</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-400)' }}>
                {rooms.filter(r => !r.isActive).length}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="card mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="form-label">Location</label>
                <select
                  value={filters.locationId}
                  onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}
                  className="form-select"
                >
                  <option value="">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="form-select"
                >
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

              <div>
                <label className="form-label">Status</label>
                <select
                  value={filters.isActive.toString()}
                  onChange={(e) => setFilters({ ...filters, isActive: e.target.value === 'true' })}
                  className="form-select"
                >
                  <option value="true">Active Only</option>
                  <option value="false">Inactive Only</option>
                </select>
              </div>

              <div>
                <label className="form-label">Search</label>
                <input
                  type="text"
                  placeholder="Search rooms..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p style={{ color: 'var(--slate-600)' }}>Loading rooms...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="badge badge-error" style={{ padding: '1rem', display: 'block' }}>
              {error}
            </div>
          )}

          {/* Rooms List */}
          {!loading && !error && (
            <>
              {Object.keys(groupedRooms).length === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--slate-500)', marginBottom: '1rem' }}>
                    No rooms found matching your filters.
                  </p>
                  <button onClick={openCreateModal} className="btn btn-secondary">
                    Create First Room
                  </button>
                </div>
              ) : (
                Object.entries(groupedRooms).map(([locationName, locationRooms]) => (
                  <div key={locationName} className="card mb-6" style={{ padding: 0 }}>
                    <div style={{ 
                      padding: '1rem 1.5rem', 
                      backgroundColor: 'var(--slate-50)', 
                      borderBottom: '1px solid var(--slate-200)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--slate-900)' }}>
                        {locationName}
                      </h3>
                      <span style={{ fontSize: '0.875rem', color: 'var(--slate-500)' }}>
                        ({locationRooms.length} rooms)
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Room</th>
                            <th>Type</th>
                            <th>Building</th>
                            <th>Floor</th>
                            <th>Capacity</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationRooms.map((room) => (
                            <tr key={room.id} style={{ opacity: !room.isActive ? 0.6 : 1 }}>
                              <td>
                                <strong style={{ display: 'block', fontWeight: 600 }}>
                                  {room.name}
                                </strong>
                                {room.notes && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
                                    {room.notes}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${getRoomTypeBadgeClass(room.type)}`}>
                                  {getRoomTypeLabel(room.type)}
                                </span>
                              </td>
                              <td>{room.building || '—'}</td>
                              <td>{room.floor !== null ? room.floor : '—'}</td>
                              <td>{room.capacity !== null ? room.capacity : '—'}</td>
                              <td>
                                <span className={`badge ${room.isActive ? 'badge-success' : 'badge-error'}`}>
                                  {room.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button
                                    onClick={() => openEditModal(room)}
                                    className="btn btn-sm btn-ghost"
                                    title="Edit room"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleToggleActive(room)}
                                    className="btn btn-sm btn-ghost"
                                    title={room.isActive ? 'Deactivate' : 'Activate'}
                                  >
                                    {room.isActive ? '🔒' : '🔓'}
                                  </button>
                                  {room.isActive && (
                                    <button
                                      onClick={() => handleDeleteRoom(room.id, room.name)}
                                      className="btn btn-sm btn-ghost"
                                      title="Deactivate room"
                                      style={{ color: 'var(--red-800)' }}
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </main>

      {/* MODAL - Keep existing RoomFormModal */}
      <RoomFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        room={editingRoom}
        title={editingRoom ? 'Edit Room' : 'Create New Room'}
      />
    </div>
  );
};

// Helper functions
const getRoomTypeLabel = (type: RoomType | null): string => {
  if (!type) return 'General';
  return type.replace(/_/g, ' ');
};

const getRoomTypeBadgeClass = (type: RoomType | null): string => {
  // Map room types to standard badge classes from global.css
  const typeMap: Record<string, string> = {
    CLASSROOM: 'badge-success',
    OFFICE: 'badge-success',
    GYM: 'badge-success',
    CAFETERIA: 'badge-error',
    LIBRARY: 'badge-success',
    LAB: 'badge-success',
    MAINTENANCE: 'badge-error',
    SPORTS: 'badge-success',
    MUSIC: 'badge-success',
    MEDICAL: 'badge-error',
    CONFERENCE: 'badge-success',
    TECHNOLOGY: 'badge-success',
    TRANSPORTATION: 'badge-error',
    SPECIAL_ED: 'badge-success',
    GENERAL: 'badge-error',
    OTHER: 'badge-error',
  };
  return typeMap[type || 'GENERAL'] || 'badge-error';
};
```

#### 2.2.2 Custom CSS to Standard CSS Mapping

| Custom Class (RoomManagement.css) | Standard Replacement (global.css) |
|----------------------------------|-----------------------------------|
| `.room-management` | `<div className="page-wrapper">` |
| `.page-header` | `<div className="page-header">` (with adjusted structure) |
| `.btn-primary` | `<button className="btn btn-primary">` |
| `.btn-secondary` | `<button className="btn btn-secondary">` |
| `.stats-grid` | `<div className="grid grid-cols-4">` |
| `.stat-card` | `<div className="card">` |
| `.stat-label` | `<p className="form-label">` |
| `.stat-value` | `<p>` with inline styles |
| `.filters-section` | `<div className="card">` with grid inside |
| `.filter-group` | `<div>` with label + form-input/form-select |
| `.rooms-container` | `<div>` (no special class needed) |
| `.location-group` | `<div className="card">` |
| `.location-header` | `<div>` with inline styles |
| `.rooms-table` | `<table className="table">` |
| `.badge-blue`, `.badge-purple`, etc. | `<span className="badge badge-success">` or `badge-error` |
| `.status-badge.active` | `<span className="badge badge-success">` |
| `.status-badge.inactive` | `<span className="badge badge-error">` |

#### 2.2.3 Files to Delete

- `frontend/src/pages/RoomManagement.css` (377 lines → replaced by global.css)

#### 2.2.4 Required Imports

```tsx
// ADD these imports at the top:
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
```

---

## 3. Step-by-Step Refactoring Plan

### 3.1 InventoryManagement.tsx Refactoring Steps

**Phase 1: Preparation**
1. ✅ Create backup of original file
2. ✅ Review all Material-UI component usage
3. ✅ Identify state management and business logic to preserve

**Phase 2: Structure Changes**
1. Add `useAuthStore` and `useNavigate` imports
2. Add `user` and `clearAuth` from `useAuthStore()`
3. Add `navigate` from `useNavigate()`
4. Wrap entire component in `<div className="page-wrapper">`
5. Add `<header className="app-header">` with standard structure
6. Add `<main className="page-content">` with `<div className="container">`
7. Add `<div className="page-header">` with title and description

**Phase 3: Remove Material-UI Components**
1. Replace `<Box>` with `<div>` + appropriate classes/styles
2. Replace all `<Button>` with `<button className="btn ...">` 
3. Replace `<Card>` with `<div className="card">`
4. Replace `<TextField>` with `<input className="form-input">` or `<select className="form-select">`
5. Replace `<Typography>` with appropriate HTML elements
6. Replace `<Chip>` with `<span className="badge ...">` 
7. Replace `<Alert>` with styled `<div className="badge badge-error">`
8. Replace `<IconButton>` with `<button className="btn btn-sm btn-ghost">`
9. Remove `<Tooltip>` and use `title` attribute
10. Remove all Material Icons, use emoji or text

**Phase 4: Replace DataGrid with Standard Table**
1. Create `<table className="table">` structure
2. Add `<thead>` with column headers
3. Add `<tbody>` with mapped rows
4. Implement custom pagination controls at bottom
5. Add pagination state handlers
6. Add rows-per-page selector

**Phase 5: Testing & Cleanup**
1. Test all CRUD operations (Create, Read, Update, Delete)
2. Test filters and search
3. Test pagination
4. Test import/export
5. Test view history
6. Remove `InventoryManagement.css`
7. Remove Material-UI imports
8. Verify no console errors
9. Check responsive behavior

### 3.2 RoomManagement.tsx Refactoring Steps

**Phase 1: Preparation**
1. ✅ Create backup of original file
2. ✅ Review all custom CSS usage
3. ✅ Identify all custom color badge classes

**Phase 2: Structure Changes**
1. Add `useAuthStore` and `useNavigate` imports
2. Add `user` and `clearAuth` from `useAuthStore()`
3. Add `navigate` from `useNavigate()`
4. Change `.room-management` to `<div className="page-wrapper">`
5. Add `<header className="app-header">` with standard structure
6. Add `<main className="page-content">` with `<div className="container">`
7. Restructure page header with standard classes

**Phase 3: Replace Custom Classes**
1. Change `.stats-grid` to `<div className="grid grid-cols-4">`
2. Change `.stat-card` to `<div className="card">`
3. Change `.filters-section` to `<div className="card">` with grid inside
4. Change all `.filter-group` to standard form structure
5. Change `.rooms-table` to `<table className="table">`
6. Update all button classes to standard pattern

**Phase 4: Badge System Updates**
1. Replace all custom badge color classes with `badge-success` or `badge-error`
2. Update `getRoomTypeBadgeClass()` helper to return only standard classes
3. Update status badges to use `badge-success` or `badge-error`

**Phase 5: Testing & Cleanup**
1. Test all CRUD operations
2. Test filters (location, type, status, search)
3. Test grouped display by location
4. Test toggle active/inactive
5. Test RoomFormModal integration
6. Delete `RoomManagement.css`
7. Verify no broken styles
8. Check responsive behavior

---

## 4. CSS Class Reference

### 4.1 Global CSS Variables

```css
/* Colors */
--primary-blue: #3b82f6;
--primary-blue-dark: #2563eb;
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-200: #e2e8f0;
--slate-400: #94a3b8;
--slate-500: #64748b;
--slate-600: #475569;
--slate-700: #334155;
--slate-900: #0f172a;
--emerald-100: #d1fae5;
--emerald-800: #065f46;
--red-100: #fee2e2;
--red-800: #991b1b;

/* Spacing */
--spacing-md: 1rem;
--spacing-lg: 1.5rem;
--spacing-xl: 2rem;
--spacing-2xl: 3rem;

/* Border Radius */
--radius-md: 0.75rem;
--radius-lg: 1rem;
--radius-xl: 1.25rem;

/* Shadows */
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
```

### 4.2 Complete Class List

**Layout:**
- `.page-wrapper` - Full page container with gradient background
- `.app-header` - Blue gradient header
- `.app-header-content` - Flex container for header content
- `.container` - Max-width centered container
- `.page-content` - Main content area with padding
- `.page-header` - Page title section
- `.page-title` - Large page title
- `.page-description` - Subtitle text

**Components:**
- `.card` - White card with shadow
- `.card-header` - Card header with border bottom
- `.card-title` - Card title text
- `.card-subtitle` - Card subtitle text

**Buttons:**
- `.btn` - Base button class
- `.btn-primary` - Blue primary button
- `.btn-secondary` - White secondary button
- `.btn-ghost` - Transparent button
- `.btn-sm` - Small button
- `.btn-lg` - Large button

**Forms:**
- `.form-input` - Text input field
- `.form-select` - Select dropdown
- `.form-label` - Input label (uppercase, small)

**Table:**
- `.table` - Standard table
- Includes automatic styling for `thead`, `th`, `td`, `tbody tr:hover`

**Badges:**
- `.badge` - Base badge class
- `.badge-success` - Green success badge 
- `.badge-error` - Red error badge

**Grid:**
- `.grid` - Grid container
- `.grid-cols-1` through `.grid-cols-4` - Column counts

**Utilities:**
- `.flex` - Display flex
- `.flex-col` - Flex direction column
- `.items-center` - Align items center
- `.justify-between` - Justify content space-between
- `.text-center` - Text align center
- `.mt-4`, `.mt-6`, `.mt-8` - Margin top
- `.mb-4`, `.mb-6`, `.mb-8` - Margin bottom
- `.gap-4`, `.gap-6`, `.gap-8` - Gap

---

## 5. Functionality Preservation Checklist

### 5.1 InventoryManagement.tsx

**Data Management:**
- [ ] Fetch inventory with pagination
- [ ] Fetch statistics
- [ ] Filter by search term
- [ ] Filter by status
- [ ] Filter by disposed status
- [ ] Clear filters
- [ ] Refresh data

**CRUD Operations:**
- [ ] Create new inventory item (opens dialog)
- [ ] Edit existing item (opens dialog with data)
- [ ] Delete/dispose item (with confirmation)
- [ ] View history (opens history dialog)

**Import/Export:**
- [ ] Import dialog functionality
- [ ] Export to Excel functionality

**UI Features:**
- [ ] Stats cards display (total, active, disposed, value)
- [ ] Error message display
- [ ] Loading state
- [ ] Pagination controls (prev/next)
- [ ] Rows per page selector
- [ ] Status badges with color coding
- [ ] Action buttons per row

**Dialogs (Keep Existing Components):**
- [ ] InventoryFormDialog opens/closes correctly
- [ ] InventoryHistoryDialog opens/closes correctly
- [ ] ImportInventoryDialog opens/closes correctly
- [ ] Dialog success callbacks trigger refresh

### 5.2 RoomManagement.tsx

**Data Management:**
- [ ] Fetch rooms and locations
- [ ] Group rooms by location
- [ ] Filter by location ID
- [ ] Filter by room type
- [ ] Filter by active status
- [ ] Search by room name

**CRUD Operations:**
- [ ] Create new room (opens modal)
- [ ] Edit existing room (opens modal with data)
- [ ] Delete/deactivate room (with confirmation)
- [ ] Toggle room active/inactive

**UI Features:**
- [ ] Stats display (total, locations, active, inactive)
- [ ] Loading state
- [ ] Error state
- [ ] Empty state
- [ ] Grouped display by location
- [ ] Location headers with room counts
- [ ] Room type badges with colors
- [ ] Status badges (active/inactive)
- [ ] Action buttons per row

**Modal (Keep Existing Component):**
- [ ] RoomFormModal opens/closes correctly
- [ ] Modal receives correct props (room, locations)
- [ ] Modal success callback triggers refresh

---

## 6. Implementation Guidelines

### 6.1 Code Quality Standards

1. **Consistency:** All pages must use identical header structure and classes
2. **No Inline Styles:** Prefer CSS classes over inline styles when possible (exceptions: dynamic values, unique positioning)
3. **Semantic HTML:** Use appropriate HTML elements (`<header>`, `<main>`, `<table>`, etc.)
4. **Accessibility:** Include `title` attributes on icon buttons, proper `<label>` for inputs
5. **Type Safety:** Maintain all TypeScript types, no `any` types
6. **Comments:** Add brief comments for complex sections

### 6.2 Testing Checklist

**Visual Testing:**
- [ ] Header displays correctly with user info
- [ ] Cards have consistent spacing and shadows
- [ ] Buttons have hover effects
- [ ] Tables have proper spacing and hover states
- [ ] Badges display with correct colors
- [ ] Loading states are visible
- [ ] Error messages are visible

**Functional Testing:**
- [ ] All buttons trigger correct actions
- [ ] Forms submit correctly
- [ ] Filters update data correctly
- [ ] Pagination works correctly
- [ ] Modals open and close correctly
- [ ] All CRUD operations work

**Responsive Testing:**
- [ ] Test at 1920px (desktop)
- [ ] Test at 1366px (laptop)
- [ ] Test at 768px (tablet)
- [ ] Test at 375px (mobile)
- [ ] Grid columns adjust correctly
- [ ] Tables scroll horizontally on small screens
- [ ] Header stacks correctly on mobile

### 6.3 Validation Steps

1. **Before Refactoring:**
   - Document all current functionality
   - Take screenshots of current UI
   - Test all features and record results

2. **During Refactoring:**
   - Make incremental changes
   - Test after each major section
   - Commit working changes frequently

3. **After Refactoring:**
   - Compare functionality with "before" documentation
   - Compare UI with "before" screenshots
   - Test all features again
   - Check browser console for errors
   - Verify no TypeScript errors
   - Run build to ensure no build errors

---

## 7. Expected Outcomes

### 7.1 Benefits

1. **Consistency:** All pages follow identical design patterns
2. **Maintainability:** Single source of truth for styles (global.css)
3. **Performance:** Remove unused Material-UI bundle (~500KB)
4. **Simplicity:** Easier to understand and modify HTML structure
5. **Responsiveness:** Consistent responsive behavior across all pages
6. **Developer Experience:** No context switching between styling approaches

### 7.2 Before vs After Comparison

| Aspect | Before (Inconsistent) | After (Consistent) |
|--------|----------------------|-------------------|
| **Styling Source** | Material-UI + custom CSS | global.css only |
| **Bundle Size** | ~1.5 MB (with MUI) | ~900 KB (without MUI) |
| **Component Count** | 15+ MUI components | Standard HTML elements |
| **Custom CSS Files** | 2 files (377 lines total) | 0 files |
| **Learning Curve** | High (MUI + custom) | Low (standard HTML/CSS) |
| **Header Consistency** | Missing/different | Identical across all pages |
| **Table Implementation** | DataGrid (complex) | Standard table (simple) |
| **Badge System** | 10+ custom classes | 2 standard classes |

### 7.3 Metrics

**Code Reduction:**
- InventoryManagement.tsx: ~100 lines reduction
- RoomManagement.tsx: ~50 lines reduction
- Total CSS deleted: 377 lines
- Material-UI imports: 20+ lines removed

**File Changes:**
- Modified: 2 files (InventoryManagement.tsx, RoomManagement.tsx)
- Deleted: 2 files (InventoryManagement.css, RoomManagement.css)

---

## 8. Risk Assessment & Mitigation

### 8.1 Risks

1. **Risk:** Breaking existing functionality
   - **Mitigation:** Comprehensive testing checklist, backup original files

2. **Risk:** Dialog components may not work with new structure
   - **Mitigation:** Keep dialog components unchanged, only update parent page

3. **Risk:** Pagination may not work as well as DataGrid
   - **Mitigation:** Implement full-featured pagination controls

4. **Risk:** Loss of Material-UI features (sorting, filtering in DataGrid)
   - **Mitigation:** Current code doesn't use client-side DataGrid features, all is server-side

5. **Risk:** Badge colors may not match exactly
   - **Mitigation:** Only using 2 standard colors (success/error), sufficient for status

### 8.2 Rollback Plan

If critical issues are discovered:
1. Restore original files from backup
2. Restore deleted CSS files
3. Re-run npm install if Material-UI was uninstalled
4. Document issues for future refactoring attempt

---

## 9. Appendices

### 9.1 Reference Files

**Source Files to Analyze:**
- `frontend/src/styles/global.css` - Complete design system
- `frontend/src/pages/Dashboard.tsx` - Reference implementation
- `frontend/src/pages/Users.tsx` - Reference with modals
- `frontend/src/pages/SupervisorManagement.tsx` - Reference with complex forms

**Files to Refactor:**
- `frontend/src/pages/InventoryManagement.tsx` - Material-UI removal
- `frontend/src/pages/RoomManagement.tsx` - Custom CSS removal

**Files to Delete:**
- `frontend/src/pages/InventoryManagement.css`
- `frontend/src/pages/RoomManagement.css`

### 9.2 Design System Components

**Available in global.css:**
- Page layout components
- Header system with gradient
- Card system with shadows
- Button system with variants and sizes
- Form input styling
- Table styling with hover effects
- Badge system with colors
- Grid system (1-4 columns)
- Utility classes for spacing, flex, text alignment

**NOT Available (requires inline styles):**
- Modals/overlays (use inline styles with fixed positioning)
- Complex animations
- Custom SVG icons
- Dynamic color variations

### 9.3 Common Patterns

**Standard Modal:**
```tsx
{showModal && (
  <div style={{ 
    position: 'fixed', 
    inset: 0, 
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    zIndex: 50 
  }}>
    <div className="card" style={{ maxWidth: '56rem', width: '100%' }}>
      {/* Modal content */}
    </div>
  </div>
)}
```

**Standard Filter Section:**
```tsx
<div className="card mb-6">
  <div className="grid grid-cols-4 gap-4">
    <div>
      <label className="form-label">Label</label>
      <select className="form-select">
        <option>Option</option>
      </select>
    </div>
  </div>
</div>
```

**Standard Stats Section:**
```tsx
<div className="grid grid-cols-4 gap-6 mb-6">
  <div className="card">
    <p className="form-label">Metric Name</p>
    <p style={{ fontSize: '2rem', fontWeight: 700 }}>
      {value}
    </p>
  </div>
</div>
```

**Standard Table:**
```tsx
<div className="card" style={{ padding: 0, overflowX: 'auto' }}>
  <table className="table">
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
      </tr>
    </thead>
    <tbody>
      {items.map(item => (
        <tr key={item.id}>
          <td>{item.value}</td>
          <td>
            <button className="btn btn-sm btn-ghost">Action</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## 10. Next Steps

**Immediate Actions:**
1. Review and approve this specification
2. Create feature branch for refactoring work
3. Backup original files
4. Begin with InventoryManagement.tsx refactoring
5. Complete testing and validation
6. Move to RoomManagement.tsx refactoring
7. Delete obsolete CSS files
8. Update documentation
9. Create pull request for review

**Future Considerations:**
- Consider creating reusable components for common patterns (stats cards, filter sections, pagination)
- Document the design system in a separate guide
- Create UI component library documentation
- Add Storybook for component showcase

---

## Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-20 | 1.0 | GitHub Copilot | Initial specification created |

---

**End of Specification**

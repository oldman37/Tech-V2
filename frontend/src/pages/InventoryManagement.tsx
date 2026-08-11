/**
 * Inventory Management Page
 * Main page for viewing and managing inventory items
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';
import { useInventoryList, useInventoryStats } from '../hooks/queries/useInventory';
import { useDeleteInventoryItem, usePermanentlyDeleteInventoryItem, useUpdateInventoryItem, useExportInventory } from '../hooks/mutations/useInventoryMutations';
import { queryKeys } from '../lib/queryKeys';
import InventoryFormDialog from '../components/inventory/InventoryFormDialog';
import InventoryHistoryDialog from '../components/inventory/InventoryHistoryDialog';
import ImportInventoryDialog from '../components/inventory/ImportInventoryDialog';
import { AssignmentDialog } from '../components/inventory/AssignmentDialog';
import { Box, Paper } from '@mui/material';
import { ResponsiveTable, MobileFilterBar, Column } from '../components/responsive';
import { useIsMobile } from '../hooks/useResponsive';
import { useAutoFocusSearch } from '../hooks/useAutoFocusSearch';
import { PageBackButton } from '../components/layout/PageBackButton';
import fundingSourceService from '../services/fundingSourceService';
import { useAuthStore, selectIsAdmin, selectIsTechAssistant } from '../store/authStore';

interface PaginationModel {
  page: number;
  pageSize: number;
}

export const InventoryManagement = () => {
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Always reset to page 0 when any filter changes
  const updateFilters = (newFilters: InventoryFilters) => {
    setFilters(newFilters);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  const isMobile = useIsMobile();
  const searchRef = useAutoFocusSearch();
  const queryClient = useQueryClient();

  const { data: fundingSourcesData } = useQuery({
    queryKey: queryKeys.fundingSources.list({ isActive: true, limit: 200 }),
    queryFn: () => fundingSourceService.getAll({ isActive: true, limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });
  const fundingSources = fundingSourcesData?.items ?? [];

  const {
    data: listData,
    isLoading: loading,
    error: listError,
    refetch,
  } = useInventoryList(paginationModel.page + 1, paginationModel.pageSize, filters);

  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const { data: stats } = useInventoryStats();

  const deleteMutation = useDeleteInventoryItem();
  const permanentDeleteMutation = usePermanentlyDeleteInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const exportMutation = useExportInventory();
  const isAdmin = useAuthStore(selectIsAdmin);
  const isTechAssistant = useAuthStore(selectIsTechAssistant);
  const canPermanentlyDelete = isAdmin || isTechAssistant;

  const error = listError
    ? (listError as any)?.response?.data?.message ?? 'Failed to fetch inventory'
    : null;

  const handleCreate = () => {
    setSelectedItem(null);
    setFormDialogOpen(true);
  };

  const handleEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormDialogOpen(true);
  };

  const handleDelete = (item: InventoryItem) => {
    if (!window.confirm(`Mark "${item.name}" (${item.assetTag}) as disposed?`)) {
      return;
    }
    deleteMutation.mutate(item.id, {
      onError: (err: any) => alert(err.response?.data?.message || 'Failed to delete item'),
    });
  };

  const handlePermanentDelete = (item: InventoryItem) => {
    if (
      !window.confirm(
        `Permanently delete "${item.name}" (${item.assetTag})? This cannot be undone and is different from disposing it as e-waste.`
      )
    ) {
      return;
    }
    permanentDeleteMutation.mutate(item.id, {
      onError: (err: any) => alert(err.response?.data?.message || 'Failed to permanently delete item'),
    });
  };

  const handleReactivate = (item: InventoryItem) => {
    if (!window.confirm(`Reactivate "${item.name}" (${item.assetTag}) and mark it as active?`)) {
      return;
    }
    updateMutation.mutate(
      {
        id: item.id,
        data: {
          isDisposed: false,
          status: 'active',
          disposedDate: null,
          disposedReason: null,
          disposalDate: null,
        },
      },
      {
        onError: (err: any) =>
          alert(err.response?.data?.message || 'Failed to reactivate item'),
      }
    );
  };

  const handleViewHistory = (item: InventoryItem) => {
    setSelectedItem(item);
    setHistoryDialogOpen(true);
  };

  const handleExport = () => {
    exportMutation.mutate({ format: 'xlsx', filters });
  };

  const handleFormSuccess = () => {
    setFormDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  };

  const handleImportSuccess = () => {
    setImportDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  };

  const handleAssign = (item: InventoryItem) => {
    setSelectedItem(item);
    setAssignmentDialogOpen(true);
  };

  const handleAssignmentSuccess = () => {
    setAssignmentDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
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

  const activeFilterCount =
    (filters.status ? 1 : 0) + (filters.isDisposed ? 1 : 0) + (filters.fundingSourceId ? 1 : 0);

  const columns: Column<InventoryItem>[] = [
    {
      key: 'assetTag',
      label: 'Asset Tag',
      isPrimary: true,
      sortable: true,
      minWidth: 150,
      // Opaque token: let it wrap so the column can shrink instead of forcing
      // the table wider than its container.
      render: (item) => (
        <strong style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.assetTag}</strong>
      ),
    },
    {
      key: 'name',
      label: 'Item Name',
      isSecondary: true,
      sortable: true,
      minWidth: 150,
    },
    {
      key: 'category',
      label: 'Category',
      minWidth: 120,
      render: (item) => item.category?.name || 'N/A',
    },
    {
      key: 'brand',
      label: 'Brand',
      hideOnMobile: true,
      minWidth: 120,
      render: (item) => item.brand?.name || 'N/A',
    },
    {
      key: 'model',
      label: 'Model',
      hideOnMobile: true,
      minWidth: 120,
      render: (item) =>
        item.model?.modelNumber || item.model?.name || <span style={{ color: 'var(--slate-400)' }}>—</span>,
    },
    {
      key: 'serialNumber',
      label: 'Serial #',
      hideOnMobile: true,
      minWidth: 140,
      render: (item) =>
        item.serialNumber ? (
          // Opaque token, and the ellipsis it used to attempt never worked in an
          // auto-layout table — the percentage max-width resolves to none during
          // intrinsic sizing, so the cell just grew. Wrapping is what shrinks it.
          <span
            title={item.serialNumber}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              overflowWrap: 'anywhere',
            }}
          >
            {item.serialNumber}
          </span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>—</span>
        ),
    },
    {
      key: 'officeLocation',
      label: 'Location',
      minWidth: 150,
      render: (item) => item.officeLocation?.name || 'Unassigned',
    },
    {
      key: 'assignedToUser',
      label: 'Assigned To',
      minWidth: 140,
      render: (item) =>
        item.assignedToUser ? (
          <span title={item.assignedToUser.email}>
            {item.assignedToUser.displayName ||
              `${item.assignedToUser.firstName} ${item.assignedToUser.lastName}`}
          </span>
        ) : item.room ? (
          <span>{item.room.name}</span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>Unassigned</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      minWidth: 120,
      // Kept longer than Category / Location / Assigned To — status is the most
      // scanned field on an inventory list, but its array index would drop it first.
      priority: 0,
      render: (item) => (
        <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span>
      ),
    },
    {
      key: 'purchasePrice',
      label: 'Value',
      hideOnMobile: true,
      align: 'right',
      minWidth: 90,
      render: (item) =>
        item.purchasePrice ? `$${parseFloat(item.purchasePrice as any).toFixed(2)}` : 'N/A',
    },
    {
      key: 'vendor',
      label: 'Vendor',
      hideOnMobile: true,
      minWidth: 120,
      render: (item) => item.vendor?.name || <span style={{ color: 'var(--slate-400)' }}>—</span>,
    },
    {
      key: 'poNumber',
      label: 'PO#',
      hideOnMobile: true,
      minWidth: 90,
      render: (item) =>
        item.poNumber ? (
          <span
            title={item.poNumber}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              overflowWrap: 'anywhere',
            }}
          >
            {item.poNumber}
          </span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>—</span>
        ),
    },
    {
      key: 'fundingSource',
      label: 'Funding',
      hideOnMobile: true,
      minWidth: 130,
      render: (item) =>
        item.fundingSourceRef?.name ?? item.fundingSource ?? <span style={{ color: 'var(--slate-400)' }}>—</span>,
    },
    {
      key: 'purchaseDate',
      label: 'Purchase Date',
      hideOnMobile: true,
      minWidth: 140,
      render: (item) =>
        item.purchaseDate ? (
          <span
            style={{
              whiteSpace: 'nowrap',
              display: 'inline-block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              verticalAlign: 'bottom',
            }}
          >
            {new Date(item.purchaseDate).toLocaleDateString()}
          </span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>—</span>
        ),
    },
  ];

  const rowActions = (item: InventoryItem) => (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {item.isDisposed ? (
        <button
          onClick={() => handleReactivate(item)}
          className="btn btn-sm btn-ghost"
          title="Reactivate"
          style={{ color: 'var(--emerald-800)' }}
          disabled={updateMutation.isPending}
        >
          ♻️
        </button>
      ) : (
        <button
          onClick={() => handleAssign(item)}
          className="btn btn-sm btn-ghost"
          title="Assign"
        >
          🔗
        </button>
      )}
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
      {!item.isDisposed && (
        <button
          onClick={() => handleDelete(item)}
          className="btn btn-sm btn-ghost"
          title="Dispose"
          style={{ color: 'var(--red-800)' }}
          disabled={deleteMutation.isPending}
        >
          🗑️
        </button>
      )}
      {canPermanentlyDelete && (
        <button
          onClick={() => handlePermanentDelete(item)}
          className="btn btn-sm btn-ghost"
          title="Permanently Delete"
          style={{ color: 'var(--red-800)' }}
          disabled={permanentDeleteMutation.isPending}
        >
          ⛔
        </button>
      )}
    </div>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageBackButton />
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">Inventory Management</h2>
        <p className="page-description">Manage all equipment and assets</p>
      </div>

          {/* Action Buttons */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button onClick={handleCreate} className="btn btn-primary" style={{ width: '100%' }}>
                + Add Item
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setImportDialogOpen(true)} className="btn btn-secondary" style={{ flex: 1 }}>
                  ⬆️ Import
                </button>
                <button
                  onClick={handleExport}
                  className="btn btn-secondary"
                  disabled={exportMutation.isPending}
                  style={{ flex: 1 }}
                >
                  {exportMutation.isPending ? '⏳...' : '⬇️ Export'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card mb-6">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={() => refetch()} className="btn btn-secondary" title="Refresh">
                  🔄 Refresh
                </button>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setImportDialogOpen(true)} className="btn btn-secondary">
                    ⬆️ Import
                  </button>
                  <button
                    onClick={handleExport}
                    className="btn btn-secondary"
                    disabled={exportMutation.isPending}
                  >
                    {exportMutation.isPending ? '⏳ Exporting...' : '⬇️ Export Excel'}
                  </button>
                  <button onClick={handleCreate} className="btn btn-primary">
                    + Add Item
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          {stats && !isMobile && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
              <div className="card">
                <p className="form-label">Total Items</p>
                <p style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats.totalItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Active</p>
                <p style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--emerald-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats.activeItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Disposed</p>
                <p style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--red-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats.disposedItems.toLocaleString()}
                </p>
              </div>
              <div className="card">
                <p className="form-label">Total Value</p>
                <p style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ${stats.totalValue.toLocaleString()}
                </p>
              </div>
            </Box>
          )}

          {/* Error Message */}
          {error && (
            <div className="badge badge-error" style={{ padding: '1rem', display: 'block', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          {/* Filters */}
          {isMobile ? (
            <div className="mb-6">
              <MobileFilterBar
                searchValue={filters.search || ''}
                onSearchChange={(value) => updateFilters({ ...filters, search: value })}
                filterCount={activeFilterCount}
                onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
                searchPlaceholder="Asset tag, serial #, model, brand, PO#..."
                beforeFilterButton={
                  <button
                    onClick={() => refetch()}
                    className="btn btn-secondary"
                    title="Refresh"
                    style={{ minWidth: 44, minHeight: 44, padding: 0, flexShrink: 0 }}
                  >
                    🔄
                  </button>
                }
              />
              {filterDrawerOpen && (
                <div className="card" style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label">Status</label>
                      <select
                        value={filters.status || ''}
                        onChange={(e) => updateFilters({ ...filters, status: e.target.value as any })}
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
                        onChange={(e) => updateFilters({ ...filters, isDisposed: e.target.value === 'true' })}
                        className="form-select"
                      >
                        <option value="false">Active Only</option>
                        <option value="true">Disposed Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Funding Source</label>
                      <select
                        value={filters.fundingSourceId || ''}
                        onChange={(e) => updateFilters({ ...filters, fundingSourceId: e.target.value || undefined })}
                        className="form-select"
                      >
                        <option value="">All</option>
                        {fundingSources.map((fs) => (
                          <option key={fs.id} value={fs.id}>{fs.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { updateFilters({ search: '', status: undefined, isDisposed: false, fundingSourceId: undefined }); setFilterDrawerOpen(false); }}
                        className="btn btn-secondary btn-sm"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <Box sx={{ gridColumn: { md: '1 / 3' } }}>
                  <label className="form-label">Search</label>
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Asset tag, name, serial #, model, brand, vendor, PO#, barcode..."
                    value={filters.search}
                    onChange={(e) => updateFilters({ ...filters, search: e.target.value })}
                    className="form-input"
                  />
                </Box>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    value={filters.status || ''}
                    onChange={(e) => updateFilters({ ...filters, status: e.target.value as any })}
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
                    onChange={(e) => updateFilters({ ...filters, isDisposed: e.target.value === 'true' })}
                    className="form-select"
                  >
                    <option value="false">Active Only</option>
                    <option value="true">Disposed Only</option>
                  </select>
                </div>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2 }}>
                <div>
                  <label className="form-label">Funding Source</label>
                  <select
                    value={filters.fundingSourceId || ''}
                    onChange={(e) => updateFilters({ ...filters, fundingSourceId: e.target.value || undefined })}
                    className="form-select"
                  >
                    <option value="">All</option>
                    {fundingSources.map((fs) => (
                      <option key={fs.id} value={fs.id}>{fs.name}</option>
                    ))}
                  </select>
                </div>
              </Box>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => updateFilters({ search: '', status: undefined, isDisposed: false, fundingSourceId: undefined })}
                  className="btn btn-secondary btn-sm"
                >
                  Clear Filters
                </button>
              </div>
            </Paper>
          )}

          {/* Data Table / Mobile Cards */}
          <div className="card" style={{ padding: 0 }}>
            <ResponsiveTable<InventoryItem>
              columns={columns}
              rows={items}
              getRowKey={(item) => item.id}
              loading={loading}
              emptyMessage="No equipment found. Adjust your filters and try again."
              rowActions={rowActions}
              // Up to 5 .btn-sm ghost buttons for an admin viewing an active item
              // (Assign, Edit, History, Dispose, Permanently Delete) in a
              // non-wrapping flex row + cell padding
              actionsMinWidth={296}
            />

            {/* Pagination Controls */}
            {!loading && items.length > 0 && (
              <div style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--slate-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                  Showing {((paginationModel.page) * paginationModel.pageSize) + 1} to{' '}
                  {Math.min((paginationModel.page + 1) * paginationModel.pageSize, total)} of {total} items
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!isMobile && (
                    <>
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
                    </>
                  )}
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
            )}
          </div>
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

      <AssignmentDialog
        open={assignmentDialogOpen}
        equipment={selectedItem}
        onClose={() => setAssignmentDialogOpen(false)}
        onSuccess={handleAssignmentSuccess}
      />
    </Box>
  );
};

export default InventoryManagement;

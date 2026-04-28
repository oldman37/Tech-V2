/**
 * Inventory Management Page
 * Main page for viewing and managing inventory items
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';
import { useInventoryList, useInventoryStats } from '../hooks/queries/useInventory';
import { useDeleteInventoryItem, useUpdateInventoryItem, useExportInventory } from '../hooks/mutations/useInventoryMutations';
import { queryKeys } from '../lib/queryKeys';
import InventoryFormDialog from '../components/inventory/InventoryFormDialog';
import InventoryHistoryDialog from '../components/inventory/InventoryHistoryDialog';
import ImportInventoryDialog from '../components/inventory/ImportInventoryDialog';
import { AssignmentDialog } from '../components/inventory/AssignmentDialog';

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

  const queryClient = useQueryClient();

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
  const updateMutation = useUpdateInventoryItem();
  const exportMutation = useExportInventory();

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

  return (
    <div>
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
                onClick={() => refetch()}
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
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? '⏳ Exporting...' : '⬇️ Export Excel'}
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
                      <th>Model</th>
                      <th>Serial #</th>
                      <th>Location</th>
                      <th>Assigned To</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Vendor</th>
                      <th>PO#</th>
                      <th>Funding</th>
                      <th>Purchase Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && items.length === 0 && (
                      <tr>
                        <td colSpan={15} style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                          No equipment found. Adjust your filters and try again.
                        </td>
                      </tr>
                    )}
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ fontWeight: 600 }}>{item.assetTag}</strong>
                        </td>
                        <td>{item.name}</td>
                        <td>{item.category?.name || 'N/A'}</td>
                        <td>{item.brand?.name || 'N/A'}</td>
                        <td>{item.model?.modelNumber || item.model?.name || <span style={{ color: 'var(--slate-400)' }}>—</span>}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{item.serialNumber || <span style={{ color: 'var(--slate-400)' }}>—</span>}</td>
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
                        <td>{item.vendor?.name || <span style={{ color: 'var(--slate-400)' }}>—</span>}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{item.poNumber || <span style={{ color: 'var(--slate-400)' }}>—</span>}</td>
                        <td>{item.fundingSource || <span style={{ color: 'var(--slate-400)' }}>—</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : <span style={{ color: 'var(--slate-400)' }}>—</span>}
                        </td>
                        <td>
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

      <AssignmentDialog
        open={assignmentDialogOpen}
        equipment={selectedItem}
        onClose={() => setAssignmentDialogOpen(false)}
        onSuccess={handleAssignmentSuccess}
      />

      {/* CSS for spinner animation */}
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

/**
 * Disposed Equipment Page
 * View and manage all equipment that has been disposed or decommissioned
 */

import { useState, useEffect } from 'react';
import inventoryService from '../services/inventory.service';
import { locationService } from '../services/location.service';
import { categoriesService, Category } from '../services/referenceDataService';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';

interface PaginationModel {
  page: number;
  pageSize: number;
}

interface DisposedFilters {
  search: string;
  officeLocationId: string;
  categoryId: string;
  disposedDateFrom: string;
  disposedDateTo: string;
}

interface OfficeLocationOption {
  id: string;
  name: string;
}

const DisposedEquipment = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [paginationModel, setPaginationModel] = useState<PaginationModel>({
    page: 0,
    pageSize: 50,
  });

  // Reference data for dropdowns
  const [locations, setLocations] = useState<OfficeLocationOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter state
  const [filters, setFilters] = useState<DisposedFilters>({
    search: '',
    officeLocationId: '',
    categoryId: '',
    disposedDateFrom: '',
    disposedDateTo: '',
  });

  // Export state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchDisposedItems();
  }, [paginationModel, filters]);

  useEffect(() => {
    fetchReferenceData();
  }, []);

  const fetchDisposedItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: InventoryFilters = {
        page: paginationModel.page + 1,
        limit: paginationModel.pageSize,
        isDisposed: true,
        search: filters.search || undefined,
        officeLocationId: filters.officeLocationId || undefined,
        categoryId: filters.categoryId || undefined,
        disposedDateFrom: filters.disposedDateFrom || undefined,
        disposedDateTo: filters.disposedDateTo || undefined,
      };
      const response = await inventoryService.getInventory(query);
      setItems(response.items);
      setTotal(response.total);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Failed to fetch disposed equipment');
    } finally {
      setLoading(false);
    }
  };

  const fetchReferenceData = async () => {
    try {
      const [locData, catData] = await Promise.all([
        locationService.getAllLocations(),
        categoriesService.getAll({ limit: 500 }),
      ]);
      setLocations(locData.map((l) => ({ id: l.id, name: l.name })));
      setCategories(catData.items);
    } catch {
      // Silent fail — dropdowns will just be empty
    }
  };

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
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert(e.response?.data?.message || e.message || 'Failed to reactivate item');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportFilters: InventoryFilters = {
        isDisposed: true,
        search: filters.search || undefined,
        officeLocationId: filters.officeLocationId || undefined,
        categoryId: filters.categoryId || undefined,
        disposedDateFrom: filters.disposedDateFrom || undefined,
        disposedDateTo: filters.disposedDateTo || undefined,
      };
      await inventoryService.exportInventory({ format: 'xlsx', filters: exportFilters });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      officeLocationId: '',
      categoryId: '',
      disposedDateFrom: '',
      disposedDateTo: '',
    });
    setPaginationModel({ ...paginationModel, page: 0 });
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (value: number | null | undefined): string => {
    if (value == null) return '—';
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div>
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header">
            <h2 className="page-title">Disposed Equipment</h2>
            <p className="page-description">View all equipment that has been disposed or decommissioned</p>
          </div>

          {/* Action Bar */}
          <div className="card mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={fetchDisposedItems}
                className="btn btn-ghost btn-sm"
                title="Refresh"
              >
                🔄 Refresh
              </button>
              <button
                onClick={handleExport}
                className="btn btn-secondary"
                disabled={exporting}
              >
                {exporting ? '⏳ Exporting...' : '⬇️ Export Excel'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="badge badge-error"
              style={{ padding: '1rem', display: 'block', marginBottom: '1.5rem' }}
            >
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
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Office Location</label>
                <select
                  value={filters.officeLocationId}
                  onChange={(e) =>
                    setFilters({ ...filters, officeLocationId: e.target.value })
                  }
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
                <label className="form-label">Category</label>
                <select
                  value={filters.categoryId}
                  onChange={(e) =>
                    setFilters({ ...filters, categoryId: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Disposed Date From</label>
                <input
                  type="date"
                  value={filters.disposedDateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, disposedDateFrom: e.target.value })
                  }
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Disposed Date To</label>
                <input
                  type="date"
                  value={filters.disposedDateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, disposedDateTo: e.target.value })
                  }
                  className="form-input"
                />
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleClearFilters}
                className="btn btn-secondary btn-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div
                  style={{
                    width: '3rem',
                    height: '3rem',
                    border: '4px solid var(--slate-200)',
                    borderTop: '4px solid var(--primary-blue)',
                    borderRadius: '50%',
                    margin: '0 auto 1rem',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <p style={{ color: 'var(--slate-600)' }}>Loading disposed equipment...</p>
              </div>
            )}

            {!loading && (
              <>
                {items.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                    No disposed equipment found matching current filters.
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset Tag</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Brand</th>
                        <th>Model</th>
                        <th>Serial #</th>
                        <th>Location</th>
                        <th>Disposal Date</th>
                        <th>Disposal Reason</th>
                        <th>PO #</th>
                        <th>Purchase Price</th>
                        <th>Funding Source</th>
                        <th>Purchase Date</th>
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
                          <td>{item.category?.name || '—'}</td>
                          <td>{item.brand?.name || '—'}</td>
                          <td>{item.model?.name || '—'}</td>
                          <td>{item.serialNumber || '—'}</td>
                          <td>{item.officeLocation?.name || '—'}</td>
                          <td>{formatDate(item.disposedDate || item.disposalDate)}</td>
                          <td>
                            {item.disposedReason ? (
                              <span title={item.disposedReason}>
                                {item.disposedReason.length > 40
                                  ? `${item.disposedReason.slice(0, 40)}…`
                                  : item.disposedReason}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{item.poNumber || '—'}</td>
                          <td>{formatCurrency(item.purchasePrice)}</td>
                          <td>
                            {item.fundingSource || '—'}
                          </td>
                          <td>{formatDate(item.purchaseDate)}</td>
                          <td>
                            <button
                              onClick={() => handleReactivate(item)}
                              className="btn btn-sm btn-ghost"
                              title="Reactivate equipment"
                              style={{ color: 'var(--emerald-800)' }}
                            >
                              ♻️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Pagination Controls */}
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid var(--slate-200)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                    Showing {paginationModel.page * paginationModel.pageSize + 1} to{' '}
                    {Math.min((paginationModel.page + 1) * paginationModel.pageSize, total)} of{' '}
                    {total} items
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Rows per page:
                    </label>
                    <select
                      value={paginationModel.pageSize}
                      onChange={(e) =>
                        setPaginationModel({
                          page: 0,
                          pageSize: parseInt(e.target.value),
                        })
                      }
                      className="form-select"
                      style={{ width: 'auto' }}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <button
                      onClick={() =>
                        setPaginationModel({
                          ...paginationModel,
                          page: paginationModel.page - 1,
                        })
                      }
                      disabled={paginationModel.page === 0}
                      className="btn btn-secondary btn-sm"
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                      Page {paginationModel.page + 1} of{' '}
                      {Math.max(1, Math.ceil(total / paginationModel.pageSize))}
                    </span>
                    <button
                      onClick={() =>
                        setPaginationModel({
                          ...paginationModel,
                          page: paginationModel.page + 1,
                        })
                      }
                      disabled={
                        (paginationModel.page + 1) * paginationModel.pageSize >= total
                      }
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

export default DisposedEquipment;

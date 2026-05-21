/**
 * Disposed Equipment Page
 * View and manage all equipment that has been disposed or decommissioned
 */

import { useState, useEffect } from 'react';
import inventoryService from '../services/inventory.service';
import { locationService } from '../services/location.service';
import { categoriesService, modelsService, EquipmentModel, Category } from '../services/referenceDataService';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';
import { ResponsiveTable, MobileFilterBar, Column } from '../components/responsive';
import { useIsMobile } from '../hooks/useResponsive';


interface PaginationModel {
  page: number;
  pageSize: number;
}

interface DisposedFilters {
  search: string;
  officeLocationId: string;
  categoryId: string;
  modelId: string;
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
  const [models, setModels] = useState<EquipmentModel[]>([]);

  // Filter state
  const [filters, setFilters] = useState<DisposedFilters>({
    search: '',
    officeLocationId: '',
    categoryId: '',
    modelId: '',
    disposedDateFrom: '',
    disposedDateTo: '',
  });

  // Export state
  const [exporting, setExporting] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const isMobile = useIsMobile();

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
        modelId: filters.modelId || undefined,
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
      const [locData, catData, modelData] = await Promise.all([
        locationService.getAllLocations(),
        categoriesService.getAll({ limit: 500 }),
        modelsService.getAll({ limit: 500 }),
      ]);
      setLocations(locData.map((l) => ({ id: l.id, name: l.name })));
      setCategories(catData.items);
      setModels(modelData.items);
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
      modelId: '',
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

  // Count active filters for mobile badge
  const activeFilterCount = [
    filters.officeLocationId,
    filters.categoryId,
    filters.modelId,
    filters.disposedDateFrom,
    filters.disposedDateTo,
  ].filter(Boolean).length;

  // Column definitions for ResponsiveTable
  const columns: Column<InventoryItem>[] = [
    {
      key: 'assetTag',
      label: 'Asset Tag',
      isPrimary: true,
      render: (item) => <strong style={{ fontWeight: 600 }}>{item.assetTag}</strong>,
    },
    {
      key: 'name',
      label: 'Name',
      isSecondary: true,
    },
    {
      key: 'category',
      label: 'Category',
      render: (item) => item.category?.name || '—',
    },
    {
      key: 'brand',
      label: 'Brand',
      hideOnMobile: true,
      render: (item) => item.brand?.name || '—',
    },
    {
      key: 'model',
      label: 'Model',
      hideOnMobile: true,
      render: (item) => item.model?.name || '—',
    },
    {
      key: 'serialNumber',
      label: 'Serial #',
      hideOnMobile: true,
      render: (item) => item.serialNumber || '—',
    },
    {
      key: 'officeLocation',
      label: 'Location',
      render: (item) => item.officeLocation?.name || '—',
    },
    {
      key: 'disposedDate',
      label: 'Disposal Date',
      render: (item) => formatDate(item.disposedDate || item.disposalDate),
    },
    {
      key: 'disposedReason',
      label: 'Disposal Reason',
      hideOnMobile: true,
      render: (item) =>
        item.disposedReason ? (
          <span title={item.disposedReason}>
            {item.disposedReason.length > 40
              ? `${item.disposedReason.slice(0, 40)}…`
              : item.disposedReason}
          </span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>—</span>
        ),
    },
    {
      key: 'poNumber',
      label: 'PO #',
      hideOnMobile: true,
      render: (item) => item.poNumber || '—',
    },
    {
      key: 'purchasePrice',
      label: 'Purchase Price',
      hideOnMobile: true,
      align: 'right',
      render: (item) => formatCurrency(item.purchasePrice),
    },
    {
      key: 'fundingSource',
      label: 'Funding Source',
      hideOnMobile: true,
      render: (item) => item.fundingSource || '—',
    },
    {
      key: 'purchaseDate',
      label: 'Purchase Date',
      hideOnMobile: true,
      render: (item) => formatDate(item.purchaseDate),
    },
  ];

  const rowActions = (item: InventoryItem) => (
    <button
      onClick={() => handleReactivate(item)}
      className="btn btn-sm btn-ghost"
      title="Reactivate equipment"
      style={{ color: 'var(--emerald-800)', minWidth: 44, minHeight: 44 }}
    >
      ♻️
    </button>
  );

  return (
    <>
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header">
            <h2 className="page-title">Disposed Equipment</h2>
            <p className="page-description">View all equipment that has been disposed or decommissioned</p>
          </div>

          {/* Action Bar */}
          <div className="card mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={fetchDisposedItems}
                  className="btn btn-ghost btn-sm"
                  title="Refresh"
                >
                  🔄 Refresh
                </button>
              </div>
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
          {isMobile ? (
            <div className="mb-6">
              <MobileFilterBar
                searchValue={filters.search}
                onSearchChange={(value) => setFilters({ ...filters, search: value })}
                filterCount={activeFilterCount}
                onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
                searchPlaceholder="Asset tag, name, serial #..."
              />
              {filterDrawerOpen && (
                <div className="card" style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label">Office Location</label>
                      <select
                        value={filters.officeLocationId}
                        onChange={(e) => setFilters({ ...filters, officeLocationId: e.target.value })}
                        className="form-select"
                      >
                        <option value="">All Locations</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Category</label>
                      <select
                        value={filters.categoryId}
                        onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                        className="form-select"
                      >
                        <option value="">All Categories</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Model</label>
                      <select
                        value={filters.modelId}
                        onChange={(e) => setFilters({ ...filters, modelId: e.target.value })}
                        className="form-select"
                      >
                        <option value="">All Models</option>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Disposed Date From</label>
                      <input
                        type="date"
                        value={filters.disposedDateFrom}
                        onChange={(e) => setFilters({ ...filters, disposedDateFrom: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">Disposed Date To</label>
                      <input
                        type="date"
                        value={filters.disposedDateTo}
                        onChange={(e) => setFilters({ ...filters, disposedDateTo: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={handleClearFilters} className="btn btn-secondary btn-sm">
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
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
                  <label className="form-label">Office Location</label>
                  <select
                    value={filters.officeLocationId}
                    onChange={(e) => setFilters({ ...filters, officeLocationId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">All Locations</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select
                    value={filters.categoryId}
                    onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Model</label>
                  <select
                    value={filters.modelId}
                    onChange={(e) => setFilters({ ...filters, modelId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">All Models</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Disposed Date From</label>
                  <input
                    type="date"
                    value={filters.disposedDateFrom}
                    onChange={(e) => setFilters({ ...filters, disposedDateFrom: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Disposed Date To</label>
                  <input
                    type="date"
                    value={filters.disposedDateTo}
                    onChange={(e) => setFilters({ ...filters, disposedDateTo: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleClearFilters} className="btn btn-secondary btn-sm">
                  Clear Filters
                </button>
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="card" style={{ padding: 0 }}>
            <ResponsiveTable<InventoryItem>
              columns={columns}
              rows={items}
              getRowKey={(item) => item.id}
              loading={loading}
              emptyMessage="No disposed equipment found matching current filters."
              rowActions={rowActions}
            />

            {/* Pagination Controls */}
            {!loading && items.length > 0 && (
              <div
                style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--slate-200)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
                  Showing {paginationModel.page * paginationModel.pageSize + 1} to{' '}
                  {Math.min((paginationModel.page + 1) * paginationModel.pageSize, total)} of{' '}
                  {total} items
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!isMobile && (
                    <>
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Rows per page:
                      </label>
                      <select
                        value={paginationModel.pageSize}
                        onChange={(e) => setPaginationModel({ page: 0, pageSize: parseInt(e.target.value) })}
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
                    Page {paginationModel.page + 1} of{' '}
                    {Math.max(1, Math.ceil(total / paginationModel.pageSize))}
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
        </div>
      </main>

    </>
  );
};

export default DisposedEquipment;

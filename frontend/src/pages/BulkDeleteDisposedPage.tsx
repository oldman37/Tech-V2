/**
 * Purge Disposed Equipment Page
 * Model-centric bulk purge of disposed/decommissioned equipment records.
 */

import { useState, useEffect } from 'react';
import inventoryService from '../services/inventory.service';
import { locationService } from '../services/location.service';
import { modelsService, EquipmentModel } from '../services/referenceDataService';
import { InventoryItem, InventoryFilters } from '../types/inventory.types';
import { ResponsiveTable, Column } from '../components/responsive';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

interface OfficeLocationOption {
  id: string;
  name: string;
}

const BulkDeleteDisposedPage = () => {
  const [models, setModels] = useState<EquipmentModel[]>([]);
  const [locations, setLocations] = useState<OfficeLocationOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedModelName, setSelectedModelName] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    officeLocationId: '',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // Fetch reference data on mount
  useEffect(() => {
    Promise.all([
      modelsService.getAll({ limit: 500 }),
      locationService.getAllLocations(),
    ])
      .then(([modelData, locData]) => {
        setModels(
          [...modelData.items].sort((a, b) => a.name.localeCompare(b.name))
        );
        setLocations(locData.map((l) => ({ id: l.id, name: l.name })));
      })
      .catch(() => {
        // Silent fail — dropdowns will be empty
      });
  }, []);

  // Fetch items when model or secondary filters change
  useEffect(() => {
    if (!selectedModelId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const query: InventoryFilters = {
          isDisposed: false,
          modelId: selectedModelId,
          limit: 500,
          page: 1,
          officeLocationId: filters.officeLocationId || undefined,
        };
        const response = await inventoryService.getInventory(query);
        if (!cancelled) {
          setItems(response.items);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const e = err as { response?: { data?: { message?: string } }; message?: string };
          setError(
            e.response?.data?.message || e.message || 'Failed to fetch disposed equipment'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [selectedModelId, filters]);

  const handleModelChange = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    setSelectedModelId(modelId);
    setSelectedModelName(model ? model.name : '');
    // Reset secondary filters when model changes
    setFilters({ officeLocationId: '' });
  };

  const handleBulkDispose = async () => {
    const allIds = items.map((i) => i.id);
    setDeleting(true);
    try {
      const result = await inventoryService.bulkUpdate(allIds, {
        isDisposed: true,
        status: 'disposed',
        disposedDate: new Date().toISOString(),
      });
      setSnackbar({
        open: true,
        message: `Successfully disposed ${result.updated} device(s).`,
        severity: 'success',
      });
      setConfirmOpen(false);
      setSelectedModelId('');
      setSelectedModelName('');
      setItems([]);
      setFilters({ officeLocationId: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setSnackbar({
        open: true,
        message: e.response?.data?.message || e.message || 'Failed to dispose items',
        severity: 'error',
      });
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleClearFilters = () => {
    setFilters({ officeLocationId: '' });
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString();
  };

  const allIds = items.map((i) => i.id);
  const canDispose = Boolean(selectedModelId) && allIds.length > 0 && !deleting;

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
      key: 'serialNumber',
      label: 'Serial #',
      hideOnMobile: true,
      render: (item) => item.serialNumber || '\u2014',
    },
    {
      key: 'officeLocation',
      label: 'Location',
      render: (item) => item.officeLocation?.name || '\u2014',
    },
    {
      key: 'disposedDate',
      label: 'Disposal Date',
      render: (item) => formatDate(item.disposedDate || item.disposalDate),
    },
    {
      key: 'disposedReason',
      label: 'Reason',
      hideOnMobile: true,
      render: (item) =>
        item.disposedReason ? (
          <span title={item.disposedReason}>
            {item.disposedReason.length > 40
              ? `${item.disposedReason.slice(0, 40)}\u2026`
              : item.disposedReason}
          </span>
        ) : (
          <span style={{ color: 'var(--slate-400)' }}>\u2014</span>
        ),
    },
  ];

  return (
    <>
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header">
            <h2 className="page-title">Purge Disposed Equipment</h2>
            <p className="page-description">
          Permanently delete disposed equipment records. This action cannot be undone.
            </p>
          </div>

          {/* Warning Banner */}
          <div
            style={{
              background: 'var(--amber-50, #fffbeb)',
              border: '1px solid var(--amber-200, #fde68a)',
              borderRadius: '0.5rem',
              padding: '0.875rem 1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{'⚠️'}</span>
            <div>
              <strong
                style={{
                  color: 'var(--amber-700, #b45309)',
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Disposal Warning
              </strong>
              <span style={{ fontSize: '0.875rem', color: 'var(--amber-700, #b45309)' }}>
                Devices marked as disposed will be removed from active inventory and cannot be
                checked out or assigned. Select a model to view all active devices of that type
                and dispose them in bulk.
              </span>
            </div>
          </div>

          {/* Primary Filter - Model Selection */}
          <div className="card mb-6">
            <div>
              <label
                className="form-label"
                style={{ fontWeight: 600, fontSize: '0.9375rem' }}
              >
                Select Model to Dispose{' '}
                <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="form-select"
                style={{ maxWidth: '32rem' }}
              >
                <option value="">\u2014 Select a model \u2014</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary Filters */}
          <div className="card mb-6">
            <div>
              <label className="form-label">Office Location</label>
              <select
                value={filters.officeLocationId}
                onChange={(e) => setFilters({ ...filters, officeLocationId: e.target.value })}
                className="form-select"
                style={{ maxWidth: '32rem' }}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleClearFilters} className="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            </div>
          </div>

          {/* Summary Bar */}
          <div
            className="card mb-4"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: canDispose ? 'var(--amber-50, #fffbeb)' : undefined,
              borderColor: canDispose ? 'var(--amber-200, #fde68a)' : undefined,
            }}
          >
            <div style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
              {!selectedModelId ? (
                <span style={{ color: 'var(--slate-400)' }}>
                  Select a model above to view its active devices
                </span>
              ) : loading ? (
                'Loading\u2026'
              ) : (
                <>
                  <strong>{items.length.toLocaleString()}</strong> disposed{' '}
                  <strong>{selectedModelName}</strong> device
                  {items.length !== 1 ? 's' : ''} found
                </>
              )}
            </div>
            {canDispose && (
              <Button
                variant="contained"
                color="warning"
                size="large"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
              >
                Dispose All {items.length} {selectedModelName} Device{items.length !== 1 ? 's' : ''}
              </Button>
            )}
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

          {/* Data Table or Empty State */}
          {!selectedModelId ? (
            <div
              className="card"
              style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                color: 'var(--slate-400)',
              }}
            >
              Select an equipment model above to view its active devices.
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <ResponsiveTable<InventoryItem>
                columns={columns}
                rows={items}
                getRowKey={(item) => item.id}
                loading={loading}
                emptyMessage={`No active ${selectedModelName} devices found matching the current filters.`}
              />
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {'⚠️'} Confirm Permanent Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to permanently delete{' '}
            <strong>
              {allIds.length} {selectedModelName} device(s)
            </strong>
            . This action <strong>cannot be undone</strong> and records cannot be recovered.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>Are you sure you want to proceed?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setConfirmOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkDispose}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting\u2026' : `Yes, Delete ${allIds.length} Devices`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default BulkDeleteDisposedPage;

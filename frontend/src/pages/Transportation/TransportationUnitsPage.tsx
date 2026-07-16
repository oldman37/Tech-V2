/**
 * Transportation Units Page — /transportation/units
 *
 * Fleet list with filters, add/edit/deactivate actions.
 */

import { useState } from 'react';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import BlockIcon from '@mui/icons-material/Block';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { PageBackButton } from '@/components/layout/PageBackButton';
import { ResponsiveTable } from '@/components/responsive/ResponsiveTable';
import type { Column } from '@/components/responsive/ResponsiveTable';
import { useIsMobile } from '@/hooks/useResponsive';
import { useAuthStore } from '@/store/authStore';
import { transportationUnitApi } from '@/services/transportation.service';
import {
  UNIT_TYPE_LABELS,
  FUEL_TYPE_LABELS,
} from '@/types/transportation.types';
import type {
  TransportationUnit,
  TransportationUnitType,
  FuelType,
} from '@/types/transportation.types';

const UNIT_TYPES: TransportationUnitType[] = [
  'REGULAR_BUS', 'SPECIAL_EDUCATION_BUS', 'MINIBUS', 'CAR', 'TRUCK', 'VAN', 'OTHER',
];
const FUEL_TYPES: FuelType[] = ['GASOLINE', 'DIESEL', 'ELECTRIC', 'PROPANE', 'CNG', 'OTHER'];

interface UnitFormState {
  unitNumber: string;
  type: TransportationUnitType | '';
  fuelType: FuelType | '';
  vin: string;
  year: string;
  make: string;
  model: string;
  capacity: string;
  licensePlate: string;
  currentMileage: string;
  notes: string;
}

const defaultForm: UnitFormState = {
  unitNumber: '', type: '', fuelType: '', vin: '', year: '', make: '',
  model: '', capacity: '', licensePlate: '', currentMileage: '0', notes: '',
};

export default function TransportationUnitsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 2);
  const isMobile = useIsMobile();

  // Filters
  // Filter state — lives in the URL so Back from a unit returns to this view
  const [filters, setFilters] = useFilterParams({
    search:     '',
    type:       '',
    fuel:       '',
    activeOnly: '1',
    page:       '0',
    rows:       '25',
  });

  const search      = filters.search;
  const typeFilter  = filters.type as TransportationUnitType | '';
  const fuelFilter  = filters.fuel as FuelType | '';
  const activeOnly  = filters.activeOnly === '1';
  const page        = Number(filters.page) || 0;
  const rowsPerPage = Number(filters.rows) || 25;

  // Dialog
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editUnit, setEditUnit]       = useState<TransportationUnit | null>(null);
  const [form, setForm]               = useState<UnitFormState>(defaultForm);
  const [formError, setFormError]     = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['transportation-units', { search, typeFilter, fuelFilter, activeOnly, page, rowsPerPage }],
    queryFn: () =>
      transportationUnitApi.getAll({
        search:   search || undefined,
        type:     typeFilter || undefined,
        fuelType: fuelFilter || undefined,
        isActive: activeOnly ? true : undefined,
        page:     page + 1,
        limit:    rowsPerPage,
      }),
  });

  const createMutation = useMutation({
    mutationFn: transportationUnitApi.create,
    onSuccess: (newUnit) => {
      queryClient.invalidateQueries({ queryKey: ['transportation-units'] });
      setDialogOpen(false);
      setForm(defaultForm);
      setFormError('');
      navigate(`/transportation/units/${newUnit.id}`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create unit';
      setFormError(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransportationUnit> }) =>
      transportationUnitApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportation-units'] });
      setDialogOpen(false);
      setEditUnit(null);
      setForm(defaultForm);
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update unit';
      setFormError(msg);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: transportationUnitApi.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportation-units'] });
    },
  });

  function openCreate() {
    setEditUnit(null);
    setForm(defaultForm);
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(unit: TransportationUnit) {
    setEditUnit(unit);
    setForm({
      unitNumber:     unit.unitNumber,
      type:           unit.type as TransportationUnitType,
      fuelType:       unit.fuelType as FuelType,
      vin:            unit.vin ?? '',
      year:           unit.year?.toString() ?? '',
      make:           unit.make ?? '',
      model:          unit.model ?? '',
      capacity:       unit.capacity?.toString() ?? '',
      licensePlate:   unit.licensePlate ?? '',
      currentMileage: unit.currentMileage.toString(),
      notes:          unit.notes ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.unitNumber.trim() || !form.type || !form.fuelType) {
      setFormError('Unit number, type, and fuel type are required.');
      return;
    }
    const payload = {
      unitNumber:     form.unitNumber.trim(),
      type:           form.type as TransportationUnitType,
      fuelType:       form.fuelType as FuelType,
      vin:            form.vin.trim() || null,
      year:           form.year ? parseInt(form.year, 10) : null,
      make:           form.make.trim() || null,
      model:          form.model.trim() || null,
      capacity:       form.capacity ? parseInt(form.capacity, 10) : null,
      licensePlate:   form.licensePlate.trim() || null,
      currentMileage: form.currentMileage ? parseInt(form.currentMileage, 10) : 0,
      notes:          form.notes.trim() || null,
    };
    if (editUnit) {
      updateMutation.mutate({ id: editUnit.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const units = data?.items ?? [];
  const total = data?.total ?? 0;

  const unitColumns: Column<TransportationUnit>[] = [
    {
      key: 'unitNumber',
      label: 'Unit #',
      isPrimary: true,
      render: (unit) => <Typography variant="body2" fontWeight="bold">{unit.unitNumber}</Typography>,
    },
    {
      key: 'type',
      label: 'Type',
      isSecondary: true,
      render: (unit) => <Chip label={UNIT_TYPE_LABELS[unit.type] ?? unit.type} size="small" variant="outlined" />,
    },
    {
      key: 'fuelType',
      label: 'Fuel',
      render: (unit) => FUEL_TYPE_LABELS[unit.fuelType] ?? unit.fuelType,
    },
    {
      key: 'make',
      label: 'Make / Model',
      hideOnMobile: true,
      render: (unit) => unit.make && unit.model ? `${unit.make} ${unit.model}` : unit.make ?? unit.model ?? '—',
    },
    {
      key: 'year',
      label: 'Year',
      hideOnMobile: true,
      render: (unit) => unit.year ?? '—',
    },
    {
      key: 'licensePlate',
      label: 'License Plate',
      hideOnMobile: true,
      render: (unit) => unit.licensePlate ?? '—',
    },
    {
      key: 'assigned',
      label: 'Assigned',
      render: (unit) => {
        const active = (unit.assignments ?? []).filter((a) => !a.unassignedAt);
        return active.length > 0
          ? <Chip label="Assigned" size="small" color="primary" variant="outlined" />
          : <Chip label="Unassigned" size="small" variant="outlined" />;
      },
    },
    {
      key: 'driver',
      label: 'Driver',
      hideOnMobile: false,
      render: (unit) => {
        const active = (unit.assignments ?? []).filter((a) => !a.unassignedAt);
        if (active.length === 0) return <Typography variant="body2" color="text.secondary">—</Typography>;
        const primary = active.find((a) => a.isPrimary) ?? active[0];
        const name = primary.user
          ? (primary.user.displayName ?? `${primary.user.firstName} ${primary.user.lastName}`)
          : '—';
        return (
          <Box>
            <Typography variant="body2">{name}</Typography>
            {active.length > 1 && (
              <Typography variant="caption" color="text.secondary">+{active.length - 1} more</Typography>
            )}
          </Box>
        );
      },
    },
    {
      key: 'currentMileage',
      label: 'Mileage',
      align: 'right',
      hideOnMobile: true,
      render: (unit) => unit.currentMileage.toLocaleString(),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (unit) => (
        <Chip
          label={unit.isActive ? 'Active' : 'Inactive'}
          color={unit.isActive ? 'success' : 'default'}
          size="small"
        />
      ),
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={3}>
        <PageBackButton />
        <Typography variant="h5" fontWeight="bold">Fleet Management</Typography>
        {permLevel >= 2 && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ ...(isMobile ? { width: '100%' } : {}) }}>
            Add Unit
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search unit number, make, model…"
              value={search}
              onChange={(e) => { setFilters({ search: e.target.value, page: '0' }); }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={typeFilter}
                onChange={(e) => { setFilters({ type: e.target.value, page: '0' }); }}
              >
                <MenuItem value="">All Types</MenuItem>
                {UNIT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{UNIT_TYPE_LABELS[t]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Fuel</InputLabel>
              <Select
                label="Fuel"
                value={fuelFilter}
                onChange={(e) => { setFilters({ fuel: e.target.value, page: '0' }); }}
              >
                <MenuItem value="">All Fuels</MenuItem>
                {FUEL_TYPES.map((f) => (
                  <MenuItem key={f} value={f}>{FUEL_TYPE_LABELS[f]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={activeOnly ? 'active' : 'all'}
                onChange={(e) => { setFilters({ activeOnly: e.target.value === 'active' ? '1' : '0', page: '0' }); }}
              >
                <MenuItem value="active">Active Only</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {isLoading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load fleet data.</Alert>}

      {!isLoading && (
        <Paper>
          <ResponsiveTable
            columns={unitColumns}
            rows={units}
            getRowKey={(unit) => unit.id}
            onRowClick={(unit) => navigate(`/transportation/units/${unit.id}`)}
            loading={isLoading}
            emptyMessage="No units found."
            rowActions={(unit) => (
              <>
                <Tooltip title="View Details">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/transportation/units/${unit.id}`); }}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {permLevel >= 2 && (
                  <Tooltip title="Assign Driver">
                    <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); navigate(`/transportation/units/${unit.id}#assign`); }}>
                      <PersonAddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {permLevel >= 2 && (
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(unit); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {permLevel >= 3 && unit.isActive && (
                  <Tooltip title="Deactivate">
                    <IconButton size="small" color="error" onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Deactivate unit ${unit.unitNumber}?`)) {
                        deactivateMutation.mutate(unit.id);
                      }
                    }}>
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
          />
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setFilters({ page: String(p) })}
            onRowsPerPageChange={(e) => { setFilters({ rows: e.target.value, page: '0' }); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Paper>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editUnit ? 'Edit Unit' : 'Add Unit'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Unit Number *"
                fullWidth
                size="small"
                value={form.unitNumber}
                onChange={(e) => setForm({ ...form, unitNumber: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Type *</InputLabel>
                <Select
                  label="Type *"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as TransportationUnitType })}
                >
                  {UNIT_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{UNIT_TYPE_LABELS[t]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Fuel Type *</InputLabel>
                <Select
                  label="Fuel Type *"
                  value={form.fuelType}
                  onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}
                >
                  {FUEL_TYPES.map((f) => (
                    <MenuItem key={f} value={f}>{FUEL_TYPE_LABELS[f]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="VIN"
                fullWidth
                size="small"
                value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Year"
                fullWidth
                size="small"
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Make"
                fullWidth
                size="small"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Model"
                fullWidth
                size="small"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Capacity"
                fullWidth
                size="small"
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="License Plate"
                fullWidth
                size="small"
                value={form.licensePlate}
                onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Current Mileage"
                fullWidth
                size="small"
                type="number"
                value={form.currentMileage}
                onChange={(e) => setForm({ ...form, currentMileage: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notes"
                fullWidth
                size="small"
                multiline
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {editUnit ? 'Save Changes' : 'Add Unit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

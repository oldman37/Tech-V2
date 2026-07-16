/**
 * Fuel Stations Page — /transportation/fuel-stations
 *
 * Manages the whitelist of OfficeLocations that have a fueling station.
 * Each station can have multiple FuelTanks; this page provides full CRUD
 * for both stations and their tanks, including delivery logging.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import { PageBackButton } from '@/components/layout/PageBackButton';
import { useAuthStore } from '@/store/authStore';
import { fuelStationApi, fuelTankApi } from '@/services/transportation.service';
import { FuelLevelBar } from '@/components/transportation/FuelLevelBar';
import { TANK_FUEL_TYPE_LABELS } from '@/types/transportation.types';
import type {
  TransportationFuelStation,
  OfficeLocationSlim,
  FuelTank,
  TankFuelType,
} from '@/types/transportation.types';

// ---------------------------------------------------------------------------
// StationTanksPanel — lazy-loaded per-station tanks section
// ---------------------------------------------------------------------------
interface StationTanksPanelProps {
  station: TransportationFuelStation;
  permLevel: number;
}

function StationTanksPanel({ station, permLevel }: StationTanksPanelProps) {
  const queryClient = useQueryClient();

  // Tank dialog state
  const [tankDialogOpen, setTankDialogOpen] = useState(false);
  const [editTank, setEditTank] = useState<FuelTank | null>(null);
  const [fuelType, setFuelType] = useState<TankFuelType>('DIESEL');
  const [capacity, setCapacity] = useState('');
  const [tankLabel, setTankLabel] = useState('');
  const [threshold, setThreshold] = useState('30');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [tankNotes, setTankNotes] = useState('');
  const [initialFill, setInitialFill] = useState('');
  const [tankError, setTankError] = useState('');

  // Delivery dialog state
  const [deliveryTankId, setDeliveryTankId] = useState<string | null>(null);
  const [deliveryGallons, setDeliveryGallons] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryVendor, setDeliveryVendor] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryError, setDeliveryError] = useState('');

  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['fuel-tanks', station.id],
    queryFn: () => fuelTankApi.getByStation(station.id),
  });

  const createTankMutation = useMutation({
    mutationFn: (data: Parameters<typeof fuelTankApi.create>[1]) =>
      fuelTankApi.create(station.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks', station.id] });
      closeTankDialog();
    },
    onError: (err: unknown) =>
      setTankError(err instanceof Error ? err.message : 'Failed to create tank'),
  });

  const updateTankMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof fuelTankApi.update>[1] }) =>
      fuelTankApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks', station.id] });
      closeTankDialog();
    },
    onError: (err: unknown) =>
      setTankError(err instanceof Error ? err.message : 'Failed to update tank'),
  });

  const deleteTankMutation = useMutation({
    mutationFn: fuelTankApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks', station.id] });
    },
  });

  const recordDeliveryMutation = useMutation({
    mutationFn: ({
      tankId,
      data,
    }: {
      tankId: string;
      data: Parameters<typeof fuelTankApi.recordDelivery>[1];
    }) => fuelTankApi.recordDelivery(tankId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks', station.id] });
      closeDeliveryDialog();
    },
    onError: (err: unknown) =>
      setDeliveryError(err instanceof Error ? err.message : 'Failed to record delivery'),
  });

  function openAddTank() {
    setEditTank(null);
    setFuelType('DIESEL');
    setCapacity('');
    setTankLabel('');
    setThreshold('30');
    setAlertEnabled(true);
    setTankNotes('');
    setInitialFill('');
    setTankError('');
    setTankDialogOpen(true);
  }

  function openEditTank(tank: FuelTank) {
    setEditTank(tank);
    setFuelType(tank.fuelType);
    setCapacity(String(tank.capacityGallons));
    setTankLabel(tank.label ?? '');
    setThreshold(String(tank.alertThresholdPercent));
    setAlertEnabled(tank.alertEnabled);
    setTankNotes(tank.notes ?? '');
    setInitialFill(String(tank.initialFillGallons));
    setTankError('');
    setTankDialogOpen(true);
  }

  function closeTankDialog() {
    setTankDialogOpen(false);
    setEditTank(null);
    setTankError('');
  }

  function openDeliveryDialog(tankId: string) {
    setDeliveryTankId(tankId);
    setDeliveryGallons('');
    setDeliveryDate(new Date().toISOString().slice(0, 16));
    setDeliveryVendor('');
    setDeliveryNotes('');
    setDeliveryError('');
  }

  function closeDeliveryDialog() {
    setDeliveryTankId(null);
    setDeliveryError('');
  }

  function handleTankSubmit() {
    const cap = parseFloat(capacity);
    const thr = parseInt(threshold, 10);
    if (!capacity || isNaN(cap) || cap <= 0) {
      setTankError('Enter a valid capacity in gallons.');
      return;
    }
    if (!threshold || isNaN(thr) || thr < 1 || thr > 100) {
      setTankError('Alert threshold must be between 1 and 100.');
      return;
    }
    const initFillNum = initialFill !== '' ? parseFloat(initialFill) : cap;
    if (isNaN(initFillNum) || initFillNum < 0 || initFillNum > cap) {
      setTankError('Initial fill must be between 0 and capacity.');
      return;
    }
    const data = {
      fuelType,
      capacityGallons: cap,
      initialFillGallons: initFillNum,
      label: tankLabel.trim() || null,
      alertThresholdPercent: thr,
      alertEnabled,
      notes: tankNotes.trim() || null,
    };
    if (editTank) {
      updateTankMutation.mutate({ id: editTank.id, data });
    } else {
      createTankMutation.mutate(data);
    }
  }

  function handleDeliverySubmit() {
    const gallons = parseFloat(deliveryGallons);
    if (!deliveryGallons || isNaN(gallons) || gallons <= 0) {
      setDeliveryError('Enter a valid gallons amount.');
      return;
    }
    if (!deliveryTankId) return;
    recordDeliveryMutation.mutate({
      tankId: deliveryTankId,
      data: {
        gallonsDelivered: gallons,
        deliveryDate: deliveryDate || undefined,
        vendorName: deliveryVendor.trim() || null,
        notes: deliveryNotes.trim() || null,
      },
    });
  }

  const activeTanks = tanks.filter((t) => t.isActive);

  return (
    <Box sx={{ px: 0.5, pb: 0.5 }}>
      {station.notes && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Notes: {station.notes}
        </Typography>
      )}

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography
          variant="subtitle2"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}
        >
          <LocalGasStationIcon fontSize="small" /> Tanks
        </Typography>
        {permLevel >= 2 && (
          <Button size="small" startIcon={<AddIcon />} onClick={openAddTank}>
            Add Tank
          </Button>
        )}
      </Box>

      {tanksLoading && (
        <Box display="flex" justifyContent="center" py={1}>
          <CircularProgress size={20} />
        </Box>
      )}

      {!tanksLoading && activeTanks.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
          No tanks configured for this station.
        </Typography>
      )}

      {activeTanks.map((tank) => {
        const gallonsCurrent = Number(tank.currentFillGallons);
        const gallonsCapacity = Number(tank.capacityGallons);
        const pct =
          gallonsCapacity > 0
            ? Math.max(0, Math.min(100, (gallonsCurrent / gallonsCapacity) * 100))
            : 0;

        return (
          <Paper key={tank.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={1}
              mb={1}
            >
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Chip
                  label={TANK_FUEL_TYPE_LABELS[tank.fuelType] ?? tank.fuelType}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {tank.label && (
                  <Typography variant="body2" color="text.secondary">
                    {tank.label}
                  </Typography>
                )}
              </Box>
              <Box display="flex" gap={0.5}>
                {permLevel >= 2 && (
                  <Tooltip title="Log Fuel Delivery">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => openDeliveryDialog(tank.id)}
                    >
                      <LocalGasStationIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {permLevel >= 2 && (
                  <Tooltip title="Edit Tank">
                    <IconButton size="small" onClick={() => openEditTank(tank)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {permLevel >= 3 && (
                  <Tooltip title="Delete Tank">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${TANK_FUEL_TYPE_LABELS[tank.fuelType] ?? tank.fuelType} tank${tank.label ? ` (${tank.label})` : ''}?`,
                          )
                        ) {
                          deleteTankMutation.mutate(tank.id);
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>

            <FuelLevelBar
              percentFull={pct}
              threshold={tank.alertThresholdPercent}
              gallonsCurrent={gallonsCurrent}
              gallonsCapacity={gallonsCapacity}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Alert at {tank.alertThresholdPercent}%{!tank.alertEnabled ? ' (alerts disabled)' : ''}
            </Typography>
          </Paper>
        );
      })}

      {/* Add / Edit Tank Dialog */}
      <Dialog open={tankDialogOpen} onClose={closeTankDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{editTank ? 'Edit Tank' : 'Add Tank'}</DialogTitle>
        <DialogContent>
          {tankError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {tankError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Fuel Type *</InputLabel>
                <Select
                  label="Fuel Type *"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as TankFuelType)}
                >
                  {(Object.keys(TANK_FUEL_TYPE_LABELS) as TankFuelType[]).map((ft) => (
                    <MenuItem key={ft} value={ft}>
                      {TANK_FUEL_TYPE_LABELS[ft]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Capacity (gallons) *"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 1, step: 1 }}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Current Fill (gallons)"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={initialFill}
                onChange={(e) => setInitialFill(e.target.value)}
                helperText={`How full is the tank now? Defaults to full (${capacity || 'capacity'} gal)`}
                placeholder={capacity || '0'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Alert Threshold %"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 1, max: 100 }}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                helperText="1–100, default 30"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Label (optional)"
                fullWidth
                size="small"
                value={tankLabel}
                onChange={(e) => setTankLabel(e.target.value)}
                placeholder='e.g., "Tank A – North Pump"'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={alertEnabled}
                    onChange={(e) => setAlertEnabled(e.target.checked)}
                  />
                }
                label="Enable low-fuel email alerts"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notes (optional)"
                fullWidth
                size="small"
                multiline
                rows={2}
                value={tankNotes}
                onChange={(e) => setTankNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTankDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleTankSubmit}
            disabled={createTankMutation.isPending || updateTankMutation.isPending}
          >
            {editTank ? 'Save' : 'Add Tank'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log Delivery Dialog */}
      <Dialog open={!!deliveryTankId} onClose={closeDeliveryDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Log Fuel Delivery</DialogTitle>
        <DialogContent>
          {deliveryError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deliveryError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Gallons Delivered *"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 0.01, step: 0.01 }}
                value={deliveryGallons}
                onChange={(e) => setDeliveryGallons(e.target.value)}
                required
                autoFocus
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Delivery Date & Time"
                fullWidth
                size="small"
                type="datetime-local"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Vendor (optional)"
                fullWidth
                size="small"
                value={deliveryVendor}
                onChange={(e) => setDeliveryVendor(e.target.value)}
                placeholder="e.g., ABC Fuel Supply"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notes (optional)"
                fullWidth
                size="small"
                multiline
                rows={2}
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeliveryDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleDeliverySubmit}
            disabled={recordDeliveryMutation.isPending}
          >
            {recordDeliveryMutation.isPending ? 'Logging…' : 'Log Delivery'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function FuelStationsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 2);

  // Add / Edit station dialog state
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editStation, setEditStation] = useState<TransportationFuelStation | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<OfficeLocationSlim | null>(null);
  const [notes, setNotes]             = useState('');
  const [formError, setFormError]     = useState('');

  const { data: stations = [], isLoading, error } = useQuery({
    queryKey: ['fuel-stations'],
    queryFn: () => fuelStationApi.getAll(),
  });

  const { data: availableLocations = [] } = useQuery({
    queryKey: ['fuel-stations-available-locations'],
    queryFn: fuelStationApi.getAvailableLocations,
    enabled: dialogOpen && !editStation,
  });

  const createMutation = useMutation({
    mutationFn: fuelStationApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-stations'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-stations-available-locations'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to add fuel station');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isActive?: boolean; notes?: string | null } }) =>
      fuelStationApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-stations'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to update fuel station');
    },
  });

  const removeMutation = useMutation({
    mutationFn: fuelStationApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-stations'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-stations-available-locations'] });
    },
  });

  function openCreate() {
    setEditStation(null);
    setSelectedLoc(null);
    setNotes('');
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(station: TransportationFuelStation) {
    setEditStation(station);
    setSelectedLoc(null);
    setNotes(station.notes ?? '');
    setFormError('');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditStation(null);
    setSelectedLoc(null);
    setNotes('');
    setFormError('');
  }

  function handleSubmit() {
    if (editStation) {
      updateMutation.mutate({ id: editStation.id, data: { notes: notes.trim() || null } });
    } else {
      if (!selectedLoc) { setFormError('Please select a location.'); return; }
      createMutation.mutate({ officeLocationId: selectedLoc.id, notes: notes.trim() || null });
    }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
        mb={3}
      >
        <PageBackButton />
        <Typography variant="h5" fontWeight="bold">
          Fuel Stations
        </Typography>
        {permLevel >= 2 && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Fuel Station
          </Button>
        )}
      </Box>

      {isLoading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load fuel stations.
        </Alert>
      )}

      {!isLoading && stations.length === 0 && !error && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No fuel stations configured. Add a location to begin.
          </Typography>
        </Paper>
      )}

      {/* Accordion list — one per station, expandable to show tanks */}
      {stations.map((station) => (
        <Accordion
          key={station.id}
          disableGutters
          elevation={1}
          sx={{
            mb: 1,
            '&:before': { display: 'none' },
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 1 }}>
            <Box
              display="flex"
              alignItems="center"
              width="100%"
              gap={1}
              flexWrap="wrap"
              pr={1}
            >
              <Box flex={1} minWidth={0}>
                <Typography fontWeight="medium" noWrap>
                  {station.officeLocation.name}
                </Typography>
                {(station.officeLocation.address || station.officeLocation.city) && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {[station.officeLocation.address, station.officeLocation.city]
                      .filter(Boolean)
                      .join(', ')}
                  </Typography>
                )}
              </Box>

              {permLevel >= 2 ? (
                <Switch
                  checked={station.isActive}
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateMutation.mutate({ id: station.id, data: { isActive: e.target.checked } })
                  }
                />
              ) : (
                <Chip
                  label={station.isActive ? 'Active' : 'Inactive'}
                  size="small"
                  color={station.isActive ? 'success' : 'default'}
                />
              )}

              {permLevel >= 2 && (
                <Tooltip title="Edit Notes">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(station);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}

              {permLevel >= 3 && (
                <Tooltip title="Remove Station">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Remove ${station.officeLocation.name} from fuel stations?`,
                        )
                      ) {
                        removeMutation.mutate(station.id);
                      }
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </AccordionSummary>

          <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
            <StationTanksPanel station={station} permLevel={permLevel} />
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Add / Edit Station Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editStation ? 'Edit Fuel Station' : 'Add Fuel Station'}</DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {!editStation && (
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  options={availableLocations}
                  getOptionLabel={(o) => o.name}
                  value={selectedLoc}
                  onChange={(_, v) => setSelectedLoc(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Location *" size="small" fullWidth />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Box>
                        <Typography variant="body2">{option.name}</Typography>
                        {(option.address || option.city) && (
                          <Typography variant="caption" color="text.secondary">
                            {[option.address, option.city].filter(Boolean).join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  )}
                  noOptionsText="No available locations"
                />
              </Grid>
            )}
            {editStation && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">
                  Location: <strong>{editStation.officeLocation.name}</strong>
                </Typography>
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notes (optional)"
                fullWidth
                size="small"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Diesel only, Pump #3"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {editStation ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Fuel Stations Page — /transportation/fuel-stations
 *
 * Manage the whitelist of OfficeLocations that have a fueling station.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
  Grid,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuthStore } from '@/store/authStore';
import { fuelStationApi } from '@/services/transportation.service';
import type { TransportationFuelStation, OfficeLocationSlim } from '@/types/transportation.types';

export default function FuelStationsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 2);

  // Dialog state
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editStation, setEditStation]   = useState<TransportationFuelStation | null>(null);
  const [selectedLoc, setSelectedLoc]   = useState<OfficeLocationSlim | null>(null);
  const [notes, setNotes]               = useState('');
  const [formError, setFormError]       = useState('');

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
      updateMutation.mutate({
        id: editStation.id,
        data: { notes: notes.trim() || null },
      });
    } else {
      if (!selectedLoc) {
        setFormError('Please select a location.');
        return;
      }
      createMutation.mutate({
        officeLocationId: selectedLoc.id,
        notes: notes.trim() || null,
      });
    }
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Fuel Stations</Typography>
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
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load fuel stations.</Alert>}

      {!isLoading && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Location Name</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>Added By</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stations.map((station) => (
                  <TableRow key={station.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {station.officeLocation.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{station.officeLocation.code ?? '—'}</TableCell>
                    <TableCell>
                      {station.officeLocation.address
                        ? `${station.officeLocation.address}${station.officeLocation.city ? `, ${station.officeLocation.city}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell>{station.notes ?? '—'}</TableCell>
                    <TableCell>
                      {permLevel >= 2 ? (
                        <Switch
                          checked={station.isActive}
                          size="small"
                          onChange={(e) =>
                            updateMutation.mutate({ id: station.id, data: { isActive: e.target.checked } })
                          }
                        />
                      ) : (
                        <Chip
                          label={station.isActive ? 'Active' : 'Inactive'}
                          color={station.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {station.addedBy?.displayName ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      {permLevel >= 2 && (
                        <Tooltip title="Edit Notes">
                          <IconButton size="small" onClick={() => openEdit(station)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {permLevel >= 3 && (
                        <Tooltip title="Remove">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              if (window.confirm(`Remove ${station.officeLocation.name} from fuel stations?`)) {
                                removeMutation.mutate(station.id);
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {stations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No fuel stations configured. Add a location to begin.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editStation ? 'Edit Fuel Station' : 'Add Fuel Station'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
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

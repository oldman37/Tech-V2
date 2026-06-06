/**
 * My Fuel History Page — /transportation/my-fuel-history
 *
 * Level 1: own entries only (getMyEntries).
 * Level 2+: all entries with filters (unit, user, station, date range, month).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { fuelEntryApi, fuelStationApi, transportationUnitApi } from '@/services/transportation.service';
import type { FuelConsumptionEntry } from '@/types/transportation.types';

export default function MyFuelHistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 1);

  const [page, setPage]         = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Level 2+ filters
  const [unitIdFilter, setUnitIdFilter]         = useState('');
  const [stationIdFilter, setStationIdFilter]   = useState('');
  const [monthFilter, setMonthFilter]           = useState('');
  const [fromFilter, setFromFilter]             = useState('');
  const [toFilter, setToFilter]                 = useState('');

  const { data: stationsData = [] } = useQuery({
    queryKey: ['fuel-stations'],
    queryFn: () => fuelStationApi.getAll(),
    enabled: permLevel >= 2,
  });

  const { data: unitsData } = useQuery({
    queryKey: ['transportation-units-active'],
    queryFn: () => transportationUnitApi.getAll({ isActive: true, limit: 100 }),
    enabled: permLevel >= 2,
  });

  // Query: level 1 = my entries, level 2+ = all with filters
  const { data, isLoading, error } = useQuery({
    queryKey: permLevel >= 2
      ? ['fuel-entries-all', { unitIdFilter, stationIdFilter, monthFilter, fromFilter, toFilter, page, rowsPerPage }]
      : ['fuel-entries-mine', { page, rowsPerPage }],
    queryFn: () => {
      if (permLevel >= 2) {
        return fuelEntryApi.getAll({
          unitId:         unitIdFilter || undefined,
          fuelStationId:  stationIdFilter || undefined,
          reportingMonth: monthFilter || undefined,
          from:           fromFilter || undefined,
          to:             toFilter || undefined,
          page:           page + 1,
          limit:          rowsPerPage,
        });
      }
      return fuelEntryApi.getMyEntries({ page: page + 1, limit: rowsPerPage });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: fuelEntryApi.deleteEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-entries-all'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-entries-mine'] });
    },
  });

  const entries: FuelConsumptionEntry[] = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">
          {permLevel >= 2 ? 'Fuel Entry History' : 'My Fuel History'}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/transportation/fuel-entry')}
        >
          Log Fuel
        </Button>
      </Box>

      {/* Level 2+ Filters */}
      {permLevel >= 2 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Unit</InputLabel>
                <Select
                  label="Unit"
                  value={unitIdFilter}
                  onChange={(e) => { setUnitIdFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Units</MenuItem>
                  {(unitsData?.items ?? []).map((u) => (
                    <MenuItem key={u.id} value={u.id}>{u.unitNumber}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Fuel Station</InputLabel>
                <Select
                  label="Fuel Station"
                  value={stationIdFilter}
                  onChange={(e) => { setStationIdFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Stations</MenuItem>
                  {stationsData.map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.officeLocation.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <TextField
                label="Month (YYYY-MM)"
                size="small"
                fullWidth
                value={monthFilter}
                onChange={(e) => { setMonthFilter(e.target.value); setPage(0); }}
                placeholder="2026-06"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <TextField
                label="From Date"
                size="small"
                fullWidth
                type="date"
                value={fromFilter}
                onChange={(e) => { setFromFilter(e.target.value); setPage(0); }}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <TextField
                label="To Date"
                size="small"
                fullWidth
                type="date"
                value={toFilter}
                onChange={(e) => { setToFilter(e.target.value); setPage(0); }}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </Paper>
      )}

      {isLoading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load fuel entries.</Alert>}

      {!isLoading && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Fuel Station</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Mileage</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  {permLevel >= 2 && <TableCell>Entered By</TableCell>}
                  {permLevel >= 3 && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>
                      {new Date(entry.entryDate).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{entry.unit?.unitNumber ?? '—'}</TableCell>
                    <TableCell>
                      {entry.fuelStation?.officeLocation?.name ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      {Number(entry.fuelAmount).toFixed(3)} {entry.fuelUnit}
                    </TableCell>
                    <TableCell align="right">
                      {entry.mileageAtFueling.toLocaleString()} mi
                    </TableCell>
                    <TableCell align="right">
                      {entry.totalCost != null
                        ? `$${Number(entry.totalCost).toFixed(2)}`
                        : entry.costPerUnit != null
                        ? `$${(Number(entry.fuelAmount) * Number(entry.costPerUnit)).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    {permLevel >= 2 && (
                      <TableCell>
                        {entry.enteredBy?.displayName ??
                          `${entry.enteredBy?.firstName ?? ''} ${entry.enteredBy?.lastName ?? ''}`}
                      </TableCell>
                    )}
                    {permLevel >= 3 && (
                      <TableCell align="right">
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              if (window.confirm('Delete this fuel entry?')) {
                                deleteMutation.mutate(entry.id);
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={permLevel >= 3 ? 8 : 7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No fuel entries found.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Paper>
      )}
    </Box>
  );
}

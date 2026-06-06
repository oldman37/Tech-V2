/**
 * Transportation Unit Detail Page — /transportation/units/:id
 *
 * Shows unit info, current assignments (with assign/unassign), and recent fuel entries.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import { useAuthStore } from '@/store/authStore';
import { transportationUnitApi } from '@/services/transportation.service';
import { api } from '@/services/api';
import { UNIT_TYPE_LABELS, FUEL_TYPE_LABELS } from '@/types/transportation.types';

interface UserOption {
  id: string;
  displayName: string | null;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
}

export default function TransportationUnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 2);

  // Assign driver dialog
  const [assignOpen, setAssignOpen]     = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userSearch, setUserSearch]     = useState('');
  const [assignError, setAssignError]   = useState('');

  // Auto-open assign dialog when navigated here with #assign hash
  useEffect(() => {
    if (location.hash === '#assign' && permLevel >= 2) {
      setAssignOpen(true);
      // Clear the hash without adding a history entry
      navigate(location.pathname, { replace: true });
    }
  }, [location.hash, location.pathname, permLevel, navigate]);
  const { data: unit, isLoading, error } = useQuery({
    queryKey: ['transportation-unit', id],
    queryFn: () => transportationUnitApi.getById(id!),
    enabled: !!id,
  });

  const { data: assignments } = useQuery({
    queryKey: ['transportation-unit-assignments', id],
    queryFn: () => transportationUnitApi.getAssignments(id!),
    enabled: !!id,
  });

  const { data: userOptions = [] } = useQuery<UserOption[]>({
    queryKey: ['user-search', userSearch],
    queryFn: async () => {
      if (!userSearch.trim()) return [];
      const res = await api.get<UserOption[]>('/transportation-units/user-search', {
        params: { q: userSearch, limit: 20 },
      });
      return res.data ?? [];
    },
    enabled: userSearch.length >= 2,
  });

  const assignMutation = useMutation({
    mutationFn: (data: { userId: string; isPrimary?: boolean }) =>
      transportationUnitApi.assignUser(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportation-unit-assignments', id] });
      setAssignOpen(false);
      setSelectedUser(null);
      setUserSearch('');
      setAssignError('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to assign driver';
      setAssignError(msg);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => transportationUnitApi.unassignUser(id!, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportation-unit-assignments', id] });
    },
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }
  if (error || !unit) {
    return (
      <Box p={3}>
        <Alert severity="error">Failed to load unit details.</Alert>
      </Box>
    );
  }

  const activeAssignments = (assignments ?? []).filter((a) => !a.unassignedAt);
  const historyAssignments = (assignments ?? []).filter((a) => !!a.unassignedAt);

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate('/transportation/units')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight="bold">
          Unit: {unit.unitNumber}
        </Typography>
        <Chip
          label={unit.isActive ? 'Active' : 'Inactive'}
          color={unit.isActive ? 'success' : 'default'}
          size="small"
        />
      </Box>

      <Grid container spacing={3}>
        {/* Unit Info */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" mb={2}>Unit Information</Typography>
              <Grid container spacing={1}>
                {[
                  { label: 'Unit Number', value: unit.unitNumber },
                  { label: 'Type', value: UNIT_TYPE_LABELS[unit.type] ?? unit.type },
                  { label: 'Fuel Type', value: FUEL_TYPE_LABELS[unit.fuelType] ?? unit.fuelType },
                  { label: 'Year', value: unit.year?.toString() ?? '—' },
                  { label: 'Make', value: unit.make ?? '—' },
                  { label: 'Model', value: unit.model ?? '—' },
                  { label: 'VIN', value: unit.vin ?? '—' },
                  { label: 'License Plate', value: unit.licensePlate ?? '—' },
                  { label: 'Capacity', value: unit.capacity?.toString() ?? '—' },
                  { label: 'Current Mileage', value: `${unit.currentMileage.toLocaleString()} mi` },
                ].map(({ label, value }) => (
                  <Grid size={{ xs: 6 }} key={label}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Grid>
                ))}
                {unit.notes && (
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography variant="body2">{unit.notes}</Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Current Assignments */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper>
            <Box
              p={2}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              borderBottom="1px solid"
              borderColor="divider"
            >
              <Typography variant="h6" fontWeight="bold">Current Assignments</Typography>
              {permLevel >= 2 && (
                <Button
                  size="small"
                  startIcon={<PersonAddIcon />}
                  onClick={() => { setAssignOpen(true); setAssignError(''); }}
                >
                  Assign Driver
                </Button>
              )}
            </Box>
            {activeAssignments.length === 0 ? (
              <Box p={3} textAlign="center">
                <Typography color="text.secondary" mb={permLevel >= 2 ? 2 : 0}>
                  No drivers currently assigned.
                </Typography>
                {permLevel >= 2 && (
                  <Button
                    variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={() => { setAssignOpen(true); setAssignError(''); }}
                  >
                    Assign a Driver
                  </Button>
                )}
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Driver</TableCell>
                    <TableCell>Primary</TableCell>
                    <TableCell>Assigned</TableCell>
                    {permLevel >= 2 && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeAssignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {a.user?.displayName ??
                            `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.user?.jobTitle ?? ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {a.isPrimary && <Chip label="Primary" size="small" color="primary" />}
                      </TableCell>
                      <TableCell>
                        {new Date(a.assignedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </TableCell>
                      {permLevel >= 2 && (
                        <TableCell>
                          <Tooltip title="Unassign">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                if (window.confirm('Unassign this driver?')) {
                                  unassignMutation.mutate(a.id);
                                }
                              }}
                            >
                              <PersonRemoveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>

        {/* Assignment History */}
        {historyAssignments.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Paper>
              <Box p={2} borderBottom="1px solid" borderColor="divider">
                <Typography variant="h6" fontWeight="bold">Assignment History</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Driver</TableCell>
                      <TableCell>Assigned</TableCell>
                      <TableCell>Unassigned</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyAssignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          {a.user?.displayName ??
                            `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`}
                        </TableCell>
                        <TableCell>
                          {new Date(a.assignedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          {a.unassignedAt
                            ? new Date(a.unassignedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Assign Driver Dialog */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Driver to {unit.unitNumber}</DialogTitle>
        <DialogContent>
          {assignError && <Alert severity="error" sx={{ mb: 2 }}>{assignError}</Alert>}
          <Box mt={1}>
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) =>
                o.displayName ?? `${o.firstName} ${o.lastName}`
              }
              value={selectedUser}
              onInputChange={(_, v) => setUserSearch(v)}
              onChange={(_, v) => setSelectedUser(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search driver by name"
                  size="small"
                  fullWidth
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {option.displayName ?? `${option.firstName} ${option.lastName}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.jobTitle ?? option.email}
                    </Typography>
                  </Box>
                </li>
              )}
              noOptionsText={userSearch.length < 2 ? 'Type at least 2 characters…' : 'No users found'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!selectedUser) {
                setAssignError('Please select a driver.');
                return;
              }
              assignMutation.mutate({ userId: selectedUser.id });
            }}
            disabled={assignMutation.isPending}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

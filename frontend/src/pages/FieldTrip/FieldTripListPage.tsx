/**
 * FieldTripListPage
 *
 * Shows the current user's field trip requests in a table.
 * Provides navigation to create a new request or view an existing one.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { fieldTripService } from '../../services/fieldTrip.service';
import type { FieldTripRequest, FieldTripStatus, StatusChipColor } from '../../types/fieldTrip.types';
import {
  FIELD_TRIP_STATUS_LABELS,
  FIELD_TRIP_STATUS_COLORS,
} from '../../types/fieldTrip.types';

export function FieldTripListPage() {
  const navigate = useNavigate();

  const { data: trips, isLoading, error } = useQuery<FieldTripRequest[]>({
    queryKey: ['field-trips', 'my-requests'],
    queryFn:  fieldTripService.getMyRequests,
  });

  const sortedTrips = useMemo(
    () => (trips ? [...trips].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []),
    [trips],
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          My Field Trip Requests
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/field-trips/new')}
        >
          New Request
        </Button>
      </Box>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load field trip requests. Please refresh the page.
        </Alert>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Destination</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Trip Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>School / Building</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Students</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Submitted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedTrips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No field trip requests found. Click "New Request" to create one.
                  </TableCell>
                </TableRow>
              )}
              {sortedTrips.map((trip) => (
                <TableRow
                  key={trip.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/field-trips/${trip.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {trip.destination}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {trip.teacherName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {new Date(trip.tripDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day:   'numeric',
                      year:  'numeric',
                    })}
                  </TableCell>
                  <TableCell>{trip.schoolBuilding}</TableCell>
                  <TableCell>{trip.studentCount}</TableCell>
                  <TableCell>
                    <StatusChip status={trip.status as FieldTripStatus} />
                  </TableCell>
                  <TableCell>
                    {trip.submittedAt
                      ? new Date(trip.submittedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })
                      : <Typography component="span" color="text.secondary" variant="body2">—</Typography>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

function StatusChip({ status }: { status: FieldTripStatus }) {
  const label = FIELD_TRIP_STATUS_LABELS[status] ?? status;
  const color: StatusChipColor = FIELD_TRIP_STATUS_COLORS[status] ?? 'default';
  return <Chip label={label} color={color} size="small" />;
}

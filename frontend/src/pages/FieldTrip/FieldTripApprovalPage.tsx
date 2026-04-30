/**
 * FieldTripApprovalPage
 *
 * Shows all field trip requests pending approval for the current user's role.
 * The backend scopes results to the stages the user is authorized to approve.
 * Clicking a row navigates to the detail page where approval/denial can be performed.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
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
import { fieldTripService } from '../../services/fieldTrip.service';
import type { FieldTripRequest, FieldTripStatus, StatusChipColor } from '../../types/fieldTrip.types';
import {
  FIELD_TRIP_STATUS_LABELS,
  FIELD_TRIP_STATUS_COLORS,
} from '../../types/fieldTrip.types';

export function FieldTripApprovalPage() {
  const navigate = useNavigate();

  const { data: trips, isLoading, error } = useQuery<FieldTripRequest[]>({
    queryKey: ['field-trips', 'pending-approvals'],
    queryFn:  fieldTripService.getPendingApprovals,
    refetchInterval: 60_000, // refresh every minute
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        Field Trip Approvals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Field trip requests pending your review and approval.
      </Typography>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load pending approvals. Please refresh the page.
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
                <TableCell sx={{ fontWeight: 'bold' }}>Submitted By</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>School</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Students</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Submitted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(!trips || trips.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No pending field trip requests require your approval at this time.
                  </TableCell>
                </TableRow>
              )}
              {trips?.map((trip) => {
                const submitterName = trip.submittedBy
                  ? (trip.submittedBy.displayName ?? `${trip.submittedBy.firstName} ${trip.submittedBy.lastName}`)
                  : '—';

                return (
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
                    </TableCell>
                    <TableCell>
                      {new Date(trip.tripDate).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{submitterName}</TableCell>
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
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
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

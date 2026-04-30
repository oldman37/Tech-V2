/**
 * FieldTripApprovalPage
 *
 * Shows all field trip requests pending approval for the current user's role.
 * The backend scopes results to the stages the user is authorized to approve.
 * Clicking a row navigates to the detail page where approval/denial can be performed.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import { fieldTripService }               from '../../services/fieldTrip.service';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
import type {
  FieldTripRequest,
  FieldTripTransportationRequest,
  FieldTripStatus,
  StatusChipColor,
  TransportationStatus,
} from '../../types/fieldTrip.types';
import {
  FIELD_TRIP_STATUS_LABELS,
  FIELD_TRIP_STATUS_COLORS,
  TRANSPORTATION_STATUS_LABELS,
  TRANSPORTATION_STATUS_COLORS,
} from '../../types/fieldTrip.types';


export function FieldTripApprovalPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  const { data: trips, isLoading, error } = useQuery<FieldTripRequest[]>({
    queryKey: ['field-trips', 'pending-approvals'],
    queryFn:  fieldTripService.getPendingApprovals,
    refetchInterval: 60_000,
  });

  const {
    data: pendingTransport,
    isLoading: transportLoading,
    error: transportError,
  } = useQuery<FieldTripTransportationRequest[]>({
    queryKey: ['field-trips', 'transportation', 'pending'],
    queryFn:  fieldTripTransportationService.listPending,
    enabled:  activeTab === 1,
    refetchInterval: 60_000,
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        Field Trip Approvals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Field trip requests pending your review and approval.
      </Typography>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Field Trip Approvals" />
        <Tab label="Transportation Pending" icon={<DirectionsBusIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {/* ── Tab 0: Field Trip Approvals ── */}
      {activeTab === 0 && (
        <>
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load pending approvals. Please refresh the page.
            </Alert>
          )}
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
                          <Typography variant="body2" fontWeight="medium">{trip.destination}</Typography>
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
        </>
      )}

      {/* ── Tab 1: Transportation Pending ── */}
      {activeTab === 1 && (
        <>
          {transportLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          )}
          {transportError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load pending transportation requests.
            </Alert>
          )}
          {!transportLoading && !transportError && (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Destination</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Trip Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Submitted By</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>School</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Buses</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Transport Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Submitted</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(!pendingTransport || pendingTransport.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No transportation requests are pending review.
                      </TableCell>
                    </TableRow>
                  )}
                  {pendingTransport?.map((req) => {
                    const trip = req.fieldTripRequest;
                    const submitterName = trip?.submittedBy
                      ? (trip.submittedBy.displayName ?? `${trip.submittedBy.firstName} ${trip.submittedBy.lastName}`)
                      : '—';
                    return (
                      <TableRow
                        key={req.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/field-trips/${req.fieldTripRequestId}/transportation/view`)}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {trip?.destination ?? '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {trip?.tripDate
                            ? new Date(trip.tripDate).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>{submitterName}</TableCell>
                        <TableCell>{trip?.schoolBuilding ?? '—'}</TableCell>
                        <TableCell>{req.busCount}</TableCell>
                        <TableCell>
                          <TransportStatusChip status={req.status as TransportationStatus} />
                        </TableCell>
                        <TableCell>
                          {req.submittedAt
                            ? new Date(req.submittedAt).toLocaleDateString('en-US', {
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
        </>
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

function TransportStatusChip({ status }: { status: TransportationStatus }) {
  const label = TRANSPORTATION_STATUS_LABELS[status] ?? status;
  const color: StatusChipColor = TRANSPORTATION_STATUS_COLORS[status] ?? 'default';
  return <Chip label={label} color={color} size="small" />;
}

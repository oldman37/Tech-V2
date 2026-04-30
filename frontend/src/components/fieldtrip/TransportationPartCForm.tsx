/**
 * TransportationPartCForm
 *
 * Transportation Director view for Part C.
 * Shows full Step 1 + Step 2 summary, Part B (principal approval) badge,
 * and the Part C approval/denial form when the request is in PENDING_TRANSPORTATION.
 */

import { useState } from 'react';
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
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon      from '@mui/icons-material/Cancel';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
import type {
  AdditionalDestination,
  ApproveTransportationDto,
  FieldTripTransportationRequest,
  TransportationType,
} from '../../types/fieldTrip.types';
import {
  TRANSPORTATION_STATUS_LABELS as STATUS_LABELS,
  TRANSPORTATION_STATUS_COLORS,
  TRANSPORTATION_TYPE_LABELS,
} from '../../types/fieldTrip.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  tripId:    string;
  transport: FieldTripTransportationRequest;
  isOwner:   boolean;
  onUpdated: (req: FieldTripTransportationRequest) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransportationPartCForm({ tripId, transport, isOwner, onUpdated }: Props) {
  const trip     = transport.fieldTripRequest;
  const approvals = trip?.approvals ?? [];

  // Part B: check if the principal/supervisor has approved the parent trip
  const principalApproval = approvals.find(
    (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
  );

  // Part C form state
  const [transportationType, setTransportationType] = useState<TransportationType | ''>('');
  const [transportationCost, setTransportationCost] = useState('');
  const [notes, setNotes]                           = useState('');
  const [denyDialogOpen, setDenyDialogOpen]         = useState(false);
  const [denialReason, setDenialReason]             = useState('');
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState<string | null>(null);

  const canActOnPartC =
    !isOwner &&
    transport.status === 'PENDING_TRANSPORTATION' &&
    !!principalApproval;

  const handleApprove = async () => {
    if (!transportationType) {
      setError('Please select the transportation type before approving.');
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const dto: ApproveTransportationDto = {
        transportationType: transportationType as TransportationType,
        transportationCost: transportationCost ? parseFloat(transportationCost) : null,
        notes:              notes.trim() || null,
      };
      const result = await fieldTripTransportationService.approve(tripId, dto);
      onUpdated(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!denialReason.trim()) return;
    try {
      setError(null);
      setLoading(true);
      const result = await fieldTripTransportationService.deny(tripId, {
        reason: denialReason.trim(),
        notes:  notes.trim() || null,
      });
      onUpdated(result);
      setDenyDialogOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deny');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 1 summary (read-only)
  // ---------------------------------------------------------------------------

  const tripDateStr = trip
    ? new Date(trip.tripDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      })
    : '—';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statusLabel = STATUS_LABELS[transport.status];
  const statusColor = TRANSPORTATION_STATUS_COLORS[transport.status];

  return (
    <Box>
      {/* ── Status banner ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="medium">Transportation Request Status:</Typography>
        <Chip label={statusLabel} color={statusColor} />
      </Box>

      {/* ── Part B badge ── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Part B — Building Principal Approval</Typography>
        {principalApproval ? (
          <Chip
            icon={<CheckCircleIcon />}
            label={`Approved by ${principalApproval.actedByName} on ${new Date(principalApproval.actedAt).toLocaleDateString('en-US')}`}
            color="success"
            variant="outlined"
          />
        ) : (
          <Chip
            label="Pending — Principal has not yet approved the field trip"
            color="warning"
            variant="outlined"
          />
        )}
      </Box>

      {/* ── Step 1 summary ── */}
      {trip && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>Step 1 — Field Trip Details</Typography>
          <Grid container spacing={1.5}>
            {[
              ['School', trip.schoolBuilding],
              ['Sponsor / Teacher', trip.teacherName],
              ['Trip Date', tripDateStr],
              ['Grade / Group', trip.gradeClass],
              ['# Students', String(trip.studentCount)],
              ['Departure Time', trip.departureTime],
              ['Return Time', trip.returnTime],
              ['Destination', trip.destination],
              trip.destinationAddress ? ['Destination Address', trip.destinationAddress] : null,
              ['Purpose', trip.purpose],
            ]
              .filter((x): x is string[] => x !== null)
              .map(([label, value]) => (
                <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                  <Typography variant="body2">{value}</Typography>
                </Grid>
              ))}
          </Grid>
        </Paper>
      )}

      {/* ── Part A summary ── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Part A — Transportation Request Detail</Typography>
        <Grid container spacing={1.5}>
          {[
            ['Buses Required', String(transport.busCount)],
            ['Chaperones', String(transport.chaperoneCount)],
            ['District Driver', transport.needsDriver ? 'Yes' : 'No'],
            !transport.needsDriver && transport.driverName ? ['Driver Name', transport.driverName] : null,
            ['Loading Location', transport.loadingLocation],
            ['Loading Time', transport.loadingTime],
            transport.arriveFirstDestTime ? ['Arrive First Destination', transport.arriveFirstDestTime] : null,
            transport.leaveLastDestTime   ? ['Leave Last Destination', transport.leaveLastDestTime]     : null,
          ]
            .filter((x): x is string[] => x !== null)
            .map(([label, value]) => (
              <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="body2">{value}</Typography>
              </Grid>
            ))}

          {(transport.additionalDestinations as AdditionalDestination[] | null)?.length ? (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Additional Destination Stops
              </Typography>
              {(transport.additionalDestinations as AdditionalDestination[]).map((d, i) => (
                <Typography key={i} variant="body2">
                  {i + 1}. {d.name}{d.arriveTime ? ` — Arrive: ${d.arriveTime}` : ''}{d.leaveTime ? ` / Leave: ${d.leaveTime}` : ''}
                </Typography>
              ))}
            </Grid>
          ) : null}

          {transport.tripItinerary && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary" display="block">Trip Itinerary</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{transport.tripItinerary}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* ── Results (APPROVED or DENIED) ── */}
      {transport.status === 'TRANSPORTATION_APPROVED' && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <strong>Transportation Approved</strong>
          {transport.transportationType && (
            <> — {TRANSPORTATION_TYPE_LABELS[transport.transportationType]}</>
          )}
          {transport.transportationCost != null && (
            <> — Assessed cost: ${Number(transport.transportationCost).toFixed(2)}</>
          )}
          {transport.transportationNotes && (
            <><br />{transport.transportationNotes}</>
          )}
          {transport.approvedBy && (
            <><br />Approved by {transport.approvedBy.displayName ?? `${transport.approvedBy.firstName} ${transport.approvedBy.lastName}`}</>
          )}
        </Alert>
      )}

      {transport.status === 'TRANSPORTATION_DENIED' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <strong>Transportation Denied</strong>
          {transport.denialReason && <><br /><strong>Reason:</strong> {transport.denialReason}</>}
          {transport.transportationNotes && <><br />{transport.transportationNotes}</>}
          {transport.deniedBy && (
            <><br />Denied by {transport.deniedBy.displayName ?? `${transport.deniedBy.firstName} ${transport.deniedBy.lastName}`}</>
          )}
        </Alert>
      )}

      {/* ── Part C form (Transportation Director only, when PENDING) ── */}
      {canActOnPartC && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Part C — Transportation Office Action</Typography>
          <Divider sx={{ mb: 2 }} />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <FormControl required>
                <FormLabel>Type of Transportation</FormLabel>
                <RadioGroup
                  value={transportationType}
                  onChange={(e) => setTransportationType(e.target.value as TransportationType)}
                >
                  {(Object.entries(TRANSPORTATION_TYPE_LABELS) as [TransportationType, string][]).map(
                    ([value, label]) => (
                      <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
                    ),
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Assessed Transportation Cost (optional)"
                type="number"
                value={transportationCost}
                onChange={(e) => setTransportationCost(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Approval Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                inputProps={{ maxLength: 3000 }}
              />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={loading ? <CircularProgress size={18} /> : <CheckCircleIcon />}
              onClick={handleApprove}
              disabled={loading || !transportationType}
            >
              Approve Transportation
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              onClick={() => setDenyDialogOpen(true)}
              disabled={loading}
            >
              Deny
            </Button>
          </Box>
        </Paper>
      )}

      {/* Pending but user is owner */}
      {isOwner && transport.status === 'PENDING_TRANSPORTATION' && (
        <Alert severity="info">
          Your transportation request has been submitted and is awaiting Transportation Director review.
        </Alert>
      )}

      {/* Pending but Part B not complete (approver, can't act yet) */}
      {!isOwner && transport.status === 'PENDING_TRANSPORTATION' && !principalApproval && (
        <Alert severity="warning">
          Part C cannot be processed until the Building Principal approves the field trip (Part B).
        </Alert>
      )}

      {/* ── Deny dialog ── */}
      <Dialog open={denyDialogOpen} onClose={() => setDenyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deny Transportation Request</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Denying transportation for the trip to{' '}
            <strong>{trip?.destination ?? 'this destination'}</strong>.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason for Denial"
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            required
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDenyDialogOpen(false); setDenialReason(''); }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeny}
            disabled={loading || !denialReason.trim()}
          >
            {loading ? <CircularProgress size={20} /> : 'Confirm Denial'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

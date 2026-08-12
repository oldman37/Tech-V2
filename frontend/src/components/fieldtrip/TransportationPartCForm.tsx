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
import EditIcon        from '@mui/icons-material/Edit';
import ReplayIcon      from '@mui/icons-material/Replay';
import HistoryIcon     from '@mui/icons-material/History';
import { useIsMobile } from '../../hooks/useResponsive';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
import type {
  AdditionalDestination,
  ApproveTransportationDto,
  EditApprovedTransportationDto,
  FieldTripTransportationRequest,
  TransportationHistoryAction,
  TransportationType,
} from '../../types/fieldTrip.types';
import {
  TRANSPORTATION_STATUS_LABELS as STATUS_LABELS,
  TRANSPORTATION_STATUS_COLORS,
  TRANSPORTATION_TYPE_LABELS,
  PART_C_TRANSPORTATION_TYPE_LABELS,
} from '../../types/fieldTrip.types';

// ---------------------------------------------------------------------------
// Approval history display helpers
// ---------------------------------------------------------------------------

const HISTORY_ACTION_LABELS: Record<TransportationHistoryAction, string> = {
  APPROVED:     'Approved',
  DENIED:       'Denied',
  EDITED:       'Edited',
  EMAIL_RESENT: 'Email resent to submitter',
};

const HISTORY_FIELD_LABELS: Record<string, string> = {
  transportationType:     'Transportation Type',
  transportationCost:     'Assessed Cost',
  transportationBusCount: 'Number of Buses',
  driverNames:            'Driver Names',
  transportationNotes:    'Notes',
};

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

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
  const isMobile = useIsMobile();
  const trip     = transport.fieldTripRequest;
  const approvals = trip?.approvals ?? [];

  // Part B: check if the principal/supervisor has approved the parent trip
  const principalApproval = approvals.find(
    (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
  );

  // Part C cannot be processed until the field trip has cleared its entire own
  // approval chain (Supervisor -> Asst. Director of Schools -> Director of
  // Schools -> Finance Director) and reached APPROVED — matches the backend
  // gate in fieldTripTransportation.service.ts approve()/deny().
  const tripFullyApproved = trip?.status === 'APPROVED';

  // Part C form state
  const [transportationType, setTransportationType] = useState<TransportationType | ''>('DISTRICT_BUS');
  const [transportationCost, setTransportationCost] = useState('');
  const [transportationBusCount, setTransportationBusCount] = useState(String(transport.busCount));
  const [driverNames, setDriverNames]               = useState<string[]>(Array(transport.busCount).fill(''));
  const [notes, setNotes]                           = useState('');
  const [denyDialogOpen, setDenyDialogOpen]         = useState(false);
  const [denialReason, setDenialReason]             = useState('');
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState<string | null>(null);

  // Edit-after-approval mode — reuses the same Part C fields/form, but pre-filled
  // from the current approved values and submitted to the edit endpoint instead.
  const [editMode, setEditMode] = useState(false);

  // Resend-email state
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError]   = useState<string | null>(null);

  const isBusTrip = transportationType === 'DISTRICT_BUS';

  const handleDriverNameChange = (index: number, value: string) => {
    setDriverNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  // Keep the driver-name fields in sync with the bus count while editing —
  // the backend requires driverNames.length === transportationBusCount.
  const handleBusCountChange = (value: string) => {
    setTransportationBusCount(value);
    const count = parseInt(value, 10);
    if (Number.isNaN(count) || count < 0) return;
    setDriverNames((prev) => {
      const next = [...prev];
      next.length = count;
      return next.fill('', prev.length);
    });
  };

  const canActOnPartC =
    !isOwner &&
    transport.status === 'PENDING_TRANSPORTATION' &&
    tripFullyApproved;

  const canEdit   = !isOwner && transport.status === 'TRANSPORTATION_APPROVED';
  const canResend = !isOwner && (transport.status === 'TRANSPORTATION_APPROVED' || transport.status === 'TRANSPORTATION_DENIED');

  const handleEnterEditMode = () => {
    setTransportationType(transport.transportationType ?? 'DISTRICT_BUS');
    setTransportationCost(transport.transportationCost != null ? String(transport.transportationCost) : '');
    setTransportationBusCount(String(transport.transportationBusCount ?? transport.busCount));
    const currentDrivers = transport.driverNames?.length
      ? transport.driverNames
      : Array(transport.transportationBusCount ?? transport.busCount).fill('');
    setDriverNames(currentDrivers);
    setNotes(transport.transportationNotes ?? '');
    setError(null);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setError(null);
  };

  const handleApprove = async () => {
    if (!transportationType) {
      setError('Please select the transportation type before approving.');
      return;
    }
    if (isBusTrip && !transportationBusCount) {
      setError('Please enter the number of buses.');
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const cleanedDriverNames = driverNames.map((n) => n.trim()).filter(Boolean);
      const dto: ApproveTransportationDto | EditApprovedTransportationDto = {
        transportationType:     transportationType as TransportationType,
        transportationCost:     transportationCost ? parseFloat(transportationCost) : null,
        transportationBusCount: isBusTrip && transportationBusCount
          ? parseInt(transportationBusCount, 10)
          : null,
        driverNames: isBusTrip && cleanedDriverNames.length > 0
          ? cleanedDriverNames
          : null,
        notes: notes.trim() || null,
      };
      const result = editMode
        ? await fieldTripTransportationService.editApproved(tripId, dto)
        : await fieldTripTransportationService.approve(tripId, dto);
      onUpdated(result);
      setEditMode(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${editMode ? 'save changes' : 'approve'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendStatus('sending');
      setResendError(null);
      const result = await fieldTripTransportationService.resendEmail(tripId);
      onUpdated(result);
      setResendStatus('sent');
    } catch (err: unknown) {
      setResendStatus('error');
      setResendError(err instanceof Error ? err.message : 'Failed to resend email');
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
        ) : trip?.status === 'APPROVED' ? (
          <Chip
            label="Bypassed — Submitted by supervisor/principal"
            color="default"
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
          )}          {transport.transportationBusCount != null && (
            <><br />Buses: {transport.transportationBusCount}</>
          )}
          {transport.driverNames?.length ? (
            <><br />Drivers: {transport.driverNames.join(', ')}</>
          ) : null}          {transport.transportationNotes && (
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

      {/* ── Edit / Resend actions (Transportation Director/Secretary, after a decision) ── */}
      {!editMode && (canEdit || canResend) && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {canEdit && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={handleEnterEditMode}
            >
              Edit Transportation Details
            </Button>
          )}
          {canResend && (
            <Button
              variant="outlined"
              size="small"
              startIcon={resendStatus === 'sending' ? <CircularProgress size={16} /> : <ReplayIcon />}
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
            >
              Resend Email to Submitter
            </Button>
          )}
        </Box>
      )}
      {resendStatus === 'sent' && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setResendStatus('idle')}>
          Email resent to the submitter.
        </Alert>
      )}
      {resendStatus === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setResendStatus('idle')}>
          {resendError}
        </Alert>
      )}

      {/* ── Part C form (Transportation Director only, when PENDING — or editing an approved record) ── */}
      {(canActOnPartC || editMode) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            {editMode ? 'Edit Transportation Details' : 'Part C — Transportation Office Action'}
          </Typography>
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
                  {(Object.entries(PART_C_TRANSPORTATION_TYPE_LABELS) as [TransportationType, string][]).map(
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

            {/* Number of Buses — pre-filled from Part A on initial approval (read-only);
                editable while editing an already-approved record. */}
            {isBusTrip && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Number of Buses Assigned"
                  type="number"
                  value={transportationBusCount}
                  onChange={editMode ? (e) => handleBusCountChange(e.target.value) : undefined}
                  InputProps={{ readOnly: !editMode }}
                  inputProps={{ min: 1 }}
                  helperText={editMode ? undefined : 'Pre-filled from trip request'}
                />
              </Grid>
            )}

            {/* Driver Names — one per bus */}
            {isBusTrip && driverNames.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Driver Names
                </Typography>
                <Grid container spacing={2}>
                  {driverNames.map((name, idx) => (
                    <Grid key={idx} size={{ xs: 12, sm: 6, md: 4 }}>
                      <TextField
                        fullWidth
                        required
                        label={`Bus ${idx + 1} Driver`}
                        value={name}
                        onChange={(e) => handleDriverNameChange(idx, e.target.value)}
                        inputProps={{ maxLength: 200 }}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            )}

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
              {editMode ? 'Save Changes' : 'Approve Transportation'}
            </Button>
            {editMode ? (
              <Button variant="outlined" onClick={handleCancelEdit} disabled={loading}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                onClick={() => setDenyDialogOpen(true)}
                disabled={loading}
              >
                Deny
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {/* Pending but user is owner */}
      {isOwner && transport.status === 'PENDING_TRANSPORTATION' && (
        <Alert severity="info">
          Your transportation request has been submitted and is awaiting Transportation Director review.
        </Alert>
      )}

      {/* Pending but the field trip hasn't cleared its own approval chain yet (approver, can't act yet) */}
      {!isOwner && transport.status === 'PENDING_TRANSPORTATION' && !tripFullyApproved && (
        <Alert severity="warning">
          Transportation cannot be processed until the field trip has received final approval.
        </Alert>
      )}

      {/* ── Approval history timeline (Transportation Director/Secretary) ── */}
      {!isOwner && !!transport.approvalHistory?.length && (
        <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <HistoryIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">Approval History</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[...transport.approvalHistory].reverse().map((entry) => (
              <Box key={entry.id} sx={{ pl: 1.5, borderLeft: '3px solid', borderColor: 'divider' }}>
                <Typography variant="body2">
                  <strong>{HISTORY_ACTION_LABELS[entry.action] ?? entry.action}</strong>
                  {' by '}{entry.performedByName}
                  {' — '}
                  {new Date(entry.performedAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </Typography>
                {entry.notes && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {entry.notes}
                  </Typography>
                )}
                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <Box component="ul" sx={{ m: '4px 0 0', pl: 2 }}>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                      <Typography key={field} component="li" variant="caption" color="text.secondary">
                        {HISTORY_FIELD_LABELS[field] ?? field}: {formatHistoryValue(diff.from)} → {formatHistoryValue(diff.to)}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* ── Deny dialog ── */}
      <Dialog open={denyDialogOpen} onClose={() => setDenyDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
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

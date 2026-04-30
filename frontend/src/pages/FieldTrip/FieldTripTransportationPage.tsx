/**
 * FieldTripTransportationPage
 *
 * Step 2 of the field trip workflow — Transportation Request form.
 * Adaptively shows the Part A form (create/edit) or a status view, and
 * the Part C form for Transportation Directors when the request is pending.
 *
 * Route: /field-trips/:id/transportation
 */

import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Paper,
  Typography,
} from '@mui/material';
import ArrowBackIcon      from '@mui/icons-material/ArrowBack';
import EditIcon           from '@mui/icons-material/Edit';
import { fieldTripService }               from '../../services/fieldTrip.service';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
import type {
  FieldTripRequest,
  FieldTripTransportationRequest,
  TransportationStatus,
} from '../../types/fieldTrip.types';
import {
  TRANSPORTATION_STATUS_LABELS,
  TRANSPORTATION_STATUS_COLORS,
} from '../../types/fieldTrip.types';
import { TransportationRequestForm } from '../../components/fieldtrip/TransportationRequestForm';
import { TransportationPartCForm }   from '../../components/fieldtrip/TransportationPartCForm';
import { useAuthStore }              from '../../store/authStore';

export function FieldTripTransportationPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();

  // ── Fetch parent field trip ──
  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useQuery<FieldTripRequest>({
    queryKey: ['field-trips', id],
    queryFn:  () => fieldTripService.getById(id!),
    enabled:  !!id,
  });

  // ── Fetch transportation request (null = not yet created) ──
  const {
    data: transport,
    isLoading: transportLoading,
  } = useQuery<FieldTripTransportationRequest | null>({
    queryKey: ['field-trips', id, 'transportation'],
    queryFn:  () => fieldTripTransportationService.getByTripId(id!),
    enabled:  !!id,
  });

  const isLoading = tripLoading || transportLoading;

  const isOwner = trip?.submittedById === user?.id;
  const isDraft = transport?.status === 'DRAFT';

  // ── Query invalidation callbacks ──
  function handleSaved(req: FieldTripTransportationRequest) {
    queryClient.setQueryData(['field-trips', id, 'transportation'], req);
  }

  function handleSubmitted(req: FieldTripTransportationRequest) {
    queryClient.setQueryData(['field-trips', id, 'transportation'], req);
    queryClient.invalidateQueries({ queryKey: ['field-trips', id] });
  }

  function handlePartCUpdated(req: FieldTripTransportationRequest) {
    queryClient.setQueryData(['field-trips', id, 'transportation'], req);
    queryClient.invalidateQueries({ queryKey: ['field-trips', 'transportation', 'pending'] });
  }

  // ── Render guards ──
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (tripError || !trip) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load field trip request.</Alert>
      </Box>
    );
  }

  if (!trip.transportationNeeded) {
    return (
      <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/field-trips/${id}`)} sx={{ mb: 2 }}>
          Back to Field Trip
        </Button>
        <Alert severity="info">
          This field trip does not require transportation. No Step 2 form is needed.
        </Alert>
      </Box>
    );
  }

  const showForm    = isOwner && (!transport || isDraft);
  const showPartC   = !isOwner && transport?.status === 'PENDING_TRANSPORTATION';
  const showSummary = !!transport && !isDraft;

  const statusLabel = transport
    ? TRANSPORTATION_STATUS_LABELS[transport.status as TransportationStatus]
    : null;
  const statusColor = transport
    ? TRANSPORTATION_STATUS_COLORS[transport.status as TransportationStatus]
    : undefined;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/field-trips/${id}`)}>
          Back to Field Trip
        </Button>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mt: 1 }}>
          <Box>
            <Typography variant="h4" component="h1">Step 2 — Transportation Request</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {trip.destination} — {new Date(trip.tripDate).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </Typography>
          </Box>
          {statusLabel && statusColor && (
            <Chip label={statusLabel} color={statusColor} sx={{ mt: 1 }} />
          )}
        </Box>
      </Box>

      {/* Part A form (create or edit DRAFT) */}
      {showForm && (
        <Paper sx={{ p: 3 }}>
          <TransportationRequestForm
            tripId={id!}
            trip={trip}
            existing={transport ?? null}
            onSaved={handleSaved}
            onSubmitted={handleSubmitted}
          />
        </Paper>
      )}

      {/* Status view for the submitter once submitted */}
      {isOwner && showSummary && (
        <Box>
          <Alert
            severity={
              transport!.status === 'TRANSPORTATION_APPROVED' ? 'success'
                : transport!.status === 'TRANSPORTATION_DENIED' ? 'error'
                : 'info'
            }
            sx={{ mb: 2 }}
          >
            {statusLabel}
            {transport!.status === 'TRANSPORTATION_DENIED' && transport!.denialReason && (
              <><br /><strong>Reason:</strong> {transport!.denialReason}</>
            )}
            {transport!.status === 'TRANSPORTATION_APPROVED' && transport!.transportationType && (
              <>
                {' — '}Transportation type: {transport!.transportationType?.replace(/_/g, ' ')}
                {transport!.transportationCost != null && (
                  ` — Assessed cost: $${Number(transport!.transportationCost).toFixed(2)}`
                )}
              </>
            )}
          </Alert>
          {transport!.status === 'TRANSPORTATION_DENIED' && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => queryClient.setQueryData(['field-trips', id, 'transportation'], {
                ...transport!, status: 'DRAFT',
              })}
            >
              Edit &amp; Resubmit
            </Button>
          )}
        </Box>
      )}

      {/* Part C form for Transportation Director */}
      {(showPartC || (transport && !isOwner &&
        (transport.status === 'TRANSPORTATION_APPROVED' || transport.status === 'TRANSPORTATION_DENIED')
      )) && (
        <TransportationPartCForm
          tripId={id!}
          transport={transport!}
          isOwner={isOwner}
          onUpdated={handlePartCUpdated}
        />
      )}
    </Box>
  );
}

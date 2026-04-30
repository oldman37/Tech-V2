/**
 * FieldTripTransportationDetail
 *
 * Transportation Director view for a specific transportation request.
 * Shows the full Part A summary plus the Part C approval/denial form.
 * Typically navigated to from the Transportation Pending queue in FieldTripApprovalPage.
 *
 * Route: /field-trips/:id/transportation/view
 */

import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { fieldTripService }               from '../../services/fieldTrip.service';
import { fieldTripTransportationService } from '../../services/fieldTripTransportation.service';
import type {
  FieldTripRequest,
  FieldTripTransportationRequest,
} from '../../types/fieldTrip.types';
import { TransportationPartCForm } from '../../components/fieldtrip/TransportationPartCForm';
import { useAuthStore }            from '../../store/authStore';

export function FieldTripTransportationDetail() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();

  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useQuery<FieldTripRequest>({
    queryKey: ['field-trips', id],
    queryFn:  () => fieldTripService.getById(id!),
    enabled:  !!id,
  });

  const {
    data: transport,
    isLoading: transportLoading,
    error: transportError,
  } = useQuery<FieldTripTransportationRequest | null>({
    queryKey: ['field-trips', id, 'transportation'],
    queryFn:  () => fieldTripTransportationService.getByTripId(id!),
    enabled:  !!id,
  });

  const isLoading = tripLoading || transportLoading;
  const isOwner   = trip?.submittedById === user?.id;

  function handlePartCUpdated(req: FieldTripTransportationRequest) {
    queryClient.setQueryData(['field-trips', id, 'transportation'], req);
    queryClient.invalidateQueries({ queryKey: ['field-trips', 'transportation', 'pending'] });
  }

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

  if (transportError || transport === null) {
    return (
      <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
          Back
        </Button>
        <Alert severity="info">
          No transportation request has been submitted for this field trip yet.
        </Alert>
      </Box>
    );
  }

  if (!transport) {
    return null;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <Typography variant="h4" component="h1" sx={{ mt: 1 }}>
          Transportation Request — Part C Review
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          {trip.destination} —{' '}
          {new Date(trip.tripDate).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
          })}
        </Typography>
      </Box>

      <TransportationPartCForm
        tripId={id!}
        transport={transport}
        isOwner={isOwner}
        onUpdated={handlePartCUpdated}
      />
    </Box>
  );
}

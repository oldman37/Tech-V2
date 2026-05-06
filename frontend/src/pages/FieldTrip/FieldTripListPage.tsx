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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useIsMobile } from '../../hooks/useResponsive';
import { fieldTripService } from '../../services/fieldTrip.service';
import type { FieldTripRequest, FieldTripStatus, StatusChipColor } from '../../types/fieldTrip.types';
import {
  FIELD_TRIP_STATUS_LABELS,
  FIELD_TRIP_STATUS_COLORS,
} from '../../types/fieldTrip.types';
import { ResponsiveTable, Column } from '../../components/responsive';

const columns: Column<FieldTripRequest>[] = [
  {
    key: 'destination',
    label: 'Destination',
    isPrimary: true,
    render: (row) => row.destination,
  },
  {
    key: 'teacherName',
    label: 'Teacher',
    isSecondary: true,
    hideOnMobile: true,
  },
  {
    key: 'tripDate',
    label: 'Trip Date',
    render: (row) =>
      new Date(row.tripDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
  },
  {
    key: 'schoolBuilding',
    label: 'School / Building',
    hideOnMobile: true,
  },
  {
    key: 'studentCount',
    label: 'Students',
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <StatusChip status={row.status as FieldTripStatus} />,
  },
  {
    key: 'submittedAt',
    label: 'Submitted',
    hideOnMobile: true,
    render: (row) =>
      row.submittedAt
        ? new Date(row.submittedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
        : '—',
  },
];

export function FieldTripListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Typography variant="h4" component="h1">
          My Field Trip Requests
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/field-trips/new')}
          sx={{ ...(isMobile && { width: '100%' }) }}
        >
          New Request
        </Button>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load field trip requests. Please refresh the page.
        </Alert>
      )}

      {/* Table / Cards */}
      <ResponsiveTable<FieldTripRequest>
        columns={columns}
        rows={sortedTrips}
        getRowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/field-trips/${row.id}`)}
        loading={isLoading}
        emptyMessage='No field trip requests found. Click "New Request" to create one.'
      />
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

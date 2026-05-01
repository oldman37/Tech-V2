/**
 * TransportationRequestsPage
 *
 * Lists transportation requests. Staff see only their own; secretary/admin see all.
 * Provides navigation to create a new request or view an existing one.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { transportationRequestService } from '../../services/transportationRequest.service';
import type {
  TransportationRequest,
  TransportationRequestStatus,
} from '../../types/transportationRequest.types';
import {
  TRANSPORTATION_REQUEST_STATUS_LABELS,
  TRANSPORTATION_REQUEST_STATUS_COLORS,
} from '../../types/transportationRequest.types';

export function TransportationRequestsPage() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromFilter,   setFromFilter]   = useState<string>('');
  const [toFilter,     setToFilter]     = useState<string>('');

  const filters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(fromFilter   ? { from: fromFilter }     : {}),
    ...(toFilter     ? { to: toFilter }         : {}),
  };

  const { data: requests, isLoading, error } = useQuery<TransportationRequest[]>({
    queryKey: ['transportation-requests', filters],
    queryFn:  () => transportationRequestService.list(filters),
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Transportation Requests
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/transportation-requests/new')}
        >
          New Request
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="PENDING">Pending Review</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="DENIED">Denied</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Trip Date From"
          type="date"
          value={fromFilter}
          onChange={(e) => setFromFilter(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="Trip Date To"
          type="date"
          value={toFilter}
          onChange={(e) => setToFilter(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        {(statusFilter || fromFilter || toFilter) && (
          <Button
            variant="text"
            onClick={() => { setStatusFilter(''); setFromFilter(''); setToFilter(''); }}
          >
            Clear Filters
          </Button>
        )}
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
          Failed to load transportation requests. Please refresh the page.
        </Alert>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Trip Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>School</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Group / Activity</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Sponsor</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Buses</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Students</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Submitter</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(!requests || requests.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No transportation requests found.
                  </TableCell>
                </TableRow>
              )}
              {requests?.map((req) => {
                const status = req.status as TransportationRequestStatus;
                return (
                  <TableRow
                    key={req.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/transportation-requests/${req.id}`)}
                  >
                    <TableCell>
                      {new Date(req.tripDate).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{req.school}</TableCell>
                    <TableCell>{req.groupOrActivity}</TableCell>
                    <TableCell>{req.sponsorName}</TableCell>
                    <TableCell>{req.busCount}</TableCell>
                    <TableCell>{req.studentCount}</TableCell>
                    <TableCell>
                      {req.submittedBy
                        ? (req.submittedBy.displayName ?? `${req.submittedBy.firstName} ${req.submittedBy.lastName}`)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={TRANSPORTATION_REQUEST_STATUS_LABELS[status] ?? status}
                        color={TRANSPORTATION_REQUEST_STATUS_COLORS[status] ?? 'default'}
                        size="small"
                      />
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

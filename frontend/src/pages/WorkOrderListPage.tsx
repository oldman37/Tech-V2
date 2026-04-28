/**
 * WorkOrderListPage
 *
 * Paginated, filterable list of all work orders.
 * - Filter bar: search, department, status, priority
 * - MUI Table with clickable rows → WorkOrderDetailPage
 * - "New Work Order" button → NewWorkOrderPage
 * - WorkOrderStatusChip + WorkOrderPriorityChip for visual status/priority
 *
 * Route: /work-orders
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { useQuery } from '@tanstack/react-query';
import { useWorkOrderList } from '@/hooks/queries/useWorkOrders';
import { useLocations } from '@/hooks/queries/useLocations';
import { WorkOrderStatusChip } from '@/components/work-orders/WorkOrderStatusChip';
import { WorkOrderPriorityChip } from '@/components/work-orders/WorkOrderPriorityChip';
import settingsService from '@/services/settingsService';
import { queryKeys } from '@/lib/queryKeys';
import AccessDenied from '@/pages/AccessDenied';
import type { WorkOrderQuery, WorkOrderDepartment, WorkOrderStatus, WorkOrderPriority } from '@/types/work-order.types';

// ─── helpers ────────────────────────────────────────────────────────────────

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkOrderListPage() {
  const navigate = useNavigate();

  // Filter state
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<WorkOrderDepartment | ''>('');
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [priority, setPriority] = useState<WorkOrderPriority | ''>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch system settings for current fiscal year badge
  const { data: settingsData } = useQuery({
    queryKey: queryKeys.settingsCurrent,
    queryFn: settingsService.getCurrent,
  });

  // Fetch locations for school filter dropdown
  const { data: locations = [] } = useLocations();

  // Fetch distinct work order fiscal years for dropdown
  const { data: workOrderFiscalYears = [] } = useQuery({
    queryKey: queryKeys.fiscalYear.workOrderList(),
    queryFn: settingsService.getDistinctWorkOrderFiscalYears,
  });

  // Determine active fiscal year (explicit filter OR current year default)
  const activeFiscalYear = fiscalYearFilter || settingsData?.currentFiscalYear || '';

  // Build query params
  const filters: WorkOrderQuery = {
    page: page + 1,
    limit: rowsPerPage,
    ...(search.trim() && { search: search.trim() }),
    ...(department && { department }),
    ...(status && { status }),
    ...(priority && { priority }),
    ...(locationFilter && { officeLocationId: locationFilter }),
    ...(activeFiscalYear && { fiscalYear: activeFiscalYear }),
  };

  const { data, isLoading, error } = useWorkOrderList(filters);

  // If the main data query returned 403 — user lacks permissions
  const is403 = (error as any)?.response?.status === 403;
  if (is403) return <AccessDenied />;

  const rows = data?.items ?? [];
  const totalCount = data?.total ?? 0;

  const handleRowClick = (id: string) => navigate(`/work-orders/${id}`);

  return (
    <Box sx={{ p: 3 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ConfirmationNumberIcon color="primary" />
          <Typography variant="h5" fontWeight={600}>
            Work Orders
          </Typography>
          {settingsData?.currentFiscalYear && (
            <Chip
              icon={<CalendarTodayIcon />}
              label={`FY ${activeFiscalYear || settingsData.currentFiscalYear}`}
              size="small"
              color="default"
              variant="outlined"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/work-orders/new')}
        >
          New Work Order
        </Button>
      </Box>

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search work orders…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 220 }}
        />

        <Select
          size="small"
          displayEmpty
          value={department}
          onChange={(e) => { setDepartment(e.target.value as WorkOrderDepartment | ''); setPage(0); }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All Departments</MenuItem>
          <MenuItem value="TECHNOLOGY">Technology</MenuItem>
          <MenuItem value="MAINTENANCE">Maintenance</MenuItem>
        </Select>

        <Select
          size="small"
          displayEmpty
          value={status}
          onChange={(e) => { setStatus(e.target.value as WorkOrderStatus | ''); setPage(0); }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          <MenuItem value="OPEN">Open</MenuItem>
          <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
          <MenuItem value="ON_HOLD">On Hold</MenuItem>
          <MenuItem value="RESOLVED">Resolved</MenuItem>
          <MenuItem value="CLOSED">Closed</MenuItem>
        </Select>

        <Select
          size="small"
          displayEmpty
          value={priority}
          onChange={(e) => { setPriority(e.target.value as WorkOrderPriority | ''); setPage(0); }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All Priorities</MenuItem>
          <MenuItem value="LOW">Low</MenuItem>
          <MenuItem value="MEDIUM">Medium</MenuItem>
          <MenuItem value="HIGH">High</MenuItem>
          <MenuItem value="URGENT">Urgent</MenuItem>
        </Select>

        <Select
          size="small"
          displayEmpty
          value={locationFilter}
          onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All Schools</MenuItem>
          {locations
            .filter((loc) => loc.isActive)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
            ))}
        </Select>

        {workOrderFiscalYears.length > 0 && (
          <Select
            size="small"
            displayEmpty
            value={activeFiscalYear}
            onChange={(e) => { setFiscalYearFilter(e.target.value); setPage(0); }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All Years</MenuItem>
            {workOrderFiscalYears.map((fy) => (
              <MenuItem key={fy} value={fy}>{fy}</MenuItem>
            ))}
          </Select>
        )}
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load work orders. Please try again.
        </Alert>
      )}

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Work Order #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Priority</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Assigned To</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton variant="text" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      No work orders found
                    </TableCell>
                  </TableRow>
                )
              : rows.map((workOrder) => (
                  <TableRow
                    key={workOrder.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleRowClick(workOrder.id)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color="primary">
                        {workOrder.workOrderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={workOrder.department === 'TECHNOLOGY' ? 'Tech' : 'Maint.'}
                        size="small"
                        color={workOrder.department === 'TECHNOLOGY' ? 'primary' : 'secondary'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <WorkOrderStatusChip status={workOrder.status} />
                    </TableCell>
                    <TableCell>
                      <WorkOrderPriorityChip priority={workOrder.priority} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {workOrder.officeLocation?.name ?? '—'}
                        {workOrder.room ? ` / ${workOrder.room.name}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {workOrder.assignedTo?.displayName ?? workOrder.assignedTo?.email ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {formatDate(workOrder.createdAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={totalCount}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 25, 50, 100]}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      />
    </Box>
  );
}

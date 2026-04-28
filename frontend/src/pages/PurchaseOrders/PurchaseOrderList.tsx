/**
 * PurchaseOrderList
 *
 * Main list view for purchase orders/requisitions.
 * - Tabs filter by user context (All, My Requests, Pending Approval, Issued)
 * - Filter row with status select, date pickers, search
 * - MUI Table with status Chips and action buttons
 * - Pagination
 * - Shows "New Requisition" button only for level 2+
 */

import { useState, useMemo } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { usePurchaseOrderList } from '@/hooks/queries/usePurchaseOrders';
import { useRequisitionsPermLevel } from '@/hooks/queries/useRequisitionsPermLevel';
import settingsService from '@/services/settingsService';
import { queryKeys } from '@/lib/queryKeys';
import AccessDenied from '@/pages/AccessDenied';
import { useAuthStore } from '@/store/authStore';
import {
  PO_STATUSES,
  PO_STATUS_LABELS,
  PO_STATUS_CHIP_COLOR,
  type PurchaseOrderFilters,
  type POStatus,
  type WorkflowType,
} from '@/types/purchaseOrder.types';

// ─── Tab definitions ────────────────────────────────────────────────────────

type TabKey = 'all' | 'mine' | 'pending' | 'food_service' | 'fs_approval' | 'issued';

interface TabDef {
  key: TabKey;
  label: string;
  minPermLevel: number;
  /** When provided, the tab is only visible if this returns true (in addition to minPermLevel). */
  visibleFn?: (flags: { isFoodServiceSupervisor: boolean; isFoodServicePoEntry: boolean; isDosApprover: boolean }) => boolean;
}

const TABS: TabDef[] = [
  { key: 'all',          label: 'All',                   minPermLevel: 3 },
  { key: 'mine',         label: 'My Requests',            minPermLevel: 1 },
  { key: 'pending',      label: 'Pending My Approval',    minPermLevel: 3 },
  {
    key: 'food_service',
    label: 'Food Service',
    minPermLevel: 1,
    visibleFn: (f) => f.isFoodServiceSupervisor || f.isFoodServicePoEntry,
  },
  {
    key: 'fs_approval',
    label: 'Food Service Approval',
    minPermLevel: 1,
    visibleFn: (f) => f.isDosApprover,
  },
  { key: 'issued',       label: 'Issued',                 minPermLevel: 1 },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const { permLevel, isAdmin } = useRequisitionsPermLevel();
  const { user } = useAuthStore();

  // Food service role flags
  const isFoodServiceSupervisor = user?.permLevels?.isFoodServiceSupervisor ?? false;
  const isFoodServicePoEntry = user?.permLevels?.isFoodServicePoEntry ?? false;
  const isDosApprover = user?.permLevels?.isDosApprover ?? false;

  // Fetch system settings for fiscal year info
  const { data: settings } = useQuery({
    queryKey: queryKeys.settingsCurrent,
    queryFn: settingsService.getCurrent,
  });

  // Fetch distinct fiscal years for filter dropdown
  const { data: fiscalYears = [] } = useQuery({
    queryKey: queryKeys.fiscalYear.list(),
    queryFn: settingsService.getDistinctFiscalYears,
  });

  // Determine if the fiscal year is expired
  const isFiscalYearExpired = useMemo(() => {
    if (!settings?.fiscalYearEnd) return false;
    return new Date() > new Date(settings.fiscalYearEnd);
  }, [settings?.fiscalYearEnd]);

  // Filter / pagination state
  const [tab, setTab] = useState<TabKey>('mine');
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');
  const [workflowTypeFilter, setWorkflowTypeFilter] = useState<WorkflowType | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Build API filters from tab + explicit filters
  const buildFilters = (): PurchaseOrderFilters => {
    const f: PurchaseOrderFilters = {
      page: page + 1,
      limit: rowsPerPage,
    };
    if (statusFilter) f.status = statusFilter;
    if (search.trim()) f.search = search.trim();
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    // Fiscal year filter
    const activeFY = fiscalYearFilter || settings?.currentFiscalYear;
    if (activeFY) f.fiscalYear = activeFY;
    if (workflowTypeFilter) f.workflowType = workflowTypeFilter;
    // Tab "mine" — always scoped to the current user's own submitted POs
    if (tab === 'mine') f.onlyMine = true;
    // Tab "issued" filters to po_issued
    if (tab === 'issued' && !statusFilter) f.status = 'po_issued';
    // Tab "pending" — let the backend determine which POs this user can approve
    if (tab === 'pending') {
      f.pendingMyApproval = true;
    }
    // Tab "food_service" — show all food service POs
    if (tab === 'food_service') {
      f.workflowType = 'food_service';
    }
    // Tab "fs_approval" — food service POs awaiting DOS approval
    if (tab === 'fs_approval') {
      f.workflowType = 'food_service';
      if (!statusFilter) f.status = 'supervisor_approved';
    }
    return f;
  };

  const { data, isLoading, error } = usePurchaseOrderList(buildFilters());

  // If the main data query returned 403 — user lacks permissions
  const is403 = (error as any)?.response?.status === 403;
  if (is403) return <AccessDenied />;

  const rows = data?.items ?? [];
  const totalCount = data?.total ?? 0;

  // Visible tabs based on permission level and role flags
  const visibleTabs = TABS.filter((t) => {
    if (permLevel < t.minPermLevel) return false;
    if (t.visibleFn && !t.visibleFn({ isFoodServiceSupervisor, isFoodServicePoEntry, isDosApprover })) return false;
    return true;
  });

  // Ensure selected tab is still visible after permission resolves
  const activeTab = visibleTabs.find((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key ?? 'mine';

  const handleTabChange = (_: React.SyntheticEvent, newTab: TabKey) => {
    setTab(newTab);
    setPage(0);
  };

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(e.target.value));
    setPage(0);
  };

  const formatCurrency = (val: string | number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Box sx={{ p: 3 }}>
      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Purchase Orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage requisitions and purchase orders
          </Typography>
        </Box>
        {permLevel >= 2 && (
          <Tooltip
            title={isFiscalYearExpired ? 'New requisitions are disabled — fiscal year rollover required' : ''}
          >
            <span>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/purchase-orders/new')}
                disabled={isFiscalYearExpired}
              >
                New Requisition
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* ── Fiscal Year Expired Banner ── */}
      {isFiscalYearExpired && settings?.currentFiscalYear && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The fiscal year {settings.currentFiscalYear} ended on{' '}
          {new Date(settings.fiscalYearEnd!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          New requisitions are disabled until an administrator starts the new fiscal year.
          {isAdmin && (
            <Button
              component={RouterLink}
              to="/admin/new-fiscal-year"
              size="small"
              sx={{ ml: 2 }}
            >
              Start New Fiscal Year &rarr;
            </Button>
          )}
        </Alert>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
        {visibleTabs.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      {/* ── Filters ── */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search PO#, title, program…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 240 }}
          />
          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as POStatus | ''); setPage(0); }}
            displayEmpty
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {PO_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>{PO_STATUS_LABELS[s]}</MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            type="date"
            label="From"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 150 }}
          />
          <Select
            size="small"
            value={fiscalYearFilter || settings?.currentFiscalYear || ''}
            onChange={(e) => { setFiscalYearFilter(e.target.value); setPage(0); }}
            displayEmpty
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All Years</MenuItem>
            {fiscalYears.map((fy) => (
              <MenuItem key={fy} value={fy}>{fy}</MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={workflowTypeFilter}
            onChange={(e) => { setWorkflowTypeFilter(e.target.value as WorkflowType | ''); setPage(0); }}
            displayEmpty
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="standard">Standard</MenuItem>
            <MenuItem value="food_service">Food Service</MenuItem>
          </Select>
          {(statusFilter || search || dateFrom || dateTo || fiscalYearFilter || workflowTypeFilter) && (
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setStatusFilter('');
                setSearch('');
                setDateFrom('');
                setDateTo('');
                setFiscalYearFilter('');
                setWorkflowTypeFilter('');
                setPage(0);
              }}
            >
              Clear Filters
            </Button>
          )}
        </Box>
      </Paper>

      {/* ── Error ── */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load purchase orders'}
        </Alert>
      )}

      {/* ── Table ── */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Req #</TableCell>
              <TableCell>PO #</TableCell>
              <TableCell>Title / Description</TableCell>
              <TableCell>Requested By</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              // Loading skeleton — 5 rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No purchase orders found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((po) => (
                <TableRow key={po.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {po.reqNumber ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {po.poNumber ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {po.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {po.User.firstName} {po.User.lastName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{po.vendors?.name ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip
                        label={PO_STATUS_LABELS[po.status]}
                        color={PO_STATUS_CHIP_COLOR[po.status]}
                        size="small"
                      />
                      {po.workflowType === 'food_service' && (
                        <Chip
                          label="Food Service"
                          size="small"
                          variant="outlined"
                          color="secondary"
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(po.createdAt)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatCurrency(po.amount)}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!isLoading && totalCount > 0 && (
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        )}
      </TableContainer>
    </Box>
  );
}

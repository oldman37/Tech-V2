import { useState } from 'react';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useAutoFocusSearch } from '@/hooks/useAutoFocusSearch';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import Chip from '@mui/material/Chip';
import { ResponsiveTable, MobileFilterBar } from '../../components/responsive';
import type { Column } from '../../components/responsive';
import { useIsMobile } from '../../hooks/useResponsive';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';
import { repairTicketService } from '../../services/repairTicket.service';
import { damageIncidentService } from '../../services/damageIncident.service';
import inventoryService from '../../services/inventory.service';
import { RepairStatusStepper } from '../../components/DeviceManagement/RepairStatusStepper';
import type { RepairTicket } from '../../types/repairTicket.types';
import type { InventoryItem } from '../../types/inventory.types';
import type { RepairTicketStatus, DamageType, DamageSeverity } from '@mgspe/shared-types';

const STATUSES: RepairTicketStatus[] = ['pending', 'sent_to_vendor', 'returned', 'unrepairable', 'cancelled'];

// Same option lists the Create Incident wizard's damage-details step uses.
const DAMAGE_TYPES: { value: DamageType; label: string }[] = [
  { value: 'broken_screen',    label: 'Broken Screen' },
  { value: 'liquid_damage',    label: 'Liquid Damage' },
  { value: 'physical_damage',  label: 'Physical Damage' },
  { value: 'missing_keys',     label: 'Missing Keys' },
  { value: 'missing_charger',  label: 'Missing Charger' },
  { value: 'missing_device',   label: 'Missing Device' },
  { value: 'other',            label: 'Other' },
];

const SEVERITIES: { value: DamageSeverity; label: string }[] = [
  { value: 'minor',      label: 'Minor' },
  { value: 'moderate',   label: 'Moderate' },
  { value: 'severe',     label: 'Severe' },
  { value: 'total_loss', label: 'Total Loss' },
];

const getEquipLabel = (opt: InventoryItem) =>
  `${opt.assetTag} — ${opt.name}${opt.brand ? ` (${opt.brand.name})` : ''}`;

// Local date components, not toISOString() — the latter computes "today" in UTC
// and can roll forward a day for evening entries in western-hemisphere timezones.
const todayLocalDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface NewTicketForm {
  equipmentId: string;
  damageDate:  string;
  damageType:  DamageType;
  severity:    DamageSeverity;
  description: string;
}

const emptyForm = (): NewTicketForm => ({
  equipmentId: '',
  damageDate:  todayLocalDate(),
  damageType:  'physical_damage',
  severity:    'moderate',
  description: '',
});

export default function RepairTicketsPage() {
  const navigate     = useNavigate();
  const goBack = useGoBack();
  const queryClient  = useQueryClient();

  const isMobile = useIsMobile();

  // Filter state — lives in the URL so Back from a ticket returns to this view
  const searchRef = useAutoFocusSearch();
  const [filters, setFilters] = useFilterParams({
    status: '',
    search: '',
    page:   '0',
    rows:   '25',
  });

  const statusFilter = filters.status;
  const search       = filters.search;
  const page         = Number(filters.page) || 0;
  const pageSize     = Number(filters.rows) || 25;

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [form,            setForm]            = useState<NewTicketForm>(emptyForm);
  const [formError,       setFormError]       = useState<string | null>(null);

  // Device picker state — mirrors the incident wizard's equipment Autocomplete.
  const [equipOption,     setEquipOption]     = useState<InventoryItem | null>(null);
  const [equipSearch,     setEquipSearch]     = useState('');
  const [equipInputValue, setEquipInputValue] = useState('');

  const resetForm = () => {
    setForm(emptyForm());
    setEquipOption(null);
    setEquipSearch('');
    setEquipInputValue('');
  };

  const { data: equipData, isLoading: equipLoading } = useQuery({
    queryKey: ['equipment-search-repair-ticket', equipSearch],
    queryFn:  () => inventoryService.getInventory({ search: equipSearch, limit: 50, isDisposed: false }),
    enabled:  dialogOpen && equipSearch.length >= 2,
    staleTime: 30_000,
  });
  const equipOptions: InventoryItem[] = equipData?.items ?? [];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['repair-tickets', { page, pageSize, statusFilter, search }],
    queryFn:  () =>
      repairTicketService.getAll({
        page:   page + 1,
        limit:  pageSize,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  // Mirrors IncidentWizard's accidental-damage path, minus the user and minus its
  // Device Exchange step — there is no checked-out assignment to exchange here.
  const createMutation = useMutation({
    mutationFn: async () => {
      const incident = await damageIncidentService.create({
        equipmentId: form.equipmentId,
        // Local-noon append: a date-only ISO string parses as UTC midnight, which
        // rolls back to the previous local day in any timezone behind UTC.
        damageDate:  new Date(form.damageDate + 'T12:00:00').toISOString(),
        damageType:  form.damageType,
        severity:    form.severity,
        description: form.description || undefined,
        intent:      'accidental',
        autoCreateRepairTicket: false,
        autoCreateInvoice:      false,
      });
      const ticket = await repairTicketService.create({
        equipmentId:      incident.equipmentId!,
        damageIncidentId: incident.id,
      });
      await damageIncidentService.updateWorkflowStep(incident.id, { workflowStep: 'PENDING_REPAIR' });
      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repair-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['damage-incidents'] });
      setDialogOpen(false);
      resetForm();
      setFormError(null);
    },
    onError: () => setFormError('Failed to create ticket. Please try again.'),
  });

  const columns: Column<RepairTicket>[] = [
    {
      key:       'ticketNumber',
      label:     'Ticket #',
      isPrimary: true,
      render:    (t) => (
        <Typography variant="body2" fontFamily="monospace">{t.ticketNumber}</Typography>
      ),
    },
    {
      key:         'equipment',
      label:       'Device',
      isSecondary: true,
      render:      (t) => (
        <span>{t.equipment ? `${t.equipment.assetTag} — ${t.equipment.name}` : t.equipmentId}</span>
      ),
    },
    {
      key:    'vendor',
      label:  'Vendor',
      render: (t) => <span>{t.vendor?.name ?? '—'}</span>,
    },
    {
      key:    'status',
      label:  'Status',
      width:  400,
      render: (t) => isMobile ? (
        <Chip
          label={t.status.replace(/_/g, ' ')}
          size="small"
          sx={{ textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}
        />
      ) : (
        <Box sx={{ py: 0.5 }}>
          <RepairStatusStepper status={t.status} />
        </Box>
      ),
    },
    {
      key:          'sentForRepairAt',
      label:        'Sent',
      hideOnMobile: true,
      render:       (t) =>
        t.sentForRepairAt
          ? new Date(t.sentForRepairAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—',
    },
    {
      key:          'expectedReturnDate',
      label:        'Expected Return',
      hideOnMobile: true,
      render:       (t) =>
        t.expectedReturnDate
          ? new Date(t.expectedReturnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—',
    },
    {
      key:          'repairCost',
      label:        'Repair Cost',
      hideOnMobile: true,
      render:       (t) => (t.repairCost ? `$${t.repairCost}` : '—'),
    },
    {
      key:    'actions',
      label:  '',
      render: (t) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); navigate(`/device-management/repair-tickets/${t.id}`); }}>
          View
        </Button>
      ),
    },
  ];

  const activeFilterCount = statusFilter ? 1 : 0;
  const rows = data?.items ?? [];

  return (
    <Box sx={{ p: { xs: 1, sm: 3 } }}>
      <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ mb: 2 }}>
        Back
      </Button>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Repair Tickets</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ ...(isMobile && { width: '100%' }) }}
        >
          Create Ticket
        </Button>
      </Box>

      {/* Filter bar */}
      {isMobile ? (
        <Box sx={{ mb: 2 }}>
          <MobileFilterBar
            searchValue={search}
            onSearchChange={(v) => { setFilters({ search: v, page: '0' }); }}
            filterCount={activeFilterCount}
            onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
            searchPlaceholder="Search tickets…"
          />
          {filterDrawerOpen && (
            <Paper sx={{ p: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Select
                  size="small"
                  displayEmpty
                  value={statusFilter}
                  onChange={(e) => { setFilters({ status: e.target.value, page: '0' }); }}
                  fullWidth
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  {STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
                </Select>
                <Button size="small" variant="text" onClick={() => { setFilters({ status: '', page: '0' }); }}>
                  Clear Filters
                </Button>
              </Box>
            </Paper>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            inputRef={searchRef}
            size="small"
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => { setFilters({ search: e.target.value, page: '0' }); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => { setFilters({ status: e.target.value, page: '0' }); }}>
              <MenuItem value="">All</MenuItem>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      )}

      {isError && <Alert severity="error" sx={{ mb: 2 }}>Failed to load repair tickets.</Alert>}

      <ResponsiveTable
        columns={columns}
        rows={rows}
        getRowKey={(t) => t.id}
        onRowClick={(t) => navigate(`/device-management/repair-tickets/${t.id}`)}
        loading={isLoading}
        emptyMessage="No repair tickets found."
      />
      <TablePagination
        component="div"
        count={data?.total ?? 0}
        page={page}
        onPageChange={(_, p) => setFilters({ page: String(p) })}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => { setFilters({ rows: e.target.value, page: '0' }); }}
        rowsPerPageOptions={[10, 25, 50]}
      />

      {/* Create Ticket Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); resetForm(); setFormError(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Repair Ticket</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            For a device that isn't currently checked out to anyone. For a device checked out
            to a user, use the Create Incident workflow instead.
          </Typography>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            {/* Device */}
            <Autocomplete<InventoryItem>
              options={equipOptions}
              loading={equipLoading}
              value={equipOption}
              inputValue={equipInputValue}
              onInputChange={(_, v, reason) => {
                setEquipInputValue(v);
                if (reason === 'input') setEquipSearch(v);
                else if (reason === 'clear') setEquipSearch('');
              }}
              getOptionLabel={getEquipLabel}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, opt) => {
                setEquipOption(opt);
                setForm((f) => ({ ...f, equipmentId: opt?.id ?? '' }));
              }}
              noOptionsText={equipSearch.length < 2 ? 'Type 2+ characters to search' : 'No devices found'}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Device *"
                  size="small"
                  helperText="Search by asset tag or name"
                />
              )}
            />

            {/* Date of Damage */}
            <TextField
              label="Date of Damage *"
              type="date"
              size="small"
              value={form.damageDate}
              onChange={(e) => setForm((f) => ({ ...f, damageDate: e.target.value }))}
              inputProps={{ max: todayLocalDate() }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            {/* Damage Type */}
            <FormControl size="small" required>
              <InputLabel>Damage Type</InputLabel>
              <Select
                value={form.damageType}
                label="Damage Type"
                onChange={(e) => setForm((f) => ({ ...f, damageType: e.target.value as DamageType }))}
              >
                {DAMAGE_TYPES.map(({ value, label }) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Severity */}
            <FormControl size="small" required>
              <InputLabel>Severity</InputLabel>
              <Select
                value={form.severity}
                label="Severity"
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as DamageSeverity }))}
              >
                {SEVERITIES.map(({ value, label }) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Description */}
            <TextField
              label="Description"
              size="small"
              multiline
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              inputProps={{ maxLength: 2000 }}
              helperText={`${form.description.length}/2000`}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDialogOpen(false); resetForm(); setFormError(null); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={createMutation.isPending || !form.equipmentId || !form.damageDate}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

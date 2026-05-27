import { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { incidentService } from '../../services/incident.service';
import type { DamageIncident } from '../../types/damageIncident.types';
import type { IncidentWorkflowStep, IncidentIntent } from '@mgspe/shared-types';

// ---------------------------------------------------------------------------
// Chip helpers
// ---------------------------------------------------------------------------

const INTENT_COLORS: Record<IncidentIntent, 'info' | 'error'> = {
  accidental:  'info',
  intentional: 'error',
};

const WORKFLOW_STEP_COLORS: Partial<Record<IncidentWorkflowStep | string, 'warning' | 'default' | 'primary' | 'secondary' | 'success' | 'error'>> = {
  DAMAGE_REPORTED: 'warning',
  PENDING_REPAIR:  'warning',
  IN_REPAIR:       'warning',
  REPAIR_COMPLETE: 'primary',
  INVOICED:        'secondary',
  CLOSED:          'success',
};

function IntentChip({ intent }: { intent: IncidentIntent | null }) {
  if (!intent) return <Chip size="small" label="—" />;
  return (
    <Chip
      size="small"
      label={intent.charAt(0).toUpperCase() + intent.slice(1)}
      color={INTENT_COLORS[intent]}
    />
  );
}

function WorkflowStepChip({ step }: { step: IncidentWorkflowStep | null }) {
  if (!step) return <Chip size="small" label="—" />;
  const label = step.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Chip
      size="small"
      label={label}
      color={WORKFLOW_STEP_COLORS[step] ?? 'default'}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncidentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // If arriving with prefill params (e.g. from Checkout page), redirect straight to wizard
  useEffect(() => {
    const equipmentId  = searchParams.get('equipmentId');
    const userId       = searchParams.get('userId');
    const assignmentId = searchParams.get('assignmentId');
    if (equipmentId || userId) {
      const params = new URLSearchParams();
      if (equipmentId)  params.set('equipmentId',  equipmentId);
      if (userId)       params.set('userId',        userId);
      if (assignmentId) params.set('assignmentId',  assignmentId);
      navigate(`/incidents/new?${params.toString()}`, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError } = useQuery({
    queryKey: ['incidents-page', { page, pageSize }],
    queryFn:  () =>
      incidentService.getIncidents({
        page:  page + 1,
        limit: pageSize,
      }),
  });

  const rows = (data?.items ?? []).filter((r) => {
    if (!search) return true;
    const q   = search.toLowerCase();
    const num = r.incidentNumber?.toLowerCase() ?? '';
    const tag = r.equipment?.assetTag?.toLowerCase() ?? '';
    const usr = r.user ? `${r.user.firstName} ${r.user.lastName}`.toLowerCase() : '';
    return num.includes(q) || tag.includes(q) || usr.includes(q);
  });

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Incidents</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/incidents/new')}
        >
          New Incident
        </Button>
      </Box>

      {/* Search */}
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by incident #, asset tag, or user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 360 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert severity="error">Failed to load incidents.</Alert>
      ) : (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Incident #</strong></TableCell>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Device / User</strong></TableCell>
                  <TableCell><strong>Damage Date</strong></TableCell>
                  <TableCell><strong>Intent</strong></TableCell>
                  <TableCell><strong>Workflow Step</strong></TableCell>
                  <TableCell><strong>Created</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No incidents found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row: DamageIncident) => (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/incidents/${row.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.incidentNumber ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.equipment ? '💻 Device' : '👤 User'}
                          size="small"
                          color={row.equipment ? 'info' : 'secondary'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {row.equipment
                          ? <Typography variant="body2">{row.equipment.assetTag} — {row.equipment.name}</Typography>
                          : row.user
                            ? <Typography variant="body2">{row.user.firstName} {row.user.lastName}</Typography>
                            : <Typography variant="body2" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {row.damageDate
                            ? new Date(row.damageDate).toLocaleDateString()
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IntentChip intent={row.intent} />
                      </TableCell>
                      <TableCell>
                        <WorkflowStepChip step={row.workflowStep} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      )}
    </Box>
  );
}

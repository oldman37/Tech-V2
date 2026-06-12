import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon    from '@mui/icons-material/Refresh';
import PlayArrowIcon  from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  INTUNE_ACTION_LABELS,
  INTUNE_ACTION_RISK,
  type IntuneAction,
  type BulkDeviceActionResponse,
  type IntuneDevicePreview,
} from '@mgspe/shared-types';
import { intuneService } from '../../services/intuneService';
import { modelsService, type EquipmentModel } from '../../services/referenceDataService';
import DeviceActionConfirmDialog from '../../components/DeviceActionConfirmDialog';
import IntuneScanWizardTab, { type IntuneHistoryEntry, loadHistory } from './IntuneScanWizardTab';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RISK_CHIP_COLOUR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  low:      'success',
  medium:   'warning',
  high:     'error',
  critical: 'error',
};

const STATUS_CHIP_COLOUR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  success:      'success',
  failed:       'error',
  partial:      'warning',
  not_enrolled: 'default',
};

/** Destructive actions that remove devices entirely — recorded in history but cannot be re-run */
const DESTRUCTIVE_ACTIONS = new Set<IntuneAction>(['fullDecommission', 'deleteDevice', 'removeEntra']);
const ACTIONS = Object.keys(INTUNE_ACTION_LABELS) as IntuneAction[];

function DeviceTable({ devices, maxHeight = 400 }: { devices: IntuneDevicePreview[]; maxHeight?: number }) {
  return (
    <TableContainer sx={{ maxHeight }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Device Name</TableCell>
            <TableCell>Asset Tag</TableCell>
            <TableCell>Serial</TableCell>
            <TableCell>OS</TableCell>
            <TableCell>Intune</TableCell>
            <TableCell>Last Sync</TableCell>
            <TableCell>Compliance</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((d, idx) => (
            <TableRow key={d.intuneDeviceId || d.serialNumber || idx}>
              <TableCell>{d.displayName ?? 'â€”'}</TableCell>
              <TableCell>{d.assetTag ?? 'â€”'}</TableCell>
              <TableCell>{d.serialNumber || 'â€”'}</TableCell>
              <TableCell>{d.operatingSystem ?? 'â€”'}</TableCell>
              <TableCell>
                <Chip
                  label={d.enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Not Enrolled'}
                  size="small"
                  color={d.enrollmentStatus === 'enrolled' ? 'success' : 'default'}
                />
              </TableCell>
              <TableCell>
                {d.lastSyncDateTime ? new Date(d.lastSyncDateTime).toLocaleString() : 'â€”'}
              </TableCell>
              <TableCell>{d.complianceState ?? 'â€”'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Compact table that reveals every device captured in a history entry. */
function HistoryDeviceTable({ devices }: { devices: IntuneHistoryEntry['devices'] }) {
  return (
    <TableContainer sx={{ maxHeight: 320 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Device Name</TableCell>
            <TableCell>Asset Tag</TableCell>
            <TableCell>Serial</TableCell>
            <TableCell>OS</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((d, idx) => (
            <TableRow key={d.intuneDeviceId || d.serialNumber || idx}>
              <TableCell>{d.displayName ?? '—'}</TableCell>
              <TableCell>{d.assetTag ?? '—'}</TableCell>
              <TableCell>{d.serialNumber || '—'}</TableCell>
              <TableCell>{d.operatingSystem ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ActionSelector({
  selectedAction,
  setSelectedAction,
  keepUserData,
  setKeepUserData,
  canExecute,
  isPending,
  onExecute,
}: {
  selectedAction: IntuneAction | '';
  setSelectedAction: (a: IntuneAction | '') => void;
  keepUserData: boolean;
  setKeepUserData: (v: boolean) => void;
  canExecute: boolean;
  isPending: boolean;
  onExecute: () => void;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end" flexWrap="wrap">
      <Select
        size="small"
        value={selectedAction}
        onChange={(e) => setSelectedAction(e.target.value as IntuneAction | '')}
        displayEmpty
        sx={{ minWidth: 260 }}
      >
        <MenuItem value="" disabled>Choose an actionâ€¦</MenuItem>
        {ACTIONS.map((a) => (
          <MenuItem key={a} value={a}>
            <Stack direction="row" spacing={1} alignItems="center">
              <span>{INTUNE_ACTION_LABELS[a]}</span>
              <Chip
                label={INTUNE_ACTION_RISK[a]}
                size="small"
                color={RISK_CHIP_COLOUR[INTUNE_ACTION_RISK[a]]}
                sx={{ height: 18, fontSize: 10 }}
              />
            </Stack>
          </MenuItem>
        ))}
      </Select>

      {selectedAction === 'cleanWindowsDevice' && (
        <FormControlLabel
          control={
            <Switch
              checked={keepUserData}
              onChange={(e) => setKeepUserData(e.target.checked)}
              color="warning"
            />
          }
          label="Keep user files"
        />
      )}

      <Button
        variant="contained"
        color="error"
        startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
        disabled={!canExecute || isPending}
        onClick={onExecute}
      >
        Execute Action
      </Button>
    </Stack>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function IntuneDeviceActionsPage() {
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [historyEntries,   setHistoryEntries]   = useState<IntuneHistoryEntry[]>(() => loadHistory());
  const [reloadKey,        setReloadKey]        = useState(0);
  const [preloadedDevices, setPreloadedDevices] = useState<{
    devices:  IntuneDevicePreview[];
    notFound: string[];
  } | null>(null);
  const [preloadedAction,  setPreloadedAction]  = useState<IntuneAction | undefined>(undefined);
  // Per-card action selector state for the History tab (keyed by log ID)
  const [historyActions,   setHistoryActions]   = useState<Record<string, IntuneAction | ''>>({});
  // Per-card "view devices" expand state for the History tab (keyed by log ID)
  const [expandedDevices,  setExpandedDevices]  = useState<Record<string, boolean>>({});

  // â”€â”€ Shared action state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedAction,    setSelectedAction]    = useState<IntuneAction | ''>('');
  const [keepUserData,      setKeepUserData]      = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [results,           setResults]           = useState<BulkDeviceActionResponse | null>(null);

  // â”€â”€ Tab 0: By Model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedModel, setSelectedModel] = useState<EquipmentModel | null>(null);

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['equipment-models', 'intune-page'],
    queryFn:  () => modelsService.getAll({ limit: 500, isActive: true }),
  });
  const models = modelsData?.items ?? [];

  const {
    data:      preview,
    isLoading: previewLoading,
    error:     previewError,
    refetch:   refetchPreview,
  } = useQuery({
    queryKey: ['intune-devices', selectedModel?.id],
    queryFn:  () => intuneService.getByModel(selectedModel!.id),
    enabled:  !!selectedModel,
  });

  const modelActionMutation = useMutation({
    mutationFn: (confirmText?: string) =>
      intuneService.executeBulkAction({
        modelId:      selectedModel!.id,
        action:       selectedAction as IntuneAction,
        confirm:      true,
        keepUserData: selectedAction === 'cleanWindowsDevice' ? keepUserData : undefined,
        confirmText,
      }),
    onSuccess: (data) => {
      setResults(data);
      setConfirmDialogOpen(false);
    },
  });

  const modelEnrolledCount = preview?.enrolledCount ?? 0;
  const canExecuteModel    =
    !!selectedModel && !!selectedAction && modelEnrolledCount > 0 && !previewLoading;
  const modelDisplayName   = selectedModel
    ? (selectedModel.brands ? `${selectedModel.brands.name} ${selectedModel.name}` : selectedModel.name)
    : '';

  const handleLoadFromHistory = (entry: IntuneHistoryEntry, chosenAction?: IntuneAction) => {
    const preload = {
      devices: entry.devices.map((d) => ({
        intuneDeviceId:        d.intuneDeviceId,
        displayName:           d.displayName,
        serialNumber:          d.serialNumber,
        assetTag:              d.assetTag,
        operatingSystem:       d.operatingSystem,
        complianceState:       null,
        lastSyncDateTime:      null,
        enrolledDateTime:      null,
        managedDeviceOwnerType: null,
        azureADDeviceId:       null,
        enrollmentStatus:      'enrolled' as const,
      })),
      notFound: [],
    };
    setPreloadedDevices(preload);
    setPreloadedAction(chosenAction);
    // Clear the selection for this card so it doesn't reappear on return
    setHistoryActions((prev) => { const next = { ...prev }; delete next[entry.id]; return next; });
    setReloadKey((k) => k + 1);
    setTab(1);
  };

  const handleRemoveHistory = (id: string) => {
    const updated = historyEntries.filter((e) => e.id !== id);
    localStorage.setItem('intune_action_history', JSON.stringify(updated));
    setHistoryEntries(updated);
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 3 } }}>
      {/* Header */}
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Intune Device Actions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Execute MDM actions via Microsoft Graph. Select a model for bulk operations, or scan
        individual device names for targeted actions.
      </Typography>

      {/* Mode tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => {
          if (v === 1 || v === 2) setHistoryEntries(loadHistory());
          setTab(v as 0 | 1 | 2);
          setResults(null);
        }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="By Device Model" />
        <Tab label="Scan / Search by Name" />
        <Tab label="History" />
      </Tabs>

      {/* â”€â”€ TAB 0: BY MODEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 0 && (
        <>
          {/* Step 1 â€” Model selection */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>1. Select Device Model</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
              <Autocomplete
                sx={{ minWidth: 320 }}
                options={models}
                loading={modelsLoading}
                getOptionLabel={(m) => m.brands ? `${m.brands.name} ${m.name}` : m.name}
                value={selectedModel}
                onChange={(_, value) => { setSelectedModel(value); setResults(null); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Device Model"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {modelsLoading ? <CircularProgress size={16} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              {selectedModel && (
                <Button size="small" startIcon={<RefreshIcon />} onClick={() => refetchPreview()} disabled={previewLoading}>
                  Refresh
                </Button>
              )}
            </Stack>
          </Paper>

          {/* Step 2 â€” Device preview */}
          {selectedModel && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>2. Device Preview</Typography>
              {previewLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading Intune statusâ€¦</Typography>
                </Box>
              )}
              {previewError && (
                <Alert severity="error">
                  Failed to load device preview. Check that Graph permissions are configured and admin consent is granted.
                </Alert>
              )}
              {preview && !previewLoading && (
                <>
                  <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} flexWrap="wrap">
                    <Chip label={`${preview.totalInInventory} in inventory`} size="small" variant="outlined" />
                    <Chip label={`${preview.enrolledCount} enrolled`}       size="small" color="success" />
                    <Chip label={`${preview.notEnrolledCount} not enrolled`} size="small" color="default" />
                  </Stack>
                  <DeviceTable devices={preview.devices} />
                </>
              )}
            </Paper>
          )}

          {/* Step 3 â€” Action */}
          {preview && preview.enrolledCount > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>3. Select Action</Typography>
              <ActionSelector
                selectedAction={selectedAction}
                setSelectedAction={setSelectedAction}
                keepUserData={keepUserData}
                setKeepUserData={setKeepUserData}
                canExecute={canExecuteModel}
                isPending={modelActionMutation.isPending}
                onExecute={() => setConfirmDialogOpen(true)}
              />
              {modelActionMutation.isError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {(modelActionMutation.error as Error)?.message ?? 'Action failed.'}
                </Alert>
              )}
            </Paper>
          )}
        </>
      )}

      {/* â”€â”€ TAB 1: SCAN WIZARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 1 && (
        <>
          <IntuneScanWizardTab
            key={reloadKey}
            initialLookupResult={preloadedDevices ?? undefined}
            initialAction={preloadedAction}
            onActionComplete={() => { setHistoryEntries(loadHistory()); setHistoryActions({}); }}
          />
          {/* Compact history panel below wizard */}
          {historyEntries.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Recent Actions
              </Typography>
              <Stack spacing={1}>
                {historyEntries.slice(0, 5).map((entry) => (
                  <Paper key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {entry.actionLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(entry.timestamp).toLocaleString()}
                          {' · '}
                          {entry.triggeredBy ?? '—'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        <Chip
                          label={`${entry.deviceCount} device${entry.deviceCount !== 1 ? 's' : ''}`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip label={`✓ ${entry.succeeded}`} size="small" color="success" />
                        {entry.failed > 0 && (
                          <Chip label={`✗ ${entry.failed}`} size="small" color="error" />
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}

      {/* ── TAB 2: HISTORY ─────────────────────────────────────────────────────────────── */}
      {tab === 2 && (
        <Box>
          {historyEntries.length === 0 ? (
            <Alert severity="info">
              No history yet. Complete an action in the Scan wizard to see it here.
            </Alert>
          ) : (
            <Stack spacing={2}>
              {historyEntries.map((entry) => (
                <Paper key={entry.id} sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {entry.actionLabel}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(entry.timestamp).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Triggered by: {entry.triggeredBy ?? '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Log ID: {entry.id}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip
                        label={`${entry.deviceCount} device${entry.deviceCount !== 1 ? 's' : ''}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip label={`✓ ${entry.succeeded} succeeded`} size="small" color="success" />
                      {entry.failed > 0 && (
                        <Chip label={`✗ ${entry.failed} failed`} size="small" color="error" />
                      )}
                    </Stack>
                  </Stack>
                  {/* View devices — expandable list of every device in this action */}
                  <Button
                    size="small"
                    startIcon={expandedDevices[entry.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() =>
                      setExpandedDevices((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))
                    }
                    sx={{ mt: 1 }}
                  >
                    {expandedDevices[entry.id]
                      ? 'Hide devices'
                      : `View ${entry.deviceCount} device${entry.deviceCount !== 1 ? 's' : ''}`}
                  </Button>
                  <Collapse in={!!expandedDevices[entry.id]} unmountOnExit>
                    <Box sx={{ mt: 1 }}>
                      <HistoryDeviceTable devices={entry.devices} />
                    </Box>
                  </Collapse>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    flexWrap="wrap"
                    sx={{ mt: 1.5 }}
                  >
                    {!DESTRUCTIVE_ACTIONS.has(entry.action) && (
                      <>
                        <Select
                          size="small"
                          displayEmpty
                          value={historyActions[entry.id] ?? ''}
                          onChange={(e) =>
                            setHistoryActions((prev) => ({
                              ...prev,
                              [entry.id]: e.target.value as IntuneAction | '',
                            }))
                          }
                          sx={{ minWidth: 230 }}
                        >
                          <MenuItem value="" disabled>Choose an action…</MenuItem>
                          {ACTIONS.map((a) => (
                            <MenuItem key={a} value={a}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <span>{INTUNE_ACTION_LABELS[a]}</span>
                                <Chip
                                  label={INTUNE_ACTION_RISK[a]}
                                  size="small"
                                  color={RISK_CHIP_COLOUR[INTUNE_ACTION_RISK[a]]}
                                  sx={{ height: 18, fontSize: 10 }}
                                />
                              </Stack>
                            </MenuItem>
                          ))}
                        </Select>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={!historyActions[entry.id]}
                          onClick={() =>
                            handleLoadFromHistory(
                              entry,
                              historyActions[entry.id] as IntuneAction,
                            )
                          }
                        >
                          Run on these devices
                        </Button>
                      </>
                    )}
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => handleRemoveHistory(entry.id)}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* â”€â”€ RESULTS (shared) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {results && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Results</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} flexWrap="wrap">
            <Chip label={`Total: ${results.total}`}              size="small" variant="outlined" />
            <Chip label={`Succeeded: ${results.succeeded}`}      size="small" color="success" />
            <Chip label={`Failed: ${results.failed}`}            size="small" color={results.failed > 0 ? 'error' : 'default'} />
            {results.partial > 0 && <Chip label={`Partial: ${results.partial}`} size="small" color="warning" />}
            <Chip label={`Not enrolled: ${results.notEnrolled}`} size="small" color="default" />
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device Name / Asset Tag</TableCell>
                  <TableCell>Serial</TableCell>
                  <TableCell>Status</TableCell>
                  {results.action === 'fullDecommission' && (
                    <>
                      <TableCell>Delete</TableCell>
                      <TableCell>Autopilot</TableCell>
                      <TableCell>Entra</TableCell>
                    </>
                  )}
                  <TableCell>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.results.map((r, i) => (
                  <TableRow key={r.intuneDeviceId || r.serialNumber || i}>
                    <TableCell>{r.assetTag ?? r.serialNumber ?? 'â€”'}</TableCell>
                    <TableCell>{r.serialNumber || 'â€”'}</TableCell>
                    <TableCell>
                      <Chip label={r.status} size="small" color={STATUS_CHIP_COLOUR[r.status] ?? 'default'} />
                    </TableCell>
                    {results.action === 'fullDecommission' && (
                      <>
                        <TableCell>{r.stepResults?.deleteDevice   ?? 'â€”'}</TableCell>
                        <TableCell>{r.stepResults?.removeAutopilot ?? 'â€”'}</TableCell>
                        <TableCell>{r.stepResults?.removeEntra     ?? 'â€”'}</TableCell>
                      </>
                    )}
                    <TableCell sx={{ color: 'error.main', fontSize: 12 }}>{r.error ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Confirmation dialog */}
      {!!selectedAction && (
        <DeviceActionConfirmDialog
          open={confirmDialogOpen}
          action={selectedAction as IntuneAction}
          modelName={modelDisplayName}
          enrolledCount={modelEnrolledCount}
          keepUserData={keepUserData}
          onConfirm={(confirmText) => modelActionMutation.mutate(confirmText)}
          onCancel={() => setConfirmDialogOpen(false)}
          isLoading={modelActionMutation.isPending}
        />
      )}
    </Box>
  );
}

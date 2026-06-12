/**
 * @deprecated Use DeviceManagement/IntuneDeviceActionsPage instead.
 * This file is kept to avoid breaking any stale imports.
 * The canonical implementation lives at DeviceManagement/IntuneDeviceActionsPage.tsx.
 */

import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Button from '@mui/material/Button';
import { useQuery, useMutation } from '@tanstack/react-query';
import { modelsService, EquipmentModel } from '../services/referenceDataService';
import { intuneService } from '../services/intuneService';
import DeviceActionConfirmDialog from '../components/DeviceActionConfirmDialog';
import {
  INTUNE_ACTION_LABELS,
  INTUNE_ACTION_RISK,
  type IntuneAction,
  type IntuneDevicePreview,
  type BulkDeviceActionResponse,
} from '@mgspe/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CHIP_COLOUR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  low:      'success',
  medium:   'warning',
  high:     'error',
  critical: 'error',
};

const ACTION_OPTIONS: IntuneAction[] = [
  'syncDevice',
  'rebootNow',
  'cleanWindowsDevice',
  'retire',
  'wipe',
  'deleteDevice',
  'removeAutopilot',
  'removeEntra',
  'fullDecommission',
];

function enrollmentBadge(device: IntuneDevicePreview) {
  return device.enrollmentStatus === 'enrolled'
    ? <Chip label="Enrolled" color="success" size="small" />
    : <Chip label="Not Enrolled" color="default" size="small" />;
}

function statusChip(status: string) {
  const map: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
    success:      'success',
    failed:       'error',
    partial:      'warning',
    not_enrolled: 'default',
  };
  return <Chip label={status.replace('_', ' ')} color={map[status] ?? 'default'} size="small" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntuneDeviceActions() {
  // --- state ---
  const [selectedModel,   setSelectedModel]   = useState<EquipmentModel | null>(null);
  const [selectedAction,  setSelectedAction]  = useState<IntuneAction>('syncDevice');
  const [keepUserData,    setKeepUserData]     = useState(false);
  const [confirmOpen,     setConfirmOpen]      = useState(false);
  const [results,         setResults]          = useState<BulkDeviceActionResponse | null>(null);
  const [snackbar,        setSnackbar]         = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // --- models list ---
  const { data: modelsData } = useQuery({
    queryKey: ['models-list'],
    queryFn:  () => modelsService.getAll({ limit: 500 }),
  });

  const models: EquipmentModel[] = modelsData?.items ?? [];

  // --- device preview ---
  const {
    data:       previewData,
    isLoading:  previewLoading,
    error:      previewError,
    refetch:    refetchPreview,
  } = useQuery({
    queryKey: ['intune-preview', selectedModel?.id],
    queryFn:  () => intuneService.getByModel(selectedModel!.id),
    enabled:  !!selectedModel,
  });

  // --- bulk action mutation ---
  const bulkMutation = useMutation({
    mutationFn: (confirmText?: string) =>
      intuneService.executeBulkAction({
        modelId:     selectedModel!.id,
        action:      selectedAction,
        confirm:     true,
        keepUserData: selectedAction === 'cleanWindowsDevice' ? keepUserData : undefined,
        confirmText:  confirmText,
      }),
    onSuccess: (data) => {
      setResults(data);
      setSnackbar({ open: true, message: `Action completed: ${data.succeeded} succeeded, ${data.failed} failed.`, severity: data.failed > 0 ? 'error' : 'success' });
      refetchPreview();
    },
    onError: () => {
      setSnackbar({ open: true, message: 'Action failed. Check console or try again.', severity: 'error' });
    },
  });

  // --- handlers ---
  const handleExecuteClick = () => setConfirmOpen(true);

  const handleConfirm = (confirmText?: string) => {
    setConfirmOpen(false);
    bulkMutation.mutate(confirmText);
  };

  const risk       = INTUNE_ACTION_RISK[selectedAction];
  const riskColour = RISK_CHIP_COLOUR[risk] ?? 'default';
  const enrolledCount = previewData?.enrolledCount ?? 0;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Intune Device Actions
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Execute bulk MDM actions against Intune-enrolled devices scoped to a device model from inventory.
        All actions are audit-logged. Destructive actions require confirmation.
      </Typography>

      {/* Step 1 — Model selector */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Step 1 — Select Device Model</Typography>
        <Autocomplete
          options={models}
          getOptionLabel={(o) => o.name}
          value={selectedModel}
          onChange={(_, v) => {
            setSelectedModel(v);
            setResults(null);
          }}
          renderInput={(params) => <TextField {...params} label="Device Model" placeholder="Search models…" />}
          sx={{ maxWidth: 480 }}
        />
      </Paper>

      {/* Step 2 — Device preview */}
      {selectedModel && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Step 2 — Preview Devices
            {previewData && (
              <Typography component="span" variant="body2" color="text.secondary" ml={1}>
                ({previewData.enrolledCount} enrolled / {previewData.notEnrolledCount} not enrolled)
              </Typography>
            )}
          </Typography>

          {previewLoading && <CircularProgress size={24} />}

          {previewError && (
            <Alert severity="error">Failed to load devices from Intune. Verify admin consent is granted for the required Graph permissions.</Alert>
          )}

          {previewData && previewData.devices.length > 0 && (
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Asset Tag</TableCell>
                    <TableCell>Serial Number</TableCell>
                    <TableCell>Device Name</TableCell>
                    <TableCell>OS</TableCell>
                    <TableCell>Intune</TableCell>
                    <TableCell>Last Sync</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewData.devices.map((d) => (
                    <TableRow key={d.serialNumber} hover>
                      <TableCell>{d.assetTag ?? '—'}</TableCell>
                      <TableCell>{d.serialNumber}</TableCell>
                      <TableCell>{d.displayName ?? '—'}</TableCell>
                      <TableCell>{d.operatingSystem ?? '—'}</TableCell>
                      <TableCell>{enrollmentBadge(d)}</TableCell>
                      <TableCell>
                        {d.lastSyncDateTime
                          ? new Date(d.lastSyncDateTime).toLocaleDateString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {previewData && previewData.devices.length === 0 && (
            <Alert severity="info">No devices found in inventory for this model.</Alert>
          )}
        </Paper>
      )}

      {/* Step 3 — Action selector */}
      {selectedModel && previewData && enrolledCount > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Step 3 — Select Action</Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as IntuneAction)}
              sx={{ minWidth: 280 }}
              size="small"
            >
              {ACTION_OPTIONS.map((a) => (
                <MenuItem key={a} value={a}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {INTUNE_ACTION_LABELS[a]}
                    <Chip
                      label={INTUNE_ACTION_RISK[a]}
                      color={RISK_CHIP_COLOUR[INTUNE_ACTION_RISK[a]] ?? 'default'}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </MenuItem>
              ))}
            </Select>

            <Chip
              label={`Risk: ${risk.toUpperCase()}`}
              color={riskColour}
              variant="outlined"
            />
          </Box>

          {selectedAction === 'cleanWindowsDevice' && (
            <FormControlLabel
              sx={{ mt: 2 }}
              control={
                <Switch
                  checked={keepUserData}
                  onChange={(e) => setKeepUserData(e.target.checked)}
                />
              }
              label="Keep user files (Fresh Start — reinstalls Windows but preserves personal data)"
            />
          )}

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color={risk === 'critical' || risk === 'high' ? 'error' : 'primary'}
              onClick={handleExecuteClick}
              disabled={bulkMutation.isPending || enrolledCount === 0}
            >
              {bulkMutation.isPending
                ? <><CircularProgress size={16} sx={{ mr: 1 }} />Executing…</>
                : `Execute on ${enrolledCount} device${enrolledCount !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Results */}
      {results && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Results</Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Chip label={`Total: ${results.total}`} />
            <Chip label={`Succeeded: ${results.succeeded}`} color="success" />
            <Chip label={`Failed: ${results.failed}`} color={results.failed > 0 ? 'error' : 'default'} />
            <Chip label={`Not Enrolled: ${results.notEnrolled}`} />
            {results.partial > 0 && <Chip label={`Partial: ${results.partial}`} color="warning" />}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Asset Tag</TableCell>
                  <TableCell>Serial</TableCell>
                  <TableCell>Status</TableCell>
                  {results.action === 'fullDecommission' && (
                    <>
                      <TableCell>Delete Intune</TableCell>
                      <TableCell>Remove Autopilot</TableCell>
                      <TableCell>Remove Entra</TableCell>
                    </>
                  )}
                  <TableCell>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.results.map((r) => (
                  <TableRow key={r.serialNumber} hover>
                    <TableCell>{r.assetTag ?? '—'}</TableCell>
                    <TableCell>{r.serialNumber}</TableCell>
                    <TableCell>{statusChip(r.status)}</TableCell>
                    {results.action === 'fullDecommission' && (
                      <>
                        <TableCell>{r.stepResults?.deleteDevice ? statusChip(r.stepResults.deleteDevice) : '—'}</TableCell>
                        <TableCell>{r.stepResults?.removeAutopilot ? statusChip(r.stepResults.removeAutopilot) : '—'}</TableCell>
                        <TableCell>{r.stepResults?.removeEntra ? statusChip(r.stepResults.removeEntra) : '—'}</TableCell>
                      </>
                    )}
                    <TableCell sx={{ color: 'error.main', fontSize: '0.75rem' }}>{r.error ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Confirm Dialog */}
      <DeviceActionConfirmDialog
        open={confirmOpen}
        action={selectedAction}
        modelName={selectedModel?.name ?? ''}
        enrolledCount={enrolledCount}
        keepUserData={keepUserData}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        isLoading={bulkMutation.isPending}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

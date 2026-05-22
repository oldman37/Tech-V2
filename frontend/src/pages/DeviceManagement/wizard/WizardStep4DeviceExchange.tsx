import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormHelperText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deviceAssignmentService } from '../../../services/deviceAssignment.service';
import inventoryService from '../../../services/inventory.service';
import { deviceExchangeService } from '../../../services/deviceExchange.service';
import type { DeviceExchangeResponse } from '../../../services/deviceExchange.service';
import type { InventoryItem } from '../../../types/inventory.types';
import type { DamageIncident } from '../../../types/damageIncident.types';
import type { Step1Values } from './wizardSchemas';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WizardStep4DeviceExchangeProps {
  step1:            Partial<Step1Values>;
  createdIncident:  DamageIncident;
  onBack:           () => void;
  onFinish:         (incident: DamageIncident) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_OPTIONS = [
  { value: 'perfect', label: 'Perfect' },
  { value: 'good',    label: 'Good' },
  { value: 'fair',    label: 'Fair' },
  { value: 'damaged', label: 'Damaged' },
] as const;

type Condition = 'perfect' | 'good' | 'fair' | 'damaged';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WizardStep4DeviceExchange({
  step1,
  createdIncident,
  onBack,
  onFinish,
}: WizardStep4DeviceExchangeProps) {
  const queryClient = useQueryClient();

  // ── Internal phase: 'exchange' = showing forms, 'summary' = showing results ──
  const [phase, setPhase] = useState<'exchange' | 'summary'>('exchange');
  const [exchangeResult, setExchangeResult] = useState<DeviceExchangeResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Check-in form state ──────────────────────────────────────────────────
  const [skipCheckin,      setSkipCheckin]      = useState(false);
  const [returnCondition,  setReturnCondition]  = useState<Condition | ''>('');
  const [returnNotes,      setReturnNotes]      = useState('');
  const [checkinError,     setCheckinError]     = useState<string | null>(null);

  // ── Check-out form state ─────────────────────────────────────────────────
  const [skipCheckout,         setSkipCheckout]         = useState(false);
  const [deviceSearch,         setDeviceSearch]         = useState('');
  const [debouncedSearch,      setDebouncedSearch]      = useState('');
  const [selectedDevice,       setSelectedDevice]       = useState<InventoryItem | null>(null);
  const [checkoutCondition,    setCheckoutCondition]    = useState<Condition | ''>('');
  const [checkoutNotes,        setCheckoutNotes]        = useState('');
  const [checkoutError,        setCheckoutError]        = useState<string | null>(null);
  const [filterByCategory,     setFilterByCategory]     = useState(true);

  // ── Debounce device search ───────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(deviceSearch), 300);
    return () => clearTimeout(t);
  }, [deviceSearch]);

  // ── Fetch the prefill assignment (to show broken device info) ───────────
  const prefillAssignmentId = step1.assignmentId;
  const { data: prefillAssignment } = useQuery({
    queryKey: ['assignment-prefill', prefillAssignmentId],
    queryFn:  () => deviceAssignmentService.getById(prefillAssignmentId!),
    enabled:  !!prefillAssignmentId,
    staleTime: 60_000,
  });

  // ── Broken device category for filtering ────────────────────────────────
  // Fetch the broken device's full inventory record to get categoryId
  const brokenEquipmentId = step1.equipmentId;
  const { data: brokenEquipmentItem } = useQuery({
    queryKey: ['equipment-category', brokenEquipmentId],
    queryFn:  () => inventoryService.getItem(brokenEquipmentId!),
    enabled:  !!brokenEquipmentId && filterByCategory,
    staleTime: 60_000,
  });
  const categoryIdFilter = filterByCategory ? (brokenEquipmentItem?.categoryId ?? undefined) : undefined;

  // ── Search available inventory ───────────────────────────────────────────
  const { data: inventoryData, isFetching: inventoryFetching } = useQuery({
    queryKey: ['inventory-available', debouncedSearch, categoryIdFilter],
    queryFn:  () => inventoryService.getInventory({
      status:     'active',
      search:     debouncedSearch || undefined,
      categoryId: categoryIdFilter,
      limit:      20,
    }),
    enabled:  !skipCheckout,
    staleTime: 10_000,
  });
  const availableDevices = inventoryData?.items ?? [];

  // ── Exchange mutation ────────────────────────────────────────────────────
  const exchangeMutation = useMutation({
    mutationFn: () => {
      const checkin = skipCheckin ? undefined : {
        assignmentId:    prefillAssignmentId ?? (prefillAssignment?.id ?? ''),
        returnCondition: returnCondition as Condition,
        returnNotes:     returnNotes || undefined,
      };
      const checkout = skipCheckout ? undefined : {
        equipmentId:       selectedDevice!.id,
        userId:            step1.userId!,
        assigneeType:      (prefillAssignment?.assigneeType ?? 'student') as 'student' | 'staff',
        checkoutCondition: checkoutCondition as Condition,
        notes:             checkoutNotes || undefined,
      };
      return deviceExchangeService.exchange(createdIncident.id, { checkin, checkout });
    },
    onSuccess: (result) => {
      setExchangeResult(result);
      setPhase('summary');
      setApiError(null);
      queryClient.invalidateQueries({ queryKey: ['damage-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['device-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: () => {
      setApiError(
        'Device exchange failed. The incident record is saved — please complete check-in/out manually if needed.',
      );
    },
  });

  // ── Validate and submit ──────────────────────────────────────────────────
  const handleCompleteExchange = useCallback(() => {
    let valid = true;

    if (!skipCheckin) {
      if (!returnCondition) {
        setCheckinError('Return condition is required');
        valid = false;
      } else {
        setCheckinError(null);
      }
    } else {
      setCheckinError(null);
    }

    if (!skipCheckout) {
      if (!selectedDevice) {
        setCheckoutError('Select a replacement device or skip checkout');
        valid = false;
      } else if (!checkoutCondition) {
        setCheckoutError('Checkout condition is required');
        valid = false;
      } else {
        setCheckoutError(null);
      }
    } else {
      setCheckoutError(null);
    }

    if (valid) exchangeMutation.mutate();
  }, [skipCheckin, skipCheckout, returnCondition, selectedDevice, checkoutCondition, exchangeMutation]);

  const isBusy = exchangeMutation.isPending;
  const incident = createdIncident;

  // ── Summary panel ────────────────────────────────────────────────────────
  if (phase === 'summary' && exchangeResult) {
    const { checkinAssignment, checkoutAssignment } = exchangeResult;
    const finalIncident = exchangeResult.incident;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main' }} />
        <Typography variant="h6" fontWeight={600}>Incident Workflow Complete</Typography>

        {/* Incident summary */}
        <Card variant="outlined" sx={{ width: '100%', maxWidth: 480 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Incident</Typography>
            <Typography variant="body1" fontWeight={600}>{finalIncident.incidentNumber ?? '—'}</Typography>

            <Divider sx={{ my: 0.5 }} />

            <Typography variant="caption" color="text.secondary">Device</Typography>
            <Typography variant="body2">
              {finalIncident.equipment
                ? `${finalIncident.equipment.assetTag} — ${finalIncident.equipment.name}`
                : '—'}
            </Typography>

            <Divider sx={{ my: 0.5 }} />

            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Chip size="small" label="CLOSED" color="default" sx={{ alignSelf: 'flex-start' }} />
          </CardContent>
        </Card>

        {/* Exchange summary */}
        <Card variant="outlined" sx={{ width: '100%', maxWidth: 480 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Device Exchange Summary
            </Typography>

            <Divider sx={{ mb: 0.5 }} />

            <Typography variant="caption" color="text.secondary">Checked In</Typography>
            {checkinAssignment ? (
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  {checkinAssignment.equipment?.assetTag} — {checkinAssignment.equipment?.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Returned by:{' '}
                  {checkinAssignment.user
                    ? `${checkinAssignment.user.firstName} ${checkinAssignment.user.lastName}`
                    : '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Condition: {checkinAssignment.returnCondition ?? '—'}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">Skipped</Typography>
            )}

            <Divider sx={{ my: 0.5 }} />

            <Typography variant="caption" color="text.secondary">Checked Out</Typography>
            {checkoutAssignment ? (
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  {checkoutAssignment.equipment?.assetTag} — {checkoutAssignment.equipment?.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Assigned to:{' '}
                  {checkoutAssignment.user
                    ? `${checkoutAssignment.user.firstName} ${checkoutAssignment.user.lastName}`
                    : '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Condition: {checkoutAssignment.checkoutCondition}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">Skipped</Typography>
            )}
          </CardContent>
        </Card>

        <Typography variant="body2" color="text.secondary" textAlign="center">
          The incident is closed. All exchange records have been saved.
        </Typography>

        <Button
          variant="contained"
          color="primary"
          onClick={() => onFinish(finalIncident)}
          sx={{ mt: 1 }}
        >
          Finish
        </Button>
      </Box>
    );
  }

  // ── Exchange forms ────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>

      {apiError && (
        <Alert severity="error" onClose={() => setApiError(null)}>
          {apiError}
        </Alert>
      )}

      {/* Panel A — Check In Broken Device */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            ♻ Check In Broken Device
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={skipCheckin}
                onChange={(e) => { setSkipCheckin(e.target.checked); setCheckinError(null); }}
              />
            }
            label={<Typography variant="caption">Skip — already returned or N/A</Typography>}
            sx={{ mr: 0 }}
          />
        </Box>

        {!skipCheckin && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Pre-populated device / assignee info */}
            {prefillAssignment ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  size="small"
                  label={
                    prefillAssignment.equipment
                      ? `${prefillAssignment.equipment.assetTag} — ${prefillAssignment.equipment.name}`
                      : incident.equipment
                        ? `${incident.equipment.assetTag} — ${incident.equipment.name}`
                        : 'Device on record'
                  }
                  variant="outlined"
                  color="default"
                />
                {prefillAssignment.user && (
                  <Chip
                    size="small"
                    label={`${prefillAssignment.user.firstName} ${prefillAssignment.user.lastName}`}
                    variant="outlined"
                    color="primary"
                  />
                )}
              </Box>
            ) : incident.equipment ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  size="small"
                  label={`${incident.equipment.assetTag} — ${incident.equipment.name}`}
                  variant="outlined"
                  color="default"
                />
                {incident.user && (
                  <Chip
                    size="small"
                    label={`${incident.user.firstName} ${incident.user.lastName}`}
                    variant="outlined"
                    color="primary"
                  />
                )}
              </Box>
            ) : (
              <Alert severity="info" sx={{ py: 0.5 }}>
                No active checkout on record — check in manually if needed, or skip.
              </Alert>
            )}

            {/* Return condition */}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Condition on Return *
              </Typography>
              <Select
                size="small"
                displayEmpty
                value={returnCondition}
                onChange={(e) => { setReturnCondition(e.target.value as Condition); setCheckinError(null); }}
                sx={{ minWidth: 180 }}
                error={!!checkinError && !returnCondition}
              >
                <MenuItem value="" disabled><em>Select condition</em></MenuItem>
                {CONDITION_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
              {checkinError && (
                <FormHelperText error>{checkinError}</FormHelperText>
              )}
            </Box>

            {/* Return notes */}
            <TextField
              label="Return Notes"
              size="small"
              multiline
              rows={2}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              inputProps={{ maxLength: 1000 }}
              helperText={`${returnNotes.length}/1000`}
            />
          </Box>
        )}

        {skipCheckin && (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            Check-in skipped.
          </Typography>
        )}
      </Paper>

      {/* Panel B — Check Out Replacement Device */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            📦 Check Out Replacement Device
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={skipCheckout}
                onChange={(e) => { setSkipCheckout(e.target.checked); setCheckoutError(null); }}
              />
            }
            label={<Typography variant="caption">Skip — no replacement needed</Typography>}
            sx={{ mr: 0 }}
          />
        </Box>

        {!skipCheckout && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Assignee info */}
            {(prefillAssignment?.user ?? incident.user) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">Assigning to:</Typography>
                <Chip
                  size="small"
                  label={
                    prefillAssignment?.user
                      ? `${prefillAssignment.user.firstName} ${prefillAssignment.user.lastName}`
                      : incident.user
                        ? `${incident.user.firstName} ${incident.user.lastName}`
                        : 'Unknown'
                  }
                  variant="outlined"
                  color="primary"
                />
              </Box>
            )}

            {/* Category filter */}
            {brokenEquipmentId && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={filterByCategory}
                    onChange={(e) => { setFilterByCategory(e.target.checked); setSelectedDevice(null); }}
                  />
                }
                label={<Typography variant="caption">Filter by same device category</Typography>}
              />
            )}

            {/* Replacement device search */}
            <Autocomplete<InventoryItem>
              options={availableDevices}
              value={selectedDevice}
              inputValue={deviceSearch}
              onInputChange={(_, v) => {
                setDeviceSearch(v);
                if (!v) setSelectedDevice(null);
              }}
              onChange={(_, opt) => {
                setSelectedDevice(opt);
                setCheckoutError(null);
              }}
              loading={inventoryFetching}
              getOptionLabel={(opt) =>
                `${opt.assetTag} — ${opt.name}${opt.serialNumber ? ` (S/N: ${opt.serialNumber})` : ''}`
              }
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search replacement device"
                  size="small"
                  placeholder="Asset tag, name, or serial…"
                  error={!!checkoutError && !selectedDevice}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <>
                        {inventoryFetching && <CircularProgress size={16} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, opt) => (
                <li {...props} key={opt.id}>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {opt.assetTag} — {opt.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[
                        opt.serialNumber && `S/N: ${opt.serialNumber}`,
                        opt.category?.name,
                        opt.officeLocation?.name,
                      ].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                </li>
              )}
              noOptionsText={debouncedSearch ? 'No available devices found' : 'Type to search…'}
            />
            {checkoutError && (
              <FormHelperText error>{checkoutError}</FormHelperText>
            )}

            {/* Checkout condition */}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Checkout Condition *
              </Typography>
              <Select
                size="small"
                displayEmpty
                value={checkoutCondition}
                onChange={(e) => { setCheckoutCondition(e.target.value as Condition); setCheckoutError(null); }}
                sx={{ minWidth: 180 }}
                error={!!checkoutError && !!selectedDevice && !checkoutCondition}
              >
                <MenuItem value="" disabled><em>Select condition</em></MenuItem>
                {CONDITION_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </Box>

            {/* Checkout notes */}
            <TextField
              label="Checkout Notes"
              size="small"
              multiline
              rows={2}
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              inputProps={{ maxLength: 1000 }}
              helperText={`${checkoutNotes.length}/1000`}
            />
          </Box>
        )}

        {skipCheckout && (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            Check-out skipped.
          </Typography>
        )}
      </Paper>

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
        <Button variant="outlined" onClick={onBack} disabled={isBusy}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleCompleteExchange}
          disabled={isBusy}
          startIcon={isBusy ? <CircularProgress size={16} /> : undefined}
        >
          {isBusy
            ? 'Processing…'
            : skipCheckin && skipCheckout
              ? 'Skip Exchange & Close Incident'
              : 'Complete Exchange'}
        </Button>
      </Box>
    </Box>
  );
}

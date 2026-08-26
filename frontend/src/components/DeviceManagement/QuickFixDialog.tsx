import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import workOrderCategoryService from '../../services/workOrderCategoryService';
import { deviceAssignmentService } from '../../services/deviceAssignment.service';
import { useQuickFix } from '../../hooks/mutations/useWorkOrderMutations';
import type { WorkOrderDetail } from '../../types/work-order.types';
import type { DeviceAssignment } from '../../types/deviceAssignment.types';

interface QuickFixDialogProps {
  assignment: DeviceAssignment;
  open: boolean;
  onClose: () => void;
}

// A single MUI Select carries one string value space, so equipment ids and
// charger ids are prefixed to keep them from colliding.
const EQUIPMENT_PREFIX = 'eq:';
const CHARGER_PREFIX   = 'chg:';
const NOT_LISTED       = '__NOT_LISTED__';

function getApiErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

export function QuickFixDialog({ assignment, open, onClose }: QuickFixDialogProps) {
  const [categoryId, setCategoryId] = useState('');
  // Defaults to the row that was clicked — switching is an additional choice.
  const [selection, setSelection] = useState(`${EQUIPMENT_PREFIX}${assignment.equipmentId}`);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<WorkOrderDetail | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const quickFix = useQuickFix();

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['work-order-categories', 'TECHNOLOGY', 'quick-fix', { quickFix: true }],
    queryFn: () =>
      workOrderCategoryService.getAll({
        module:    'TECHNOLOGY',
        isActive:  true,
        quickFix:  true,
        limit:     500,
        sortBy:    'sortOrder',
        sortOrder: 'asc',
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const categories = categoriesData?.items ?? [];

  const { data: userAssignments } = useQuery({
    queryKey: ['device-assignments', 'user', assignment.userId],
    queryFn: () => deviceAssignmentService.getByUser(assignment.userId),
    enabled: open,
  });
  const activeDevices = (userAssignments ?? []).filter((a) => !a.returnedAt && a.equipment);
  const activeChargers = activeDevices
    .map((a) => a.chargerAssignment)
    .filter((c): c is NonNullable<typeof c> => !!c && !c.returnedAt);

  const assigneeName = assignment.user
    ? [assignment.user.firstName, assignment.user.lastName].filter(Boolean).join(' ')
    : null;

  const handleClose = () => {
    setCategoryId('');
    setSelection(`${EQUIPMENT_PREFIX}${assignment.equipmentId}`);
    setNotes('');
    setResult(null);
    setSubmitError(null);
    onClose();
  };

  const trimmedNotes = notes.trim();

  const handleSubmit = async () => {
    if (!categoryId || !trimmedNotes) return;
    setSubmitError(null);
    try {
      setResult(await quickFix.mutateAsync({
        reportedByUserId: assignment.userId,
        equipmentId: selection.startsWith(EQUIPMENT_PREFIX)
          ? selection.slice(EQUIPMENT_PREFIX.length)
          : null,
        chargerId: selection.startsWith(CHARGER_PREFIX)
          ? selection.slice(CHARGER_PREFIX.length)
          : null,
        categoryId,
        notes: trimmedNotes,
      }));
    } catch (err: unknown) {
      setSubmitError(
        getApiErrorMessage(err) ?? 'Failed to create the work order. Please try again.',
      );
    }
  };

  const isSubmitting = quickFix.isPending;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Quick Fix</DialogTitle>

      <DialogContent>
        {result ? (
          result.status === 'CLOSED' ? (
            <Alert severity="success">
              Work order {result.workOrderNumber} created and closed.
            </Alert>
          ) : (
            <Alert severity="warning">
              Work order {result.workOrderNumber} was created but could not be automatically
              closed.{' '}
              <MuiLink component={RouterLink} to={`/work-orders/${result.id}`}>
                Open it to close manually.
              </MuiLink>
            </Alert>
          )
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Reported by: <strong>{assigneeName ?? assignment.userId}</strong>
            </Typography>

            <FormControl size="small" fullWidth>
              <InputLabel>Device</InputLabel>
              <Select
                label="Device"
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                disabled={isSubmitting}
              >
                {activeDevices.map((a) => (
                  <MenuItem key={a.id} value={`${EQUIPMENT_PREFIX}${a.equipmentId}`}>
                    {a.equipment?.assetTag}
                    {a.equipment?.name ? ` — ${a.equipment.name}` : ''}
                  </MenuItem>
                ))}
                {activeChargers.map((c) => (
                  <MenuItem key={c.id} value={`${CHARGER_PREFIX}${c.charger.id}`}>
                    Charger — {c.charger.serialNumber}
                  </MenuItem>
                ))}
                <MenuItem value={NOT_LISTED}>Device not listed</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isSubmitting || categoriesLoading}
              >
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="What did you do?"
              required
              multiline
              minRows={3}
              fullWidth
              size="small"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              error={notes.length > 0 && !trimmedNotes}
              helperText="Becomes the work order's closing note."
            />

            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {result ? (
          <Button onClick={handleClose}>Close</Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!categoryId || !trimmedNotes || isSubmitting}
            >
              Submit
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default QuickFixDialog;

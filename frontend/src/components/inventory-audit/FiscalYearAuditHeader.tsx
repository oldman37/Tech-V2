import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Typography,
} from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { useCloseFiscalYearAudit } from '@/hooks/mutations/useInventoryAuditMutations';
import { FiscalYearAudit } from '@/types/inventoryAudit.types';

interface FiscalYearAuditHeaderProps {
  audit: FiscalYearAudit;
  onClose: () => void;
}

export function FiscalYearAuditHeader({ audit, onClose }: FiscalYearAuditHeaderProps) {
  const { user } = useAuthStore();
  const permLevel = user?.permLevels?.TECHNOLOGY ?? 0;
  const canClose = permLevel >= 3;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeError, setCloseError] = useState('');

  const closeMutation = useCloseFiscalYearAudit();

  const handleConfirmClose = () => {
    setCloseError('');
    closeMutation.mutate(
      { auditId: audit.id, data: {} },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          onClose();
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { message?: string } } };
          const message =
            axiosErr?.response?.data?.message ?? 'Failed to close the fiscal year audit.';
          setCloseError(message);
        },
      }
    );
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        mb: 2,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Left: label + progress */}
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          FY {audit.fiscalYear} Audit
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {audit.completedLocations} of {audit.totalLocations} schools completed
        </Typography>
      </Box>

      {/* Per-location chips */}
      {audit.locationStatuses.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {audit.locationStatuses.map((ls) => (
            <Chip
              key={ls.id}
              label={ls.officeLocation?.name ?? ls.officeLocationId}
              size="small"
              color={ls.status === 'COMPLETED' ? 'success' : 'primary'}
              variant={ls.status === 'COMPLETED' ? 'filled' : 'outlined'}
            />
          ))}
        </Box>
      )}

      {/* Close button (admin only) */}
      {canClose && (
        <Button
          variant="outlined"
          color="warning"
          size="small"
          onClick={() => {
            setCloseError('');
            setConfirmOpen(true);
          }}
        >
          Close Fiscal Year Audit
        </Button>
      )}

      {/* Confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => !closeMutation.isPending && setConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Close Fiscal Year Audit?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will finalize the FY {audit.fiscalYear} audit and mark it as COMPLETED. All
            schools must have no unresolved missing items before this can proceed.
          </DialogContentText>
          {closeError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {closeError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            color="inherit"
            disabled={closeMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmClose}
            variant="contained"
            color="warning"
            disabled={closeMutation.isPending}
            startIcon={
              closeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {closeMutation.isPending ? 'Closing…' : 'Confirm Close'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

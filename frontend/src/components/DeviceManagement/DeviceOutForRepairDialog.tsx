import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMutation } from '@tanstack/react-query';
import { repairTicketService } from '../../services/repairTicket.service';

interface DeviceOutForRepairDialogProps {
  open:           boolean;
  equipmentLabel: string;
  ticketNumber:   string;
  repairTicketId: string;
  onResolved:     () => void;
  onCancel:       () => void;
}

export function DeviceOutForRepairDialog({
  open,
  equipmentLabel,
  ticketNumber,
  repairTicketId,
  onResolved,
  onCancel,
}: DeviceOutForRepairDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const markReturnedMutation = useMutation({
    mutationFn: () => repairTicketService.updateStatus(repairTicketId, { status: 'returned' }),
    onSuccess: () => {
      setError(null);
      onResolved();
    },
    onError: () => setError('Failed to mark the repair ticket returned. Please try again.'),
  });

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
        <WarningAmberIcon />
        Device Still Out for Repair
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body1" gutterBottom>
          <strong>{equipmentLabel}</strong> was sent out for repair on ticket{' '}
          <strong>{ticketNumber}</strong> and hasn't been marked returned yet.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Mark the repair ticket returned before checking this device out to someone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={markReturnedMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={markReturnedMutation.isPending}
          onClick={() => markReturnedMutation.mutate()}
        >
          {markReturnedMutation.isPending ? 'Marking Returned…' : 'Mark Returned & Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeviceOutForRepairDialog;

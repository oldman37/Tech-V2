import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface InventoryPermanentDeleteDialogProps {
  open: boolean;
  itemName: string;
  assetTag: string;
  onConfirm: (purgeAll: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  errorMessage?: string;
}

const BORDER_COLOUR = '#c62828'; // critical — matches DeviceActionConfirmDialog's RISK_COLOURS.critical

export default function InventoryPermanentDeleteDialog({
  open,
  itemName,
  assetTag,
  onConfirm,
  onCancel,
  isLoading = false,
  errorMessage,
}: InventoryPermanentDeleteDialogProps) {
  const [purgeAll, setPurgeAll] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleClose = () => {
    setPurgeAll(false);
    setChecked(false);
    onCancel();
  };

  const handleConfirm = () => {
    onConfirm(purgeAll);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderTop: `4px solid ${BORDER_COLOUR}` },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: BORDER_COLOUR }}>
        <WarningAmberIcon />
        Confirm: Permanently Delete
      </DialogTitle>

      <DialogContent dividers>
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        <Typography variant="body1" gutterBottom>
          You are about to permanently delete <strong>{itemName}</strong> (
          <strong>{assetTag}</strong>). This cannot be undone and is different
          from disposing it as e-waste.
        </Typography>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Checkout records, repair tickets, audit records, and cart items tied
          to this item are always deleted — there is no way for them to
          survive once the item is gone. Linked work orders are never
          deleted; they're kept and unlinked with a system note.
        </Typography>

        <RadioGroup
          value={purgeAll ? 'purge' : 'preserve'}
          onChange={(e) => setPurgeAll(e.target.value === 'purge')}
          sx={{ mt: 1.5 }}
        >
          <FormControlLabel
            value="preserve"
            control={<Radio />}
            label="Remove item, keep related records"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -0.5, mb: 1 }}>
            Damage incidents and invoices are kept, with their reference to
            this item cleared and a note added.
          </Typography>

          <FormControlLabel
            value="purge"
            control={<Radio color="error" />}
            label="Remove completely"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: -0.5 }}>
            Also deletes this item's damage incidents and their invoices.
          </Typography>
        </RadioGroup>

        <FormControlLabel
          sx={{ mt: 1.5 }}
          control={
            <Checkbox
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              color="error"
            />
          }
          label="I understand this action is irreversible and will permanently affect this item. This cannot be undone."
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={!checked || isLoading}
          onClick={handleConfirm}
        >
          {isLoading ? 'Deleting…' : 'Confirm Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

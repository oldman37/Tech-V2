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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PhonelinkEraseIcon from '@mui/icons-material/PhonelinkErase';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import {
  INTUNE_ACTION_LABELS,
  INTUNE_ACTION_RISK,
  type IntuneAction,
} from '@mgspe/shared-types';

interface DeviceActionConfirmDialogProps {
  open: boolean;
  action: IntuneAction;
  modelName: string;
  enrolledCount: number;
  keepUserData?: boolean;
  onConfirm: (confirmText?: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDryRun?: boolean;
}

const RISK_COLOURS: Record<string, string> = {
  low:      '#2e7d32',
  medium:   '#ed6c02',
  high:     '#e65100',
  critical: '#c62828',
};

/**
 * For high/critical (non-fullDecommission) actions the user must type the action
 * name uppercased.  For fullDecommission the user must type 'DECOMMISSION'.
 */
function requiredConfirmText(action: IntuneAction): string | null {
  const risk = INTUNE_ACTION_RISK[action];
  if (risk === 'low') return null;
  if (risk === 'medium') return null; // checkbox only
  if (action === 'fullDecommission') return 'DECOMMISSION';
  // high / critical: action name uppercased and stripped of camelCase
  return action.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
}

export default function DeviceActionConfirmDialog({
  open,
  action,
  modelName,
  enrolledCount,
  keepUserData,
  onConfirm,
  onCancel,
  isLoading = false,
  isDryRun = false,
}: DeviceActionConfirmDialogProps) {
  const [typedText, setTypedText]   = useState('');
  const [checked,   setChecked]     = useState(false);

  const risk       = INTUNE_ACTION_RISK[action];
  const label      = INTUNE_ACTION_LABELS[action];
  const required   = requiredConfirmText(action);
  const borderColour = RISK_COLOURS[risk] ?? '#1565c0';

  const isConfirmed = () => {
    if (risk === 'low')    return true;
    if (risk === 'medium') return checked;
    // high / critical
    return required ? typedText.trim() === required : true;
  };

  const handleConfirm = () => {
    onConfirm(required ? typedText.trim() === 'DECOMMISSION' ? 'DECOMMISSION' : undefined : undefined);
  };

  const handleClose = () => {
    setTypedText('');
    setChecked(false);
    onCancel();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderTop: `4px solid ${borderColour}` },
      }}
    >
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', gap: 1, color: borderColour }}
      >
        <WarningAmberIcon />
        Confirm: {label}
      </DialogTitle>

      <DialogContent dividers>
        {isDryRun && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>DRY RUN</strong> — No actions will be performed. This is a simulation only.
            Toggle “Test Mode” OFF to execute for real.
          </Alert>
        )}
        <Typography variant="body1" gutterBottom>
          You are about to perform <strong>{label}</strong> on{' '}
          <strong>{enrolledCount}</strong> enrolled device
          {enrolledCount !== 1 ? 's' : ''} in model{' '}
          <strong>{modelName}</strong>.
        </Typography>

        {action === 'cleanWindowsDevice' && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {keepUserData
              ? 'User files will be kept. Windows will be reinstalled.'
              : 'User files will be removed. Fresh Windows installation.'}
          </Typography>
        )}

        {action === 'fullDecommission' && (
          <>
            <Typography variant="body2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>
              The following will be permanently removed for each device:
            </Typography>
            <List dense disablePadding>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <PhonelinkEraseIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText primary="Intune managed device record" />
              </ListItem>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <DevicesOtherIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText primary="Windows Autopilot identity" />
              </ListItem>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <DeleteForeverIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText primary="Entra ID device object" />
              </ListItem>
            </List>
          </>
        )}

        {risk === 'medium' && (
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                color="warning"
              />
            }
            label={`I understand this will ${action === 'rebootNow' ? 'immediately reboot' : 'affect'} ${enrolledCount} device${enrolledCount !== 1 ? 's' : ''}`}
          />
        )}

        {(risk === 'high' || risk === 'critical') && required && (
          <>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Type <strong>{required}</strong> to confirm:
            </Typography>
            <TextField
              autoFocus
              fullWidth
              size="small"
              sx={{ mt: 1 }}
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={required}
              error={typedText.length > 0 && typedText !== required}
              helperText={
                typedText.length > 0 && typedText !== required
                  ? `Must match exactly: ${required}`
                  : undefined
              }
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={risk === 'low' ? 'primary' : risk === 'medium' ? 'warning' : 'error'}
          disabled={!isConfirmed() || isLoading}
          onClick={handleConfirm}
        >
          {isLoading ? 'Executing…' : `Confirm ${label}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

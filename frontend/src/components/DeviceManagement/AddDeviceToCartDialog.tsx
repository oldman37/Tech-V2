import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deviceCartService } from '../../services/deviceCart.service';
import type { DeviceCartDetail } from '../../types/deviceCart.types';

interface AddDeviceToCartDialogProps {
  cart: DeviceCartDetail;
  open: boolean;
  onClose: () => void;
}

function getApiErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

function getConflictMeta(error: unknown): { code?: string; cartLabel?: string } | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response?: { data?: { meta?: { code?: string; cartLabel?: string } } } }).response?.data?.meta;
  }
  return undefined;
}

export function AddDeviceToCartDialog({ cart, open, onClose }: AddDeviceToCartDialogProps) {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  // Set when the last scan hit a device already checked out in a different
  // cart — offers "Move Device" instead of a dead-end error.
  const [conflict, setConflict] = useState<{ identifier: string; cartLabel: string } | null>(null);

  const scanMutation = useMutation({
    mutationFn: ({ value, force }: { value: string; force?: boolean }) =>
      deviceCartService.scanToCart(cart.id, { identifier: value, ...(force && { moveFromOtherCart: true }) }),
    retry: false,
    onSuccess: (item) => {
      setAdded((prev) => [...prev, item.equipment.assetTag]);
      setIdentifier('');
      setConflict(null);
      queryClient.invalidateQueries({ queryKey: ['device-carts'] });
      queryClient.invalidateQueries({ queryKey: ['device-assignments'] });
    },
    onError: (error, variables) => {
      const meta = getConflictMeta(error);
      if (meta?.code === 'DEVICE_IN_ANOTHER_CART' && !variables.force) {
        setConflict({ identifier: variables.value, cartLabel: meta.cartLabel ?? 'another cart' });
      } else {
        setConflict(null);
      }
    },
  });

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    if (conflict) setConflict(null);
  };

  const handleClose = () => {
    setAdded([]);
    setConflict(null);
    scanMutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Device — {cart.tagNumber ?? cart.name ?? cart.id.slice(0, 8)}</DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Scan or enter an asset tag, barcode, or QR code. This checks the device out immediately to the cart's
          current assignee.
        </Typography>

        <TextField
          label="Asset Tag / Barcode / QR"
          size="small"
          fullWidth
          autoFocus
          value={identifier}
          onChange={(e) => handleIdentifierChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && identifier.trim()) scanMutation.mutate({ value: identifier.trim() });
          }}
        />

        {added.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary">Added this session:</Typography>
            <List dense disablePadding>
              {added.map((tag, idx) => (
                <ListItem key={`${tag}-${idx}`} disableGutters>
                  <ListItemText primary={tag} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {conflict ? (
          <Alert
            severity="warning"
            // Alert renders `action` in place of the auto close button, so the
            // dismiss affordance here is the Cancel button rather than onClose.
            action={
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button color="inherit" size="small" disabled={scanMutation.isPending} onClick={() => setConflict(null)}>
                  Cancel
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  disabled={scanMutation.isPending}
                  onClick={() => scanMutation.mutate({ value: conflict.identifier, force: true })}
                >
                  Move Device
                </Button>
              </Box>
            }
          >
            This device is already checked out in <strong>{conflict.cartLabel}</strong>. Move it to this cart?
          </Alert>
        ) : scanMutation.isError && (
          <Alert severity="error">
            {getApiErrorMessage(scanMutation.error) ?? 'Failed to add device. Please try again.'}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Done</Button>
        <Button
          variant="contained"
          color="primary"
          disabled={scanMutation.isPending || !identifier.trim()}
          onClick={() => scanMutation.mutate({ value: identifier.trim() })}
        >
          {scanMutation.isPending ? 'Adding…' : 'Add Device'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddDeviceToCartDialog;

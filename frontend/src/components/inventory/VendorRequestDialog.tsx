import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import type { VendorRequestInput } from '../../services/referenceDataService';

interface VendorRequestDialogProps {
  open: boolean;
  /** Pre-fills the name field with whatever the user typed into the picker. */
  initialName: string;
  onSubmit: (data: VendorRequestInput) => void;
  onCancel: () => void;
  submitting?: boolean;
}

const emptyVendor = (name: string): VendorRequestInput => ({
  name,
  contactName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  fax: '',
  website: '',
});

/**
 * A vendor deserves more than a bare name — unlike a brand or model, the rest of the
 * app needs contact details to actually order from it.
 *
 * Posts to plain POST /vendors (TECHNOLOGY 2), NOT /vendors/request-new, which is gated
 * on REQUISITIONS 2 and would 403 a technology-only user.
 */
export default function VendorRequestDialog({
  open,
  initialName,
  onSubmit,
  onCancel,
  submitting,
}: VendorRequestDialogProps) {
  const [form, setForm] = useState<VendorRequestInput>(() => emptyVendor(initialName));

  useEffect(() => {
    if (open) setForm(emptyVendor(initialName));
  }, [open, initialName]);

  const set = (field: keyof VendorRequestInput, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Add Vendor</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Vendor Name"
            required
            size="small"
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Contact Name"
              size="small"
              value={form.contactName ?? ''}
              onChange={(e) => set('contactName', e.target.value)}
            />
            <TextField
              label="Email"
              size="small"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
            <TextField
              label="Phone"
              size="small"
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
            <TextField
              label="Fax"
              size="small"
              value={form.fax ?? ''}
              onChange={(e) => set('fax', e.target.value)}
            />
          </Box>
          <TextField
            label="Address"
            size="small"
            value={form.address ?? ''}
            onChange={(e) => set('address', e.target.value)}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 2 }}>
            <TextField
              label="City"
              size="small"
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
            />
            <TextField
              label="State"
              size="small"
              value={form.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
            />
            <TextField
              label="ZIP"
              size="small"
              value={form.zip ?? ''}
              onChange={(e) => set('zip', e.target.value)}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.name?.trim() || submitting}
          onClick={() => onSubmit({ ...form, name: form.name.trim() })}
        >
          {submitting ? 'Saving…' : 'Add Vendor'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

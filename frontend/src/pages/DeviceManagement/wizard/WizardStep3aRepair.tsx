import {
  Box,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import type { Step3aValues } from './wizardSchemas';

interface VendorInfo {
  id:          string | null;
  name:        string | null;
  contactName: string | null;
  email:       string | null;
  phone:       string | null;
}

interface WizardStep3aProps {
  values:     Step3aValues;
  onChange:   (patch: Partial<Step3aValues>) => void;
  errors:     Partial<Record<keyof Step3aValues, string>>;
  vendorInfo: VendorInfo | null;
}

export default function WizardStep3aRepair({ values, onChange, vendorInfo }: WizardStep3aProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
      {/* Vendor info (pre-populated, read-only display) */}
      {vendorInfo?.name ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Equipment Vendor (pre-populated)
          </Typography>
          <Typography variant="body2" fontWeight={600}>{vendorInfo.name}</Typography>
          {vendorInfo.contactName && (
            <Typography variant="body2" color="text.secondary">Contact: {vendorInfo.contactName}</Typography>
          )}
          {vendorInfo.email && (
            <Typography variant="body2" color="text.secondary">Email: {vendorInfo.email}</Typography>
          )}
          {vendorInfo.phone && (
            <Typography variant="body2" color="text.secondary">Phone: {vendorInfo.phone}</Typography>
          )}
        </Paper>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No vendor on record for this device — vendor will be selected after the wizard via the repair ticket detail page.
        </Typography>
      )}

      {/* Expected Return Date */}
      <TextField
        label="Return Day"
        type="date"
        size="small"
        value={values.expectedReturnDate ?? ''}
        onChange={(e) => onChange({ expectedReturnDate: e.target.value })}
        InputLabelProps={{ shrink: true }}
        helperText="Leave blank if unknown"
      />

      {/* Repair Notes */}
      <TextField
        label="Repair Notes"
        size="small"
        multiline
        rows={3}
        value={values.repairNotes ?? ''}
        onChange={(e) => onChange({ repairNotes: e.target.value })}
        inputProps={{ maxLength: 2000 }}
        helperText={`${(values.repairNotes ?? '').length}/2000 — describe the damage for the repair technician`}
      />
    </Box>
  );
}

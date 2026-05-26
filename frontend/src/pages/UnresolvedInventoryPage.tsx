import { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material';
import { UnresolvedItemsTable } from '@/components/inventory-audit/UnresolvedItemsTable';
import { useLocations } from '@/hooks/queries/useLocations';

export function UnresolvedInventoryPage() {
  const [officeLocationId, setOfficeLocationId] = useState('');

  const { data: locations } = useLocations();
  const activeLocations = (locations ?? []).filter((loc) => loc.isActive);

  const handleLocationChange = (event: SelectChangeEvent<string>) => {
    setOfficeLocationId(event.target.value);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Unresolved Inventory Items
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Equipment marked as missing during audits that has not yet been resolved.
      </Typography>

      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="unresolved-school-label">School</InputLabel>
          <Select
            labelId="unresolved-school-label"
            value={officeLocationId}
            label="School"
            onChange={handleLocationChange}
          >
            <MenuItem value="">All Schools</MenuItem>
            {activeLocations.map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>
                {loc.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <UnresolvedItemsTable
        filters={{ officeLocationId: officeLocationId || undefined }}
      />
    </Box>
  );
}

export default UnresolvedInventoryPage;

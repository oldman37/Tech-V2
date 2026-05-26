import { Box, Typography } from '@mui/material';
import { UnresolvedItemsTable } from '@/components/inventory-audit/UnresolvedItemsTable';

export function UnresolvedInventoryPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Unresolved Inventory Items
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Equipment marked as missing during audits that has not yet been resolved.
      </Typography>

      <UnresolvedItemsTable />
    </Box>
  );
}

export default UnresolvedInventoryPage;

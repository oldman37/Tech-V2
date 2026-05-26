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
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Tooltip,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useUnresolvedItems } from '@/hooks/queries/useInventoryAudit';
import { useResolveAuditItem } from '@/hooks/mutations/useInventoryAuditMutations';
import { AuditItem, ResolvedAction } from '@/types/inventoryAudit.types';

const RESOLVED_ACTION_LABELS: Record<ResolvedAction, string> = {
  FOUND_IN_ROOM: 'Found in Room',
  FOUND_ELSEWHERE: 'Found Elsewhere',
  CONFIRMED_LOST: 'Confirmed Lost',
  EQUIPMENT_UPDATED: 'Equipment Record Updated',
};

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

interface ResolveDialogProps {
  item: AuditItem | null;
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

function ResolveDialog({ item, open, onClose, onResolved }: ResolveDialogProps) {
  const [resolvedAction, setResolvedAction] = useState<ResolvedAction | ''>('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const resolveMutation = useResolveAuditItem();

  const handleClose = () => {
    setResolvedAction('');
    setNotes('');
    setErrorMsg('');
    onClose();
  };

  const handleConfirm = () => {
    if (!item || !resolvedAction) return;
    setErrorMsg('');

    resolveMutation.mutate(
      {
        itemId: item.id,
        data: {
          resolvedAction: resolvedAction as ResolvedAction,
          resolutionNotes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          handleClose();
          onResolved();
        },
        onError: (err: any) => {
          setErrorMsg(err?.response?.data?.message ?? 'Failed to resolve item.');
        },
      }
    );
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Resolve Missing Item</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {item && (
          <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2">{item.equipmentTag}</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.equipmentName}
            </Typography>
            {item.session && (
              <Typography variant="caption" color="text.secondary">
                Missing from: {item.session.room?.name} — {item.session.officeLocation?.name}
              </Typography>
            )}
          </Box>
        )}

        <FormControl fullWidth required>
          <InputLabel id="resolution-label">Resolution</InputLabel>
          <Select
            labelId="resolution-label"
            value={resolvedAction}
            label="Resolution"
            onChange={(e: SelectChangeEvent) =>
              setResolvedAction(e.target.value as ResolvedAction)
            }
          >
            {(Object.keys(RESOLVED_ACTION_LABELS) as ResolvedAction[]).map((action) => (
              <MenuItem key={action} value={action}>
                {RESOLVED_ACTION_LABELS[action]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Notes (optional)"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          inputProps={{ maxLength: 1000 }}
        />

        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={resolveMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!resolvedAction || resolveMutation.isPending}
          startIcon={
            resolveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface UnresolvedItemsTableProps {
  filters?: { officeLocationId?: string; roomId?: string; fiscalYear?: string };
}

export function UnresolvedItemsTable({ filters = {} }: UnresolvedItemsTableProps) {
  const [resolveItem, setResolveItem] = useState<AuditItem | null>(null);

  const { data, isLoading, error, refetch } = useUnresolvedItems(filters);

  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {(error as any)?.response?.data?.message ?? 'Failed to load unresolved items.'}
      </Alert>
    );
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell>Asset Tag</TableCell>
              <TableCell>Equipment</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Date Reported</TableCell>
              <TableCell>Days Unresolved</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No unresolved items found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const days = daysAgo(item.checkedAt);
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {item.equipmentTag}
                      </Typography>
                      {item.equipmentSerial && (
                        <Typography variant="caption" color="text.secondary">
                          S/N: {item.equipmentSerial}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.equipmentName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {item.session?.officeLocation?.name ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {item.session?.room?.name ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {item.checkedAt
                          ? new Date(item.checkedAt).toLocaleDateString()
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {days !== null ? (
                        <Chip
                          label={`${days}d`}
                          size="small"
                          color={days > 30 ? 'error' : days > 7 ? 'warning' : 'default'}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Resolve this item">
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => setResolveItem(item)}
                        >
                          Resolve
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {data && data.totalPages > 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Showing {items.length} of {data.total} items
        </Typography>
      )}

      <ResolveDialog
        item={resolveItem}
        open={!!resolveItem}
        onClose={() => setResolveItem(null)}
        onResolved={() => refetch()}
      />
    </>
  );
}

import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useAuditSession } from '@/hooks/queries/useInventoryAudit';
import { useCompleteAuditSession } from '@/hooks/mutations/useInventoryAuditMutations';
import { AuditItemRow } from './AuditItemRow';
import { AuditEquipmentSearch } from './AuditEquipmentSearch';

interface AuditItemListProps {
  sessionId: string;
  onCompleted: (sessionId: string) => void;
}

export function AuditItemList({ sessionId, onCompleted }: AuditItemListProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: session, isLoading, error } = useAuditSession(sessionId);
  const completeMutation = useCompleteAuditSession();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !session) {
    return (
      <Alert severity="error">
        {(error as any)?.response?.data?.message ?? 'Failed to load audit session.'}
      </Alert>
    );
  }

  const items = session.items ?? [];
  const totalItems = items.length;
  const verifiedCount = items.filter((i) => i.status !== 'UNVERIFIED').length;
  const presentCount = items.filter((i) => i.status === 'PRESENT').length;
  const missingCount = items.filter((i) => i.status === 'MISSING').length;
  const unverifiedCount = items.filter((i) => i.status === 'UNVERIFIED').length;
  const progressPct = totalItems > 0 ? (verifiedCount / totalItems) * 100 : 0;
  const allVerified = unverifiedCount === 0;

  const handleCompleteConfirm = () => {
    setErrorMsg('');
    completeMutation.mutate(
      { sessionId, data: { notes: completionNotes.trim() || undefined } },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          onCompleted(sessionId);
        },
        onError: (err: any) => {
          setErrorMsg(err?.response?.data?.message ?? 'Failed to complete session.');
        },
      }
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6">
            {session.room?.name ?? 'Room Audit'}
            {session.officeLocation && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                — {session.officeLocation.name}
              </Typography>
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {verifiedCount} of {totalItems} items verified &nbsp;·&nbsp;
            {presentCount} in room &nbsp;·&nbsp; {missingCount} missing &nbsp;·&nbsp;
            {unverifiedCount} unverified
            {(session.additionCount ?? 0) > 0 && (
              <> &nbsp;·&nbsp; <span style={{ color: '#1976d2' }}>{session.additionCount} added</span></>
            )}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          disabled={completeMutation.isPending}
          onClick={() => setConfirmOpen(true)}
          title={!allVerified ? `${unverifiedCount} item(s) still unverified — they will be marked Missing` : ''}
        >
          Complete Audit
        </Button>
      </Box>

      {/* Progress bar */}
      <Box>
        <LinearProgress
          variant="determinate"
          value={progressPct}
          sx={{ height: 8, borderRadius: 4 }}
          color={allVerified ? 'success' : 'primary'}
        />
      </Box>

      {!allVerified && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {unverifiedCount} item{unverifiedCount !== 1 ? 's' : ''} still need to be verified.
        </Alert>
      )}

      {/* Audit Equipment Search — only available during an in-progress session */}
      {session.status === 'IN_PROGRESS' && (
        <Box
          sx={{
            p: 2,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'action.hover',
          }}
        >
          <AuditEquipmentSearch sessionId={sessionId} />
        </Box>
      )}

      {/* Item list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item) => (
          <AuditItemRow key={item.id} item={item} sessionId={sessionId} />
        ))}
        {items.length === 0 && (
          <Alert severity="info">No equipment is assigned to this room.</Alert>
        )}
      </Box>

      {/* Complete confirmation dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Complete Audit?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {unverifiedCount > 0 ? (
            <DialogContentText color="warning.main">
              {unverifiedCount} unverified item{unverifiedCount !== 1 ? 's' : ''} will be marked as{' '}
              <strong>Missing</strong> when you complete this audit.
            </DialogContentText>
          ) : (
            <DialogContentText>
              Summary: <strong>{presentCount}</strong> in room,{' '}
              <strong>{missingCount}</strong> not in room
              {(session.additionCount ?? 0) > 0 && (
                <>, <strong>{session.additionCount}</strong> added during audit</>
              )}
              .
            </DialogContentText>
          )}
          <TextField
            label="Completion notes (optional)"
            multiline
            minRows={2}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            inputProps={{ maxLength: 1000 }}
          />
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={completeMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCompleteConfirm}
            disabled={completeMutation.isPending}
            startIcon={completeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {completeMutation.isPending ? 'Completing…' : 'Complete Audit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

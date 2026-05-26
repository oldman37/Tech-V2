import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAuditSession, useActiveFiscalYearAudit } from '@/hooks/queries/useInventoryAudit';
import { useCompleteLocation } from '@/hooks/mutations/useInventoryAuditMutations';
import { AuditRoomSelector } from '@/components/inventory-audit/AuditRoomSelector';
import { AuditItemList } from '@/components/inventory-audit/AuditItemList';
import { FiscalYearAuditEntry } from '@/components/inventory-audit/FiscalYearAuditEntry';
import { FiscalYearAuditHeader } from '@/components/inventory-audit/FiscalYearAuditHeader';
import inventoryAuditService from '@/services/inventoryAudit.service';
import { FiscalYearAudit } from '@/types/inventoryAudit.types';

type AuditStep = 'select' | 'audit' | 'summary';

function CompletedSummary({ sessionId }: { sessionId: string }) {
  const { data: session } = useAuditSession(sessionId);

  if (!session) return null;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 520, width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <CheckCircleIcon color="success" />
        <Typography variant="h6">Audit Complete</Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        {session.room?.name} — {session.officeLocation?.name}
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body1">
          <strong>{session.presentCount}</strong> items confirmed in room
        </Typography>
        <Typography variant="body1" color={session.missingCount > 0 ? 'error.main' : 'text.primary'}>
          <strong>{session.missingCount}</strong> items not in room
        </Typography>
        {(session.additionCount ?? 0) > 0 && (
          <Typography variant="body2" color="info.main">
            <strong>{session.additionCount}</strong> item{session.additionCount !== 1 ? 's' : ''} added during audit
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {session.totalItems} total items audited
        </Typography>
      </Box>

      {session.missingCount > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {session.missingCount} missing item{session.missingCount !== 1 ? 's' : ''} will appear
          in the Unresolved Items queue for follow-up.
        </Alert>
      )}
    </Paper>
  );
}

export function InventoryAuditPage() {
  const location = useLocation();
  const resumeId = (location.state as { resumeSessionId?: string } | null)?.resumeSessionId;
  const [step, setStep] = useState<AuditStep>(resumeId ? 'audit' : 'select');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(resumeId ?? null);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [continuePromptOpen, setContinuePromptOpen] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [continuing, setContinuing] = useState(false);
  const [schoolFullyAudited, setSchoolFullyAudited] = useState(false);
  const [continuationRoomIds, setContinuationRoomIds] = useState<string[] | null>(null);

  // Mark school complete state
  const [markSchoolCompleteOpen, setMarkSchoolCompleteOpen] = useState(false);
  const [markCompleteError, setMarkCompleteError] = useState('');

  // Local override so the UI transitions immediately after start/resume
  // without waiting for the background refetch to resolve.
  const [localFyAudit, setLocalFyAudit] = useState<FiscalYearAudit | null>(null);

  const {
    data: activeFiscalYearAudit,
    isLoading: fiscalYearLoading,
    refetch: refetchFiscalYearAudit,
  } = useActiveFiscalYearAudit();

  // Use the locally-set audit first; fall back to the query result.
  const effectiveFyAudit = localFyAudit ?? activeFiscalYearAudit ?? null;

  const completeLocationMutation = useCompleteLocation();

  const handleAuditStarted = (audit: FiscalYearAudit) => {
    setLocalFyAudit(audit);
    setStep('select');
    refetchFiscalYearAudit();
  };

  const handleAuditResumed = (audit: FiscalYearAudit) => {
    setLocalFyAudit(audit);
    setStep('select');
    refetchFiscalYearAudit();
  };

  const handleSessionStarted = (
    sessionId: string,
    context?: { officeLocationId?: string; fiscalYear?: string | null }
  ) => {
    setActiveSessionId(sessionId);
    if (context?.officeLocationId) {
      setActiveSchoolId(context.officeLocationId);
    }
    setSchoolFullyAudited(false);
    setContinuationRoomIds(null);
    setFlowError('');
    setStep('audit');
  };

  const handleAuditCompleted = ({
    sessionId,
    officeLocationId,
  }: {
    sessionId: string;
    officeLocationId: string;
    fiscalYear: string | null;
  }) => {
    setActiveSessionId(sessionId);
    setActiveSchoolId(officeLocationId);
    setSchoolFullyAudited(false);
    setContinuePromptOpen(true);
    setFlowError('');
    setStep('summary');
  };

  const handleContinueSameSchool = async () => {
    if (!activeSchoolId) {
      setFlowError('School context was not found. Start another room manually.');
      return;
    }

    setContinuing(true);
    setFlowError('');

    try {
      const fiscalYear = effectiveFyAudit?.fiscalYear ?? undefined;
      const next = await inventoryAuditService.getNextRoom(activeSchoolId, fiscalYear);

      if (!next.remainingRooms || next.remainingRooms.length === 0) {
        setSchoolFullyAudited(true);
        setContinuePromptOpen(false);
        return;
      }

      setContinuationRoomIds(next.remainingRooms.map((r) => r.id));
      setContinuePromptOpen(false);
      setStep('select');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setFlowError(
        axiosErr?.response?.data?.message ??
          'Unable to load remaining rooms. You can start another audit manually.'
      );
    } finally {
      setContinuing(false);
    }
  };

  const handleMarkSchoolComplete = () => {
    setMarkCompleteError('');
    setMarkSchoolCompleteOpen(true);
  };

  const handleConfirmMarkSchoolComplete = () => {
    if (!effectiveFyAudit || !activeSchoolId) return;
    setMarkCompleteError('');
    completeLocationMutation.mutate(
      { auditId: effectiveFyAudit.id, data: { officeLocationId: activeSchoolId } },
      {
        onSuccess: () => {
          setMarkSchoolCompleteOpen(false);
          refetchFiscalYearAudit();
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { message?: string } } };
          const message =
            axiosErr?.response?.data?.message ?? 'Failed to mark school as complete.';
          setMarkCompleteError(message);
        },
      }
    );
  };

  // Loading state for fiscal year audit (initial load only)
  if (fiscalYearLoading && !effectiveFyAudit) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // No active fiscal year audit — show entry screen
  if (!effectiveFyAudit) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h5" gutterBottom>
          Inventory Audit
        </Typography>
        <FiscalYearAuditEntry
          onAuditStarted={handleAuditStarted}
          onAuditResumed={handleAuditResumed}
        />
      </Box>
    );
  }

  // Active fiscal year audit — show the room audit flow
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Inventory Audit
      </Typography>

      <FiscalYearAuditHeader
        audit={effectiveFyAudit}
        onClose={() => { setLocalFyAudit(null); refetchFiscalYearAudit(); }}
      />

      {flowError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {flowError}
        </Alert>
      )}

      {step === 'select' && (
        <AuditRoomSelector
          onSessionStarted={(sessionId, context) => handleSessionStarted(sessionId, context)}
          preselectedLocationId={continuationRoomIds !== null && activeSchoolId ? activeSchoolId : undefined}
          allowedRoomIds={continuationRoomIds ?? undefined}
          fiscalYear={effectiveFyAudit.fiscalYear}
        />
      )}

      {step === 'audit' && activeSessionId && (
        <AuditItemList
          sessionId={activeSessionId}
          onCompleted={handleAuditCompleted}
        />
      )}

      {step === 'summary' && activeSessionId && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <CompletedSummary sessionId={activeSessionId} />
          {schoolFullyAudited && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Alert severity="success">
                All active rooms for this school are complete for the selected fiscal year.
              </Alert>
              <Button
                variant="contained"
                color="success"
                sx={{ alignSelf: 'flex-start' }}
                onClick={handleMarkSchoolComplete}
              >
                Mark School Complete
              </Button>
            </Box>
          )}
          <Box>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setActiveSessionId(null);
                setActiveSchoolId(null);
                setSchoolFullyAudited(false);
                setFlowError('');
                setStep('select');
              }}
            >
              Start a new audit
            </Button>
          </Box>
        </Box>
      )}

      <Dialog open={continuePromptOpen} onClose={() => setContinuePromptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Continue Audit for This School?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This room is complete. Would you like to pick another room to audit at the same school?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContinuePromptOpen(false)} disabled={continuing}>
            Finish for now
          </Button>
          <Button
            variant="contained"
            onClick={handleContinueSameSchool}
            disabled={continuing}
            startIcon={continuing ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {continuing ? 'Loading...' : 'Pick Next Room'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mark School Complete confirmation dialog */}
      <Dialog
        open={markSchoolCompleteOpen}
        onClose={() => !completeLocationMutation.isPending && setMarkSchoolCompleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Mark School as Complete?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will record that all rooms at this school have been audited for FY{' '}
            {effectiveFyAudit.fiscalYear}. All unresolved missing items must be resolved first.
          </DialogContentText>
          {markCompleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {markCompleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setMarkSchoolCompleteOpen(false)}
            color="inherit"
            disabled={completeLocationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmMarkSchoolComplete}
            disabled={completeLocationMutation.isPending}
            startIcon={
              completeLocationMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : null
            }
          >
            {completeLocationMutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InventoryAuditPage;

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
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useFiscalYearAudits } from '@/hooks/queries/useInventoryAudit';
import { useStartFiscalYearAudit } from '@/hooks/mutations/useInventoryAuditMutations';
import inventoryAuditService from '@/services/inventoryAudit.service';
import { FiscalYearAudit } from '@/types/inventoryAudit.types';

interface FiscalYearAuditEntryProps {
  onAuditStarted: (audit: FiscalYearAudit) => void;
  onAuditResumed: (audit: FiscalYearAudit) => void;
}

const FY_REGEX = /^\d{4}-\d{4}$/;

export function FiscalYearAuditEntry({ onAuditStarted, onAuditResumed }: FiscalYearAuditEntryProps) {
  const [fiscalYear, setFiscalYear] = useState('');
  const [notes, setNotes] = useState('');
  const [fyError, setFyError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Conflict dialog state
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictAuditId, setConflictAuditId] = useState<string | null>(null);
  const [conflictCanResume, setConflictCanResume] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [resuming, setResuming] = useState(false);

  const { data: allAudits, isLoading: auditsLoading } = useFiscalYearAudits();
  const startMutation = useStartFiscalYearAudit();

  const completedAudits = allAudits?.filter((a) => a.status === 'COMPLETED') ?? [];

  const handleFiscalYearChange = (value: string) => {
    setFiscalYear(value);
    if (fyError) setFyError('');
  };

  const handleStart = () => {
    setSubmitError('');
    if (!FY_REGEX.test(fiscalYear.trim())) {
      setFyError('Fiscal year must be in YYYY-YYYY format (e.g., 2025-2026)');
      return;
    }

    startMutation.mutate(
      { fiscalYear: fiscalYear.trim(), notes: notes.trim() || undefined },
      {
        onSuccess: (audit) => {
          onAuditStarted(audit);
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string; meta?: { existingAuditId?: string; canResume?: boolean } } } };
          const status = axiosErr?.response?.status;
          const data = axiosErr?.response?.data;
          if (status === 409 && data?.meta) {
            setConflictAuditId(data.meta.existingAuditId ?? null);
            setConflictCanResume(data.meta.canResume === true);
            setConflictMessage(data.message ?? 'A conflict was detected.');
            setConflictOpen(true);
          } else {
            setSubmitError(data?.message ?? 'Failed to start fiscal year audit.');
          }
        },
      }
    );
  };

  const handleResume = async () => {
    if (!conflictAuditId) return;
    setResuming(true);
    try {
      const audit = await inventoryAuditService.getFiscalYearAudit(conflictAuditId);
      setConflictOpen(false);
      onAuditResumed(audit);
    } catch {
      setSubmitError('Failed to load the existing audit. Please refresh and try again.');
      setConflictOpen(false);
    } finally {
      setResuming(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 640 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" gutterBottom>
          Start Fiscal Year Inventory Audit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Begin a new physical inventory audit for a fiscal year. All schools must complete their
          room audits before the audit can be closed.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Fiscal Year"
            placeholder="e.g., 2025-2026"
            value={fiscalYear}
            onChange={(e) => handleFiscalYearChange(e.target.value)}
            error={!!fyError}
            helperText={fyError || 'Format: YYYY-YYYY'}
            inputProps={{ maxLength: 9 }}
            fullWidth
          />

          <TextField
            label="Notes (optional)"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            inputProps={{ maxLength: 500 }}
            fullWidth
          />

          {submitError && <Alert severity="error">{submitError}</Alert>}

          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            disabled={startMutation.isPending || !fiscalYear.trim()}
            startIcon={
              startMutation.isPending ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {startMutation.isPending ? 'Starting…' : 'Start Audit'}
          </Button>
        </Box>
      </Paper>

      {/* Previous audits table */}
      {(auditsLoading || completedAudits.length > 0) && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle1" gutterBottom>
            Previous Fiscal Year Audits
          </Typography>

          {auditsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Year</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Completed Date</TableCell>
                  <TableCell>Locations</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {completedAudits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell>{audit.fiscalYear}</TableCell>
                    <TableCell>
                      <Chip
                        label={audit.status}
                        size="small"
                        color={audit.status === 'COMPLETED' ? 'success' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>
                      {audit.completedAt
                        ? new Date(audit.completedAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {audit.completedLocations} / {audit.totalLocations}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}

      {/* Conflict dialog */}
      <Dialog open={conflictOpen} onClose={() => setConflictOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Fiscal Year Audit Conflict</DialogTitle>
        <DialogContent>
          <Alert severity={conflictCanResume ? 'info' : 'warning'} sx={{ mt: 1 }}>
            {conflictMessage}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictOpen(false)} color="inherit" disabled={resuming}>
            Dismiss
          </Button>
          {conflictCanResume && (
            <Button
              onClick={handleResume}
              variant="contained"
              color="primary"
              disabled={resuming}
              startIcon={resuming ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {resuming ? 'Loading…' : 'Resume Audit'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

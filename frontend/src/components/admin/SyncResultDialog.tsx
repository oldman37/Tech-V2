import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Typography,
  Button,
  Box,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { SyncResultDetail } from '../../services/adminService';

interface SyncResultDialogProps {
  open: boolean;
  onClose: () => void;
  result: SyncResultDetail | null;
  isLoading: boolean;
  syncType: 'all' | 'staff' | 'students';
  errorMessage?: string;
  summaryMessage?: string;
  hasAttempted: boolean;
}

const syncTypeLabel: Record<'all' | 'staff' | 'students', string> = {
  all: 'Full Entra Sync',
  staff: 'Staff Sync',
  students: 'Student Sync',
};

export const SyncResultDialog: React.FC<SyncResultDialogProps> = ({
  open,
  onClose,
  result,
  isLoading,
  syncType,
  errorMessage,
  summaryMessage,
  hasAttempted,
}) => {
  const hasErrors = result ? result.errors > 0 : false;
  const durationSec = result ? (result.durationMs / 1000).toFixed(1) : null;

  const titleText = (): string => {
    if (isLoading || !hasAttempted) return 'Syncing Users...';
    if (!result) return 'Sync Failed';
    return hasErrors ? 'Sync Completed with Errors' : 'Sync Complete';
  };

  const titleIcon = () => {
    if (isLoading || !hasAttempted) return null;
    if (!result) return <ErrorIcon sx={{ color: 'error.main', mr: 1 }} />;
    return hasErrors
      ? <WarningIcon sx={{ color: 'warning.main', mr: 1 }} />
      : <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />;
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {titleIcon()}
          <Typography variant="h6" component="span">
            {syncTypeLabel[syncType]} — {titleText()}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {isLoading || !hasAttempted ? (
          <Box>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Fetching users from Microsoft Entra ID and updating the database. This may take a few minutes...
            </Typography>
          </Box>
        ) : result ? (
          <Box>
            {summaryMessage && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {summaryMessage}
              </Typography>
            )}
            <Table size="small" sx={{ mb: 2 }}>
              <TableBody>
                <TableRow>
                  <TableCell>Total Processed</TableCell>
                  <TableCell align="right">
                    <strong>{result.totalProcessed}</strong>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">
                    {result.added > 0
                      ? <Chip label={result.added} color="success" size="small" />
                      : <strong>{result.added}</strong>}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">
                    <strong>{result.updated}</strong>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Deactivated</TableCell>
                  <TableCell align="right">
                    {result.deactivated > 0
                      ? <Chip label={result.deactivated} color="warning" size="small" />
                      : <strong>{result.deactivated}</strong>}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Errors</TableCell>
                  <TableCell align="right">
                    {result.errors > 0
                      ? <Chip label={result.errors} color="error" size="small" />
                      : <strong>{result.errors}</strong>}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Duration</TableCell>
                  <TableCell align="right">
                    <strong>{durationSec}s</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {result.errors > 0 && result.errorDetails.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">
                    Error Details ({result.errorDetails.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    sx={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                    }}
                  >
                    {result.errorDetails.map((item, i) => (
                      <Typography
                        key={i}
                        variant="caption"
                        display="block"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        <span style={{ opacity: 0.6 }}>{item.entraId}:</span> {item.message}
                      </Typography>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {errorMessage ?? 'The sync process encountered an unexpected error. Please check the server logs and try again.'}
          </Typography>
        )}
      </DialogContent>

      {!isLoading && hasAttempted && (
        <DialogActions>
          <Button onClick={onClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default SyncResultDialog;

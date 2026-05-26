import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useAuditSessions } from '@/hooks/queries/useInventoryAudit';
import { AuditSession, AuditSessionStatus } from '@/types/inventoryAudit.types';

const STATUS_COLORS: Record<AuditSessionStatus, 'warning' | 'success' | 'default'> = {
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  ABANDONED: 'default',
};

const STATUS_LABELS: Record<AuditSessionStatus, string> = {
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
};

export function InventoryAuditHistoryPage() {
  const [page] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading, error } = useAuditSessions({ page, limit: 50 });

  const sessions: AuditSession[] = data?.sessions ?? [];

  const handleRowClick = (session: AuditSession) => {
    if (session.status === 'IN_PROGRESS') {
      navigate('/inventory-audit', { state: { resumeSessionId: session.id } });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Audit History
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error">
          {(error as any)?.response?.data?.message ?? 'Failed to load audit history.'}
        </Alert>
      )}

      {!isLoading && !error && (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>School / Office</TableCell>
                  <TableCell>Room</TableCell>
                  <TableCell>Conducted By</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Present</TableCell>
                  <TableCell align="right">Missing</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No audit sessions found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <Tooltip
                      key={session.id}
                      title={
                        session.status === 'IN_PROGRESS' ? 'Click to resume this audit' : ''
                      }
                    >
                      <TableRow
                        hover
                        onClick={() => handleRowClick(session)}
                        sx={{
                          cursor: session.status === 'IN_PROGRESS' ? 'pointer' : 'default',
                        }}
                      >
                        <TableCell>
                          {session.officeLocation?.name ?? '—'}
                        </TableCell>
                        <TableCell>{session.room?.name ?? '—'}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{session.conductedByName}</Typography>
                        </TableCell>
                        <TableCell>
                          {new Date(session.startedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {session.completedAt
                            ? new Date(session.completedAt).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABELS[session.status]}
                            size="small"
                            color={STATUS_COLORS[session.status]}
                          />
                        </TableCell>
                        <TableCell align="right">{session.totalItems}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={session.presentCount > 0 ? 'success.main' : 'text.secondary'}
                          >
                            {session.presentCount}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={session.missingCount > 0 ? 'error.main' : 'text.secondary'}
                          >
                            {session.missingCount}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </Tooltip>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {data && data.total > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing {sessions.length} of {data.total} sessions
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

export default InventoryAuditHistoryPage;

/**
 * AssignmentHistoryList Component
 * Timeline/list view of assignment history for equipment
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import {
  PersonAdd as AssignIcon,
  PersonRemove as UnassignIcon,
  SwapHoriz as TransferIcon,
  Room as RoomIcon,
  Business as LocationIcon,
} from '@mui/icons-material';
import assignmentService from '../../services/assignment.service';
import { AssignmentHistory } from '../../types/assignment.types';

interface AssignmentHistoryListProps {
  equipmentId: string;
  limit?: number;
}

export const AssignmentHistoryList = ({
  equipmentId,
  limit = 10,
}: AssignmentHistoryListProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssignmentHistory[]>([]);

  useEffect(() => {
    loadHistory();
  }, [equipmentId]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await assignmentService.getHistory(equipmentId, { limit });
      setHistory(response.history);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load assignment history');
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'assigned':
      case 'user':
        return <AssignIcon color="primary" />;
      case 'unassigned':
      case 'unassign':
        return <UnassignIcon color="error" />;
      case 'transferred':
        return <TransferIcon color="secondary" />;
      case 'room':
        return <RoomIcon color="secondary" />;
      case 'location':
        return <LocationIcon color="info" />;
      default:
        return <AssignIcon />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'user':
        return 'primary';
      case 'room':
        return 'secondary';
      case 'location':
        return 'info';
      case 'unassign':
        return 'error';
      default:
        return 'default';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'user':
        return 'User Assignment';
      case 'room':
        return 'Room Assignment';
      case 'location':
        return 'Location Assignment';
      case 'unassign':
        return 'Unassigned';
      default:
        return action;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (history.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No assignment history available
        </Typography>
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ maxHeight: 500, overflow: 'auto' }}>
      <List>
        {history.map((entry, index) => (
          <Box key={entry.id}>
            <ListItem alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 48, mt: 1 }}>
                {getActionIcon(entry.assignmentType)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip
                      label={getActionLabel(entry.assignmentType)}
                      size="small"
                      color={getActionColor(entry.assignmentType) as any}
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(entry.assignedAt)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" component="div" gutterBottom>
                      <strong>Assigned to:</strong> {entry.assignedToName}
                    </Typography>
                    {entry.user && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Email:</strong> {entry.user.email}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>By:</strong> {entry.assignedByName}
                    </Typography>
                    {entry.notes && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Notes:</strong> {entry.notes}
                      </Typography>
                    )}
                    {entry.unassignedAt && (
                      <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                        Unassigned on {formatDate(entry.unassignedAt)}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </ListItem>
            {index < history.length - 1 && <Divider variant="inset" component="li" />}
          </Box>
        ))}
      </List>
    </Paper>
  );
};

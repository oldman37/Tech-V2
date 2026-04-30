import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  Checkbox,
  TextField,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Typography,
  Box,
  Tooltip,
  Alert,
} from '@mui/material';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useQuery } from '@tanstack/react-query';
import { userService } from '@/services/userService';
import { queryKeys } from '@/lib/queryKeys';
import {
  useAssignUsersToRoom,
  useUnassignUserFromRoom,
  useSetPrimaryRoom,
} from '@/hooks/mutations/useRoomAssignmentMutations';
import { RoomWithAssignments, MergedAssignment } from '@/types/userRoomAssignment.types';

interface RoomAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  room: RoomWithAssignments;
  locationId: string;
  isAdmin?: boolean;
}

export function RoomAssignmentDialog({
  open,
  onClose,
  room,
  locationId,
  isAdmin = false,
}: RoomAssignmentDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const assignMutation = useAssignUsersToRoom(locationId);
  const unassignMutation = useUnassignUserFromRoom(locationId);
  const setPrimaryMutation = useSetPrimaryRoom(locationId);

  // Fetch all active users for this location
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: [...queryKeys.users.lists(), { locationId, accountType: 'staff', limit: 500 }],
    queryFn: () => userService.getUsers(1, 500, '', 'staff', locationId),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const assignedUserIds = useMemo(
    () => new Set(room.assignedUsers.map((a) => a.userId)),
    [room.assignedUsers]
  );

  // Filter available users: not already assigned + match search text
  const availableUsers = useMemo(() => {
    const allUsers = usersData?.users ?? [];
    return allUsers.filter((u) => {
      if (assignedUserIds.has(u.id)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });
  }, [usersData, assignedUserIds, search]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAssign = () => {
    if (selectedUserIds.size === 0) return;
    assignMutation.mutate(
      { roomId: room.id, userIds: Array.from(selectedUserIds) },
      {
        onSuccess: () => {
          setSelectedUserIds(new Set());
          setSearch('');
        },
      }
    );
  };

  const handleUnassign = (assignment: MergedAssignment) => {
    if (assignment.source === 'primary') {
      setPrimaryMutation.mutate({ userId: assignment.userId, roomId: null });
    } else {
      unassignMutation.mutate({ roomId: room.id, userId: assignment.userId });
    }
  };

  const handleClose = () => {
    setSelectedUserIds(new Set());
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          Manage Assignments —{' '}
          <Typography component="span" fontWeight={700}>
            {room.name}
          </Typography>
          {room.type && (
            <Chip label={room.type} size="small" variant="outlined" />
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Section 1: Currently Assigned Users */}
        <Typography variant="subtitle2" gutterBottom fontWeight={600}>
          Currently Assigned ({room.assignedUsers.length})
        </Typography>

        {room.assignedUsers.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No users assigned to this room yet.
          </Typography>
        ) : (
          <List dense disablePadding sx={{ mb: 2 }}>
            {room.assignedUsers.map((assignment) => {
              const u = assignment.user;
              const initials = `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
              return (
                <ListItem
                  key={assignment.userId}
                  secondaryAction={
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {isAdmin && assignment.source !== 'primary' && (
                        <Tooltip title="Set as primary room">
                          <span>
                            <Button
                              variant="text"
                              size="small"
                              disabled={setPrimaryMutation.isPending}
                              onClick={() =>
                                setPrimaryMutation.mutate({
                                  userId: assignment.userId,
                                  roomId: room.id,
                                })
                              }
                              sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}
                            >
                              Set Primary
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Unassign">
                        <span>
                          <IconButton
                            edge="end"
                            size="small"
                            color="error"
                            onClick={() => handleUnassign(assignment)}
                            disabled={unassignMutation.isPending || setPrimaryMutation.isPending}
                          >
                            <PersonRemoveIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  }
                  disablePadding
                  sx={{ py: 0.5 }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>
                      {initials}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box component="span" display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                        <span>{u.displayName ?? `${u.firstName} ${u.lastName}`}</span>
                        {assignment.source === 'primary' && (
                          <Chip label="Primary Room" size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                        )}
                      </Box>
                    }
                    secondary={u.email}
                    primaryTypographyProps={{ variant: 'body2', component: 'div' } as object}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}

        {(assignMutation.isError || unassignMutation.isError) && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {(assignMutation.error as Error)?.message ??
              (unassignMutation.error as Error)?.message ??
              'An error occurred. Please try again.'}
          </Alert>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Section 2: Add Users */}
        <Typography variant="subtitle2" gutterBottom fontWeight={600}>
          Add Users
        </Typography>

        <TextField
          size="small"
          fullWidth
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
        />

        {usersLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : availableUsers.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {search
              ? 'No matching users found.'
              : 'All users from this location are already assigned.'}
          </Typography>
        ) : (
          <List
            dense
            disablePadding
            sx={{ maxHeight: 240, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            {availableUsers.map((u) => {
              const initials = `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
              const checked = selectedUserIds.has(u.id);
              return (
                <ListItem
                  key={u.id}
                  disablePadding
                  secondaryAction={
                    <Checkbox
                      edge="end"
                      size="small"
                      checked={checked}
                      onChange={() => handleToggleUser(u.id)}
                    />
                  }
                  onClick={() => handleToggleUser(u.id)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>
                      {initials}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={u.displayName ?? `${u.firstName} ${u.lastName}`}
                    secondary={u.jobTitle ?? u.email}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}

        {selectedUserIds.size > 0 && (
          <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
            {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={handleClose} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={
            assignMutation.isPending ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PersonAddIcon />
            )
          }
          disabled={selectedUserIds.size === 0 || assignMutation.isPending}
          onClick={handleAssign}
        >
          Assign Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
}

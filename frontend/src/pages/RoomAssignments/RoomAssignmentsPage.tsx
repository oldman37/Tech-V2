import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Grid,
  Alert,
  Skeleton,
} from '@mui/material';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PeopleIcon from '@mui/icons-material/People';
import { useLocations } from '@/hooks/queries/useLocations';
import { useLocationRoomAssignments } from '@/hooks/queries/useRoomAssignments';
import { useRoomAssignmentAccess } from '@/hooks/useRoomAssignmentAccess';
import { RoomAssignmentDialog } from './RoomAssignmentDialog';
import { RoomWithAssignments } from '@/types/userRoomAssignment.types';

export function RoomAssignmentsPage() {
  const { isAdmin, isPrincipalOrVP, isPrimarySupervisor, primarySupervisorLocationIds } =
    useRoomAssignmentAccess();

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [dialogRoom, setDialogRoom] = useState<RoomWithAssignments | null>(null);

  // For primary supervisors / principals (non-admin): auto-select their location
  useEffect(() => {
    if (!isAdmin && isPrimarySupervisor && primarySupervisorLocationIds.length > 0) {
      setSelectedLocationId(primarySupervisorLocationIds[0]);
    }
  }, [isAdmin, isPrimarySupervisor, primarySupervisorLocationIds]);

  // Admins and Principals/VPs without a primary location: fetch all locations for the selector
  const showLocationSelector = isAdmin || (isPrincipalOrVP && !isPrimarySupervisor);
  const { data: allLocations = [], isLoading: locationsLoading } = useLocations({
    enabled: showLocationSelector,
  });

  // Fetch rooms + assignments once a location is chosen
  const {
    data: assignmentData,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useLocationRoomAssignments(selectedLocationId);

  return (
    <Box sx={{ p: 3 }}>
      {/* Page header */}
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <MeetingRoomIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Room Assignments
        </Typography>
      </Box>

      {/* Location selector — admins and principals/VPs without a primary supervised location */}
      {showLocationSelector && (
        <FormControl size="small" sx={{ minWidth: 300, mb: 3 }}>
          <InputLabel>Select Location</InputLabel>
          <Select
            value={selectedLocationId}
            label="Select Location"
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={locationsLoading}
          >
            <MenuItem value="">
              <em>— Choose a location —</em>
            </MenuItem>
            {allLocations.map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>
                {loc.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Show location name for primary supervisors */}
      {!showLocationSelector && isPrimarySupervisor && assignmentData && (
        <Typography variant="subtitle1" color="text.secondary" mb={2}>
          {assignmentData.location.name}
        </Typography>
      )}

      {/* Prompt to select a location */}
      {!selectedLocationId && (
        <Alert severity="info" sx={{ maxWidth: 500 }}>
          {showLocationSelector
            ? 'Select a location above to manage room assignments.'
            : 'Loading your assigned location…'}
        </Alert>
      )}

      {/* Loading state */}
      {selectedLocationId && assignmentsLoading && (
        <Grid container spacing={2}>
          {[...Array(6)].map((_, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Error state */}
      {selectedLocationId && assignmentsError && (
        <Alert severity="error">
          Failed to load room assignments. Please try again.
        </Alert>
      )}

      {/* Summary row */}
      {selectedLocationId && assignmentData && !assignmentsLoading && (
        <>
          <Box display="flex" gap={2} mb={2}>
            <Chip
              icon={<MeetingRoomIcon />}
              label={`${assignmentData.totalRooms} room${assignmentData.totalRooms !== 1 ? 's' : ''}`}
              variant="outlined"
            />
            <Chip
              icon={<PeopleIcon />}
              label={`${assignmentData.totalAssignments} assignment${assignmentData.totalAssignments !== 1 ? 's' : ''}`}
              variant="outlined"
              color="primary"
            />
          </Box>

          {assignmentData.rooms.length === 0 && (
            <Alert severity="info">
              No active rooms found for this location.
            </Alert>
          )}

          {/* Room cards grid */}
          <Grid container spacing={2}>
            {assignmentData.rooms.map((room) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={room.id}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                      <Typography variant="subtitle1" fontWeight={600} noWrap>
                        {room.name}
                      </Typography>
                      {room.type && (
                        <Chip
                          label={room.type}
                          size="small"
                          variant="outlined"
                          sx={{ ml: 1, flexShrink: 0, fontSize: 10 }}
                        />
                      )}
                    </Box>

                    {room.building && (
                      <Typography variant="caption" color="text.secondary">
                        {room.building}
                        {room.floor != null ? ` · Floor ${room.floor}` : ''}
                      </Typography>
                    )}

                    <Box display="flex" alignItems="center" gap={0.5} mt={1}>
                      <PeopleIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        {room.assignedUsers.length === 0
                          ? 'No users assigned'
                          : `${room.assignedUsers.length} user${room.assignedUsers.length !== 1 ? 's' : ''} assigned`}
                      </Typography>
                    </Box>
                  </CardContent>

                  <CardActions sx={{ pt: 0 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setDialogRoom(room)}
                      startIcon={<MeetingRoomIcon />}
                    >
                      Manage Assignments
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Room assignment dialog */}
      {dialogRoom && selectedLocationId && (
        <RoomAssignmentDialog
          open={Boolean(dialogRoom)}
          onClose={() => setDialogRoom(null)}
          room={
            // Always use fresh data from the query (not the click-time snapshot)
            assignmentData?.rooms.find((r) => r.id === dialogRoom.id) ?? dialogRoom
          }
          locationId={selectedLocationId}
          isAdmin={isAdmin}
        />
      )}
    </Box>
  );
}

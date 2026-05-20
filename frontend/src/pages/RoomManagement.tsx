import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import roomService from '../services/roomService';
import locationService from '../services/location.service';
import { RoomWithLocation, CreateRoomRequest, UpdateRoomRequest, RoomType } from '../types/room.types';
import { OfficeLocation } from '../types/location.types';
import RoomFormModal from '../components/RoomFormModal';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRooms } from '../hooks/queries/useRooms';
import { useIsMobile } from '../hooks/useResponsive';
import { ResponsiveTable, MobileFilterBar, Column } from '../components/responsive';

export const RoomManagement = () => {
  // URL-based pagination and filter state
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  
  // Extract pagination from URL (with defaults)
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomWithLocation | null>(null);
  
  // Filter state (extracted from URL)
  const [filters, setFilters] = useState<{
    locationId: string;
    type: RoomType | '';
    search: string;
    isActive: boolean;
  }>({
    locationId: searchParams.get('locationId') || '',
    type: (searchParams.get('type') as RoomType) || '',
    search: searchParams.get('search') || '',
    isActive: searchParams.get('isActive') !== 'false', // default true
  });

  // Screen reader announcement for accessibility
  const [announcement, setAnnouncement] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Use React Query hook for paginated rooms
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = usePaginatedRooms({
    page: currentPage,
    limit: pageSize,
    locationId: filters.locationId || undefined,
    type: filters.type || undefined,
    search: filters.search || undefined,
    isActive: filters.isActive,
  });

  const rooms = data?.rooms || [];
  const pagination = data?.pagination;

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const locationsData = await locationService.getAllLocations();
      setLocations(locationsData);
    } catch (err: any) {
      // Fail silently - locations filter will be empty
      // Main room data still loads via React Query
    }
  };

  /**
   * Handle filter changes and reset to page 1
   * Updates URL with new filters
   */
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    
    // Update URL with new filters
    const params = new URLSearchParams();
    params.set('page', '1'); // Reset to first page
    params.set('pageSize', pageSize.toString());
    
    if (newFilters.locationId) params.set('locationId', newFilters.locationId);
    if (newFilters.type) params.set('type', newFilters.type);
    if (newFilters.search) params.set('search', newFilters.search);
    params.set('isActive', newFilters.isActive.toString());
    
    setSearchParams(params);
  };

  /**
   * Handle page changes
   * Updates URL and scrolls to top for better UX
   */
  const handlePageChange = (page: number) => {
    searchParams.set('page', page.toString());
    setSearchParams(searchParams);
    
    // Announce page change for screen readers
    setAnnouncement(`Page ${page} of ${pagination?.totalPages} loaded`);
    
    // Scroll to top for better UX
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Handle page size changes
   * Resets to page 1 since page boundaries change
   */
  const handlePageSizeChange = (newPageSize: number) => {
    searchParams.set('pageSize', newPageSize.toString());
    searchParams.set('page', '1'); // Reset to first page
    setSearchParams(searchParams);
  };

  const handleCreateRoom = async (data: CreateRoomRequest) => {
    await roomService.createRoom(data);
    await refetch(); // Refetch current page
  };

  const handleUpdateRoom = async (data: UpdateRoomRequest) => {
    if (!editingRoom) return;
    await roomService.updateRoom(editingRoom.id, data);
    await refetch(); // Refetch current page
  };

  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!window.confirm(`Are you sure you want to deactivate room "${roomName}"?`)) {
      return;
    }

    try {
      await roomService.deleteRoom(roomId, false);
      await refetch(); // Refetch current page
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete room');
    }
  };

  const handleToggleActive = async (room: RoomWithLocation) => {
    try {
      await roomService.updateRoom(room.id, { isActive: !room.isActive });
      await refetch(); // Refetch current page
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update room status');
    }
  };

  const openCreateModal = () => {
    setEditingRoom(null);
    setIsModalOpen(true);
  };

  const openEditModal = (room: RoomWithLocation) => {
    setEditingRoom(room);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
  };

  const getRoomTypeLabel = (type: RoomType | null): string => {
    if (!type) return 'General';
    return type.replace(/_/g, ' ');
  };

  const getRoomTypeBadgeClass = (type: RoomType | null): string => {
    // Map room types to standard badge classes from global.css
    const typeMap: Record<string, string> = {
      CLASSROOM: 'badge-success',
      OFFICE: 'badge-success',
      GYM: 'badge-success',
      CAFETERIA: 'badge-error',
      LIBRARY: 'badge-success',
      LAB: 'badge-success',
      MAINTENANCE: 'badge-error',
      SPORTS: 'badge-success',
      MUSIC: 'badge-success',
      MEDICAL: 'badge-error',
      CONFERENCE: 'badge-success',
      TECHNOLOGY: 'badge-success',
      TRANSPORTATION: 'badge-error',
      SPECIAL_ED: 'badge-success',
      GENERAL: 'badge-error',
      OTHER: 'badge-error',
    };
    return typeMap[type || 'GENERAL'] || 'badge-error';
  };

  // Wrapper handler to properly handle union types for form submission
  const handleFormSubmit = async (data: CreateRoomRequest | UpdateRoomRequest) => {
    if (editingRoom) {
      // When editing, data should be UpdateRoomRequest
      await handleUpdateRoom(data as UpdateRoomRequest);
    } else {
      // When creating, data should be CreateRoomRequest
      await handleCreateRoom(data as CreateRoomRequest);
    }
  };

  // Group paginated rooms by location for display
  const groupedRooms = rooms.reduce((acc, room) => {
    const locationName = room.location.name;
    if (!acc[locationName]) {
      acc[locationName] = [];
    }
    acc[locationName].push(room);
    return acc;
  }, {} as Record<string, RoomWithLocation[]>);

  // Column definitions for ResponsiveTable
  const roomColumns: Column<RoomWithLocation>[] = [
    {
      key: 'name',
      label: 'Room',
      isPrimary: true,
      render: (room) => (
        <>
          <strong style={{ display: 'block', fontWeight: 600 }}>{room.name}</strong>
          {room.notes && (
            <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>{room.notes}</div>
          )}
        </>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      hideOnMobile: true,
      render: (room) => (
        <span className={`badge ${getRoomTypeBadgeClass(room.type)}`}>
          {getRoomTypeLabel(room.type)}
        </span>
      ),
    },
    {
      key: 'building',
      label: 'Building',
      isSecondary: true,
      render: (room) => <>{room.building || '—'}</>,
    },
    {
      key: 'floor',
      label: 'Floor',
      hideOnMobile: true,
      render: (room) => <>{room.floor !== null ? room.floor : '—'}</>,
    },
    {
      key: 'capacity',
      label: 'Capacity',
      hideOnMobile: true,
      render: (room) => <>{room.capacity !== null ? room.capacity : '—'}</>,
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (room) => (
        <span className={`badge ${room.isActive ? 'badge-success' : 'badge-error'}`}>
          {room.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  const activeFilterCount =
    (filters.locationId ? 1 : 0) + (filters.type ? 1 : 0) + (!filters.isActive ? 1 : 0);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Screen reader announcement for accessibility */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        {announcement}
      </div>

      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Room Management</Typography>
          <Typography variant="body2" color="text.secondary">Manage rooms and spaces across all locations</Typography>
        </Box>
        <Button variant="contained" onClick={openCreateModal}>
          + Add Room
        </Button>
      </Box>

      {/* Stats Summary */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
        <div className="card">
          <p className="form-label">Total Rooms</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
            {pagination?.total || 0}
          </p>
        </div>
        <div className="card">
          <p className="form-label">Locations</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-900)' }}>
            {locations.length}
          </p>
        </div>
        <div className="card">
          <p className="form-label">Active (this page)</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--emerald-800)' }}>
            {rooms.filter(r => r.isActive).length}
          </p>
        </div>
        <div className="card">
          <p className="form-label">Inactive (this page)</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--slate-400)' }}>
            {rooms.filter(r => !r.isActive).length}
          </p>
        </div>
      </Box>

      {/* Filters */}
      {isMobile ? (
        <Box sx={{ mb: 2 }}>
          <MobileFilterBar
            searchValue={filters.search}
            onSearchChange={(value) => handleFilterChange({ ...filters, search: value })}
            filterCount={activeFilterCount}
            onOpenFilters={() => setFilterDrawerOpen(!filterDrawerOpen)}
            searchPlaceholder="Search rooms…"
          />
          {filterDrawerOpen && (
            <Paper sx={{ p: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Location</InputLabel>
                  <Select
                    value={filters.locationId}
                    label="Location"
                    onChange={(e) => handleFilterChange({ ...filters, locationId: e.target.value })}
                  >
                    <MenuItem value="">All Locations</MenuItem>
                    {locations.map((loc) => (
                      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filters.type}
                    label="Type"
                    onChange={(e) => handleFilterChange({ ...filters, type: e.target.value as RoomType | '' })}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    <MenuItem value="CLASSROOM">Classroom</MenuItem>
                    <MenuItem value="OFFICE">Office</MenuItem>
                    <MenuItem value="GYM">Gym</MenuItem>
                    <MenuItem value="CAFETERIA">Cafeteria</MenuItem>
                    <MenuItem value="LIBRARY">Library</MenuItem>
                    <MenuItem value="LAB">Lab</MenuItem>
                    <MenuItem value="MAINTENANCE">Maintenance</MenuItem>
                    <MenuItem value="SPORTS">Sports</MenuItem>
                    <MenuItem value="MUSIC">Music</MenuItem>
                    <MenuItem value="MEDICAL">Medical</MenuItem>
                    <MenuItem value="CONFERENCE">Conference</MenuItem>
                    <MenuItem value="TECHNOLOGY">Technology</MenuItem>
                    <MenuItem value="TRANSPORTATION">Transportation</MenuItem>
                    <MenuItem value="SPECIAL_ED">Special Ed</MenuItem>
                    <MenuItem value="GENERAL">General</MenuItem>
                    <MenuItem value="OTHER">Other</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.isActive.toString()}
                    label="Status"
                    onChange={(e) => handleFilterChange({ ...filters, isActive: e.target.value === 'true' })}
                  >
                    <MenuItem value="true">Active Only</MenuItem>
                    <MenuItem value="false">Inactive Only</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Paper>
          )}
        </Box>
      ) : (
        <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Location</InputLabel>
            <Select
              value={filters.locationId}
              label="Location"
              onChange={(e) => handleFilterChange({ ...filters, locationId: e.target.value })}
            >
              <MenuItem value="">All Locations</MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={filters.type}
              label="Type"
              onChange={(e) => handleFilterChange({ ...filters, type: e.target.value as RoomType | '' })}
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="CLASSROOM">Classroom</MenuItem>
              <MenuItem value="OFFICE">Office</MenuItem>
              <MenuItem value="GYM">Gym</MenuItem>
              <MenuItem value="CAFETERIA">Cafeteria</MenuItem>
              <MenuItem value="LIBRARY">Library</MenuItem>
              <MenuItem value="LAB">Lab</MenuItem>
              <MenuItem value="MAINTENANCE">Maintenance</MenuItem>
              <MenuItem value="SPORTS">Sports</MenuItem>
              <MenuItem value="MUSIC">Music</MenuItem>
              <MenuItem value="MEDICAL">Medical</MenuItem>
              <MenuItem value="CONFERENCE">Conference</MenuItem>
              <MenuItem value="TECHNOLOGY">Technology</MenuItem>
              <MenuItem value="TRANSPORTATION">Transportation</MenuItem>
              <MenuItem value="SPECIAL_ED">Special Ed</MenuItem>
              <MenuItem value="GENERAL">General</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.isActive.toString()}
              label="Status"
              onChange={(e) => handleFilterChange({ ...filters, isActive: e.target.value === 'true' })}
            >
              <MenuItem value="true">Active Only</MenuItem>
              <MenuItem value="false">Inactive Only</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            placeholder="Search rooms..."
            value={filters.search}
            onChange={(e) => handleFilterChange({ ...filters, search: e.target.value })}
            sx={{ minWidth: 200 }}
          />
        </Paper>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ 
            width: '3rem', 
            height: '3rem', 
            border: '4px solid var(--slate-200)',
            borderTop: '4px solid var(--primary-blue)',
            borderRadius: '50%',
            margin: '0 auto 1rem',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: 'var(--slate-600)' }}>Loading rooms...</p>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="badge badge-error" style={{ padding: '1rem', display: 'block', marginBottom: '1.5rem' }}>
          {error?.message || 'Failed to fetch rooms'}
        </div>
      )}

      {/* Rooms List */}
      {!isLoading && !isError && (
        <>
          {Object.keys(groupedRooms).length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--slate-500)', marginBottom: '1rem' }}>
                No rooms found matching your filters.
              </p>
              <button onClick={openCreateModal} className="btn btn-secondary">
                Create First Room
              </button>
            </div>
          ) : (
            <>
              {Object.entries(groupedRooms).map(([locationName, locationRooms]) => (
                <Box key={locationName} className="card" sx={{ mb: 3, p: 0 }}>
                  <div style={{ 
                    padding: '1rem 1.5rem', 
                    backgroundColor: 'var(--slate-50)', 
                    borderBottom: '1px solid var(--slate-200)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--slate-900)' }}>
                      {locationName}
                    </h3>
                    <span style={{ fontSize: '0.875rem', color: 'var(--slate-500)' }}>
                      ({locationRooms.length} rooms)
                    </span>
                  </div>

                  <ResponsiveTable<RoomWithLocation>
                    columns={roomColumns}
                    rows={locationRooms}
                    getRowKey={(room) => room.id}
                    rowActions={(room) => (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => openEditModal(room)} className="btn btn-sm btn-secondary">Edit</button>
                        <button onClick={() => handleToggleActive(room)} className="btn btn-sm btn-secondary">
                          {room.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        {room.isActive && (
                          <button onClick={() => handleDeleteRoom(room.id, room.name)} className="btn btn-sm btn-danger">Delete</button>
                        )}
                      </div>
                    )}
                  />
                </Box>
              ))}

              {/* Pagination Controls */}
              {pagination && pagination.totalPages > 1 && (
                <PaginationControls
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.total}
                  pageSize={pagination.limit}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  itemLabel="rooms"
                />
              )}
            </>
          )}
        </>
      )}

      {/* MODAL - Keep existing RoomFormModal */}
      <RoomFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        room={editingRoom}
        title={editingRoom ? 'Edit Room' : 'Create New Room'}
      />

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
};

export default RoomManagement;

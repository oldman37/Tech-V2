import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import roomService from '../services/roomService';
import locationService from '../services/location.service';
import { RoomWithLocation, CreateRoomRequest, UpdateRoomRequest, RoomType } from '../types/room.types';
import { OfficeLocation } from '../types/location.types';
import RoomFormModal from '../components/RoomFormModal';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRooms } from '../hooks/queries/useRooms';

export const RoomManagement = () => {
  // URL-based pagination and filter state
  const [searchParams, setSearchParams] = useSearchParams();
  
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

  return (
    <div>
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

      {/* MAIN CONTENT */}
      <main className="page-content">
        <div className="container">
          {/* Page Header */}
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <h2 className="page-title">Room Management</h2>
              <p className="page-description">Manage rooms and spaces across all locations</p>
            </div>
            <button onClick={openCreateModal} className="btn btn-primary">
              + Add Room
            </button>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-4 gap-6 mb-6">
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
          </div>

          {/* Filters */}
          <div className="card mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="form-label">Location</label>
                <select
                  value={filters.locationId}
                  onChange={(e) => handleFilterChange({ ...filters, locationId: e.target.value })}
                  className="form-select"
                >
                  <option value="">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange({ ...filters, type: e.target.value as RoomType | '' })}
                  className="form-select"
                >
                  <option value="">All Types</option>
                  <option value="CLASSROOM">Classroom</option>
                  <option value="OFFICE">Office</option>
                  <option value="GYM">Gym</option>
                  <option value="CAFETERIA">Cafeteria</option>
                  <option value="LIBRARY">Library</option>
                  <option value="LAB">Lab</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="SPORTS">Sports</option>
                  <option value="MUSIC">Music</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="CONFERENCE">Conference</option>
                  <option value="TECHNOLOGY">Technology</option>
                  <option value="TRANSPORTATION">Transportation</option>
                  <option value="SPECIAL_ED">Special Ed</option>
                  <option value="GENERAL">General</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="form-label">Status</label>
                <select
                  value={filters.isActive.toString()}
                  onChange={(e) => handleFilterChange({ ...filters, isActive: e.target.value === 'true' })}
                  className="form-select"
                >
                  <option value="true">Active Only</option>
                  <option value="false">Inactive Only</option>
                </select>
              </div>

              <div>
                <label className="form-label">Search</label>
                <input
                  type="text"
                  placeholder="Search rooms..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange({ ...filters, search: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>
          </div>

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
                    <div key={locationName} className="card mb-6" style={{ padding: 0 }}>
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

                      <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Room</th>
                              <th>Type</th>
                              <th>Building</th>
                              <th>Floor</th>
                              <th>Capacity</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {locationRooms.map((room) => (
                              <tr key={room.id} style={{ opacity: !room.isActive ? 0.6 : 1 }}>
                                <td>
                                  <strong style={{ display: 'block', fontWeight: 600 }}>
                                    {room.name}
                                  </strong>
                                  {room.notes && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
                                      {room.notes}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <span className={`badge ${getRoomTypeBadgeClass(room.type)}`}>
                                    {getRoomTypeLabel(room.type)}
                                  </span>
                                </td>
                                <td>{room.building || '—'}</td>
                                <td>{room.floor !== null ? room.floor : '—'}</td>
                                <td>{room.capacity !== null ? room.capacity : '—'}</td>
                                <td>
                                  <span className={`badge ${room.isActive ? 'badge-success' : 'badge-error'}`}>
                                    {room.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                      onClick={() => openEditModal(room)}
                                      className="btn btn-sm btn-ghost"
                                      title="Edit room"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleToggleActive(room)}
                                      className="btn btn-sm btn-ghost"
                                      title={room.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                      {room.isActive ? '🔒' : '🔓'}
                                    </button>
                                    {room.isActive && (
                                      <button
                                        onClick={() => handleDeleteRoom(room.id, room.name)}
                                        className="btn btn-sm btn-ghost"
                                        title="Deactivate room"
                                        style={{ color: 'var(--red-800)' }}
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
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
        </div>
      </main>

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
    </div>
  );
};

export default RoomManagement;

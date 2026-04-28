import React, { useState } from 'react';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'Washington DC' },
];

import {
  OfficeLocationWithSupervisors,
  SupervisorType,
  LocationType,
  SUPERVISOR_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_ICONS,
  getSupervisorDisplayName,
  AssignSupervisorRequest,
  CreateLocationRequest,
} from '../types/location.types';
import locationService from '../services/location.service';
import { UserSearchAutocomplete } from '../components/UserSearchAutocomplete';

// TanStack Query hooks
import { useLocations } from '../hooks/queries/useLocations';
import { useSupervisorsList } from '../hooks/queries/useUsers';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  useCreateLocation,
  useDeleteLocation,
  useRemoveSupervisor,
} from '../hooks/mutations/useLocationMutations';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  officeLocation?: string | null;
}

export const SupervisorManagement: React.FC = () => {
  // Modal states
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState<OfficeLocationWithSupervisors | null>(null);

  // TanStack Query hooks - automatic caching and refetching
  const {
    data: locations = [],
    isLoading: locationsLoading,
    error: locationsError,
  } = useLocations();

  const {
    data: users = [],
    isLoading: usersLoading,
  } = useSupervisorsList();

  // Mutations
  const deleteLocationMutation = useDeleteLocation();

  const handleDeleteLocation = (location: OfficeLocationWithSupervisors) => {
    if (!confirm(`Are you sure you want to delete "${location.name}"? This will also remove all supervisor assignments.`)) {
      return;
    }

    deleteLocationMutation.mutate(location.id, {
      onError: (err) => {
        alert(err instanceof Error ? err.message : 'Failed to delete location');
      },
    });
  };

  if (locationsLoading || usersLoading) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p style={{ color: 'var(--slate-600)' }}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (locationsError) {
    return (
      <div>
        <div className="container" style={{ padding: '2rem' }}>
          <div className="badge badge-error" style={{ padding: '1rem', display: 'block' }}>
            <strong>Error:</strong> Failed to load locations
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <main className="page-content">
        <div className="container">
          <div className="page-header">
            <h2 className="page-title">Office Locations & Supervisors</h2>
            <p className="page-description">
              Manage office locations and assign supervisors
            </p>
          </div>

          <LocationsTab
            locations={locations}
            onAddLocation={() => setShowAddLocation(true)}
            onEditLocation={(location) => {
              setEditingLocation(location);
              setShowEditLocation(true);
            }}
            onDeleteLocation={handleDeleteLocation}
          />
        </div>
      </main>

      {showAddLocation && (
        <AddLocationModal
          onClose={() => setShowAddLocation(false)}
          onSuccess={() => {
            setShowAddLocation(false);
          }}
        />
      )}

      {showEditLocation && editingLocation && (
        <EditLocationModal
          location={editingLocation}
          users={users}
          onClose={() => {
            setShowEditLocation(false);
            setEditingLocation(null);
          }}
          onSuccess={() => {
            setShowEditLocation(false);
            setEditingLocation(null);
          }}
        />
      )}
    </div>
  );
};

// Locations Tab
interface LocationsTabProps {
  locations: OfficeLocationWithSupervisors[];
  onAddLocation: () => void;
  onEditLocation: (location: OfficeLocationWithSupervisors) => void;
  onDeleteLocation: (location: OfficeLocationWithSupervisors) => void;
}

const LocationsTab: React.FC<LocationsTabProps> = ({ locations, onAddLocation, onEditLocation, onDeleteLocation }) => {
  const [filter, setFilter] = useState<LocationType | 'ALL'>('ALL');
  const typeOrder: Record<string, number> = { SCHOOL: 0, DISTRICT_OFFICE: 1, DEPARTMENT: 2, PROGRAM: 3 };
  const sortedLocations = [...(filter === 'ALL' ? locations : locations.filter((loc) => loc.type === filter))]
    .sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div className="flex" style={{ alignItems: 'center', gap: '1rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LocationType | 'ALL')}
            className="form-select"
            style={{ width: 'auto' }}
          >
            <option value="ALL">All Types</option>
            <option value="SCHOOL">Schools</option>
            <option value="DISTRICT_OFFICE">District Office</option>
            <option value="DEPARTMENT">Departments</option>
            <option value="PROGRAM">Programs</option>
          </select>
        </div>
        <button onClick={onAddLocation} className="btn btn-primary">
          + Add Location
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {sortedLocations.map((location) => (
          <LocationCard 
            key={location.id} 
            location={location} 
            onEdit={onEditLocation}
            onDelete={onDeleteLocation}
          />
        ))}
      </div>
    </div>
  );
};

// Location Card
interface LocationCardProps {
  location: OfficeLocationWithSupervisors;
  onEdit: (location: OfficeLocationWithSupervisors) => void;
  onDelete: (location: OfficeLocationWithSupervisors) => void;
}

const LocationCard: React.FC<LocationCardProps> = ({ location, onEdit, onDelete }) => {
  const icon = LOCATION_TYPE_ICONS[location.type];

  return (
    <div className="card">
      <div className="flex" style={{ alignItems: 'start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div className="flex" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '2rem' }}>{icon}</span>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--slate-900)' }}>
              {location.name}
            </h3>
            <div className="flex" style={{ alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span className="badge" style={{ fontSize: '0.7rem' }}>{location.code}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                {LOCATION_TYPE_LABELS[location.type]}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onEdit(location)}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.375rem 0.75rem' }}
            title="Edit location"
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => onDelete(location)}
            className="btn btn-sm"
            style={{ 
              padding: '0.375rem 0.75rem',
              backgroundColor: 'var(--error)',
              color: 'white',
              border: 'none'
            }}
            title="Delete location"
          >
            🗑️
          </button>
        </div>
      </div>

      {(location.address || location.city || location.phone) && (
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--slate-600)' }}>
          {(location.address || location.city) && (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <span>📍</span>
              <div>
                {location.address && <div>{location.address}</div>}
                {location.city && (
                  <div>
                    {location.city}{location.state && `, ${location.state}`}{location.zip && ` ${location.zip}`}
                  </div>
                )}
              </div>
            </div>
          )}
          {location.phone && <div>📞 {location.phone}</div>}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--slate-200)', paddingTop: '1rem' }}>
        <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Supervisors</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
            {location.supervisors.length}
          </span>
        </div>

        {location.supervisors.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--slate-400)', fontStyle: 'italic' }}>None assigned</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[...location.supervisors]
              .sort((a, b) => {
                const order: Record<string, number> = { PRINCIPAL: 0, VICE_PRINCIPAL: 1 };
                return (order[a.supervisorType] ?? 2) - (order[b.supervisorType] ?? 2);
              })
              .slice(0, 3).map((supervisor) => (
              <div key={supervisor.id} style={{ fontSize: '0.875rem' }}>
                <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 500, color: 'var(--slate-900)' }}>
                    {getSupervisorDisplayName(supervisor)}
                  </span>
                  {supervisor.isPrimary && <span>⭐</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                  {SUPERVISOR_TYPE_LABELS[supervisor.supervisorType]}
                </div>
              </div>
            ))}
            {location.supervisors.length > 3 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                +{location.supervisors.length - 3} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Assignments Tab
interface AssignmentsTabProps {
  locations: OfficeLocationWithSupervisors[];
  users: User[];
  onRefresh: () => void;
  onAssignSupervisor: (locationId: string) => void;
}

// Unused components kept for potential future use
// @ts-ignore - Component reserved for future use
const AssignmentsTab: React.FC<AssignmentsTabProps> = ({
  locations,
  onRefresh,
  onAssignSupervisor,
}) => {
  const [selectedLocId, setSelectedLocId] = useState<string>('');

  const selectedLocation = locations.find((loc) => loc.id === selectedLocId);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div>
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Select Location</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
            {locations.map((location) => (
              <button
                key={location.id}
                onClick={() => setSelectedLocId(location.id)}
                className="btn btn-secondary"
                style={{
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  background: selectedLocId === location.id ? 'var(--primary-blue)' : 'white',
                  color: selectedLocId === location.id ? 'white' : 'var(--slate-700)',
                  borderColor: selectedLocId === location.id ? 'var(--primary-blue)' : 'var(--slate-300)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{location.name}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                    {location.supervisors.length} supervisor(s)
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ gridColumn: 'span 2' }}>
        {selectedLocation ? (
          <div className="card">
            <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{selectedLocation.name}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
                  {LOCATION_TYPE_LABELS[selectedLocation.type]}
                </p>
              </div>
              <button onClick={() => onAssignSupervisor(selectedLocation.id)} className="btn btn-primary">
                + Assign Supervisor
              </button>
            </div>

            {selectedLocation.supervisors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--slate-500)' }}>
                No supervisors assigned to this location
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedLocation.supervisors.map((supervisor) => (
                  <SupervisorAssignmentCard
                    key={supervisor.id}
                    supervisor={supervisor}
                    locationId={selectedLocation.id}
                    onRemove={onRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--slate-500)' }}>
            Select a location to view and manage supervisors
          </div>
        )}
      </div>
    </div>
  );
};

// Supervisor Assignment Card
interface SupervisorAssignmentCardProps {
  supervisor: OfficeLocationWithSupervisors['supervisors'][0];
  locationId: string;
  onRemove: () => void;
}

const SupervisorAssignmentCard: React.FC<SupervisorAssignmentCardProps> = ({
  supervisor,
  locationId,
}) => {
  // Use TanStack Query mutation
  const removeSupervisorMutation = useRemoveSupervisor();

  const handleRemove = () => {
    if (!confirm('Remove this supervisor assignment?')) return;

    removeSupervisorMutation.mutate(
      { locationId, supervisorId: supervisor.userId, supervisorType: supervisor.supervisorType },
      {
        onError: (error) => {
          alert('Failed to remove supervisor: ' + (error instanceof Error ? error.message : 'Unknown error'));
        },
      }
    );
  };

  return (
    <div style={{ 
      border: '1px solid var(--slate-200)', 
      borderRadius: 'var(--radius-lg)', 
      padding: '1rem' 
    }}>
      <div className="flex" style={{ alignItems: 'start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div className="flex" style={{ alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h4 style={{ fontWeight: 600, color: 'var(--slate-900)', margin: 0 }}>
              {getSupervisorDisplayName(supervisor)}
            </h4>
            {supervisor.isPrimary && (
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                ⭐ Primary
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', color: 'var(--slate-600)' }}>
            <div>
              <strong>Role:</strong> {SUPERVISOR_TYPE_LABELS[supervisor.supervisorType]}
            </div>
            <div>
              <strong>Email:</strong> {supervisor.user.email}
            </div>
            {supervisor.user.jobTitle && (
              <div>
                <strong>Title:</strong> {supervisor.user.jobTitle}
              </div>
            )}
            <div>
              <strong>Assigned:</strong> {new Date(supervisor.assignedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <button
          onClick={handleRemove}
          disabled={removeSupervisorMutation.isPending}
          style={{
            marginLeft: '1rem',
            color: 'var(--red-800)',
            background: 'none',
            border: 'none',
            cursor: removeSupervisorMutation.isPending ? 'not-allowed' : 'pointer',
            fontSize: '1.25rem',
            opacity: removeSupervisorMutation.isPending ? 0.5 : 1
          }}
          title="Remove assignment"
        >
          {removeSupervisorMutation.isPending ? '...' : '✕'}
        </button>
      </div>
    </div>
  );
};

// Add Location Modal
interface AddLocationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AddLocationModal: React.FC<AddLocationModalProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState<CreateLocationRequest>({
    name: '',
    code: '',
    type: 'SCHOOL',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  
  // Use TanStack Query mutation
  const createLocationMutation = useCreateLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    createLocationMutation.mutate(formData, {
      onSuccess: () => {
        onSuccess();
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to create location');
      },
    });
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div className="card" style={{ maxWidth: '28rem', width: '100%', margin: '1rem' }}>
        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--slate-200)' }}>
          <h2 className="card-title">Add New Location</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div className="badge badge-error" style={{ padding: '0.75rem', display: 'block' }}>
              {error}
            </div>
          )}

          <div>
            <label className="form-label">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
              placeholder="e.g., Elementary School 3"
            />
          </div>

          <div>
            <label className="form-label">Code</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="form-input"
              placeholder="e.g., ES3"
            />
          </div>

          <div>
            <label className="form-label">Type *</label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
              className="form-select"
            >
              <option value="SCHOOL">School</option>
              <option value="DISTRICT_OFFICE">District Office</option>
              <option value="DEPARTMENT">Department</option>
              <option value="PROGRAM">Program</option>
            </select>
          </div>

          <div>
            <label className="form-label">Street Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="form-input"
              placeholder="123 Main St"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="form-input"
                placeholder="City"
              />
            </div>
            <div>
              <label className="form-label">State</label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="form-input"
              >
                <option value="">Select state...</option>
                {US_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">ZIP</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="form-input"
                placeholder="12345"
                maxLength={10}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="form-input"
              placeholder="555-1234"
            />
          </div>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={createLocationMutation.isPending} className="btn btn-primary">
              {createLocationMutation.isPending ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Assign Supervisor Modal
interface AssignSupervisorModalProps {
  locationId: string;
  users: User[];
  onClose: () => void;
  onSuccess: () => void;
}

// @ts-ignore - Component reserved for future use
const AssignSupervisorModal: React.FC<AssignSupervisorModalProps> = ({
  locationId,
  users,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<AssignSupervisorRequest>({
    userId: '',
    supervisorType: 'PRINCIPAL',
    isPrimary: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.userId) {
      setError('Please select a user');
      return;
    }

    try {
      setSubmitting(true);
      await locationService.assignSupervisor(locationId, formData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign supervisor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div className="card" style={{ maxWidth: '28rem', width: '100%', margin: '1rem' }}>
        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--slate-200)' }}>
          <h2 className="card-title">Assign Supervisor</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div className="badge badge-error" style={{ padding: '0.75rem', display: 'block' }}>
              {error}
            </div>
          )}

          <div>
            <label className="form-label">User *</label>
            <select
              required
              value={formData.userId}
              onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
              className="form-select"
            >
              <option value="">Select a user...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName || `${user.firstName} ${user.lastName}`} ({user.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Supervisor Type *</label>
            <select
              required
              value={formData.supervisorType}
              onChange={(e) =>
                setFormData({ ...formData, supervisorType: e.target.value as SupervisorType })
              }
              className="form-select"
            >
              {Object.entries(SUPERVISOR_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex" style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              id="isPrimary"
              checked={formData.isPrimary}
              onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
              style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}
            />
            <label htmlFor="isPrimary" style={{ fontSize: '0.875rem', color: 'var(--slate-700)', cursor: 'pointer' }}>
              Set as primary supervisor for this role
            </label>
          </div>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Assigning...' : 'Assign Supervisor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Worker Assignment Section — dedicated searchable assignment for Tech Assistants & Maintenance Personnel
interface WorkerAssignmentSectionProps {
  locationId: string;
  supervisorType: SupervisorType;
  label: string;
  icon: string;
  description: string;
  supervisors: OfficeLocationWithSupervisors['supervisors'];
  onRefresh: () => Promise<void>;
  setError: (msg: string | null) => void;
}

const WorkerAssignmentSection: React.FC<WorkerAssignmentSectionProps> = ({
  locationId,
  supervisorType,
  label,
  icon,
  description,
  supervisors,
  onRefresh,
  setError,
}) => {
  const [assigning, setAssigning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Workers currently assigned with this type at this location
  const assigned = supervisors.filter((s) => s.supervisorType === supervisorType);

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    setError(null);
    try {
      await locationService.assignSupervisor(locationId, {
        userId: selectedUserId,
        supervisorType,
        isPrimary: assigned.length === 0, // first one is auto-primary
      });
      setSelectedUserId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to assign ${label.toLowerCase()}`);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await locationService.removeSupervisor(locationId, userId, supervisorType);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to remove ${label.toLowerCase()}`);
    }
  };

  const handleSetPrimary = async (userId: string) => {
    setError(null);
    try {
      await locationService.assignSupervisor(locationId, {
        userId,
        supervisorType,
        isPrimary: true,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to set primary ${label.toLowerCase()}`);
    }
  };

  return (
    <div style={{
      borderTop: '2px solid var(--slate-200)',
      paddingTop: '1.25rem',
      marginTop: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--slate-900)' }}>{label}</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--slate-500)', margin: '0 0 0.75rem 0' }}>
        {description}
      </p>

      {/* Currently assigned */}
      {assigned.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {assigned.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                background: s.isPrimary ? 'var(--blue-50, #eff6ff)' : 'var(--slate-50)',
                borderRadius: '0.375rem',
                border: s.isPrimary ? '1px solid var(--blue-200, #bfdbfe)' : '1px solid var(--slate-200)',
                fontSize: '0.875rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 500, color: 'var(--slate-900)' }}>
                    {s.user.displayName || `${s.user.firstName} ${s.user.lastName}`}
                  </span>
                  {s.isPrimary && (
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '0.125rem 0.375rem',
                      background: 'var(--blue-100, #dbeafe)',
                      color: 'var(--blue-800, #1e40af)',
                      borderRadius: '9999px',
                      fontWeight: 600,
                    }}>
                      ⭐ Primary
                    </span>
                  )}
                </div>
                {s.user.jobTitle && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{s.user.jobTitle}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {!s.isPrimary && assigned.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(s.userId)}
                    className="btn btn-sm btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    title="Set as primary (will be auto-assigned to work orders)"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(s.userId)}
                  className="btn btn-sm"
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    background: 'none',
                    border: '1px solid var(--red-300, #fca5a5)',
                    color: 'var(--red-700, #b91c1c)',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Searchable user picker */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <UserSearchAutocomplete
            value={selectedUserId}
            onChange={setSelectedUserId}
            label={`Search for ${label}...`}
          />
        </div>
        <button
          type="button"
          disabled={!selectedUserId || assigning}
          onClick={handleAssign}
          className="btn btn-primary btn-sm"
          style={{ marginTop: '8px', whiteSpace: 'nowrap' }}
        >
          {assigning ? 'Adding...' : '+ Add'}
        </button>
      </div>
    </div>
  );
};

// Edit Location Modal
interface EditLocationModalProps {
  location: OfficeLocationWithSupervisors;
  users: User[];
  onClose: () => void;
  onSuccess: () => void;
}

const EditLocationModal: React.FC<EditLocationModalProps> = ({ location, users, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: location.name,
    code: location.code || '',
    type: location.type,
    address: location.address || '',
    city: location.city || '',
    state: location.state || '',
    zip: location.zip || '',
    phone: location.phone || '',
    isActive: location.isActive,
  });
  const [supervisors, setSupervisors] = useState(location.supervisors);
  const [showAddSupervisor, setShowAddSupervisor] = useState(false);
  const [showSupervisorsSection, setShowSupervisorsSection] = useState(location.supervisors.length > 0);
  const [newSupervisor, setNewSupervisor] = useState({
    userId: '',
    supervisorType: 'PRINCIPAL' as SupervisorType,
    isPrimary: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      await locationService.updateLocation(location.id, {
        name: formData.name,
        code: formData.code || undefined,
        type: formData.type,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip: formData.zip || undefined,
        phone: formData.phone || undefined,
        isActive: formData.isActive,
      });
      // Invalidate location queries so the list refreshes with latest supervisors
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update location');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSupervisor = async () => {
    if (!newSupervisor.userId) {
      setError('Please select a user');
      return;
    }

    try {
      await locationService.assignSupervisor(location.id, newSupervisor);
      // Refresh supervisor list
      const updatedLocation = await locationService.getLocation(location.id);
      setSupervisors(updatedLocation.supervisors);
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      setShowAddSupervisor(false);
      setNewSupervisor({ userId: '', supervisorType: 'PRINCIPAL', isPrimary: false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign supervisor');
    }
  };

  const handleRemoveSupervisor = async (userId: string, supervisorType: SupervisorType) => {
    try {
      await locationService.removeSupervisor(location.id, userId, supervisorType);
      // Refresh supervisor list
      const updatedLocation = await locationService.getLocation(location.id);
      setSupervisors(updatedLocation.supervisors);
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove supervisor');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div className="card" style={{ maxWidth: '42rem', width: '100%', margin: '1rem', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--slate-200)' }}>
          <h2 className="card-title">Edit Location</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div className="badge badge-error" style={{ padding: '0.75rem', display: 'block' }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--slate-900)', marginTop: '0.5rem' }}>
            Location Details
          </div>

          <div>
            <label className="form-label">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
              placeholder="e.g., Elementary School 3"
            />
          </div>

          <div>
            <label className="form-label">Code</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="form-input"
              placeholder="e.g., ES3"
            />
          </div>

          <div>
            <label className="form-label">Type *</label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
              className="form-select"
            >
              <option value="SCHOOL">School</option>
              <option value="DISTRICT_OFFICE">District Office</option>
              <option value="DEPARTMENT">Department</option>
              <option value="PROGRAM">Program</option>
            </select>
          </div>

          <div>
            <label className="form-label">Street Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="form-input"
              placeholder="123 Main St"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="form-input"
                placeholder="City"
              />
            </div>
            <div>
              <label className="form-label">State</label>
              <select
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="form-input"
              >
                <option value="">Select state...</option>
                {US_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">ZIP</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="form-input"
                placeholder="12345"
                maxLength={10}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="form-input"
              placeholder="555-1234"
            />
          </div>

          <div className="flex" style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}
            />
            <label htmlFor="isActive" style={{ fontSize: '0.875rem', color: 'var(--slate-700)', cursor: 'pointer' }}>
              Active (uncheck to deactivate this location)
            </label>
          </div>

          {/* Assigned Workers Section — Technology Assistant & Maintenance Personnel */}
          <WorkerAssignmentSection
            locationId={location.id}
            supervisorType="TECHNOLOGY_ASSISTANT"
            label="Technology Assistant"
            icon="💻"
            description="Auto-assigned to new technology work orders at this location"
            supervisors={supervisors}
            onRefresh={async () => {
              const updated = await locationService.getLocation(location.id);
              setSupervisors(updated.supervisors);
              queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
            }}
            setError={setError}
          />

          <WorkerAssignmentSection
            locationId={location.id}
            supervisorType="MAINTENANCE_WORKER"
            label="Maintenance Personnel"
            icon="🔧"
            description="Auto-assigned to new maintenance work orders at this location"
            supervisors={supervisors}
            onRefresh={async () => {
              const updated = await locationService.getLocation(location.id);
              setSupervisors(updated.supervisors);
              queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
            }}
            setError={setError}
          />

          {/* Supervisors Section */}
          <div style={{ 
            borderTop: '2px solid var(--slate-200)', 
            paddingTop: '1.5rem', 
            marginTop: '1rem' 
          }}>
            <button
              type="button"
              onClick={() => setShowSupervisorsSection(!showSupervisorsSection)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                background: 'var(--slate-100)',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--slate-900)',
                marginBottom: '1rem'
              }}
            >
              <span>Supervisors ({supervisors.filter(s => s.supervisorType !== 'TECHNOLOGY_ASSISTANT' && s.supervisorType !== 'MAINTENANCE_WORKER').length})</span>
              <span style={{ fontSize: '1.25rem', transform: showSupervisorsSection ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                ▼
              </span>
            </button>

            {showSupervisorsSection && (
              <>
                <div className="flex" style={{ justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddSupervisor(!showAddSupervisor)}
                    className="btn btn-sm btn-primary"
                  >
                    {showAddSupervisor ? 'Cancel' : '+ Add Supervisor'}
                  </button>
                </div>

                {showAddSupervisor && (
                  <div style={{ 
                    padding: '1rem', 
                    background: 'var(--slate-50)', 
                    borderRadius: '0.375rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <select
                        value={newSupervisor.userId}
                        onChange={(e) => setNewSupervisor({ ...newSupervisor, userId: e.target.value })}
                        className="form-select"
                        style={{ fontSize: '0.875rem' }}
                      >
                        <option value="">Select a user...</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.displayName || `${user.firstName} ${user.lastName}`} - {user.jobTitle || user.email}
                          </option>
                        ))}
                      </select>

                      <select
                        value={newSupervisor.supervisorType}
                        onChange={(e) => setNewSupervisor({ ...newSupervisor, supervisorType: e.target.value as SupervisorType })}
                        className="form-select"
                        style={{ fontSize: '0.875rem' }}
                      >
                        {Object.entries(SUPERVISOR_TYPE_LABELS)
                          .filter(([value]) => value !== 'TECHNOLOGY_ASSISTANT' && value !== 'MAINTENANCE_WORKER')
                          .map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <div className="flex" style={{ alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          id="newSupervisorPrimary"
                          checked={newSupervisor.isPrimary}
                          onChange={(e) => setNewSupervisor({ ...newSupervisor, isPrimary: e.target.checked })}
                          style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}
                        />
                        <label htmlFor="newSupervisorPrimary" style={{ fontSize: '0.875rem', color: 'var(--slate-700)', cursor: 'pointer' }}>
                          Set as primary supervisor for this role
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddSupervisor}
                        className="btn btn-primary btn-sm"
                      >
                        Assign Supervisor
                      </button>
                    </div>
                  </div>
                )}

                {supervisors.filter(s => s.supervisorType !== 'TECHNOLOGY_ASSISTANT' && s.supervisorType !== 'MAINTENANCE_WORKER').length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--slate-400)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                    No supervisors assigned
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {supervisors.filter(s => s.supervisorType !== 'TECHNOLOGY_ASSISTANT' && s.supervisorType !== 'MAINTENANCE_WORKER').map((supervisor) => (
                      <div 
                        key={supervisor.id}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '0.75rem',
                          background: 'var(--slate-50)',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem'
                        }}
                      >
                        <div>
                          <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 500, color: 'var(--slate-900)' }}>
                              {supervisor.user.displayName || `${supervisor.user.firstName} ${supervisor.user.lastName}`}
                            </span>
                            {supervisor.isPrimary && <span>⭐</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                            {SUPERVISOR_TYPE_LABELS[supervisor.supervisorType]}
                            {supervisor.user.jobTitle && ` • ${supervisor.user.jobTitle}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSupervisor(supervisor.userId, supervisor.supervisorType)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '0.375rem 0.75rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '2px solid var(--slate-200)' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Updating...' : 'Update Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupervisorManagement;

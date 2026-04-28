import { useState, useEffect } from 'react';
import { OfficeLocation } from '../types/location.types';
import { CreateRoomRequest, UpdateRoomRequest, Room, RoomType } from '../types/room.types';
import locationService from '../services/location.service';

interface RoomFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateRoomRequest | UpdateRoomRequest) => Promise<void>;
  room?: Room | null;
  title: string;
}

const ROOM_TYPES: RoomType[] = [
  'CLASSROOM',
  'OFFICE',
  'GYM',
  'CAFETERIA',
  'LIBRARY',
  'LAB',
  'MAINTENANCE',
  'SPORTS',
  'MUSIC',
  'MEDICAL',
  'CONFERENCE',
  'TECHNOLOGY',
  'TRANSPORTATION',
  'SPECIAL_ED',
  'GENERAL',
  'OTHER',
];

export const RoomFormModal = ({ isOpen, onClose, onSubmit, room, title }: RoomFormModalProps) => {
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    locationId: room?.locationId || '',
    name: room?.name || '',
    type: room?.type || '',
    building: room?.building || '',
    floor: room?.floor?.toString() || '',
    capacity: room?.capacity?.toString() || '',
    notes: room?.notes || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      fetchLocations();
      if (room) {
        setFormData({
          locationId: room.locationId,
          name: room.name,
          type: room.type || '',
          building: room.building || '',
          floor: room.floor?.toString() || '',
          capacity: room.capacity?.toString() || '',
          notes: room.notes || '',
        });
      }
    }
  }, [isOpen, room]);

  const fetchLocations = async () => {
    try {
      const data = await locationService.getAllLocations();
      setLocations(data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Room name is required';
    }

    if (!formData.locationId && !room) {
      newErrors.locationId = 'Location is required';
    }

    if (formData.floor && (isNaN(Number(formData.floor)) || Number(formData.floor) < 0)) {
      newErrors.floor = 'Floor must be a positive number';
    }

    if (formData.capacity && (isNaN(Number(formData.capacity)) || Number(formData.capacity) < 1)) {
      newErrors.capacity = 'Capacity must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const submitData: any = {
        name: formData.name.trim(),
        type: formData.type || undefined,
        building: formData.building.trim() || undefined,
        floor: formData.floor ? parseInt(formData.floor) : undefined,
        capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        notes: formData.notes.trim() || undefined,
      };

      if (!room) {
        submitData.locationId = formData.locationId;
      }

      await onSubmit(submitData);
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to save room';
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      locationId: '',
      name: '',
      type: '',
      building: '',
      floor: '',
      capacity: '',
      notes: '',
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-body">
            {!room && (
              <div className="form-group">
                <label htmlFor="locationId">
                  Location <span className="required">*</span>
                </label>
                <select
                  id="locationId"
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                  className={errors.locationId ? 'error' : ''}
                  required
                >
                  <option value="">Select a location...</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {errors.locationId && <span className="error-message">{errors.locationId}</span>}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="name">
                Room Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={errors.name ? 'error' : ''}
                placeholder="e.g., 101, Library, Gym"
                required
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="type">Room Type</label>
                <select
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="">Select type...</option>
                  {ROOM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="building">Building</label>
                <input
                  type="text"
                  id="building"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  placeholder="e.g., A, Main, North"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="floor">Floor</label>
                <input
                  type="number"
                  id="floor"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                  className={errors.floor ? 'error' : ''}
                  placeholder="e.g., 1, 2, 3"
                  min="0"
                />
                {errors.floor && <span className="error-message">{errors.floor}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="capacity">Capacity</label>
                <input
                  type="number"
                  id="capacity"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className={errors.capacity ? 'error' : ''}
                  placeholder="e.g., 30"
                  min="1"
                />
                {errors.capacity && <span className="error-message">{errors.capacity}</span>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this room..."
                rows={3}
              />
            </div>

            {errors.submit && (
              <div className="error-alert">
                {errors.submit}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={handleClose} className="btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : room ? 'Update Room' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.5rem;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
          padding: 0;
          width: 32px;
          height: 32px;
        }

        .close-button:hover {
          color: #111827;
        }

        .form-body {
          padding: 20px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #374151;
        }

        .required {
          color: #ef4444;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          ring: 2px;
          ring-color: #bfdbfe;
        }

        .form-group input.error,
        .form-group select.error {
          border-color: #ef4444;
        }

        .error-message {
          display: block;
          margin-top: 4px;
          color: #ef4444;
          font-size: 0.75rem;
        }

        .error-alert {
          padding: 12px;
          background: #fee2e2;
          border: 1px solid #ef4444;
          border-radius: 4px;
          color: #991b1b;
          font-size: 0.875rem;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px;
          border-top: 1px solid #e5e7eb;
        }

        .btn-secondary,
        .btn-primary {
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .btn-secondary {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .btn-primary {
          background: #3b82f6;
          border: none;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-secondary:disabled,
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default RoomFormModal;

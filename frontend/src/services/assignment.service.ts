/**
 * Assignment Service
 * Handles all API calls for equipment assignment operations
 */

import api from './api';
import {
  AssignToUserRequest,
  AssignToRoomRequest,
  UnassignRequest,
  TransferRequest,
  BulkAssignRequest,
  BulkAssignmentResult,
  AssignmentHistoryResponse,
  AssignmentHistoryQuery,
} from '../types/assignment.types';
import { InventoryItem } from '../types/inventory.types';

/**
 * Get CSRF token from cookie
 * The token is stored in XSRF-TOKEN cookie and needs to be sent in x-xsrf-token header
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Assignment service class
 */
class AssignmentService {
  /**
   * Assign equipment to a user
   */
  async assignToUser(
    equipmentId: string,
    data: AssignToUserRequest
  ): Promise<InventoryItem> {
    const csrfToken = getCsrfToken();
    const response = await api.post(`/equipment/${equipmentId}/assign`, data, {
      headers: csrfToken ? { 'x-xsrf-token': csrfToken } : {},
    });
    return response.data;
  }

  /**
   * Assign equipment to a room
   */
  async assignToRoom(
    equipmentId: string,
    data: AssignToRoomRequest
  ): Promise<InventoryItem> {
    const csrfToken = getCsrfToken();
    const response = await api.post(`/equipment/${equipmentId}/assign-room`, data, {
      headers: csrfToken ? { 'x-xsrf-token': csrfToken } : {},
    });
    return response.data;
  }

  /**
   * Unassign equipment
   */
  async unassign(
    equipmentId: string,
    data: UnassignRequest
  ): Promise<InventoryItem> {
    const csrfToken = getCsrfToken();
    const response = await api.post(`/equipment/${equipmentId}/unassign`, data, {
      headers: csrfToken ? { 'x-xsrf-token': csrfToken } : {},
    });
    return response.data;
  }

  /**
   * Transfer equipment between users
   */
  async transfer(
    equipmentId: string,
    data: TransferRequest
  ): Promise<InventoryItem> {
    const csrfToken = getCsrfToken();
    const response = await api.post(`/equipment/${equipmentId}/transfer`, data, {
      headers: csrfToken ? { 'x-xsrf-token': csrfToken } : {},
    });
    return response.data;
  }

  /**
   * Get assignment history for equipment
   */
  async getHistory(
    equipmentId: string,
    query?: AssignmentHistoryQuery
  ): Promise<AssignmentHistoryResponse> {
    const params = new URLSearchParams();
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.offset) params.append('offset', String(query.offset));
    if (query?.assignmentType) params.append('assignmentType', query.assignmentType);

    const response = await api.get(
      `/equipment/${equipmentId}/assignment-history?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Get current assignment for equipment
   */
  async getCurrentAssignment(equipmentId: string): Promise<InventoryItem> {
    const response = await api.get(`/equipment/${equipmentId}/current-assignment`);
    return response.data;
  }

  /**
   * Get equipment assigned to current user
   */
  async getMyEquipment(
    page = 1,
    limit = 25
  ): Promise<{ data: InventoryItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const response = await api.get('/my-equipment', { params: { page, limit } });
    return response.data;
  }

  /**
   * Get equipment assigned to a specific user
   */
  async getUserAssignments(
    userId: string
  ): Promise<{ equipment: InventoryItem[]; total: number }> {
    const response = await api.get(`/users/${userId}/assigned-equipment`);
    return response.data;
  }

  /**
   * Get equipment assigned to a specific room
   */
  async getRoomAssignments(roomId: string): Promise<{
    room: { id: string; name: string };
    equipment: InventoryItem[];
    total: number;
  }> {
    const response = await api.get(`/rooms/${roomId}/assigned-equipment`);
    return response.data;
  }

  /**
   * Bulk assign equipment
   */
  async bulkAssign(data: BulkAssignRequest): Promise<BulkAssignmentResult> {
    const csrfToken = getCsrfToken();
    const response = await api.post('/equipment/bulk-assign', data, {
      headers: csrfToken ? { 'x-xsrf-token': csrfToken } : {},
    });
    return response.data;
  }
}

export default new AssignmentService();

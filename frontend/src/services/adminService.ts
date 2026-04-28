import api from './api';

export interface SyncStatus {
  totalUsers: number;
  activeUsers: number;
  lastSyncedAt: string | null;
  lastSyncedUser: string | null;
  roleBreakdown: Array<{
    role: string;
    count: number;
  }>;
  groupsConfigured: {
    admin: boolean;
    technologyDirector: boolean;
    directorOfSchools: boolean;
    financeDirector: boolean;
    spedDirector: boolean;
    maintenanceDirector: boolean;
    transportationDirector: boolean;
    afterschoolDirector: boolean;
    nurseDirector: boolean;
    supervisorsOfInstruction: boolean;
    foodServicesSupervisor: boolean;
    financePOEntry: boolean;
    foodServicesPOEntry: boolean;
    principals: boolean;
    vicePrincipals: boolean;
    allStaff: boolean;
    allStudents: boolean;
  };
}

export interface SyncResultDetail {
  added: number;
  updated: number;
  errors: number;
  deactivated: number;
  totalProcessed: number;
  durationMs: number;
  errorDetails: Array<{ entraId: string; message: string }>;
}

export interface SyncResult {
  success: boolean;
  message: string;
  count: number;
  detail?: SyncResultDetail;
}

export const adminService = {
  // Get sync status
  getSyncStatus: async (): Promise<SyncStatus> => {
    const response = await api.get('/admin/sync-status');
    return response.data;
  },

  // Sync all users
  syncAllUsers: async (): Promise<SyncResult> => {
    const response = await api.post('/admin/sync-users/all');
    return response.data;
  },

  // Sync staff users
  syncStaffUsers: async (): Promise<SyncResult> => {
    const response = await api.post('/admin/sync-users/staff');
    return response.data;
  },

  // Sync student users
  syncStudentUsers: async (): Promise<SyncResult> => {
    const response = await api.post('/admin/sync-users/students');
    return response.data;
  },

  // Sync specific group
  syncGroupUsers: async (groupId: string): Promise<SyncResult> => {
    const response = await api.post(`/admin/sync-users/group/${groupId}`);
    return response.data;
  },
};

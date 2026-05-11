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

export interface JobResult {
  success: boolean;
  message: string;
  detail: {
    locationsCreated?: number;
    locationsVerified?: number;
    assignmentsCreated?: number;
    assignmentsSkipped?: number;
    errors: number;
    errorDetails: Array<{ group: string; email?: string; message: string }>;
    durationMs: number;
  };
}

export interface JobStatus {
  supervisorSync: {
    lastRunAt: string | null;
    currentCount: number;
  };
  locationSync: {
    currentCount: number;
  };
  userSync: {
    lastRunAt: string | null;
  };
}

export interface JobSchedule {
  id: string;
  jobKey: string;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'error' | 'skipped' | null;
  lastRunResult: Record<string, unknown> | null;
  nextRunAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
  isRunning: boolean;
}

export interface UpdateSchedulePayload {
  cronExpr: string;
  enabled: boolean;
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

  // Get last-run metadata for all admin jobs
  getJobStatus: async (): Promise<JobStatus> => {
    const response = await api.get('/admin/jobs/status');
    return response.data;
  },

  // Sync office locations from canonical mapping
  syncLocations: async (): Promise<JobResult> => {
    const response = await api.post('/admin/jobs/sync-locations');
    return response.data;
  },

  // Rebuild all supervisor-location assignments from Entra
  syncSupervisors: async (): Promise<JobResult> => {
    const response = await api.post('/admin/jobs/sync-supervisors');
    return response.data;
  },

  // Get all job schedules
  getJobSchedules: async (): Promise<{ schedules: JobSchedule[] }> => {
    const response = await api.get('/admin/jobs/schedules');
    return response.data;
  },

  // Update a job schedule (cronExpr + enabled)
  updateJobSchedule: async (
    jobKey: string,
    payload: UpdateSchedulePayload,
  ): Promise<{ success: boolean; schedule: JobSchedule }> => {
    const response = await api.put(`/admin/jobs/schedules/${jobKey}`, payload);
    return response.data;
  },

  // Run a job immediately (new unified endpoint)
  runJobNow: async (jobKey: string): Promise<JobResult> => {
    const response = await api.post(`/admin/jobs/${jobKey}/run`);
    return response.data;
  },
};


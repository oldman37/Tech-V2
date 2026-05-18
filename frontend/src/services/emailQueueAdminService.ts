import api from './api';

export interface EmailQueueItem {
  id: string;
  recipients: string[];
  subject: string;
  priority: number;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  context: string | null;
  relatedEntityId: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailQueueListResponse {
  items: EmailQueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EmailQueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
}

export interface EmailQueueListParams {
  page?: number;
  limit?: number;
  status?: string;
  context?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export const emailQueueAdminService = {
  getList: async (params?: EmailQueueListParams): Promise<EmailQueueListResponse> => {
    const response = await api.get('/admin/email-queue', { params });
    return response.data;
  },

  getStats: async (): Promise<EmailQueueStats> => {
    const response = await api.get('/admin/email-queue/stats');
    return response.data;
  },

  retryEmail: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/admin/email-queue/${id}/retry`);
    return response.data;
  },

  retryAllFailed: async (): Promise<{ success: boolean; count: number; message: string }> => {
    const response = await api.post('/admin/email-queue/retry-all-failed');
    return response.data;
  },
};

import api from './api';

export interface User {
  id: string;
  entraId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  groups: string[];
  roles?: string[];
}

export interface LoginResponse {
  success: boolean;
  authUrl: string;
}

export interface CallbackResponse {
  success: boolean;
  token: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenResponse {
  success: boolean;
  token: string;
}

export interface MeResponse {
  success: boolean;
  user: User;
}

// Auth API endpoints
export const authApi = {
  // Get login URL
  getLoginUrl: () => api.get<LoginResponse>('/auth/login'),

  // Handle OAuth callback
  handleCallback: (code: string) => 
    api.get<CallbackResponse>(`/auth/callback?code=${code}`),

  // Refresh access token
  refreshToken: (refreshToken: string) =>
    api.post<RefreshTokenResponse>('/auth/refresh-token', { refreshToken }),

  // Logout
  logout: () => api.post('/auth/logout'),

  // Get current user
  getMe: () => api.get<MeResponse>('/auth/me'),

  // Sync users (admin only)
  syncUsers: () => api.get('/auth/sync-users'),
};

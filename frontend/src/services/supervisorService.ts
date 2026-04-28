import api from './api';

export interface Supervisor {
  id: string;
  supervisorId: string;
  locationId: string | null;
  isPrimary: boolean;
  assignedAt: string;
  assignedBy: string | null;
  notes: string | null;
  supervisor: {
    id: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    officeLocation: string | null;
    jobTitle: string | null;
  };
}

export interface AddSupervisorRequest {
  supervisorId: string;
  locationId?: string | null;
  isPrimary?: boolean;
  notes?: string;
}

export interface PotentialSupervisor {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  officeLocation: string | null;
  jobTitle: string | null;
}

class SupervisorService {
  async getUserSupervisors(userId: string): Promise<Supervisor[]> {
    const response = await api.get<Supervisor[]>(
      `/users/${userId}/supervisors`
    );
    return response.data;
  }

  async addSupervisor(userId: string, data: AddSupervisorRequest): Promise<void> {
    await api.post(
      `/users/${userId}/supervisors`,
      data
    );
  }

  async removeSupervisor(userId: string, supervisorId: string): Promise<void> {
    await api.delete(
      `/users/${userId}/supervisors/${supervisorId}`
    );
  }

  async searchPotentialSupervisors(userId: string, query: string): Promise<PotentialSupervisor[]> {
    const response = await api.get(
      `/users/${userId}/supervisors/search?search=${encodeURIComponent(query)}`
    );
    return response.data;
  }
}

export const supervisorService = new SupervisorService();

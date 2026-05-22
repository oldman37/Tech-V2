/**
 * incident.service.ts
 * Thin service for the unified Incidents workflow.
 * Delegates to damageIncidentService for API calls.
 */
import { damageIncidentService } from './damageIncident.service';
import type {
  DamageIncident,
  DamageIncidentsResponse,
  CreateDamageIncidentData,
  UpdateWorkflowStepData,
} from '../types/damageIncident.types';

export const incidentService = {
  getIncidents: (params?: object): Promise<DamageIncidentsResponse> =>
    damageIncidentService.getAll(params),

  getIncident: (id: string): Promise<DamageIncident> =>
    damageIncidentService.getById(id),

  createIncident: (data: CreateDamageIncidentData): Promise<DamageIncident> =>
    damageIncidentService.create(data),

  updateWorkflowStep: (id: string, data: UpdateWorkflowStepData): Promise<DamageIncident> =>
    damageIncidentService.updateWorkflowStep(id, data),
};

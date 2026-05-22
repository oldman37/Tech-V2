/**
 * incident.types.ts
 * Types for the unified Incidents workflow.
 * Re-exports from damageIncident.types for backward compatibility.
 */
export type {
  DamageIncident as Incident,
  DamageIncidentUser as IncidentUser,
  DamageIncidentEquipment as IncidentEquipment,
  CreateDamageIncidentData as CreateIncidentRequest,
  UpdateWorkflowStepData as UpdateWorkflowStepRequest,
  DamageIncidentsResponse as IncidentsResponse,
} from './damageIncident.types';

export type { IncidentIntent, IncidentWorkflowStep } from '@mgspe/shared-types';

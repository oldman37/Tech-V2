/**
 * TypeScript types for Office Locations and Supervisors
 * Use these types in your frontend application
 */

export type LocationType = 'SCHOOL' | 'DISTRICT_OFFICE' | 'DEPARTMENT' | 'PROGRAM';

export type SupervisorType =
  | 'PRINCIPAL'
  | 'VICE_PRINCIPAL'
  | 'DIRECTOR_OF_SCHOOLS'
  | 'FINANCE_DIRECTOR'
  | 'SPED_DIRECTOR'
  | 'MAINTENANCE_DIRECTOR'
  | 'TRANSPORTATION_DIRECTOR'
  | 'TECHNOLOGY_DIRECTOR'
  | 'AFTERSCHOOL_DIRECTOR'
  | 'NURSE_DIRECTOR'
  | 'CTE_DIRECTOR'
  | 'PRE_K_DIRECTOR'
  | 'TECHNOLOGY_ASSISTANT'
  | 'MAINTENANCE_WORKER'
  | 'FOOD_SERVICES_SUPERVISOR';

export interface OfficeLocation {
  id: string;
  name: string;
  code: string | null;
  type: LocationType;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocationSupervisor {
  id: string;
  locationId: string;
  userId: string;
  supervisorType: SupervisorType;
  isPrimary: boolean;
  assignedAt: string;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// With nested relationships
export interface OfficeLocationWithSupervisors extends OfficeLocation {
  supervisors: (LocationSupervisor & {
    user: {
      id: string;
      email: string;
      displayName: string | null;
      firstName: string;
      lastName: string;
      jobTitle: string | null;
    };
  })[];
}

export interface LocationSupervisorWithDetails extends LocationSupervisor {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
  };
  location: {
    id: string;
    name: string;
    code: string | null;
    type: LocationType;
  };
}

// API request/response types
export interface AssignSupervisorRequest {
  userId: string;
  supervisorType: SupervisorType;
  isPrimary?: boolean;
}

export interface CreateLocationRequest {
  name: string;
  code?: string;
  type: LocationType;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

export interface UpdateLocationRequest {
  name?: string;
  code?: string;
  type?: LocationType;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  isActive?: boolean;
}

// Helper type guards
export function isValidSupervisorType(type: string): type is SupervisorType {
  return [
    'PRINCIPAL',
    'VICE_PRINCIPAL',
    'DIRECTOR_OF_SCHOOLS',
    'FINANCE_DIRECTOR',
    'SPED_DIRECTOR',
    'MAINTENANCE_DIRECTOR',
    'TRANSPORTATION_DIRECTOR',
    'TECHNOLOGY_DIRECTOR',
    'AFTERSCHOOL_DIRECTOR',
    'NURSE_DIRECTOR',
    'CTE_DIRECTOR',
    'PRE_K_DIRECTOR',
    'TECHNOLOGY_ASSISTANT',
    'MAINTENANCE_WORKER',
    'FOOD_SERVICES_SUPERVISOR',
  ].includes(type);
}

export function isValidLocationType(type: string): type is LocationType {
  return ['SCHOOL', 'DISTRICT_OFFICE', 'DEPARTMENT', 'PROGRAM'].includes(type);
}

// Display helpers
export const SUPERVISOR_TYPE_LABELS: Record<SupervisorType, string> = {
  PRINCIPAL: 'Principal',
  VICE_PRINCIPAL: 'Vice Principal',
  DIRECTOR_OF_SCHOOLS: 'Director of Schools',
  FINANCE_DIRECTOR: 'Finance Director',
  SPED_DIRECTOR: 'SPED Director',
  MAINTENANCE_DIRECTOR: 'Maintenance Director',
  TRANSPORTATION_DIRECTOR: 'Transportation Director',
  TECHNOLOGY_DIRECTOR: 'Technology Director',
  AFTERSCHOOL_DIRECTOR: 'Afterschool Director',
  NURSE_DIRECTOR: 'Nurse Director',
  CTE_DIRECTOR: 'CTE Director',
  PRE_K_DIRECTOR: 'Pre-K Director',
  TECHNOLOGY_ASSISTANT: 'Technology Assistant',
  MAINTENANCE_WORKER: 'Maintenance Worker',
  FOOD_SERVICES_SUPERVISOR: 'Food Services Supervisor',
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  SCHOOL: 'School',
  DISTRICT_OFFICE: 'District Office',
  DEPARTMENT: 'Department',
  PROGRAM: 'Program',
};

export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  SCHOOL: '🏫',
  DISTRICT_OFFICE: '🏢',
  DEPARTMENT: '📁',
  PROGRAM: '📋',
};

// Utility functions
export function getSupervisorDisplayName(supervisor: {
  user: {
    displayName: string | null;
    firstName: string;
    lastName: string;
  };
}): string {
  return supervisor.user.displayName || `${supervisor.user.firstName} ${supervisor.user.lastName}`;
}

export function getPrimarySupervisor(
  supervisors: LocationSupervisor[],
  type: SupervisorType
): LocationSupervisor | undefined {
  return supervisors.find((s) => s.supervisorType === type && s.isPrimary);
}

export function groupSupervisorsByType<T extends LocationSupervisor>(
  supervisors: T[]
): Record<SupervisorType, T[]> {
  return supervisors.reduce((acc, supervisor) => {
    const type = supervisor.supervisorType;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(supervisor);
    return acc;
  }, {} as Record<SupervisorType, T[]>);
}

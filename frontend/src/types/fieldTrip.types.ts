/**
 * Field Trip Request — TypeScript types
 *
 * Field names match the Prisma schema exactly:
 *   teacherName, studentCount, purpose (not teacherSponsorName, numberOfStudents, educationalPurpose)
 */

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------

export type FieldTripStatus =
  | 'DRAFT'
  | 'PENDING_SUPERVISOR'
  | 'PENDING_ASST_DIRECTOR'
  | 'PENDING_DIRECTOR'
  | 'PENDING_FINANCE_DIRECTOR'
  | 'APPROVED'
  | 'DENIED';

// ---------------------------------------------------------------------------
// Approval record
// ---------------------------------------------------------------------------

export interface FieldTripApproval {
  id:          string;
  fieldTripRequestId: string;
  stage:       string;  // 'SUPERVISOR' | 'ASST_DIRECTOR' | 'DIRECTOR' | 'FINANCE_DIRECTOR'
  action:      'APPROVED' | 'DENIED';
  actedById:   string;
  actedByName: string;
  actedAt:     string;
  notes?:      string | null;
  denialReason?: string | null;
}

// ---------------------------------------------------------------------------
// Status history record
// ---------------------------------------------------------------------------

export interface FieldTripStatusHistory {
  id:                 string;
  fieldTripRequestId: string;
  fromStatus:         string;
  toStatus:           string;
  changedById:        string;
  changedByName:      string;
  changedAt:          string;
  notes?:             string | null;
}

// ---------------------------------------------------------------------------
// Main request object
// ---------------------------------------------------------------------------

export interface FieldTripRequest {
  id:            string;
  submittedById: string;
  submittedBy?:  {
    id:          string;
    firstName:   string;
    lastName:    string;
    displayName: string | null;
    email:       string;
  };

  // Form fields (match DB column names)
  teacherName:           string;
  schoolBuilding:        string;
  gradeClass:            string;
  studentCount:          number;
  tripDate:              string;
  destination:           string;
  destinationAddress?:   string | null;
  purpose:               string;
  departureTime:         string;
  returnTime:            string;
  transportationNeeded:  boolean;
  transportationDetails?: string | null;
  costPerStudent?:       number | null;
  totalCost?:            number | null;
  fundingSource?:        string | null;
  chaperoneInfo?:        string | null;
  emergencyContact?:     string | null;
  additionalNotes?:      string | null;
  subjectArea?:          string | null;
  preliminaryActivities?: string | null;
  followUpActivities?:   string | null;
  isOvernightTrip?:      boolean;
  returnDate?:           string | null;
  alternateTransportation?: string | null;

  // Workflow
  status:        FieldTripStatus;
  submitterEmail: string;
  denialReason?: string | null;
  fiscalYear?:   string | null;

  // Timestamps
  submittedAt?:  string | null;
  approvedAt?:   string | null;
  createdAt:     string;
  updatedAt:     string;

  // Relations
  approvals?:     FieldTripApproval[];
  statusHistory?: FieldTripStatusHistory[];
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CreateFieldTripDto {
  teacherName:           string;
  schoolBuilding:        string;
  gradeClass:            string;
  studentCount:          number;
  tripDate:              string;
  destination:           string;
  destinationAddress:    string;
  purpose:               string;
  departureTime:         string;
  returnTime:            string;
  transportationNeeded:  boolean;
  transportationDetails?: string | null;
  costPerStudent:        number;
  totalCost:             number;
  fundingSource:         string;
  chaperoneInfo:         string;
  emergencyContact:      string;
  additionalNotes:       string;
  subjectArea?:          string | null;
  preliminaryActivities: string;
  followUpActivities:    string;
  isOvernightTrip:       boolean;
  returnDate?:           string | null;
  alternateTransportation?: string | null;
}

export type UpdateFieldTripDto = Partial<CreateFieldTripDto>;

export interface ApproveTripDto {
  notes?: string;
}

export interface DenyTripDto {
  reason: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const FIELD_TRIP_STATUS_LABELS: Record<FieldTripStatus, string> = {
  DRAFT:                    'Draft',
  PENDING_SUPERVISOR:       'Pending Supervisor',
  PENDING_ASST_DIRECTOR:    'Pending Asst. Director',
  PENDING_DIRECTOR:         'Pending Director',
  PENDING_FINANCE_DIRECTOR: 'Pending Finance Director',
  APPROVED:                 'Approved',
  DENIED:                   'Denied',
};

export type StatusChipColor = 'default' | 'warning' | 'success' | 'error' | 'info';

export const FIELD_TRIP_STATUS_COLORS: Record<FieldTripStatus, StatusChipColor> = {
  DRAFT:                    'default',
  PENDING_SUPERVISOR:       'warning',
  PENDING_ASST_DIRECTOR:    'warning',
  PENDING_DIRECTOR:         'warning',
  PENDING_FINANCE_DIRECTOR: 'warning',
  APPROVED:                 'success',
  DENIED:                   'error',
};

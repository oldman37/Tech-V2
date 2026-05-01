// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type TransportationRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export const TRANSPORTATION_REQUEST_STATUS_LABELS: Record<TransportationRequestStatus, string> = {
  PENDING:  'Pending Review',
  APPROVED: 'Approved',
  DENIED:   'Denied',
};

export type StatusChipColor = 'warning' | 'success' | 'error' | 'default';

export const TRANSPORTATION_REQUEST_STATUS_COLORS: Record<TransportationRequestStatus, StatusChipColor> = {
  PENDING:  'warning',
  APPROVED: 'success',
  DENIED:   'error',
};

// ---------------------------------------------------------------------------
// Destination entry
// ---------------------------------------------------------------------------

export interface AdditionalDestination {
  name:    string;
  address: string;
}

// ---------------------------------------------------------------------------
// Main type (mirrors Prisma output with includes)
// ---------------------------------------------------------------------------

export interface TransportationRequest {
  id:            string;
  submittedById: string;
  submittedBy?: {
    id:          string;
    firstName:   string;
    lastName:    string;
    displayName: string | null;
    email:       string;
  };

  // Part A fields
  dateSubmitted:             string;
  school:                    string;
  groupOrActivity:           string;
  sponsorName:               string;
  chargedTo:                 string | null;
  tripDate:                  string;
  busCount:                  number;
  studentCount:              number;
  chaperoneCount:            number;
  needsDriver:               boolean;
  driverName:                string | null;
  loadingLocation:           string;
  loadingTime:               string;
  leavingSchoolTime:         string;
  arriveFirstDestTime:       string | null;
  leaveLastDestTime:         string | null;
  returnToSchoolTime:        string;
  primaryDestinationName:    string;
  primaryDestinationAddress: string;
  additionalDestinations:    AdditionalDestination[] | null;
  tripItinerary:             string | null;

  // Workflow
  status:           TransportationRequestStatus;
  approvalComments?: string | null;
  approvedById?:    string | null;
  approvedAt?:      string | null;
  approvedBy?: {
    id:          string;
    displayName: string | null;
    firstName:   string;
    lastName:    string;
  } | null;

  deniedById?:   string | null;
  deniedAt?:     string | null;
  denialReason?: string | null;
  deniedBy?: {
    id:          string;
    displayName: string | null;
    firstName:   string;
    lastName:    string;
  } | null;

  submitterEmail: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DTOs for API calls
// ---------------------------------------------------------------------------

export interface CreateTransportationRequestDto {
  school:                    string;
  groupOrActivity:           string;
  sponsorName:               string;
  chargedTo?:                string | null;
  tripDate:                  string;
  busCount:                  number;
  studentCount:              number;
  chaperoneCount:            number;
  needsDriver:               boolean;
  driverName?:               string | null;
  loadingLocation:           string;
  loadingTime:               string;
  leavingSchoolTime:         string;
  arriveFirstDestTime?:      string | null;
  leaveLastDestTime?:        string | null;
  returnToSchoolTime:        string;
  primaryDestinationName:    string;
  primaryDestinationAddress: string;
  additionalDestinations?:   AdditionalDestination[] | null;
  tripItinerary?:            string | null;
}

export interface ApproveTransportationRequestDto {
  comments?: string | null;
}

export interface DenyTransportationRequestDto {
  denialReason: string;
}

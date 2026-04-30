/**
 * Zod validation schemas for field trip transportation request endpoints.
 *
 * Follows the exact pattern of fieldTrip.validators.ts.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

export const TRANSPORTATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_TRANSPORTATION',
  'TRANSPORTATION_APPROVED',
  'TRANSPORTATION_DENIED',
] as const;

export type TransportationStatus = (typeof TRANSPORTATION_STATUSES)[number];

export const TRANSPORTATION_TYPES = [
  'DISTRICT_BUS',
  'CHARTER',
  'PARENT_TRANSPORT',
  'WALKING',
] as const;

export type TransportationTypeValue = (typeof TRANSPORTATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Shared destination schema
// ---------------------------------------------------------------------------

const AdditionalDestinationSchema = z.object({
  name:    z.string().min(1).max(500),
  address: z.string().min(1).max(500),
});

// ---------------------------------------------------------------------------
// POST /api/field-trips/:id/transportation  — create draft
// ---------------------------------------------------------------------------

export const CreateTransportationSchema = z.object({
  busCount:               z.number().int().min(1).max(99),
  chaperoneCount:         z.number().int().min(0).max(200),
  needsDriver:            z.boolean(),
  driverName:             z.string().max(200).optional().nullable(),
  loadingLocation:        z.string().min(1).max(500),
  loadingTime:            z.string().min(1).max(20),
  arriveFirstDestTime:    z.string().max(20).optional().nullable(),
  leaveLastDestTime:      z.string().max(20).optional().nullable(),
  additionalDestinations: z.array(AdditionalDestinationSchema).max(10).optional().nullable(),
  tripItinerary:          z.string().max(3000).optional().nullable(),
});

export type CreateTransportationDto = z.infer<typeof CreateTransportationSchema>;

// ---------------------------------------------------------------------------
// PUT /api/field-trips/:id/transportation  — update draft
// ---------------------------------------------------------------------------

export const UpdateTransportationSchema = CreateTransportationSchema.partial();

export type UpdateTransportationDto = z.infer<typeof UpdateTransportationSchema>;

// ---------------------------------------------------------------------------
// POST /api/field-trips/:id/transportation/approve  — Part C approval
// ---------------------------------------------------------------------------

export const ApproveTransportationSchema = z.object({
  transportationType: z.enum(TRANSPORTATION_TYPES),
  transportationCost: z.number().min(0).optional().nullable(),
  notes:              z.string().max(3000).optional().nullable(),
});

export type ApproveTransportationDto = z.infer<typeof ApproveTransportationSchema>;

// ---------------------------------------------------------------------------
// POST /api/field-trips/:id/transportation/deny  — Part C denial
// ---------------------------------------------------------------------------

export const DenyTransportationSchema = z.object({
  reason: z.string().min(1).max(3000),
  notes:  z.string().max(3000).optional().nullable(),
});

export type DenyTransportationDto = z.infer<typeof DenyTransportationSchema>;

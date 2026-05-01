import { z } from 'zod';

export const TRANSPORTATION_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'DENIED'] as const;
export type TransportationRequestStatus = (typeof TRANSPORTATION_REQUEST_STATUSES)[number];

const AdditionalDestinationSchema = z.object({
  name:    z.string().min(1).max(500),
  address: z.string().min(1).max(500),
});

export const CreateTransportationRequestSchema = z.object({
  school:                    z.string().min(1).max(200),
  groupOrActivity:           z.string().min(1).max(300),
  sponsorName:               z.string().min(1).max(200),
  chargedTo:                 z.string().max(300).optional().nullable(),
  tripDate:                  z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  busCount:                  z.number().int().min(1).max(99),
  studentCount:              z.number().int().min(1).max(5000),
  chaperoneCount:            z.number().int().min(0).max(500),
  needsDriver:               z.boolean(),
  driverName:                z.string().max(200).optional().nullable(),
  loadingLocation:           z.string().min(1).max(500),
  loadingTime:               z.string().min(1).max(20),
  leavingSchoolTime:         z.string().min(1).max(20),
  arriveFirstDestTime:       z.string().max(20).optional().nullable(),
  leaveLastDestTime:         z.string().max(20).optional().nullable(),
  returnToSchoolTime:        z.string().min(1).max(20),
  primaryDestinationName:    z.string().min(1).max(500),
  primaryDestinationAddress: z.string().min(1).max(500),
  additionalDestinations:    z.array(AdditionalDestinationSchema).max(10).optional().nullable(),
  tripItinerary:             z.string().max(5000).optional().nullable(),
}).refine(
  (data) => data.needsDriver || (data.driverName && data.driverName.trim().length > 0),
  { message: 'Driver name is required when you are providing your own driver', path: ['driverName'] },
);

export type CreateTransportationRequestDto = z.infer<typeof CreateTransportationRequestSchema>;

export const ApproveTransportationRequestSchema = z.object({
  comments: z.string().max(3000).optional().nullable(),
});

export type ApproveTransportationRequestDto = z.infer<typeof ApproveTransportationRequestSchema>;

export const DenyTransportationRequestSchema = z.object({
  denialReason: z.string().min(10, 'Denial reason must be at least 10 characters').max(3000),
});

export type DenyTransportationRequestDto = z.infer<typeof DenyTransportationRequestSchema>;

export const TransportationRequestIdParamSchema = z.object({
  id: z.string().uuid('Invalid transportation request ID'),
});

export const ListTransportationRequestsQuerySchema = z.object({
  status: z.enum(TRANSPORTATION_REQUEST_STATUSES).optional(),
  from:   z.string().optional(),
  to:     z.string().optional(),
});

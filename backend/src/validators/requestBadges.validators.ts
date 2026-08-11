/**
 * Zod validation schema for the request-badges endpoints.
 */

import { z } from 'zod';

export const RequestSectionParamSchema = z.object({
  section: z.enum([
    'WORK_ORDERS',
    'PURCHASE_ORDERS',
    'FIELD_TRIPS',
    'FIELD_TRIP_APPROVALS',
    'TRANSPORTATION_REQUESTS',
  ]),
});

export type RequestSectionParamDto = z.infer<typeof RequestSectionParamSchema>;

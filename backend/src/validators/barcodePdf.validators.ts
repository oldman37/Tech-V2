import { z } from 'zod';

export const BarcodePdfQuerySchema = z.object({
  locationId: z.string().uuid('locationId must be a valid UUID'),
  gradeLevel: z.string().min(1, 'gradeLevel is required').max(10),
});

import { z } from 'zod';

export const RunProvisioningSchema = z.object({
  userType: z.enum(['STAFF', 'STUDENT', 'ALL']).optional().default('ALL'),
  testMode: z.boolean().optional(),
});

export const UpdateProvisioningConfigSchema = z.object({
  staffPassword:    z.string().min(8).optional(),
  studentPassword:  z.string().min(8).optional(),
  staffUpnDomain:       z.string().min(1).optional(),
  studentUpnDomain:     z.string().min(1).optional(),
  testStaffUpnDomain:   z.string().min(1).nullable().optional(),
  testStudentUpnDomain: z.string().min(1).nullable().optional(),
  targetTenant:     z.enum(['PRODUCTION', 'TEST']).optional(),
  testMode:         z.boolean().optional(),
  disableThreshold: z.number().int().min(0).max(1000).optional(),
  reportEmails:     z.string().nullable().optional(),
  adminEmails:      z.string().nullable().optional(),
  syncSchedule:     z.string().min(1).nullable().optional(),
  syncEnabled:      z.boolean().optional(),
}).refine(
  (d) =>
    d.staffPassword        !== undefined ||
    d.studentPassword      !== undefined ||
    d.staffUpnDomain       !== undefined ||
    d.studentUpnDomain     !== undefined ||
    d.testStaffUpnDomain   !== undefined ||
    d.testStudentUpnDomain !== undefined ||
    d.targetTenant         !== undefined ||
    d.testMode             !== undefined ||
    d.disableThreshold     !== undefined ||
    d.reportEmails         !== undefined ||
    d.adminEmails          !== undefined ||
    d.syncSchedule         !== undefined ||
    d.syncEnabled          !== undefined,
  { message: 'At least one field is required' },
);

const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

export function meetsPasswordComplexity(pw: string): boolean {
  return PASSWORD_COMPLEXITY.test(pw);
}

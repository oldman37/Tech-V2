/**
 * Zod validation schemas for system settings endpoints.
 * Follows the exact pattern of fundingSource.validators.ts.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// PUT /api/settings — full update (all fields optional for partial updates)
// ---------------------------------------------------------------------------

export const UpdateSettingsSchema = z.object({
  nextReqNumber: z
    .number({ error: 'nextReqNumber must be a number' })
    .int('nextReqNumber must be a whole number')
    .min(1, 'nextReqNumber must be at least 1')
    .optional(),

  reqNumberPrefix: z
    .string()
    .max(20, 'reqNumberPrefix must be 20 characters or less')
    .optional(),

  nextPoNumber: z
    .number({ error: 'nextPoNumber must be a number' })
    .int('nextPoNumber must be a whole number')
    .min(1, 'nextPoNumber must be at least 1')
    .optional(),

  poNumberPrefix: z
    .string()
    .max(20, 'poNumberPrefix must be 20 characters or less')
    .optional(),

  supervisorBypassEnabled: z
    .boolean({ error: 'supervisorBypassEnabled must be a boolean' })
    .optional(),

  supervisorApprovalLevel: z
    .number({ error: 'supervisorApprovalLevel must be a number' })
    .int('supervisorApprovalLevel must be a whole number')
    .min(1, 'supervisorApprovalLevel must be between 1 and 6')
    .max(6, 'supervisorApprovalLevel must be between 1 and 6')
    .optional(),

  financeDirectorApprovalLevel: z
    .number({ error: 'financeDirectorApprovalLevel must be a number' })
    .int('financeDirectorApprovalLevel must be a whole number')
    .min(1, 'financeDirectorApprovalLevel must be between 1 and 6')
    .max(6, 'financeDirectorApprovalLevel must be between 1 and 6')
    .optional(),

  dosApprovalLevel: z
    .number({ error: 'dosApprovalLevel must be a number' })
    .int('dosApprovalLevel must be a whole number')
    .min(1, 'dosApprovalLevel must be between 1 and 6')
    .max(6, 'dosApprovalLevel must be between 1 and 6')
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/settings/new-fiscal-year — start a new fiscal year (rollover)
// ---------------------------------------------------------------------------

const IN_PROGRESS_ACTIONS = ['carry_forward', 'deny_drafts', 'deny_all'] as const;

export const StartNewFiscalYearSchema = z
  .object({
    fiscalYearLabel: z.string().min(1, 'Fiscal year label is required'),
    fiscalYearStart: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), 'fiscalYearStart must be a valid ISO date'),
    fiscalYearEnd: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), 'fiscalYearEnd must be a valid ISO date'),
    inProgressAction: z.enum(IN_PROGRESS_ACTIONS),
    denialReason: z
      .string()
      .max(1000, 'Denial reason must be 1000 characters or less')
      .optional(),
    reqNumberPrefix: z.string().max(20, 'reqNumberPrefix must be 20 characters or less'),
    nextReqNumber: z
      .number({ error: 'nextReqNumber must be a number' })
      .int('nextReqNumber must be a whole number')
      .min(1, 'nextReqNumber must be at least 1'),
    poNumberPrefix: z.string().max(20, 'poNumberPrefix must be 20 characters or less'),
    nextPoNumber: z
      .number({ error: 'nextPoNumber must be a number' })
      .int('nextPoNumber must be a whole number')
      .min(1, 'nextPoNumber must be at least 1'),
    supervisorBypassEnabled: z.boolean().optional(),
    supervisorApprovalLevel: z.number().int().min(1).max(6).optional(),
    financeDirectorApprovalLevel: z.number().int().min(1).max(6).optional(),
    dosApprovalLevel: z.number().int().min(1).max(6).optional(),
  })
  .refine(
    (data) => {
      if (data.inProgressAction === 'deny_drafts' || data.inProgressAction === 'deny_all') {
        return !!data.denialReason && data.denialReason.trim().length > 0;
      }
      return true;
    },
    { message: 'Denial reason is required when denying in-progress requisitions', path: ['denialReason'] },
  )
  .refine(
    (data) => {
      const match = data.fiscalYearLabel.match(/^(\d{4})-(\d{4})$/);
      if (!match) return false;
      const startYear = parseInt(match[1], 10);
      const endYear = parseInt(match[2], 10);
      return endYear === startYear + 1;
    },
    { message: 'Fiscal year label must be in YYYY-YYYY format where the second year = first year + 1', path: ['fiscalYearLabel'] },
  );

// TypeScript DTO types
export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
export type StartNewFiscalYearDto = z.infer<typeof StartNewFiscalYearSchema>;

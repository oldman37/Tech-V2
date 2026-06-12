import { z } from 'zod';

const IntuneActionSchema = z.enum([
  'syncDevice',
  'rebootNow',
  'retire',
  'wipe',
  'cleanWindowsDevice',
  'deleteDevice',
  'removeAutopilot',
  'removeEntra',
  'fullDecommission',
]);

export const ModelIdParamSchema = z.object({
  modelId: z.string().uuid('Invalid model ID'),
});

export const SerialNumberParamSchema = z.object({
  serialNumber: z.string().min(1).max(200),
});

export const BulkActionSchema = z.object({
  modelId:      z.string().uuid('Invalid model ID'),
  action:       IntuneActionSchema,
  confirm:      z.boolean(),
  keepUserData: z.boolean().optional(),
  confirmText:  z.string().max(50).optional(),
});

export const SingleActionSchema = z
  .object({
    serialNumber:   z.string().min(1).max(200).optional(),
    intuneDeviceId: z.string().min(1).max(200).optional(),
    action:         IntuneActionSchema,
    confirm:        z.boolean(),
    keepUserData:   z.boolean().optional(),
    confirmText:    z.string().max(50).optional(),
  })
  .refine((d) => !!(d.serialNumber || d.intuneDeviceId), {
    message: 'Either serialNumber or intuneDeviceId is required',
  });

export const DeviceSearchSchema = z.object({
  deviceNames: z
    .array(z.string().min(1).max(300))
    .min(1, 'At least one device name is required')
    .max(50, 'Maximum 50 device names per search'),
});

export const DeviceListActionSchema = z.object({
  intuneDeviceIds: z
    .array(z.string().min(1).max(300))
    .min(1, 'At least one device ID is required')
    .max(50, 'Maximum 50 devices per action'),
  action:      IntuneActionSchema,
  confirm:     z.boolean(),
  keepUserData: z.boolean().optional(),
  confirmText: z.string().max(50).optional(),
});

export const ActionLogsQuerySchema = z.object({
  page: z
    .preprocess(
      (v) => v ?? '1',
      z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .refine((n) => n > 0),
    )
    .optional(),
  limit: z
    .preprocess(
      (v) => v ?? '50',
      z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .refine((n) => n > 0 && n <= 100),
    )
    .optional(),
  action: IntuneActionSchema.optional(),
});

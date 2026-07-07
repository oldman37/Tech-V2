import { z } from 'zod';
import { INTUNE_DEVICE_ACTION_BATCH_SIZE, INTUNE_RENAME_MAX_ROWS } from '@mgspe/shared-types';

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
  'setDeviceName',
]);

export const ModelIdParamSchema = z.object({
  modelId: z.string().uuid('Invalid model ID'),
});

export const SerialNumberParamSchema = z.object({
  serialNumber: z.string().min(1).max(200),
});

export const DeviceNameParamSchema = z.object({
  deviceName: z.string().min(1).max(300),
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

export const SearchByModelSchema = z.object({
  model: z.string().trim().min(2, 'Enter at least 2 characters').max(200),
});

export const DeviceListActionSchema = z.object({
  intuneDeviceIds: z
    .array(z.string().min(1).max(300))
    .min(1, 'At least one device ID is required')
    .max(
      INTUNE_DEVICE_ACTION_BATCH_SIZE,
      `Maximum ${INTUNE_DEVICE_ACTION_BATCH_SIZE} devices per action`,
    ),
  action:      IntuneActionSchema,
  confirm:     z.boolean(),
  keepUserData: z.boolean().optional(),
  confirmText: z.string().max(50).optional(),
});

export const AddToInventoryFromReconciliationSchema = z.object({
  devices: z
    .array(
      z.object({
        intuneDeviceId: z.string().min(1).max(300),
        deviceName:     z.string().max(300).nullable(),
        serialNumber:   z.string().max(200).nullable(),
        model:          z.string().max(200).nullable(),
        manufacturer:   z.string().max(200).nullable(),
      }),
    )
    .min(1, 'At least one device is required')
    .max(200, 'Maximum 200 devices per request'),
  categoryId:       z.string().uuid().optional().nullable(),
  locationId:       z.string().uuid().optional().nullable(),
  officeLocationId: z.string().uuid().optional().nullable(),
  brandId:          z.string().uuid().optional().nullable(),
  modelId:          z.string().uuid().optional().nullable(),
  vendorId:         z.string().uuid().optional().nullable(),
  poNumber:         z.string().max(50).optional().nullable(),
  fundingSourceId:  z.string().uuid().optional().nullable(),
  purchaseDate:     z.string().datetime().optional().nullable(),
  purchasePrice:    z.number().optional().nullable(),
  condition:        z.string().max(50).optional().nullable(),
  notes:            z.string().max(2000).optional().nullable(),
});

const RenamePreviewInputItemSchema = z
  .object({
    serialNumber: z.string().max(200).optional(),
    tagNumber:    z.string().max(50).optional(),
  })
  .refine((d) => !!(d.serialNumber?.trim() || d.tagNumber?.trim()), {
    message: 'Either serialNumber or tagNumber is required',
  });

export const RenamePreviewSchema = z.object({
  items: z
    .array(RenamePreviewInputItemSchema)
    .min(1, 'At least one item is required')
    .max(INTUNE_RENAME_MAX_ROWS, `Maximum ${INTUNE_RENAME_MAX_ROWS} rows per request`),
});

export const RenameExecuteSchema = z.object({
  items: z
    .array(
      z.object({
        intuneDeviceId:     z.string().min(1).max(300),
        serialNumber:       z.string().max(200),
        newDeviceName:      z.string().min(1).max(63),
        previousDeviceName: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1, 'At least one item is required')
    .max(INTUNE_RENAME_MAX_ROWS, `Maximum ${INTUNE_RENAME_MAX_ROWS} rows per request`),
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

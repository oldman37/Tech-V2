import { createGraphClient } from '../utils/graphClient';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { AppError } from '../utils/errors';
import ExcelJS from 'exceljs';
import { parse as parseCSV } from 'csv-parse/sync';
import type {
  IntuneDevice,
  AutopilotDevice,
  IntuneDeviceCollection,
  AutopilotDeviceCollection,
  BatchRequestItem,
  BatchResponseItem,
  GraphBitLockerKey,
  GraphBitLockerKeyCollection,
} from '../types/microsoft-graph.types';
import type {
  IntuneAction,
  DeviceActionResult,
  BulkDeviceActionResponse,
  DeviceModelPreviewResponse,
  DeviceStatusResponse,
  IntuneDevicePreview,
  DeviceSearchResponse,
  DeviceModelSearchResponse,
  IntuneActionLogsResponse,
  ReconciliationReport,
  IntuneOnlyDevice,
  InventoryOnlyDevice,
  StaleIntuneDevice,
  BitLockerKeyEntry,
  BitLockerKeyResponse,
  ReconciliationAddToInventoryRequest,
  ReconciliationAddToInventoryResponse,
  RenamePreviewItem,
  RenamePreviewResponse,
  RenameDeviceRequestItem,
  RenameDeviceResult,
  RenameDevicesResponse,
} from '@mgspe/shared-types';
import { validateIntuneDeviceName } from '@mgspe/shared-types';

const log = createLogger('IntuneDeviceService');

// ---------------------------------------------------------------------------
// OData injection prevention
// ---------------------------------------------------------------------------

function escapeOdata(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Retry helper for Graph throttling
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      // Check for 429 throttle response
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 429 && attempt < maxAttempts) {
        const retryAfter =
          (err as { headers?: { 'retry-after'?: string } })?.headers?.[
            'retry-after'
          ];
        const delaySec = retryAfter ? parseInt(retryAfter, 10) : 5;
        log.warn(`Graph throttled (429). Retrying in ${delaySec}s (attempt ${attempt}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
      } else if (attempt < maxAttempts) {
        // Retry other transient errors with a short delay
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Internal Graph helpers
// ---------------------------------------------------------------------------

async function queryIntuneByModel(
  modelName: string,
  mode: 'eq' | 'contains' = 'eq',
): Promise<IntuneDevice[]> {
  const client = await createGraphClient();
  const safeModel = escapeOdata(modelName);
  const select =
    'id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model,manufacturer,userDisplayName,userPrincipalName';

  const filter =
    mode === 'contains'
      ? `contains(model,'${safeModel}')`
      : `model eq '${safeModel}'`;

  let url = `/deviceManagement/managedDevices?$filter=${filter}&$select=${select}&$top=999`;
  const results: IntuneDevice[] = [];

  while (url) {
    // eslint-disable-next-line no-await-in-loop
    const page: IntuneDeviceCollection = await withRetry(() =>
      client.api(url).get(),
    );
    results.push(...(page.value ?? []));
    url = page['@odata.nextLink'] ?? '';
  }

  return results;
}

async function getDeviceBySerial(serialNumber: string): Promise<IntuneDevice | null> {
  const client = await createGraphClient();
  const safeSerial = escapeOdata(serialNumber);
  const select =
    'id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model';

  const page: IntuneDeviceCollection = await withRetry(() =>
    client
      .api(
        `/deviceManagement/managedDevices?$filter=serialNumber eq '${safeSerial}'&$select=${select}&$top=1`,
      )
      .get(),
  );
  return page.value?.[0] ?? null;
}

async function getDeviceByName(deviceName: string): Promise<IntuneDevice | null> {
  const client = await createGraphClient();
  const safeName = escapeOdata(deviceName);
  const select =
    'id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model';

  // Exact match first; falls back to contains for partial names (e.g. barcode suffix)
  const exactPage: IntuneDeviceCollection = await withRetry(() =>
    client
      .api(`/deviceManagement/managedDevices?$filter=deviceName eq '${safeName}'&$select=${select}&$top=1`)
      .get(),
  );
  if (exactPage.value?.[0]) return exactPage.value[0];

  const containsPage: IntuneDeviceCollection = await withRetry(() =>
    client
      .api(`/deviceManagement/managedDevices?$filter=contains(deviceName,'${safeName}')&$select=${select}&$top=1`)
      .get(),
  );
  return containsPage.value?.[0] ?? null;
}

async function getAutopilotIdentity(serialNumber: string): Promise<AutopilotDevice | null> {
  const client = await createGraphClient();
  const safeSerial = escapeOdata(serialNumber);

  // `contains` is intentionally used over `eq` because some Autopilot records
  // include extra whitespace around the serial number in the Intune portal.
  // The $top=1 ensures we take the first match; if stricter matching is ever
  // needed, switch to `serialNumber eq '${safeSerial}'`.
  const page: AutopilotDeviceCollection = await withRetry(() =>
    client
      .api(
        `/deviceManagement/windowsAutopilotDeviceIdentities?$filter=contains(serialNumber,'${safeSerial}')&$top=1`,
      )
      .get(),
  );
  return page.value?.[0] ?? null;
}

async function getEntraDeviceObjectId(azureADDeviceId: string): Promise<string | null> {
  if (!azureADDeviceId) return null;
  const client = await createGraphClient();
  const safeId = escapeOdata(azureADDeviceId);

  const page: { value?: Array<{ id: string; deviceId: string }> } =
    await withRetry(() =>
      client
        .api(`/devices?$filter=deviceId eq '${safeId}'&$select=id,deviceId&$top=1`)
        .get(),
    );
  return page.value?.[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

const HIGH_RISK_ACTIONS: IntuneAction[] = [
  'retire',
  'wipe',
  'cleanWindowsDevice',
  'deleteDevice',
  'removeAutopilot',
  'removeEntra',
  'fullDecommission',
];

function requiresConfirmation(action: IntuneAction): boolean {
  return HIGH_RISK_ACTIONS.includes(action);
}

async function executeActionOnDevice(
  device: IntuneDevice,
  action: IntuneAction,
  options: { keepUserData?: boolean },
  assetTag: string | null,
): Promise<DeviceActionResult> {
  const base: Pick<
    DeviceActionResult,
    'serialNumber' | 'assetTag' | 'intuneDeviceId' | 'autopilotDeviceId' | 'entraDeviceId'
  > = {
    serialNumber:     device.serialNumber ?? '',
    assetTag,
    intuneDeviceId:   device.id,
    autopilotDeviceId: null,
    entraDeviceId:    null,
  };

  const client = await createGraphClient();

  try {
    switch (action) {
      case 'syncDevice':
        await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${device.id}/syncDevice`).post({}),
        );
        return { ...base, status: 'success' };

      case 'rebootNow':
        await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${device.id}/rebootNow`).post({}),
        );
        return { ...base, status: 'success' };

      case 'retire':
        await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${device.id}/retire`).post({}),
        );
        return { ...base, status: 'success' };

      case 'wipe':
        await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${device.id}/wipe`).post({}),
        );
        return { ...base, status: 'success' };

      case 'cleanWindowsDevice': {
        if (!device.operatingSystem?.toLowerCase().startsWith('windows')) {
          return {
            ...base,
            status: 'failed',
            error: 'cleanWindowsDevice requires a Windows device',
          };
        }
        await withRetry(() =>
          client
            .api(`/deviceManagement/managedDevices/${device.id}/cleanWindowsDevice`)
            .post({ keepUserData: options.keepUserData ?? false }),
        );
        return { ...base, status: 'success' };
      }

      case 'deleteDevice':
        await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${device.id}`).delete(),
        );
        return { ...base, status: 'success' };

      case 'removeAutopilot': {
        const autopilot = device.serialNumber
          ? await getAutopilotIdentity(device.serialNumber)
          : null;
        if (!autopilot) {
          return {
            ...base,
            status: 'success',
            autopilotDeviceId: null,
            stepResults: { removeAutopilot: 'not_found' },
          };
        }
        await withRetry(() =>
          client
            .api(`/deviceManagement/windowsAutopilotDeviceIdentities/${autopilot.id}`)
            .delete(),
        );
        return {
          ...base,
          autopilotDeviceId: autopilot.id,
          status: 'success',
          stepResults: { removeAutopilot: 'success' },
        };
      }

      case 'removeEntra': {
        const entraObjectId = device.azureADDeviceId
          ? await getEntraDeviceObjectId(device.azureADDeviceId)
          : null;
        if (!entraObjectId) {
          return {
            ...base,
            status: 'success',
            entraDeviceId: null,
            stepResults: { removeEntra: 'not_found' },
          };
        }
        await withRetry(() =>
          client.api(`/devices/${entraObjectId}`).delete(),
        );
        return {
          ...base,
          entraDeviceId: entraObjectId,
          status: 'success',
          stepResults: { removeEntra: 'success' },
        };
      }

      case 'fullDecommission':
        return executeFullDecommission(device, assetTag, client);

      default:
        return { ...base, status: 'failed', error: `Unknown action: ${action}` };
    }
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message ?? 'Action failed';
    log.error(`Graph action '${action}' failed for device ${device.id}`, { error: err });
    return { ...base, status: 'failed', error: `Action failed: ${message}` };
  }
}

async function executeFullDecommission(
  device: IntuneDevice,
  assetTag: string | null,
  client: Awaited<ReturnType<typeof createGraphClient>>,
): Promise<DeviceActionResult> {
  const stepResults: DeviceActionResult['stepResults'] = {};
  let errorMsg: string | undefined;

  // Step 1: delete from Intune
  try {
    await withRetry(() =>
      client.api(`/deviceManagement/managedDevices/${device.id}`).delete(),
    );
    stepResults.deleteDevice = 'success';
  } catch (err: unknown) {
    stepResults.deleteDevice = 'failed';
    errorMsg =
      (err as { message?: string })?.message ?? 'deleteDevice failed';
    log.error(`fullDecommission deleteDevice failed for ${device.id}`, { error: err });
  }

  // Step 2: remove from Autopilot
  try {
    const autopilot = device.serialNumber
      ? await getAutopilotIdentity(device.serialNumber)
      : null;
    if (!autopilot) {
      stepResults.removeAutopilot = 'not_found';
    } else {
      await withRetry(() =>
        client
          .api(`/deviceManagement/windowsAutopilotDeviceIdentities/${autopilot.id}`)
          .delete(),
      );
      stepResults.removeAutopilot = 'success';
    }
  } catch (err: unknown) {
    stepResults.removeAutopilot = 'failed';
    log.error(`fullDecommission removeAutopilot failed for ${device.id}`, { error: err });
  }

  // Step 3: remove from Entra
  let entraObjectId: string | null = null;
  try {
    entraObjectId = device.azureADDeviceId
      ? await getEntraDeviceObjectId(device.azureADDeviceId)
      : null;
    if (!entraObjectId) {
      stepResults.removeEntra = 'not_found';
    } else {
      await withRetry(() =>
        client.api(`/devices/${entraObjectId}`).delete(),
      );
      stepResults.removeEntra = 'success';
    }
  } catch (err: unknown) {
    stepResults.removeEntra = 'failed';
    log.error(`fullDecommission removeEntra failed for ${device.id}`, { error: err });
  }

  // Determine overall status
  const anyFailed = Object.values(stepResults).some((s) => s === 'failed');
  const anySuccess = Object.values(stepResults).some((s) => s === 'success');

  let status: DeviceActionResult['status'];
  if (!anyFailed) {
    status = 'success';
  } else if (anyFailed && anySuccess) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  return {
    serialNumber:     device.serialNumber ?? '',
    assetTag,
    intuneDeviceId:   device.id,
    autopilotDeviceId: null,
    entraDeviceId:    entraObjectId,
    status,
    stepResults,
    error:            errorMsg,
  };
}

// ---------------------------------------------------------------------------
// Batch execution for batchable actions
// ---------------------------------------------------------------------------

const BATCHABLE_ACTIONS: IntuneAction[] = ['syncDevice', 'rebootNow', 'retire', 'wipe'];
const BATCH_SIZE = 20;

async function executeBatchAction(
  enrolledDevices: Array<{ device: IntuneDevice; assetTag: string | null }>,
  action: IntuneAction,
): Promise<DeviceActionResult[]> {
  const client = await createGraphClient();
  const results: DeviceActionResult[] = [];

  const actionPath = action; // e.g. 'syncDevice'

  for (let i = 0; i < enrolledDevices.length; i += BATCH_SIZE) {
    const batch = enrolledDevices.slice(i, i + BATCH_SIZE);
    const requests: BatchRequestItem[] = batch.map((item, idx) => ({
      id: String(idx + 1),
      method: 'POST',
      url: `/deviceManagement/managedDevices/${item.device.id}/${actionPath}`,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    }));

    // eslint-disable-next-line no-await-in-loop
    const batchResponse: { responses: BatchResponseItem[] } = await withRetry(() =>
      client.api('/$batch').post({ requests }),
    );

    const responseMap = new Map(
      batchResponse.responses.map((r) => [r.id, r]),
    );

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const response = responseMap.get(String(j + 1));
      const success = response?.status === 204 || response?.status === 200;
      results.push({
        serialNumber:     item.device.serialNumber ?? '',
        assetTag:         item.assetTag,
        intuneDeviceId:   item.device.id,
        autopilotDeviceId: null,
        entraDeviceId:    null,
        status:           success ? 'success' : 'failed',
        error:            success
          ? undefined
          : `Graph returned status ${response?.status ?? 'unknown'}`,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Inventory write-back after decommission
// ---------------------------------------------------------------------------

async function writeInventoryDisposals(
  results: DeviceActionResult[],
  action: IntuneAction,
  logId: string,
): Promise<void> {
  if (action !== 'fullDecommission' && action !== 'deleteDevice') return;

  const isSuccessful = (r: DeviceActionResult) => {
    if (action === 'fullDecommission') {
      return (
        r.status === 'success' ||
        (r.status === 'partial' && r.stepResults?.deleteDevice === 'success')
      );
    }
    return r.status === 'success';
  };

  const serialsToDispose  = results.filter((r) =>  !!r.serialNumber && isSuccessful(r)).map((r) => r.serialNumber);
  // Fallback for OCS-named devices that have no serial in Intune — match by asset tag instead
  const assetTagsToDispose = results.filter((r) => !r.serialNumber && !!r.assetTag && isSuccessful(r)).map((r) => r.assetTag as string);

  if (serialsToDispose.length === 0 && assetTagsToDispose.length === 0) return;

  const disposalData = {
    isDisposed:     true,
    disposedDate:   new Date(),
    disposedReason: `Decommissioned via Intune — IntuneActionLog/${logId}`,
    status:         'disposed',
  } as const;

  let totalCount = 0;

  if (serialsToDispose.length > 0) {
    const updated = await prisma.equipment.updateMany({
      where: { serialNumber: { in: serialsToDispose }, isDisposed: false },
      data:  disposalData,
    });
    totalCount += updated.count;
  }

  if (assetTagsToDispose.length > 0) {
    const updated = await prisma.equipment.updateMany({
      where: { assetTag: { in: assetTagsToDispose }, isDisposed: false },
      data:  disposalData,
    });
    totalCount += updated.count;
  }

  log.info(`Inventory write-back: marked ${totalCount} device(s) as disposed`, {
    logId,
    serials:   serialsToDispose,
    assetTags: assetTagsToDispose,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDevicesByModel(modelId: string): Promise<DeviceModelPreviewResponse> {
  const model = await prisma.models.findUnique({
    where: { id: modelId },
    include: {
      brands: true,
      equipment: {
        where: { isDisposed: false },
        select: { assetTag: true, serialNumber: true },
      },
    },
  });

  if (!model) {
    throw new AppError(`Model with ID ${modelId} not found`, 404, 'NOT_FOUND');
  }

  const modelName = model.name;
  const brandName = model.brands?.name ?? '';
  const inventory = model.equipment;

  if (inventory.length === 0) {
    return {
      modelId,
      modelName,
      brandName,
      totalInInventory: 0,
      enrolledCount:    0,
      notEnrolledCount: 0,
      devices:          [],
    };
  }

  // Fetch Intune devices for this model
  let intuneDevices: IntuneDevice[] = [];
  try {
    intuneDevices = await queryIntuneByModel(modelName);
  } catch (err) {
    log.error('Failed to query Intune devices by model', { modelName, error: err });
    throw new AppError('Failed to retrieve Intune device data', 502, 'GRAPH_ERROR');
  }

  // Build lookup map by serial (lower-cased for fuzzy match)
  const serialMap = new Map<string, IntuneDevice>();
  for (const d of intuneDevices) {
    if (d.serialNumber) {
      serialMap.set(d.serialNumber.toLowerCase().trim(), d);
    }
  }

  const devices = inventory.map((eq) => {
    const serial = eq.serialNumber ?? '';
    const intune = serialMap.get(serial.toLowerCase().trim()) ?? null;
    return {
      serialNumber:          serial,
      assetTag:              eq.assetTag,
      intuneDeviceId:        intune?.id ?? null,
      displayName:           intune?.deviceName ?? null,
      model:                 intune?.model ?? null,
      operatingSystem:       intune?.operatingSystem ?? null,
      complianceState:       intune?.complianceState ?? null,
      lastSyncDateTime:      intune?.lastSyncDateTime ?? null,
      enrolledDateTime:      intune?.enrolledDateTime ?? null,
      managedDeviceOwnerType: intune?.managedDeviceOwnerType ?? null,
      azureADDeviceId:       intune?.azureADDeviceId ?? null,
      enrollmentStatus:      (intune ? 'enrolled' : 'not_enrolled') as
        'enrolled' | 'not_enrolled',
    };
  });

  const enrolledCount    = devices.filter((d) => d.enrollmentStatus === 'enrolled').length;
  const notEnrolledCount = devices.length - enrolledCount;

  return {
    modelId,
    modelName,
    brandName,
    totalInInventory: inventory.length,
    enrolledCount,
    notEnrolledCount,
    devices,
  };
}

export async function executeBulkAction(
  modelId: string,
  action: IntuneAction,
  options: { keepUserData?: boolean; confirm: boolean; confirmText?: string },
  performedBy: string,
): Promise<BulkDeviceActionResponse> {
  // Service-layer precondition enforcement (belt-and-suspenders after Zod)
  if (requiresConfirmation(action) && !options.confirm) {
    throw new AppError(
      'Confirmation required for this action. Set confirm: true.',
      400,
      'CONFIRMATION_REQUIRED',
    );
  }
  if (action === 'fullDecommission' && options.confirmText !== 'DECOMMISSION') {
    throw new AppError(
      'Type DECOMMISSION to confirm full decommission.',
      400,
      'DECOMMISSION_CONFIRMATION_REQUIRED',
    );
  }

  const model = await prisma.models.findUnique({
    where: { id: modelId },
    include: {
      brands: true,
      equipment: {
        where: { isDisposed: false },
        select: { assetTag: true, serialNumber: true },
      },
    },
  });

  if (!model) {
    throw new AppError(`Model with ID ${modelId} not found`, 404, 'NOT_FOUND');
  }

  const modelName  = model.name;
  const inventory  = model.equipment;

  let intuneDevices: IntuneDevice[] = [];
  try {
    intuneDevices = await queryIntuneByModel(modelName);
  } catch (err) {
    log.error('Failed to query Intune devices', { modelName, error: err });
    throw new AppError('Failed to retrieve Intune device data', 502, 'GRAPH_ERROR');
  }

  const serialMap = new Map<string, IntuneDevice>();
  for (const d of intuneDevices) {
    if (d.serialNumber) {
      serialMap.set(d.serialNumber.toLowerCase().trim(), d);
    }
  }

  const notEnrolledResults: DeviceActionResult[] = [];
  const enrolledItems: Array<{ device: IntuneDevice; assetTag: string | null }> = [];

  for (const eq of inventory) {
    const serial = eq.serialNumber ?? '';
    const intune = serialMap.get(serial.toLowerCase().trim()) ?? null;
    if (!intune) {
      notEnrolledResults.push({
        serialNumber:     serial,
        assetTag:         eq.assetTag,
        intuneDeviceId:   null,
        autopilotDeviceId: null,
        entraDeviceId:    null,
        status:           'not_enrolled',
      });
    } else {
      enrolledItems.push({ device: intune, assetTag: eq.assetTag });
    }
  }

  let actionResults: DeviceActionResult[] = [];

  if (BATCHABLE_ACTIONS.includes(action)) {
    actionResults = await executeBatchAction(enrolledItems, action);
  } else {
    for (const item of enrolledItems) {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeActionOnDevice(
        item.device,
        action,
        options,
        item.assetTag,
      );
      actionResults.push(result);
    }
  }

  const allResults = [...notEnrolledResults, ...actionResults];

  const succeeded    = allResults.filter((r) => r.status === 'success').length;
  const failed       = allResults.filter((r) => r.status === 'failed').length;
  const partial      = allResults.filter((r) => r.status === 'partial').length;
  const notEnrolled  = notEnrolledResults.length;

  // Write audit log
  const logRecord = await prisma.intuneActionLog.create({
    data: {
      performedBy,
      action,
      modelId,
      modelName,
      totalDevices:     allResults.length,
      successCount:     succeeded,
      failedCount:      failed,
      notEnrolledCount: notEnrolled,
      results:          allResults as unknown as object,
    },
  });

  await writeInventoryDisposals(allResults, action, logRecord.id).catch(
    (err) => log.error('Inventory write-back failed (non-fatal)', { logId: logRecord.id, error: err }),
  );

  log.info(`Bulk action '${action}' on model '${modelName}' complete`, {
    total: allResults.length,
    succeeded,
    failed,
    partial,
    notEnrolled,
    logId: logRecord.id,
  });

  return {
    action,
    modelId,
    modelName,
    total:       allResults.length,
    succeeded,
    notEnrolled,
    failed,
    partial,
    results:     allResults,
    logId:       logRecord.id,
  };
}

export async function executeSingleAction(
  query: { serialNumber?: string; intuneDeviceId?: string },
  action: IntuneAction,
  options: { keepUserData?: boolean; confirm: boolean; confirmText?: string },
  performedBy: string,
): Promise<{ result: DeviceActionResult }> {
  if (requiresConfirmation(action) && !options.confirm) {
    throw new AppError(
      'Confirmation required for this action. Set confirm: true.',
      400,
      'CONFIRMATION_REQUIRED',
    );
  }
  if (action === 'fullDecommission' && options.confirmText !== 'DECOMMISSION') {
    throw new AppError(
      'Type DECOMMISSION to confirm full decommission.',
      400,
      'DECOMMISSION_CONFIRMATION_REQUIRED',
    );
  }

  let intuneDevice: IntuneDevice | null = null;
  let serialNumber = query.serialNumber ?? '';

  if (query.intuneDeviceId) {
    // Fetch directly by ID
    try {
      const client = await createGraphClient();
      intuneDevice = await withRetry(() =>
        client
          .api(
            `/deviceManagement/managedDevices/${query.intuneDeviceId}?$select=id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model`,
          )
          .get(),
      );
      if (intuneDevice?.serialNumber) {
        serialNumber = intuneDevice.serialNumber;
      }
    } catch (err) {
      log.error('Failed to fetch Intune device by ID', { id: query.intuneDeviceId, error: err });
      throw new AppError('Failed to retrieve Intune device', 502, 'GRAPH_ERROR');
    }
  } else if (query.serialNumber) {
    try {
      intuneDevice = await getDeviceBySerial(query.serialNumber);
    } catch (err) {
      log.error('Failed to query Intune by serial', { serial: query.serialNumber, error: err });
      throw new AppError('Failed to retrieve Intune device', 502, 'GRAPH_ERROR');
    }
  }

  // Resolve asset tag from inventory DB
  let assetTag: string | null = null;
  if (serialNumber) {
    const eq = await prisma.equipment.findFirst({
      where: { serialNumber },
      select: { assetTag: true },
    });
    assetTag = eq?.assetTag ?? null;
  }

  let result: DeviceActionResult;

  if (!intuneDevice) {
    result = {
      serialNumber,
      assetTag,
      intuneDeviceId:   null,
      autopilotDeviceId: null,
      entraDeviceId:    null,
      status:           'not_enrolled',
    };
  } else {
    result = await executeActionOnDevice(intuneDevice, action, options, assetTag);
  }

  // Write audit log
  const logRecord = await prisma.intuneActionLog.create({
    data: {
      performedBy,
      action,
      modelId:          null,
      modelName:        null,
      totalDevices:     1,
      successCount:     result.status === 'success' || result.status === 'partial' ? 1 : 0,
      failedCount:      result.status === 'failed' ? 1 : 0,
      notEnrolledCount: result.status === 'not_enrolled' ? 1 : 0,
      results:          [result] as unknown as object,
    },
  });

  await writeInventoryDisposals([result], action, logRecord.id).catch(
    (err) => log.error('Inventory write-back failed (non-fatal)', { logId: logRecord.id, error: err }),
  );

  log.info(`Single action '${action}' complete`, {
    serialNumber,
    status: result.status,
    logId: logRecord.id,
  });

  return { result };
}

export async function getDeviceStatus(serialNumber: string): Promise<DeviceStatusResponse> {
  const eq = await prisma.equipment.findFirst({
    where: { serialNumber },
    select: { assetTag: true },
  });

  let intuneDevice: IntuneDevice | null = null;
  try {
    intuneDevice = await getDeviceBySerial(serialNumber);
  } catch (err) {
    log.error('Failed to query device status', { serialNumber, error: err });
    throw new AppError('Failed to retrieve Intune device status', 502, 'GRAPH_ERROR');
  }

  let autopilotId: string | null = null;
  let entraObjectId: string | null = null;

  if (intuneDevice) {
    [autopilotId, entraObjectId] = await Promise.all([
      getAutopilotIdentity(serialNumber).then((a) => a?.id ?? null),
      intuneDevice.azureADDeviceId
        ? getEntraDeviceObjectId(intuneDevice.azureADDeviceId)
        : Promise.resolve(null),
    ]);
  }

  return {
    serialNumber,
    assetTag: eq?.assetTag ?? null,
    intune: {
      enrolled:         !!intuneDevice,
      intuneDeviceId:   intuneDevice?.id ?? null,
      displayName:      intuneDevice?.deviceName ?? null,
      operatingSystem:  intuneDevice?.operatingSystem ?? null,
      complianceState:  intuneDevice?.complianceState ?? null,
      lastSyncDateTime: intuneDevice?.lastSyncDateTime ?? null,
      azureADDeviceId:  intuneDevice?.azureADDeviceId ?? null,
    },
    autopilot: {
      enrolled:          !!autopilotId,
      autopilotDeviceId: autopilotId,
    },
    entra: {
      exists:        !!entraObjectId,
      entraObjectId: entraObjectId,
    },
  };
}

// ---------------------------------------------------------------------------
// Search devices by name list (scan workflow)
// ---------------------------------------------------------------------------

export async function searchDevicesByNames(
  deviceNames: string[],
): Promise<DeviceSearchResponse> {
  const client = await createGraphClient();
  const select =
    'id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime,managedDeviceOwnerType,azureADDeviceId,model';

  const CONCURRENCY = 5;
  // Track how each device was matched so the UI can flag fuzzy (contains) matches.
  const found: Array<{
    device: IntuneDevice;
    matchedName: string;
    matchType: 'exact' | 'contains';
  }> = [];
  const notFound: string[] = [];

  for (let i = 0; i < deviceNames.length; i += CONCURRENCY) {
    const batch = deviceNames.slice(i, i + CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map(async (name) => {
        const safeName = escapeOdata(name);
        try {
          // 1. Try exact match first (e.g. user typed the full device name)
          const exactPage: IntuneDeviceCollection = await withRetry(() =>
            client
              .api(
                `/deviceManagement/managedDevices?$filter=deviceName eq '${safeName}'&$select=${select}&$top=1`,
              )
              .get(),
          );
          if (exactPage.value?.[0]) {
            return { name, device: exactPage.value[0], matchType: 'exact' as const };
          }

          // 2. Fallback: contains — handles barcode scans that only capture the
          //    numeric suffix (e.g. "56538" matches "OCS-56538"). This is a fuzzy
          //    match: $top=1 returns the first arbitrary match, so it is surfaced
          //    to the user as 'contains' for verification before any action.
          const containsPage: IntuneDeviceCollection = await withRetry(() =>
            client
              .api(
                `/deviceManagement/managedDevices?$filter=contains(deviceName,'${safeName}')&$select=${select}&$top=1`,
              )
              .get(),
          );
          return { name, device: containsPage.value?.[0] ?? null, matchType: 'contains' as const };
        } catch (err) {
          log.warn(`Graph search failed for device name '${name}'`, { error: err });
          return { name, device: null, matchType: 'contains' as const };
        }
      }),
    );

    for (const { name, device, matchType } of results) {
      if (device) {
        found.push({ device, matchedName: name, matchType });
      } else {
        notFound.push(name);
      }
    }
  }

  // Look up asset tags from inventory DB for found devices
  const serialNumbers = found.map((f) => f.device.serialNumber).filter((s): s is string => !!s);
  const equipmentMap = new Map<string, string>();
  if (serialNumbers.length > 0) {
    const rows = await prisma.equipment.findMany({
      where:  { serialNumber: { in: serialNumbers } },
      select: { serialNumber: true, assetTag: true },
    });
    for (const row of rows) {
      if (row.serialNumber) equipmentMap.set(row.serialNumber, row.assetTag);
    }
  }

  const devices: IntuneDevicePreview[] = found.map(({ device: d, matchedName, matchType }) => ({
    serialNumber:            d.serialNumber ?? '',
    assetTag:                d.serialNumber ? (equipmentMap.get(d.serialNumber) ?? null) : null,
    intuneDeviceId:          d.id,
    displayName:             d.deviceName ?? null,
    model:                   d.model ?? null,
    operatingSystem:         d.operatingSystem ?? null,
    complianceState:         d.complianceState ?? null,
    lastSyncDateTime:        d.lastSyncDateTime ?? null,
    enrolledDateTime:        d.enrolledDateTime ?? null,
    managedDeviceOwnerType:  d.managedDeviceOwnerType ?? null,
    azureADDeviceId:         d.azureADDeviceId ?? null,
    enrollmentStatus:        'enrolled' as const,
    matchedName,
    matchType,
  }));

  log.info(`Device name search complete`, {
    submitted: deviceNames.length,
    found:     found.length,
    notFound:  notFound.length,
  });

  return {
    total:    deviceNames.length,
    found:    found.length,
    notFound,
    devices,
  };
}

// ---------------------------------------------------------------------------
// Search Intune devices by free-text model string (direct Intune lookup)
// ---------------------------------------------------------------------------

export async function searchDevicesByModelName(
  model: string,
): Promise<DeviceModelSearchResponse> {
  let intuneDevices: IntuneDevice[] = [];
  try {
    // 1. Exact match first (the `model eq` filter the existing feature relies on)
    intuneDevices = await queryIntuneByModel(model, 'eq');
    // 2. Fallback to a substring match when the exact filter returns nothing
    //    (handles marketing vs. SKU naming and partial model strings)
    if (intuneDevices.length === 0) {
      intuneDevices = await queryIntuneByModel(model, 'contains');
    }
  } catch (err) {
    log.error('Failed to search Intune devices by model', { model, error: err });
    throw new AppError('Failed to retrieve Intune device data', 502, 'GRAPH_ERROR');
  }

  // Best-effort asset tag enrichment from inventory (display-only)
  const serialNumbers = intuneDevices
    .map((d) => d.serialNumber)
    .filter((s): s is string => !!s);
  const equipmentMap = new Map<string, string>();
  if (serialNumbers.length > 0) {
    const rows = await prisma.equipment.findMany({
      where:  { serialNumber: { in: serialNumbers } },
      select: { serialNumber: true, assetTag: true },
    });
    for (const row of rows) {
      if (row.serialNumber) equipmentMap.set(row.serialNumber, row.assetTag);
    }
  }

  const devices: IntuneDevicePreview[] = intuneDevices.map((d) => ({
    serialNumber:           d.serialNumber ?? '',
    assetTag:               d.serialNumber ? (equipmentMap.get(d.serialNumber) ?? null) : null,
    intuneDeviceId:         d.id,
    displayName:            d.deviceName ?? null,
    model:                  d.model ?? null,
    operatingSystem:        d.operatingSystem ?? null,
    complianceState:        d.complianceState ?? null,
    lastSyncDateTime:       d.lastSyncDateTime ?? null,
    enrolledDateTime:       d.enrolledDateTime ?? null,
    managedDeviceOwnerType: d.managedDeviceOwnerType ?? null,
    azureADDeviceId:        d.azureADDeviceId ?? null,
    enrollmentStatus:       'enrolled' as const,
  }));

  log.info('Intune model search complete', { model, total: devices.length });

  return {
    model,
    total: devices.length,
    devices,
  };
}

// ---------------------------------------------------------------------------
// Execute action on an explicit list of Intune device IDs (scan workflow)
// ---------------------------------------------------------------------------

export async function executeDeviceListAction(
  intuneDeviceIds: string[],
  action: IntuneAction,
  options: { keepUserData?: boolean; confirm?: boolean; confirmText?: string },
  performedBy: string,
): Promise<BulkDeviceActionResponse> {
  // Belt-and-suspenders: enforce fullDecommission confirmText in service layer
  if (action === 'fullDecommission' && options.confirmText !== 'DECOMMISSION') {
    throw new AppError(
      'fullDecommission requires confirmText to be "DECOMMISSION"',
      400,
      'CONFIRM_REQUIRED',
    );
  }
  if (
    ['retire', 'wipe', 'cleanWindowsDevice', 'deleteDevice', 'removeAutopilot', 'removeEntra', 'fullDecommission'].includes(action) &&
    !options.confirm
  ) {
    throw new AppError(
      `Action '${action}' requires confirm: true`,
      400,
      'CONFIRM_REQUIRED',
    );
  }

  const client = await createGraphClient();
  const select = 'id,deviceName,serialNumber,operatingSystem,azureADDeviceId';

  // Fetch full device objects from Graph so action helpers have all required fields
  const devices = await Promise.all(
    intuneDeviceIds.map(async (id) => {
      try {
        const device: IntuneDevice = await withRetry(() =>
          client.api(`/deviceManagement/managedDevices/${id}?$select=${select}`).get(),
        );
        return device;
      } catch (err) {
        log.warn(`Could not fetch Intune device ${id} before action`, { error: err });
        return null;
      }
    }),
  );

  // Look up asset tags
  const serials = devices.filter((d): d is IntuneDevice => !!d).map((d) => d.serialNumber).filter((s): s is string => !!s);
  const assetTagMap = new Map<string, string>();
  if (serials.length > 0) {
    const rows = await prisma.equipment.findMany({
      where:  { serialNumber: { in: serials } },
      select: { serialNumber: true, assetTag: true },
    });
    for (const row of rows) {
      if (row.serialNumber) assetTagMap.set(row.serialNumber, row.assetTag);
    }
  }

  const allResults: DeviceActionResult[] = [];

  for (let i = 0; i < intuneDeviceIds.length; i++) {
    const device = devices[i];
    const id     = intuneDeviceIds[i];
    if (!device) {
      allResults.push({
        serialNumber:     '',
        assetTag:         null,
        intuneDeviceId:   id,
        autopilotDeviceId: null,
        entraDeviceId:    null,
        status:           'failed',
        error:            'Device not found in Intune',
      });
      continue;
    }
    let assetTag: string | null = null;
    if (device.serialNumber) {
      assetTag = assetTagMap.get(device.serialNumber) ?? null;
    } else if (device.deviceName) {
      // OCS-named devices (e.g. "OCS-54953") have no serial in Intune — derive asset tag from name
      const ocsMatch = /^OCS-(\d+)$/i.exec(device.deviceName);
      if (ocsMatch) assetTag = ocsMatch[1];
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await executeActionOnDevice(device, action, options, assetTag);
    allResults.push(result);
  }

  const succeeded   = allResults.filter((r) => r.status === 'success').length;
  const failed      = allResults.filter((r) => r.status === 'failed').length;
  const partial     = allResults.filter((r) => r.status === 'partial').length;
  const notEnrolled = 0; // all IDs came from Intune so they're enrolled

  const logRecord = await prisma.intuneActionLog.create({
    data: {
      performedBy,
      action,
      modelId:          null,
      modelName:        null,
      totalDevices:     allResults.length,
      successCount:     succeeded,
      failedCount:      failed,
      notEnrolledCount: notEnrolled,
      results:          allResults as unknown as object,
    },
  });

  await writeInventoryDisposals(allResults, action, logRecord.id).catch(
    (err) => log.error('Inventory write-back failed (non-fatal)', { logId: logRecord.id, error: err }),
  );

  log.info(`Device-list action '${action}' complete`, {
    total: allResults.length, succeeded, failed, partial, logId: logRecord.id,
  });

  return {
    action,
    modelId:    null,
    modelName:  null,
    total:      allResults.length,
    succeeded,
    notEnrolled,
    failed,
    partial,
    results:    allResults,
    logId:      logRecord.id,
  };
}

export async function getReconciliationReport(): Promise<ReconciliationReport> {
  const client = await createGraphClient();
  const now = new Date();

  // Fetch every Intune-enrolled device (no filter — full scan)
  const select =
    'id,deviceName,serialNumber,model,manufacturer,operatingSystem,' +
    'complianceState,lastSyncDateTime,enrolledDateTime';
  let url = `/deviceManagement/managedDevices?$select=${select}&$top=999`;
  const allIntuneDevices: IntuneDevice[] = [];
  while (url) {
    // eslint-disable-next-line no-await-in-loop
    const page: IntuneDeviceCollection = await withRetry(() => client.api(url).get());
    allIntuneDevices.push(...(page.value ?? []));
    url = page['@odata.nextLink'] ?? '';
  }

  // Fetch ALL inventory equipment (active + disposed) for matching.
  // Disposed records must be included so that decommissioned devices don't
  // falsely appear as "in Intune but not in inventory".
  const allInventoryRows = await prisma.equipment.findMany({
    select: {
      assetTag:    true,
      serialNumber: true,
      name:        true,
      isDisposed:  true,
      models: { select: { name: true } },
      brands: { select: { name: true } },
    },
  });

  const activeInventoryRows = allInventoryRows.filter((r) => !r.isDisposed);

  // Build lookup maps keyed by normalised serial (trimmed + uppercased)
  const normalize = (s: string | null | undefined): string | null =>
    s ? s.trim().toUpperCase() : null;

  // OCS-named devices (e.g. "OCS-57804") have no serial in Intune;
  // their asset tag is the number after "OCS-".
  const OCS_RE = /^OCS-(\d+)$/i;

  const intuneBySerial = new Map<string, IntuneDevice>();
  const intuneByAssetTag = new Map<string, IntuneDevice>(); // keyed by OCS asset tag
  for (const d of allIntuneDevices) {
    const k = normalize(d.serialNumber);
    if (k) intuneBySerial.set(k, d);
    if (d.deviceName) {
      const m = OCS_RE.exec(d.deviceName);
      if (m) intuneByAssetTag.set(m[1], d);
    }
  }

  const inventoryBySerial = new Map<string, (typeof allInventoryRows)[0]>();
  const inventoryByAssetTag = new Map<string, (typeof allInventoryRows)[0]>();
  for (const d of allInventoryRows) {
    const k = normalize(d.serialNumber);
    if (k) inventoryBySerial.set(k, d);
    inventoryByAssetTag.set(d.assetTag, d);
  }

  // Resolve the inventory record for an Intune device: serial first,
  // then OCS asset-tag fallback (always tried when serial lookup misses,
  // because OCS-named devices carry the OPS serial — not the device's own
  // inventory serial — so serial can be present but simply not match).
  const findInventoryMatch = (d: IntuneDevice) => {
    const k = normalize(d.serialNumber);
    if (k) {
      const bySerial = inventoryBySerial.get(k);
      if (bySerial) return bySerial;
    }
    if (d.deviceName) {
      const m = OCS_RE.exec(d.deviceName);
      if (m) return inventoryByAssetTag.get(m[1]);
    }
    return undefined;
  };

  // Compute categories
  const STALE_DAYS = 60;
  const inIntuneOnly: IntuneOnlyDevice[] = [];
  const staleDevices: StaleIntuneDevice[] = [];

  for (const d of allIntuneDevices) {
    const inventoryMatch = findInventoryMatch(d);
    // Only flag as "in Intune only" when genuinely absent from inventory
    // (active AND disposed records are checked — a disposed match means it was
    // intentionally decommissioned and should not appear here).
    const activeMatch = inventoryMatch && !inventoryMatch.isDisposed ? inventoryMatch : undefined;

    if (!inventoryMatch) {
      inIntuneOnly.push({
        intuneDeviceId:  d.id,
        deviceName:      d.deviceName,
        serialNumber:    d.serialNumber,
        model:           d.model,
        manufacturer:    d.manufacturer,
        operatingSystem: d.operatingSystem,
        lastSyncDateTime: d.lastSyncDateTime,
        enrolledDateTime: d.enrolledDateTime,
        complianceState: d.complianceState,
      });
    }

    if (d.lastSyncDateTime) {
      const daysSinceSync = Math.floor(
        (now.getTime() - new Date(d.lastSyncDateTime).getTime()) / 86_400_000,
      );
      if (daysSinceSync >= STALE_DAYS) {
        staleDevices.push({
          intuneDeviceId:  d.id,
          deviceName:      d.deviceName,
          serialNumber:    d.serialNumber,
          assetTag:        activeMatch?.assetTag ?? inventoryMatch?.assetTag ?? null,
          model:           d.model,
          operatingSystem: d.operatingSystem,
          lastSyncDateTime: d.lastSyncDateTime,
          daysSinceSync,
          inInventory:     !!activeMatch,
        });
      }
    }
  }

  const inInventoryOnly: InventoryOnlyDevice[] = activeInventoryRows
    .filter((d) => {
      const k = normalize(d.serialNumber);
      if (k && intuneBySerial.has(k)) return false;
      if (intuneByAssetTag.has(d.assetTag)) return false;
      return true;
    })
    .map((d) => ({
      assetTag:     d.assetTag,
      serialNumber: d.serialNumber!,
      name:         d.name,
      modelName:    d.models?.name ?? null,
      brandName:    d.brands?.name ?? null,
    }));

  log.info('Reconciliation report generated', {
    totalIntune:          allIntuneDevices.length,
    totalInventoryActive: activeInventoryRows.length,
    inIntuneOnly:         inIntuneOnly.length,
    inInventoryOnly:      inInventoryOnly.length,
    stale60Days:          staleDevices.length,
    stale90Days:          staleDevices.filter((d) => d.daysSinceSync >= 90).length,
  });

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalIntune:          allIntuneDevices.length,
      totalInventoryActive: activeInventoryRows.length,
      inIntuneOnly:         inIntuneOnly.length,
      inInventoryOnly:      inInventoryOnly.length,
      stale60Days:          staleDevices.length,
      stale90Days:          staleDevices.filter((d) => d.daysSinceSync >= 90).length,
    },
    inIntuneOnly,
    inInventoryOnly,
    staleDevices,
  };
}

export async function getBitLockerKeys(
  deviceName: string,
  requestedBy: string,
): Promise<BitLockerKeyResponse> {
  // Step 1: Resolve Intune device by name (exact match → contains fallback)
  let intuneDevice: IntuneDevice | null = null;
  try {
    intuneDevice = await getDeviceByName(deviceName);
  } catch (err) {
    log.error('getBitLockerKeys: failed to query Intune by device name', { deviceName, error: err });
    throw new AppError('Failed to retrieve Intune device', 502, 'GRAPH_ERROR');
  }

  if (!intuneDevice) {
    return { serialNumber: null, assetTag: null, deviceName: null, intuneDeviceId: null, entraObjectId: null, keys: [] };
  }

  const serialNumber = intuneDevice.serialNumber;

  // Step 2: Resolve asset tag from inventory using the serial returned by Intune
  const eq = serialNumber
    ? await prisma.equipment.findFirst({
        where: { serialNumber },
        select: { assetTag: true },
      })
    : null;
  const assetTag = eq?.assetTag ?? null;

  // Step 3: The BitLocker recovery key API filters by azureADDeviceId (the hardware device GUID
  // that Intune stores as azureADDeviceId), NOT the Entra device object ID.
  const azureADDeviceId = intuneDevice.azureADDeviceId;
  if (!azureADDeviceId) {
    return {
      serialNumber,
      assetTag,
      deviceName: intuneDevice.deviceName,
      intuneDeviceId: intuneDevice.id,
      entraObjectId: null,
      keys: [],
    };
  }

  // Step 4: List BitLocker key metadata — filter by azureADDeviceId
  const client = await createGraphClient();
  const safeId = escapeOdata(azureADDeviceId);
  let keyList: GraphBitLockerKey[] = [];
  try {
    const resp: GraphBitLockerKeyCollection = await withRetry(() =>
      client
        .api(
          `/informationProtection/bitlocker/recoveryKeys?$filter=deviceId eq '${safeId}'&$select=id,createdDateTime,volumeType,deviceId`,
        )
        .get(),
    );
    keyList = resp.value ?? [];
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 403) {
      throw new AppError(
        'BitLockerKey.Read.All permission not granted. Ask your Azure administrator to grant this permission on the Entra app registration.',
        503,
        'BITLOCKER_PERMISSION_DENIED',
      );
    }
    log.error('getBitLockerKeys: failed to list BitLocker keys from Graph', { serialNumber, azureADDeviceId, error: err });
    throw new AppError('Failed to retrieve BitLocker keys', 502, 'GRAPH_ERROR');
  }

  // Step 5: Fetch the actual 48-digit key value for each key ID.
  // Each call is permanently audit-logged by Microsoft in Azure AD — never log key values here.
  const keys: BitLockerKeyEntry[] = [];
  for (const meta of keyList) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const detail: GraphBitLockerKey = await withRetry(() =>
        client.api(`/informationProtection/bitlocker/recoveryKeys/${meta.id}?$select=key`).get(),
      );
      keys.push({
        id:              meta.id,
        createdDateTime: meta.createdDateTime,
        volumeType:      meta.volumeType,
        key:             detail.key ?? '',
      });
    } catch (err) {
      log.warn('getBitLockerKeys: could not retrieve key value', { keyId: meta.id, error: err });
      keys.push({ id: meta.id, createdDateTime: meta.createdDateTime, volumeType: meta.volumeType, key: '' });
    }
  }

  log.info('BitLocker keys accessed', {
    requestedBy,
    deviceName,
    serialNumber,
    intuneDeviceId: intuneDevice.id,
    azureADDeviceId,
    keyCount: keys.length,
  });

  return {
    serialNumber,
    assetTag,
    deviceName: intuneDevice.deviceName,
    intuneDeviceId: intuneDevice.id,
    entraObjectId: azureADDeviceId,
    keys,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation → Add to Inventory
// ---------------------------------------------------------------------------

const OCS_ASSET_TAG_RE = /^OCS-(\d+)$/i;

export async function addReconciliationDevicesToInventory(
  payload: ReconciliationAddToInventoryRequest,
  performedBy: { id: string; email: string; name: string },
): Promise<ReconciliationAddToInventoryResponse> {
  const items: ReconciliationAddToInventoryResponse['items'] = [];
  const errors: ReconciliationAddToInventoryResponse['errors'] = [];

  for (const d of payload.devices) {
    try {
      const ocsMatch = d.deviceName ? OCS_ASSET_TAG_RE.exec(d.deviceName) : null;
      const assetTag = ocsMatch
        ? ocsMatch[1]
        : (d.deviceName ?? d.intuneDeviceId).substring(0, 50);

      const nameParts = [d.manufacturer, d.model].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : (d.deviceName ?? 'Unknown Device');

      // eslint-disable-next-line no-await-in-loop
      const item = await prisma.equipment.create({
        data: {
          assetTag,
          serialNumber:    d.serialNumber || null,
          name,
          categoryId:      payload.categoryId      ?? null,
          locationId:      payload.locationId      ?? null,
          officeLocationId: payload.officeLocationId ?? null,
          brandId:         payload.brandId         ?? null,
          modelId:         payload.modelId         ?? null,
          vendorId:        payload.vendorId        ?? null,
          poNumber:        payload.poNumber        ?? null,
          fundingSourceId: payload.fundingSourceId ?? null,
          purchaseDate:    payload.purchaseDate    ? new Date(payload.purchaseDate) : null,
          purchasePrice:   payload.purchasePrice   ?? null,
          condition:       payload.condition       ?? null,
          notes:           payload.notes           ?? null,
          status:          'active',
        },
        select: { id: true, assetTag: true, name: true },
      });

      items.push(item);
      log.info('Reconciliation: device added to inventory', {
        performedBy: performedBy.email,
        assetTag,
        intuneDeviceId: d.intuneDeviceId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Reconciliation: failed to add device to inventory', {
        intuneDeviceId: d.intuneDeviceId,
        deviceName: d.deviceName,
        error: message,
      });
      errors.push({ intuneDeviceId: d.intuneDeviceId, deviceName: d.deviceName, error: message });
    }
  }

  return { created: items.length, items, errors };
}

export async function getActionLogs(params: {
  page?: number;
  limit?: number;
  action?: IntuneAction;
}): Promise<IntuneActionLogsResponse> {
  const page  = params.page  ?? 1;
  const limit = params.limit ?? 50;
  const skip  = (page - 1) * limit;

  const where = params.action ? { action: params.action } : {};

  const [items, totalCount] = await prisma.$transaction([
    prisma.intuneActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        performedByUser: {
          select: { id: true, displayName: true, firstName: true, lastName: true },
        },
      },
    }),
    prisma.intuneActionLog.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id:              item.id,
      performedBy:     item.performedBy,
      performedByName:
        item.performedByUser?.displayName ??
        [item.performedByUser?.firstName, item.performedByUser?.lastName]
          .filter(Boolean)
          .join(' ') ??
        null,
      action:          item.action as IntuneAction,
      modelId:         item.modelId,
      modelName:       item.modelName,
      totalDevices:    item.totalDevices,
      successCount:    item.successCount,
      failedCount:     item.failedCount,
      notEnrolledCount: item.notEnrolledCount,
      results:         item.results as unknown as import('@mgspe/shared-types').DeviceActionResult[],
      createdAt:       item.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Rename devices (single lookup + bulk Excel/CSV upload)
// ---------------------------------------------------------------------------

const RENAME_CONCURRENCY = 5;
const SERIAL_HEADER_ALIASES = ['serial number', 'serial'];
const TAG_HEADER_ALIASES = ['tag number', 'tag#', 'tag', 'asset tag'];

/** Builds the fleet's `OCS-<tag>` naming convention, stripping a redundant existing prefix. */
function buildProposedDeviceName(tag: string): string {
  const cleaned = tag.trim().replace(/^OCS-/i, '').trim();
  return `OCS-${cleaned}`;
}

function findColumnKey(sampleKeys: string[], aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const found = sampleKeys.find((k) => k.trim().toLowerCase() === alias);
    if (found) return found;
  }
  return undefined;
}

/** Parses an uploaded Excel/CSV file into serial/tag row pairs for the rename preview. */
async function parseRenameExcelRows(
  fileBuffer: Buffer,
  fileName: string,
): Promise<{
  rows: Array<{ rowNumber: number; serialNumber: string; tagNumber: string | null }>;
  parseErrors: Array<{ rowNumber: number; message: string }>;
}> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  let rawRows: Record<string, unknown>[] = [];

  if (ext === 'csv') {
    try {
      rawRows = parseCSV(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, unknown>[];
    } catch {
      throw new AppError(
        'Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.',
        400,
        'VALIDATION_ERROR',
      );
    }
  } else {
    try {
      const workbook = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error TS2345: ExcelJS Buffer typedef mismatch with Node 20+ Buffer<ArrayBufferLike>
      await workbook.xlsx.load(fileBuffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new AppError('No worksheets found in the uploaded file.', 400, 'VALIDATION_ERROR');
      }

      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString() ?? '';
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (!header) return;
          let value: unknown = null;
          if (cell.value !== null && cell.value !== undefined) {
            if (cell.value instanceof Date) {
              value = cell.value;
            } else if (typeof cell.value === 'object' && 'richText' in (cell.value as object)) {
              value = (cell.value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
            } else if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
              value = (cell.value as ExcelJS.CellFormulaValue).result as number | string | null;
            } else {
              value = cell.value;
            }
          }
          rowData[header] = value;
        });
        rawRows.push(rowData);
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  if (rawRows.length === 0) {
    throw new AppError('The uploaded file has no data rows.', 400, 'VALIDATION_ERROR');
  }

  const sampleKeys = Object.keys(rawRows[0] ?? {});
  const serialKey = findColumnKey(sampleKeys, SERIAL_HEADER_ALIASES);
  const tagKey = findColumnKey(sampleKeys, TAG_HEADER_ALIASES);

  if (!serialKey) {
    throw new AppError(
      'Could not find a "Serial Number" column in the uploaded file.',
      400,
      'VALIDATION_ERROR',
    );
  }

  const rows: Array<{ rowNumber: number; serialNumber: string; tagNumber: string | null }> = [];
  const parseErrors: Array<{ rowNumber: number; message: string }> = [];

  rawRows.forEach((row, i) => {
    const rowNumber = i + 2; // header occupies row 1
    const serialNumber = row[serialKey]?.toString().trim();
    if (!serialNumber) {
      parseErrors.push({ rowNumber, message: 'Missing serial number' });
      return;
    }
    const tagRaw = tagKey ? row[tagKey] : null;
    const tagNumber = tagRaw !== null && tagRaw !== undefined ? tagRaw.toString().trim() || null : null;
    rows.push({ rowNumber, serialNumber, tagNumber });
  });

  return { rows, parseErrors };
}

export async function previewRenameItems(
  items: Array<{ serialNumber?: string; tagNumber?: string; rowNumber?: number }>,
): Promise<RenamePreviewResponse> {
  const previewItems: RenamePreviewItem[] = [];

  for (let i = 0; i < items.length; i += RENAME_CONCURRENCY) {
    const batch = items.slice(i, i + RENAME_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(
      batch.map(async ({ serialNumber, tagNumber, rowNumber }): Promise<RenamePreviewItem> => {
        let intuneDevice: IntuneDevice | null = null;
        let resolvedSerial = serialNumber?.trim() || '';
        const trimmedTag = tagNumber?.trim() || '';

        try {
          if (resolvedSerial) {
            // Serial given (or resolved from a file row) — the authoritative, direct lookup.
            intuneDevice = await getDeviceBySerial(resolvedSerial);
          } else if (trimmedTag) {
            // Tag-only lookup: try the fleet's OCS-<tag> naming convention directly against
            // Intune first — no inventory required. Only fall back to inventory's tag→serial
            // mapping if that direct name match misses (e.g. device not yet renamed to convention).
            intuneDevice = await getDeviceByName(buildProposedDeviceName(trimmedTag));
            if (!intuneDevice) {
              const eq = await prisma.equipment.findFirst({
                where:  { assetTag: trimmedTag },
                select: { serialNumber: true },
              });
              if (eq?.serialNumber) {
                resolvedSerial = eq.serialNumber;
                intuneDevice = await getDeviceBySerial(resolvedSerial);
              }
            }
          }
        } catch (err) {
          log.warn('previewRenameItems: Graph lookup failed', { serialNumber, tagNumber, error: err });
        }

        if (!resolvedSerial && intuneDevice?.serialNumber) {
          resolvedSerial = intuneDevice.serialNumber;
        }

        let resolvedTag = trimmedTag || null;
        let tagSource: RenamePreviewItem['tagSource'] = resolvedTag ? 'input' : null;

        if (!resolvedTag && resolvedSerial) {
          const eq = await prisma.equipment.findFirst({
            where:  { serialNumber: resolvedSerial },
            select: { assetTag: true },
          });
          if (eq?.assetTag) {
            resolvedTag = eq.assetTag;
            tagSource = 'inventory';
          }
        }

        const proposedDeviceName = resolvedTag ? buildProposedDeviceName(resolvedTag) : null;

        // "No tag" is informational, not a hard blocker — the device doesn't need to exist in
        // inventory to be renamed; the caller can type a name manually before executing.
        let issue: string | null;
        if (!intuneDevice) {
          issue = 'Not enrolled in Intune';
        } else if (!proposedDeviceName) {
          issue = 'No tag number found — enter a new name manually';
        } else {
          issue = validateIntuneDeviceName(proposedDeviceName);
        }

        return {
          rowNumber,
          serialNumber: resolvedSerial,
          tagNumber: resolvedTag,
          tagSource,
          intuneDeviceId: intuneDevice?.id ?? null,
          currentDeviceName: intuneDevice?.deviceName ?? null,
          proposedDeviceName,
          enrollmentStatus: intuneDevice ? 'enrolled' : 'not_enrolled',
          valid: !issue,
          issue,
        };
      }),
    );
    previewItems.push(...batchResults);
  }

  return {
    total: previewItems.length,
    validCount: previewItems.filter((i) => i.valid).length,
    invalidCount: previewItems.filter((i) => !i.valid).length,
    items: previewItems,
  };
}

export async function previewRenameFromFile(
  fileBuffer: Buffer,
  fileName: string,
): Promise<RenamePreviewResponse> {
  const { rows, parseErrors } = await parseRenameExcelRows(fileBuffer, fileName);
  const preview = await previewRenameItems(
    rows.map((r) => ({
      serialNumber: r.serialNumber,
      tagNumber:    r.tagNumber ?? undefined,
      rowNumber:    r.rowNumber,
    })),
  );

  return {
    ...preview,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
  };
}

export async function executeRenameDevices(
  items: RenameDeviceRequestItem[],
  performedBy: string,
): Promise<RenameDevicesResponse> {
  const client = await createGraphClient();

  const serials = items.map((i) => i.serialNumber);
  const equipmentRows = await prisma.equipment.findMany({
    where:  { serialNumber: { in: serials } },
    select: { serialNumber: true, assetTag: true },
  });
  const assetTagMap = new Map<string, string>();
  for (const row of equipmentRows) {
    if (row.serialNumber) assetTagMap.set(row.serialNumber, row.assetTag);
  }

  const results: RenameDeviceResult[] = [];

  for (const item of items) {
    // Defense-in-depth: the frontend now allows typing a name manually for devices with no
    // resolvable tag (e.g. not in inventory), so re-validate here rather than trusting the
    // client — never send an unvalidated name to Graph.
    const nameIssue = validateIntuneDeviceName(item.newDeviceName);
    if (nameIssue) {
      results.push({
        serialNumber:       item.serialNumber,
        assetTag:           assetTagMap.get(item.serialNumber) ?? null,
        intuneDeviceId:     item.intuneDeviceId,
        previousDeviceName: item.previousDeviceName ?? null,
        newDeviceName:      item.newDeviceName,
        status:             'failed',
        error:              nameIssue,
      });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await withRetry(() =>
        client
          .api(`/deviceManagement/managedDevices/${item.intuneDeviceId}/setDeviceName`)
          .version('beta')
          .post({ deviceName: item.newDeviceName }),
      );
      results.push({
        serialNumber:       item.serialNumber,
        assetTag:           assetTagMap.get(item.serialNumber) ?? null,
        intuneDeviceId:     item.intuneDeviceId,
        previousDeviceName: item.previousDeviceName ?? null,
        newDeviceName:      item.newDeviceName,
        status:             'success',
      });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Rename failed';
      log.error(`setDeviceName failed for device ${item.intuneDeviceId}`, { error: err });
      results.push({
        serialNumber:       item.serialNumber,
        assetTag:           assetTagMap.get(item.serialNumber) ?? null,
        intuneDeviceId:     item.intuneDeviceId,
        previousDeviceName: item.previousDeviceName ?? null,
        newDeviceName:      item.newDeviceName,
        status:             'failed',
        error:              `Rename failed: ${message}`,
      });
    }
  }

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed    = results.filter((r) => r.status === 'failed').length;

  const logRecord = await prisma.intuneActionLog.create({
    data: {
      performedBy,
      action:           'setDeviceName' satisfies IntuneAction,
      modelId:          null,
      modelName:        null,
      totalDevices:     results.length,
      successCount:     succeeded,
      failedCount:      failed,
      notEnrolledCount: 0,
      results:          results as unknown as object,
    },
  });

  log.info('Rename devices action complete', {
    total: results.length,
    succeeded,
    failed,
    logId: logRecord.id,
  });

  return {
    total:     results.length,
    succeeded,
    failed,
    results,
    logId:     logRecord.id,
  };
}

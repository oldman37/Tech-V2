import { api } from './api';
import type {
  DeviceModelPreviewResponse,
  DeviceStatusResponse,
  BulkDeviceActionRequest,
  SingleDeviceActionRequest,
  BulkDeviceActionResponse,
  DeviceActionResult,
  DeviceSearchRequest,
  DeviceSearchResponse,
  DeviceListActionRequest,
  IntuneActionLogsResponse,
} from '@mgspe/shared-types';

const BASE = '/intune';

export const intuneService = {
  getByModel: (modelId: string): Promise<DeviceModelPreviewResponse> =>
    api.get(`${BASE}/devices/by-model/${modelId}`).then((r) => r.data),

  getDeviceStatus: (serialNumber: string): Promise<DeviceStatusResponse> =>
    api
      .get(`${BASE}/devices/${encodeURIComponent(serialNumber)}/status`)
      .then((r) => r.data),

  executeBulkAction: (data: BulkDeviceActionRequest): Promise<BulkDeviceActionResponse> =>
    api.post(`${BASE}/actions/bulk`, data).then((r) => r.data),

  executeSingleAction: (data: SingleDeviceActionRequest): Promise<DeviceActionResult> =>
    api.post(`${BASE}/actions/single`, data).then((r) => r.data),

  getLogs: (params?: {
    page?: number;
    limit?: number;
    action?: string;
  }): Promise<IntuneActionLogsResponse> =>
    api.get(`${BASE}/logs`, { params }).then((r) => r.data),

  searchDevices: (data: DeviceSearchRequest): Promise<DeviceSearchResponse> =>
    api.post(`${BASE}/devices/search`, data).then((r) => r.data),

  executeDeviceListAction: (data: DeviceListActionRequest): Promise<BulkDeviceActionResponse> =>
    api.post(`${BASE}/actions/by-device-ids`, data).then((r) => r.data),
};

import api from './api';

/**
 * Download student barcode PDF for a given school location and grade level.
 * Returns the raw Blob so the caller can create an object URL and trigger a download.
 */
export async function downloadBarcodePdf(
  locationId: string,
  gradeLevel: string,
): Promise<Blob> {
  const response = await api.get<Blob>('/device-barcodes/pdf', {
    params: { locationId, gradeLevel },
    responseType: 'blob',
  });
  return response.data;
}

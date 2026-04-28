/**
 * Shared formatter utilities for inventory-related pages and components.
 * Extracted from EquipmentSearch.tsx and EquipmentDetailDrawer.tsx to avoid duplication.
 */

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString();
};

export const formatCurrency = (value: number | string | null | undefined): string => {
  if (value == null) return '—';
  return `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const getStatusBadgeClass = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: 'badge-success',
    available: 'badge-success',
    maintenance: 'badge-error',
    storage: 'badge-error',
    disposed: 'badge-error',
    lost: 'badge-error',
    damaged: 'badge-error',
    reserved: 'badge-error',
  };
  return statusMap[status] || 'badge-error';
};

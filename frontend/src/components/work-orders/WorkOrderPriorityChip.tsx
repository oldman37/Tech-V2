import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';
import {
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderPriority,
} from '@/types/work-order.types';

const PRIORITY_COLOR: Record<WorkOrderPriority, ChipProps['color']> = {
  LOW:    'success',
  MEDIUM: 'info',
  HIGH:   'warning',
  URGENT: 'error',
};

interface WorkOrderPriorityChipProps {
  priority: WorkOrderPriority | string;
  size?: ChipProps['size'];
}

export function WorkOrderPriorityChip({ priority, size = 'small' }: WorkOrderPriorityChipProps) {
  const key = priority as WorkOrderPriority;
  return (
    <Chip
      label={WORK_ORDER_PRIORITY_LABELS[key] ?? priority}
      color={PRIORITY_COLOR[key] ?? 'default'}
      size={size}
    />
  );
}

export default WorkOrderPriorityChip;

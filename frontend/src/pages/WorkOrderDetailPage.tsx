/**
 * WorkOrderDetailPage
 *
 * Full detail view of a single work order.
 *   Left column  — description + comments / activity feed, with an inline
 *                  composer below it for adding a comment or taking an
 *                  action (Update Status, Change Priority, Assign To,
 *                  Request Input) — one shared textarea, no dialogs
 *   Right column — work order metadata sidebar
 *
 * Route: /work-orders/:id
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGoBack } from '@/hooks/useGoBack';
import { PageBackButton } from '@/components/layout/PageBackButton';
import {
  Alert,
  Avatar,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ChipProps } from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ReplayIcon from '@mui/icons-material/Replay';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useWorkOrder } from '@/hooks/queries/useWorkOrders';
import { useAuthStore } from '@/store/authStore';
import {
  useUpdateWorkOrderStatus,
  useUpdateWorkOrderPriority,
  useAssignWorkOrder,
  useAddWorkOrderComment,
  useUpdateWorkOrderComment,
  useDeleteWorkOrderComment,
  useUpdateStatusHistoryNotes,
  useUpdatePriorityHistoryNotes,
  useUpdateWorkOrderDescription,
  useDismissInputRequest,
  useRequestInput,
} from '@/hooks/mutations/useWorkOrderMutations';
import { WorkOrderStatusChip } from '@/components/work-orders/WorkOrderStatusChip';
import { WorkOrderPriorityChip, PRIORITY_COLOR } from '@/components/work-orders/WorkOrderPriorityChip';
import { UserSearchAutocomplete } from '@/components/UserSearchAutocomplete';
import type {
  WorkOrderDetail,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderComment,
  WorkOrderStatusHistoryEntry,
  WorkOrderPriorityHistoryEntry,
} from '@/types/work-order.types';
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_PRIORITY_LABELS } from '@/types/work-order.types';
import { queryKeys } from '@/lib/queryKeys';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const STATUSES: { value: WorkOrderStatus; label: string }[] = [
  { value: 'OPEN',        label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD',     label: 'On Hold' },
  { value: 'LONG_TERM',   label: 'Long Term' },
  { value: 'CLOSED',      label: 'Closed' },
];

const ALLOWED_NEXT_STATUSES: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS', 'ON_HOLD', 'LONG_TERM', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'LONG_TERM', 'CLOSED'],
  ON_HOLD:     ['IN_PROGRESS', 'LONG_TERM', 'CLOSED'],
  LONG_TERM:   ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED'],
  CLOSED:      ['OPEN', 'ON_HOLD', 'LONG_TERM'],
};

// Unselected-state color for the status composer's chip picker. Statuses not
// listed here fall back to 'default' (neutral gray outline). Selecting a
// chip always overrides this with 'primary' (blue), regardless of status —
// note LONG_TERM's unselected color is also 'primary', so it and the
// selected state share a hue; filled vs. outlined variant is what tells
// them apart.
const STATUS_CHIP_COLOR: Partial<Record<WorkOrderStatus, ChipProps['color']>> = {
  ON_HOLD:     'warning',
  CLOSED:      'error',
  IN_PROGRESS: 'success',
  LONG_TERM:   'primary',
};

const STATUS_KEY_LEGEND: { label: string; description: string }[] = [
  { label: 'In Progress', description: 'Actively Working On' },
  { label: 'On Hold',     description: 'Temporarily Paused' },
  { label: 'Long Term',   description: 'Long Term Project' },
];

const PRIORITIES: { value: WorkOrderPriority; label: string }[] = [
  { value: 'LOW',    label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH',   label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** "edited <date>" caption, rendered only once the item has actually been edited. */
function EditedMarker({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
      edited {formatDate(at)}
    </Typography>
  );
}

/**
 * Shared inline editor for a comment body, a history note, or the description.
 * Owns its own draft/saving/error state so each item can be edited independently
 * without threading state through the page. `onSave` rejecting keeps the editor
 * open and surfaces the API message; resolving leaves the parent to unmount it.
 */
function InlineEditForm({
  initialValue, label, minLength = 1, allowEmpty = false, onSave, onCancel,
}: {
  initialValue: string;
  label: string;
  minLength?: number;
  allowEmpty?: boolean;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft]   = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const trimmed  = draft.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < minLength;
  const isEmpty  = trimmed.length === 0;
  const invalid  = tooShort || (isEmpty && !allowEmpty);

  const handleSave = async () => {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(apiMessage ?? 'Unable to save your changes. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        label={label}
        multiline
        minRows={2}
        fullWidth
        size="small"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={saving || invalid}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}

function CommentCard({
  comment, workOrderId, currentUserId,
}: { comment: WorkOrderComment; workOrderId: string; currentUserId: string | undefined }) {
  const initials = (comment.author.displayName ?? comment.author.email)
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Own, non-system comments only. Re-checked server-side.
  const canManage = currentUserId === comment.author.id && !comment.isSystem;

  const [isEditing, setIsEditing]           = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const updateComment = useUpdateWorkOrderComment();
  const deleteComment = useDeleteWorkOrderComment();

  const handleDelete = async () => {
    await deleteComment.mutateAsync({ id: workOrderId, commentId: comment.id });
    setConfirmDeleteOpen(false);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        py: 1.5,
        borderLeft: comment.isInternal ? '3px solid' : 'none',
        borderColor: 'warning.main',
        pl: comment.isInternal ? 1.5 : 0,
        bgcolor: comment.isInternal ? 'warning.50' : 'transparent',
        borderRadius: 1,
      }}
    >
      <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {comment.author.displayName ?? comment.author.email}
          </Typography>
          {comment.isInternal && (
            <Chip label="Internal" size="small" color="warning" variant="outlined" />
          )}
          <Typography variant="caption" color="text.secondary">
            {formatDate(comment.createdAt)}
          </Typography>
          <EditedMarker at={comment.editedAt} />
          {canManage && !isEditing && (
            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
              <IconButton size="small" aria-label="Edit comment" onClick={() => setIsEditing(true)}>
                <EditIcon fontSize="inherit" />
              </IconButton>
              <IconButton size="small" aria-label="Delete comment" onClick={() => setConfirmDeleteOpen(true)}>
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            </Box>
          )}
        </Box>
        {isEditing ? (
          <InlineEditForm
            initialValue={comment.body}
            label="Comment"
            minLength={1}
            onSave={async (value) => {
              await updateComment.mutateAsync({ id: workOrderId, commentId: comment.id, body: value });
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {comment.body}
          </Typography>
        )}
      </Box>

      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete comment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This comment will be permanently removed from the work order. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteComment.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteComment.isPending}
            startIcon={deleteComment.isPending ? <CircularProgress size={14} /> : undefined}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function StatusHistoryCard({
  entry, workOrderId, currentUserId,
}: { entry: WorkOrderStatusHistoryEntry; workOrderId: string; currentUserId: string | undefined }) {
  const initials = (entry.changedBy.displayName ?? entry.changedBy.email)
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const fromLabel = entry.fromStatus ? WORK_ORDER_STATUS_LABELS[entry.fromStatus] : null;
  const toLabel   = WORK_ORDER_STATUS_LABELS[entry.toStatus];

  // The seed "Work order created" entry (fromStatus === null) is never editable.
  const canManage = currentUserId === entry.changedBy.id && entry.fromStatus !== null;

  const [isEditing, setIsEditing] = useState(false);
  const updateNotes = useUpdateStatusHistoryNotes();

  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1.5 }}>
      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'grey.400' }}>{initials}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={600}>
            {entry.changedBy.displayName ?? entry.changedBy.email}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {fromLabel ? `changed status from ${fromLabel} → ${toLabel}` : `set status to ${toLabel}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(entry.changedAt)}
          </Typography>
          <EditedMarker at={entry.notesEditedAt} />
          {canManage && !isEditing && (
            <IconButton size="small" aria-label="Edit note" sx={{ ml: 'auto' }} onClick={() => setIsEditing(true)}>
              <EditIcon fontSize="inherit" />
            </IconButton>
          )}
        </Box>
        {isEditing ? (
          <InlineEditForm
            initialValue={entry.notes ?? ''}
            label="Actions Taken"
            allowEmpty
            onSave={async (value) => {
              await updateNotes.mutateAsync({ id: workOrderId, entryId: entry.id, notes: value || null });
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          entry.notes && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.secondary', fontStyle: 'italic' }}>
              {entry.notes}
            </Typography>
          )
        )}
      </Box>
    </Box>
  );
}

function PriorityHistoryCard({
  entry, workOrderId, currentUserId,
}: { entry: WorkOrderPriorityHistoryEntry; workOrderId: string; currentUserId: string | undefined }) {
  const initials = (entry.changedBy.displayName ?? entry.changedBy.email)
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const fromLabel = entry.fromPriority ? WORK_ORDER_PRIORITY_LABELS[entry.fromPriority] : null;
  const toLabel   = WORK_ORDER_PRIORITY_LABELS[entry.toPriority];

  // Priority entries: authorship alone (no immutable seed row to exclude here).
  const canManage = currentUserId === entry.changedBy.id;

  const [isEditing, setIsEditing] = useState(false);
  const updateNotes = useUpdatePriorityHistoryNotes();

  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1.5 }}>
      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'info.main' }}>{initials}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={600}>
            {entry.changedBy.displayName ?? entry.changedBy.email}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {fromLabel ? `changed priority from ${fromLabel} → ${toLabel}` : `set priority to ${toLabel}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(entry.changedAt)}
          </Typography>
          <EditedMarker at={entry.notesEditedAt} />
          {canManage && !isEditing && (
            <IconButton size="small" aria-label="Edit note" sx={{ ml: 'auto' }} onClick={() => setIsEditing(true)}>
              <EditIcon fontSize="inherit" />
            </IconButton>
          )}
        </Box>
        {isEditing ? (
          <InlineEditForm
            initialValue={entry.notes ?? ''}
            label="Note"
            allowEmpty
            onSave={async (value) => {
              await updateNotes.mutateAsync({ id: workOrderId, entryId: entry.id, notes: value || null });
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          entry.notes && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.secondary', fontStyle: 'italic' }}>
              {entry.notes}
            </Typography>
          )
        )}
      </Box>
    </Box>
  );
}

/**
 * Details field list (Reported By, Assigned To, Location, Room, etc.) with no
 * wrapping card/heading — the caller supplies the surrounding chrome. Shared
 * between the desktop Details sidebar and the mobile combined Description +
 * Details card so the field markup exists in exactly one place.
 */
function WorkOrderDetailsFields({ workOrder }: { workOrder: WorkOrderDetail }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Reported By
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {workOrder.reportedBy.displayName ?? workOrder.reportedBy.email}
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Assigned To
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {workOrder.assignedTo?.displayName ?? workOrder.assignedTo?.email ?? '—'}
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Location
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {workOrder.officeLocation?.name ?? '—'}
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Room
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {workOrder.room?.name ?? '—'}
        </Typography>
      </Box>

      {workOrder.departmentLocation && (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Department/Program
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {workOrder.departmentLocation.name}
          </Typography>
        </Box>
      )}

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Category
        </Typography>
        <Typography variant="body2">
          {workOrder.workOrderCategory?.name ?? workOrder.category ?? '—'}
        </Typography>
      </Box>

      {workOrder.notInInventory && workOrder.notInInventoryTag && (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Reported Tag Number
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {workOrder.notInInventoryTag}
          </Typography>
        </Box>
      )}

      <Divider />

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Created
        </Typography>
        <Typography variant="body2">{formatDate(workOrder.createdAt)}</Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          Last Updated
        </Typography>
        <Typography variant="body2">{formatDate(workOrder.updatedAt)}</Typography>
      </Box>

      {workOrder.resolvedAt && (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Resolved
          </Typography>
          <Typography variant="body2">{formatDate(workOrder.resolvedAt)}</Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Description heading + edit affordance + body (or inline-edit form). Shared
 * between the desktop Description card and the mobile combined Description +
 * Details card so this markup and its editing behavior exist in exactly one
 * place, even though it's mounted at both breakpoints simultaneously (one
 * hidden via `display: none`, matching this codebase's existing responsive
 * show/hide pattern).
 */
function WorkOrderDescriptionSection({
  workOrder, canEdit, isEditing, onEditStart, onSave, onCancel,
}: {
  workOrder: WorkOrderDetail;
  canEdit: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          Description
        </Typography>
        <EditedMarker at={workOrder.descriptionEditedAt} />
        {canEdit && !isEditing && (
          <IconButton size="small" aria-label="Edit description" onClick={onEditStart}>
            <EditIcon fontSize="inherit" />
          </IconButton>
        )}
      </Box>
      {isEditing ? (
        <InlineEditForm
          initialValue={workOrder.description}
          label="Description"
          minLength={10}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {workOrder.description}
        </Typography>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ActiveAction = 'status' | 'priority' | 'assign' | 'requestInput' | null;

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const goBack = useGoBack();

  const { data: workOrder, isLoading, error } = useWorkOrder(id);
  const { user } = useAuthStore();
  const canAssign = (user?.permLevels?.WORK_ORDERS ?? 0) >= 4;
  const canChangePriority = user?.permLevels?.canChangeWorkOrderPriority ?? false;
  // Description edit — the reporter only. Re-checked server-side.
  const canEditDescription = !!user && workOrder?.reportedBy?.id === user.id;
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Opening the detail view clears the unread flag server-side (TicketView upsert
  // in getWorkOrderById) — invalidate the list cache so it doesn't linger stale
  // for the list's 30s staleTime after Back navigation.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (workOrder) {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.lists() });
    }
  }, [workOrder?.id, queryClient]);

  // Mutations
  const updateStatus   = useUpdateWorkOrderStatus();
  const updatePriority = useUpdateWorkOrderPriority();
  const assignWorkOrder  = useAssignWorkOrder();
  const addComment    = useAddWorkOrderComment();
  const requestInput  = useRequestInput();
  const dismissInputRequest = useDismissInputRequest();
  const updateDescription = useUpdateWorkOrderDescription();

  // Which action (if any) the inline composer below "Comments & Activity" is
  // currently set to. `null` = plain comment. Only one action is active at a
  // time — there's a single shared textarea, not one per action.
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  // Shared comment / notes / message textarea — reused by every action.
  const [commentBody, setCommentBody] = useState('');

  // Status action fields
  const [newStatus, setNewStatus]             = useState<WorkOrderStatus>('OPEN');
  const [statusError, setStatusError]         = useState<string | null>(null);
  const [notifySubmitter, setNotifySubmitter] = useState(true);

  // Priority action fields
  const [newPriority, setNewPriority]     = useState<WorkOrderPriority>('MEDIUM');
  const [priorityError, setPriorityError] = useState<string | null>(null);

  // Assign action fields
  const [assignTo, setAssignTo]       = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Request Input action fields
  const [requestInputTo, setRequestInputTo]       = useState<string | null>(null);
  const [requestInputError, setRequestInputError] = useState<string | null>(null);

  // Plain comment error
  const [commentError, setCommentError] = useState<string | null>(null);

  // ── Switch which action the composer is set to, pre-populating its fields ──
  const handleActionChange = (_: unknown, next: ActiveAction) => {
    setStatusError(null);
    setPriorityError(null);
    setAssignError(null);
    setRequestInputError(null);
    if (next === 'status' && workOrder) {
      const allowed = ALLOWED_NEXT_STATUSES[workOrder.status] ?? [];
      setNewStatus((allowed[0] as WorkOrderStatus) ?? workOrder.status);
      setNotifySubmitter(true);
    } else if (next === 'priority' && workOrder) {
      setNewPriority(workOrder.priority);
    } else if (next === 'assign') {
      setAssignTo(workOrder?.assignedTo?.id ?? null);
    } else if (next === 'requestInput') {
      setRequestInputTo(null);
    }
    setActiveAction(next);
  };

  // Clicking the already-active action button returns to plain-comment mode
  // (mirrors ToggleButtonGroup's exclusive-with-deselect behavior).
  const toggleAction = (value: ActiveAction) => handleActionChange(undefined, activeAction === value ? null : value);

  // On mobile the "New Status" dropdown renders below the fold when it
  // first appears — nudge it into view so the user doesn't have to
  // scroll manually before selecting the next status.
  const statusFieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeAction === 'status') {
      statusFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeAction]);

  const handleStatusSubmit = async () => {
    if (!id) return;
    setStatusError(null);
    if (!commentBody.trim()) {
      setStatusError('Actions Taken is required for every status change.');
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id,
        status: newStatus,
        notes: commentBody.trim(),
        ...(newStatus === 'LONG_TERM' && { notifySubmitter }),
      });
      if (newStatus === 'CLOSED') {
        // Closing returns the user to wherever they came from — the same
        // history-back behavior as the header Back button — rather than
        // leaving them on the now-closed ticket or a hardcoded list.
        goBack();
        return;
      }
      setCommentBody('');
      setActiveAction(null);
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setStatusError(apiMessage ?? 'Unable to update the work order status. Please try again or contact your supervisor.');
    }
  };

  // ── Reopen work order ──────────────────────────────────────────────────────
  const handleReopenClick = async () => {
    if (!id) return;
    setStatusError(null);
    try {
      await updateStatus.mutateAsync({ id, status: 'OPEN', notes: 'Work order reopened.' });
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setStatusError(apiMessage ?? 'Unable to reopen the work order. Please try again or contact your supervisor.');
    }
  };

  const handlePrioritySubmit = async () => {
    if (!id) return;
    setPriorityError(null);
    try {
      await updatePriority.mutateAsync({ id, priority: newPriority, notes: commentBody.trim() || undefined });
      setCommentBody('');
      setActiveAction(null);
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPriorityError(apiMessage ?? 'Unable to update the work order priority. Please try again or contact your supervisor.');
    }
  };

  const handleAssignSubmit = async () => {
    if (!id) return;
    setAssignError(null);
    try {
      await assignWorkOrder.mutateAsync({ id, assignedToId: assignTo });
      setActiveAction(null);
    } catch {
      setAssignError('Failed to assign work order.');
    }
  };

  const handleRequestInputSubmit = async () => {
    if (!id || !requestInputTo) return;
    setRequestInputError(null);
    try {
      await requestInput.mutateAsync({ workOrderId: id, requestedOfId: requestInputTo, message: commentBody.trim() || undefined });
      setCommentBody('');
      setRequestInputTo(null);
      setActiveAction(null);
    } catch (err: unknown) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setRequestInputError(apiMessage ?? 'Unable to request input. Please try again.');
    }
  };

  // ── Add comment ───────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!id || !commentBody.trim()) return;
    setCommentError(null);
    try {
      await addComment.mutateAsync({ id, body: commentBody.trim() });
      setCommentBody('');
    } catch {
      setCommentError('Failed to add comment.');
    }
  };

  // ── Composer submit dispatches to whichever action is active ──────────────
  const handleComposerSubmit = () => {
    if (activeAction === 'status') return handleStatusSubmit();
    if (activeAction === 'priority') return handlePrioritySubmit();
    if (activeAction === 'assign') return handleAssignSubmit();
    if (activeAction === 'requestInput') return handleRequestInputSubmit();
    return handleAddComment();
  };

  const composerPending =
    activeAction === 'status' ? updateStatus.isPending :
    activeAction === 'priority' ? updatePriority.isPending :
    activeAction === 'assign' ? assignWorkOrder.isPending :
    activeAction === 'requestInput' ? requestInput.isPending :
    addComment.isPending;

  const composerDisabled =
    composerPending ||
    (activeAction === 'status' && !commentBody.trim()) ||
    (activeAction === 'assign' && !assignTo) ||
    (activeAction === 'requestInput' && !requestInputTo) ||
    (activeAction === null && !commentBody.trim());

  const composerLabel =
    activeAction === 'status' ? (composerPending ? 'Saving…' : 'Update Status') :
    activeAction === 'priority' ? (composerPending ? 'Saving…' : 'Save Priority') :
    activeAction === 'assign' ? (composerPending ? 'Saving…' : 'Assign') :
    activeAction === 'requestInput' ? (composerPending ? 'Sending…' : 'Send Request') :
    (composerPending ? 'Adding…' : 'Add Comment');

  const composerError =
    activeAction === 'status' ? statusError :
    activeAction === 'priority' ? priorityError :
    activeAction === 'assign' ? assignError :
    activeAction === 'requestInput' ? requestInputError :
    commentError;

  const clearComposerError = () => {
    if (activeAction === 'status') setStatusError(null);
    else if (activeAction === 'priority') setPriorityError(null);
    else if (activeAction === 'assign') setAssignError(null);
    else if (activeAction === 'requestInput') setRequestInputError(null);
    else setCommentError(null);
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={300} />
      </Box>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !workOrder) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" onClick={goBack}>
            Back
          </Button>
        }>
          Work order not found or failed to load.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 3 } }}>
      <PageBackButton />

      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/work-orders" underline="hover" color="inherit">
          Work Orders
        </Link>
        <Typography color="text.primary">{workOrder.workOrderNumber}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="h5" fontWeight={600}>
              {workOrder.workOrderNumber}
            </Typography>
            <WorkOrderStatusChip status={workOrder.status} size="medium" />
            <WorkOrderPriorityChip priority={workOrder.priority} size="medium" />
            <Chip
              label={workOrder.department === 'TECHNOLOGY' ? 'Technology' : 'Maintenance'}
              size="medium"
              color={workOrder.department === 'TECHNOLOGY' ? 'primary' : 'secondary'}
              variant="outlined"
            />
            {workOrder.notInInventory && (
              <Chip label="Not in Inventory" size="medium" color="warning" />
            )}
          </Box>
        </Box>

        {/* Reopen — the only remaining header action; the rest live in the
            Comments & Activity composer below. */}
        {workOrder.status === 'CLOSED' && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<ReplayIcon />}
              onClick={handleReopenClick}
              size="small"
              disabled={updateStatus.isPending}
            >
              Reopen
            </Button>
          </Box>
        )}
      </Box>

      {workOrder.inputRequests.some((r) => r.requestedBy.id === user?.id || r.requestedOf.id === user?.id) && (
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {workOrder.inputRequests
            .filter((r) => r.requestedBy.id === user?.id || r.requestedOf.id === user?.id)
            .map((r) => (
              <Alert
                key={r.id}
                severity="info"
                action={
                  <Button
                    size="small"
                    color="inherit"
                    disabled={dismissInputRequest.isPending}
                    onClick={() => id && dismissInputRequest.mutate({ workOrderId: id, requestId: r.id })}
                  >
                    Dismiss
                  </Button>
                }
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <span>
                    Input requested from <strong>{r.requestedOf.displayName ?? r.requestedOf.email}</strong> by{' '}
                    <strong>{r.requestedBy.displayName ?? r.requestedBy.email}</strong>
                  </span>
                  <Chip label={r.respondedAt ? 'Responded' : 'Awaiting response'} size="small" color={r.respondedAt ? 'success' : 'warning'} variant="outlined" />
                </Box>
              </Alert>
            ))}
        </Box>
      )}

      {/* Reopen errors surface here — Update Status errors surface inline in
          the composer below instead, via composerError. */}
      {statusError && activeAction !== 'status' && (
        <Alert severity="error" onClose={() => setStatusError(null)} sx={{ mb: 2 }}>
          {statusError}
        </Alert>
      )}

      {/* Two-column layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
        {/* ── Left: description + comments ─────────────────────────────── */}
        <Box sx={{ minWidth: 0 }}>
          {/* Mobile-only: Description + Details combined into one card above
              Comments & Activity. Desktop keeps the separate Description
              card (below) plus the sidebar Details card in the right column. */}
          <Paper variant="outlined" sx={{ p: 2.5, mb: 3, display: { xs: 'block', md: 'none' } }}>
            <WorkOrderDescriptionSection
              workOrder={workOrder}
              canEdit={canEditDescription}
              isEditing={isEditingDescription}
              onEditStart={() => setIsEditingDescription(true)}
              onSave={async (value) => {
                if (!id) return;
                await updateDescription.mutateAsync({ id, description: value });
                setIsEditingDescription(false);
              }}
              onCancel={() => setIsEditingDescription(false)}
            />

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Details
            </Typography>
            <WorkOrderDetailsFields workOrder={workOrder} />
          </Paper>

          {/* Description (desktop only) */}
          <Paper variant="outlined" sx={{ p: 2.5, mb: 3, display: { xs: 'none', md: 'block' } }}>
            <WorkOrderDescriptionSection
              workOrder={workOrder}
              canEdit={canEditDescription}
              isEditing={isEditingDescription}
              onEditStart={() => setIsEditingDescription(true)}
              onSave={async (value) => {
                if (!id) return;
                await updateDescription.mutateAsync({ id, description: value });
                setIsEditingDescription(false);
              }}
              onCancel={() => setIsEditingDescription(false)}
            />
          </Paper>

          {/* Comments */}
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ChatBubbleOutlineIcon fontSize="small" color="action" />
              <Typography variant="subtitle1" fontWeight={600}>
                Comments & Activity
              </Typography>
              <Chip label={workOrder.comments.length + (workOrder.statusHistory?.length ?? 0) + (workOrder.priorityHistory?.length ?? 0)} size="small" />
            </Box>

            {(() => {
              type ActivityItem =
                | { kind: 'comment';  ts: string; item: WorkOrderComment }
                | { kind: 'status';   ts: string; item: WorkOrderStatusHistoryEntry }
                | { kind: 'priority'; ts: string; item: WorkOrderPriorityHistoryEntry };

              const items: ActivityItem[] = [
                ...workOrder.comments.map((c) => ({ kind: 'comment' as const, ts: c.createdAt, item: c })),
                ...(workOrder.statusHistory ?? []).map((s) => ({ kind: 'status' as const, ts: s.changedAt, item: s })),
                ...(workOrder.priorityHistory ?? []).map((p) => ({ kind: 'priority' as const, ts: p.changedAt, item: p })),
              ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

              if (items.length === 0) {
                return (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    No comments yet.
                  </Typography>
                );
              }

              return items.map((entry, idx) => (
                <Box key={entry.kind === 'comment' ? entry.item.id : `${entry.kind}-${entry.item.id}`}>
                  {entry.kind === 'comment' && id
                    ? <CommentCard comment={entry.item} workOrderId={id} currentUserId={user?.id} />
                    : entry.kind === 'status' && id
                      ? <StatusHistoryCard entry={entry.item} workOrderId={id} currentUserId={user?.id} />
                      : entry.kind === 'priority' && id
                        ? <PriorityHistoryCard entry={entry.item} workOrderId={id} currentUserId={user?.id} />
                        : null}
                  {idx < items.length - 1 && <Divider sx={{ my: 1 }} />}
                </Box>
              ));
            })()}

            <Divider sx={{ my: 2 }} />

            {/* Add comment / take action — one shared textarea for everything.
                Selecting an action below swaps the textarea's purpose (notes,
                a message, or nothing at all for Assign) and reveals whatever
                extra field that action needs. */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {activeAction !== 'assign' && (
                <TextField
                  label={
                    activeAction === 'status'      ? 'Actions Taken' :
                    activeAction === 'priority'    ? 'Note (optional)' :
                    activeAction === 'requestInput' ? 'Message (optional)' :
                    'Add a comment…'
                  }
                  required={activeAction === 'status'}
                  multiline
                  minRows={3}
                  fullWidth
                  size="small"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  disabled={composerPending}
                  error={activeAction === 'status' && !commentBody.trim()}
                  helperText={
                    activeAction === 'status' && !commentBody.trim()
                      ? 'Actions Taken is required for every status change'
                      : undefined
                  }
                />
              )}

              {/* Action button row — clicking the active one again returns to
                  plain-comment mode. Same clickable-chip style as the status
                  picker below: active = solid blue, inactive = outlined. */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  icon={<SwapHorizIcon fontSize="small" />}
                  label="Update Status"
                  size="small"
                  clickable
                  disabled={composerPending}
                  variant={activeAction === 'status' ? 'filled' : 'outlined'}
                  color="primary"
                  aria-pressed={activeAction === 'status'}
                  onClick={() => toggleAction('status')}
                />
                {canChangePriority && (
                  <Chip
                    icon={<PriorityHighIcon fontSize="small" />}
                    label="Change Priority"
                    size="small"
                    clickable
                    disabled={composerPending}
                    variant={activeAction === 'priority' ? 'filled' : 'outlined'}
                    color="primary"
                    aria-pressed={activeAction === 'priority'}
                    onClick={() => toggleAction('priority')}
                  />
                )}
                {canAssign && (
                  <Chip
                    icon={<AssignmentIndIcon fontSize="small" />}
                    label="Assign To"
                    size="small"
                    clickable
                    disabled={composerPending}
                    variant={activeAction === 'assign' ? 'filled' : 'outlined'}
                    color="primary"
                    aria-pressed={activeAction === 'assign'}
                    onClick={() => toggleAction('assign')}
                  />
                )}
                <Chip
                  icon={<HelpOutlineIcon fontSize="small" />}
                  label="Request Input"
                  size="small"
                  clickable
                  disabled={composerPending}
                  variant={activeAction === 'requestInput' ? 'filled' : 'outlined'}
                  color="primary"
                  aria-pressed={activeAction === 'requestInput'}
                  onClick={() => toggleAction('requestInput')}
                />
              </Box>

              {/* Fields specific to the active action */}
              {activeAction === 'status' && (
                <Box ref={statusFieldRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                      New Status
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {STATUSES.filter((s) =>
                        (ALLOWED_NEXT_STATUSES[workOrder.status] ?? []).includes(s.value)
                      ).map((s) => (
                        <Chip
                          key={s.value}
                          label={s.label}
                          color={newStatus === s.value ? 'primary' : (STATUS_CHIP_COLOR[s.value] ?? 'default')}
                          size="small"
                          clickable
                          variant={newStatus === s.value ? 'filled' : 'outlined'}
                          aria-pressed={newStatus === s.value}
                          onClick={() => setNewStatus(s.value)}
                        />
                      ))}
                    </Box>
                  </Box>
                  {newStatus === 'LONG_TERM' && (
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={notifySubmitter}
                          onChange={(e) => setNotifySubmitter(e.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Notify the submitter of this status change</Typography>}
                    />
                  )}
                  <Box>
                    {STATUS_KEY_LEGEND.map((entry) => (
                      <Typography key={entry.label} variant="caption" color="text.secondary" display="block">
                        <strong>{entry.label}</strong> — {entry.description}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              {activeAction === 'priority' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    New Priority
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {PRIORITIES.map((p) => (
                      <Chip
                        key={p.value}
                        label={p.label}
                        color={newPriority === p.value ? 'primary' : PRIORITY_COLOR[p.value]}
                        size="small"
                        clickable
                        variant={newPriority === p.value ? 'filled' : 'outlined'}
                        aria-pressed={newPriority === p.value}
                        onClick={() => setNewPriority(p.value)}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {activeAction === 'assign' && (
                <UserSearchAutocomplete
                  value={assignTo}
                  onChange={setAssignTo}
                  label="Assign to staff member"
                  workOrderDepartment={workOrder.department}
                />
              )}

              {activeAction === 'requestInput' && (
                <UserSearchAutocomplete
                  value={requestInputTo}
                  onChange={setRequestInputTo}
                  label="Request input from"
                  staffOnly
                  workOrderDepartment={workOrder.department}
                />
              )}

              {composerError && (
                <Alert severity="error" onClose={clearComposerError}>
                  {composerError}
                </Alert>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                {activeAction !== null && (
                  <Button size="small" onClick={() => handleActionChange(undefined, null)} disabled={composerPending}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleComposerSubmit}
                  disabled={composerDisabled}
                  startIcon={composerPending ? <CircularProgress size={14} /> : undefined}
                >
                  {composerLabel}
                </Button>
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* ── Right: work order details sidebar (desktop only — merged into
            the mobile combined card above Comments & Activity instead) ──── */}
        <Box sx={{ minWidth: 0, display: { xs: 'none', md: 'block' } }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Details
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <WorkOrderDetailsFields workOrder={workOrder} />
            </CardContent>
          </Card>
        </Box>
      </Box>

    </Box>
  );
}

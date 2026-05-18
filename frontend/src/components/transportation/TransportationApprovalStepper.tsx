/**
 * TransportationApprovalStepper
 *
 * Vertical MUI Stepper showing the transportation request approval progress.
 * 3-step workflow: Supervisor Approval → Secretary Review → Approved.
 *
 * For DENIED status: renders a red Alert indicating which stage denied and the reason.
 */

import {
  Alert,
  Box,
  Chip,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import type { TransportationRequest, TransportationRequestStatus } from '../../types/transportationRequest.types';

// ---------------------------------------------------------------------------
// Workflow stage definitions (ordered)
// ---------------------------------------------------------------------------

interface WorkflowStage {
  status: TransportationRequestStatus;
  label:  string;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  { status: 'PENDING_SUPERVISOR_APPROVAL', label: 'Supervisor Approval' },
  { status: 'PENDING_SECRETARY_REVIEW',    label: 'Secretary Review' },
  { status: 'APPROVED',                    label: 'Approved' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TransportationApprovalStepperProps {
  request: TransportationRequest;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPersonName(person: { displayName: string | null; firstName: string; lastName: string } | null | undefined): string {
  if (!person) return '—';
  return person.displayName ?? `${person.firstName} ${person.lastName}`;
}

function formatDateTime(dt: string | null | undefined): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransportationApprovalStepper({ request }: TransportationApprovalStepperProps) {
  const status = request.status as TransportationRequestStatus;
  const isDenied = status === 'DENIED';

  // Determine which stage denied
  const deniedBySupervisor = !!request.supervisorDeniedBy;
  const deniedBySecretary  = !!request.deniedBy;

  // Determine active step index for the stepper
  const activeStepIndex = isDenied
    ? -1
    : WORKFLOW_STAGES.findIndex((s) => s.status === status);

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>Approval Progress</Typography>

      {isDenied && (
        <Alert severity="error" sx={{ mt: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Denied by {deniedBySupervisor ? 'Supervisor' : 'Secretary'}
          </Typography>
          {deniedBySupervisor && (
            <Box>
              <Typography variant="body2">
                {formatPersonName(request.supervisorDeniedBy)} — {formatDateTime(request.supervisorDeniedAt)}
              </Typography>
              {request.supervisorDenialReason && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>Reason:</strong> {request.supervisorDenialReason}
                </Typography>
              )}
            </Box>
          )}
          {deniedBySecretary && (
            <Box>
              <Typography variant="body2">
                {formatPersonName(request.deniedBy)} — {formatDateTime(request.deniedAt)}
              </Typography>
              {request.denialReason && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>Reason:</strong> {request.denialReason}
                </Typography>
              )}
            </Box>
          )}
        </Alert>
      )}

      {!isDenied && (
        <Stepper activeStep={activeStepIndex} orientation="vertical">
          {WORKFLOW_STAGES.map((stage, idx) => {
            const completed = idx < activeStepIndex || (idx === activeStepIndex && status === 'APPROVED');

            // Determine who acted and when for this step
            let actorName: string | null = null;
            let actedAt: string | null = null;

            if (idx === 0 && request.supervisorApprovedBy) {
              actorName = formatPersonName(request.supervisorApprovedBy);
              actedAt = request.supervisorApprovedAt ?? null;
            } else if (idx === 1 && status === 'APPROVED' && request.approvedBy) {
              // Secretary approved (final approval moves status to APPROVED)
              actorName = formatPersonName(request.approvedBy);
              actedAt = request.approvedAt ?? null;
            } else if (idx === 2 && status === 'APPROVED' && request.approvedBy) {
              actorName = formatPersonName(request.approvedBy);
              actedAt = request.approvedAt ?? null;
            }

            return (
              <Step key={stage.status} completed={completed}>
                <StepLabel>
                  <Typography variant="body2" fontWeight={completed ? 600 : 400}>
                    {stage.label}
                  </Typography>
                </StepLabel>
                <StepContent>
                  {completed && actorName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="APPROVED" color="success" size="small" />
                      <Typography variant="caption" color="text.secondary">
                        {actorName} — {formatDateTime(actedAt)}
                      </Typography>
                    </Box>
                  )}
                  {request.approvalComments && idx === 2 && status === 'APPROVED' && (
                    <Typography variant="body2" sx={{ mt: 0.5 }} fontStyle="italic">
                      &ldquo;{request.approvalComments}&rdquo;
                    </Typography>
                  )}
                </StepContent>
              </Step>
            );
          })}
        </Stepper>
      )}
    </Paper>
  );
}

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery } from '@tanstack/react-query';
import { incidentService } from '../../services/incident.service';
import { InvoiceStatusChip } from '../../components/DeviceManagement/InvoiceStatusChip';
import IncidentWizard from '../../components/incidents/IncidentWizard';
import type { DamageIncident } from '../../types/damageIncident.types';
import type { IncidentWorkflowStep, IncidentIntent, InvoiceStatus } from '@mgspe/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKFLOW_STEPS: IncidentWorkflowStep[] = [
  'DAMAGE_REPORTED',
  'PENDING_REPAIR',
  'IN_REPAIR',
  'REPAIR_COMPLETE',
  'INVOICED',
  'CLOSED',
];

const INTENTIONAL_STEPS: IncidentWorkflowStep[] = [
  'DAMAGE_REPORTED',
  'INVOICED',
  'CLOSED',
];

function getActiveStepIndex(
  workflowStep: IncidentWorkflowStep | null | undefined,
  intent: IncidentIntent | null | undefined,
): number {
  const steps = intent === 'intentional' ? INTENTIONAL_STEPS : WORKFLOW_STEPS;
  if (!workflowStep) return 0;
  const idx = steps.indexOf(workflowStep);
  return idx >= 0 ? idx : 0;
}

function stepLabel(step: IncidentWorkflowStep): string {
  const MAP: Record<IncidentWorkflowStep, string> = {
    DAMAGE_REPORTED: 'Damage Reported',
    PENDING_REPAIR:  'Pending Repair',
    IN_REPAIR:       'In Repair',
    REPAIR_COMPLETE: 'Repair Complete',
    INVOICED:        'Invoiced',
    DEVICE_EXCHANGE: 'Device Exchange',
    CLOSED:          'Closed',
  };
  return MAP[step] ?? step;
}

const INTENT_COLORS: Record<IncidentIntent, 'info' | 'error'> = {
  accidental:  'info',
  intentional: 'error',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncidentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: incident, isLoading, isError } = useQuery<DamageIncident>({
    queryKey: ['damage-incidents', id],
    queryFn:  () => incidentService.getIncident(id!),
    enabled:  !!id,
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !incident) {
    return (
      <Box p={3}>
        <Alert severity="error">Incident not found.</Alert>
      </Box>
    );
  }

  const isIntentional = incident.intent === 'intentional';
  const displaySteps  = isIntentional ? INTENTIONAL_STEPS : WORKFLOW_STEPS;
  const activeStep    = getActiveStepIndex(incident.workflowStep, incident.intent);
  const isClosed      = incident.workflowStep === 'CLOSED';

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      {/* Back */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/incidents')} sx={{ mb: 2 }}>
        Back to Incidents
      </Button>

      {/* Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {incident.incidentNumber ?? `Incident ${incident.id.slice(0, 8)}`}
        </Typography>
        {!isClosed && (
          <Button variant="contained" onClick={() => setWizardOpen(true)}>
            Continue Workflow
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* ── Left column: info card ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardHeader title="Incident Details" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

              <Box>
                <Typography variant="caption" color="text.secondary">Incident Number</Typography>
                <Typography variant="body2" fontWeight={600}>{incident.incidentNumber ?? '—'}</Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Damage Date</Typography>
                <Typography variant="body2">
                  {incident.damageDate ? new Date(incident.damageDate).toLocaleDateString() : '—'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Intent</Typography>
                <Box>
                  {incident.intent
                    ? <Chip size="small" label={incident.intent.charAt(0).toUpperCase() + incident.intent.slice(1)} color={INTENT_COLORS[incident.intent]} />
                    : <Typography variant="body2">—</Typography>}
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Damage Type</Typography>
                <Typography variant="body2">
                  {incident.damageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Severity</Typography>
                <Typography variant="body2">
                  {incident.severity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Linked Device</Typography>
                <Typography variant="body2">
                  {incident.equipment
                    ? `${incident.equipment.assetTag} — ${incident.equipment.name}`
                    : '—'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Linked User</Typography>
                <Typography variant="body2">
                  {incident.user ? `${incident.user.firstName} ${incident.user.lastName}` : '—'}
                </Typography>
              </Box>

              {incident.description && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  <Typography variant="body2">{incident.description}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">Reported At</Typography>
                <Typography variant="body2">{new Date(incident.reportedAt).toLocaleString()}</Typography>
              </Box>

            </CardContent>
          </Card>
        </Grid>

        {/* ── Right column: workflow stepper ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardHeader title="Workflow Progress" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent>
              <Stepper activeStep={activeStep} orientation="vertical">
                {displaySteps.map((step) => (
                  <Step key={step} completed={displaySteps.indexOf(step) < activeStep}>
                    <StepLabel>{stepLabel(step)}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Repair Tickets section ── */}
        {incident.repairTickets && incident.repairTickets.length > 0 && (
          <Grid size={12}>
            <Card variant="outlined">
              <CardHeader title="Repair Tickets" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {incident.repairTickets.map((rt) => (
                  <Box
                    key={rt.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>{rt.ticketNumber}</Typography>
                    <Chip size="small" label={rt.status.replace(/_/g, ' ')} />
                    <Button
                      size="small"
                      onClick={() => navigate(`/device-management/repair-tickets/${rt.id}`)}
                    >
                      View
                    </Button>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* ── Invoices section ── */}
        {incident.invoices && incident.invoices.length > 0 && (
          <Grid size={12}>
            <Card variant="outlined">
              <CardHeader title="Invoices" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
              <Divider />
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {incident.invoices.map((inv) => (
                  <Box
                    key={inv.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>{inv.invoiceNumber}</Typography>
                    <InvoiceStatusChip status={inv.status as InvoiceStatus} />
                    <Typography variant="body2">
                      ${parseFloat(inv.amount).toFixed(2)}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => navigate(`/device-management/invoices/${inv.id}`)}
                    >
                      View
                    </Button>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Continue Workflow wizard */}
      <IncidentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialIncident={incident}
      />
    </Box>
  );
}

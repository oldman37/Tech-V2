import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { UserIncidentSummary } from '../../../services/userService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  minor:      'success',
  moderate:   'warning',
  severe:     'error',
  total_loss: 'error',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WizardStep3IncidentBlockProps {
  userId:         string;
  userName:       string;
  summary:        UserIncidentSummary;
  adminEmailSent: boolean;
  onSendEmail:    () => void;
  isSendingEmail: boolean;
  onBack:         () => void;
  onProceed:      () => void;
  isProceedBusy:  boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WizardStep3IncidentBlock({
  userName,
  summary,
  adminEmailSent,
  onSendEmail,
  isSendingEmail,
  onBack,
  onProceed,
  isProceedBusy,
}: WizardStep3IncidentBlockProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity="error" icon={false}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          ⛔ This user has {summary.totalCount} or more existing incidents
        </Typography>
        <Typography variant="body2">
          <strong>{userName}</strong> currently has{' '}
          <strong>{summary.totalCount} damage incident(s)</strong> on record. Creating another
          incident requires notifying the building administrator.
        </Typography>
      </Alert>

      {/* Recent incidents list */}
      {summary.recentIncidents.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Recent Incidents
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {summary.recentIncidents.slice(0, 5).map((inc) => (
              <Box component="li" key={inc.id} sx={{ mb: 0.5 }}>
                <Typography variant="body2" component="span">
                  {inc.incidentNumber ?? 'N/A'} —{' '}
                  {String(inc.damageType).replace(/_/g, ' ')} —{' '}
                </Typography>
                <Chip
                  label={String(inc.severity).replace(/_/g, ' ')}
                  color={SEVERITY_COLORS[inc.severity] ?? 'default'}
                  size="small"
                  sx={{ textTransform: 'capitalize', mx: 0.5, verticalAlign: 'middle' }}
                />
                <Typography variant="body2" component="span">
                  {' '}— {fmtDate(inc.reportedAt)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Divider />

      {/* Email action */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {adminEmailSent ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography variant="body2" color="success.main">
              Building admin has been notified.
            </Typography>
          </Box>
        ) : (
          <Button
            variant="contained"
            color="warning"
            startIcon={isSendingEmail ? <CircularProgress size={16} /> : <EmailIcon />}
            onClick={onSendEmail}
            disabled={isSendingEmail || adminEmailSent}
          >
            {isSendingEmail ? 'Sending...' : 'Send Email to Building Admin'}
          </Button>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary">
        You may proceed only after notifying the building administrator.
      </Typography>

      {/* Navigation buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1 }}>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onProceed}
          disabled={!adminEmailSent || isProceedBusy}
          startIcon={isProceedBusy ? <CircularProgress size={16} /> : undefined}
        >
          {isProceedBusy ? 'Submitting...' : 'Proceed Anyway'}
        </Button>
      </Box>
    </Box>
  );
}

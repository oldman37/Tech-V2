import { useNavigate, useSearchParams } from 'react-router-dom';
import IncidentWizard from '../../components/incidents/IncidentWizard';
import type { DamageIncident } from '../../types/damageIncident.types';

export default function IncidentWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillEquipmentId  = searchParams.get('equipmentId')  || undefined;
  const prefillUserId       = searchParams.get('userId')       || undefined;
  const prefillAssignmentId = searchParams.get('assignmentId') || undefined;
  const prefillDamageDate = searchParams.get('damageDate') || undefined;
  const prefill = (prefillEquipmentId || prefillUserId)
    ? { equipmentId: prefillEquipmentId, userId: prefillUserId, assignmentId: prefillAssignmentId, damageDate: prefillDamageDate }
    : undefined;

  return (
    <IncidentWizard
      fullPage
      open={true}
      prefill={prefill}
      onClose={() => navigate('/incidents')}
      onCreated={(incident: DamageIncident) => navigate(`/incidents/${incident.id}`)}
    />
  );
}

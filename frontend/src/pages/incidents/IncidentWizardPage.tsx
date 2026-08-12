import { useSearchParams } from 'react-router-dom';
import { useGoBack } from '../../hooks/useGoBack';
import IncidentWizard from '../../components/incidents/IncidentWizard';

export default function IncidentWizardPage() {
  const goBack = useGoBack();
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
      onClose={goBack}
    />
  );
}

/**
 * FieldTripRequestPage
 *
 * Multi-step form to create or edit a field trip request.
 * Step 1: Trip Info — teacher, school (dropdown), grade (dropdown), subject (conditional),
 *                     students, date (calendar), destination, transportation (radio),
 *                     purpose, preliminary activities, follow-up activities
 * Step 2: Logistics — times, transportation details (if needed), costs
 * Step 3: Additional Info — chaperones, emergency contact, notes
 *
 * Supports "Save as Draft" (any step) and "Submit for Approval" (final step).
 * Pre-populates if an existing DRAFT id is provided in the URL.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Select,
  InputLabel,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon      from '@mui/icons-material/Save';
import SendIcon      from '@mui/icons-material/Send';
import { fieldTripService }                          from '../../services/fieldTrip.service';
import { locationService }                           from '../../services/location.service';
import type { CreateFieldTripDto, FieldTripRequest } from '../../types/fieldTrip.types';
import type { OfficeLocation }                       from '../../types/location.types';
import { useAuthStore }                              from '../../store/authStore';
import { FieldTripDatePicker }                       from '../../components/FieldTripDatePicker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Trip Information', 'Transportation', 'Costs & Additional Details'];

const GRADE_OPTIONS = [
  'Pre-K',
  'Kindergarten',
  '1st Grade',
  '2nd Grade',
  '3rd Grade',
  '4th Grade',
  '5th Grade',
  '6th Grade',
  '7th Grade',
  '8th Grade',
  'High School',
];

const SUBJECT_OPTIONS = [
  'English',
  'Math',
  'History',
  'Science',
  'Fine Art / Music / Band',
  'CTE',
];

// Times in 15-minute increments, 5:00 AM – 11:45 PM
const TIME_OPTIONS: string[] = (() => {
  const times: string[] = [];
  for (let h = 5; h <= 23; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm   = h < 12 ? 'AM' : 'PM';
      const min    = m === 0 ? '00' : String(m);
      times.push(`${hour12}:${min} ${ampm}`);
    }
  }
  return times;
})();

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  teacherName:           string;
  schoolBuilding:        string;
  gradeClass:            string;
  subjectArea:           string;
  studentCount:          string;
  tripDate:              string;
  destination:           string;
  destinationAddress:    string;
  purpose:               string;
  preliminaryActivities: string;
  followUpActivities:    string;
  transportationNeeded:  boolean;
  isOvernightTrip:       boolean;
  returnDate:            string;
  alternateTransportation: string;
  departureTime:         string;
  returnTime:            string;
  transportationDetails: string;
  costPerStudent:        string;
  totalCost:             string;
  fundingSource:         string;
  chaperoneInfo:         string;
  emergencyContact:      string;
  additionalNotes:       string;
}

const EMPTY_FORM: FormState = {
  teacherName:           '',
  schoolBuilding:        '',
  gradeClass:            '',
  subjectArea:           '',
  studentCount:          '',
  tripDate:              '',
  destination:           '',
  destinationAddress:    '',
  purpose:               '',
  preliminaryActivities: '',
  followUpActivities:    '',
  transportationNeeded:  false,
  isOvernightTrip:       false,
  returnDate:            '',
  alternateTransportation: '',
  departureTime:         '',
  returnTime:            '',
  transportationDetails: '',
  costPerStudent:        '',
  totalCost:             '',
  fundingSource:         '',
  chaperoneInfo:         '',
  emergencyContact:      '',
  additionalNotes:       '',
};

function tripToFormState(trip: FieldTripRequest): FormState {
  return {
    teacherName:           trip.teacherName,
    schoolBuilding:        trip.schoolBuilding,
    gradeClass:            trip.gradeClass,
    subjectArea:           trip.subjectArea           ?? '',
    studentCount:          String(trip.studentCount),
    tripDate:              trip.tripDate.slice(0, 10),
    destination:           trip.destination,
    destinationAddress:    trip.destinationAddress   ?? '',
    purpose:               trip.purpose,
    preliminaryActivities: trip.preliminaryActivities ?? '',
    followUpActivities:    trip.followUpActivities    ?? '',
    transportationNeeded:  trip.transportationNeeded,
    isOvernightTrip:       trip.isOvernightTrip ?? false,
    returnDate:            trip.returnDate ? trip.returnDate.slice(0, 10) : '',
    alternateTransportation: trip.alternateTransportation ?? '',
    departureTime:         trip.departureTime,
    returnTime:            trip.returnTime,
    transportationDetails: trip.transportationDetails ?? '',
    costPerStudent:        trip.costPerStudent != null ? String(trip.costPerStudent) : '',
    totalCost:             trip.totalCost      != null ? String(trip.totalCost)      : '',
    fundingSource:         trip.fundingSource  ?? '',
    chaperoneInfo:         trip.chaperoneInfo  ?? '',
    emergencyContact:      trip.emergencyContact ?? '',
    additionalNotes:       trip.additionalNotes  ?? '',
  };
}

function formToDto(form: FormState): CreateFieldTripDto {
  return {
    teacherName:           form.teacherName.trim(),
    schoolBuilding:        form.schoolBuilding.trim(),
    gradeClass:            form.gradeClass.trim(),
    subjectArea:           form.gradeClass === 'High School' ? (form.subjectArea.trim() || null) : null,
    studentCount:          parseInt(form.studentCount, 10),
    tripDate:              new Date(form.tripDate + 'T12:00:00').toISOString(),
    destination:           form.destination.trim(),
    destinationAddress:    form.destinationAddress.trim(),
    purpose:               form.purpose.trim(),
    preliminaryActivities: form.preliminaryActivities.trim(),
    followUpActivities:    form.followUpActivities.trim(),
    transportationNeeded:  form.transportationNeeded,
    isOvernightTrip:       form.isOvernightTrip,
    returnDate:            form.isOvernightTrip ? new Date(form.returnDate + 'T12:00:00').toISOString() : null,
    alternateTransportation: form.transportationNeeded ? null : (form.alternateTransportation.trim() || null),
    departureTime:         form.departureTime.trim(),
    returnTime:            form.returnTime.trim(),
    transportationDetails: form.transportationNeeded ? (form.transportationDetails.trim() || null) : null,
    costPerStudent:        parseFloat(form.costPerStudent),
    totalCost:             parseFloat(form.totalCost),
    fundingSource:         form.fundingSource.trim(),
    chaperoneInfo:         form.chaperoneInfo.trim(),
    emergencyContact:      form.emergencyContact.trim(),
    additionalNotes:       form.additionalNotes.trim(),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validateStep(step: number, form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (step === 0) {
    if (!form.teacherName.trim())    errors.teacherName    = 'Teacher/Sponsor name is required';
    if (!form.schoolBuilding.trim()) errors.schoolBuilding = 'School/Building is required';
    if (!form.gradeClass.trim())     errors.gradeClass     = 'Grade is required';
    if (form.gradeClass === 'High School' && !form.subjectArea.trim())
      errors.subjectArea = 'Subject area is required for High School';
    const count = parseInt(form.studentCount, 10);
    if (!form.studentCount || isNaN(count) || count < 1 || count > 500)
      errors.studentCount = 'Enter a number between 1 and 500';
    if (!form.tripDate) {
      errors.tripDate = 'Trip date is required';
    } else {
      const d        = new Date(form.tripDate + 'T00:00:00');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      if (d < tomorrow) errors.tripDate = 'Trip date must be in the future';
    }
    if (!form.destination.trim()) errors.destination = 'Destination is required';
    if (!form.destinationAddress.trim()) errors.destinationAddress = 'Destination address is required';
    if (form.purpose.trim().length < 10) errors.purpose = 'Please provide at least 10 characters';
    if (!form.preliminaryActivities.trim()) errors.preliminaryActivities = 'Preliminary activities are required';
    if (!form.followUpActivities.trim()) errors.followUpActivities = 'Follow-up activities are required';
    if (form.isOvernightTrip && !form.returnDate) errors.returnDate = 'Return date is required for overnight trips';
    if (form.isOvernightTrip && form.returnDate && form.tripDate && form.returnDate <= form.tripDate)
      errors.returnDate = 'Return date must be after the trip date';
    if (!form.departureTime.trim()) errors.departureTime = 'Departure time is required';
    if (!form.returnTime.trim())    errors.returnTime    = 'Return time is required';
    if (!form.transportationNeeded && !form.alternateTransportation.trim())
      errors.alternateTransportation = 'Please describe how students will be transported';
  }

  if (step === 1) {
    if (form.transportationNeeded && !form.transportationDetails.trim())
      errors.transportationDetails = 'Transportation details are required';
  }

  if (step === 2) {
    const costPS = parseFloat(form.costPerStudent);
    if (form.costPerStudent === '' || isNaN(costPS) || costPS < 0)
      errors.costPerStudent = 'Enter a valid cost (0 or greater)';
    const totalC = parseFloat(form.totalCost);
    if (form.totalCost === '' || isNaN(totalC) || totalC < 0)
      errors.totalCost = 'Enter a valid total cost (0 or greater)';
    if (!form.fundingSource.trim()) errors.fundingSource = 'Funding source / account number is required';
    if (!form.chaperoneInfo.trim())   errors.chaperoneInfo   = 'Chaperone information is required';
    if (!form.emergencyContact.trim()) errors.emergencyContact = 'Emergency contact is required';
    if (!form.additionalNotes.trim()) errors.additionalNotes  = 'Additional notes are required';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldTripRequestPage() {
  const navigate    = useNavigate();
  const { id }      = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();

  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM, teacherName: user?.name ?? '' });
  const [errors, setErrors]         = useState<FieldErrors>({});
  const [savedId, setSavedId]       = useState<string | null>(id ?? null);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Load school locations (type=SCHOOL, active only)
  const { data: allLocations = [] } = useQuery<OfficeLocation[]>({
    queryKey: ['locations', 'all'],
    queryFn:  async () => {
      const locs = await locationService.getAllLocations();
      return locs as OfficeLocation[];
    },
    staleTime: 5 * 60_000,
  });
  const schoolLocations = allLocations
    .filter((l) => l.type === 'SCHOOL' && l.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Load existing draft
  const { data: existingTrip, isLoading: loadingTrip } = useQuery<FieldTripRequest>({
    queryKey: ['field-trips', id],
    queryFn:  () => fieldTripService.getById(id!),
    enabled:  !!id,
  });

  useEffect(() => {
    if (existingTrip) {
      setForm(tripToFormState(existingTrip));
      setSavedId(existingTrip.id);
    }
  }, [existingTrip]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (data: CreateFieldTripDto) => fieldTripService.create(data),
    onSuccess:  (trip) => {
      setSavedId(trip.id);
      queryClient.invalidateQueries({ queryKey: ['field-trips', 'my-requests'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateFieldTripDto }) =>
      fieldTripService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-trips', 'my-requests'] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => fieldTripService.submit(id),
    onSuccess:  (trip) => {
      queryClient.invalidateQueries({ queryKey: ['field-trips', 'my-requests'] });
      navigate(`/field-trips/${trip.id}`);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'gradeClass' && value !== 'High School') next.subjectArea = '';
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSaveDraft = async () => {
    setSaveError(null);
    const dto = formToDto(form);
    try {
      if (savedId) {
        await updateMutation.mutateAsync({ id: savedId, data: dto });
      } else {
        const trip = await createMutation.mutateAsync(dto);
        setSavedId(trip.id);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
    }
  };

  const handleNext = () => {
    const stepErrors = validateStep(activeStep, form);
    if (Object.keys(stepErrors).length > 0) { setErrors(stepErrors); return; }
    setErrors({});
    // Skip the Transportation step when transportation is not needed
    if (activeStep === 0 && !form.transportationNeeded) {
      setActiveStep(2);
    } else {
      setActiveStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setErrors({});
    // Skip the Transportation step when transportation is not needed
    if (activeStep === 2 && !form.transportationNeeded) {
      setActiveStep(0);
    } else {
      setActiveStep((s) => s - 1);
    }
  };

  const handleSubmit = async () => {
    const allErrors: FieldErrors = {};
    for (let s = 0; s < STEPS.length; s++) Object.assign(allErrors, validateStep(s, form));
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setSaveError('Please fix the errors above before submitting.');
      return;
    }
    setSaveError(null);
    try {
      let currentId = savedId;
      const dto     = formToDto(form);
      if (currentId) {
        await updateMutation.mutateAsync({ id: currentId, data: dto });
      } else {
        const trip = await createMutation.mutateAsync(dto);
        currentId  = trip.id;
        setSavedId(currentId);
      }
      await submitMutation.mutateAsync(currentId!);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to submit');
    }
  };

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (loadingTrip) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isSaving     = createMutation.isPending || updateMutation.isPending;
  const isSubmitting = submitMutation.isPending;
  const isReadOnly   = existingTrip && existingTrip.status !== 'DRAFT';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/field-trips')} sx={{ mr: 1 }}>
          Back
        </Button>
        <Typography variant="h4" component="h1">
          {id ? 'Edit Field Trip Request' : 'New Field Trip Request'}
        </Typography>
      </Box>

      {isReadOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This request has already been submitted and cannot be edited.{' '}
          <Button size="small" onClick={() => navigate(`/field-trips/${savedId}`)}>
            View details
          </Button>
        </Alert>
      )}

      {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      <Paper sx={{ p: 3 }}>

        {/* ===== Step 0: Trip Information ===== */}
        {activeStep === 0 && (
          <Grid container spacing={2}>

            {/* Teacher / Sponsor Name */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Teacher / Sponsor Name"
                value={form.teacherName}
                onChange={(e) => handleChange('teacherName', e.target.value)}
                error={!!errors.teacherName}
                helperText={errors.teacherName}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* School / Building — dropdown from OfficeLocation (type=SCHOOL) */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required error={!!errors.schoolBuilding} disabled={isReadOnly}>
                <InputLabel id="school-building-label">School / Building</InputLabel>
                <Select
                  labelId="school-building-label"
                  label="School / Building"
                  value={form.schoolBuilding}
                  onChange={(e) => handleChange('schoolBuilding', e.target.value)}
                >
                  {schoolLocations.map((loc) => (
                    <MenuItem key={loc.id} value={loc.name}>{loc.name}</MenuItem>
                  ))}
                </Select>
                {errors.schoolBuilding && (
                  <FormHelperText>{errors.schoolBuilding}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Grade — dropdown Pre-K through 8th + High School */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required error={!!errors.gradeClass} disabled={isReadOnly}>
                <InputLabel id="grade-label">Grade</InputLabel>
                <Select
                  labelId="grade-label"
                  label="Grade"
                  value={form.gradeClass}
                  onChange={(e) => handleChange('gradeClass', e.target.value)}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <MenuItem key={g} value={g}>{g}</MenuItem>
                  ))}
                </Select>
                {errors.gradeClass && <FormHelperText>{errors.gradeClass}</FormHelperText>}
              </FormControl>
            </Grid>

            {/* Subject Area — only shown when High School is selected */}
            {form.gradeClass === 'High School' && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required error={!!errors.subjectArea} disabled={isReadOnly}>
                  <InputLabel id="subject-label">Subject Area</InputLabel>
                  <Select
                    labelId="subject-label"
                    label="Subject Area"
                    value={form.subjectArea}
                    onChange={(e) => handleChange('subjectArea', e.target.value)}
                  >
                    {SUBJECT_OPTIONS.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                  {errors.subjectArea && <FormHelperText>{errors.subjectArea}</FormHelperText>}
                </FormControl>
              </Grid>
            )}

            {/* Number of Students */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Number of Students"
                type="number"
                inputProps={{ min: 1, max: 500 }}
                value={form.studentCount}
                onChange={(e) => handleChange('studentCount', e.target.value)}
                error={!!errors.studentCount}
                helperText={errors.studentCount}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Date of Trip — inline calendar with availability */}
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom>
                Date of Trip{' '}
                <Box component="span" sx={{ color: 'error.main' }}>*</Box>
              </Typography>
              <FieldTripDatePicker
                value={form.tripDate}
                onChange={(v) => handleChange('tripDate', v)}
                disabled={!!isReadOnly}
                error={errors.tripDate}
              />
            </Grid>

            {/* Is this an overnight trip? */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl component="fieldset" disabled={isReadOnly}>
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}
                >
                  Is this an overnight trip?
                </FormLabel>
                <RadioGroup
                  row
                  value={form.isOvernightTrip ? 'yes' : 'no'}
                  onChange={(e) => {
                    const overnight = e.target.value === 'yes';
                    handleChange('isOvernightTrip', overnight);
                    if (!overnight) handleChange('returnDate', '');
                  }}
                >
                  <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                  <FormControlLabel value="no"  control={<Radio />} label="No"  />
                </RadioGroup>
              </FormControl>
            </Grid>

            {/* Return Date — only when overnight */}
            {form.isOvernightTrip && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Return Date"
                  type="date"
                  value={form.returnDate}
                  onChange={(e) => handleChange('returnDate', e.target.value)}
                  error={!!errors.returnDate}
                  helperText={errors.returnDate ?? 'Date students return from the trip'}
                  disabled={isReadOnly}
                  required
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: form.tripDate || undefined }}
                />
              </Grid>
            )}

            {/* Destination */}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Destination"
                value={form.destination}
                onChange={(e) => handleChange('destination', e.target.value)}
                error={!!errors.destination}
                helperText={errors.destination}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Destination Address */}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Destination Address"
                value={form.destinationAddress}
                onChange={(e) => handleChange('destinationAddress', e.target.value)}
                error={!!errors.destinationAddress}
                helperText={errors.destinationAddress ?? 'Street address of the destination'}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Educational Purpose */}
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="How is this trip an integral part of an approved course of study?"
                value={form.purpose}
                onChange={(e) => handleChange('purpose', e.target.value)}
                error={!!errors.purpose}
                helperText={errors.purpose ?? 'Minimum 10 characters'}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Preliminary Activities */}
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Prior to this field trip, the class will be involved in the following preliminary activities to prepare for this trip"
                value={form.preliminaryActivities}
                onChange={(e) => handleChange('preliminaryActivities', e.target.value)}
                error={!!errors.preliminaryActivities}
                helperText={errors.preliminaryActivities}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Follow-up Activities */}
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Follow-up activities for this unit/trip will include the following activities"
                value={form.followUpActivities}
                onChange={(e) => handleChange('followUpActivities', e.target.value)}
                error={!!errors.followUpActivities}
                helperText={errors.followUpActivities}
                disabled={isReadOnly}
                required
              />
            </Grid>

            {/* Are buses needed? — Radio Yes / No */}
            <Grid size={12}>
              <FormControl component="fieldset" disabled={isReadOnly}>
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}
                >
                  Are buses needed for this trip?
                </FormLabel>
                <RadioGroup
                  row
                  value={form.transportationNeeded ? 'yes' : 'no'}
                  onChange={(e) => {
                    const needed = e.target.value === 'yes';
                    handleChange('transportationNeeded', needed);
                    if (needed) handleChange('alternateTransportation', '');
                  }}
                >
                  <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                  <FormControlLabel value="no"  control={<Radio />} label="No"  />
                </RadioGroup>
              </FormControl>
            </Grid>

            {/* Alternate transport — only when buses not needed */}
            {!form.transportationNeeded && (
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="How will the students be transported?"
                  value={form.alternateTransportation}
                  onChange={(e) => handleChange('alternateTransportation', e.target.value)}
                  error={!!errors.alternateTransportation}
                  helperText={errors.alternateTransportation ?? 'e.g., Parent drivers, walking, school van'}
                  disabled={isReadOnly}
                  required
                />
              </Grid>
            )}

            {/* Departure / Return Time */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required error={!!errors.departureTime} disabled={isReadOnly}>
                <InputLabel id="departure-time-label">Departure Time</InputLabel>
                <Select
                  labelId="departure-time-label"
                  label="Departure Time"
                  value={form.departureTime}
                  onChange={(e) => handleChange('departureTime', e.target.value)}
                >
                  {TIME_OPTIONS.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
                {errors.departureTime && <FormHelperText>{errors.departureTime}</FormHelperText>}
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required error={!!errors.returnTime} disabled={isReadOnly}>
                <InputLabel id="return-time-label">Return Time</InputLabel>
                <Select
                  labelId="return-time-label"
                  label="Return Time"
                  value={form.returnTime}
                  onChange={(e) => handleChange('returnTime', e.target.value)}
                >
                  {TIME_OPTIONS.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
                {errors.returnTime && <FormHelperText>{errors.returnTime}</FormHelperText>}
              </FormControl>
            </Grid>

          </Grid>
        )}

        {/* ===== Step 1: Transportation ===== */}
        {activeStep === 1 && (
          <Grid container spacing={2}>

            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Transportation Details"
                value={form.transportationDetails}
                onChange={(e) => handleChange('transportationDetails', e.target.value)}
                error={!!errors.transportationDetails}
                helperText={errors.transportationDetails ?? 'Describe transportation needs (bus type, number of buses, etc.)'}
                disabled={isReadOnly}
                required
              />
            </Grid>

          </Grid>
        )}

        {/* ===== Step 2: Costs & Additional Details ===== */}
        {activeStep === 2 && (
          <Grid container spacing={2}>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Cost Per Student"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                value={form.costPerStudent}
                onChange={(e) => handleChange('costPerStudent', e.target.value)}
                error={!!errors.costPerStudent}
                helperText={errors.costPerStudent}
                disabled={isReadOnly}
                required
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Total Cost"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                value={form.totalCost}
                onChange={(e) => handleChange('totalCost', e.target.value)}
                error={!!errors.totalCost}
                helperText={errors.totalCost}
                disabled={isReadOnly}
                required
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                label="Funding Source / Account Number"
                value={form.fundingSource}
                onChange={(e) => handleChange('fundingSource', e.target.value)}
                error={!!errors.fundingSource}
                helperText={errors.fundingSource}
                disabled={isReadOnly}
                required
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Chaperone Names & Contact Information"
                value={form.chaperoneInfo}
                onChange={(e) => handleChange('chaperoneInfo', e.target.value)}
                error={!!errors.chaperoneInfo}
                helperText={errors.chaperoneInfo ?? 'List all chaperones with their phone numbers'}
                disabled={isReadOnly}
                required
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                label="Emergency Contact"
                value={form.emergencyContact}
                onChange={(e) => handleChange('emergencyContact', e.target.value)}
                error={!!errors.emergencyContact}
                helperText={errors.emergencyContact ?? 'Name and phone number of main emergency contact'}
                disabled={isReadOnly}
                required
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Additional Notes"
                value={form.additionalNotes}
                onChange={(e) => handleChange('additionalNotes', e.target.value)}
                error={!!errors.additionalNotes}
                helperText={errors.additionalNotes}
                disabled={isReadOnly}
                required
              />
            </Grid>

          </Grid>
        )}

      </Paper>

      {/* Navigation buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Box>
          {activeStep > 0 && (
            <Button onClick={handleBack} disabled={isSaving || isSubmitting}>
              Back
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!isReadOnly && (
            <Button
              variant="outlined"
              startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSaveDraft}
              disabled={isSaving || isSubmitting}
            >
              Save as Draft
            </Button>
          )}
          {activeStep < STEPS.length - 1 ? (
            <Button variant="contained" onClick={handleNext}>
              Next
            </Button>
          ) : (
            !isReadOnly && (
              <Button
                variant="contained"
                color="success"
                startIcon={isSubmitting ? <CircularProgress size={16} /> : <SendIcon />}
                onClick={handleSubmit}
                disabled={isSaving || isSubmitting}
              >
                Submit for Approval
              </Button>
            )
          )}
        </Box>
      </Box>
    </Box>
  );
}

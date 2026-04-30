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
import { fieldTripTransportationService }            from '../../services/fieldTripTransportation.service';
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
  // Transportation Step 2 fields
  transportNeedsDriver:         string;
  transportDriverName:          string;
  transportLoadingLocation:     string;
  transportLoadingTime:         string;
  transportArriveLocation:      string;
  transportArriveFirstDestTime: string;
  transportLeaveLocation:       string;
  transportLeaveLastDestTime:   string;
  transportReturnToSchoolTime:  string;
  transportSpedBus:             string;
  transportItinerary:           string;
  transportAdditionalDests:     Array<{ name: string; arriveTime: string; leaveTime: string }>;
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
  transportNeedsDriver:         'true',
  transportDriverName:          '',
  transportLoadingLocation:     '',
  transportLoadingTime:         '',
  transportArriveLocation:      '',
  transportArriveFirstDestTime: '',
  transportLeaveLocation:       '',
  transportLeaveLastDestTime:   '',
  transportReturnToSchoolTime:  '',
  transportSpedBus:             'false',
  transportItinerary:           '',
  transportAdditionalDests:     [],
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
    transportNeedsDriver:         'true',
    transportDriverName:          '',
    transportLoadingLocation:     '',
    transportLoadingTime:         '',
    transportArriveLocation:      '',
    transportArriveFirstDestTime: '',
    transportLeaveLocation:       '',
    transportLeaveLastDestTime:   '',
    transportReturnToSchoolTime:  '',
    transportSpedBus:             'false',
    transportItinerary:           '',
    transportAdditionalDests:     [],
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
    departureTime:         form.transportationNeeded ? (form.transportLoadingTime || '') : form.departureTime.trim(),
    returnTime:            form.transportationNeeded ? (form.transportReturnToSchoolTime || '') : form.returnTime.trim(),
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
    if (!form.transportationNeeded && !form.departureTime.trim()) errors.departureTime = 'Departure time is required';
    if (!form.transportationNeeded && !form.returnTime.trim())    errors.returnTime    = 'Return time is required';
    if (!form.transportationNeeded && !form.alternateTransportation.trim())
      errors.alternateTransportation = 'Please describe how students will be transported';
  }

  if (step === 1 && form.transportationNeeded) {
    if (!form.transportLoadingLocation.trim())
      errors.transportLoadingLocation = 'Loading location is required';
    if (!form.transportLoadingTime)
      errors.transportLoadingTime = 'Loading time is required';
    if (form.transportNeedsDriver === 'false' && !form.transportDriverName.trim())
      errors.transportDriverName = 'Driver name is required when not using district driver';
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
    onSuccess:  async (trip) => {
      queryClient.invalidateQueries({ queryKey: ['field-trips', 'my-requests'] });
      if (trip.transportationNeeded) {
        try {
          const busCount = Math.ceil((parseInt(form.studentCount) || 0) / 52) || 1;
          await fieldTripTransportationService.create(trip.id.toString(), {
            busCount,
            needsDriver: form.transportNeedsDriver === 'true',
            driverName: form.transportDriverName || undefined,
            loadingLocation: form.transportLoadingLocation,
            loadingTime: form.transportLoadingTime,
            arriveLocation: form.transportArriveLocation || undefined,
            arriveFirstDestTime: form.transportArriveFirstDestTime || undefined,
            leaveLocation: form.transportLeaveLocation || undefined,
            leaveLastDestTime: form.transportLeaveLastDestTime || undefined,
            returnToSchoolTime: form.transportReturnToSchoolTime || undefined,
            additionalDestinations: form.transportAdditionalDests.filter(d => d.name.trim()),
            spedBusNeeded: form.transportSpedBus === 'true',
            tripItinerary: form.transportItinerary || undefined,
          });
        } catch (e) {
          // Transportation creation failure is non-fatal — trip was submitted, log it
        }
      }
      navigate(`/field-trips/${trip.id}`);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleChange = (field: keyof FormState, value: string | boolean | Array<{ name: string; arriveTime: string; leaveTime: string }>) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value } as FormState;
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

            {/* Departure / Return Time — only shown when no district bus is needed */}
            {!form.transportationNeeded && (
              <>
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
              </>
            )}

          </Grid>
        )}

        {/* ===== Step 1: Transportation ===== */}
        {activeStep === 1 && (
          <Grid container spacing={2}>

            {/* Auto-calculated bus count — read only */}
            <Grid size={12}>
              <Box sx={{ p: 2, bgcolor: 'primary.light', color: 'primary.contrastText', borderRadius: 1, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Buses Required: {Math.ceil((parseInt(form.studentCount) || 0) / 52) || 1}
                </Typography>
                <Typography variant="body2">
                  (based on {form.studentCount || '0'} students, 52 per bus)
                </Typography>
              </Box>
            </Grid>

            {/* Needs driver */}
            <Grid size={6}>
              <FormControl error={!!errors.transportNeedsDriver}>
                <FormLabel>Do you need a driver?</FormLabel>
                <RadioGroup
                  row
                  value={form.transportNeedsDriver}
                  onChange={(e) => handleChange('transportNeedsDriver', e.target.value)}
                >
                  <FormControlLabel value="true"  control={<Radio />} label="Yes" disabled={isReadOnly} />
                  <FormControlLabel value="false" control={<Radio />} label="No"  disabled={isReadOnly} />
                </RadioGroup>
              </FormControl>
            </Grid>

            {/* SPED bus */}
            <Grid size={6}>
              <FormControl>
                <FormLabel>Will a SPED bus be needed?</FormLabel>
                <RadioGroup
                  row
                  value={form.transportSpedBus}
                  onChange={(e) => handleChange('transportSpedBus', e.target.value)}
                >
                  <FormControlLabel value="true"  control={<Radio />} label="Yes" disabled={isReadOnly} />
                  <FormControlLabel value="false" control={<Radio />} label="No"  disabled={isReadOnly} />
                </RadioGroup>
              </FormControl>
            </Grid>

            {/* Driver name — only shown when needsDriver === 'false' */}
            {form.transportNeedsDriver === 'false' && (
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Who is driving?"
                  value={form.transportDriverName}
                  onChange={(e) => handleChange('transportDriverName', e.target.value)}
                  error={!!errors.transportDriverName}
                  helperText={errors.transportDriverName}
                  disabled={isReadOnly}
                  required
                />
              </Grid>
            )}

            {/* ── Stop 1: Loading ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>Loading</Typography>
            </Grid>
            <Grid size={8}>
              <TextField
                fullWidth
                label="Loading Location"
                value={form.transportLoadingLocation}
                onChange={(e) => handleChange('transportLoadingLocation', e.target.value)}
                error={!!errors.transportLoadingLocation}
                helperText={errors.transportLoadingLocation ?? 'Where students will board'}
                disabled={isReadOnly}
                required
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth error={!!errors.transportLoadingTime} required>
                <InputLabel>Loading Time</InputLabel>
                <Select
                  label="Loading Time"
                  value={form.transportLoadingTime}
                  onChange={(e) => handleChange('transportLoadingTime', e.target.value)}
                  disabled={isReadOnly}
                >
                  {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
                {errors.transportLoadingTime && <FormHelperText>{errors.transportLoadingTime}</FormHelperText>}
              </FormControl>
            </Grid>

            {/* ── Stop 2: Arrive at Location ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>Arrive at Location</Typography>
            </Grid>
            <Grid size={8}>
              <TextField
                fullWidth
                label="Arrival Location"
                value={form.transportArriveLocation}
                onChange={(e) => handleChange('transportArriveLocation', e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g. Carson Center"
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth>
                <InputLabel>Arrive Time</InputLabel>
                <Select
                  label="Arrive Time"
                  value={form.transportArriveFirstDestTime}
                  onChange={(e) => handleChange('transportArriveFirstDestTime', e.target.value)}
                  disabled={isReadOnly}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* ── Stop 3: Leave Location ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>Leave Location</Typography>
            </Grid>
            <Grid size={8}>
              <TextField
                fullWidth
                label="Leaving Location"
                value={form.transportLeaveLocation}
                onChange={(e) => handleChange('transportLeaveLocation', e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g. Carson Center"
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth>
                <InputLabel>Leave Time</InputLabel>
                <Select
                  label="Leave Time"
                  value={form.transportLeaveLastDestTime}
                  onChange={(e) => handleChange('transportLeaveLastDestTime', e.target.value)}
                  disabled={isReadOnly}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* ── Return to School ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>Return to School</Typography>
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth>
                <InputLabel>Return Time</InputLabel>
                <Select
                  label="Return Time"
                  value={form.transportReturnToSchoolTime}
                  onChange={(e) => handleChange('transportReturnToSchoolTime', e.target.value)}
                  disabled={isReadOnly}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* ── Additional Stops / Breaks ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>Additional Stops / Breaks</Typography>
              {form.transportAdditionalDests.map((stop, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <TextField
                    label={`Stop ${idx + 1} Name`}
                    value={stop.name}
                    onChange={(e) => {
                      const updated = [...form.transportAdditionalDests];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      handleChange('transportAdditionalDests', updated);
                    }}
                    size="small"
                    sx={{ flex: 2, minWidth: 160 }}
                    disabled={isReadOnly}
                  />
                  <FormControl size="small" sx={{ flex: 1, minWidth: 120 }}>
                    <InputLabel>Arrive</InputLabel>
                    <Select
                      label="Arrive"
                      value={stop.arriveTime}
                      onChange={(e) => {
                        const updated = [...form.transportAdditionalDests];
                        updated[idx] = { ...updated[idx], arriveTime: e.target.value };
                        handleChange('transportAdditionalDests', updated);
                      }}
                      disabled={isReadOnly}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ flex: 1, minWidth: 120 }}>
                    <InputLabel>Leave</InputLabel>
                    <Select
                      label="Leave"
                      value={stop.leaveTime}
                      onChange={(e) => {
                        const updated = [...form.transportAdditionalDests];
                        updated[idx] = { ...updated[idx], leaveTime: e.target.value };
                        handleChange('transportAdditionalDests', updated);
                      }}
                      disabled={isReadOnly}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {TIME_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                  {!isReadOnly && (
                    <Button
                      size="small"
                      color="error"
                      sx={{ mt: 0.5 }}
                      onClick={() => handleChange('transportAdditionalDests', form.transportAdditionalDests.filter((_, i) => i !== idx))}
                    >Remove</Button>
                  )}
                </Box>
              ))}
              {!isReadOnly && form.transportAdditionalDests.length < 10 && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleChange('transportAdditionalDests', [...form.transportAdditionalDests, { name: '', arriveTime: '', leaveTime: '' }])}
                >
                  + Add Stop / Break
                </Button>
              )}
            </Grid>

            {/* Other Information */}
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={4}
                label="Other Information Needed"
                value={form.transportItinerary}
                onChange={(e) => handleChange('transportItinerary', e.target.value)}
                helperText={`${form.transportItinerary.length}/3000 characters`}
                inputProps={{ maxLength: 3000 }}
                disabled={isReadOnly}
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

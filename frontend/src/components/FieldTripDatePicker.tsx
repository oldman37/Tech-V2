/**
 * FieldTripDatePicker
 *
 * Inline month calendar for selecting a field trip date.
 * - Fetches trip counts per date from /api/field-trips/date-counts
 * - Disables past dates and dates with 8+ submitted trips
 * - Shows a badge (count/8) on each day that has bookings
 * - Highlights the selected date
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon  from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { fieldTripService } from '../services/fieldTrip.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MAX_TRIPS_PER_DAY = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCalendarMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldTripDatePickerProps {
  value:     string;          // YYYY-MM-DD or ''
  onChange:  (v: string) => void;
  disabled?: boolean;
  error?:    string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldTripDatePicker({ value, onChange, disabled, error }: FieldTripDatePickerProps) {
  // Start at the month of the selected date, or today
  const initialDate = value
    ? new Date(value + 'T00:00:00')
    : new Date();

  const [viewYear,  setViewYear]  = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Date range for the query — first day of the view month to last day
  const fromStr = useMemo(() => {
    return toLocalISO(new Date(viewYear, viewMonth, 1));
  }, [viewYear, viewMonth]);

  const toStr = useMemo(() => {
    return toLocalISO(new Date(viewYear, viewMonth + 1, 0));
  }, [viewYear, viewMonth]);

  const { data: dateCounts, isLoading } = useQuery<Record<string, number>>({
    queryKey: ['field-trip-date-counts', fromStr, toStr],
    queryFn:  () => fieldTripService.getDateCounts(fromStr, toStr),
    staleTime: 60_000, // 1 minute
  });

  const todayISO = toLocalISO(new Date());

  const matrix = useMemo(
    () => buildCalendarMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (date: Date) => {
    if (disabled) return;
    const iso = toLocalISO(date);
    if (iso < todayISO) return;  // past
    const count = dateCounts?.[iso] ?? 0;
    if (count >= MAX_TRIPS_PER_DAY) return;  // full
    onChange(iso);
  };

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          maxWidth: 360,
          borderColor: error ? 'error.main' : undefined,
        }}
      >
        {/* Header: Month navigation */}
        <Box
          sx={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            mb: 1,
          }}
        >
          <IconButton
            size="small"
            onClick={handlePrevMonth}
            disabled={disabled}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" fontWeight="bold">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Typography>
          <IconButton
            size="small"
            onClick={handleNextMonth}
            disabled={disabled}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Loading overlay */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        {!isLoading && (
          <>
            {/* Day-of-week header */}
            <Box
              sx={{
                display:             'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                mb: 0.25,
              }}
            >
              {DAY_LABELS.map((lbl) => (
                <Box key={lbl} sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    {lbl}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Calendar rows */}
            {matrix.map((row, ri) => (
              <Box
                key={ri}
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
              >
                {row.map((date, ci) => {
                  if (!date) {
                    return <Box key={ci} sx={{ p: 0.5 }} />;
                  }

                  const iso    = toLocalISO(date);
                  const count  = dateCounts?.[iso] ?? 0;
                  const isFull = count >= MAX_TRIPS_PER_DAY;
                  const isPast = iso < todayISO;
                  const isSelected = iso === value;
                  const isUnavailable = isFull || isPast;

                  let bgColor   = 'transparent';
                  let textColor = 'text.primary';
                  let cursor    = 'pointer';

                  if (isSelected) {
                    bgColor   = 'primary.main';
                    textColor = 'primary.contrastText';
                  } else if (isFull) {
                    bgColor   = 'error.light';
                    textColor = 'text.disabled';
                    cursor    = 'not-allowed';
                  } else if (isPast) {
                    textColor = 'text.disabled';
                    cursor    = 'default';
                  }

                  const tooltipTitle = isFull
                    ? `${count}/${MAX_TRIPS_PER_DAY} — Fully booked`
                    : count > 0
                    ? `${count}/${MAX_TRIPS_PER_DAY} trips booked`
                    : '';

                  return (
                    <Tooltip
                      key={ci}
                      title={tooltipTitle}
                      disableHoverListener={!tooltipTitle}
                      placement="top"
                      arrow
                    >
                      <Box
                        onClick={() => !isUnavailable && !disabled && handleSelectDate(date)}
                        sx={{
                          p:            0.25,
                          textAlign:    'center',
                          cursor,
                          opacity: (isPast || disabled) ? 0.4 : 1,
                        }}
                      >
                        <Box
                          sx={{
                            borderRadius: '50%',
                            bgcolor:      bgColor,
                            color:        textColor,
                            width:        34,
                            height:       34,
                            mx:           'auto',
                            display:      'flex',
                            flexDirection:'column',
                            alignItems:   'center',
                            justifyContent: 'center',
                            position:     'relative',
                            '&:hover': !isUnavailable && !disabled && !isSelected ? {
                              bgcolor: 'action.hover',
                            } : {},
                          }}
                        >
                          <Typography variant="caption" lineHeight={1}>
                            {date.getDate()}
                          </Typography>
                          {count > 0 && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize:   '0.6rem',
                                lineHeight: 1,
                                color: isSelected ? 'primary.contrastText' : isFull ? 'error.main' : 'text.secondary',
                                fontWeight: isFull ? 'bold' : 'normal',
                              }}
                            >
                              {count}/{MAX_TRIPS_PER_DAY}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </>
        )}

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'primary.main' }} />
            <Typography variant="caption" color="text.secondary">Selected</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'error.light' }} />
            <Typography variant="caption" color="text.secondary">Fully booked (8/8)</Typography>
          </Box>
        </Box>
      </Paper>

      {/* Show selected date as readable text */}
      {value && (
        <Typography variant="body2" sx={{ mt: 0.5, ml: 0.5 }} color="text.secondary">
          Selected:{' '}
          {new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </Typography>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ ml: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Transportation Reports Page — /transportation/reports
 *
 * Monthly fuel consumption report with summary cards, threshold alerts,
 * and tables by unit and by user.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmailIcon from '@mui/icons-material/Email';
import WarningIcon from '@mui/icons-material/Warning';
import { PageBackButton } from '@/components/layout/PageBackButton';
import { useAuthStore } from '@/store/authStore';
import { reportApi } from '@/services/transportation.service';
import type { MonthlyFuelReport } from '@/types/transportation.types';

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Typography variant="h5" fontWeight="bold" color={color ?? 'text.primary'}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function TransportationReportsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('ADMIN');
  const permLevel = isAdmin ? 6 : (user?.permLevels?.TRANSPORTATION ?? 2);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth]         = useState(defaultMonth);
  const [fetchMonth, setFetchMonth] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError]   = useState('');

  const { data: report, isFetching, error } = useQuery<MonthlyFuelReport>({
    queryKey: ['transportation-report', fetchMonth],
    queryFn: () => reportApi.getMonthlyFuelReport(fetchMonth),
    enabled: !!fetchMonth,
  });

  const sendMutation = useMutation({
    mutationFn: () => reportApi.sendMonthlyReport(fetchMonth),
    onSuccess: () => {
      setSendSuccess(true);
      setSendError('');
    },
    onError: (err: unknown) => {
      setSendError(err instanceof Error ? err.message : 'Failed to send report email');
      setSendSuccess(false);
    },
  });

  function handleGenerate() {
    if (!month.match(/^\d{4}-\d{2}$/)) return;
    setSendSuccess(false);
    setSendError('');
    setFetchMonth(month);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box display="flex" alignItems="center" gap={1} mb={3} flexWrap="wrap">
        <PageBackButton to="/transportation" />
        <Typography variant="h5" fontWeight="bold">Transportation Reports</Typography>
      </Box>

      {/* Month picker */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <TextField
            label="Reporting Month"
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="YYYY-MM"
            helperText="Format: YYYY-MM (e.g., 2026-06)"
            sx={{ width: 200 }}
          />
          <Button
            variant="contained"
            startIcon={<BarChartIcon />}
            onClick={handleGenerate}
            disabled={!month.match(/^\d{4}-\d{2}$/) || isFetching}
          >
            Generate Report
          </Button>
          {permLevel >= 3 && fetchMonth && report && (
            <Button
              variant="outlined"
              startIcon={<EmailIcon />}
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              color="secondary"
            >
              Email Report Now
            </Button>
          )}
        </Box>
        {sendSuccess && (
          <Alert severity="success" sx={{ mt: 1 }}>Report email sent successfully.</Alert>
        )}
        {sendError && (
          <Alert severity="error" sx={{ mt: 1 }}>{sendError}</Alert>
        )}
      </Paper>

      {isFetching && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load report data.</Alert>}

      {report && !isFetching && (
        <>
          {/* Threshold alert */}
          {report.thresholdExceeded && (
            <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
              Gas usage threshold exceeded for {report.month}.{' '}
              {report.thresholdGallons != null && (
                <>
                  Used <strong>{report.totalGasGallons.toFixed(1)} gal</strong> vs threshold of{' '}
                  <strong>{report.thresholdGallons.toFixed(1)} gal</strong>.
                </>
              )}
            </Alert>
          )}

          {/* Summary cards */}
          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <SummaryCard label="Total Entries" value={report.totalEntries.toString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <SummaryCard
                label="Total Gallons"
                value={report.totalGallons.toFixed(3)}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <SummaryCard
                label="Total Cost"
                value={report.totalCost > 0 ? `$${report.totalCost.toFixed(2)}` : '—'}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <SummaryCard
                label="Top Gas User"
                value={
                  report.topGasUser
                    ? `${report.topGasUser.displayName} (${report.topGasUser.gallons.toFixed(1)} gal)`
                    : '—'
                }
                color={report.thresholdExceeded ? 'warning.main' : undefined}
              />
            </Grid>
          </Grid>

          {/* Fuel by Unit */}
          <Paper sx={{ mb: 3 }}>
            <Box p={2} borderBottom="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="bold">Fuel by Unit</Typography>
            </Box>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Unit #</TableCell>
                    <TableCell>Fuel Type</TableCell>
                    <TableCell align="right">Gallons</TableCell>
                    <TableCell align="right">Cost</TableCell>
                    <TableCell align="right">Entries</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.byUnit.map((row) => (
                    <TableRow key={row.unitId} hover>
                      <TableCell><Typography variant="body2" fontWeight="bold">{row.unitNumber}</Typography></TableCell>
                      <TableCell>{row.fuelType}</TableCell>
                      <TableCell align="right">{row.totalGallons.toFixed(3)}</TableCell>
                      <TableCell align="right">
                        {row.totalCost > 0 ? `$${row.totalCost.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell align="right">{row.entryCount}</TableCell>
                    </TableRow>
                  ))}
                  {report.byUnit.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">No data for this month.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Fuel by User */}
          <Paper>
            <Box p={2} borderBottom="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="bold">Fuel by Driver</Typography>
            </Box>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Driver</TableCell>
                    <TableCell align="right">Gallons</TableCell>
                    <TableCell align="right">Cost</TableCell>
                    <TableCell align="right">Entries</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.byUser.map((row) => {
                    const isTopUser = report.topGasUser?.displayName === row.displayName;
                    return (
                      <TableRow
                        key={row.userId}
                        hover
                        sx={isTopUser ? { backgroundColor: 'warning.50' } : {}}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={isTopUser ? 'bold' : 'normal'}>
                            {row.displayName}
                            {isTopUser && (
                              <Typography component="span" variant="caption" color="warning.main" ml={1}>
                                ★ Top User
                              </Typography>
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{row.totalGallons.toFixed(3)}</TableCell>
                        <TableCell align="right">
                          {row.totalCost > 0 ? `$${row.totalCost.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell align="right">{row.entryCount}</TableCell>
                      </TableRow>
                    );
                  })}
                  {report.byUser.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">No data for this month.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useIsMobile } from '../../hooks/useResponsive';
import { Download as DownloadIcon } from '@mui/icons-material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { checkoutReportService } from '../../services/checkoutReport.service';
import { locationService } from '../../services/location.service';
import { useAuthStore, selectCanSeeAllLocations } from '../../store/authStore';
import type { InvoiceAgingBucket, GradeLevelSummaryItem } from '../../types/checkoutReport.types';
import { gradeLevelLabel } from '../../constants/gradeLevel';

type ReportType = 'active-checkouts' | 'damage-summary' | 'repair-costs' | 'invoice-aging' | 'grade-level-summary' | null;

export default function ReportsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedReport, setSelectedReport] = useState<ReportType>(null);
  const [startDate, setStartDate]           = useState('');
  const [endDate, setEndDate]               = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('');

  const user = useAuthStore((s) => s.user);
  const canSeeAllLocations = useAuthStore(selectCanSeeAllLocations);

  // ── All Locations (for filter dropdown) ─────────────────────────────────
  const { data: allLocations } = useQuery({
    queryKey: ['locations', 'all'],
    queryFn:  () => locationService.getAllLocations(),
    enabled:  selectedReport === 'active-checkouts',
  });

  // Resolve user's default location: match officeLocation string → OfficeLocation.id
  const defaultLocationId = useMemo(() => {
    if (!allLocations || !user?.officeLocation) return '';
    const match = allLocations.find(
      (l) => l.name.toLowerCase() === (user.officeLocation ?? '').toLowerCase(),
    );
    return match?.id ?? '';
  }, [allLocations, user?.officeLocation]);

  // When locations load and user hasn't manually chosen yet, seed to user's campus
  const resolvedLocationId = locationFilter === '' && defaultLocationId
    ? defaultLocationId
    : locationFilter;

  // ── Active Checkouts ─────────────────────────────────────────────────────
  const { data: activeCheckouts, isLoading: loadingActive } = useQuery({
    queryKey: ['reports', 'active-checkouts', resolvedLocationId],
    queryFn:  () => checkoutReportService.getActiveCheckoutsByCampus(resolvedLocationId || undefined),
    // R2: wait until allLocations has resolved so defaultLocationId is seeded first,
    // avoiding an initial full-scan fetch with locationId=undefined.
    enabled:  selectedReport === 'active-checkouts' && allLocations !== undefined,
  });

  // ── Damage Summary ───────────────────────────────────────────────────────
  const { data: damageSummary, isLoading: loadingDamage } = useQuery({
    queryKey: ['reports', 'damage-summary', startDate, endDate],
    queryFn:  () => checkoutReportService.getDamageSummary({
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
    }),
    enabled: selectedReport === 'damage-summary',
  });

  // ── Repair Costs ─────────────────────────────────────────────────────────
  const { data: repairCosts, isLoading: loadingRepair } = useQuery({
    queryKey: ['reports', 'repair-costs', startDate, endDate],
    queryFn:  () => checkoutReportService.getRepairCostsByVendor({
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
    }),
    enabled: selectedReport === 'repair-costs',
  });

  // ── Invoice Aging ────────────────────────────────────────────────────────
  const { data: invoiceAging, isLoading: loadingAging } = useQuery({
    queryKey: ['reports', 'invoice-aging'],
    queryFn:  checkoutReportService.getInvoiceAging,
    enabled:  selectedReport === 'invoice-aging',
  });

  // ── Grade Level Summary ──────────────────────────────────────────────────
  const { data: gradeSummary, isLoading: loadingGrade } = useQuery({
    queryKey: ['reports', 'grade-level-summary', startDate, endDate],
    queryFn:  () => checkoutReportService.getGradeLevelSummary({
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
    }),
    enabled: selectedReport === 'grade-level-summary',
  });

  const showDateRange = selectedReport === 'damage-summary'
    || selectedReport === 'repair-costs'
    || selectedReport === 'grade-level-summary';
  const isLoading = loadingActive || loadingDamage || loadingRepair || loadingAging || loadingGrade;

  // ── CSV Export ───────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!activeCheckouts) return;

    const headers = ['Asset Tag', 'Device', 'User', 'Email', 'Location', 'Checked Out', 'Returned', 'Status'];

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const rows = activeCheckouts.flatMap((group) =>
      group.items.map((item) => [
        escapeCsv(item.equipment?.assetTag ?? ''),
        escapeCsv(item.equipment?.name ?? ''),
        escapeCsv(item.user ? `${item.user.firstName} ${item.user.lastName}` : ''),
        escapeCsv(item.user?.email ?? ''),
        escapeCsv(group.campus),
        escapeCsv(new Date(item.checkoutAt).toLocaleDateString()),
        escapeCsv(item.returnedAt ? new Date(item.returnedAt).toLocaleDateString() : ''),
        escapeCsv(item.status),
      ].join(','))
    );

    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const locationLabel = activeCheckouts[0]?.campus ?? 'all';
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `checkout-report-${locationLabel.replace(/\s+/g, '-')}-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 3 } }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/device-management')} sx={{ mb: 2 }}>
        Back
      </Button>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Device Management Reports
      </Typography>

      {/* Report selector */}
      {isMobile ? (
        <Box sx={{ mb: 2 }}>
          <select
            value={selectedReport ?? ''}
            onChange={(e) => setSelectedReport((e.target.value as ReportType) || null)}
            className="form-select"
            style={{ width: '100%' }}
          >
            <option value="">Select a report…</option>
            <option value="active-checkouts">Active Checkouts by Campus</option>
            <option value="damage-summary">Damage Summary</option>
            <option value="repair-costs">Repair Costs by Vendor</option>
            <option value="invoice-aging">Invoice Aging</option>
            <option value="grade-level-summary">By Grade Level</option>
          </select>
        </Box>
      ) : (
        <Tabs
          value={selectedReport ?? false}
          onChange={(_e, val: ReportType) => setSelectedReport(val)}
          sx={{ mb: 2 }}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab label="Active Checkouts by Campus" value="active-checkouts" />
          <Tab label="Damage Summary"             value="damage-summary" />
          <Tab label="Repair Costs by Vendor"     value="repair-costs" />
          <Tab label="Invoice Aging"              value="invoice-aging" />
          <Tab label="By Grade Level"             value="grade-level-summary" />
        </Tabs>
      )}

      {/* Date range inputs */}
      {showDateRange && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </Box>
      )}

      {/* No report selected */}
      {!selectedReport && (
        <Alert severity="info">Select a report type above to view data.</Alert>
      )}

      {/* Loading */}
      {selectedReport && isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Active Checkouts by Campus */}
      {selectedReport === 'active-checkouts' && (
        <>
          {/* Location filter + Export */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="location-filter-label">Location</InputLabel>
              <Select
                labelId="location-filter-label"
                label="Location"
                value={resolvedLocationId}
                onChange={(e) => setLocationFilter(e.target.value)}
                disabled={!canSeeAllLocations}
              >
                {canSeeAllLocations && <MenuItem value=""><em>All Locations</em></MenuItem>}
                {(allLocations ?? [])
                  .filter((l) => l.isActive && ['SCHOOL', 'DISTRICT_OFFICE'].includes(l.type))
                  .map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleExportCsv}
              disabled={!activeCheckouts || activeCheckouts.length === 0}
            >
              Export CSV
            </Button>
          </Box>
        </>
      )}

      {/* Active Checkouts by Campus — table / cards */}
      {selectedReport === 'active-checkouts' && !loadingActive && activeCheckouts && (
        <Box>
          {activeCheckouts.length === 0 && (
            <Alert severity="info">No checkouts found for the selected location.</Alert>
          )}
          {activeCheckouts.map(group => (
            <Box key={group.campus} sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {group.campus} — {group.count} record{group.count !== 1 ? 's' : ''}
              </Typography>
              {isMobile ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {group.items.map(item => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body1" fontFamily="monospace" fontWeight={700}>
                          {item.equipment?.assetTag ?? '—'}
                        </Typography>
                        {item.status === 'Checked In' ? (
                          <Chip label="Checked In" color="success" size="small" />
                        ) : (
                          <Chip label="Checked Out" color="warning" size="small" />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">{item.equipment?.name ?? '—'}</Typography>
                      {item.user && (
                        <Typography variant="body2" color="text.secondary">
                          {item.user.firstName} {item.user.lastName}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Out: {new Date(item.checkoutAt).toLocaleDateString()}
                        </Typography>
                        {item.returnedAt && (
                          <Typography variant="caption" color="text.secondary">
                            In: {new Date(item.returnedAt).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Asset Tag</TableCell>
                        <TableCell>Device</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Checked Out</TableCell>
                        <TableCell>Returned</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.equipment?.assetTag ?? '—'}</TableCell>
                          <TableCell>{item.equipment?.name ?? '—'}</TableCell>
                          <TableCell>
                            {item.user ? `${item.user.firstName} ${item.user.lastName}` : '—'}
                          </TableCell>
                          <TableCell>{item.user?.email ?? '—'}</TableCell>
                          <TableCell>{new Date(item.checkoutAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {item.returnedAt ? new Date(item.returnedAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            {item.status === 'Checked In' ? (
                              <Chip label="Checked In" color="success" size="small" />
                            ) : (
                              <Chip label="Checked Out" color="warning" size="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Damage Summary */}
      {selectedReport === 'damage-summary' && !loadingDamage && damageSummary && (
        isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {damageSummary.length === 0 ? (
              <Alert severity="info">No data for selected range.</Alert>
            ) : damageSummary.map((row, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{row.damageType}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.severity}</Typography>
                </Box>
                <Chip label={row.count} size="small" variant="outlined" />
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Damage Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell align="right">Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {damageSummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center">No data for selected range.</TableCell>
                  </TableRow>
                )}
                {damageSummary.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.damageType}</TableCell>
                    <TableCell>{row.severity}</TableCell>
                    <TableCell align="right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )
      )}

      {/* Repair Costs by Vendor */}
      {selectedReport === 'repair-costs' && !loadingRepair && repairCosts && (
        isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {repairCosts.length === 0 ? (
              <Alert severity="info">No data for selected range.</Alert>
            ) : repairCosts.map((row, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" fontWeight={600}>{row.vendorName}</Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" fontWeight={700}>${row.totalCost.toFixed(2)}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.ticketCount} ticket{row.ticketCount !== 1 ? 's' : ''}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Vendor</TableCell>
                  <TableCell align="right">Tickets</TableCell>
                  <TableCell align="right">Total Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {repairCosts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center">No data for selected range.</TableCell>
                  </TableRow>
                )}
                {repairCosts.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.vendorName}</TableCell>
                    <TableCell align="right">{row.ticketCount}</TableCell>
                    <TableCell align="right">${row.totalCost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )
      )}

      {/* Invoice Aging */}
      {selectedReport === 'invoice-aging' && !loadingAging && invoiceAging && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
          {(
            [
              { label: 'Current',    key: 'current' },
              { label: '1–30 Days',  key: 'days30' },
              { label: '31–60 Days', key: 'days60' },
              { label: '61–90 Days', key: 'days90' },
              { label: '90+ Days',   key: 'over90' },
            ] as const
          ).map(({ label, key }) => {
            const bucket: InvoiceAgingBucket = invoiceAging[key];
            return (
              <Card key={key} variant="outlined">
                <CardContent>
                  <Typography variant="overline" display="block">{label}</Typography>
                  <Typography variant="h5" fontWeight={700}>{bucket.count}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    ${parseFloat(bucket.total).toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Grade Level Summary */}
      {selectedReport === 'grade-level-summary' && !loadingGrade && gradeSummary && (
        isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {gradeSummary.length === 0 ? (
              <Alert severity="info">No grade-level data for the selected range.</Alert>
            ) : gradeSummary.map((row: GradeLevelSummaryItem) => (
              <Paper key={row.gradeLevel} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Chip label={gradeLevelLabel(row.gradeLevel)} size="small" color="primary" variant="outlined" />
                  <Chip label={`${row.incidentCount} incident${row.incidentCount !== 1 ? 's' : ''}`} size="small" variant="outlined" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Repair Cost</Typography>
                    <Typography variant="body2" fontWeight={600}>${row.totalRepairCost}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Outstanding</Typography>
                    <Typography variant="body2" fontWeight={600}>${row.outstandingInvoiceTotal}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Avg / Incident</Typography>
                    <Typography variant="body2" fontWeight={600}>${row.avgCostPerIncident}</Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Grade</TableCell>
                  <TableCell align="right">Incidents</TableCell>
                  <TableCell align="right">Total Repair Cost</TableCell>
                  <TableCell align="right">Outstanding Invoices</TableCell>
                  <TableCell align="right">Avg Cost / Incident</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gradeSummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">No grade-level data for the selected range.</TableCell>
                  </TableRow>
                )}
                {gradeSummary.map((row: GradeLevelSummaryItem) => (
                  <TableRow key={row.gradeLevel}>
                    <TableCell>
                      <Chip
                        label={gradeLevelLabel(row.gradeLevel)}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{row.incidentCount}</TableCell>
                    <TableCell align="right">${row.totalRepairCost}</TableCell>
                    <TableCell align="right">${row.outstandingInvoiceTotal}</TableCell>
                    <TableCell align="right">${row.avgCostPerIncident}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )
      )}
    </Box>
  );
}

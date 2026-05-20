import { Box, Card, CardContent, Chip, CircularProgress, Grid, Typography } from '@mui/material';
import type { DashboardData, DamageByGradeItem } from '../../types/checkoutReport.types';
import { gradeLevelLabel } from '../../constants/gradeLevel';

interface DashboardWidgetsProps {
  data:          DashboardData | undefined;
  isLoading:     boolean;
  gradeData?:    DamageByGradeItem[];
  gradeLoading?: boolean;
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography variant="h3" fontWeight={700} sx={{ my: 0.5 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{sub}</Typography>
      </CardContent>
    </Card>
  );
}

export function DashboardWidgets({ data, isLoading, gradeData, gradeLoading }: DashboardWidgetsProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Grid container spacing={3}>
      {/* Row 1: three stat cards */}
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard
          label="Active Checkouts"
          value={data.activeCheckoutsCount}
          sub="devices currently checked out"
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard
          label="In Repair"
          value={data.devicesInRepairCount}
          sub={`avg ${data.devicesInRepairAvgDays.toFixed(1)} days in shop`}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard
          label="Outstanding Invoices"
          value={`$${parseFloat(data.outstandingInvoiceTotal).toFixed(2)}`}
          sub="total unpaid balance"
        />
      </Grid>

      {/* Row 2: damage chart (wider) + top models */}
      <Grid size={{ xs: 12, md: 8 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Damage Incidents — Academic Year
            </Typography>
            {data.damageIncidentsThisYear.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No incidents this academic year
              </Typography>
            ) : (
              <Box
                sx={{
                  mt: 2,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
                  gap: 1,
                }}
              >
                {data.damageIncidentsThisYear.map(({ month, count }) => (
                  <Box
                    key={month}
                    sx={{
                      textAlign: 'center',
                      p: 1,
                      borderRadius: 1,
                      bgcolor: count > 0 ? 'error.50' : 'action.hover',
                    }}
                  >
                    <Typography variant="h6" fontWeight={700} color={count > 0 ? 'error.main' : 'text.primary'}>
                      {count}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {month.slice(5)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">Top Damaged Models</Typography>
            {data.topDamagedModels.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No data</Typography>
            ) : (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {data.topDamagedModels.map((m, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">
                      {m.brandName ? `${m.brandName} ${m.modelName}` : m.modelName}
                    </Typography>
                    <Chip size="small" label={m.incidentCount} color="error" variant="outlined" />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Row 3: Damage by Grade Level widget */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Damage by Grade — Academic Year
            </Typography>
            {gradeLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : !gradeData || gradeData.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No grade-level data this academic year
              </Typography>
            ) : (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {gradeData.map((row) => {
                  const max = gradeData[0]?.incidentCount ?? 1;
                  const pct = Math.round((row.incidentCount / max) * 100);
                  return (
                    <Box key={row.gradeLevel} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ minWidth: 90 }}>
                        {gradeLevelLabel(row.gradeLevel)}
                      </Typography>
                      <Box
                        sx={{
                          flex: 1,
                          height: 12,
                          borderRadius: 1,
                          bgcolor: 'error.100',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: `${pct}%`,
                            bgcolor: 'error.main',
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Chip
                        size="small"
                        label={row.incidentCount}
                        color="error"
                        variant="outlined"
                        sx={{ minWidth: 32 }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

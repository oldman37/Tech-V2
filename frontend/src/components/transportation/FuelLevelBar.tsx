/**
 * FuelLevelBar — visual gauge for a tank's current fill level.
 *
 * Color coding:
 *   red    < 10%
 *   yellow  10% – threshold
 *   green   > threshold
 */
import { Box, LinearProgress, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

interface Props {
  percentFull:     number;
  threshold:       number;
  gallonsCurrent:  number;
  gallonsCapacity: number;
}

const StyledProgress = styled(LinearProgress, {
  shouldForwardProp: (p) => p !== 'barColor',
})<{ barColor: string }>(({ barColor }) => ({
  height: 12,
  borderRadius: 6,
  '& .MuiLinearProgress-bar': {
    backgroundColor: barColor,
  },
}));

export function FuelLevelBar({ percentFull, threshold, gallonsCurrent, gallonsCapacity }: Props) {
  const pct = Math.max(0, Math.min(100, percentFull));

  let barColor = '#2e7d32'; // green
  if (pct < 10) {
    barColor = '#c62828';   // red
  } else if (pct <= threshold) {
    barColor = '#f57f17';   // amber/yellow
  }

  return (
    <Box>
      <StyledProgress
        variant="determinate"
        value={pct}
        barColor={barColor}
        sx={{ backgroundColor: '#e0e0e0' }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {pct.toFixed(1)}% ({gallonsCurrent.toFixed(0)} / {gallonsCapacity.toFixed(0)} gal)
      </Typography>
    </Box>
  );
}

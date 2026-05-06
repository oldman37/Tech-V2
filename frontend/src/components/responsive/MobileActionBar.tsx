/**
 * MobileActionBar — fixed bottom action bar for primary page actions on mobile.
 * Holds 1-3 action buttons (FAB or elevated). Hidden on desktop.
 */
import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { useIsMobile } from '../../hooks/useResponsive';

interface MobileActionBarProps {
  children: ReactNode;
}

/**
 * Usage:
 * ```tsx
 * <MobileActionBar>
 *   <Fab color="primary" onClick={handleAdd}><AddIcon /></Fab>
 *   <Button variant="contained">Save</Button>
 * </MobileActionBar>
 * ```
 */
export function MobileActionBar({ children }: MobileActionBarProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.5,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
        zIndex: (theme) => theme.zIndex.appBar,
        // Safe area inset for notched devices
        pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {children}
    </Box>
  );
}

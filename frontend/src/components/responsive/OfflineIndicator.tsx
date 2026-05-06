/**
 * OfflineIndicator — shows a subtle snackbar banner when the device goes offline.
 * Automatically dismisses when connectivity returns.
 */
import { useEffect, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <Snackbar
      open={isOffline}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 56, sm: 64 } }}
    >
      <Alert
        severity="warning"
        icon={<WifiOffIcon fontSize="small" />}
        sx={{
          width: '100%',
          alignItems: 'center',
          '& .MuiAlert-message': { py: 0 },
        }}
      >
        You are offline. Some features may be unavailable.
      </Alert>
    </Snackbar>
  );
}

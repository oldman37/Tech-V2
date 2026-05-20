import { useEffect, useState } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';

// Extend the Event type to include the non-standard beforeinstallprompt API.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_DAYS = 7;

function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isRecentlyDismissed(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
}

export const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Never show if already installed or dismissed recently
    if (isStandaloneMode() || isRecentlyDismissed()) return;

    // iOS Safari has no beforeinstallprompt — show manual instructions instead
    if (isIOS()) {
      setShowIOSHint(true);
      return;
    }

    const handler = (e: Event) => {
      // Prevent the native mini-infobar from appearing briefly then vanishing
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferredPrompt(null);
    setShowIOSHint(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setDeferredPrompt(null);
  };

  // Android / Chrome — captured beforeinstallprompt, show persistent prompt
  if (deferredPrompt) {
    return (
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 1 }}
      >
        <Alert
          severity="info"
          sx={{ width: '100%' }}
          action={
            <>
              <Button color="inherit" size="small" onClick={handleInstall}>
                Install
              </Button>
              <Button color="inherit" size="small" onClick={handleDismiss}>
                Not now
              </Button>
            </>
          }
        >
          Install SchoolWorks as an app for quick access
        </Alert>
      </Snackbar>
    );
  }

  // iOS Safari — no API to trigger install, show manual instructions
  if (showIOSHint) {
    return (
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 1 }}
      >
        <Alert severity="info" sx={{ width: '100%' }} onClose={handleDismiss}>
          Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to install
        </Alert>
      </Snackbar>
    );
  }

  return null;
};

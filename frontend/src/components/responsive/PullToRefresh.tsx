/**
 * PullToRefresh — lightweight pull-to-refresh wrapper for mobile.
 * Detects a pull-down gesture at the top of the scrollable area and
 * triggers a refresh callback (e.g. TanStack Query refetch).
 * Only activates on mobile viewports.
 */
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { CircularProgress } from '@mui/material';
import { useIsMobile } from '../../hooks/useResponsive';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  /** Pull distance in px required to trigger refresh (default 70) */
  threshold?: number;
  /** Whether pull-to-refresh is disabled */
  disabled?: boolean;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 70,
  disabled = false,
}: PullToRefreshProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isTracking = useRef(false);

  const isAtTop = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el) return false;
    return el.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || refreshing || !isAtTop()) return;
      startY.current = e.touches[0].clientY;
      isTracking.current = true;
    },
    [disabled, refreshing, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isTracking.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0 && isAtTop()) {
        // Apply resistance — pull at 40% speed
        const distance = Math.min(diff * 0.4, threshold * 1.8);
        setPullDistance(distance);
        setPulling(true);

        if (distance > 10) {
          e.preventDefault();
        }
      } else {
        setPulling(false);
        setPullDistance(0);
      }
    },
    [refreshing, isAtTop, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isTracking.current) return;
    isTracking.current = false;

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }

    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, threshold, refreshing, onRefresh]);

  useEffect(() => {
    if (!isMobile || disabled) return;
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // On desktop or when disabled, just render children
  if (!isMobile || disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', overflow: 'auto', height: '100%' }}
    >
      {/* Pull indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: `${pullDistance}px`,
          overflow: 'hidden',
          transition: pulling ? 'none' : 'height 0.2s ease-out',
          zIndex: 10,
        }}
      >
        {(pulling || refreshing) && (
          <CircularProgress
            size={24}
            sx={{
              opacity: Math.min(pullDistance / threshold, 1),
              transform: refreshing
                ? 'none'
                : `rotate(${(pullDistance / threshold) * 360}deg)`,
            }}
          />
        )}
      </div>

      {/* Content shifted down during pull */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

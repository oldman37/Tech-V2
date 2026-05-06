/**
 * Centralized responsive breakpoint hooks.
 * Uses MUI's useMediaQuery under the hood to match CSS breakpoints.
 */
import { useMediaQuery } from '@mui/material';

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const;

/** Returns true when viewport is at or below mobile breakpoint (768px) */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width:${BREAKPOINTS.mobile}px)`);
}

/** Returns true when viewport is at or below tablet breakpoint (1024px) */
export function useIsTablet(): boolean {
  return useMediaQuery(`(max-width:${BREAKPOINTS.tablet}px)`);
}

/** Composite hook returning all breakpoint states */
export function useResponsive() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  return { isMobile, isTablet, isDesktop: !isTablet } as const;
}

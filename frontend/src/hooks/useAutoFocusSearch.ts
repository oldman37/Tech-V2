/**
 * Auto-focus for a list page's primary search field.
 * Returns a callback ref: attach it to the search input (`ref` on a native input,
 * `inputRef` on an MUI TextField) and the field is focused — with any existing text
 * selected — once, when the page mounts.
 *
 * Focus is claimed a single time per mount, so it is never stolen back after the user
 * clicks elsewhere, and it re-fires when navigating back to the page (the page remounts).
 * Skipped on mobile/touch-primary devices, where focusing pops the on-screen keyboard
 * over the list on every page load.
 */
import { useCallback, useRef } from 'react';
import { useIsMobile } from './useResponsive';

export function useAutoFocusSearch() {
  const isMobile = useIsMobile();
  const hasFocused = useRef(false);

  return useCallback(
    (node: HTMLInputElement | null) => {
      if (!node || hasFocused.current) return;
      if (isMobile || window.matchMedia('(pointer: coarse)').matches) return;
      hasFocused.current = true;
      node.focus({ preventScroll: true });
      node.select();
    },
    [isMobile],
  );
}

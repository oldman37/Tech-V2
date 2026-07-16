/**
 * useFilterParams
 *
 * Keeps a list view's filter state in the URL query string so the view survives
 * navigation: pressing Back from a detail page returns to the same filtered list,
 * and the view can be refreshed, linked, or bookmarked. A fresh visit carries no
 * params and so shows defaults.
 *
 * Updates replace the current history entry instead of pushing one, so adjusting
 * several filters does not bury the previous page behind repeated Back presses.
 *
 * Values are strings, as URL params are; callers convert (e.g. page numbers).
 */

import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useFilterParams<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The caller passes an object literal, so `defaults` has a new identity every
  // render. Hold it in a ref to keep `setValues` stable enough for effect deps.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = searchParams.get(key);
    // `get` returns '' for `?key=`, which is a deliberate "cleared" choice and must
    // survive; only an absent param (null) falls back to the default.
    if (raw !== null) values[key] = raw as T[keyof T & string];
  }

  const setValues = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue;
            if (value === defaultsRef.current[key]) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** Whether the URL carries an explicit value for `key` — including an empty one. */
  const hasParam = useCallback(
    (key: keyof T & string) => searchParams.has(key),
    [searchParams],
  );

  return [values, setValues, hasParam] as const;
}

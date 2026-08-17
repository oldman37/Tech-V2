# Spec: Add standard `mobile-web-app-capable` meta tag

## Current State Analysis

`frontend/index.html:9` sets only the vendor-prefixed
`<meta name="apple-mobile-web-app-capable" content="yes" />`. Chromium-based
browsers (Chrome/Edge) now warn in the console that this tag is deprecated in
favor of the standard `mobile-web-app-capable` name and no longer emit
`apple-mobile-web-app-capable` support without it also being present.

## Problem Definition

Console shows: `<meta name="apple-mobile-web-app-capable" content="yes"> is
deprecated. Please include <meta name="mobile-web-app-capable" content="yes">`.
This is pure console noise on every page load — no functional break, but it
should be resolved because the app is PWA-installable and this tag controls
standalone-mode behavior on Chromium/Android.

## Proposed Solution

Add the standard `<meta name="mobile-web-app-capable" content="yes" />` tag
alongside the existing Apple-prefixed one. Keep the Apple tag — iOS Safari
still requires `apple-mobile-web-app-capable` for standalone-mode; only
Chromium currently supports the unprefixed name. Removing the Apple tag would
regress "Add to Home Screen" behavior on iOS.

## Implementation Steps

1. `frontend/index.html` — add `<meta name="mobile-web-app-capable" content="yes" />` next to the existing `apple-mobile-web-app-capable` tag.

## Dependencies

None — static HTML only.

## Risks and Mitigations

- **Risk:** none identified; purely additive, standards-track meta tag with no
  behavioral side effects beyond silencing the warning and enabling standalone
  mode on Chromium/Android where it wasn't previously declared.

## Verification

- Console warning no longer appears on load in Chromium-based browsers.
- `docker compose -f docker-compose.dev.yml build frontend` succeeds (static
  asset, no compile risk, but run per Phase 6 gate).

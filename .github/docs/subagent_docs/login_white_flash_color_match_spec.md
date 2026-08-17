# Spec: Remove the white flash between Login and Dashboard by colour-matching the transition

## Current State Analysis

Confirmed with the user: clicking "Sign in with Microsoft" produces a brief
white flash, then the dashboard fades in. Entra does **not** render a sign-in
screen — the user has an active Entra session, so `/authorize` 302s straight
through without painting a branded page.

The observed sequence:

1. `handleLogin` (`frontend/src/pages/Login.tsx:114-129`) sets `loading`, so
   `.login-container` re-renders as the spinner card — still the blue gradient
   (`Login.css:6-8`).
2. `await authApi.getLoginUrl()` — XHR to `/auth/login`
   (`backend/src/controllers/auth.controller.ts:44-86`), which returns
   `{ authUrl }` as JSON.
3. `window.location.href = authUrl` — hard cross-origin navigation to
   `login.microsoftonline.com`.
4. Entra 302s straight back to `REDIRECT_URI` (`/login?code=...`). Because
   nothing is rendered on Microsoft's origin, the visible artifact is the
   browser's own inter-document canvas — painted **white**, the UA default.
5. `/login?code=...` loads. `index.html`'s inline `<style>`
   (`frontend/index.html:22-31`) paints the **blue gradient**, React mounts,
   `handleCallback` runs, then `navigate('/dashboard', { replace: true })`.
6. `.app-shell` fades in over 200ms (`AppLayout.css:12`) on a background of
   `var(--slate-50, #f8fafc)` (`AppLayout.css:7`).

## Problem Definition

`--slate-50` is `#f8fafc` in light mode (`global.css:12`) — the dashboard is
already near-white. The white frame in step 4 is therefore *not* the wrong
colour for the destination. It is jarring only because of its neighbours:

```
blue gradient → WHITE → blue gradient → near-white dashboard
     (3)         (4)         (5)              (6)
```

Two hard colour boundaries (blue→white, white→blue) inside ~half a second.
The eye catches the boundaries, not the white itself.

Prior investigation (`login_transition_smoothness_spec.md`) correctly fixed
the *cold-load* case by pre-painting the blue gradient, but that same fix is
what creates boundary (5) on the callback load specifically.

Step 4's canvas cannot be styled — it belongs to no document of ours, and
there is no API to colour it directly. The only lever that influences it is
the CSS `color-scheme` property, which tells the UA which default canvas to
paint. **`color-scheme` is currently not declared anywhere in the project**
(verified: no match in `frontend/`), so the UA canvas is always the light
default (white) even for dark-mode users.

## Proposed Solution

Do not attempt to colour step 4. Converge steps 3, 5 and 6 onto the dashboard
background so step 4 has no contrasting neighbour and ceases to register as a
flash — becoming instead the leading frame of the fade into the dashboard.

Target colour is the existing dashboard background token, not a new value:
- light: `--slate-50` = `#f8fafc`
- dark:  `--slate-50` = `#0f172a` (`global.css:67`)

### 1. Fade the login page out before navigating (boundary 3→4)

Add a `.login-container--leaving` modifier in `Login.css` that transitions
`background` to the dashboard colour over 180ms. In `handleLogin`, set the
flag, await one animation frame plus the transition duration, then assign
`window.location.href`.

The 180ms is spent during time that is *already* dead — step 2's XHR round
trip has completed and the browser has not yet begun the cross-origin
navigation. Net added latency is bounded by 180ms and overlaps perceived
work, not interaction.

Guarded by `prefers-reduced-motion: reduce` → no transition, navigate
immediately (correct behaviour for that preference and consistent with the
existing `.app-shell` guard at `AppLayout.css:20-24`).

### 2. Pre-paint the callback load with the dashboard colour (boundary 4→5)

`index.html`'s inline `<style>` must stay blue for a **cold** load (a user
arriving at `/login` directly — the gradient is correct there) but must be
the dashboard colour on the **callback** load (`?code=` present), where the
destination is the dashboard and the login card is never shown.

Add a minimal inline `<script>` in `<head>`, before first paint, that tests
`location.search` for `code=` and, if present, sets a `data-callback`
attribute on `<html>`. The inline `<style>` gains a matching selector that
overrides the gradient with the flat dashboard colour.

An inline head script is blocking, but it is ~4 statements with no I/O; the
parser cost is negligible and it must run pre-paint to serve its purpose.

### 3. Declare `color-scheme` for the pre-paint window only (step 4, best effort)

Add `<meta name="color-scheme" content="light dark">` to `index.html`.

This is the only standards-defined influence over the UA's default canvas
during the inter-document window. In Chrome/Edge it makes that canvas dark
for dark-mode users instead of white. It does not make the canvas *blue* —
no mechanism does — but it removes the light/dark mismatch that is the worst
case of this bug.

**`global.css` must NOT declare `color-scheme`.** Verified during Phase 1:
the app renders `<CssBaseline enableColorScheme />` (`main.tsx:18`) against a
theme configured with `cssVariables: { colorSchemeSelector: 'class' }`
(`theme/theme.ts:43-45`), so MUI already emits `color-scheme` per colour
scheme and keeps UA widgets (scrollbars, form controls) matched to the
*app's* theme rather than the OS preference. Declaring it ourselves would
duplicate and potentially fight MUI, and would mis-style UA widgets for any
user whose in-app theme opposes their OS setting.

The division of responsibility is therefore: the meta tag governs the window
*before* any CSS loads (the flash); MUI governs everything after. They do not
overlap. `InitColorSchemeScript` (`main.tsx:16`) is rendered inside the React
tree, so it too only applies after mount — it cannot cover the pre-paint
window, which is why the meta tag is needed.

### 4. Lengthen the shell fade (step 6)

`200ms` is at the threshold of perception. Raise `app-shell-fade-in` to
`350ms` so the arrival reads as a deliberate transition rather than a cut,
completing the "flash becomes part of the fade" effect.

## Out of Scope

- **Popup-based auth flow.** Discussed with the user as the only approach
  that eliminates the navigation entirely (main window never unloads). It is
  a substantially larger change — popup-blocker handling, a new callback
  route, an Entra app-registration redirect URI, degraded iOS behaviour, and
  the silent-SSO path still needing the redirect. Not undertaken here.
- **Entra Company Branding.** Investigated and ruled out: it only styles a
  *rendered* sign-in page, and in this user's flow Entra renders nothing.
- **Making `/auth/login` a 302** to remove the step-2 XHR round trip. A real
  latency win but unrelated to colour; separate change.
- **Bundle code-splitting** — carried over as out of scope from
  `login_transition_smoothness_spec.md`.

## Implementation Steps

1. `frontend/src/pages/Login.css` — add `.login-container--leaving`
   (transition to `--slate-50`, light + `:root.dark` variants) and a
   `prefers-reduced-motion` guard.
2. `frontend/src/pages/Login.tsx` — add `leaving` state; apply the modifier
   class; in `handleLogin`, await the transition before assigning
   `window.location.href`; skip the wait under reduced motion.
3. `frontend/index.html` — add the `color-scheme` meta; add the pre-paint
   inline script setting `data-callback` on `<html>`; extend the inline
   `<style>` with the `[data-callback]` override for light and dark.
4. `frontend/src/components/layout/AppLayout.css` — `200ms` → `350ms`.

`frontend/src/styles/global.css` is deliberately **not** modified — see
section 3.

## Dependencies

None. Plain CSS, one small inline script, no new packages. No backend, auth,
Prisma, or shared-types changes.

## Configuration Changes

None. No env vars, no Prisma schema change, no MSAL/Graph scope change, no
Entra app-registration change.

## Risks and Mitigations

- **Risk:** the login card visibly washes out to near-white for 180ms before
  navigating. **Mitigation:** this is the deliberate trade that removes the
  boundary; it is a fade rather than a cut, and it is bounded and short.
  Accepted by the user in advance.
- **Risk:** up to 180ms added before the redirect starts.
  **Mitigation:** bounded, occupies otherwise-dead time after the XHR
  resolves, and is skipped entirely under `prefers-reduced-motion`.
- **Risk:** `color-scheme`'s effect on the inter-document canvas is
  browser-dependent and not guaranteed to cover every frame.
  **Mitigation:** documented as best-effort; steps 1, 2 and 4 do the actual
  work and do not depend on it. Flagged to the user, not claimed as certain.
- **Risk:** the `data-callback` script runs before React and could throw on
  an exotic URL, blocking the page. **Mitigation:** no parsing beyond a
  substring test on `location.search`; wrap in `try {}` so any failure
  degrades to the existing gradient rather than blocking first paint.
- **Risk:** dark-mode users whose in-app override opposes their OS preference
  still get a mismatched pre-paint. **Mitigation:** pre-existing and
  unchanged by this work; already documented at `index.html:15-21`.

## Verification

- Build: `docker compose -f docker-compose.dev.yml build frontend` must exit 0.
- Preflight: `scripts/preflight.ps1` must exit 0.
- Manual (user): click "Sign in with Microsoft" — the page washes to near-white,
  and the previously-white flash is no longer distinguishable from the fade
  into the dashboard. Verify in both light and dark mode.
- Manual (user): load `/login` directly with no `?code=` — the blue gradient
  still pre-paints as before (no regression to the cold-load case).

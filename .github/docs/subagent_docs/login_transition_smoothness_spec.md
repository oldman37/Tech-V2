# Spec: Smooth the visual transition from "Sign in with Microsoft" to Dashboard

## Current State Analysis

The full login round trip has three distinct visual stages, only the last of
which is a normal in-app SPA transition:

1. **Click "Sign in with Microsoft"** (`Login.tsx handleLogin` /
   `handleSilentLogin`) → `window.location.href = authUrl` — a **hard
   browser navigation** away from the app to Microsoft's hosted login UI.
   Not ours to smooth; expected, branded Microsoft UX.
2. **Microsoft redirects back** to `/login?code=...` via another **hard
   browser navigation** (a real HTTP 302, not client-side routing). This
   reloads `index.html` from scratch: blank page → download/parse/execute the
   JS bundle → React mounts → `Login` renders its "Authenticating..."
   spinner. Two things make this the most visually jarring stage:
   - `index.html` (`frontend/index.html`) sets no background color anywhere.
     Until CSS is parsed and the first React paint happens, the browser
     paints its UA default (white, or black in some dark-mode browser UAs) —
     a hard color flash against Login's actual gradient background
     (`Login.css:6-8` light / `Login.css:152-157` dark) once it finally
     applies.
   - `theme-color` meta tags already exist for light/dark
     (`index.html:6-7`) and cover the *browser chrome* (address bar tint),
     but nothing covers the *page* background for this same window.
3. **In-app handoff, Login → Dashboard** (`Login.tsx` → `navigate('/dashboard',
   { replace: true })`, already fixed to use `replace`): a normal SPA route
   swap. `Login`'s centered single-card layout
   (`.login-container`/`.login-card`, flat gradient background) unmounts and
   `AppLayout`'s full shell (sticky header, sidebar, main content;
   `background: var(--slate-50, #f8fafc)` — `AppLayout.css:3-8`) mounts in
   the same commit, with no transition. Two structurally very different
   layouts swapping instantly reads as a "flash" even though nothing is
   actually broken — there is no fade/cross-fade today.

## Problem Definition

- Stage 2 has an unstyled-content window (browser default background) before
  any of our CSS applies, on every login (not just first-ever) because the
  Microsoft round trip is a genuine full page reload each time.
- Stage 3 has no transition at all — an instant hard cut between two
  differently-styled, differently-structured layouts.

Both read as "flashing" to the user, compounding into the described
experience even though the console-level bugs (guaranteed 401,
history-manipulation warning) are now fixed.

## Proposed Solution

1. **Pre-paint background match** — add a small inline `<style>` block in
   `frontend/index.html`'s `<head>` that sets `html, body` background to
   match Login's gradient (light) with a `prefers-color-scheme: dark`
   override matching Login's dark gradient, mirroring the existing
   `theme-color` meta tags' light/dark split. This is plain CSS parsed
   before any JS runs, so the very first paint on the post-Microsoft hard
   reload is already the right color family instead of a stark white/black
   flash. (This approximates the OS-level preference only — it can't read
   an in-app dark-mode override stored in `localStorage` without a blocking
   script, which is out of scope here; the media-query approximation is the
   standard, low-risk mitigation for this exact CSR flash-of-default-style
   problem and covers the vast majority of users who haven't manually
   overridden the app's theme away from their OS preference.)
2. **Cross-fade the app shell on mount** — add a short (200ms), opacity-only
   `@keyframes` fade-in to `.app-shell` in `AppLayout.css`, guarded by
   `prefers-reduced-motion: reduce` (disabled for users who've asked for
   less motion). This turns the Login→Dashboard handoff into a soft
   appearance instead of an instant cut, directly addressing "smooth
   transition ... until the dashboard appears."

## Out of Scope (documented, not silently dropped)

- The production bundle is a single ~2.6MB (styling this specific
  transition of the code will not need it) JS chunk (`vite build` already
  warns about this — "chunks are larger than 500 kB after minification").
  Because Stage 2 is a genuine full page reload, that whole bundle must be
  re-parsed/re-executed before `Login`'s spinner can even paint. Browser HTTP
  cache usually makes the *download* nearly free on a same-session round
  trip, but parse/execute time is still real and not addressed by this fix.
  Eliminating it would mean route-level code-splitting — a much larger,
  separate architectural change, not undertaken here per Simplicity
  First / Surgical Changes.
- Any change to the Microsoft-hosted login UI itself (stage 1) — not ours to
  control.

## Implementation Steps

1. `frontend/index.html` — add an inline `<style>` block in `<head>` setting
   `html, body { background: <Login's light gradient> }` with a
   `@media (prefers-color-scheme: dark)` override matching Login's dark
   gradient.
2. `frontend/src/components/layout/AppLayout.css` — add a `fade-in`
   `@keyframes` animation to `.app-shell`, disabled under
   `prefers-reduced-motion: reduce`.

## Dependencies

None — plain CSS only, no new packages.

## Risks and Mitigations

- **Risk:** the pre-paint background could mismatch if a user has an
  in-app dark-mode override opposite their OS preference. **Mitigation:**
  the mismatch window is only the few hundred ms before React mounts and
  applies the correct themed background over top — strictly better than
  today (always wrong: stark white/black) even in the mismatched case, never
  worse.
- **Risk:** the fade-in animation could feel like added latency.
  **Mitigation:** kept short (200ms) and opacity-only (no layout shift, no
  delay to interactivity — the shell is already fully interactive during the
  fade).
- **Risk:** `prefers-reduced-motion` users get a jarring instant cut instead.
  **Mitigation:** that's the correct, expected behavior for that preference —
  matches how motion is already guarded elsewhere in the app's conventions.

## Verification

- Manual: full login round trip (click Sign in with Microsoft → Entra →
  back) — no stark white/black flash before the Login gradient appears; the
  Login→Dashboard handoff fades in rather than cutting instantly.
- Build: `docker compose -f docker-compose.dev.yml build frontend` must
  succeed.

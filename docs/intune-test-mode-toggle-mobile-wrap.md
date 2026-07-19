# Fix: Intune Test Mode toggle wraps letter-by-letter on mobile

**Status:** Fixed and verified in this repo (preflight passed).
**Where:** Intune Device Actions page, both tabs ("Scan / Search by Name"
and "by Model").

## Symptom

On narrow (mobile) viewports, the "Test Mode ON/OFF" switch label inside the
Dry Run warning banner breaks apart into a vertical stack of 1–2 character
fragments ("Te / st / Mo / de / OF / F") instead of staying readable. Reported
via screenshot on the "Choose Action" step of the scan wizard.

## Root cause

Both occurrences render the toggle as an MUI `Alert` with a `FormControlLabel`
(Switch + text label) passed through the `action` prop:

```tsx
<Alert severity={...} sx={{ mb: 2 }} action={<FormControlLabel ... />}>
  ...
</Alert>
```

`Alert`'s root is `display: flex` with the default `flex-wrap: nowrap`, and
its `action` slot has no `flex-shrink: 0`. On a narrow screen the long
message text (`"Test Mode is OFF — Actions WILL be performed on real
devices"`) claims most of the row, squeezing the action slot toward zero
width. Combined with this project's `global.css`, which sets
`overflow-wrap: break-word` broadly, the label `Typography`'s min-content
width collapses to roughly one character instead of one word — so instead of
overflowing or word-wrapping, it shatters mid-word across many lines.

## Fix

CSS-only (`sx` props), no logic/behavior change, no new dependency. Applied
identically in both locations since they share the exact same markup:

1. On the `Alert`, let the row wrap and pin the action slot so it can't
   shrink — instead of being squeezed, it drops to its own line as one
   intact block:
   ```tsx
   sx={{ mb: 2, flexWrap: 'wrap', '& .MuiAlert-action': { flexShrink: 0, pt: 0 } }}
   ```
2. On the label `Typography`, add a safety net so it's never mid-word
   wrapped regardless of container width:
   ```tsx
   <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
   ```

### Files changed

- `frontend/src/pages/DeviceManagement/IntuneScanWizardTab.tsx`
  (Tab 1 — "Scan / Search by Name" — the instance in the reported screenshot)
- `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx`
  (Tab 2 — "by Model" bulk flow — identical markup, identical bug)

### Exact diff (same shape in both files)

```diff
   <Alert
     severity={isDryRun ? 'info' : 'warning'}
-    sx={{ mb: 2 }}
+    sx={{ mb: 2, flexWrap: 'wrap', '& .MuiAlert-action': { flexShrink: 0, pt: 0 } }}
     action={
       <FormControlLabel
         control={
           <Switch
             checked={isDryRun}
             onChange={(e) => setIsDryRun(e.target.checked)}
             size="small"
             color={isDryRun ? 'primary' : 'warning'}
           />
         }
         label={
-          <Typography variant="body2" fontWeight={600}>
+          <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
             {isDryRun ? 'Test Mode ON' : 'Test Mode OFF'}
           </Typography>
         }
         labelPlacement="start"
         sx={{ mr: 0, ml: 0 }}
       />
     }
   >
     {isDryRun
       ? 'Test Mode is ON — No actions will be performed'
       : 'Test Mode is OFF — Actions WILL be performed on real devices'}
   </Alert>
```

## Verification performed

- `docker compose -f docker-compose.dev.yml build frontend` — `tsc && vite
  build` succeeded, no type errors.
- Full `scripts/preflight.ps1` — backend build, frontend build, and 38
  backend tests all passed (exit code 0).
- No behavior/state/prop change — purely visual.

## Local spec/review docs

- `.github/docs/subagent_docs/intune_test_mode_toggle_mobile_spec.md`
- `.github/docs/subagent_docs/intune_test_mode_toggle_mobile_review.md`

---

## Prompt for Claude — recreate this fix upstream

Paste the block below to a Claude instance working directly in the upstream
Tech-V2 repo (this fix was made in a local test copy and needs to be
reproduced there):

> In this repo, find the Intune Device Actions page's Dry Run / Test Mode
> toggle. It's rendered as an MUI `Alert` whose `action` prop is a
> `FormControlLabel` combining a `Switch` and a `Typography` label that reads
> `"Test Mode ON"` / `"Test Mode OFF"`, with `labelPlacement="start"`. This
> exact pattern appears in two places: the scan/search-by-name wizard's
> "Choose Action" step, and the by-model bulk flow's "Select Action" step
> (search the codebase for the string `Test Mode OFF` to locate both call
> sites — likely `IntuneScanWizardTab.tsx` and `IntuneDeviceActionsPage.tsx`
> under `frontend/src/pages/DeviceManagement/`, but confirm actual paths in
> this repo rather than assuming).
>
> Bug: on mobile/narrow viewports the switch's text label wraps
> character-by-character (e.g. "Test Mode OFF" renders as "Te / st / Mo / de
> / OF / F" stacked vertically) instead of staying on one line or wrapping as
> a whole unit. Root cause: MUI `Alert`'s flex row defaults to
> `flex-wrap: nowrap` and its `action` slot has no `flex-shrink: 0`, so on
> narrow screens the long alert message text squeezes the action slot toward
> zero width; if this project's global stylesheet applies
> `overflow-wrap: break-word` broadly (check for it, e.g. in a global CSS
> reset file), the label's min-content width collapses to roughly one
> character instead of one word, causing the mid-word wrapping.
>
> Fix, applied identically at every call site found: on the `Alert`'s `sx`
> prop, add `flexWrap: 'wrap'` and pin the action slot with
> `'& .MuiAlert-action': { flexShrink: 0, pt: 0 }` so it wraps to its own
> line as one block instead of shrinking; on the label `Typography`'s `sx`
> prop, add `whiteSpace: 'nowrap'` so it can never be split mid-word. This is
> a pure `sx`/styling change — no state, props, logic, or markup structure
> changes, and no new dependency.
>
> Follow this repo's own contribution workflow (spec → implement → review →
> build/test validation → commit message) if one is defined in its root
> CLAUDE.md or equivalent; otherwise implement directly, then run whatever
> build/typecheck and test commands this repo defines and confirm they pass
> before considering the fix complete.

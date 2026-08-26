# Spec: Update Status scrolls to the options, not to the submit button

## Current state analysis
`frontend/src/pages/WorkOrderDetailPage.tsx` lines 703-711:

```ts
// On mobile the "New Status" dropdown renders below the fold when it
// first appears - nudge it into view so the user doesn't have to
// scroll manually before selecting the next status.
const statusFieldRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (activeAction === 'status') {
    statusFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}, [activeAction]);
```

`statusFieldRef` is attached at line 1142 to the `Box` wrapping the status-specific
fields - the "New Status" chip row, plus the LONG_TERM "Notify the submitter" switch.

Below that block, still inside the composer, come the shared "Actions Taken" textarea, the
error `Alert`, and finally the Cancel / submit row at line 1233. The submit button's label
is driven by `composerLabel` (line 827) and reads "Update Status" while
`activeAction === 'status'`. That row is rendered unconditionally - it is present for every
composer mode, not just `status`.

## Problem definition
Tapping the "Update Status" chip on mobile scrolls only as far as the status options, so the
actual "Update Status" submit button is still below the fold. The user has to scroll again
to complete the action they already started.

## Proposed solution architecture
Move the scroll target from the status-options `Box` to the composer's submit row, so the
nudge lands on the last step rather than the first.

`block: 'nearest'` is kept deliberately:
- it performs the **minimum** scroll needed, so when the whole composer already fits on
  screen both the status chips and the button stay visible;
- it is a no-op when the target is already fully in view, which is why this effect is
  harmless on desktop and does not need a viewport guard (the same reason it has none today).

`statusFieldRef` becomes unused once the target moves, so it is renamed to
`composerSubmitRef` and re-attached rather than left as dead code.

## Implementation steps
1. Rename `statusFieldRef` -> `composerSubmitRef` and update the effect + comment.
   -> verify: no `statusFieldRef` identifier remains (grep).
2. Remove `ref={statusFieldRef}` from the status-fields `Box` (line 1142).
3. Attach `ref={composerSubmitRef}` to the Cancel/submit `Box` (line 1233).
   -> verify: exactly one `ref=` attachment for the new ref.
4. Frontend image build. -> verify: exits 0 (`noUnusedLocals` is on, so an orphaned ref
   variable would fail the build).

## Scope
Gated on `activeAction === 'status'` exactly as today. Change Priority, Assign To and
Request Input have never triggered this scroll and are left alone - the report was about
Update Status specifically. Extending it to the other three actions would be a one-word
change (drop the `=== 'status'` check) if wanted later.

## Dependencies
None. `useRef`/`useEffect` are already imported (line 14); `scrollIntoView` is already the
established mechanism in this file.

## Configuration changes
None. No backend, schema, or type change.

## Risks and mitigations
- Risk: on a short viewport the composer is taller than the screen, so scrolling the button
  into view pushes the status chips off the top. Mitigation: `block: 'nearest'` scrolls the
  minimum distance, so this only happens when the composer genuinely cannot fit - and in
  that case the user must scroll one way or the other regardless. Landing on the button is
  the better default, since the status chips sit directly above and a short scroll up
  reaches them.
- Risk: the ref reads a stale pre-expansion position. Mitigation: none needed - the submit
  row renders unconditionally, and the effect fires after the DOM has committed the newly
  expanded fields, which is why the existing effect already works.

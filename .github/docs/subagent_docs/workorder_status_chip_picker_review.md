# Work Order Detail — Colored Chip Status Picker (Review)

## Scope

- `frontend/src/components/work-orders/WorkOrderStatusChip.tsx`
- `frontend/src/pages/WorkOrderDetailPage.tsx`

## Spec Compliance

- `STATUS_COLOR` exported from `WorkOrderStatusChip.tsx` with no other change
  to that component. ✔ matches spec.
- `Select`/`MenuItem`/`FormControl`/`InputLabel` block for "New Status"
  replaced with a `Typography` label + `Box` row of `Chip`s, filtered by the
  same `ALLOWED_NEXT_STATUSES` logic as before. ✔ matches spec.
- Each chip: `color={STATUS_COLOR[s.value]}`, `variant` toggles
  filled/outlined on selection, `clickable`, `onClick` calls `setNewStatus`,
  `aria-pressed` reflects selection. ✔ matches spec.
- `newStatus` state, its initialization effect, `statusFieldRef` scroll
  effect, `notifySubmitter` switch, `STATUS_KEY_LEGEND` block, and
  `handleStatusSubmit` all untouched. ✔ matches spec — confirmed via diff,
  no lines outside the target block changed.
- `FormControl`/`InputLabel`/`Select`/`MenuItem` imports retained (still used
  by the "New Priority" field, `WorkOrderDetailPage.tsx:1145-1158`) — no
  orphaned imports. ✔.

## Best Practices / Consistency

- Reuses the existing `STATUS_COLOR` map rather than duplicating the
  status→color mapping — consistent with the "surgical, no duplication"
  principle and with how `WorkOrderPriorityChip` already does the same for
  priority.
- Filled-vs-outlined selection convention mirrors the existing
  `WorkOrderStatusChip` pattern (`CLOSED` outlined, others filled) so the
  "state = filled" reading is consistent app-wide, not a one-off rule.
- Label typography (`variant="caption" color="text.secondary"`) matches the
  legend block directly below it in the same file.

## Maintainability

- No new component/file; the block stays inline consistent with how the
  status/priority/assign composer fields are already written directly in
  `WorkOrderDetailPage.tsx`.
- Chip row logic is a straight `map` over the same filtered array the
  `Select` used — no added branching or state.

## Security

- No new mutating endpoints, no change to what's sent on submit
  (`handleStatusSubmit` unchanged) — CSRF/auth posture unchanged.
- No Graph/Entra data touched.

## Accessibility

- `Chip` with `onClick`/`clickable` renders as a keyboard-focusable,
  activatable control (MUI wraps it with `ButtonBase` semantics).
- `aria-pressed` communicates selected state to assistive tech, replacing the
  listbox semantics lost with `Select`.
- Selection is distinguished by both fill/outline *and* the persistent text
  label — not color alone (colorblind-safe).

## Performance

- No behavior change to data fetching or mutation calls; same render cost
  class as the previous `Select`/`MenuItem` list (≤4 items).

## Build Validation

Command run (frontend-only change; matches spec's "no dependency" scope):

```
docker compose -f docker-compose.dev.yml build frontend
```

Result: **success**. `tsc` type-check passed, `vite build` completed
(`✓ built in 1.89s`), image exported successfully. No new TypeScript errors,
no new build warnings beyond pre-existing, unrelated ones
(`INEFFECTIVE_DYNAMIC_IMPORT` on `src/services/api.ts`, chunk-size notice —
both present before this change and out of scope).

Backend was not touched by this change, so the backend image build was not
re-run for this review; full `scripts/preflight.ps1` (both images) will run
at Phase 6 regardless.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Revision — Composer-Specific Chip Colors

Per user feedback, the picker's color scheme was changed from reusing
`STATUS_COLOR` (the status-badge palette) to a composer-local scheme:

- `ON_HOLD` unselected → `warning` (amber/yellow), `CLOSED` unselected →
  `error` (red) — via a new local `STATUS_CHIP_COLOR` map
  (`WorkOrderDetailPage.tsx`).
- `OPEN` / `IN_PROGRESS` / `LONG_TERM` unselected → `default` (neutral gray
  outline, via `STATUS_CHIP_COLOR[s.value] ?? 'default'`).
- Any selected chip → `primary` (this theme's blue), `variant="filled"`,
  overriding its own unselected color — confirmed against
  `theme.ts` (`primary.main: #3b82f6` light / `#60a5fa` dark).

**Compliance check:**
- `STATUS_COLOR` export reverted in `WorkOrderStatusChip.tsx` (confirmed via
  grep: no remaining importer). ✔ no orphaned export.
- `STATUS_COLOR` import removed from `WorkOrderDetailPage.tsx`; `ChipProps`
  type-only import added for the new local color map's typing. ✔ no unused
  imports.
- `warning`/`error` reused from MUI's built-in Chip color palette rather than
  new hex values — consistent with existing `color="warning"` usage already
  in this same file (`WorkOrderDetailPage.tsx:250,874`, pre-existing lines).
  ✔ no new colors introduced.
- Selection logic (`newStatus === s.value`) unchanged from the prior
  revision — only the color/variant expressions changed. ✔ surgical.

**Build re-validated:** `docker compose -f docker-compose.dev.yml build
frontend` — success, `tsc` and `vite build` both passed, no new warnings.

## Revision 2 — In Progress (green) / Long Term (blue)

Per further user feedback, `STATUS_CHIP_COLOR` extended:
- `IN_PROGRESS` unselected → `success` (green text/outline).
- `LONG_TERM` unselected → `primary` (blue text/outline) — same token used
  for the "selected" state. Flagged to the user: this means an unselected
  Long Term chip and a selected chip of any status share the same blue hue;
  they remain visually distinct only via `variant` (`outlined` vs.
  `filled`). User was informed and asked to proceed as specified.
- `ON_HOLD` (`warning`) and `CLOSED` (`error`) unchanged from Revision 1.
- `OPEN` still falls back to `default` (neutral gray) — untouched.

No change to selection logic, imports, or any other part of the composer.
Single-file change: `WorkOrderDetailPage.tsx`.

**Build re-validated:** `docker compose -f docker-compose.dev.yml build
frontend` — success, `tsc` and `vite build` both passed, no new warnings.

## Revision 3 — Action Row (Update Status / Change Priority / Assign To /
Request Input) Converted to Chips

Per user request, the four composer action-toggle controls
(`WorkOrderDetailPage.tsx`, action button row above the status/priority/
assign/request-input fields) were converted from `Button` (always
`variant="contained"`, manual icon `sx={{ mr: 0.75 }}` spacing) to `Chip`,
matching the status picker's established style:

- `icon={<...Icon fontSize="small" />}` — Chip's built-in icon slot replaces
  the manual icon-then-label-with-margin layout, fixing icon/label spacing
  without a hand-tuned margin.
- `variant={activeAction === '<x>' ? 'filled' : 'outlined'}`,
  `color={activeAction === '<x>' ? 'primary' : 'default'}` — the active
  toggle reads as solid blue (same primary color used everywhere else in
  this composer for "active/selected"); inactive ones are a neutral outlined
  chip instead of all four always being solid blue regardless of state
  (previous `Button` version had no active/inactive visual distinction).
- `aria-pressed={activeAction === '<x>'}` added for consistency with the
  status chip picker's accessibility treatment.
- Layout unchanged: `Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}`
  — same even `gap` spacing already used for the status picker, now applied
  uniformly across all chip rows in this composer.
- `Button` import retained — still used by other controls in this file
  (submit/cancel/save buttons; verified via grep, 9 remaining usages).

**Build re-validated:** `docker compose -f docker-compose.dev.yml build
frontend` — success, `tsc` and `vite build` both passed, no new warnings.

## Revision 4 — Action Row Chips: Blue Outline Instead of Default Gray

The action-row chips' inactive state used `color="default"`, rendering as a
dark/gray outlined chip that blended into surrounding body text — user
feedback: "black chip card they do not stand out." Presented three options
(blue-outline same family, light-gray filled pill, distinct color per
action); user chose **blue outline, same family as active**.

Change: `color={activeAction === '<x>' ? 'primary' : 'default'}` simplified
to a constant `color="primary"` on all four action chips (both branches now
evaluate to the same value, so the ternary was redundant — removed per
Simplicity First). `variant` still toggles `filled` (active) vs. `outlined`
(inactive), so state is now shown by fill vs. outline within the same blue
color family, and inactive chips read as blue-outlined/blue-text instead of
gray/black — no longer blending into body text.

No other logic changed. Same single-file scope: `WorkOrderDetailPage.tsx`.

**Build re-validated:** `docker compose -f docker-compose.dev.yml build
frontend` — success, `tsc` and `vite build` both passed, no new warnings.

## Revision 5 — Change Priority Converted to Chip Picker

Per user request, the "New Priority" field (`activeAction === 'priority'`)
converted from `Select`/`MenuItem` to the same chip-picker style as the
status field, following the same color layout (selected = solid blue
`primary`; unselected = per-item semantic color):

- `PRIORITY_COLOR` exported from `WorkOrderPriorityChip.tsx` (mirrors the
  export/reuse pattern used for the status picker in Revision 1, this time
  kept rather than reverted since it directly satisfies the requirement).
- Reused rather than invented: `PRIORITY_COLOR` already maps
  `LOW → priorityLow (#15803d green)`, `MEDIUM → priorityMedium (#a16207
  amber)`, `HIGH → priorityHigh (#c2410c orange)`,
  `URGENT → priorityUrgent (#dc2626 red)` — an existing severity ramp from
  the theme, already used by the read-only `WorkOrderPriorityChip` badge.
  Satisfies the explicit "Urgent = red outline" requirement with zero new
  colors; Low/Medium/High's increasing green→amber→orange progression was
  left as-is per "I will leave up to you to stress their importance."
- `color={newPriority === p.value ? 'primary' : PRIORITY_COLOR[p.value]}`,
  `variant={newPriority === p.value ? 'filled' : 'outlined'}`,
  `aria-pressed` — identical pattern to the status chip picker.
- `FormControl`, `InputLabel`, `Select`, `MenuItem` imports removed from
  `WorkOrderDetailPage.tsx` — grep-confirmed no remaining usages anywhere in
  the file after this conversion (status picker had already dropped its own
  use of these in Revision 1; priority was the last consumer).
  `FormControlLabel` (a distinct import, used by the notify-submitter
  switch) is untouched.

**Build re-validated:** `docker compose -f docker-compose.dev.yml build
frontend` — success, `tsc` (confirms no unused-import/type errors from the
import removal) and `vite build` both passed, no new warnings.

## Result

**PASS** — proceeding to Phase 6 (Preflight).

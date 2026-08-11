# Work Order Mobile Card Accordion — Spec

## Current State Analysis

The mobile Work Orders list (`WorkOrderListPage.tsx`) renders `ResponsiveTable`
with `collapsible` set (`WorkOrderListPage.tsx:615`). On mobile,
`ResponsiveTable` (`components/responsive/ResponsiveTable.tsx:204-218`) maps
each row to a `MobileCard` (`components/responsive/MobileCard.tsx`).

`MobileCard` owns its own expand/collapse state internally:

```tsx
const [expanded, setExpanded] = useState(false);
```

Because this state is local to each card instance, tapping to open one card
has no effect on any other card's state — multiple cards can be expanded
simultaneously. The user wants accordion behavior: opening a card closes
whichever card was previously open.

`collapsible` is currently only consumed by `WorkOrderListPage.tsx` (verified
via repo-wide grep), so this is effectively a single-consumer shared
component today — no other page's behavior is at risk, but the fix should
stay generic since the component is shared (`components/responsive/`).

`ResponsiveTable` already tracks expand state for a *different* feature (the
desktop "show hidden columns" expand row) via `expandedKeys: Set<string |
number>` (`ResponsiveTable.tsx:124`). That state is unrelated to mobile card
collapse and must not be reused/conflated — it's a Set because multiple
desktop rows can have their hidden-column row open at once (no accordion
requirement there, not part of this task, do not change it).

## Problem Definition

On mobile, opening a new work order card does not close the previously
opened card. Expected: only one card open at a time (accordion) — opening a
card collapses any other currently-open card.

## Proposed Solution

Lift the expand/collapse state out of `MobileCard` and into `ResponsiveTable`
(the parent that renders the list of cards), mirroring the existing pattern
already used for the desktop expand row. Track a single active key instead of
a Set, since only one mobile card may be open at a time:

- `ResponsiveTable`: add `mobileExpandedKey: string | number | null` state
  (mobile-only, separate from the existing `expandedKeys` Set used by the
  desktop branch). Pass each row's `expanded` state and a `toggle` callback
  down to `MobileCard` as props.
- `MobileCard`: change from owning `useState(false)` to being a controlled
  component — accept `expanded: boolean` and `onToggle: () => void` props,
  used only when `collapsible` is set. No internal expand state remains.

This is a pure state-lifting refactor: no new props on `Column`, no CSS
changes (existing `.mobile-card--collapsible` / `--expanded` classes still
apply the same way), no change to non-collapsible usage (`MobileCard` is only
ever used inside `ResponsiveTable`, so there are no other callers to update).

### Toggle semantics

`setMobileExpandedKey(prev => prev === key ? null : key)` — tapping the
already-open card closes it (unchanged behavior); tapping a different card
opens it and implicitly closes whatever was open (new behavior); tapping a
closed card while another is open opens the tapped one and closes the other.

## Implementation Steps

1. `frontend/src/components/responsive/MobileCard.tsx`
   - Remove `const [expanded, setExpanded] = useState(false)`.
   - Add `expanded?: boolean` and `onToggle?: () => void` to
     `MobileCardProps<T>`.
   - `handleClick` uses `onToggle` when `collapsible` is set, instead of
     calling local `setExpanded`.
   - Remove now-unused `useState` import if nothing else in the file needs
     it (it doesn't).
2. `frontend/src/components/responsive/ResponsiveTable.tsx`
   - Add `const [mobileExpandedKey, setMobileExpandedKey] = useState<string |
     number | null>(null);` near the existing `expandedKeys` state.
   - In the mobile render branch, pass
     `expanded={mobileExpandedKey === getRowKey(row)}` and
     `onToggle={() => setMobileExpandedKey((prev) => (prev === getRowKey(row) ? null : getRowKey(row)))}`
     to each `MobileCard`.
   - Only meaningful when `collapsible` is true; harmless no-op otherwise
     since `MobileCard` only reads `expanded`/`onToggle` when `collapsible`.

## Dependencies

None — no new packages. Pure React state lifting using patterns (`useState`,
controlled child components) already used elsewhere in this exact file.
No version-sensitive API surface touched (React 19 `useState` usage is
unchanged from existing local usage in the same file), so no external
documentation lookup is required per the Dependency & Documentation Policy
("internal code changes with no new dependencies").

## Configuration Changes

None. No env vars, Prisma schema, or MSAL/Graph scopes involved.

## Risks & Mitigations

- **Risk:** Breaking the non-collapsible `MobileCard` usage elsewhere.
  **Mitigation:** Verified via grep that `collapsible` (and thus `expanded`
  usage) has exactly one consumer today (`WorkOrderListPage.tsx`). The
  `expanded`/`onToggle` props are optional and unused when `collapsible` is
  falsy.
- **Risk:** Losing the "tap open card again to close it" behavior.
  **Mitigation:** Toggle logic explicitly handles the same-key case (see
  Toggle semantics above), preserving current behavior for that path.
- **Risk:** Desktop expand-row behavior regressing.
  **Mitigation:** `expandedKeys` (desktop) is left completely untouched; a
  new, separate `mobileExpandedKey` state is added instead of reusing it.

## Build/Validation Commands Approved for Phase 3 / Phase 6

- `docker compose -f docker-compose.dev.yml build frontend` (Phase 3 — this
  change is frontend-only)
- `scripts/preflight.ps1` (Phase 6 — builds both backend and frontend;
  backend is unaffected but the script runs unconditionally per project
  convention)

No FORBIDDEN COMMANDS are required for this change.

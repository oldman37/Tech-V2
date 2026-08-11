# Spec: Auto-focus list-page search fields

## Current state analysis

Verified directly against this repo (not assumed from the source document):

- No shared search-input component exists. Search fields are implemented ad hoc
  in three shapes, confirmed by direct inspection:
  - **Shape A — native `<input className="form-input">`** (accepts `ref`):
    `InventoryManagement.tsx:562`, `Users.tsx:500`, `EquipmentSearch.tsx:563`,
    `DisposedEquipment.tsx:417`, and the shared `CrudTableShell` function
    (`ReferenceDataManagement.tsx:105`, used by all 8 tabs).
  - **Shape B — MUI v7 `<TextField size="small">`** (accepts `inputRef`): the
    other 13 target pages, confirmed via `placeholder="Search…"` grep.
  - **Shape C — `MobileFilterBar`** (`components/responsive/MobileFilterBar.tsx`):
    a separate mobile-only component (`searchPlaceholder` prop), coexists
    alongside Shape B's desktop `TextField` on every one of those 13 pages
    (confirmed: each has both a `searchPlaceholder=` and a desktop
    `placeholder=` line).
- `useIsMobile()` exists at `frontend/src/hooks/useResponsive.ts`, backed by
  `useMediaQuery('(max-width:768px)')` — matches `BREAKPOINTS.mobile = 768`.
- `ReferenceDataManagement.tsx`: `CrudTableShell` (function, not a separate
  file) is rendered once per active tab via `TabPanel`'s
  `{value === index && children}` (line 63) — exactly one instance mounted at
  a time, confirmed by reading the component.
- `ProvisioningPage.tsx`: the audit-log search field (line 1696) lives inside
  `AuditLogSection()` (function starting line 1609), a sub-component rendered
  by the default-exported `ProvisioningPage` (line 1920) — not the page
  component itself.
- `DeviceManagement/DeviceSearchPanel.tsx` already owns focus management via
  `scanRef` (`.focus()` called on mount and after each scan, lines 40/77/87) —
  confirmed as a pre-existing focus owner, correctly excluded.
- Import convention per target file (`@/hooks/…` vs. relative `../hooks/…`)
  verified per file by grepping each file's existing hooks import — recorded
  per file below.

## Problem definition

List-page search fields start unfocused on every page load and on every
return-navigation from a detail page, forcing an extra click before typing.

## Proposed solution

One shared hook, `useAutoFocusSearch()`, returning a callback ref. Attach it
per call site (`ref` for Shape A native inputs, `inputRef` for Shape B MUI
`TextField`s). No shared component exists to centralize this in one place, so
per-call-site wiring is correct, matching the existing ad hoc pattern.

### Hook behavior
- Callback ref (not `useRef` + `useEffect`) — some pages render the search
  field only after a loading state resolves; a mount-time effect would see a
  null ref and do nothing on those pages.
- `hasFocused` ref guards a single focus claim per mount — never steals focus
  back after the user clicks away; naturally re-fires on route re-mount
  (React Router unmounts/remounts page components on navigation in this app).
- Skips focus when `useIsMobile()` is true OR `matchMedia('(pointer: coarse)')`
  matches (covers tablets wider than 768px). A device with both a mouse and a
  touchscreen reports `pointer: fine` and still autofocuses.
- `node.focus({ preventScroll: true })` then `node.select()`.

### New file
`frontend/src/hooks/useAutoFocusSearch.ts` — full implementation:

```ts
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
```

### Call sites (18 pages), import convention verified per file

Shape A (`ref={searchRef}` on the native input):
- `frontend/src/pages/InventoryManagement.tsx` — relative `../hooks/`
- `frontend/src/pages/Users.tsx` — `@/hooks/`
- `frontend/src/pages/EquipmentSearch.tsx` — relative `../hooks/`
- `frontend/src/pages/DisposedEquipment.tsx` — relative `../hooks/`
- `frontend/src/pages/ReferenceDataManagement.tsx` — relative `../hooks/`
  (hook called once inside `CrudTableShell`, ref attached to its one
  `<input>`; covers all 8 tabs through the single shared shell)

Shape B (`inputRef={searchRef}` on the MUI `TextField`):
- `frontend/src/pages/RoomManagement.tsx` — relative `../hooks/`
- `frontend/src/pages/WorkOrderListPage.tsx` — `@/hooks/`
- `frontend/src/pages/incidents/IncidentsPage.tsx` — `@/hooks/`
- `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` — `@/hooks/`
- `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` — `@/hooks/`
- `frontend/src/pages/RoomAssignments/RoomAssignmentsPage.tsx` — `@/hooks/`
- `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` — `@/hooks/`
- `frontend/src/pages/Transportation/TransportationUnitsPage.tsx` — `@/hooks/`
- `frontend/src/pages/DeviceManagement/RepairTicketsPage.tsx` — `@/hooks/`
- `frontend/src/pages/DeviceManagement/InvoicesPage.tsx` — `@/hooks/`
- `frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx` — `@/hooks/`
  (NOTE: this file is also touched by the separate Checked-Out-Carts search
  bug fix, done as its own item later in this session. This autofocus change
  only adds an import/hook-call/`inputRef` — it does not touch the `onChange`
  handler or `setFilters` calls, so the two changes do not conflict.)
- `frontend/src/pages/admin/ProvisioningPage.tsx` — `@/hooks/` (hook call and
  ref attached inside `AuditLogSection()`, the sub-component that actually
  owns the field — not the outer `ProvisioningPage`)
- `frontend/src/pages/admin/AdminEmailQueueTab.tsx` — `@/hooks/`

### Explicitly excluded (confirmed by inspection, not just doc's word)
- `MobileFilterBar.tsx` — mobile-only.
- `DeviceSearchPanel.tsx` — already owns `scanRef` focus.
- Autocomplete/typeahead inputs inside dialogs, forms, and wizards.
- Scan/checkout workflow pages already using MUI `autoFocus` on their intended
  first field.

## Dependencies
None new. React 19 callback-ref semantics (a ref callback may return a cleanup
function; called with `null` on detach) are unaffected since this hook returns
nothing and null-guards.

## Configuration changes
None (no env vars, no schema, no API).

## Risks and mitigations
- **Risk:** stealing focus from a field the user already interacted with on
  fast re-renders. **Mitigation:** `hasFocused` ref claims focus exactly once
  per mount.
- **Risk:** popping mobile keyboard on load. **Mitigation:** `useIsMobile()` +
  `pointer: coarse` guard.
- **Risk:** conflicting with `CheckedOutCartsPage.tsx`'s separate search-bug
  fix later in this session. **Mitigation:** this change touches only an
  import, a hook call, and an `inputRef` prop — no overlap with that fix's
  `onChange`/`setFilters` lines.

## Build validation commands (Phase 3/6, per CLAUDE.md constraints)
- `docker compose -f docker-compose.dev.yml build frontend` (authoritative:
  catches any out-of-scope `searchRef` or mistyped ref/inputRef).
- Full `scripts/preflight.ps1` at Phase 6.

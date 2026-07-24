# Spec: Upstream UI Fixes — Refresh Button Style, Bell Icon Push Status, Mobile Header Overflow

## Source

Three fix write-ups were supplied by the user, each documenting a bug found and
fixed in a separate local test copy of this repo, with root-cause analysis,
exact diffs, and a "recreate upstream" prompt:

1. `inventory-refresh-button-style.md`
2. `bell-icon-push-status-indicator.md`
3. `mobile-header-notification-icon-overflow.md`

Phase 1 research consisted of verifying, file-by-file, that this repo
(upstream) matches the pre-fix state each doc assumes. All target files were
located at the exact paths named in the docs and read in full:

- `frontend/src/pages/InventoryManagement.tsx`
- `frontend/src/services/pushService.ts`
- `frontend/src/components/layout/AppLayout.tsx`
- `frontend/src/components/layout/AppLayout.css`
- `frontend/src/pages/NotificationSettings.tsx`

Current content matches the "before" state of every diff (confirmed via
direct `Read`, not assumed):
- `InventoryManagement.tsx` Refresh buttons (lines 364, 372) use
  `className="btn btn-ghost btn-sm"`; sibling Import/Export/Add Item buttons
  use `btn btn-secondary` / `btn btn-primary`. `global.css` confirms
  `.btn-ghost` (transparent bg, blue text, transparent border) and `.btn-sm`
  (reduced padding/font-size) are visually distinct from `.btn-secondary`
  (white bg, bordered).
- `AppLayout.tsx` renders a hardcoded `<NotificationsActiveIcon />` (line 297)
  with no state behind it; `pushService.ts` has no shared status helper;
  `NotificationSettings.tsx` tracks `enabled` via local `useState`, no
  `queryClient` usage.
- `AppLayout.css`'s `@media (max-width: 768px)` block (line 262) does not
  reduce `.shell-header` padding, `.shell-header-right` gap, `.shell-logo-full`
  height, or icon-button padding — matching the doc's described overflow
  cause. `.shell-header` uses flat `padding: 0 2rem` and `.shell-header-right`
  uses flat `gap: 1.25rem` at all viewport widths.

Dependency check: `frontend/package.json` confirms `@tanstack/react-query`
`^5.90.16` is installed. The v5 object-argument `useQuery`/`useQueryClient`/
`invalidateQueries({ queryKey })` API is already exercised throughout
`frontend/src/hooks/queries/*` and `frontend/src/hooks/mutations/*`, and
`CartPanel.tsx` already calls `queryClient.invalidateQueries({ queryKey: [...] })`
after a mutation — confirming the exact pattern fix 2 will reuse. No new
dependency is introduced; the Dependency & Documentation Policy's exemption
for "changes using only dependencies already exercised elsewhere in the
codebase" applies, so no external doc lookup was required.

## Problem definition (3 independent bugs)

1. **Inventory Management Refresh button style mismatch** — the Refresh
   button in the Inventory Management toolbar (desktop and mobile layouts)
   uses `btn btn-ghost btn-sm`, rendering as a borderless blue text link at a
   smaller size than its siblings Import/Export/Add Item, which all use
   `btn btn-secondary`/`btn btn-primary` (bordered/filled, default size).

2. **Header bell icon doesn't reflect push notification status** — the
   notification-settings bell icon in `AppLayout.tsx`'s header always renders
   the same `NotificationsActiveIcon` regardless of whether push is enabled
   on the current device. `NotificationSettings.tsx` already computes this
   state locally but it isn't shared with the header, which wraps every page.

3. **Notification icon pushes Logout button off-screen on mobile** — adding
   the bell icon to `.shell-header-right` (already present in this repo, per
   bug 2's starting state) made the mobile header (≤768px) overflow the
   viewport width, since `AppLayout.css`'s existing mobile media query never
   shrinks the header's own padding, the right-hand group's gap, the logo
   size, or the icon buttons' MUI default padding.

Note: bug 3's fix targets the same two icon buttons (notification settings,
dark-mode toggle) that bug 2 modifies. Both will be implemented together in
`AppLayout.tsx`/`AppLayout.css` in a single pass — bug 2 changes what the
bell icon renders, bug 3 changes how much horizontal space the icon buttons
and surrounding header chrome consume on mobile. They are independent CSS
concerns and don't conflict.

## Proposed solution / implementation steps

All 3 fixes are applied per the source docs' diffs, adapted only for this
repo's actual line numbers/content (already confirmed to otherwise match):

1. **`InventoryManagement.tsx`** — change both Refresh `<button>`
   `className` values (mobile layout at line 364, desktop layout at line 372)
   from `"btn btn-ghost btn-sm"` to `"btn btn-secondary"`, matching the
   existing Import/Export buttons on the same page. No new CSS. No behavior
   change (`onClick={() => refetch()}` untouched).

2. **`pushService.ts`** — add `PUSH_STATUS_QUERY_KEY` (a stable TanStack
   Query key constant) and an exported async `isPushEnabled()` helper that
   returns `false` early if `!isPushSupported()` or
   `Notification.permission !== 'granted'`, otherwise resolves
   `(await getCurrentSubscription()) !== null` — reusing the existing
   `getCurrentSubscription()` export, no reimplementation.
   **`AppLayout.tsx`** — import `useQuery` from `@tanstack/react-query` and
   `PUSH_STATUS_QUERY_KEY`/`isPushEnabled` from `pushService.ts`; add
   `const { data: pushEnabled } = useQuery({ queryKey: PUSH_STATUS_QUERY_KEY, queryFn: isPushEnabled, staleTime: 60_000 })`
   inside the component; replace the hardcoded `<NotificationsActiveIcon />`
   with a conditional: `<NotificationsActiveIcon color="success" />` when
   `pushEnabled` is true, else `<NotificationsNoneIcon />` (new import from
   `@mui/icons-material/NotificationsNone`) — this single "not active" look
   covers disabled/denied/unsupported/loading per the source doc.
   **`NotificationSettings.tsx`** — import `useQueryClient` from
   `@tanstack/react-query` and `PUSH_STATUS_QUERY_KEY` from `pushService.ts`;
   in `handleToggle`, after `await refresh()` following a successful
   subscribe/unsubscribe, call
   `await queryClient.invalidateQueries({ queryKey: PUSH_STATUS_QUERY_KEY })`
   so the header updates immediately — same invalidation pattern already used
   in `CartPanel.tsx`.

3. **`AppLayout.tsx`** — add `className="shell-header-icon-btn"` to both the
   notification-settings `IconButton` and the dark-mode-toggle `IconButton`
   (the hamburger button already has its own `hamburger-btn` class, left
   as-is).
   **`AppLayout.css`** — inside the existing `@media (max-width: 768px)`
   block, add:
   - `.shell-header { padding: 0 0.75rem; }`
   - `.shell-header-right { gap: 0.375rem; }`
   - `.shell-logo-full { height: 30px; }`
   - `.shell-header-icon-btn.MuiIconButton-root { padding: 6px; }`
   - `.hamburger-btn { padding: 6px; }`

   All new rules are nested inside the pre-existing `max-width: 768px` query,
   so the `min-width: 769px` desktop block and every other selector are
   untouched. `.shell-header-icon-btn` is inert above that breakpoint.

## Dependencies

None — `@tanstack/react-query` v5 and `@mui/icons-material` are both already
installed and already used in this exact pattern elsewhere in the app
(query hooks in `frontend/src/hooks/queries/*`, invalidation in
`CartPanel.tsx`, icon imports throughout `AppLayout.tsx`).

## Configuration changes

None — no env vars, no Prisma schema changes, no Graph/MSAL scope changes.

## Risks and mitigations

- **Risk:** `isPushEnabled()` throws if `navigator.serviceWorker` isn't ready
  in some browser state → **Mitigation:** it early-returns `false` before
  touching `getCurrentSubscription()` unless support + permission are both
  confirmed, matching the existing guard shape in `getCurrentSubscription()`
  itself.
- **Risk:** new `useQuery` call in `AppLayout.tsx` (mounted on every page)
  adds overhead → **Mitigation:** `queryFn` is a local
  `navigator.serviceWorker`/`pushManager` check, not a network call;
  `staleTime: 60_000` prevents refetching on every render/navigation.
- **Risk:** mobile CSS padding reductions drop icon buttons below
  accessible touch-target size → **Mitigation:** 6px padding around a 24px
  MUI icon yields a 36px hit area, at/above MUI's minimum guidance; matches
  the exact values already verified in the source doc's own testing.
- **Risk:** `.shell-header-icon-btn` or new mobile rules leak into desktop →
  **Mitigation:** every new selector is nested inside the existing
  `@media (max-width: 768px)` block; the class itself carries no styling
  outside that block.

## Build/validation commands to be used in Phase 3/6

- `docker compose -f docker-compose.dev.yml build frontend`
- `scripts/preflight.ps1` (Phase 6 gate — also covers backend build, unaffected
  by these changes but run for parity)

No FORBIDDEN COMMANDS are used at any point.

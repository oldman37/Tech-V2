# Spec: Show Role Label Under Dashboard Welcome Message on Mobile/PWA

## 1. Current State Analysis

`frontend/src/components/layout/AppLayout.tsx:279-284` renders `user.roleLabel` (added in the
prior session — see `user_role_label_header_spec.md`) in the header's `.shell-user-info` block.
`frontend/src/components/layout/AppLayout.css:262-289`'s `@media (max-width: 768px)` block sets
`.shell-user-info { display: none; }` — this is the same breakpoint the app already uses to mean
"mobile / PWA view" elsewhere (see comment at `AppLayout.css:260-261` referencing
`pwa_mobile_view_stuck_desktop_v2_spec.md`). So on mobile/PWA, the whole name+role+email block —
including the role label — is currently hidden, which the user confirmed is fine for the header.

`frontend/src/pages/Dashboard.tsx:64-68` renders the page header:
```tsx
<div className="page-header">
  <h2 className="page-title">Welcome, {user?.firstName || user?.name}</h2>
  <p className="page-description">School Works Management Portal</p>
</div>
```
`frontend/src/pages/Dashboard.css` already has a `@media (max-width: 768px)` block (line 148) using
the identical breakpoint.

## 2. Problem Definition

On mobile/PWA (≤768px), the role label should appear under "Welcome, {name}" on the Dashboard
instead of nowhere. On desktop (>768px) it must not be duplicated there, since it's already shown
in the header.

## 3. Proposed Solution Architecture

**`frontend/src/pages/Dashboard.tsx`** — render the label between the title and description,
guarded the same way the header does (`user?.roleLabel &&`):
```tsx
<div className="page-header">
  <h2 className="page-title">Welcome, {user?.firstName || user?.name}</h2>
  {user?.roleLabel && <p className="page-role-label">{user.roleLabel}</p>}
  <p className="page-description">School Works Management Portal</p>
</div>
```

**`frontend/src/pages/Dashboard.css`** — hidden by default (desktop), shown only at the existing
mobile breakpoint:
```css
.page-role-label {
  display: none;
  color: var(--slate-600);
  font-size: 0.9375rem;
  font-weight: 600;
  margin: -0.25rem 0 0.5rem;
}
```
Add `.page-role-label { display: block; }` inside the existing `@media (max-width: 768px)` block
(line 148) alongside the other mobile overrides already there.

## 4. Implementation Steps

1. `frontend/src/pages/Dashboard.tsx`: add the conditional `<p className="page-role-label">`.
2. `frontend/src/pages/Dashboard.css`: add the base (hidden) rule and the mobile-breakpoint
   override.
3. Verify: `docker compose -f docker-compose.dev.yml build frontend`.

## 5. Dependencies

None new — reuses `user.roleLabel` (already on the frontend `User` type) and the existing
`--slate-600` CSS variable / 768px breakpoint already used throughout both files.

## 6. Configuration Changes

None.

## 7. Risks and Mitigations

- **Risk:** Label shows on both header and Dashboard at some in-between viewport width if the
  breakpoints ever diverge. **Mitigation:** both use the exact same `max-width: 768px` value,
  matching the project's established single "mobile/PWA" breakpoint.

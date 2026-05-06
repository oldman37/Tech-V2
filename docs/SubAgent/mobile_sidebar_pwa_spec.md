# Mobile Sidebar & PWA Implementation Specification

## 1. Current State Analysis

### 1.1 Layout Architecture

The application uses a custom CSS-based layout with no Material-UI layout components.

**Key Files:**
- `frontend/src/components/layout/AppLayout.tsx` — Main shell layout (header + sidebar + content)
- `frontend/src/components/layout/AppLayout.css` — All layout/sidebar styling
- `frontend/src/App.tsx` — Routes; every protected page wraps in `<AppLayout>`

**Layout Structure:**
```
┌──────────────────────────────────────────────┐
│ .shell-header (sticky, 56px, blue)           │
├────────────┬─────────────────────────────────┤
│ .shell-    │ .shell-content                  │
│  sidebar   │  (flex: 1, overflow-y: auto)    │
│ (220px)    │                                 │
│            │                                 │
└────────────┴─────────────────────────────────┘
```

### 1.2 Sidebar Implementation Details

The sidebar (`AppLayout.tsx` lines 76–155) is a **plain HTML/CSS nav** rendered with vanilla `<button>` and `<div>` elements — **not** a MUI `<Drawer>` component. Navigation items are defined as a static array (`NAV_SECTIONS`) with permission-based filtering (`adminOnly`, `requireTech`, `staffOnly`, etc.).

### 1.3 Why the Sidebar Doesn't Show on Mobile

In `AppLayout.css` (line 156–160):

```css
@media (max-width: 768px) {
  .shell-sidebar {
    display: none;
  }
}
```

The sidebar is simply hidden with `display: none` at ≤768px. **No alternative mobile navigation** (hamburger menu, bottom nav, or swipeable drawer) is provided. Users on mobile devices have no way to navigate between pages.

### 1.4 Technology Observations

| Aspect | Current State |
|--------|--------------|
| UI Library | MUI v7.3.8 installed but **not used for layout** |
| CSS Approach | Custom CSS variables + vanilla classes |
| Router | React Router v7.12 |
| State | Zustand (`authStore`) |
| Theme | CSS custom properties only (no MUI `ThemeProvider`) |
| Responsive design | Only the one media query hiding the sidebar |

---

## 2. Proposed Solution: Responsive Mobile Navigation

### 2.1 Approach — MUI Responsive Drawer + Hamburger Toggle

Replace the static CSS sidebar with MUI's `<Drawer>` component that:
- On **desktop (≥768px)**: Renders as a permanent/persistent drawer (same visual as today)
- On **mobile (<768px)**: Renders as a temporary drawer triggered by a hamburger icon in the header

This is the standard MUI "responsive drawer" pattern and requires minimal restructuring.

### 2.2 Implementation Plan

#### A. Modify `AppLayout.tsx`

```tsx
import { useState } from 'react';
import {
  Drawer,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
```

Key changes:
1. Add `useState<boolean>` for `mobileOpen`
2. Use `useMediaQuery('(min-width:768px)')` to detect desktop vs mobile
3. Render a `<IconButton>` hamburger in the header (visible only on mobile)
4. Render sidebar content inside a `<Drawer>` component:
   - `variant="permanent"` on desktop
   - `variant="temporary"` on mobile with `open={mobileOpen}` and `onClose` handler
5. Close the drawer on nav item click (mobile only)

#### B. Update `AppLayout.css`

- Remove the `@media (max-width: 768px) { .shell-sidebar { display: none; } }` rule
- Add a `.hamburger-btn` class (hidden on desktop, visible on mobile)
- Adjust `.shell-body` to accommodate the MUI Drawer's fixed positioning on mobile

#### C. Optional Enhancement: Bottom Navigation Bar

For highly mobile-centric use (field technicians submitting work orders), add a MUI `<BottomNavigation>` with 3–4 key quick-access items visible only on mobile:
- Dashboard
- Work Orders
- My Equipment
- More (opens the full drawer)

### 2.3 Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/layout/AppLayout.tsx` | Refactor sidebar into MUI Drawer + hamburger toggle |
| `frontend/src/components/layout/AppLayout.css` | Remove mobile hide rule; add hamburger & drawer overrides |
| `frontend/src/main.tsx` | Wrap app in MUI `<ThemeProvider>` + `<CssBaseline>` (if not already) |

### 2.4 Dependencies

No new dependencies needed — `@mui/material` v7.3.8 and `@mui/icons-material` v7.3.8 are already installed and include `Drawer`, `useMediaQuery`, `IconButton`, `BottomNavigation`.

---

## 3. PWA Implementation Plan

### 3.1 Current PWA State

| Item | Status |
|------|--------|
| `vite-plugin-pwa` | ❌ Not installed |
| `manifest.json` | ❌ Not present (`frontend/public/` only has `.gitkeep`) |
| Service worker | ❌ None |
| PWA meta tags | ❌ None in `index.html` |
| App icons | ❌ None |
| Offline support | ❌ None |
| HTTPS | ✅ Production already uses SSL (see `init-ssl.sh`, `docker-compose.yml`) |

### 3.2 What PWA Provides

- **Install prompt** — users can "Add to Home Screen" on mobile/desktop
- **Offline shell** — cached app shell loads instantly even offline
- **Push notifications** (future) — for work order updates, PO approvals
- **Background sync** (future) — queue work order submissions offline

### 3.3 Implementation Steps

#### Step 1: Install `vite-plugin-pwa`

```bash
cd frontend
npm install -D vite-plugin-pwa
```

#### Step 2: Configure `vite.config.ts`

```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tech Department Management System',
        short_name: 'TechDMS',
        description: 'Technology department operations management',
        theme_color: '#1e40af',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  // ... existing config
});
```

#### Step 3: Create App Icons

Place in `frontend/public/`:
- `pwa-192x192.png` (192×192)
- `pwa-512x512.png` (512×512)
- `apple-touch-icon.png` (180×180)
- `favicon.svg` (vector)

#### Step 4: Update `index.html`

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1e40af" />
  <meta name="description" content="Tech Department Management System" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <title>Tech Department Management System</title>
</head>
```

#### Step 5: Optional — Install Prompt UI

Create a `components/layout/InstallPrompt.tsx` component that listens for the `beforeinstallprompt` event and shows a dismissible banner encouraging mobile users to install.

### 3.4 Service Worker Strategy

| Resource | Strategy | Rationale |
|----------|----------|-----------|
| App shell (JS/CSS/HTML) | **CacheFirst** (precache via Workbox) | Instant load, auto-updated |
| API calls | **NetworkFirst** (5min fallback) | Fresh data preferred; stale OK briefly |
| Static assets (images) | **CacheFirst** | Rarely change |
| Auth endpoints | **NetworkOnly** | Must always hit server |

### 3.5 Files to Create/Modify

| File | Action |
|------|--------|
| `frontend/vite.config.ts` | Add `VitePWA` plugin |
| `frontend/public/pwa-192x192.png` | Create (app icon) |
| `frontend/public/pwa-512x512.png` | Create (app icon) |
| `frontend/public/apple-touch-icon.png` | Create |
| `frontend/public/favicon.svg` | Create |
| `frontend/index.html` | Add PWA meta tags |
| `frontend/src/components/layout/InstallPrompt.tsx` | Create (optional install banner) |
| `frontend/package.json` | Add `vite-plugin-pwa` dev dependency |

### 3.6 New Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `vite-plugin-pwa` | devDependency | Generates manifest + service worker via Workbox |

---

## 4. Security Considerations

1. **Service Worker Scope** — SW is scoped to `/` which is correct for SPA. No cross-origin SW issues.
2. **HTTPS Required** — PWA features require HTTPS. Production already uses SSL via nginx + Let's Encrypt (confirmed in `docker-compose.yml` / `init-ssl.sh`). Dev uses localhost which browsers exempt.
3. **Cache Invalidation** — `registerType: 'autoUpdate'` ensures new SW activates immediately without user intervention, preventing stale code from persisting.
4. **API Cache** — Using `NetworkFirst` with short TTL (5 min) for API calls ensures sensitive data isn't cached indefinitely. Auth endpoints excluded from caching entirely.
5. **No Sensitive Data in SW Cache** — The workbox config only caches static assets and API responses. JWT tokens stored in memory/httpOnly cookies are never in the SW cache.
6. **CSP Headers** — Ensure Content-Security-Policy allows `'self'` for service worker registration. The nginx config should already permit this.
7. **Temporary Drawer** — The mobile drawer uses MUI's built-in backdrop/overlay which blocks interaction with background content, preventing accidental taps.

---

## 5. Implementation Order (Recommended)

### Phase 1: Mobile Navigation (Low risk, high impact)
1. Refactor `AppLayout.tsx` to use MUI Drawer with responsive variant
2. Add hamburger icon button to header
3. Update CSS, remove the `display: none` media query
4. Test on mobile viewport sizes

### Phase 2: PWA Foundation
1. Install `vite-plugin-pwa`
2. Create icons (can use a generator tool from existing logo)
3. Configure `vite.config.ts` with manifest + workbox
4. Update `index.html` with meta tags
5. Build and verify with Lighthouse PWA audit

### Phase 3: PWA Enhancements (Optional/Future)
1. Install prompt banner component
2. Offline fallback page
3. Bottom navigation bar for mobile
4. Push notification support (requires backend changes)

---

## 6. Summary

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| No mobile navigation | `display: none` on `.shell-sidebar` at ≤768px with no alternative | MUI responsive Drawer + hamburger toggle |
| Not installable as app | No manifest, no service worker, no icons | `vite-plugin-pwa` with Workbox |
| No offline capability | No service worker caching | Workbox precache for app shell, NetworkFirst for API |

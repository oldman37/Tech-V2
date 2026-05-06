# Mobile UX Improvements — Comprehensive Game Plan

> **Created:** 2026-05-06  
> **Status:** Specification / Ready for Implementation  
> **Target:** Tech-V2 Frontend (`/frontend/src/`)

---

## 1. Current State Analysis

### 1.1 Architecture Summary

| Aspect | Current State |
|--------|--------------|
| Framework | React 18 + TypeScript, Vite, MUI v5 |
| Styling | Mix of custom CSS (`global.css`) and MUI `sx` props |
| Layout | `AppLayout.tsx` with sidebar (fixed) + content area |
| Breakpoint | Single breakpoint at 768px for mobile/desktop toggle |
| PWA | Configured via `vite-plugin-pwa` (Workbox, standalone, portrait) |
| Responsive hooks | Only `useMediaQuery('(min-width:769px)')` in `AppLayout.tsx` |
| Grid system | Custom CSS `.grid-cols-{1-4}` with media queries |

### 1.2 What's Already Working

- ✅ Sidebar navigation collapses to mobile drawer on <769px
- ✅ PWA manifest configured (standalone, portrait)
- ✅ Service worker caching API and images
- ✅ Header hides user info on mobile
- ✅ CSS grid responsive fallbacks (cols-4 → cols-2 → cols-1)
- ✅ Container reduces padding on small screens

### 1.3 What's Broken / Suboptimal on Mobile

| Issue | Severity | Affected Pages |
|-------|----------|----------------|
| Tables with 9-15 columns overflow horizontally with no usable mobile view | Critical | Inventory, Equipment Search, PO List, Work Orders, Field Trips, Transportation, Users |
| Stats cards `grid-cols-4` too cramped between 576-768px | High | Dashboard, Inventory |
| Filter panels with `grid-cols-4` don't adapt below 768px in useful way | High | Inventory, Equipment Search |
| MUI filter bars (`flex-wrap`) have `minWidth` values causing overflow on <400px | High | PO List, Work Order List |
| Action buttons in table rows are tiny (~24px) touch targets | High | Inventory, Equipment Search |
| MUI Dialogs (forms) not optimized for mobile (no `fullScreen` on small) | Medium | Inventory Form, Assignment Dialog, Import Dialog |
| Multi-step wizard (Stepper) labels truncate on mobile | Medium | Requisition Wizard, Field Trip Request |
| Table pagination controls cramped on mobile | Medium | All table pages |
| No centralized `useIsMobile()` hook for responsive logic | Medium | Architecture |
| No card-view alternative for data tables on mobile | Critical | Architecture |
| Header logout button area is tight on small phones | Low | All pages |
| Typography `page-title` at 2rem too large on <400px | Low | All pages |
| PO List tab labels overflow on narrow screens | Medium | Purchase Orders |

---

## 2. Prioritized Improvement List

### P0 — Critical (Must Fix)

| # | Issue | Complexity | Description |
|---|-------|-----------|-------------|
| P0-1 | Responsive table → card view system | High | Create a reusable responsive table/card component that switches from table view to card/list view on mobile |
| P0-2 | Inventory table mobile view | Medium | Apply responsive table pattern to the 15-column custom inventory table |
| P0-3 | PO list table mobile view | Medium | Apply responsive table pattern to the MUI-based PO list |

### P1 — High Priority

| # | Issue | Complexity | Description |
|---|-------|-----------|-------------|
| P1-1 | Create `useIsMobile()` hook | Low | Centralized responsive utility hook with configurable breakpoints |
| P1-2 | Filter panel responsive layout | Medium | Collapse filter grids on mobile, add expandable/collapsible filter drawer |
| P1-3 | Touch target sizing | Low | Ensure all interactive elements are ≥44px touch target |
| P1-4 | Dialog fullScreen on mobile | Low | Add `fullScreen` prop to all MUI Dialogs when viewport is mobile |
| P1-5 | Stats cards responsive grid | Low | Use 2-col on tablet, 1-col on phone for stats grids |
| P1-6 | Work Orders table mobile view | Medium | Apply responsive table pattern |
| P1-7 | Users table mobile view | Medium | Apply responsive table pattern |

### P2 — Medium Priority

| # | Issue | Complexity | Description |
|---|-------|-----------|-------------|
| P2-1 | Stepper mobile layout | Low | ✅ Use `alternativeLabel` or vertical stepper on mobile |
| P2-2 | Tab scrolling for PO/Work Orders | Low | ✅ Enable `scrollable` variant for MUI Tabs on mobile |
| P2-3 | Mobile pagination controls | Low | ✅ Simplify pagination to prev/next only on mobile |
| P2-4 | Form layouts on mobile | Medium | ✅ Stack form fields to single column, increase input heights |
| P2-5 | Equipment Detail Drawer mobile | Low | Make drawer full-width on mobile |
| P2-6 | Field Trip / Transportation table mobile | Medium | ✅ Apply responsive table pattern |

### P3 — Nice to Have

| # | Issue | Complexity | Description |
|---|-------|-----------|-------------|
| P3-1 | Pull-to-refresh | Medium | Add pull-to-refresh gesture for list pages |
| P3-2 | Bottom action bar | Medium | Float primary action buttons at bottom on mobile |
| P3-3 | Typography scale adjustments | Low | Reduce page-title, stat numbers on mobile |
| P3-4 | Swipe gestures on card items | High | Swipe-to-action on mobile card views |
| P3-5 | Offline indicator banner | Low | Show connection status in PWA mobile mode |
| P3-6 | Mobile-optimized date pickers | Low | Use native date inputs on mobile |

---

## 3. Proposed Solutions

### 3.1 Responsive Table/Card System (P0-1)

**Approach:** Create a `<ResponsiveTable>` wrapper component that renders a `<table>` on desktop and a card/list view on mobile.

```tsx
// src/components/responsive/ResponsiveTable.tsx

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  /** Hide this column on mobile card view */
  hideOnMobile?: boolean;
  /** Show this column as the card title */
  isPrimary?: boolean;
  /** Show this column as subtitle on card */
  isSecondary?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  mobileBreakpoint?: number; // default 768
}
```

**Mobile card rendering:**
- Primary column → card title (bold, larger)
- Secondary columns → subtitle row
- Key data → stacked label/value pairs
- Actions → right-aligned or footer of card
- Touch targets ≥ 44px

**Why not horizontal scroll alone:**  
Horizontal scroll requires two-dimensional navigation which is awkward on touch. Users must scroll right to find actions, then scroll back. Card view presents all relevant info in a scannable vertical list.

### 3.2 `useIsMobile()` Hook (P1-1)

```tsx
// src/hooks/useResponsive.ts
import { useMediaQuery } from '@mui/material';

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const;

export function useIsMobile() {
  return useMediaQuery(`(max-width:${BREAKPOINTS.mobile}px)`);
}

export function useIsTablet() {
  return useMediaQuery(`(max-width:${BREAKPOINTS.tablet}px)`);
}

export function useResponsive() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  return { isMobile, isTablet, isDesktop: !isTablet };
}
```

### 3.3 Filter Panel Responsive (P1-2)

**Strategy:** On mobile, collapse the multi-row filter grid into:
1. A single search input always visible
2. "Filters" button that opens a bottom sheet / expandable panel
3. Active filter count badge on the button

```tsx
// Mobile filter pattern
{isMobile ? (
  <MobileFilterBar
    searchValue={search}
    onSearchChange={setSearch}
    filterCount={activeFilterCount}
    onOpenFilters={() => setFilterDrawerOpen(true)}
  />
) : (
  <DesktopFilterGrid ... />
)}
```

### 3.4 Dialog fullScreen on Mobile (P1-4)

Simple pattern applied to all MUI Dialogs:

```tsx
const isMobile = useIsMobile();

<Dialog
  open={open}
  onClose={onClose}
  fullScreen={isMobile}
  maxWidth="md"
  fullWidth
>
```

### 3.5 Touch Target Fix (P1-3)

Add to `global.css`:

```css
@media (max-width: 768px) {
  .btn-sm {
    min-height: 44px;
    min-width: 44px;
    padding: 0.625rem 1rem;
  }
  
  .table td .btn-sm {
    min-height: 44px;
    min-width: 44px;
  }
}
```

For MUI buttons, use `sx={{ minHeight: { xs: 44 } }}` or set in theme overrides.

### 3.6 Tab Scrolling (P2-2)

```tsx
<Tabs
  value={activeTab}
  onChange={handleTabChange}
  variant={isMobile ? 'scrollable' : 'standard'}
  scrollButtons={isMobile ? 'auto' : false}
>
```

---

## 4. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile detection | `useMediaQuery` from MUI (CSS-based) | Already in bundle, SSR-safe, matches CSS breakpoints |
| Table strategy | Single `<ResponsiveTable>` component, not per-page rewrites | DRY, consistent UX, testable |
| Card view on mobile | Custom card component (not MUI Card) | Lightweight, matches existing custom CSS design system |
| Breakpoint alignment | 768px mobile, 1024px tablet (matches existing CSS) | Maintains consistency with current `global.css` media queries |
| Filter pattern | Inline search + drawer for advanced filters on mobile | Balances discoverability with screen space |
| Dialog approach | `fullScreen` prop toggle, not separate mobile dialogs | Minimal code change, MUI built-in support |
| Avoid MUI DataGrid | Continue with custom tables + MUI Table | DataGrid brings large bundle, lower control over mobile UX |
| Responsive styles | Prefer CSS media queries for layout, `useIsMobile()` for component switching | CSS handles progressive styling; React hook handles render logic |

---

## 5. Implementation Phases

### Phase 1: Foundation (Sprint 1)

| Task | Files | Effort |
|------|-------|--------|
| Create `useResponsive` hook | `src/hooks/useResponsive.ts` | 0.5hr |
| Create `<ResponsiveTable>` component | `src/components/responsive/ResponsiveTable.tsx` | 4hr |
| Create `<MobileCard>` sub-component | `src/components/responsive/MobileCard.tsx` | 2hr |
| Create `<MobileFilterBar>` component | `src/components/responsive/MobileFilterBar.tsx` | 2hr |
| Add mobile CSS utilities to `global.css` | `src/styles/global.css` | 1hr |
| Add touch target overrides | `src/styles/global.css` | 0.5hr |

### Phase 2: Critical Tables (Sprint 2)

| Task | Files | Effort |
|------|-------|--------|
| Refactor Inventory table to `<ResponsiveTable>` | `src/pages/InventoryManagement.tsx` | 3hr |
| Refactor PO List table to `<ResponsiveTable>` | `src/pages/PurchaseOrders/PurchaseOrderList.tsx` | 3hr |
| Refactor Work Order List table | `src/pages/WorkOrderListPage.tsx` | 2hr |
| Refactor Users table | `src/pages/Users.tsx` | 2hr |
| Inventory filter panel mobile | `src/pages/InventoryManagement.tsx` | 2hr |
| Equipment Search filter panel mobile | `src/pages/EquipmentSearch.tsx` | 2hr |

### Phase 3: Forms & Dialogs (Sprint 3)

| Task | Files | Effort |
|------|-------|--------|
| Inventory Form Dialog fullScreen toggle | `src/components/inventory/InventoryFormDialog.tsx` | 0.5hr |
| Assignment Dialog fullScreen toggle | `src/components/inventory/AssignmentDialog.tsx` | 0.5hr |
| Import Dialog fullScreen toggle | `src/components/inventory/ImportInventoryDialog.tsx` | 0.5hr |
| Requisition Wizard mobile stepper | `src/pages/PurchaseOrders/RequisitionWizard.tsx` | 2hr |
| Field Trip Request form mobile layout | `src/pages/FieldTrip/FieldTripRequestPage.tsx` | 2hr |
| Work Order form mobile layout | `src/pages/NewWorkOrderPage.tsx` | 1hr |
| PO Tabs scrollable on mobile | `src/pages/PurchaseOrders/PurchaseOrderList.tsx` | 0.5hr |

### Phase 4: Polish & Secondary Pages (Sprint 4)

| Task | Files | Effort |
|------|-------|--------|
| Field Trip List table mobile | `src/pages/FieldTrip/FieldTripListPage.tsx` | 2hr |
| Transportation Requests table mobile | `src/pages/TransportationRequests/TransportationRequestsPage.tsx` | 2hr |
| Equipment Search results table mobile | `src/pages/EquipmentSearch.tsx` | 2hr |
| Dashboard stats cards responsive | `src/pages/Dashboard.tsx` | 1hr |
| Equipment Detail Drawer full-width mobile | `src/components/inventory/EquipmentDetailDrawer.tsx` | 1hr |
| Pagination controls simplified mobile | `src/components/PaginationControls.tsx` | 1hr |
| Typography scale `page-title` mobile | `src/styles/global.css` | 0.5hr |

### Phase 5: Nice-to-Have (Sprint 5+)

| Task | Files | Effort |
|------|-------|--------|
| Pull-to-refresh on list pages | New hook + integration | 4hr |
| Floating bottom action bar | New component | 3hr |
| Offline status banner | `src/components/layout/AppLayout.tsx` | 1hr |
| Native date picker on mobile | Form pages | 2hr |

---

## 6. Files That Will Need Modification

### New Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useResponsive.ts` | Centralized responsive breakpoint hooks |
| `src/components/responsive/ResponsiveTable.tsx` | Table/card switching component |
| `src/components/responsive/MobileCard.tsx` | Mobile card view for table rows |
| `src/components/responsive/MobileFilterBar.tsx` | Compact filter UI for mobile |
| `src/components/responsive/index.ts` | Barrel export |

### Existing Files to Modify

| File | Change |
|------|--------|
| `src/styles/global.css` | Add mobile utilities, touch targets, typography scale |
| `src/pages/InventoryManagement.tsx` | Replace table with ResponsiveTable, mobile filters |
| `src/pages/EquipmentSearch.tsx` | Replace table with ResponsiveTable, mobile filters |
| `src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Replace MUI Table with ResponsiveTable, scrollable tabs |
| `src/pages/WorkOrderListPage.tsx` | Replace MUI Table with ResponsiveTable |
| `src/pages/Users.tsx` | Replace custom table with ResponsiveTable |
| `src/pages/Dashboard.tsx` | Fix stats card grid breakpoints |
| `src/pages/FieldTrip/FieldTripListPage.tsx` | Replace MUI Table with ResponsiveTable |
| `src/pages/FieldTrip/FieldTripRequestPage.tsx` | Mobile form layout |
| `src/pages/TransportationRequests/TransportationRequestsPage.tsx` | Replace MUI Table |
| `src/pages/PurchaseOrders/RequisitionWizard.tsx` | Mobile stepper |
| `src/pages/NewWorkOrderPage.tsx` | Mobile form stacking |
| `src/components/inventory/InventoryFormDialog.tsx` | fullScreen on mobile |
| `src/components/inventory/AssignmentDialog.tsx` | fullScreen on mobile |
| `src/components/inventory/ImportInventoryDialog.tsx` | fullScreen on mobile |
| `src/components/inventory/EquipmentDetailDrawer.tsx` | Full-width on mobile |
| `src/components/PaginationControls.tsx` | Simplified mobile mode |
| `src/components/layout/AppLayout.css` | Minor tweaks |

---

## 7. Dependencies & Requirements

| Dependency | Status | Notes |
|-----------|--------|-------|
| MUI `useMediaQuery` | ✅ Already installed | Used in AppLayout |
| MUI `Drawer` (for filter drawer) | ✅ Already installed | Same as nav drawer |
| MUI `SwipeableDrawer` | ✅ Part of MUI | For filter bottom-sheet on mobile |
| No new npm packages required | ✅ | All solutions use existing dependencies |
| `@mui/material` breakpoints | ✅ Available | Can use `theme.breakpoints` if custom theme added |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ResponsiveTable regressions on desktop | Medium | High | Keep existing table rendering for desktop; card view is mobile-only |
| Performance of re-rendering on resize | Low | Medium | `useMediaQuery` uses CSS, not JS resize listeners; renders once per breakpoint cross |
| Scope creep — too many pages at once | High | Medium | Strict phase boundaries; P0 first, then iterate |
| Mobile card view UX not sufficient for power users | Medium | Medium | Keep horizontal scroll as fallback option; card is primary with "View as table" toggle |
| Action buttons losing context in card view | Medium | Low | Show actions inline on each card; use icon+label for clarity |
| Testing coverage for mobile layouts | Medium | Medium | Add viewport-specific Playwright tests for critical pages |
| MUI version conflicts | Low | Low | Already using MUI v5 consistently; no upgrade needed |

---

## 9. Research Sources

1. **MUI Responsive UI Guide** — https://mui.com/material-ui/guides/responsive-ui/  
   Grid, Container, Breakpoints, useMediaQuery utilities for responsive Material-UI layouts.

2. **MUI Table Documentation** — https://mui.com/material-ui/react-table/  
   TableContainer for horizontal scroll, dense tables, collapsible rows, sticky headers.

3. **Material Design Responsive Layout Grid** — https://m2.material.io/design/layout/responsive-layout-grid.html  
   4/8/12-column grid breakpoints, gutter/margin specs, touch UI patterns.

4. **Web.dev Responsive Web Design Basics** — https://web.dev/articles/responsive-web-design-basics  
   Viewport meta, fluid images, CSS media queries, mobile-first breakpoint strategy.

5. **Web.dev PWA Checklist** — https://web.dev/articles/pwa-checklist  
   PWA requirements: responsive to any screen, offline fallback, installability, touch input support.

6. **Web.dev Accessible Tap Targets** — https://web.dev/articles/accessible-tap-targets  
   Minimum 48x48 CSS px touch targets (Google standard), adequate spacing between targets.

7. **Material Design Touch Target Guidelines** — https://m2.material.io/design/usability/accessibility.html  
   Minimum 48dp touch targets, 8dp minimum spacing between targets.

---

## 10. Success Criteria

- [ ] All data tables render as scannable card lists on viewports <768px
- [ ] All filter panels collapse to search + expandable filters on mobile
- [ ] All dialogs open full-screen on mobile devices
- [ ] All touch targets meet 44px minimum
- [ ] No horizontal scroll required on any page at 375px viewport width
- [ ] Lighthouse mobile score ≥90 for performance
- [ ] Zero layout shift on viewport resize (desktop ↔ mobile)
- [ ] Users can complete all critical workflows (create PO, submit work order, search equipment) on a phone without pinch-zooming

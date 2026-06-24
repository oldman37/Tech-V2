# UI/UX Test Environment — Complete Change Log

Compiled by comparing the live GitHub repo (`master` branch) against the test environment
files, cross-referenced with the Qwen LLM session history.

Changes are grouped by the session that produced them.

---

## Files Changed

| File | Session |
|------|---------|
| `frontend/src/components/layout/AppLayout.css` | Qwen + Claude |
| `frontend/src/pages/Dashboard.css` | Qwen |
| `frontend/src/pages/Dashboard.tsx` | Qwen |
| `frontend/src/styles/global.css` | Claude |

---

---

# SESSION 1 — Qwen LLM

---

## Change Q-1 — Header: Gradient Background

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The app header was changed from a flat solid blue to a left-to-right
gradient that fades from white through light indigo to primary blue. Height, padding, and
box-shadow were also updated to match the new design.

**Before:**
```css
.shell-header {
  height: 56px;
  background: var(--primary-blue, #1e40af);
  padding: 0 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
```

**After:**
```css
.shell-header {
  height: 64px;
  background: linear-gradient(90deg, #ffffff 0%, #e0e7ff 40%, var(--primary-blue, #3b82f6) 100%);
  padding: 0 2rem;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
}
```

Also update `.shell-body` to match the new header height:

**Before:**
```css
.shell-body {
  height: calc(100vh - 56px);
}
```

**After:**
```css
.shell-body {
  height: calc(100vh - 64px);
}
```

---

## Change Q-2 — Header: Logo Drop Shadow

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The logo was made slightly taller and given a soft drop shadow so it
reads cleanly against the gradient background.

**Before:**
```css
.shell-logo-full {
  height: 36px;
  width: auto;
}
```

**After:**
```css
.shell-logo-full {
  height: 40px;
  width: auto;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}
```

---

## Change Q-3 — Header: User Info Text Color

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The header user name and email text had no explicit color set, so they
inherited a dark color that looked wrong against the right side of the gradient. Explicit
white values were added.

**Before:**
```css
.shell-user-info strong {
  font-size: 0.875rem;
}

.shell-user-info span {
  font-size: 0.75rem;
  opacity: 0.8;
}
```

**After:**
```css
.shell-user-info strong {
  font-size: 0.875rem;
  color: #ffffff;
}

.shell-user-info span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.85);
}
```

Note: `opacity: 0.8` on the span was replaced with a semi-transparent white `color` value
so that only the text is softened rather than the entire element.

---

## Change Q-4 — Header: Right Section Gap

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** Minor spacing increase in the header right section.

**Before:**
```css
.shell-header-right {
  gap: 1rem;
}
```

**After:**
```css
.shell-header-right {
  gap: 1.25rem;
}
```

---

## Change Q-5 — Sidebar: Width, Padding & Custom Scrollbar

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The sidebar was widened and given more internal breathing room. A thin
custom scrollbar was added so the default OS scrollbar does not appear inside the nav.

**Before:**
```css
.shell-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid var(--slate-200, #e2e8f0);
  overflow-y: auto;
  padding: 0.75rem 0;
}
```

**After:**
```css
.shell-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid var(--slate-200, #e2e8f0);
  overflow-y: auto;
  padding: 1rem 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: var(--slate-300) transparent;
}

.shell-sidebar::-webkit-scrollbar {
  width: 6px;
}

.shell-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.shell-sidebar::-webkit-scrollbar-thumb {
  background-color: var(--slate-300);
  border-radius: 20px;
}
```

---

## Change Q-6 — Sidebar: Nav Section Spacing

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** Minor spacing adjustments to give nav sections more vertical breathing
room between groups.

**Before:**
```css
.nav-section {
  padding: 0.25rem 0;
  margin-bottom: 0.25rem;
}
```

**After:**
```css
.nav-section {
  padding: 0.125rem 0;
  margin-bottom: 0.5rem;
}
```

---

## Change Q-7 — Sidebar: Nav Section Title Styling

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The nav section category label (static, non-collapsible sections) was
given explicit padding, increased letter-spacing, and font-weight. The color and font-size
were later updated in the Claude session (see Change C-2).

**Before:**
```css
.nav-section-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--slate-400, #94a3b8);
}
```

**After (Qwen portion only):**
```css
.nav-section-title {
  font-size: 0.625rem;          /* size set by Qwen; updated further by Claude */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;        /* increased from 0.08em */
  color: var(--slate-400, #94a3b8);  /* color updated later by Claude */
  padding: 0.75rem 1rem 0.5rem; /* added by Qwen */
}
```

---

## Change Q-8 — Sidebar: Nav Section Header Styling (Collapsible Labels)

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The collapsible section header button was given explicit typography
to match the static `.nav-section-title`. Color and font-size were later updated in the
Claude session (see Change C-2).

**Before:**
```css
.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  /* no font-size, color, font-weight, text-transform, or letter-spacing */
}
```

**After (Qwen portion only):**
```css
.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem;          /* trailing 0.25rem removed */
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 0.625rem;           /* added; updated later by Claude */
  font-weight: 700;              /* added */
  text-transform: uppercase;     /* added */
  letter-spacing: 0.1em;        /* added */
  color: var(--slate-400, #94a3b8); /* added; updated later by Claude */
}
```

---

## Change Q-9 — Sidebar: Nav Items — Pill Shape & Hover Gradient

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** Nav items were converted from flat rectangular rows to pill-shaped
buttons with a gradient hover effect and a slight rightward nudge on hover. Font, gap,
and padding were refined.

**Before:**
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--slate-700, #334155);
  text-align: left;
  border-radius: 0;
  transition: background 0.1s, color 0.1s;
}

.nav-item:hover:not(.nav-item--disabled) {
  background: var(--slate-100, #f1f5f9);
  color: var(--slate-900, #0f172a);
}
```

**After:**
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 1rem;
  margin-bottom: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--slate-600, #475569);
  text-align: left;
  border-radius: 0.75rem;
  transition: all var(--transition-base);
  font-weight: 500;
  position: relative;
}

.nav-item:hover:not(.nav-item--disabled) {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  color: var(--primary-blue, #3b82f6);
  transform: translateX(2px);
}
```

---

## Change Q-10 — Sidebar: Active Nav Item — Blue Gradient

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The active nav item was changed from a light blue background with a
right-side border to a full primary-blue gradient with white text, a box shadow, and a
left-side accent bar via a `::before` pseudo-element.

**Before:**
```css
.nav-item--active {
  background: #eff6ff;
  color: var(--primary-blue, #1e40af) !important;
  font-weight: 600;
  border-right: 3px solid var(--primary-blue, #1e40af);
}
/* no ::before pseudo-element */
```

**After:**
```css
.nav-item--active {
  background: linear-gradient(135deg, var(--primary-blue, #3b82f6) 0%, var(--primary-blue-dark, #2563eb) 100%);
  color: #ffffff !important;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: -0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 60%;
  background: var(--primary-blue, #3b82f6);
  border-radius: 0 4px 4px 0;
}
```

---

## Change Q-11 — Sidebar: Nav Icon Sizing & Hover Animation

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** Nav icons were made slightly larger and given a scale animation on
hover and active states.

**Before:**
```css
.nav-icon {
  flex-shrink: 0;
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
}
/* no hover or active icon rules */
```

**After:**
```css
.nav-icon {
  flex-shrink: 0;
  font-size: 1.125rem;
  width: 1.5rem;
  text-align: center;
  transition: transform var(--transition-base);
}

.nav-item:hover:not(.nav-item--disabled) .nav-icon {
  transform: scale(1.1);
}

.nav-item--active .nav-icon {
  transform: scale(1.1);
}
```

---

## Change Q-12 — Sidebar: "Coming Soon" Badge Refinement

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The "Soon" badge on disabled nav items was given a lighter background,
tighter padding, and explicit bold weight.

**Before:**
```css
.nav-soon {
  margin-left: auto;
  font-size: 0.65rem;
  background: var(--slate-200, #e2e8f0);
  color: var(--slate-500, #64748b);
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
}
```

**After:**
```css
.nav-soon {
  margin-left: auto;
  font-size: 0.625rem;
  background: var(--slate-100, #f1f5f9);
  color: var(--slate-500, #64748b);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
}
```

---

## Change Q-13 — Sidebar: Main Content Area Padding & Background

**File:** `frontend/src/components/layout/AppLayout.css`

**What changed:** The main content area padding was increased and an explicit background
colour was added so it always matches the app's slate-50 background regardless of theme.

**Before:**
```css
.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.5rem;
  min-width: 0;
}
```

**After:**
```css
.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
  min-width: 0;
  background: var(--slate-50, #f8fafc);
}
```

---

## Change Q-14 — Dashboard: Feature Icons — SVG Replacement

**File:** `frontend/src/pages/Dashboard.tsx`

**What changed:** The text-initial icons (e.g. "INV", "PO", "WO") inside each dashboard
card icon box were replaced with inline SVG icon components for a polished, professional
appearance.

**How to recreate:** Add the following seven SVG component declarations at the top of
`Dashboard.tsx`, before the `export const Dashboard` function. Then replace each
`<div className="feature-icon ...">` child with the corresponding component call.

```tsx
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import './Dashboard.css';

const InventoryIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const PurchaseIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

const WorkOrderIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const BuildingIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/>
    <line x1="8" y1="6" x2="8" y2="6.01"/>
    <line x1="16" y1="6" x2="16" y2="6.01"/>
    <line x1="12" y1="6" x2="12" y2="6.01"/>
    <line x1="8" y1="10" x2="8" y2="10.01"/>
    <line x1="16" y1="10" x2="16" y2="10.01"/>
    <line x1="12" y1="10" x2="12" y2="10.01"/>
    <line x1="8" y1="14" x2="8" y2="14.01"/>
    <line x1="16" y1="14" x2="16" y2="14.01"/>
    <line x1="12" y1="14" x2="12" y2="14.01"/>
  </svg>
);

const RoomIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const ReferenceIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="8" y1="7" x2="16" y2="7"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);
```

Update each card's icon div to use the component instead of text:

```tsx
{/* Before */}
<div className="feature-icon inventory">INV</div>

{/* After */}
<div className="feature-icon inventory"><InventoryIcon /></div>
```

Apply the same pattern for: `purchase` → `<PurchaseIcon />`, `maintenance` →
`<WorkOrderIcon />`, `users` → `<UsersIcon />`, `settings` (supervisors) →
`<BuildingIcon />`, `rooms` → `<RoomIcon />`, `settings` (reference data) →
`<ReferenceIcon />`.

Also add the SVG sizing rule to `Dashboard.css`:

```css
.feature-icon svg {
  width: 28px;
  height: 28px;
  color: white;
}
```

---

## Change Q-15 — Dashboard: Feature Icon Sizing & Hover Animation

**File:** `frontend/src/pages/Dashboard.css`

**What changed:** Feature icons were made larger and given a box shadow plus a scale
animation when the parent card is hovered.

**Before:**
```css
.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 16px;
  color: white;
  letter-spacing: 0.5px;
}
/* no hover animation */
```

**After:**
```css
.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 1rem;
  color: white;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.card:hover .feature-icon {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}
```

---

## Change Q-16 — Dashboard: Card Hover Lift & Blue Accent Bar

**File:** `frontend/src/pages/Dashboard.css`

**What changed:** Dashboard cards gained a hover lift animation, stronger shadow, blue
border highlight, and a thin blue accent bar that slides in at the top of the card on
hover via a `::before` pseudo-element.

**Before:** The `.card` rule only existed in `global.css` with a basic hover shadow.
`Dashboard.css` had no `.card` override.

**After — add to `Dashboard.css`:**
```css
.card {
  background: white;
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--slate-200);
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-blue), var(--primary-blue-light));
  opacity: 0;
  transition: opacity var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-xl);
  transform: translateY(-4px);
  border-color: var(--primary-blue-light);
}

.card:hover::before {
  opacity: 1;
}
```

Also add mobile padding reduction:

```css
@media (max-width: 768px) {
  .card {
    padding: 1.25rem;
  }
}
```

---

## Change Q-17 — Dashboard: Page Title Gradient Text

**File:** `frontend/src/pages/Dashboard.css`

**What changed:** The dashboard page title was given a gradient text treatment (dark
slate to primary blue) and the description text was slightly increased in size.

**Before:** `.page-title` and `.page-description` were only defined in `global.css` with
plain colours. `Dashboard.css` had no overrides for these.

**After — add to `Dashboard.css`:**
```css
.page-header {
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--slate-900);
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--slate-900) 0%, var(--primary-blue-dark) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-description {
  font-size: 1.0625rem;
  color: var(--slate-600);
  font-weight: 400;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 1.75rem;
  }
  .page-description {
    font-size: 0.9375rem;
  }
}
```

---

## Change Q-18 — Dashboard: Button Style Override

**File:** `frontend/src/pages/Dashboard.css`

**What changed:** The `.btn-primary` class on dashboard card buttons was enhanced with a
gradient background, hover lift, and active press effect. A full MUI `<Button
variant="contained">` override was also added so that other pages whose buttons could not
be converted to native buttons would still match.

**Before:** `.btn-primary` was only defined in `global.css` with a flat blue background.
No MUI override existed.

**After — add to `Dashboard.css`:**
```css
.btn-primary {
  background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-dark) 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

/* Global MUI Button Override - Matches btn-primary style */
.MuiButton-contained {
  background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-dark) 100%) !important;
  color: white !important;
  border-radius: var(--radius-md) !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3) !important;
  transition: all var(--transition-base) !important;
}

.MuiButton-contained:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4) !important;
}

.MuiButton-contained:active {
  transform: translateY(0) !important;
}

.MuiButton-contained:disabled {
  opacity: 0.5;
  transform: none !important;
  box-shadow: none !important;
}
```

---

---

# SESSION 2 — Claude

---

## Change C-1 — MUI Button Rounded Corners (Global, All Pages)

**File:** `frontend/src/styles/global.css`

**Problem:** The `.MuiButton-contained` override in `Dashboard.css` (added in Change
Q-18) only applies when the Dashboard page chunk is loaded. Pages that users navigate to
directly (Purchase Orders, Work Orders, Field Trips, Transportation Requests) were getting
MUI's default small border-radius instead of matching the rounded buttons on the Dashboard
cards.

**How to recreate:** In `global.css`, locate the `.btn-lg` rule block. Immediately after
it, add:

```css
/* MUI Button shape — matches .btn border-radius globally */
.MuiButton-contained,
.MuiButton-outlined {
  border-radius: var(--radius-md) !important;
}
```

---

## Change C-2 — Nav Category Labels: Larger Font & Black Color

**File:** `frontend/src/components/layout/AppLayout.css`

**Problem:** Nav section category labels were small and muted. Increasing size and
darkening to black makes section groupings immediately scannable.

**This change builds on Q-7 and Q-8.** Apply these final values (which include both
Qwen's structural additions and the Claude color/size update):

For `.nav-section-title`:
- `font-size`: `0.625rem` → `0.75rem`
- `color`: `var(--slate-400, #94a3b8)` → `#000`

For `.nav-section-header`:
- `font-size`: `0.625rem` → `0.75rem`
- `color`: `var(--slate-400, #94a3b8)` → `#000`

For `.nav-section-expand-icon`:
- `color`: `var(--slate-400, #94a3b8)` → `#000`

**Final values to use on the live project (include all Qwen + Claude values):**

```css
.nav-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #000;
  padding: 0.75rem 1rem 0.5rem;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: #000;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.nav-section-expand-icon {
  color: #000;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
```

---

## Change C-3 — Hamburger Menu Button Color

**File:** `frontend/src/components/layout/AppLayout.css`

**Problem:** The hamburger icon button sits over the white/light-indigo left side of the
header gradient (Change Q-1). The button used `color="inherit"`, which resolved to white,
making the icon invisible against the light background.

**How to recreate:** Find `.hamburger-btn` and add a color declaration:

```css
/* Before */
.hamburger-btn {
  margin-right: 0.25rem;
}

/* After */
.hamburger-btn {
  margin-right: 0.25rem;
  color: var(--primary-blue, #3b82f6) !important;
}
```

The `!important` is required to override MUI's `IconButton` inline colour injection.

---

## Change C-4 — Form Element Font Family Inheritance

**File:** `frontend/src/styles/global.css`

**Problem:** The global `*` reset does not reset `font-family`. Browsers apply a built-in
`font-family: ButtonText` default to `<button>` elements that bypasses CSS inheritance,
causing nav items (which are `<button>` elements) to render in a subtly different system
font than the `<h3>`/`<p>` text on the Dashboard cards.

**How to recreate:** In `global.css`, locate the `*` reset block and add the following
immediately after it, before the `body` rule:

```css
/* Before */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  ...
}

/* After */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

button, input, select, textarea {
  font-family: inherit;
}

body {
  font-family: var(--font-family);
  ...
}
```

---

## Summary of All Changes

| ID | File | Description | Session |
|----|------|-------------|---------|
| Q-1 | AppLayout.css | Header: gradient background, height 56→64px | Qwen |
| Q-2 | AppLayout.css | Header: logo drop shadow, height 36→40px | Qwen |
| Q-3 | AppLayout.css | Header: user info text color → white | Qwen |
| Q-4 | AppLayout.css | Header: right section gap 1rem→1.25rem | Qwen |
| Q-5 | AppLayout.css | Sidebar: width 220→260px, padding, custom scrollbar | Qwen |
| Q-6 | AppLayout.css | Sidebar: nav section spacing adjustments | Qwen |
| Q-7 | AppLayout.css | Sidebar: nav section title — padding & letter-spacing | Qwen |
| Q-8 | AppLayout.css | Sidebar: nav section header — explicit typography | Qwen |
| Q-9 | AppLayout.css | Sidebar: nav items — pill shape & hover gradient | Qwen |
| Q-10 | AppLayout.css | Sidebar: active nav item — full blue gradient | Qwen |
| Q-11 | AppLayout.css | Sidebar: nav icon sizing & hover scale animation | Qwen |
| Q-12 | AppLayout.css | Sidebar: "Soon" badge refinement | Qwen |
| Q-13 | AppLayout.css | Content area: padding & background colour | Qwen |
| Q-14 | Dashboard.tsx | Dashboard cards: text initials → SVG icons | Qwen |
| Q-15 | Dashboard.css | Feature icons: larger size & hover animation | Qwen |
| Q-16 | Dashboard.css | Cards: hover lift animation & blue accent bar | Qwen |
| Q-17 | Dashboard.css | Page title: gradient text effect | Qwen |
| Q-18 | Dashboard.css | Buttons: gradient style & MUI contained override | Qwen |
| C-1 | global.css | MUI button border-radius globally on all pages | Claude |
| C-2 | AppLayout.css | Nav category labels: font-size→0.75rem, color→black | Claude |
| C-3 | AppLayout.css | Hamburger button: color → primary blue | Claude |
| C-4 | global.css | Form elements: font-family inherit reset | Claude |

---

## Prompt for Applying All Changes to the Live Project

Copy and paste the following prompt to Claude on the live project:

---

```
Apply the following UI/UX changes to this project exactly as described. Make only the
changes specified — do not refactor surrounding code or add anything extra.

The changes affect four files:
  - frontend/src/components/layout/AppLayout.css
  - frontend/src/pages/Dashboard.css
  - frontend/src/pages/Dashboard.tsx
  - frontend/src/styles/global.css

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 1: frontend/src/components/layout/AppLayout.css
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Replace .shell-header with:
.shell-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 64px;
  background: linear-gradient(90deg, #ffffff 0%, #e0e7ff 40%, var(--primary-blue, #3b82f6) 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2rem;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
  flex-shrink: 0;
}

2. Replace .shell-logo-full with:
.shell-logo-full {
  height: 40px;
  width: auto;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}

3. Replace .shell-header-right with:
.shell-header-right {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

4. Replace .shell-user-info strong and .shell-user-info span with:
.shell-user-info strong {
  font-size: 0.875rem;
  color: #ffffff;
}
.shell-user-info span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.85);
}

5. Replace .shell-body with:
.shell-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: calc(100vh - 64px);
}

6. Replace .shell-sidebar with:
.shell-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid var(--slate-200, #e2e8f0);
  overflow-y: auto;
  padding: 1rem 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: var(--slate-300) transparent;
}

After .shell-sidebar, add:
.shell-sidebar::-webkit-scrollbar {
  width: 6px;
}
.shell-sidebar::-webkit-scrollbar-track {
  background: transparent;
}
.shell-sidebar::-webkit-scrollbar-thumb {
  background-color: var(--slate-300);
  border-radius: 20px;
}

7. Replace .nav-section with:
.nav-section {
  padding: 0.125rem 0;
  margin-bottom: 0.5rem;
}

8. Replace .nav-section-title with:
.nav-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #000;
  padding: 0.75rem 1rem 0.5rem;
}

9. Replace .nav-section-header with:
.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: #000;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

10. Replace .nav-section-expand-icon with:
.nav-section-expand-icon {
  color: #000;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

11. Replace .nav-item with:
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 1rem;
  margin-bottom: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--slate-600, #475569);
  text-align: left;
  border-radius: 0.75rem;
  transition: all var(--transition-base);
  font-weight: 500;
  position: relative;
}

12. Replace .nav-item:hover:not(.nav-item--disabled) with:
.nav-item:hover:not(.nav-item--disabled) {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  color: var(--primary-blue, #3b82f6);
  transform: translateX(2px);
}

13. Replace .nav-item--active with:
.nav-item--active {
  background: linear-gradient(135deg, var(--primary-blue, #3b82f6) 0%, var(--primary-blue-dark, #2563eb) 100%);
  color: #ffffff !important;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

After .nav-item--active, add:
.nav-item--active::before {
  content: '';
  position: absolute;
  left: -0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 60%;
  background: var(--primary-blue, #3b82f6);
  border-radius: 0 4px 4px 0;
}

14. Replace .nav-icon with:
.nav-icon {
  flex-shrink: 0;
  font-size: 1.125rem;
  width: 1.5rem;
  text-align: center;
  transition: transform var(--transition-base);
}

After .nav-icon, add:
.nav-item:hover:not(.nav-item--disabled) .nav-icon {
  transform: scale(1.1);
}
.nav-item--active .nav-icon {
  transform: scale(1.1);
}

15. Replace .nav-soon with:
.nav-soon {
  margin-left: auto;
  font-size: 0.625rem;
  background: var(--slate-100, #f1f5f9);
  color: var(--slate-500, #64748b);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
}

16. Replace .shell-content with:
.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
  min-width: 0;
  background: var(--slate-50, #f8fafc);
}

17. Replace .hamburger-btn with:
.hamburger-btn {
  margin-right: 0.25rem;
  color: var(--primary-blue, #3b82f6) !important;
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 2: frontend/src/pages/Dashboard.css
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the entire file with the following content:

/* Feature Icon Styles */
.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 1rem;
  color: white;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.card:hover .feature-icon {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.feature-icon.inventory { background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); }
.feature-icon.purchase  { background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); }
.feature-icon.maintenance { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
.feature-icon.users     { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
.feature-icon.reports   { background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); }
.feature-icon.settings  { background: linear-gradient(135deg, #64748b 0%, #475569 100%); }
.feature-icon.rooms     { background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); }

.feature-icon svg {
  width: 28px;
  height: 28px;
  color: white;
}

/* Card Modernization */
.card {
  background: white;
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--slate-200);
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-blue), var(--primary-blue-light));
  opacity: 0;
  transition: opacity var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-xl);
  transform: translateY(-4px);
  border-color: var(--primary-blue-light);
}

.card:hover::before {
  opacity: 1;
}

/* Page Header */
.page-header {
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--slate-900);
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--slate-900) 0%, var(--primary-blue-dark) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-description {
  font-size: 1.0625rem;
  color: var(--slate-600);
  font-weight: 400;
}

/* Button Modernization */
.btn-primary {
  background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-dark) 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

/* Global MUI Button Override */
.MuiButton-contained {
  background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-dark) 100%) !important;
  color: white !important;
  border-radius: var(--radius-md) !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3) !important;
  transition: all var(--transition-base) !important;
}

.MuiButton-contained:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4) !important;
}

.MuiButton-contained:active {
  transform: translateY(0) !important;
}

.MuiButton-contained:disabled {
  opacity: 0.5;
  transform: none !important;
  box-shadow: none !important;
}

/* Responsive grid overrides */
.grid-cols-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
.grid-cols-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }

@media (max-width: 768px) {
  .grid-cols-4 { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(2, 1fr); }
  .page-title { font-size: 1.75rem; }
  .page-description { font-size: 0.9375rem; }
  .card { padding: 1.25rem; }
}

@media (max-width: 480px) {
  .grid-cols-4,
  .grid-cols-3 { grid-template-columns: 1fr; }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 3: frontend/src/pages/Dashboard.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

At the top of the file, after all imports and before the export, add these seven SVG
icon components:

const InventoryIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const PurchaseIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);
const WorkOrderIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const BuildingIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/>
    <line x1="8" y1="6" x2="8" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/>
    <line x1="8" y1="10" x2="8" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/>
    <line x1="8" y1="14" x2="8" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/>
  </svg>
);
const RoomIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const ReferenceIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

Then update the JSX inside the Dashboard component. For each card, replace the text
initial inside the feature-icon div with the matching component:
  inventory card:   <div className="feature-icon inventory"><InventoryIcon /></div>
  purchase card:    <div className="feature-icon purchase"><PurchaseIcon /></div>
  work order card:  <div className="feature-icon maintenance"><WorkOrderIcon /></div>
  users card:       <div className="feature-icon users"><UsersIcon /></div>
  supervisors card: <div className="feature-icon settings"><BuildingIcon /></div>
  rooms card:       <div className="feature-icon rooms"><RoomIcon /></div>
  reference card:   <div className="feature-icon settings"><ReferenceIcon /></div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 4: frontend/src/styles/global.css
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. After the * { box-sizing... } reset block and before the body { } rule, add:

button, input, select, textarea {
  font-family: inherit;
}

2. After the .btn-lg rule block, add:

/* MUI Button shape — matches .btn border-radius globally */
.MuiButton-contained,
.MuiButton-outlined {
  border-radius: var(--radius-md) !important;
}

After making all changes, confirm the exact lines changed in each file and run the
Docker image builds to verify:
  docker compose -f docker-compose.dev.yml build backend
  docker compose -f docker-compose.dev.yml build frontend
```

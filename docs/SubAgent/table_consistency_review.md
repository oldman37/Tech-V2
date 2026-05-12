# Table Consistency Review — Field Trip & Transportation Pages

**Reviewer**: Copilot (Automated Review)  
**Date**: 2026-05-11  
**Spec**: `docs/SubAgent/table_consistency_spec.md`  
**Build Result**: **SUCCESS**  
**Overall Assessment**: **NEEDS_REFINEMENT** (1 CRITICAL issue found)

---

## Build Validation

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS — 0 type errors |
| `npm run build` | ✅ PASS — built in 2.34s |
| Warnings | Vite deprecation warnings (esbuild→oxc migration), chunk size warning — pre-existing, unrelated |

---

## File-by-File Review

### 1. `frontend/src/pages/FieldTrip/FieldTripListPage.tsx`

#### Pattern Matching

| Aspect | Reference (PO/WO) | Implementation | Match |
|--------|-------------------|----------------|-------|
| Title variant | `h5` | `h5` | ✅ |
| Title fontWeight | 600–700 | `600` | ✅ |
| `component="h1"` removed | N/A | Removed | ✅ |
| Wrapper `<Box sx={{ p: 3 }}>` | Yes | Yes | ✅ |
| Header flex layout | `justifyContent: 'space-between', gap: 1, mb: 3` | Matches exactly | ✅ |
| Search `<TextField>` + `SearchIcon` | `InputAdornment`, `minWidth: 220–240` | `InputAdornment`, `minWidth: 220` | ✅ |
| Status Select `displayEmpty` | `<Select displayEmpty>` | `<Select displayEmpty>` | ✅ |
| Filter bar `mb: 2` | `mb: 2` | `mb: 2` | ✅ |
| MobileFilterBar | Used on mobile | ✅ Used with `filterCount`, `searchPlaceholder` | ✅ |
| Mobile filter drawer | `<Paper sx={{ p: 2, mt: 1 }}>` | Matches | ✅ |
| Paper around table | WO: `variant="outlined"` | `<Paper variant="outlined">` | ✅ |
| TablePagination | `rowsPerPageOptions={[10,25,50,100]}` | Exact match, outside Paper (WO pattern) | ✅ |
| Import aliases | `@/` | All `@/` | ✅ |
| MobileFilterBar import | From `@/components/responsive` | ✅ | ✅ |
| Button mobile width | `sx={{ ...(isMobile && { width: '100%' }) }}` | Matches WO pattern | ✅ |

#### Functionality

| Check | Status |
|-------|--------|
| Search filters across destination, teacher, school | ✅ |
| Status filter narrows by `FieldTripStatus` | ✅ |
| `filteredTrips` memo with search + status | ✅ |
| `paginatedTrips` slices `filteredTrips` | ✅ |
| Page resets to 0 on search change | ✅ |
| Page resets to 0 on status change | ✅ |
| Page resets to 0 on rows-per-page change | ✅ |
| Clear Filters resets all state | ✅ |
| Row click navigates to detail | ✅ |
| View button in rowActions | ✅ |
| Loading/error states preserved | ✅ |

#### Security & TypeScript

| Check | Status |
|-------|--------|
| No `console.log` | ✅ |
| No `any` types | ✅ |
| No unused imports | ✅ |
| Status cast uses union type `FieldTripStatus \| ''` | ✅ |

#### Verdict: **PASS** — Fully matches reference patterns.

---

### 2. `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`

#### Pattern Matching

| Aspect | Reference (PO/WO) | Implementation | Match |
|--------|-------------------|----------------|-------|
| Title variant | `h5` | `h5` | ✅ |
| Title fontWeight | 600–700 | `600` | ✅ |
| `component="h1"` removed | N/A | Removed | ✅ |
| Subtitle `body2` + `text.secondary` | PO has same | Matches | ✅ |
| Tabs `variant="scrollable"` | Always `scrollable` | ✅ | ✅ |
| Tabs `scrollButtons="auto"` | Yes | ✅ | ✅ |
| Tabs `allowScrollButtonsMobile` | Yes | ✅ | ✅ |
| Tab mobile styling override | `'& .MuiTab-root': { minWidth: 'auto', px: 1.5, fontSize: '0.8rem' }` | Matches exactly | ✅ |
| Tabs `mb: 2` | `mb: 2` | ✅ (was `mb: 3`) | ✅ |
| Paper around table | `variant="outlined"` | Both tables wrapped | ✅ |
| Import aliases | `@/` | All `@/` | ✅ |
| Paper import added | Yes | ✅ | ✅ |

#### Functionality

| Check | Status |
|-------|--------|
| Tab switching works | ✅ |
| Error states per tab | ✅ |
| Row click navigates to detail | ✅ |
| View button in rowActions | ✅ |
| Data fetching preserved | ✅ |
| Transport tab lazy-loaded (`enabled: activeTab === 1`) | ✅ |

#### Missing Items (by design — approval pages)

The spec did not require search/filter/pagination for this page (sections 5B.1–5B.5 only covered typography, tabs, Paper wrapping, and import aliases). The approval queue shows only pending items scoped by the backend — a small dataset that doesn't need client-side pagination. This is appropriate and consistent with approval-queue UX patterns.

#### Security & TypeScript

| Check | Status |
|-------|--------|
| No `console.log` | ✅ |
| No `any` types | ✅ |
| No unused imports | ✅ |

#### Verdict: **PASS** — All spec-required changes implemented correctly.

---

### 3. `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`

#### Pattern Matching

| Aspect | Reference (PO/WO) | Implementation | Match |
|--------|-------------------|----------------|-------|
| Title variant | `h5` | `h5` | ✅ |
| Title fontWeight | 600–700 | `600` | ✅ |
| `component="h1"` removed | N/A | Removed | ✅ |
| Search `<TextField>` + `SearchIcon` | `InputAdornment`, `minWidth: 220–240` | `InputAdornment`, `minWidth: 220` | ✅ |
| Status Select `displayEmpty` | `<Select displayEmpty>` | `<Select displayEmpty>` | ✅ |
| Filter bar `mb: 2` (desktop) | `mb: 2` | `mb: 2` | ✅ |
| Date filters `<TextField type="date">` | PO: `sx={{ width: 150 }}` | `sx={{ width: 150 }}` | ✅ |
| Clear Filters button (conditional) | Shown when any filter active | ✅ Matches PO pattern | ✅ |
| MobileFilterBar | Used on mobile | ✅ With `filterCount`, `searchPlaceholder` | ✅ |
| Mobile filter drawer | `<Paper sx={{ p: 2, mt: 1 }}>` stacked controls | ✅ Matches | ✅ |
| Paper around table | `variant="outlined"` | `<Paper variant="outlined">` | ✅ |
| TablePagination | `rowsPerPageOptions={[10,25,50,100]}` outside Paper | ✅ | ✅ |
| Import aliases | `@/` | All `@/` | ✅ |
| MobileFilterBar import | From `@/components/responsive` | ✅ | ✅ |
| Button mobile width | `sx={{ ...(isMobile && { width: '100%' }) }}` | ✅ | ✅ |

#### Functionality

| Check | Status | Notes |
|-------|--------|-------|
| Search filters across school, group, sponsor | ✅ | |
| Status filter narrows results | ✅ | Server-side via queryKey |
| Date filters (from/to) | ✅ | Server-side via queryKey |
| `filteredRows` memo with client-side search | ✅ | |
| `paginatedRows` slices `filteredRows` | ✅ | |
| Page resets on search change | ✅ | |
| Page resets on clear filters | ✅ | |
| Page resets on rows-per-page change | ✅ | |
| **Page resets on status filter change** | **❌ MISSING** | Lines 173, 230: `setPage(0)` not called |
| **Page resets on date filter change** | **❌ MISSING** | Lines 186, 195, 243, 252: `setPage(0)` not called |
| Row click navigates to detail | ✅ | |
| View button in rowActions | ✅ | |

#### Security & TypeScript

| Check | Status |
|-------|--------|
| No `console.log` | ✅ |
| No `any` types | ✅ |
| No unused imports | ✅ |
| Status type uses `string` instead of union | See RECOMMENDED below |

#### Verdict: **NEEDS_REFINEMENT** — Missing `setPage(0)` on filter changes.

---

## Findings Summary

### CRITICAL (Must Fix)

**C1. TransportationRequestsPage: Missing `setPage(0)` on status and date filter changes**

When the user changes the status dropdown or date pickers, the pagination page is not reset to 0. If the user is on page 2+ and applies a filter that reduces results to fewer pages, they will see an empty table.

**Affected lines** (6 locations):
- Line 173: mobile status filter `onChange` — missing `setPage(0)`
- Line 186: mobile from-date `onChange` — missing `setPage(0)`
- Line 195: mobile to-date `onChange` — missing `setPage(0)`
- Line 230: desktop status filter `onChange` — missing `setPage(0)`
- Line 243: desktop from-date `onChange` — missing `setPage(0)`
- Line 252: desktop to-date `onChange` — missing `setPage(0)`

**Fix**: Add `setPage(0)` to each onChange handler, matching the PO/WO/FieldTrip patterns:
```tsx
// Example for status:
onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
// Example for dates:
onChange={(e) => { setFromFilter(e.target.value); setPage(0); }}
```

**File**: `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`

---

### RECOMMENDED (Should Fix)

**R1. TransportationRequestsPage: `statusFilter` typed as `string` instead of union**

The `statusFilter` state is `useState<string>('')` rather than `useState<TransportationRequestStatus | ''>('')`. While functionally equivalent, the reference pages (PO, FieldTrip) use the explicit union type for type safety.

**File**: `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx`, line ~101

**R2. InputProps vs slotProps inconsistency (cross-codebase)**

PO desktop filter bar uses the newer `slotProps.input` API while WO and the target pages use the legacy `InputProps`. Both work, but `slotProps` is the forward-compatible MUI v6+ API. This is noted for future alignment — not blocking.

---

### OPTIONAL (Nice to Have)

**O1. FieldTripApprovalPage: No search/filter/pagination**

The approval page shows pending items without search or pagination. This is appropriate for small approval queues and was not required by the spec. If the approval list grows large in the future, adding filters would improve UX.

**O2. emptyMessage text style variation**

FieldTripListPage uses a more helpful empty message (`'No field trip requests found. Click "New Request" to create one.'`) while the other pages use plain messages. This is a positive UX touch and could be considered for TransportationRequestsPage too.

---

## Summary Score Table

| Criterion | FieldTripListPage | FieldTripApprovalPage | TransportationRequestsPage |
|-----------|:-:|:-:|:-:|
| Title Typography | ✅ | ✅ | ✅ |
| Search Field | ✅ | N/A | ✅ |
| Filter Bar (Desktop) | ✅ | N/A | ✅ |
| MobileFilterBar | ✅ | N/A | ✅ |
| Paper Wrapper | ✅ | ✅ | ✅ |
| TablePagination | ✅ | N/A | ✅ |
| Page Reset on Filters | ✅ | N/A | ❌ |
| Select `displayEmpty` | ✅ | N/A | ✅ |
| Import Aliases (`@/`) | ✅ | ✅ | ✅ |
| Tab Styling | N/A | ✅ | N/A |
| No `any` Types | ✅ | ✅ | ✅ |
| No `console.log` | ✅ | ✅ | ✅ |
| No Unused Imports | ✅ | ✅ | ✅ |
| Existing Features Preserved | ✅ | ✅ | ✅ |
| TypeScript Build | ✅ | ✅ | ✅ |
| Vite Build | ✅ | ✅ | ✅ |
| **Score** | **15/15** | **8/8** | **14/15** |

**Overall Grade**: **B+** (1 CRITICAL defect in 1 of 3 files)

---

## Affected File Paths

- `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` — PASS
- `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` — PASS
- `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` — NEEDS_REFINEMENT

## Priority Recommendations

1. **[CRITICAL] Fix `setPage(0)` on all TransportationRequestsPage filter changes** — 6 lines to update, prevents empty-table bug when filtering from a non-zero page
2. **[RECOMMENDED] Type `statusFilter` as `TransportationRequestStatus | ''`** — minor type safety improvement

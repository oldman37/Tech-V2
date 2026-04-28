# Plan: Combine System Settings & New Fiscal Year into a Unified Admin Settings Page

## Current State

There are currently **two separate admin pages** that manage system-level configuration:

| Page | Route | File |
|------|-------|------|
| **System Settings** | `/admin/settings` | `frontend/src/pages/admin/AdminSettings.tsx` |
| **New Fiscal Year** | `/admin/new-fiscal-year` | `frontend/src/pages/admin/NewFiscalYear.tsx` |

### System Settings (`AdminSettings.tsx`)
A single flat form with 6 MUI Card sections:
1. **Requisition Numbers** — prefix + next sequence number + preview
2. **Purchase Order Numbers** — prefix + next sequence number + preview
3. **Notification Emails** — supervisor, purchasing, DOS stage emails (missing `poEntryStageEmail`)
4. **Approval Stage Permission Levels** — supervisor, finance director, DOS min levels
5. **Fiscal Year** — read-only display of current FY + link to New Fiscal Year page
6. **Workflow Settings** — supervisor bypass toggle

### New Fiscal Year (`NewFiscalYear.tsx`)
A 5-step MUI Stepper wizard:
1. Confirm Fiscal Year (label → auto-computed July 1 – June 30 dates)
2. Handle In-Progress Requisitions (carry forward / deny drafts / deny all + reason)
3. Reset Number Sequences (same REQ/PO prefix + number fields)
4. Workflow Settings (all emails + approval levels + supervisor bypass — duplicates AdminSettings)
5. Review & Confirm (read-only summary with destructive-action dialog)

### Problems with Current Design
- **Two sidebar entries** for related admin config — confusing navigation
- **Duplicated settings** — Step 4 of the fiscal year wizard repeats every field from AdminSettings
- **Missing field** — `poEntryStageEmail` exists in the schema/backend but is absent from AdminSettings
- The Fiscal Year card in AdminSettings is just a read-only display + link — not useful without context
- Users must mentally track two separate pages for one conceptual area

---

## Proposed Design: Tabbed Admin Settings Page

Merge both pages into a **single Admin Settings page** at `/admin/settings` with **MUI Tabs** for clear organization.

### Tab Structure

```
┌─────────────────────────────────────────────────────┐
│  Admin Settings                                     │
│                                                     │
│  ┌──────────┬────────────────┬──────────────────┐   │
│  │ General  │ Requisitions   │ Fiscal Year      │   │
│  └──────────┴────────────────┴──────────────────┘   │
│                                                     │
│  [Tab Content Area]                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Tab 1: General
Contains system-wide settings that aren't requisition-specific.

| Section | Fields | Notes |
|---------|--------|-------|
| **Workflow Settings** | `supervisorBypassEnabled` toggle | Moved to top-level for visibility |

> This tab is intentionally slim now. As the system grows (helpdesk, maintenance, etc.), non-requisition settings will live here.

#### Tab 2: Requisitions & Purchase Orders
All requisition/PO configuration in one place.

| Section | Fields | Notes |
|---------|--------|-------|
| **Requisition Numbers** | `reqNumberPrefix`, `nextReqNumber` + preview | Unchanged |
| **Purchase Order Numbers** | `poNumberPrefix`, `nextPoNumber` + preview | Unchanged |
| **Notification Emails** | `supervisorStageEmail`, `purchasingStageEmail`, `dosStageEmail`, **`poEntryStageEmail`** | **Add missing `poEntryStageEmail` field** |
| **Approval Stage Permission Levels** | `supervisorApprovalLevel`, `financeDirectorApprovalLevel`, `dosApprovalLevel` | Unchanged |

Each section retains its existing MUI Card layout. A single Save/Reset button bar at the bottom handles all fields.

#### Tab 3: Fiscal Year
Combines the current FY display and the rollover wizard into one tab.

| Section | Content | Notes |
|---------|---------|-------|
| **Current Fiscal Year** | Read-only: label, period dates, last rollover info, expiration warning | Moved from AdminSettings Fiscal Year card |
| **Start New Fiscal Year** (collapsible/expandable) | The full wizard: confirm FY label, handle in-progress requisitions, reset number sequences, review & confirm | Stripped of duplicated settings (emails, approval levels, bypass) — those are now always on the Requisitions tab |

**Key change:** The wizard no longer includes its own Step 4 (Workflow Settings). During rollover, number sequences are reset in the wizard, but email/approval/workflow settings are always managed on the Requisitions tab. This eliminates duplication.

---

## Implementation Plan

### Phase 1: Frontend — Restructure AdminSettings with Tabs

**File:** `frontend/src/pages/admin/AdminSettings.tsx`

1. **Add tab state** — `useState<number>` for active tab index, with URL hash sync (`#general`, `#requisitions`, `#fiscal-year`) for deep-linking
2. **Add MUI `Tabs` + `Tab` components** at the top of the page
3. **Create three tab panel components** (can be inline or extracted):
   - `GeneralTab` — workflow settings card
   - `RequisitionsTab` — number sequences, notification emails (add `poEntryStageEmail`), approval levels
   - `FiscalYearTab` — current FY display + embedded rollover wizard
4. **Update the form schema** to include `poEntryStageEmail`
5. **Keep the single React Hook Form instance** — all three tabs share the same form, with a single Save button visible on General and Requisitions tabs

### Phase 2: Frontend — Embed Fiscal Year Wizard

**File:** `frontend/src/pages/admin/AdminSettings.tsx` (FiscalYearTab section)

1. **Move the fiscal year wizard logic** from `NewFiscalYear.tsx` into a `FiscalYearTab` component
2. **Simplify the wizard to 4 steps** (remove old Step 4 — Workflow Settings):
   - Step 1: Confirm Fiscal Year (label + dates)
   - Step 2: Handle In-Progress Requisitions (carry forward / deny)
   - Step 3: Reset Number Sequences (REQ/PO prefix + starting number)
   - Step 4: Review & Confirm (summary of FY changes only)
3. **Show the wizard behind a button/accordion** — default view is read-only FY info; clicking "Start New Fiscal Year" expands the wizard stepper inline
4. Retain the confirmation dialog before final submission
5. On success, invalidate queries and show success banner within the tab

### Phase 3: Frontend — Cleanup

1. **Delete** `frontend/src/pages/admin/NewFiscalYear.tsx`
2. **Remove the route** `/admin/new-fiscal-year` from `App.tsx`
3. **Remove the sidebar entry** "New Fiscal Year" from `AppLayout.tsx`
4. **Add a redirect** from `/admin/new-fiscal-year` → `/admin/settings#fiscal-year` for any bookmarked links
5. **Update the sidebar label** from "System Settings" to "Admin Settings" (optional, for clarity)

### Phase 4: Frontend — Add Missing `poEntryStageEmail`

1. **Add `poEntryStageEmail` to the form schema** in AdminSettings
2. **Add the field** to the Notification Emails card in the Requisitions tab
3. **Add it to the form `defaultValues`** and the `useEffect` that populates the form from API data
4. **Include it in the `onSubmit` payload** (convert empty string → null like other email fields)

### Phase 5: Backend — No Changes Required

The backend already:
- Stores `poEntryStageEmail` in the `SystemSettings` Prisma model
- Accepts it in the `UpdateSettingsSchema` validator
- Returns it from `GET /api/settings`

No backend changes needed unless we want to add a redirect endpoint for `/admin/new-fiscal-year`.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/pages/admin/AdminSettings.tsx` | **Major rewrite** | Add Tabs, restructure into 3 tab panels, embed fiscal year wizard, add `poEntryStageEmail` |
| `frontend/src/pages/admin/NewFiscalYear.tsx` | **Delete** | Wizard logic absorbed into AdminSettings FiscalYearTab |
| `frontend/src/App.tsx` | **Edit** | Remove `/admin/new-fiscal-year` route, add redirect to `#fiscal-year` |
| `frontend/src/components/layout/AppLayout.tsx` | **Edit** | Remove "New Fiscal Year" sidebar item |
| `frontend/src/services/settingsService.ts` | **No change** | Already supports all needed endpoints |
| `backend/*` | **No change** | Already supports `poEntryStageEmail` and all API endpoints |

---

## UX Considerations

- **Tab persistence:** Navigating away and back should remember the last active tab (URL hash sync)
- **Unsaved changes warning:** If the user has dirty fields in the General/Requisitions tabs and switches to Fiscal Year, warn before discarding (or keep form state across tabs since it's a single form)
- **Wizard isolation:** The fiscal year wizard's stepper state is independent of the settings form — it uses its own form instance and mutation, same as today
- **Responsive layout:** Tabs should stack vertically on mobile (MUI `variant="scrollable"`)
- **Permission check:** All tabs remain admin-only (no change to `ProtectedRoute`)

---

## Migration Risk: Low

- No database changes
- No API changes
- No backend changes
- Pure frontend reorganization
- Redirect covers existing bookmarks/links
- All existing functionality preserved, just restructured

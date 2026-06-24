# Provisioning Frontend — Spec

## Current State

Backend API is fully implemented at `/api/provisioning` (admin-only, CSRF-protected):
- `POST /run` — trigger a job (`userType`, `testMode` body fields); returns counts + durationMs + testMode flag
- `GET /audit` — paginated audit log; optional `?testMode=true/false` filter; returns `{ rows, total, page, limit, pages }`
- `GET /config` — returns masked passwords + updatedAt/By + `testModeEnv` boolean
- `PATCH /config` — update staffPassword and/or studentPassword

No frontend exists yet.

## Problem Definition

Admins need a web UI to:
1. Trigger provisioning runs on demand with control over scope and test mode
2. Manage the default initial passwords for new accounts
3. Review the audit log to see what was created/updated/disabled

## Proposed Solution

A single page at `/admin/provisioning` (admin-only, `requireAdmin`).  
Follows the AdminJobsPage pattern: card-based layout, no DataGrid, plain MUI Table for audit log.

Three sections rendered vertically:

### Section 1 — Run Job card

- **UserType** select: All Users / Staff Only / Students Only (maps to ALL/STAFF/STUDENT)
- **Test Mode** checkbox: checked by default when `testModeEnv === true` from config response; unchecked = real Graph writes
- **Confirm dialog** before running when test mode is OFF (warns that real Entra accounts will be created/disabled)
- **Run Now** button (disabled while pending; spinner while running)
- After run: success Alert showing "Created N · Deprovisioned N · Updated N · Errors N · Duration Xs [TEST]"
- Error Alert on failure

### Section 2 — Password Config card

- Shows "Staff password: ••••••••  Last updated by X on DATE" (or "Not configured")
- Shows "Student password: ••••••••  Last updated by X on DATE"
- **Edit** button → toggles inline form with two password fields (TextField type="password") + Save/Cancel
- Save calls PATCH /config; invalidates config query; collapses form on success
- Validation: both fields optional but at least one required; min 8 chars (Zod, same as backend)

### Section 3 — Audit Log table

- Filter chips: All / Real Runs / Test Runs (maps to no param / `testMode=false` / `testMode=true`)
- Pagination: 50 rows/page, Previous/Next buttons
- Columns: Date/Time | Type | UPN | Employee ID | Action | Error
- Action rendered as a Chip with color:
  - CREATED → success
  - UPDATED → primary
  - SKIPPED → default
  - DISABLED → warning
  - FAILED → error
  - DRY_RUN_CREATE / DRY_RUN_UPDATE / DRY_RUN_DISABLE → info
- Error column: truncated to 60 chars with Tooltip showing full text on hover
- Empty state: "No audit records" Typography

## Implementation Steps

1. `frontend/src/services/provisioningService.ts` — API client (service object literal pattern)
2. `frontend/src/lib/queryKeys.ts` — add `provisioning` key group
3. `frontend/src/pages/admin/ProvisioningPage.tsx` — full page component (no separate hook files; inline queries/mutations per the admin pages pattern for small feature surfaces)
4. `frontend/src/App.tsx` — add route `/admin/provisioning` with `requireAdmin`
5. `frontend/src/components/layout/AppLayout.tsx` — add nav item under Admin section

## No New Dependencies

All MUI components already used in codebase. No new packages needed. No shared-types changes needed (API response shapes typed locally in the service file).

## Build Commands

- `docker compose -f docker-compose.dev.yml build frontend`
- Preceded by backend build (shared types already current)

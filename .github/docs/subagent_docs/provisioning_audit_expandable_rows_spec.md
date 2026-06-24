# Spec: Provisioning Audit Log — Expandable Detail Rows & Pagination Size Picker

## Current State

`ProvisioningAudit` records store: `id`, `triggeredBy`, `userType`, `upn`, `employeeId`, `action`, `errorMessage`, `createdAt`.

The `patch` object (fields changed during an UPDATED pass) and the account creation body (CREATED pass) are computed in memory but discarded — nothing about *what* changed is persisted. The frontend hardcodes `LIMIT = 50`.

## Problem

1. Admins have no way to know which fields were changed/set for a given audit entry without digging into server logs.
2. The page-size is fixed at 50 with no user control.

## Proposed Solution

### Feature 1 — `details` column + expandable UI rows

Add a `details JSONB` nullable column to `provisioning_audit`. Populate it from the provisioning service for the actions where it is meaningful:

| Action | `details` shape |
|--------|----------------|
| UPDATED / REENABLED / DRY_RUN_UPDATE | `{ patch: { field: newValue, ... } }` |
| CREATED / DRY_RUN_CREATE | `{ fields: { displayName, givenName, surname, jobTitle\|department, ageGroup, employeeType, officeLocation } }` |
| All others | `null` (no change) |

Password data must **never** be included in `details` — strip `passwordProfile` from the creation body before storing.

Frontend: add an expand/collapse chevron icon as the first column of the audit table. Clicking the row (or chevron) opens a `Collapse` panel in a sub-`TableRow` showing the `details` fields as a compact key-value grid. Rows with no `details` still expand but show "No details recorded for this entry."

### Feature 2 — Pagination size picker

Replace the hardcoded `const LIMIT = 50` in `AuditLogSection` with `const [limit, setLimit] = useState(50)`. Add a `Select` control next to the pagination buttons offering `[25, 50, 100]` rows per page. Changing the selection resets `page` to `1`. The backend already accepts `limit` up to 100 via query param — no backend change needed for this feature.

## Implementation Steps

1. `backend/prisma/schema.prisma` — add `details Json?` to `ProvisioningAudit`
2. `backend/prisma/migrations/20260623140000_add_provisioning_audit_details/migration.sql` — `ALTER TABLE "provisioning_audit" ADD COLUMN "details" JSONB;`
3. `backend/src/services/userProvision.service.ts` — add `details?: Record<string, unknown>` to `writeAudit` opts; pass patch/fields at each relevant `writeAudit` call
4. `frontend/src/services/provisioningService.ts` — add `details?: Record<string, unknown>` to `ProvisioningAuditRow`
5. `frontend/src/pages/admin/ProvisioningPage.tsx` — expandable rows + pagination size picker

## Risks / Mitigations

- **Existing records have no `details`**: expected; UI handles `null` gracefully with "No details recorded" message.
- **Password in details**: mitigated by explicitly excluding `passwordProfile` from the creation body before storing.
- **Schema migration**: no data loss — column is nullable.

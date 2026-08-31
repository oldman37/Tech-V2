# Staff `department` = "Staff" — Spec

## Current State Analysis

`backend/src/services/userProvision.service.ts` never sets `department` for `STAFF` rows
today — only `jobTitle` (from SIS `StaffType`) and `employeeType` (always `"Staff"`).
`department` is only reconciled for `STUDENT` (`Grade ${grade}`). Confirmed via the user
(field is blank for staff today) and directly via the live `staff.csv`
(`docker exec tech-v2-backend-1 sh -c "head -3 /sis-data/staff.csv"` — columns are
`First Name, Last Name, School, BadgeNumber, StaffType`, no department source at all).

## Problem Definition

For staff accounts, set Entra `department` to the literal string `"Staff"` — a fixed
value, not derived from CSV data. `employeeType` (already `"Staff"`) is untouched by this
change; both fields will independently read `"Staff"`.

## Proposed Solution

In `backend/src/services/userProvision.service.ts`, inside the existing
`if (type === 'STAFF')` blocks (both PASS 1 UPDATE and PASS 2 CREATE):

- **PASS 1 (UPDATE):** `if ('Staff' !== (entraUser.department ?? '')) patch['department'] = 'Staff';`
  — same diff-and-patch shape already used for every other field.
- **PASS 2 (CREATE):** `body['department'] = 'Staff';` — unconditional, since it's a fixed
  value, not CSV-derived.

`FIELD_LABELS.department` already exists (`'Department'`), shared with the student
branch — no change needed there.

No CSV parsing changes, no new interfaces, no Prisma/migration changes, no new Graph
`$select` fields (`department` is already selected for both types).

## Risks and Mitigations

- Confirmed blank today for staff (both by the user directly and via absence of any
  write path in the code) — no existing data to lose, unlike the `country`/ELL case.
- Idempotent: re-runs compare against the live value and only patch on mismatch, so
  running this repeatedly doesn't cause repeated writes once set.

## Build Command

`docker compose -f docker-compose.dev.yml build backend` (per CLAUDE.md Resource
Constraints — the only approved compile gate).

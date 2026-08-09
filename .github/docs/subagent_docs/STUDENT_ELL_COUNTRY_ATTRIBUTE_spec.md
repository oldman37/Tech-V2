# Student ELL/ESL → Entra `country` Attribute — Spec

## Current State Analysis

### The provisioning system

`backend/src/services/userProvision.service.ts` (`runProvisioningJob` → `runForType`)
is Tech-V2's SIS-to-Entra reconciliation job. For `STUDENT` it runs three passes against
the SIS CSV (`SIS_STUDENT_CSV`, default `/sis-data/students.csv`, same shape as
`docs/students.csv`):

- **PASS 1 (UPDATE)** — for every SIS row with a matching Entra account (`employeeId` = `s<Student ID>`),
  builds a `patch` object of only the fields that differ, then `PATCH /users/{id}`.
- **PASS 2 (CREATE)** — for SIS rows with no Entra match, `POST /users` with a full `body`.
- **PASS 3 (DISABLE)** — unchanged by this feature.

Both passes already reconcile `officeLocation`, `companyName`, `department`, `ageGroup`,
`consentProvidedForMinor`, name fields, etc. the same way this feature needs to reconcile
`country`.

`StudentRow` / `parseStudentCSV()` (lines 46-53, 240-263) currently **do not** read the
`ELL/ESL` CSV column at all — it's parsed for staff-vs-student row shape but dropped.

`EntraUser` (lines 76-91) and the `$select` in `fetchEntraUsersByUpnDomain()` (line 312)
do **not** currently fetch `country`, so the update pass has no way to compare against it.

### Verified separately (this conversation), not derivable from the repo

- Microsoft Graph's `user.country` property is a free-text string (max 128 chars, nullable,
  no server-side format validation) — confirmed against the official
  [Graph `user` resource docs](https://learn.microsoft.com/en-us/graph/api/resources/user).
- This tenant is formerly hybrid. Per `user-provisioning-plan.md`, `extensionAttribute1-15`
  are permanently Graph-write-locked for accounts with on-prem sync history and must be
  written via Exchange Online instead — **but this lock does not extend to `country`**.
  Confirmed empirically: the user set `Country or region = ELL` on a live student account
  (`Amelia Curtis`, on-premises immutable ID present, on-premises sync currently disabled)
  through the Entra admin portal, and it saved successfully. Portal edits to native
  `directoryObject`/`user` properties go through Graph, so this proves `Update-MgUser`/
  `PATCH /users/{id}` with `{ "country": "ELL" }` will work.
- Exchange Online's equivalent cmdlet parameter, `Set-Mailbox`/`Set-User -CountryOrRegion`,
  is **not** usable for this — it's typed `CountryInfo` and Microsoft's own docs state it
  requires "a valid ISO 3166-1 two-letter country code... or the corresponding friendly
  name," so `"ELL"` would be rejected by that specific path. This confirms the write must
  go through Graph (i.e. `userProvision.service.ts`, which already holds
  `User.ReadWrite.All` via `PROVISIONING_CLIENT_*`), not through
  `docs/UpdateCustomExtensionAttributes.ps1` (Exchange-only, and explicitly forbidden from
  calling `Update-MgUser` per its own review doc).
- `country` is distinct from `usageLocation` (licensing-relevant, stays `"US"`, untouched
  by this change) and is confirmed currently unused for every student (`this field is wide
  open` — user's words), so there's no existing data to collide with.

## Problem Definition

For students whose SIS `ELL/ESL` column is `"Y"`, set the Entra `country` property to the
literal string `"ELL"` so an Entra dynamic security group can be built on the rule
`user.country -eq "ELL"`. When a student's `ELL/ESL` flag is later cleared (column goes
blank), the next provisioning run must clear `country` back to blank — the field is fully
owned by this job for students, not just set-once.

This applies to **STUDENT** rows only — the staff CSV has no `ELL/ESL` column, and staff
`country` is untouched by this feature.

## Proposed Solution

All changes are confined to `backend/src/services/userProvision.service.ts`.

1. **`StudentRow`** — add `ell: string` (raw CSV value, `"Y"` or `""`).
2. **`parseStudentCSV()`** — read `row['ELL/ESL']?.trim() ?? ''` into `ell`, same pattern
   as the other column reads immediately above it.
3. **`EntraUser`** — add `country: string | null`.
4. **`fetchEntraUsersByUpnDomain()`** — append `country` to the `$select` string.
5. **PASS 1 (UPDATE)**, inside the existing `if (type === 'STUDENT')` block: compute
   `expectedCountry = row.ell.toUpperCase() === 'Y' ? 'ELL' : null` and diff it against
   `entraUser.country ?? null`, adding `patch['country']` (string or `null`) when they
   differ — same diff-and-patch shape already used for every other field in this block.
   `patch` is already typed `Record<string, string | boolean | null>`, so no type change
   needed there. Sending `country: null` in the `PATCH` body clears the property.
6. **PASS 2 (CREATE)**, inside the existing `else` (STUDENT) branch: `if
   (row.ell.toUpperCase() === 'Y') body['country'] = 'ELL';` — omitted entirely otherwise,
   consistent with how other optional creation fields are handled.
7. **`FIELD_LABELS`** — add `country: 'ELL/ESL flag'` so the provisioning report's
   human-readable `changes` list (`UpdatedAccount.changes`) reads sensibly instead of
   showing the raw `country` key.

No Prisma schema/migration changes — confirmed `userSync.service.ts` (the local-DB mirror)
never reads or stores `country`, so this is a pure Entra-side attribute with no Tech-V2 DB
footprint.

No new dependencies, no new routes/validators — this is an internal reconciliation-logic
change inside an already-approved Graph write path (`User.ReadWrite.All` is already
granted and already used for `officeLocation`/`department`/etc. patches on these same
requests).

## Implementation Steps

1. Add `ell` to `StudentRow` and `parseStudentCSV()`.
2. Add `country` to `EntraUser` and the `$select` clause.
3. Add the ELL diff/patch logic to PASS 1's STUDENT branch.
4. Add the ELL body field to PASS 2's STUDENT branch.
5. Add the `FIELD_LABELS` entry.

## Configuration Changes

None. Uses the existing `SIS_STUDENT_CSV` path and existing `PROVISIONING_CLIENT_*` Graph
credentials.

## Risks and Mitigations

- **Risk:** A student's `country` was set to something else for an unrelated reason before
  this feature ships. **Mitigation:** confirmed by the user that this field is not
  currently used for students — not a live concern, but worth a one-line callout in the
  PR/commit description in case that assumption is wrong for some record.
- **Risk:** Test-mode dry runs (`PROVISIONING_TEST_MODE`) must not send the `country`
  patch/body field live. **Mitigation:** no new code path is needed — both passes already
  gate all `client.api(...).patch/post(...)` calls behind the existing `if (!testMode)`
  checks; the new `country` field rides inside the same `patch`/`body` objects.
- **Risk:** `country: null` silently dropped instead of clearing the field if Graph
  treats `undefined`/`null` differently in a `PATCH` body via the JS Graph SDK.
  **Mitigation:** verify in Phase 3 with a real dry-run log inspection (`patch` object in
  the audit `details` — testable without live Graph writes since test mode logs the would-be
  patch) that a previously-`"ELL"` student produces `patch.country === null`, not a missing
  key.

## Build / Test Commands for Phase 3

- `docker compose -f docker-compose.dev.yml build backend` (compiles `shared` → generates
  Prisma client → compiles backend `tsc`) — the only available compile gate per
  `CLAUDE.md` Resource Constraints (no host `node_modules`).
- No functional test suite exists for this service (`backend` vitest has no test files) —
  Phase 3 review will additionally trace the diff logic by hand against the `docs/students.csv`
  sample rows (`ELL/ESL = "Y"` vs `""`) and confirm the existing `PROVISIONING_TEST_MODE`
  dry-run path logs the expected `patch`/`body` shape without any live Graph write.

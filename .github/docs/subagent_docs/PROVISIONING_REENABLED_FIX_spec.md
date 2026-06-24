# PROVISIONING_REENABLED_FIX — Spec

## Problem

Three bugs cause re-enable events to be invisible and silent:

1. **Email never sent**: `sendProvisioningReport` guard at line 1471 skips the email when
   `created.length === 0 && deprovisioned.length === 0`. A run that only re-enables users
   exits here and no email is sent.

2. **Audit action indistinguishable**: Re-enable events are written to `provisioning_audit`
   with action `UPDATED` — the same action used for a normal field-change. There is no way
   to filter or identify re-enables in the audit log.

3. **`reEnabled` excluded from email body**: `sendProvisioningReport` signature does not
   include `reEnabled`; even if the guard were fixed, there is no re-enabled section in the
   HTML and no re-enabled count in the subject line.

## Solution

### A — Distinct audit action `REENABLED`

In Pass 1 (UPDATE) of `userProvision.service.ts`, compute the action after checking
`wasDisabled`:

```typescript
const action = testMode ? 'DRY_RUN_UPDATE' : (wasDisabled ? 'REENABLED' : 'UPDATED');
```

Add `'REENABLED'` to the real-runs filter array in `provisioning.controller.ts:getAuditLog`.

### B — `reEnabled` promoted to full array in `ProvisioningResult`

Change `reEnabled: number` → `reEnabled: Array<{ displayName, upn, school, userType }>`.

- Initialise as `[]`
- Push user details when `wasDisabled` is true instead of `result.reEnabled++`
- Controller `runProvisioning` response: `reEnabled: result.reEnabled.length` (API contract unchanged — frontend still receives a number)
- Final log: add `reEnabledCount: result.reEnabled.length`

### C — Email fixes

- Guard: add `result.reEnabled.length === 0` to the early-return condition
- Signature: add `reEnabled: Array<...>` field
- Subject: append `, N re-enabled` when `reEnabled.length > 0`
- HTML body: add a "Re-Enabled Accounts" table between the deprovisioned table and the summary

## Files Changed

- `backend/src/services/userProvision.service.ts`
- `backend/src/controllers/provisioning.controller.ts`
- `backend/src/services/email.service.ts`

## No schema/migration needed

All changes are in TypeScript only. No new DB columns.

## Build command

```powershell
docker compose -f docker-compose.dev.yml build backend
```

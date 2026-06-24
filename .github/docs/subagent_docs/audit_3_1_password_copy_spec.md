# Spec: §3.1 — Fix Misleading "Stored Encrypted" Password Copy

**Feature name:** audit_3_1_password_copy
**Severity:** 🟠 High (misleading security claim)
**Effort:** Trivial

## Current State

`ProvisioningPage.tsx:837`:
> "Passwords are stored encrypted and never displayed."

`schema.prisma:2063-2064`: `staffPassword String` / `studentPassword String` — plaintext columns.

The "encrypted" claim is false. The "never displayed" claim is true: `getConfig` in
`provisioning.controller.ts:92-93` returns `MASKED` for both fields regardless of stored value.

## Fix

Single sentence change in `PasswordConfigCard` body text.

Replace:
```
Passwords are stored encrypted and never displayed.
```
With:
```
Passwords are stored on the server and never returned to the browser after saving.
```

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/pages/admin/ProvisioningPage.tsx` | One sentence in `PasswordConfigCard` description |

## Build Commands

- `docker compose -f docker-compose.dev.yml build frontend`

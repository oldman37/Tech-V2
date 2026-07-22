# User Sync Email Fallback — Spec

## Current State Analysis

`UserSyncService.syncUser()` ([backend/src/services/userSync.service.ts:452-483](../../../backend/src/services/userSync.service.ts#L452-L483))
upserts the local `User` row from a Microsoft Graph `/users/{id}` response, setting
`email: graphUser.mail` directly in both the `update` and `create` branches.

`User.email` in `backend/prisma/schema.prisma:516` is a required, unique `String`
(non-nullable). Microsoft Graph's `mail` property is `null` for any account without
a mailbox/mail attribute populated (observed in production for at least one staff
account, "Davy Rainey" / entraId `6fdce7ab-...`, jobTitle "Speech Pathologist").

When `mail` is `null`, `prisma.user.upsert()` throws:

```
Invalid `prisma.user.upsert()` invocation ... Argument `email` must not be null.
```

This is called from `userProvision.service.ts` immediately after every disable/update/
create Graph write during a provisioning run ([lines 487, 702, 793, 895]), so the bug
currently interrupts production provisioning runs whenever a processed account lacks
a Graph `mail` attribute.

## Problem Definition

`graphUser.mail` can legitimately be `null` from Graph, but the schema requires a
non-null, unique `email` string. There is currently no fallback, so the upsert throws
and the sync (and the surrounding provisioning step) fails for that account.

## Proposed Solution

Fall back to `graphUser.userPrincipalName` when `graphUser.mail` is null/empty:

```ts
const email = graphUser.mail || graphUser.userPrincipalName;
```

Rationale:
- `userPrincipalName` is always present and unique on every Entra user object — it
  cannot itself be null, so this fully eliminates the null-argument failure.
- For this tenant, UPNs are already generated as real, routable addresses
  (`@ocboe.com` / `@students.ocboe.com` per `backend/src/utils/upnGenerator.ts`), so
  using UPN as a stand-in email is a reasonable value, not a placeholder.
- No schema/migration change needed. `email.service.ts` already reads `user.email`
  in several places (approver lookups, driver notifications) expecting a real,
  non-null address; keeping the column non-nullable avoids threading null-checks
  through that unrelated code.
- Add the `select` clause already requests `userPrincipalName`? No — the current
  `.select(...)` on line 404 does not include `userPrincipalName`. It must be added
  to the Graph `$select` list so the field is actually present on `graphUser`.

## Implementation Steps

1. In `backend/src/services/userSync.service.ts`:
   - Add `userPrincipalName` to the `.select(...)` field list at line 404.
   - Replace `email: graphUser.mail` with `email: graphUser.mail || graphUser.userPrincipalName`
     in both the `update` (line 455) and `create` (line 470) blocks of the upsert
     (compute once as a local `const email = ...` above the upsert call to avoid
     duplicating the expression).
2. No Prisma schema change, no new migration, no new dependency.

## Dependencies

None — internal code change only, no new external library usage. Per project
Dependency & Documentation Policy, doc verification is not required for this change.

## Configuration Changes

None.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| UPN happens to collide with an existing `email` value for a different user (unique constraint) | Extremely unlikely in practice — UPNs are already unique per Entra tenant and distinct from other users' `mail` values in this dataset; if it ever occurs, the upsert will throw a clear unique-constraint error rather than silently corrupting data |
| Downstream code assumes `email` is always a real deliverable mailbox | Already true today for any user whose `mail` is null pre-fix (the sync would have failed instead of running) — this fix does not make anything about email deliverability worse; it only unblocks the sync |

## Verification

- `docker compose -f docker-compose.dev.yml build backend` succeeds (TypeScript compiles).
- Manually trace: for a Graph user with `mail: null` and `userPrincipalName: "drainey@ocboe.com"`,
  the upsert now receives `email: "drainey@ocboe.com"` instead of `null`.

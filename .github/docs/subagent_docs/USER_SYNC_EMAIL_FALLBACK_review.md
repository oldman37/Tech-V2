# User Sync Email Fallback — Review

## Scope

Reviewed `backend/src/services/userSync.service.ts` changes against
`USER_SYNC_EMAIL_FALLBACK_spec.md`.

## Changes Made

1. Line 404: added `userPrincipalName` to the Graph `$select` list.
2. Added `const email = graphUser.mail || graphUser.userPrincipalName;` computed once,
   above the upsert call.
3. Replaced `email: graphUser.mail` with `email` (shorthand) in both the `update` and
   `create` blocks of `prisma.user.upsert()`.

## Assessment

| Category | Notes |
|---|---|
| Specification Compliance | 100% — matches the spec exactly: select field added, single fallback computed once, used in both upsert branches, no schema/migration change |
| Best Practices | Falls back to a Graph field guaranteed non-null on every user object (`userPrincipalName`), consistent with how `rawLocation`/`officeLocation` already do multi-field fallback a few lines above |
| Consistency | Matches existing style in the file (local `const` computed before the upsert, same pattern as `gradeLevel`/`rawLocation`/`officeLocation`) |
| Maintainability | One-line comment explains the non-obvious reason (Graph `mail` can be null; unique/non-null DB column) |
| Completeness | Both `update` and `create` branches fixed — the only two call sites for `graphUser.mail` in this file |
| Security | No new surface — no Entra group IDs or raw Graph payloads newly exposed; unrelated to auth/CSRF |
| Performance | No additional Graph calls; `userPrincipalName` added to an existing `$select`, not a new request |
| Surgical scope | Only the 3 touched lines relate to the bug; no unrelated refactor |

## Build Validation

Command run (approved in spec, no FORBIDDEN COMMANDS used):

```
docker compose -f docker-compose.dev.yml build backend
```

Result: **SUCCESS** — `tsc` step completed with no errors, image built and tagged.
Full output tail:

```
#23 [builder 18/18] RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build
#23 0.554 > tech-v2-backend@1.5.1 build
#23 0.554 > tsc && node -e "..."
#23 DONE 20.2s
...
 Image tech-v2-backend Built
```

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A |
| Consistency | 100% | A |
| Build Success | 100% | A |

**Overall Grade: A (100%)**

## Returns

- **PASS** — no CRITICAL or RECOMMENDED issues found. No refinement cycle needed.

# Review: User Role Label in Header

## Scope Reviewed
- `backend/src/utils/groupAuth.ts` — `ROLE_LABEL_PRIORITY`, `getPrimaryRoleLabel()`
- `backend/src/types/auth.types.ts` — `AuthUserInfo.roleLabel`
- `backend/src/controllers/auth.controller.ts` — both `AuthUserInfo` construction sites
- `frontend/src/store/authStore.ts` — `User.roleLabel`
- `frontend/src/components/layout/AppLayout.tsx` — header render

## Findings

1. **Specification Compliance** — Matches `user_role_label_header_spec.md` exactly: priority list
   covers all 23 currently-configured `ENTRA_*_GROUP_ID` env vars, both response-construction
   sites (`callback` and `getMe`) wired, frontend type and render updated, no new CSS (reuses
   existing `.shell-user-info span` styling).
2. **Security** — No raw Entra group IDs are newly exposed; `getPrimaryRoleLabel` runs entirely
   server-side against `process.env`, returning only the resulting label string. Matches the
   established pattern used for `isPrincipalOrVP`/`canChangeWorkOrderPriority`.
3. **Consistency** — `getPrimaryRoleLabel` mirrors the existing `getDefaultWorkOrderDepartment`
   shape (ordered allowlist + `process.env` lookup); wired into `auth.controller.ts` at both sites
   already known to need it (confirmed by the transient TS "missing property" errors surfaced
   while editing, which is exactly the compiler catching both required sites).
4. **Completeness** — Both places `AuthUserInfo` is built (`callback` at login, `getMe` on page
   reload) were updated, so the label is present in both flows, not just one.
5. **Priority ordering correctness** — Verified against the intended behavior in the user's own
   example (`ENTRA_ALL_STAFF_GROUP_ID` → "Staff"): `ALL_STAFF`/`ALL_STUDENTS` are placed last, so
   any more specific group (Director, Principal, etc. — nearly always also members of All Staff)
   takes precedence, and a plain staff member with no other group correctly falls through to
   "Staff".
6. **Frontend rendering** — `{user?.roleLabel && <span>...}` correctly hides the element entirely
   for the `null` fallback case (unmatched groups) rather than rendering an empty span.
7. **Minor, accepted scope note**: the label list is manually maintained — if a new
   `ENTRA_*_GROUP_ID` is introduced later without a matching `ROLE_LABEL_PRIORITY` entry, that
   group's members simply see no role label (`null`, span omitted), not an error. This is the
   documented, safe fallback behavior from the spec, not a defect.

## Build Validation

Host-side `tsc` could not run directly (no host `node_modules`). During implementation, the two
`AuthUserInfo` construction sites were confirmed via live IDE diagnostics to require (and, after
the edit, no longer report missing) the `roleLabel` property — this is direct evidence the type
change and both call sites are in sync. Phase 6 Preflight (`docker compose -f
docker-compose.dev.yml build backend` and `... build frontend`, both TypeScript-compiling images)
passed cleanly with no errors from this change.

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A |
| Best Practices | 100% | A |
| Functionality | 100% | A |
| Code Quality | 100% | A |
| Security | 100% | A |
| Performance | 100% | A (pure in-memory string lookup, no new queries) |
| Consistency | 100% | A |
| Build Success | 100% (backend + frontend images built clean) | A |

**Overall Grade: A**

## Result: PASS

# Permission Simplification — Code Review

**Reviewer:** Automated Review Agent  
**Date:** March 13, 2026  
**Spec:** `docs/SubAgent/permission_simplification_spec.md`  
**Overall Assessment:** **PASS**

---

## Build Results

| Project | Command | Result |
|---------|---------|--------|
| Backend | `npx tsc --noEmit` | **SUCCESS** — 0 errors |
| Frontend | `npx tsc --noEmit` | **SUCCESS** — 0 errors |
| Prisma | `npx prisma validate` | **SUCCESS** — schema valid |

---

## Summary Score Table

| Criteria | Score | Notes |
|----------|-------|-------|
| ADMIN Bypass Integrity | ✅ 10/10 | `checkPermission` ADMIN bypass intact (role === 'ADMIN' → permLevel = 6 → next()). `requireAdmin` in `auth.ts` unmodified. |
| ROLE_DEFAULT_PERMISSIONS Removal | ✅ 10/10 | Constant fully removed. Fallback block fully removed. Deny-by-default enforced — no `UserPermission` match → `AuthorizationError`. Zero dangling references in `backend/src/`. |
| UserSync Role Mapping | ✅ 10/10 | All non-ADMIN groups correctly map to `'USER'`. Technology Director → ADMIN ✓, Director of Schools → ADMIN ✓, System Admin → ADMIN ✓. All permission arrays (module:level) unchanged. |
| Migration Safety | ✅ 10/10 | SQL correctly updates MANAGER/TECHNICIAN/VIEWER → USER. Uses quoted `"users"` table name (PostgreSQL). Updates default value. |
| No Accidental Modifications | ✅ 10/10 | `auth.ts`, `ProtectedRoute.tsx`, `AppLayout.tsx`, `useRequisitionsPermLevel.ts`, `authStore.ts` — all unmodified. |
| Stale References (source code) | ✅ 9/10 | Zero stale role-value references in `backend/src/`, `frontend/src/`, or `shared/src/`. One stale **comment** in `user.service.ts` line 396 ("ADMIN or MANAGER"). Two permission-level **name** strings use "Viewer" in seed data/types (not role values). |
| Frontend Role Dropdown | ✅ 10/10 | Dropdown shows only `ADMIN` ("Admin") and `USER` ("User"). No stale labels. |
| Build Success | ✅ 10/10 | All three builds pass cleanly (backend TSC, frontend TSC, Prisma validate). |
| Security | ✅ 10/10 | Deny-by-default strengthened. ADMIN bypass preserved. No new attack surface. |
| Code Quality | ✅ 10/10 | Clean removal, no dead code in source. `checkPermission` is actually shorter and faster (one fewer fallback branch). |

**Overall Grade: A (98/100)**

---

## Detailed Findings

### 1. ADMIN Bypass Integrity ✅

**`backend/src/middleware/permissions.ts`** lines 63–72:
```typescript
if (userRole === 'ADMIN') {
  // ...
  req.user!.permLevel = 6;
  return next();
}
```
ADMIN bypass is fully intact.

**`backend/src/middleware/auth.ts`** line 110:
```typescript
const hasAdminRole = req.user.roles.includes('ADMIN');
```
`requireAdmin` middleware was **NOT modified** — confirmed.

### 2. ROLE_DEFAULT_PERMISSIONS Removal ✅

- The entire `ROLE_DEFAULT_PERMISSIONS` constant is **gone** from `permissions.ts`.
- The fallback block (`const roleDefault = ROLE_DEFAULT_PERMISSIONS[userRole]?.[module]`) is **gone**.
- The flow is now: no `UserPermission` match → `throw new AuthorizationError(...)` — correct deny-by-default.
- Grep across `backend/src/**/*.ts` for `ROLE_DEFAULT_PERMISSIONS` — **zero matches**.

### 3. UserSync Role Mapping ✅

Verified all group mappings in `userSync.service.ts`:

| Group | Expected Role | Actual Role | Permissions Changed? |
|-------|--------------|-------------|---------------------|
| System Admin | ADMIN | ADMIN ✓ | No ✓ |
| Director of Schools | ADMIN | ADMIN ✓ | No ✓ |
| Technology Director | ADMIN | ADMIN ✓ | No ✓ |
| Director of Finance | USER | USER ✓ | No ✓ |
| Tech Admin | USER | USER ✓ | No ✓ |
| Maintenance Admin | USER | USER ✓ | No ✓ |
| Principals | USER | USER ✓ | No ✓ |
| Vice Principals | USER | USER ✓ | No ✓ |
| SPED Director | USER | USER ✓ | No ✓ |
| Maintenance Director | USER | USER ✓ | No ✓ |
| Transportation Director | USER | USER ✓ | No ✓ |
| Afterschool Director | USER | USER ✓ | No ✓ |
| Nurse Director | USER | USER ✓ | No ✓ |
| Supervisors of Instruction | USER | USER ✓ | No ✓ |
| All Staff | USER | USER ✓ | No ✓ |
| All Students | USER | USER ✓ | No ✓ |
| Default (no match) | USER | USER ✓ | Empty ✓ |

Type alias updated: `type UserRole = 'ADMIN' | 'USER';` ✓

### 4. Migration Safety ✅

```sql
UPDATE "users" SET "role" = 'USER' WHERE "role" IN ('MANAGER', 'TECHNICIAN', 'VIEWER');
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
```
- Correct quoted table name for PostgreSQL ✓
- Correct role values in IN clause ✓
- Default value updated ✓

### 5. No Accidental Modifications ✅

| File | Modified? |
|------|----------|
| `backend/src/middleware/auth.ts` | NO ✓ |
| `frontend/src/components/ProtectedRoute.tsx` | NO ✓ |
| `frontend/src/components/layout/AppLayout.tsx` | NO ✓ |
| `frontend/src/hooks/queries/useRequisitionsPermLevel.ts` | NO ✓ |
| `frontend/src/store/authStore.ts` | NO ✓ |

### 6. Stale References Grep

**Source code (`backend/src/`, `frontend/src/`, `shared/src/`):**
- `'MANAGER'` as role value: **0 matches** ✓
- `'TECHNICIAN'` as role value: **0 matches** ✓  
- `'VIEWER'` as role value: **0 matches** ✓
- `ROLE_DEFAULT_PERMISSIONS`: **0 matches** ✓

**Non-source files with stale references (scripts, seed, docs):**

| File | Reference | Type | Impact |
|------|-----------|------|--------|
| `backend/src/services/user.service.ts:396` | `// Get all users with ADMIN or MANAGER roles` | Stale comment | RECOMMENDED fix |
| `backend/scripts/check-missing-supervisors.ts:52` | `role: { in: ['ADMIN', 'MANAGER'] }` | Stale query in standalone script | OPTIONAL fix |
| `backend/scripts/sync-supervisor-assignments.ts:279,373` | `role: 'MANAGER'` / `role: { in: ['ADMIN', 'MANAGER'] }` | Stale query in standalone script | OPTIONAL fix |
| `backend/scripts/check-location-data.ts:82` | `role: { in: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'] }` | Stale query in standalone script | OPTIONAL fix |
| `backend/scripts/seed-supervisors.ts:20` | `role: { in: ['ADMIN', 'VIEWER'] }` | Stale query in standalone script | OPTIONAL fix |
| `frontend/src/types/roles.types.ts:35` | `name: 'Viewer'` | Permission level name (NOT a role) | NOT a bug — this is the REQUISITIONS level 1 name |
| `backend/prisma/seed.ts:36` | `name: 'Viewer'` | Permission level name (NOT a role) | NOT a bug — this is a seed permission name |
| `backend/src/services/purchaseOrder.service.ts:230` | `Levels 1-2 (Viewer, General User)` | Comment using level names | NOT a bug — refers to permission levels, not roles |

### 7. Frontend Role Dropdown ✅

`frontend/src/pages/Users.tsx` — role `<select>`:
```html
<option value="ADMIN">Admin</option>
<option value="USER">User</option>
```
Only two options. Labels are clean and appropriate.

### 8. Additional Checks

- **`shared/src/types.ts`**: `export type UserRole = 'ADMIN' | 'USER';` ✓
- **`backend/src/validators/user.validators.ts`**: `z.enum(['ADMIN', 'USER'])` ✓
- **`backend/prisma/schema.prisma`**: `role String @default("USER")` ✓
- **`backend/src/services/user.service.ts`**: `validRoles = ['ADMIN', 'USER']` ✓
- **`getSupervisorUsers()`**: Now filters by `['ADMIN', 'USER']` — this is functionally equivalent to "all active users", which is a broader but correct behavior since supervisory capability is now determined by `UserPermission` records, not role labels.

---

## Findings by Priority

### CRITICAL (must fix before merge)

**None.**

### RECOMMENDED (should fix)

| # | Finding | File | Line | Fix |
|---|---------|------|------|-----|
| R1 | Stale comment says "ADMIN or MANAGER" | `backend/src/services/user.service.ts` | 396 | Update comment to "ADMIN or USER" or remove the role reference |

### OPTIONAL (nice to have, non-blocking)

| # | Finding | File | Fix |
|---|---------|------|-----|
| O1 | Standalone scripts still reference old roles | `backend/scripts/check-missing-supervisors.ts` | Update to `['ADMIN', 'USER']` |
| O2 | Standalone scripts still reference old roles | `backend/scripts/sync-supervisor-assignments.ts` | Update `MANAGER` → `USER` |
| O3 | Standalone scripts still reference old roles | `backend/scripts/check-location-data.ts` | Update to `['ADMIN', 'USER']` |
| O4 | Standalone scripts still reference old roles | `backend/scripts/seed-supervisors.ts` | Update to `['ADMIN', 'USER']` |
| O5 | `getSupervisorUsers()` now returns all active users | `backend/src/services/user.service.ts` | Consider filtering by REQUISITIONS permission ≥ 3 instead of role (per spec note) |
| O6 | Docs reference old roles | `docs/PERMISSIONS_AND_ROLES.md`, `docs/permission.md` | Update documentation to reflect 2-role system |

---

## Security Assessment

| Check | Status |
|-------|--------|
| ADMIN bypass preserved | ✅ |
| Deny-by-default enforced | ✅ (removal of ROLE_DEFAULT_PERMISSIONS strengthens this) |
| No privilege escalation possible | ✅ USER role has no implicit permissions |
| `requireAdmin` untouched | ✅ |
| Frontend admin gates untouched | ✅ |
| Migration doesn't grant new access | ✅ Only relabels roles, UserPermission records unchanged |

---

## Conclusion

The implementation is clean, correct, and security-sound. All spec requirements are addressed. All three builds pass. The only actionable finding is one stale comment (RECOMMENDED). The standalone scripts with old role references are non-blocking since they are utility/diagnostic scripts not part of the runtime application.

**Verdict: PASS — Ready to merge after addressing R1 (stale comment).**

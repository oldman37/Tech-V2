# Code Review: Fix Role Change Bug — `fix_role_change_spec.md`

> **Document Type:** Code Review (Phase 3 SubAgent Output)
> **Feature:** Role Change Bug Fix
> **Reviewer:** Review SubAgent
> **Date:** 2026-03-13
> **Spec Reference:** `docs/SubAgent/fix_role_change_spec.md`
> **Overall Assessment:** ⚠️ NEEDS_REFINEMENT
> **Build Result:** ✅ PASS — Clean build, zero errors

---

## Summary Score Table

| # | Criterion | Score | Grade |
|---|-----------|-------|-------|
| 1 | Correctness (root cause fixed) | 7 / 10 | ⚠️ |
| 2 | Safety (new user first-login) | 10 / 10 | ✅ |
| 3 | Best Practices | 10 / 10 | ✅ |
| 4 | Security Compliance | 10 / 10 | ✅ |
| 5 | Consistency (both fix targets) | 10 / 10 | ✅ |
| 6 | Completeness (coverage) | 7 / 10 | ⚠️ |
| 7 | Build Validation | 10 / 10 | ✅ |
| **Overall** | | **64 / 70** | **⚠️ B+** |

---

## Build Validation

```
> tech-v2-backend@1.0.0 build
> tsc

(exit 0 — no errors, no warnings)
```

**Result: PASS.** TypeScript compilation is clean.

---

## Findings

### CRITICAL

#### C-1: JWT `roles` payload still uses Entra-derived role, not DB role

**File:** [backend/src/controllers/auth.controller.ts](../../backend/src/controllers/auth.controller.ts#L178)

**Problem:**  
After the upsert, `user.role` in the database is the preserved (admin-set) value — the fix works correctly for DB persistence. However, the JWT access token payload is built from `determinedRole` (Entra-derived), **not** from `user.role`:

```typescript
// Current implementation — uses Entra-derived role
const roles: string[] = [determinedRole];   // ← still wrong
```

The backend authorization middleware (`permissions.ts:54`, `auth.ts:122`) both read the role **from the JWT payload** (`req.user.roles?.[0]`), not from the database:

```typescript
// backend/src/middleware/permissions.ts
const userRole = req.user.roles?.[0] || 'VIEWER';
if (userRole === 'ADMIN') { /* bypass all checks */ }
```

```typescript
// backend/src/middleware/auth.ts  
const hasAdminRole = req.user.roles.includes('ADMIN');
```

**Net effect:**  
While the DB role is now correctly preserved, every authorization gate in the application still enforces the **Entra-derived** role, not the admin-set DB role. An admin who promotes a user from VIEWER → ADMIN via the UI will see the DB updated, but the user will still run as VIEWER in every API request until the JWT construction is also fixed.

The spec's note ("The JWT `roles` array is only used for the current session's in-memory authorization in the React auth store") is **incorrect** — JWT roles are authoritative for all backend middleware checks.

**Required Fix:**

```typescript
// auth.controller.ts — after the upsert
// BEFORE:
const roles: string[] = [determinedRole];

// AFTER (use DB-stored role — reflects admin assignment):
const roles: string[] = [user.role];
```

`determinedRole` should still be computed (it is used to set the initial role in the `create` clause and to log role determination), but must not be used in the JWT after the upsert.

**Impact if not fixed:** Admin role assignments have zero effect on authorization. The UI shows the new role, the DB stores it, but every API call enforces the old Entra-derived role.

---

### RECOMMENDED

#### R-1: Spec Option A note about sync service is contradicted by the implementation

**Files:**  
- [docs/SubAgent/fix_role_change_spec.md](fix_role_change_spec.md) (Option A description)
- [backend/src/services/userSync.service.ts](../../backend/src/services/userSync.service.ts#L400)

**Observation:**  
Spec Option A states:  
> "Explicit admin sync operations can still reset roles."

The implementation correctly goes further and **also** omits `role` from the sync service `update` clause, with the comment `// role intentionally omitted — preserved from admin assignment`. This is the correct behavior (both overwrite paths are now fixed), but the spec's Option A note is now outdated.

**Action:** Update the spec document to reflect that both paths are fixed. No code change required.

---

#### R-2: Spec's claim about JWT role scope does not match the codebase

**File:** [docs/SubAgent/fix_role_change_spec.md](fix_role_change_spec.md) (Section 5, Option A "Note on JWT roles array")

**Observation:**  
The spec states: "The JWT `roles` array is only used for the current session's in-memory authorization (the React auth store)."

This is factually incorrect. JWT roles are used by:
1. `backend/src/middleware/permissions.ts:54` — `req.user.roles?.[0]` for all module-level permission checks
2. `backend/src/middleware/auth.ts:122` — `req.user.roles.includes('ADMIN')` for `requireAdmin` middleware

This incorrect assumption is what led to the C-1 gap. The spec should be corrected to note that JWT `role`/`roles` is the authoritative source for backend authorization and must match the DB-assigned role.

---

### OPTIONAL

#### O-1: `determinedRole` variable could be renamed to clarify its narrowed use after the fix

**File:** [backend/src/controllers/auth.controller.ts](../../backend/src/controllers/auth.controller.ts#L144)

After C-1 is applied, `determinedRole` is used exclusively for `create` clause initialization and logging. Renaming to `entraRole` or `initialRole` would make its intent clearer. This is a pure readability suggestion with no functional impact.

---

## Detailed Analysis Per Criterion

### 1. Correctness — 7/10 ⚠️

**What is correct:**
- `role: determinedRole` has been removed from the `update` clause of the `upsert` in `auth.controller.ts`. The comment `// role intentionally omitted — preserved from admin assignment` clearly communicates intent.
- The same pattern is correctly applied in `userSync.service.ts → syncUser()` — `role` omitted from `update`, retained in `create`.
- The `create` clause in both files retains `role: determinedRole` / `role`, ensuring new users are assigned their Entra-derived role on first login.

**What is incomplete:**
- The JWT `roles` / `role` payload fields still use `determinedRole` instead of `user.role`. Since all backend authorization middleware reads from the JWT, the admin-set DB role is never enforced during any API call. See C-1.

---

### 2. Safety (New User First-Login) — 10/10 ✅

Both `prisma.user.upsert()` `create` clauses are intact:

- **`auth.controller.ts`** `create`: `role: determinedRole` ✅
- **`userSync.service.ts`** `create`: `role` (from `getRoleFromGroups()`) ✅

New users who have never authenticated before will correctly receive their Entra group-derived role on first login. No regression here.

---

### 3. Best Practices — 10/10 ✅

| Check | Status |
|-------|--------|
| Structured logger (`loggers.auth`, `loggers.userSync`) — no `console.log` | ✅ |
| Type guards on external API responses (`isGraphUser`, `isGraphCollection`, `isGraphGroup`) | ✅ |
| Explicit `SignOptions` typing to resolve `jwt.sign` overload ambiguity | ✅ |
| Token rotation on refresh (new refresh token issued each time) | ✅ |
| Stack trace suppressed outside development | ✅ |
| HttpOnly cookies for JWT storage (XSS protection) | ✅ |
| Intentional-comment pattern used consistently for the role omission | ✅ |

---

### 4. Security Compliance — 10/10 ✅

| Check | Status |
|-------|--------|
| No `console.log` statements | ✅ |
| No sensitive data in logs | ✅ (`redactEntraId`, `redactEmail` used; no raw emails or IDs logged) |
| Custom error classes used | ✅ (`AuthenticationError`, `ExternalAPIError`, `AuthorizationError`) |
| No raw SQL — Prisma ORM only | ✅ |
| Authentication maintained (JWT + refresh tokens) | ✅ |
| Authorization middleware in place | ✅ (subject to C-1 for correctness) |
| Cookie security flags correct | ✅ (`HttpOnly`, `Secure` in non-dev, appropriate `SameSite`) |

---

### 5. Consistency — 10/10 ✅

Both fix targets use the identical pattern:

```typescript
// In upsert update clause:
// role intentionally omitted — preserved from admin assignment
```

```typescript
// In upsert create clause:
role: <entra-derived-value>,
```

The implementation is symmetric and consistent between `auth.controller.ts` and `userSync.service.ts`. No drift between the two fix sites.

---

### 6. Completeness — 7/10 ⚠️

| Path | DB Fixed | JWT Fixed |
|------|----------|-----------|
| Auth callback (`auth.controller.ts`) | ✅ | ❌ (C-1) |
| Sync service (`userSync.service.ts`) | ✅ | N/A — sync does not issue JWTs |

Both overwrite paths for the DB are covered. The JWT mismatch (C-1) means the full end-to-end flow — admin sets role → user gets correct access — is not yet complete.

---

### 7. Build Validation — 10/10 ✅

```
Command:  cd c:\Tech-V2\backend && npm run build
Result:   exit 0
Errors:   0
Warnings: 0
```

---

## Required Action to Reach PASS

Only one code change is required:

**File:** `backend/src/controllers/auth.controller.ts`  
**Line:** ~178 (after the `upsert` call, where `roles` array is built)

```typescript
// CURRENT (incorrect — JWT reflects Entra groups, not DB role)
const roles: string[] = [determinedRole];

// REQUIRED (correct — JWT reflects DB-stored admin-assigned role)
const roles: string[] = [user.role];
```

After this change, the full flow will be:
1. Admin sets role → DB updated ✅
2. User logs in → DB role preserved ✅
3. JWT issued with DB role ✅
4. Backend middleware enforces DB-assigned role ✅

---

## Files With Issues

| File | Severity | Issue |
|------|----------|-------|
| [backend/src/controllers/auth.controller.ts](../../backend/src/controllers/auth.controller.ts#L178) | CRITICAL | JWT `roles` uses `determinedRole` instead of `user.role` |
| [docs/SubAgent/fix_role_change_spec.md](fix_role_change_spec.md) | RECOMMENDED | Option A note and JWT scope claim are inaccurate — update for accuracy |

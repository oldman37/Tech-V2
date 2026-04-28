# Review: Role-Based Default Module Access Implementation

> **Reviewer:** Review subagent  
> **Date:** 2026-03-13  
> **Spec reviewed:** `docs/SubAgent/role-module-access-spec.md`  
> **Files reviewed:** `backend/src/middleware/permissions.ts`, `docs/PERMISSIONS_AND_ROLES.md`

---

## Verdict: PASS ✓

All functional, logical, and security requirements are met. Four minor issues are noted below, none of which are blocking. No refinement is strictly required, though Issue 2 (missing log on fallback grant) is recommended as a low-effort improvement.

---

## Correctness

### ✓ `ROLE_DEFAULT_PERMISSIONS` values are correct

| Role | Module | Required | Actual | Match? |
|------|--------|----------|--------|--------|
| `MANAGER` | TECHNOLOGY | 2 | 2 | ✓ |
| `MANAGER` | MAINTENANCE | 2 | 2 | ✓ |
| `MANAGER` | REQUISITIONS | 3 | 3 | ✓ |
| `MANAGER` | PROFESSIONAL_DEV | 1 | 1 | ✓ |
| `TECHNICIAN` | TECHNOLOGY | 3 | 3 | ✓ |
| `TECHNICIAN` | MAINTENANCE | 2 | 2 | ✓ |
| `TECHNICIAN` | REQUISITIONS | 3 | 3 | ✓ |
| `VIEWER` | TECHNOLOGY | 1 | 1 | ✓ |
| `VIEWER` | MAINTENANCE | 1 | 1 | ✓ |
| `VIEWER` | REQUISITIONS | 2 | 2 | ✓ |

Source: [backend/src/middleware/permissions.ts](../../backend/src/middleware/permissions.ts#L33-L51)

### ✓ `ADMIN` excluded from the constant

`ADMIN` is not a key in `ROLE_DEFAULT_PERMISSIONS`. The ADMIN short-circuit on [permissions.ts line 74](../../backend/src/middleware/permissions.ts#L74) fires before the constant is ever reached.

### ✓ Fallback fires only when no matching `UserPermission` row exists

The block on [permissions.ts lines 100-118](../../backend/src/middleware/permissions.ts#L100-L118) is inside `if (!matchingPermission)`. If any matching UP row exists (correct module, level ≥ required), the code proceeds to the expiry check and level computation — the fallback is never consulted.

### ✓ Fallback uses `>= requiredLevel` check

```typescript
// permissions.ts line 102–103
const roleDefault = ROLE_DEFAULT_PERMISSIONS[userRole]?.[module];
if (roleDefault !== undefined && roleDefault >= requiredLevel) {
```

Correct `>=` semantics: a VIEWER default of `REQUISITIONS: 2` satisfies a `checkPermission('REQUISITIONS', 1)` call.

### ✓ `req.user.permLevel` set to the role default when fallback applies

[permissions.ts line 104](../../backend/src/middleware/permissions.ts#L104): `req.user!.permLevel = roleDefault;`

### ✓ `next()` called and `AuthorizationError` not thrown when fallback succeeds

[permissions.ts line 105](../../backend/src/middleware/permissions.ts#L105): `return next();` exits the function before the `logger.warn` + `throw` block that follows.

---

## Type Safety

### ⚠️ Issue 1 — Outer `Record` type is non-Partial (minor)

**File:** [backend/src/middleware/permissions.ts, line 33](../../backend/src/middleware/permissions.ts#L33)

**Actual:**
```typescript
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Partial<Record<PermissionModule, number>>> = {
```

**Spec recommendation (§4.1):**
```typescript
export const ROLE_DEFAULT_PERMISSIONS: Partial<
  Record<string, Partial<Record<PermissionModule, number>>>
> = {
```

**Impact:** With `Record<string, ...>` (non-Partial outer), TypeScript considers `ROLE_DEFAULT_PERMISSIONS[anyString]` to always return `Partial<Record<PermissionModule, number>>` — never `undefined`. At runtime, `ROLE_DEFAULT_PERMISSIONS['ADMIN']` is `undefined`, which would silently slip through if `noUncheckedIndexedAccess` is not enabled in `tsconfig.json`. The `?.` optional chain at the point of use (`ROLE_DEFAULT_PERMISSIONS[userRole]?.[module]`) provides correct runtime protection, so this is not a live bug — but the type annotation is less precise than specified and could mislead future readers about the contract.

**Recommendation:** Change outer `Record<string, ...>` to `Partial<Record<string, ...>>` to match the spec and make TypeScript express the correct intent.

### ✓ No implicit `any` types or type errors

`roleDefault` is inferred as `number | undefined` (from `Partial<Record<PermissionModule, number>>`). The `!== undefined` guard makes the subsequent `>= requiredLevel` comparison safe. The `req.user!` non-null assertion is correct given the guard on line 68.

---

## Logic Integrity

### ✓ ADMIN short-circuit not interfered with

`if (userRole === 'ADMIN')` at [permissions.ts lines 74-82](../../backend/src/middleware/permissions.ts#L74-L82) returns before the DB query is issued, and before `ROLE_DEFAULT_PERMISSIONS` is consulted.

### ✓ Explicit `UserPermission` rows take precedence

Fallback is only consulted when `matchingPermission` is `undefined`. If the DB returns any matching UP row, the function proceeds directly to expiry check → level computation → `next()`. The fallback path is unreachable in that case.

### ✓ Correct variable guards the fallback

`matchingPermission` — the same `.find()` result that was previously the sole guard before the 403 — still gates the fallback. The variable is not modified or reassigned between the `.find()` call and the `if (!matchingPermission)` check.

### ⚠️ Issue 2 — Expired-permission path does not fall back to role defaults (deviation from spec §4.3)

**File:** [backend/src/middleware/permissions.ts, lines 119-131](../../backend/src/middleware/permissions.ts#L119-L131)

**Actual** (expired UP path):
```typescript
if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
  logger.warn('Expired permission', { ... });
  throw new AuthorizationError(`Permission for ${module} module has expired`);
}
```

**Spec §4.3 proposed** (expired UP path — includes role-default fallback):
```typescript
if (matchingPermission.expiresAt && matchingPermission.expiresAt < new Date()) {
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[userRole];
  const defaultLevel = roleDefaults?.[module] ?? 0;
  if (defaultLevel >= requiredLevel) {
    req.user!.permLevel = defaultLevel;
    return next();
  }
  throw new AuthorizationError(...);
}
```

**Context:** The spec §4.3 note explicitly says: *"A more complete fix (filtering out expired records before running find()) is tracked as the existing edge case in §12 of PERMISSIONS_AND_ROLES.md and is **out of scope** for this spec."* The current behavior (throw on expiry) matches pre-existing behavior. This is not a regression, and the spec itself hedges on this path. However, the implementation diverges from the §4.3 complete rewrite code, meaning a user whose only TECHNOLOGY UP has expired while being a TECHNICIAN (default level 3) would get a 403 instead of falling through to the role default.

**Severity:** Low — the spec itself marks this as out-of-scope. Flag for a follow-up sprint.

---

## Missing Log on Fallback Grant

### ⚠️ Issue 3 — No `logger.debug` when role-default fallback grants access

**File:** [backend/src/middleware/permissions.ts, lines 101-106](../../backend/src/middleware/permissions.ts#L101-L106)

**Actual:** The fallback success path calls `return next()` with no log output.

**Spec §4.2 and §4.3 both specify:**
```typescript
logger.debug('Permission granted via role default', {
  userId, module, requiredLevel, userRole, defaultLevel,
});
```

**Impact:** When a user's access is granted via role default (not via a UP record), there is no observability trace. If a future support issue arises — e.g., "why does this user have access to REQUISITIONS?" — logs will show neither a "Permission granted" (that only fires for UP-based grants) nor any fallback indicator. The deny path IS correctly logged (`logger.warn`). The missing grant log is an operational/debugging gap.

**Recommendation:** Add the `logger.debug` call before `return next()` at [permissions.ts line 105](../../backend/src/middleware/permissions.ts#L105).

---

## Documentation

### ✓ Section 2 — "Default Module Access" column present

[docs/PERMISSIONS_AND_ROLES.md, line 43](../../docs/PERMISSIONS_AND_ROLES.md#L43): All four role rows include the correct default access values. Data is accurate.

### ⚠️ Issue 4 — Section 2 column order swapped; explanatory notes missing  

**File:** [docs/PERMISSIONS_AND_ROLES.md, lines 43-48](../../docs/PERMISSIONS_AND_ROLES.md#L43-L48)

**Column order — actual:**
```
| Role | Bypasses Module Checks | Admin UI Access | Default Module Access | Typical Users |
```

**Column order — spec §8 recommended:**
```
| Role | Bypasses Module Checks | Default Module Access | Admin UI Access | Typical Users |
```

"Admin UI Access" and "Default Module Access" are swapped relative to the spec. The data is correct; this is a presentation-only discrepancy.

**More significant:** The spec §8 specifies two explanatory blockquotes to follow the Section 2 table:

> **Role Default Access:** `MANAGER`, `TECHNICIAN`, and `VIEWER` roles have built-in module access defaults defined in `ROLE_DEFAULT_PERMISSIONS` in `permissions.ts`. These defaults act as a **fallback** — applied when a user has no explicit `UserPermission` row for the requested module. Explicit `UserPermission` records (set by Entra group sync or admin override) always take precedence over role defaults.

> **`PROFESSIONAL_DEV`, `SPECIAL_ED`, `TRANSCRIPTS`:** These modules have no role-level default for `TECHNICIAN` or `VIEWER`. Users must have explicit `UserPermission` grants (via Entra group membership or admin UI) to access these modules.

These notes are **absent** from the current `PERMISSIONS_AND_ROLES.md`. The Section 12 "Role Default Permissions as Fallback" subsection partially covers this, but the Section 2 note was intended to provide inline guidance at the role table — where a developer is most likely to look first.

**Severity:** Documentation only; no functional impact.

### ✓ Section 5 — Step 7a present and correct

[docs/PERMISSIONS_AND_ROLES.md](../../docs/PERMISSIONS_AND_ROLES.md): Step 7a correctly documents the `ROLE_DEFAULT_PERMISSIONS` fallback lookup with `defaultLevel >= requiredLevel` semantics. The step-by-step flow accurately reflects the implementation.

### ✓ Section 12 — "Role Default Permissions as Fallback" subsection present

[docs/PERMISSIONS_AND_ROLES.md](../../docs/PERMISSIONS_AND_ROLES.md): The subsection correctly explains fallback semantics, explicit-grant precedence, and provides a concrete VIEWER + REQUISITIONS:4 example illustrating explicit override.

---

## Security

### ✓ No unintended privilege elevation

The fallback only fires when `ROLE_DEFAULT_PERMISSIONS[userRole]?.[module]` returns a defined value AND that value meets the route's minimum threshold. There is no mechanism for access to be granted above the explicitly-defined default level via this code path.

### ✓ `SPECIAL_ED` and `TRANSCRIPTS` absent from all role defaults

| Role | SPECIAL_ED present? | TRANSCRIPTS present? |
|------|:-------------------:|:--------------------:|
| `MANAGER` | No ✓ | No ✓ |
| `TECHNICIAN` | No ✓ | No ✓ |
| `VIEWER` | No ✓ | No ✓ |

Both sensitive modules require explicit `UserPermission` grants (via Entra group membership or admin UI). The fallback provides no backdoor to these modules.

---

## Issues Summary

| # | Severity | Category | File | Line(s) | Description |
|---|----------|----------|------|---------|-------------|
| 1 | Minor | Type Safety | [permissions.ts](../../backend/src/middleware/permissions.ts#L33) | 33 | Outer `Record<string,>` should be `Partial<Record<string,>>` per spec. Functionally safe due to `?.` chain, but less precise than specified. |
| 2 | Low | Logic / Spec Deviation | [permissions.ts](../../backend/src/middleware/permissions.ts#L119) | 119–131 | Expired-permission path does not fall back to role defaults. Spec §4.3 includes this; spec note marks it out-of-scope. Pre-existing behavior, not a regression. |
| 3 | Minor | Observability | [permissions.ts](../../backend/src/middleware/permissions.ts#L105) | 105 | Missing `logger.debug` when role-default fallback grants access. Deny path is logged; grant-via-default path is silent. |
| 4 | Minor | Documentation | [PERMISSIONS_AND_ROLES.md](../../docs/PERMISSIONS_AND_ROLES.md#L43) | 43–49 | Section 2 column order differs from spec. Two explanatory blockquotes specified in §8 of the spec are missing entirely. |

---

## Refinement Needed?

**No breaking changes or security fixes required.**

Recommended (low-effort, high-value):
- **Issue 3** (missing log): 1-line fix — add `logger.debug('Permission granted via role default', { userId, module, requiredLevel, userRole, roleDefault })` before `return next()` at [permissions.ts line 105](../../backend/src/middleware/permissions.ts#L105).
- **Issue 4** (doc notes): Add the two spec §8 blockquotes after the Section 2 table in `PERMISSIONS_AND_ROLES.md`.

Optional (future sprint):
- **Issue 1** (type): Change `Record<string, ...>` → `Partial<Record<string, ...>>` on line 33.
- **Issue 2** (expired-path fallback): If the expired-permissions edge case is ever addressed, add the role-default fallback to that path at the same time.

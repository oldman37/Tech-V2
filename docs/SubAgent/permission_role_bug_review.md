# Permission / Role Bug Fix — Code Review

**Status:** NEEDS_REFINEMENT  
**Review Date:** 2026-03-18  
**Reviewer:** GitHub Copilot (automated review)  
**Build Result:** SUCCESS  
**Overall Grade:** B+ (critical gap in admin.routes.ts)

---

## Score Summary

| Area | Result | Notes |
|------|--------|-------|
| auth.controller.ts fix | ✅ PASS | `/transitiveMemberOf` confirmed |
| userSync.service.ts fix | ✅ PASS | `/transitiveMemberOf` confirmed |
| .env env var additions | ⚠️ PARTIAL | Keys added, values are empty |
| No remaining `/memberOf` in codebase | ❌ FAIL | 2 instances remain in admin.routes.ts |
| Build (`npm run build`) | ✅ PASS | Zero errors |
| TypeScript check (`tsc --noEmit`) | ✅ PASS | Zero errors |
| Auth middleware preserved | ✅ PASS | `authenticate` + `requireAdmin` on all admin routes |
| Error handling | ✅ PASS | Proper try/catch, stack trace gated to dev |
| Sensitive data logging | ✅ PASS | `redactEmail` / `redactEntraId` used throughout |
| Remediation path works end-to-end | ❌ FAIL | resync-permissions still uses `/memberOf` |

---

## 1. Correctness of the Fix

### 1.1 `auth.controller.ts` — ✅ VERIFIED

**File:** `backend/src/controllers/auth.controller.ts`, line 116

```typescript
// CURRENT — CORRECT ✅
const groupsResponse = await fetch(
  'https://graph.microsoft.com/v1.0/me/transitiveMemberOf?$select=id,displayName',
  { headers: { 'Authorization': `Bearer ${response.accessToken}` } }
);
```

The login callback correctly fetches transitive group memberships. The comment on line 115 also accurately describes the change: *"transitiveMemberOf includes nested group memberships"*.

---

### 1.2 `userSync.service.ts` — ✅ VERIFIED

**File:** `backend/src/services/userSync.service.ts`, line 467

```typescript
// CURRENT — CORRECT ✅
const groups = await this.graphClient
  .api(`/users/${entraId}/transitiveMemberOf`)
  .get();
```

The admin sync path (`syncUser()`) correctly uses `/transitiveMemberOf`. Comment on line 465 accurately reflects the intent.

---

### 1.3 `.env` env var additions — ⚠️ PARTIAL

Both keys were added to `.env` as required by Bug 3, but **both have empty values**:

```ini
# CURRENT — KEYS PRESENT, VALUES EMPTY ⚠️
ENTRA_TECH_ADMIN_GROUP_ID=
ENTRA_MAINTENANCE_ADMIN_GROUP_ID=
```

**Impact:** The `addMapping()` helper in `userSync.service.ts` guards against this with `if (!groupId) return;` — so there is **no runtime error**, but the Tech Admin and Maintenance Admin Entra groups are still not mapped. Any users exclusively in those groups will receive no permissions from them.

**Required Action:** These values must be populated with the actual Azure Portal Object IDs for those groups before the fix is functionally complete for those two roles.

---

## 2. Completeness Check — CRITICAL REMAINING ISSUE

### 2.1 `/memberOf` still present in `admin.routes.ts` — ❌ CRITICAL

A broad codebase search found **two remaining `/memberOf` calls** that were NOT updated:

**File:** `backend/src/routes/admin.routes.ts`

| Line | Endpoint | Purpose |
|------|----------|---------|
| 119 | `GET /api/admin/diagnose-permissions/:userId` | Diagnostic tool — shows admin what groups a user is in |
| 204 | `POST /api/admin/resync-permissions/:userId` | **Recommended remediation** for rdevices@ocboe.com |

```typescript
// admin.routes.ts line 119 — STILL BROKEN ❌
const groupsResponse = await graphClient
  .api(`/users/${user.entraId}/memberOf`)
  .select('id,displayName')
  .get();

// admin.routes.ts line 204 — STILL BROKEN ❌
const groupsResponse = await graphClient
  .api(`/users/${user.entraId}/memberOf`)
  .select('id,displayName')
  .get();
```

**Why line 204 is CRITICAL:**  
The spec (Section 4, Fix 4) explicitly recommends triggering `POST /api/admin/resync-permissions/{userId}` to remediate `rdevices@ocboe.com` without requiring re-login. However, that endpoint still uses `/memberOf`. For a user whose Finance Director membership is **transitive**, calling `resync-permissions` will:

1. Fetch groups via `/memberOf` → Finance Director group NOT returned
2. `getRoleFromGroups([...])` → no REQUISITIONS:5 permission mapped  
3. `syncPermissionsForUser()` deletes existing SYSTEM permissions and writes the empty set
4. **The user's permissions are left in an even worse state than before**

**Why line 119 matters (lower severity):**  
The diagnostic endpoint will show an admin that the user has no Finance Director group membership, leading to an incorrect conclusion that the group ID in `.env` is wrong (Bug 2 hypothesis), when the real problem is the missing transitive traversal.

### 2.2 ENTRA_ variable coverage — All keys accounted for

All 18 `ENTRA_*_GROUP_ID` variables referenced in `userSync.service.ts` are present as keys in `.env`:

| Env Var | In Code | In .env | Has Value |
|---------|---------|---------|-----------|
| `ENTRA_ADMIN_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_TECH_ADMIN_GROUP_ID` | ✅ | ✅ | ❌ empty |
| `ENTRA_MAINTENANCE_ADMIN_GROUP_ID` | ✅ | ✅ | ❌ empty |
| `ENTRA_PRINCIPALS_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_VICE_PRINCIPALS_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_SPED_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_NURSE_DIRECTOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_FINANCE_PO_ENTRY_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_ALL_STAFF_GROUP_ID` | ✅ | ✅ | ✅ |
| `ENTRA_ALL_STUDENTS_GROUP_ID` | ✅ | ✅ | ✅ |

**Conclusion:** 16 of 18 vars are fully populated. The two empty ones (`ENTRA_TECH_ADMIN_GROUP_ID`, `ENTRA_MAINTENANCE_ADMIN_GROUP_ID`) are non-blocking at runtime but leave those role mappings inactive.

---

## 3. Build Validation

### `npm run build`

```
> tech-v2-backend@1.0.0 build
> tsc
```

**Result: SUCCESS** — Zero compilation errors.

### `npx tsc --noEmit`

```
(no output)
```

**Result: SUCCESS** — Zero TypeScript type errors.

---

## 4. Security Review

### 4.1 Authentication middleware — ✅ PRESERVED

`admin.routes.ts` correctly applies both middleware guards at the router level:

```typescript
router.use(authenticate);   // JWT validation
router.use(requireAdmin);   // Role === 'ADMIN' check
```

All admin routes — including `diagnose-permissions` and `resync-permissions` — inherit these guards. No auth regression introduced.

### 4.2 Error handling — ✅ CORRECT

- All routes wrap logic in `try/catch` blocks
- Stack traces in `auth.controller.ts` are gated to `NODE_ENV === 'development'`
- Error responses do not leak internal state in production

### 4.3 Sensitive data logging — ✅ CLEAN

- Email addresses logged via `redactEmail()` (obfuscates local-part)
- Entra Object IDs logged via `redactEntraId()` (truncates/masks GUID)
- No raw PII or secret values logged
- JWT cookie flags confirmed: HttpOnly (XSS protection), set via `getCookieConfig()`

### 4.4 No new security vulnerabilities introduced — ✅

The `/transitiveMemberOf` change is a drop-in endpoint substitution. No changes to SQL query structure, authorization logic, or token issuance. No injection surface added.

---

## 5. Completeness of Bug Fix

### Does the fix fully address the Finance Director role assignment issue?

**Answer: NOT YET.** The fix is partially complete but has the following gaps:

| Step | Status | Notes |
|------|--------|-------|
| Login flow picks up transitive membership | ✅ Fixed | auth.controller.ts line 116 |
| Admin sync picks up transitive membership | ✅ Fixed | userSync.service.ts line 467 |
| Admin diagnostic tool shows correct groups | ❌ Not fixed | admin.routes.ts line 119 still `/memberOf` |
| Admin resync-permissions remediation works | ❌ Not fixed | admin.routes.ts line 204 still `/memberOf` — this is the immediate remediation path |
| TECH_ADMIN and MAINTENANCE_ADMIN env vars populated | ❌ Not complete | Keys present in .env but values are empty |

### Edge cases not handled

1. **Pagination in transitiveMemberOf**: The `syncUser()` call fetches groups with `.get()` but does not paginate. If a user is a transitive member of >100 groups, the `@odata.nextLink` would be ignored. The login flow (`auth.controller.ts`) also does not paginate the `fetch()` call. A user in a very large tenant with deep nested groups could theoretically have their full membership list truncated. This is a low risk for a school district but worth noting.

2. **Empty ENTRA_TECH_ADMIN_GROUP_ID / ENTRA_MAINTENANCE_ADMIN_GROUP_ID**: Users exclusively in those Entra groups receive no permissions mapped. If any current users rely on these mappings, they remain broken.

3. **Stale DB for existing users**: `rdevices@ocboe.com` will only receive corrected permissions on the **next login** (since auth.controller.ts is fixed). The admin resync endpoint (the no-login workaround) is still broken and must also be fixed.

---

## 6. Required Fixes

### Fix A — CRITICAL: Update `admin.routes.ts` lines 119 and 204

Both calls must be changed from `/memberOf` to `/transitiveMemberOf`:

```typescript
// Line 119 — diagnose-permissions endpoint
// CHANGE:
.api(`/users/${user.entraId}/memberOf`)
// TO:
.api(`/users/${user.entraId}/transitiveMemberOf`)

// Line 204 — resync-permissions endpoint  
// CHANGE:
.api(`/users/${user.entraId}/memberOf`)
// TO:
.api(`/users/${user.entraId}/transitiveMemberOf`)
```

### Fix B — REQUIRED: Populate empty env var values in `.env`

```ini
# Get actual Object IDs from Azure Portal → Entra ID → Groups
ENTRA_TECH_ADMIN_GROUP_ID=<azure-object-id>
ENTRA_MAINTENANCE_ADMIN_GROUP_ID=<azure-object-id>
```

### Fix C — RECOMMENDED: Add pagination handling for large group lists

In both `auth.controller.ts` and `admin.routes.ts`, add pagination support for the Graph API `transitiveMemberOf` response to handle `@odata.nextLink` continuation tokens.

---

## 7. Overall Assessment

**BUILD RESULT: SUCCESS**  
**OVERALL ASSESSMENT: NEEDS_REFINEMENT**

The two primary code changes (`auth.controller.ts` and `userSync.service.ts`) are correctly implemented and the build is clean. However, `admin.routes.ts` — which contains the only admin-side remediation path (`resync-permissions`) — was not updated and still uses the old `/memberOf` endpoint. This means:

- `rdevices@ocboe.com`'s permissions will be corrected on next login (auth flow is fixed)
- The admin-triggered resync (the no-re-login workaround) remains broken and would leave the user in a worse state if triggered
- The diagnostic tool produces misleading results for users with transitive memberships

Fix A above (updating admin.routes.ts) is the only blocker before this fix can be considered complete.

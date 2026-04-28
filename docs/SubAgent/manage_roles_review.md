# Manage Roles — Code Review & Quality Assurance

> **Document Type:** Phase 3 Review (QA SubAgent Output)
> **Feature:** Manage Roles / Permission Profiles admin page
> **Reviewer:** QA SubAgent
> **Date:** 2026-03-12
> **Status:** PASS

---

## Table of Contents

1. [Build Validation Results](#1-build-validation-results)
2. [Security Review (CRITICAL)](#2-security-review-critical)
3. [Specification Compliance](#3-specification-compliance)
4. [Code Quality & Best Practices](#4-code-quality--best-practices)
5. [Frontend Quality](#5-frontend-quality)
6. [Consistency with Existing Codebase](#6-consistency-with-existing-codebase)
7. [Findings Summary](#7-findings-summary)
8. [Score Table & Grade](#8-score-table--grade)

---

## 1. Build Validation Results

### Backend TypeScript Compilation

```
Command: cd C:\Tech-V2\backend && npx tsc --noEmit
Result:  EXIT CODE 0 — no errors
```

**BACKEND BUILD: ✅ SUCCESS**

### Frontend TypeScript Compilation

```
Command: cd C:\Tech-V2\frontend && npx tsc --noEmit
Result:  EXIT CODE 0 — no errors
```

**FRONTEND BUILD: ✅ SUCCESS**

> Both the backend and frontend compile cleanly with no TypeScript errors. All new types are correct and the compiler accepts the full type chain from Prisma model → service → controller → API response → frontend type → React component.

---

## 2. Security Review (CRITICAL)

All security criteria evaluated against OWASP Top 10 and project standards.

### 2.1 Authentication & Authorization

| Check | File | Result | Notes |
|-------|------|--------|-------|
| `authenticate` on ALL endpoints | `roles.routes.ts:21` | ✅ PASS | `router.use(authenticate)` — applies before all routes |
| `requireAdmin` on ALL endpoints | `roles.routes.ts:22` | ✅ PASS | `router.use(requireAdmin)` — applies before all routes |
| Frontend route admin-guarded | `App.tsx:57-63` | ✅ PASS | `<ProtectedRoute requireAdmin>` wraps the `/admin/roles` route |
| Nav item admin-only | `AppLayout.tsx:51` | ✅ PASS | `adminOnly: true` flag hides nav item for non-admins |

### 2.2 CSRF Protection

| Check | File | Result | Notes |
|-------|------|--------|-------|
| `validateCsrfToken` applied | `roles.routes.ts:25` | ✅ PASS | `router.use(validateCsrfToken)` |
| GET requests not blocked by CSRF | `csrf.ts:28,67` | ✅ PASS | Middleware defines `PROTECTED_METHODS = ['POST','PUT','PATCH','DELETE']` and skips GET/HEAD/OPTIONS |
| POST endpoints covered | `roles.routes.ts:33,42` | ✅ PASS | Create + Apply-to-User both use POST and are protected |
| PUT endpoints covered | `roles.routes.ts:36-41` | ✅ PASS | Update uses PUT and is protected |
| DELETE endpoints covered | `roles.routes.ts:43` | ✅ PASS | Delete uses DELETE and is protected |
| Timing-safe token comparison | `csrf.ts:97` | ✅ PASS | `crypto.timingSafeEqual()` used — prevents timing attacks |
| Double-submit cookie pattern | `csrf.ts` | ✅ PASS | Cookie + header comparison correctly implemented |

### 2.3 Input Validation

| Check | File | Result | Notes |
|-------|------|--------|-------|
| Module validated against enum | `roles.validators.ts:10-17,28` | ✅ PASS | `z.enum(VALID_MODULES)` with all 6 known values |
| Level validated as integer 1-5 | `roles.validators.ts:29` | ✅ PASS | `z.number().int().min(1).max(5)` |
| ID params validated as UUID | `roles.validators.ts:19-24` | ✅ PASS | `z.string().uuid()` on all param schemas |
| Name length bounded | `roles.validators.ts:32` | ✅ PASS | `z.string().min(1).max(100).trim()` |
| Description length bounded | `roles.validators.ts:33` | ✅ PASS | `z.string().max(500)` |
| Permissions array bounded | `roles.validators.ts:34` | ✅ PASS | `.max(6)` — one per module max |

### 2.4 Database Security

| Check | File | Result | Notes |
|-------|------|--------|-------|
| Parameterized queries only | `roles.service.ts` | ✅ PASS | Exclusively Prisma ORM — no raw SQL with user input |
| System profile deletion blocked | `roles.service.ts:157-162` | ✅ PASS | `if (existing.isSystem) throw new ValidationError(...)` |
| Transaction used for atomic ops | `roles.service.ts:89-104, 123-148` | ✅ PASS | `prisma.$transaction()` for create/update |
| `createdBy` set from JWT, not request body | `roles.controller.ts:44` | ✅ PASS | `const adminId = req.user?.id \|\| 'system'` — extracted from verified JWT |

### 2.5 Security Summary

**All 18 security checks PASS. No CRITICAL security issues found.**

---

## 3. Specification Compliance

### 3.1 Feature Completeness

| Feature | Required | Implemented | Notes |
|---------|----------|-------------|-------|
| List all profiles | ✅ | ✅ | `GET /api/roles`, `useRoleProfiles()` hook |
| Create new profile | ✅ | ✅ | `POST /api/roles`, `useCreateRoleProfile()` hook |
| Edit existing profile | ✅ | ✅ | `PUT /api/roles/:id`, `useUpdateRoleProfile()` hook |
| Delete custom profile | ✅ | ✅ | `DELETE /api/roles/:id`, `useDeleteRoleProfile()` hook |
| Apply profile to user | ✅ | ✅ | `POST /api/roles/:id/apply/:userId`, `useApplyRoleProfile()` hook |
| Block system profile deletion | ✅ | ✅ | Service throws `ValidationError` if `isSystem=true` |
| Block inactive profile application | ✅ | ✅ | Service throws `ValidationError` if `isActive=false` |

### 3.2 Seeded System Profiles

The spec requires exactly **5 seeded system profiles**. All 5 are present in `seed.ts` with correct values:

| Profile Name | Expected Permissions | Present | Values Match |
|--------------|---------------------|---------|--------------|
| View Only | TECHNOLOGY:1, MAINTENANCE:1, REQUISITIONS:1 | ✅ | ✅ |
| General Staff | TECHNOLOGY:1, MAINTENANCE:1, REQUISITIONS:2 | ✅ | ✅ |
| Principal | TECHNOLOGY:2, MAINTENANCE:2, REQUISITIONS:3, PROFESSIONAL_DEV:1 | ✅ | ✅ |
| Tech Admin | TECHNOLOGY:3, MAINTENANCE:2, REQUISITIONS:3 | ✅ | ✅ |
| Director / Full Access | TECHNOLOGY:3, MAINTENANCE:3, REQUISITIONS:5, PROFESSIONAL_DEV:1, SPECIAL_ED:1, TRANSCRIPTS:1 | ✅ | ✅ |

All profiles seeded with `isSystem: true` ✅. Seed uses `findUnique` + conditional create (idempotent) ✅.

### 3.3 Database Schema

| Spec Requirement | schema.prisma | migration.sql | Match |
|-----------------|---------------|---------------|-------|
| `RoleProfile` model | ✅ (line ~611) | ✅ | ✅ |
| `RoleProfilePermission` model | ✅ (line ~625) | ✅ | ✅ |
| `@@unique([profileId, module])` | ✅ | ✅ | ✅ |
| `@@index([isActive])` | ✅ | ✅ | ✅ |
| `@@index([profileId])` | ✅ | ✅ | ✅ |
| `ON DELETE CASCADE` | ✅ (cascades via Prisma relation) | ✅ | ✅ |
| `@@map("role_profiles")` | ✅ | ✅ | ✅ |
| `@@map("role_profile_permissions")` | ✅ | ✅ | ✅ |

### 3.4 API Contract

| Endpoint | Method | Status Code | Spec | Implemented |
|----------|--------|-------------|------|-------------|
| `/api/roles` | GET | 200 | ✅ | ✅ |
| `/api/roles/:id` | GET | 200 / 404 | ✅ | ✅ |
| `/api/roles` | POST | 201 | ✅ | ✅ |
| `/api/roles/:id` | PUT | 200 / 404 | ✅ | ✅ |
| `/api/roles/:id` | DELETE | 204 / 400/404 | ✅ | ✅ |
| `/api/roles/:id/apply/:userId` | POST | 200 / 400/404 | ✅ | ✅ |

Route registration in `server.ts` at line 106: `app.use('/api/roles', rolesRoutes)` ✅

### 3.5 Outstanding / Partial Items

| Item | Status | Notes |
|------|--------|-------|
| "Apply Profile" button on Users page | ⚠️ NOT IN SCOPE | The `useApplyRoleProfile` mutation hook exists. Backend endpoint exists. The integration UI on `Users.tsx` was not in the review scope for this feature. Should be tracked as a follow-up task. |

---

## 4. Code Quality & Best Practices

### 4.1 CRITICAL Issues

**None found.** Both TypeScript compilations pass with zero errors.

### 4.2 RECOMMENDED Issues

#### RECOMMENDED-1: `any` type in `ModulePermissionControl` component

**File:** `frontend/src/pages/ManageRoles.tsx` — `ModulePermissionControl` component

```tsx
// Current — suppressed with eslint-disable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
control: any;
```

**Issue:** The `control` prop is typed as `any`. This disables type checking for the entire React Hook Form `control` object passed into the component, which defeats the purpose of TypeScript in the form system.

**Fix:** Import and use `Control<ProfileFormValues>` from `react-hook-form`:

```tsx
import { useForm, Controller, Control } from 'react-hook-form';

function ModulePermissionControl({
  module,
  control,
}: {
  module: PermissionModule;
  control: Control<ProfileFormValues>;
}) {
```

**Impact:** TypeScript only — does not affect runtime behavior. The TSC currently passes because the `any` suppresses the error.

---

#### RECOMMENDED-2: `Promise<unknown>` return type in frontend service

**File:** `frontend/src/services/rolesService.ts` — `applyToUser`

```typescript
// Current
applyToUser: async (profileId: string, userId: string): Promise<unknown> => {
```

**Issue:** The backend returns a user object (`{ user: updatedUser }`), and the service unwraps it to `response.data.user`. The return type should reflect the actual shape rather than `unknown`.

**Fix:** Import the project's `User` type and annotate the return:

```typescript
import type { User } from '../types/user.types'; // adjust import path

applyToUser: async (profileId: string, userId: string): Promise<User> => {
  const response = await api.post<{ user: User }>(`/roles/${profileId}/apply/${userId}`);
  return response.data.user;
},
```

**Impact:** Low — the `unknown` return type is safely handled by `useApplyRoleProfile` which ignores the return value. No runtime issues.

---

#### RECOMMENDED-3: No error display in the Delete Confirmation Dialog

**File:** `frontend/src/pages/ManageRoles.tsx` — delete confirmation dialog

**Issue:** The `handleDelete` function calls `deleteMutation.mutateAsync(id)`. If the server returns an error (e.g., a race condition where the profile was already deleted), the mutation error is not displayed inside the delete dialog. The dialog fails silently.

```typescript
// Current
const handleDelete = async (id: string) => {
  await deleteMutation.mutateAsync(id);
  setDeleteConfirmId(null);
  // If mutateAsync rejects, the dialog stays open but shows no error
};
```

**Fix:** Add error display inside the delete dialog:

```tsx
<DialogContent>
  <Typography>...</Typography>
  {deleteMutation.isError && (
    <Alert severity="error" sx={{ mt: 2 }}>
      Failed to delete profile. Please try again.
    </Alert>
  )}
</DialogContent>
```

**Impact:** UX only — no security or functional impact.

---

#### RECOMMENDED-4: Service `update` does not protect system profile name

**File:** `backend/src/services/roles.service.ts` — `update` method

**Issue:** The `update` method allows changing the `name` and `description` of system profiles (profiles with `isSystem=true`). The seed uses `name` as the unique identifier for idempotency (via `prisma.roleProfile.findUnique({ where: { name: profile.name } })`). If a system profile's name is changed via the API, re-running the seed will create a duplicate with `isSystem=true` instead of skipping it.

**Fix:** Add a guard at the start of the `update` method:

```typescript
async update(id: string, input: UpdateProfileInput) {
  const existing = await this.findById(id);
  
  if (existing.isSystem && input.name !== undefined && input.name !== existing.name) {
    throw new ValidationError('The name of a system profile cannot be changed.');
  }
  // ... rest of method
}
```

**Impact:** Data integrity — low risk in production but could cause seeding issues in development/staging.

---

### 4.3 OPTIONAL Issues

#### OPTIONAL-1: `useRoleProfile(id)` hook may be preview code

**File:** `frontend/src/hooks/queries/useRoles.ts`

The `useRoleProfile(id)` single-profile hook is defined but not consumed anywhere in the current implementation (the `ManageRoles.tsx` page uses only the list query; edit mode seeds the dialog from the already-loaded list data). This hook appears to be forward-looking for the Users page integration.

**Recommendation:** This is acceptable as-is. Document with a comment: `// Used by the Users page "Apply Profile" feature`.

---

#### OPTIONAL-2: Ordering of modules in dialog is hardcoded via `PERMISSION_MODULES`

**File:** `frontend/src/types/roles.types.ts`

The `PERMISSION_MODULES` array order determines the display order in the `ManageRoles` create/edit dialog. This is consistent between types, service, and form schema. If a new module is added to `PERMISSION_MODULES`, the form schema in `ManageRoles.tsx` would need a matching field added to `profileFormSchema` — this coupling is non-obvious.

**Recommendation:** Consider a comment in `ManageRoles.tsx` noting this coupling, or derive the form schema dynamically from `PERMISSION_MODULES`.

---

## 5. Frontend Quality

| Criterion | Result | Notes |
|-----------|--------|-------|
| Loading state | ✅ | `<CircularProgress />` shown while `isLoading=true` |
| Error state | ✅ | `<Alert severity="error">` shown when `isError=true` |
| Empty state | ✅ | "No profiles found" message with call-to-action |
| Create mode dialog | ✅ | `openCreate()` resets form to blank defaults |
| Edit mode dialog | ✅ | `openEdit(profile)` seeds form from profile data via `buildFormDefaults(profile)` |
| Form validation | ✅ | React Hook Form + Zod resolver (`zodResolver(profileFormSchema)`) |
| Submit error display | ✅ | `Alert severity="error"` in `DialogActions` for create/update failures |
| System profiles lock icon | ✅ | `LockIcon` shown next to system profile names |
| System profiles no delete button | ✅ | Delete `IconButton` conditionally rendered: `{!profile.isSystem && ...}` |
| Inactive profiles chip | ✅ | `<Chip label="Inactive">` shown when `!profile.isActive` |
| Permission level descriptions | ✅ | `MODULE_LEVELS` with `name` + `description`; descriptions shown as `Tooltip` on each radio option |
| Module labels human-readable | ✅ | `MODULE_LABELS` maps enum → display name (e.g., `PROFESSIONAL_DEV` → "Professional Development") |
| MUI pattern followed | ✅ | Consistent with `AdminSettings.tsx` — Card + Stack + TextField + Dialog |
| Pending/loading button states | ✅ | Submit button shows "Saving…" while pending; delete button shows "Deleting…" |

---

## 6. Consistency with Existing Codebase

### 6.1 Backend Pattern Comparison

Compared against `user.routes.ts` / `user.controller.ts` / `user.service.ts` as reference.

| Pattern | Reference | Roles Implementation | Match |
|---------|-----------|---------------------|-------|
| Route auth structure | `router.use(authenticate); router.use(requireAdmin); router.use(validateCsrfToken)` | Identical | ✅ |
| Controller thin wrapper | `try { result = await service.method(); res.json(result) } catch(e) { handleControllerError(e, res) }` | Identical | ✅ |
| Service constructor | `constructor(private prisma: PrismaClient)` | ✅ | ✅ |
| Error types | `NotFoundError`, `ValidationError` from `utils/errors` | ✅ same imports | ✅ |
| Prisma singleton | `import { prisma } from '../lib/prisma'` | ✅ | ✅ |
| `handleControllerError` | Used in all controllers | ✅ | ✅ |
| Zod schemas in validators/ | Separate file per feature | ✅ | ✅ |

### 6.2 Frontend Pattern Comparison

Compared against existing query/mutation hook patterns.

| Pattern | Reference | Roles Implementation | Match |
|---------|-----------|---------------------|-------|
| Query hook structure | `useQuery({ queryKey: ..., queryFn: ... })` | ✅ | ✅ |
| Query key registry | `queryKeys.ts` centralized | ✅ roles section added | ✅ |
| Mutation invalidation | `queryClient.invalidateQueries({ queryKey: queryKeys.X.lists() })` | ✅ | ✅ |
| Service file structure | `export const xyzService = { method: async () => ... }` | ✅ | ✅ |
| Axios `api` instance | `import { api } from './api'` | ✅ | ✅ |
| CSRF auto-injected by interceptor | All mutations via `api` instance | ✅ | ✅ |

### 6.3 One Notable Deviation

The `RolesService` instantiates `UserService` internally in its constructor:

```typescript
export class RolesService {
  private userService: UserService;
  constructor(private prisma: PrismaClient) {
    this.userService = new UserService(prisma);
  }
}
```

This is a minor deviation from pure dependency injection but is consistent with how other services in this codebase create helper instances (the `UserService` is similarly simple). Not a correctness issue, but would be cleaner with constructor injection in a DI-heavy architecture.

---

## 7. Findings Summary

### CRITICAL Issues (must fix before merge)

*None found.*

---

### RECOMMENDED Issues (should fix)

| ID | File | Issue | Severity |
|----|------|-------|----------|
| R-1 | `ManageRoles.tsx` | `control: any` type — should be `Control<ProfileFormValues>` | Medium |
| R-2 | `rolesService.ts` | `applyToUser` return type is `Promise<unknown>` — should be typed User | Low |
| R-3 | `ManageRoles.tsx` | Delete confirmation dialog shows no error if delete mutation fails | Low |
| R-4 | `roles.service.ts` | `update()` allows renaming system profiles (breaks seed idempotency) | Medium |

---

### OPTIONAL Issues (nice to have)

| ID | File | Issue |
|----|------|-------|
| O-1 | `useRoles.ts` | `useRoleProfile(id)` hook unused — add clarifying comment |
| O-2 | `ManageRoles.tsx` | Form schema coupling to `PERMISSION_MODULES` is non-obvious |

---

## 8. Score Table & Grade

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| **Security** | 30% | 100/100 | All 18 checks PASS — no vulnerabilities |
| **Build Validation** | 20% | 100/100 | Backend ✅ + Frontend ✅, zero TS errors |
| **Spec Compliance** | 20% | 97/100 | All features present; Users page integration deferred |
| **Code Quality** | 15% | 88/100 | 1 `any` type, 1 `unknown` return — TSC still clean |
| **Frontend Quality** | 10% | 93/100 | All required states present; minor delete error UX gap |
| **Codebase Consistency** | 5% | 97/100 | Matches all patterns; minor service-coupling deviation |

### Overall Score: **97/100** 

### Grade: **A** *(Pass)*

---

## Final Assessment

**Overall Assessment: PASS**

**Build Result: SUCCESS** — Both backend and frontend TypeScript compilation complete with zero errors.

The Manage Roles / Permission Profiles feature is **production-ready** with the following notes:

- All security requirements are fully met: authentication, admin authorization, CSRF protection on all mutating endpoints, module/level input validation, system profile protection, UUID validation, and exclusive use of Prisma parameterized queries.
- All 5 system profiles are seeded with correct module/level values.
- The full CRUD API + apply-to-user endpoint are implemented, wired, and compile cleanly.
- The frontend follows the established AdminSettings MUI pattern, with proper loading/error/empty states, RHF+Zod validation, and appropriate visual differentiation for system profiles.

The 4 RECOMMENDED items are low-to-medium severity code quality improvements. **R-4 (system profile name protection)** is the highest-priority fix as it could create data duplication issues if the seed is re-run after a system profile has been renamed. The others are TypeScript typing improvements and a UX polish item.

The "Apply Profile" button integration on the Users page was explicitly out of scope for this feature iteration but should be tracked as a follow-up task (`useApplyRoleProfile` hook and backend endpoint are both ready to wire up).

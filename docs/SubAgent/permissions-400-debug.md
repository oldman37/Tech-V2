# Bug Analysis: PUT /api/users/{userId}/permissions → 400 Bad Request

**Date:** 2026-03-11  
**Status:** Root cause identified

---

## 1. Exact Request Body the Frontend Sends

**File:** `frontend/src/services/userService.ts` (lines 88–97)

```typescript
async updateUserPermissions(
  id: string,
  permissions: { module: string; level: number }[]   // <-- level is a NUMBER
): Promise<User> {
  const response = await api.put(`/users/${id}/permissions`, {
    permissions,
  });
  return response.data.user;
}
```

**File:** `frontend/src/hooks/mutations/useUserMutations.ts` (lines 79–91)

```typescript
mutationFn: ({ 
  userId, 
  permissions 
}: { 
  userId: string; 
  permissions: Array<{ module: string; level: number }>  // <-- level is a NUMBER
}) =>
  userService.updateUserPermissions(userId, permissions),
```

**Wire payload example:**
```json
{
  "permissions": [
    { "module": "TECHNOLOGY", "level": 2 },
    { "module": "MAINTENANCE", "level": 1 }
  ]
}
```

`level` is sent as a **JSON number** (integer).

---

## 2. Exact Zod Validation Schema the Backend Uses

**File:** `backend/src/validators/user.validators.ts` (lines 57–68)

```typescript
/**
 * Permission object schema for user permissions
 */
const PermissionItemSchema = z.object({
  module: z.string().min(1, 'Module is required'),
  level: z.string().min(1, 'Level is required'),   // <-- expects a STRING
});

/**
 * Validation schema for updating user permissions
 */
export const UpdateUserPermissionsSchema = z.object({
  permissions: z.array(PermissionItemSchema)
    .min(0, 'Permissions must be an array'),
});
```

Zod's `z.string()` validator **rejects** JSON numbers — it does not coerce them.  
When `level: 2` (number) arrives, Zod produces a validation error and the middleware returns **400 Bad Request**.

---

## 3. The Mismatch — Root Cause

| Layer | `level` type | Value sent/expected |
|---|---|---|
| Frontend `userService.ts` | `number` | `2` (integer) |
| Frontend `useUserMutations.ts` | `number` | `2` (integer) |
| Backend Zod `PermissionItemSchema` | `z.string()` | `"2"` or `"VIEW"` (string) |
| Shared `api-types.ts` `UpdateUserPermissionsRequest` | `string` | `"2"` or `"VIEW"` (string) |
| Backend middleware `permissions.ts` `PermissionLevel` | `1 \| 2 \| 3 \| 4 \| 5` | integer |
| Shared `types.ts` `PermissionLevel` | `'VIEW' \| 'CREATE' \| 'EDIT' \| 'DELETE' \| 'ADMIN'` | string enum |

**Primary mismatch causing 400:**  
Frontend sends `level` as a **number** → Zod `z.string()` validator rejects it → middleware returns 400.

**Secondary inconsistencies (no immediate 400, but indicate broader type drift):**

### a) `PermissionModule` type divergence
- `backend/src/middleware/permissions.ts`: `'TECHNOLOGY' | 'MAINTENANCE' | 'TRANSPORTATION' | 'NUTRITION' | 'CURRICULUM' | 'FINANCE' | 'REQUISITIONS'`
- `shared/src/types.ts`: `'USERS' | 'LOCATIONS' | 'SUPERVISORS' | 'ROOMS' | 'EQUIPMENT' | 'MAINTENANCE' | 'REPORTS' | 'SETTINGS'`

These module lists share only `MAINTENANCE`. The backend middleware module list is the operative one; the shared type is a dead/legacy definition never imported by the backend.

### b) `PermissionLevel` type divergence
- `backend/src/middleware/permissions.ts`: `1 | 2 | 3 | 4 | 5` (numeric union)
- `shared/src/types.ts`: `'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'ADMIN'` (string enum)

The backend's internal logic uses numeric levels 1–5. The shared type definition uses a named string enum that the backend does **not** import.

---

## 4. Suggested Fix

### Recommended: Fix the backend Zod validator (single-character change, least blast radius)

In `backend/src/validators/user.validators.ts`, change `PermissionItemSchema` to accept a numeric level:

```typescript
// BEFORE
const PermissionItemSchema = z.object({
  module: z.string().min(1, 'Module is required'),
  level: z.string().min(1, 'Level is required'),
});

// AFTER
const PermissionItemSchema = z.object({
  module: z.string().min(1, 'Module is required'),
  level: z.coerce.number().int().min(1).max(5),
});
```

`z.coerce.number()` accepts both `2` (already a number) and `"2"` (string coerced to number), making it robust to either format. The `.int().min(1).max(5)` bounds align exactly with `PermissionLevel = 1 | 2 | 3 | 4 | 5` in `permissions.ts`.

**Why this side:** The frontend's `level: number` is consistent with the backend middleware's internal `PermissionLevel = 1 | 2 | 3 | 4 | 5`. The Zod schema is the only layer that incorrectly declared `z.string()` for a field that every other layer treats as a number.

### Also update the shared type (correctness)

In `shared/src/api-types.ts`, align the request type:

```typescript
// BEFORE
export interface UpdateUserPermissionsRequest {
  permissions: Array<{
    module: string;
    level: string;       // incorrect — was never actually a string
  }>;
}

// AFTER
export interface UpdateUserPermissionsRequest {
  permissions: Array<{
    module: string;
    level: number;       // matches backend PermissionLevel = 1 | 2 | 3 | 4 | 5
  }>;
}
```

---

## 5. Related Type Definitions in shared/

**File:** `shared/src/types.ts`

```typescript
// PermissionLevel — uses string enum; NOT used by backend middleware
export type PermissionLevel = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'ADMIN';

// PermissionModule — different module names from backend middleware; NOT used by backend
export type PermissionModule = 
  | 'USERS' | 'LOCATIONS' | 'SUPERVISORS' | 'ROOMS'
  | 'EQUIPMENT' | 'MAINTENANCE' | 'REPORTS' | 'SETTINGS';

// UserPermissionDetail — level typed as string
export interface UserPermissionDetail {
  id: string;
  module: string;
  level: string;       // <-- would need updating if numeric levels are adopted throughout
  name: string;
  ...
}

// Permission interface — level typed as string
export interface Permission {
  id: string;
  module: string;
  level: string;       // <-- same issue
  ...
}
```

**File:** `shared/src/api-types.ts`

```typescript
// UpdateUserPermissionsRequest — level typed as string (mismatches frontend)
export interface UpdateUserPermissionsRequest {
  permissions: Array<{
    module: string;
    level: string;     // <-- should be number
  }>;
}
```

The shared types library has a systemic string-vs-number inconsistency for `level` that was never reconciled with the backend middleware's decision to use `1 | 2 | 3 | 4 | 5`. The immediate 400 fix is only the Zod validator, but a broader type cleanup of `shared/src/types.ts` and `shared/src/api-types.ts` is advisable.

---

## Files to Change for the Fix

| File | Change |
|---|---|
| `backend/src/validators/user.validators.ts` | `level: z.string()` → `level: z.coerce.number().int().min(1).max(5)` |
| `shared/src/api-types.ts` | `UpdateUserPermissionsRequest.permissions[].level: string` → `number` |

**No frontend changes required.** The frontend already sends the correct type (`number`).

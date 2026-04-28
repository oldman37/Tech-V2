# Inventory User Search Autocomplete — Implementation Spec

**Date:** 2026-03-03  
**Scope:** Replace/complete the "Assign To User" field in `InventoryFormDialog` with a fully functional, searchable user autocomplete backed by a secure API endpoint.

---

## 1. Current State Analysis

### 1.1 InventoryFormDialog (`frontend/src/components/inventory/InventoryFormDialog.tsx`)

The form **already contains a partial MUI `Autocomplete` implementation** for the "Assign To User" field (lines ~420–460). The existing code:

```tsx
// State already declared
const [allUsers, setAllUsers] = useState<any[]>([]);
const [userSearchInput, setUserSearchInput] = useState('');
const [userSearchLoading, setUserSearchLoading] = useState(false);

// Initial load on dialog open
const usersData = await userService.getUsers(1, 50, '');
setAllUsers(usersData.users.filter((u: any) => u.isActive));

// Debounced search effect (300ms, triggers on ≥2 chars)
useEffect(() => {
  if (!userSearchInput || userSearchInput.length < 2) return;
  const timer = setTimeout(async () => {
    setUserSearchLoading(true);
    const usersData = await userService.getUsers(1, 50, userSearchInput);
    setAllUsers(usersData.users.filter((u: any) => u.isActive));
    setUserSearchLoading(false);
  }, 300);
  return () => clearTimeout(timer);
}, [userSearchInput]);

// MUI Autocomplete usage
<Autocomplete
  fullWidth
  options={allUsers}
  value={selectedUser}
  onChange={(_, newValue) => handleChange('assignedToUserId', newValue?.id || null)}
  onInputChange={(_, newInputValue) => setUserSearchInput(newInputValue)}
  getOptionLabel={(option) =>
    `${option.displayName || `${option.firstName} ${option.lastName}`} (${option.email})`
  }
  loading={userSearchLoading}
  renderInput={(params) => (
    <TextField {...params} label="Assigned To User" placeholder="Type to search users..."
      InputProps={{ ...params.InputProps,
        endAdornment: (<>{userSearchLoading ? <CircularProgress size={20} /> : null}{params.InputProps.endAdornment}</>)
      }}
    />
  )}
/>
```

**What works:** UI structure, debounce wiring, loading indicator, MUI Autocomplete layout.  
**What is broken:** The API call `userService.getUsers()` hits `GET /api/users` which is protected by `requireAdmin` middleware. Non-admin inventory operators receive a **403 Forbidden** error.

---

## 2. Backend Analysis

### 2.1 User Routes (`backend/src/routes/user.routes.ts`)

```
GET    /api/users                         → getUsers         [ADMIN only]
GET    /api/users/supervisors/list        → getSupervisorUsers [ADMIN only]
GET    /api/users/permissions             → getPermissions   [ADMIN only]
GET    /api/users/:id                     → getUserById      [ADMIN only]
PUT    /api/users/:id/role                → updateUserRole   [ADMIN only]
PUT    /api/users/:id/permissions         → updateUserPermissions [ADMIN only]
PUT    /api/users/:id/toggle-status       → toggleUserStatus [ADMIN only]
GET    /api/users/:userId/supervisors     → getUserSupervisors [ADMIN only]
POST   /api/users/:userId/supervisors     → addUserSupervisor [ADMIN only]
DELETE /api/users/:userId/supervisors/:supervisorId → removeUserSupervisor [ADMIN only]
GET    /api/users/:userId/supervisors/search → searchPotentialSupervisors [ADMIN only]
```

**All routes are behind `router.use(requireAdmin)`** — no endpoint currently allows non-admin authenticated users to search for users.

### 2.2 User Service `findAll()` (`backend/src/services/user.service.ts`)

The method already supports robust search:

```typescript
async findAll(query: UserQuery): Promise<PaginatedUsers> {
  // Builds WHERE clause with:
  where.OR = [
    { email: { contains: search, mode: 'insensitive' } },
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
    { displayName: { contains: search, mode: 'insensitive' } },
  ];
  // Returns full UserWithPermissions[] including all permission details
}
```

Response shape: `{ users: UserWithPermissions[], pagination: { page, limit, totalCount, totalPages } }`

### 2.3 Inventory Route Auth (`backend/src/routes/inventory.routes.ts`)

```typescript
router.use(authenticate);           // JWT required
router.use(validateCsrfToken);      // CSRF for mutations
router.get('/inventory', checkPermission('TECHNOLOGY', 1), ...);  // view
router.post('/inventory', checkPermission('TECHNOLOGY', 2), ...); // create
router.put('/inventory/:id', checkPermission('TECHNOLOGY', 2), ...); // edit
```

Non-admin users with `TECHNOLOGY` level 1–2 permission can view/edit inventory but cannot call any user endpoints.

### 2.4 Permission Middleware

- `requireAdmin`: checks `req.user.roles[0] === 'ADMIN'`
- `checkPermission(module, level)`: ADMIN auto-passes; others checked against DB `userPermissions` table

---

## 3. Gap Analysis

| Area | Current State | Gap |
|---|---|---|
| **Backend endpoint** | `GET /api/users` exists with search | Protected by `requireAdmin` — non-admins get 403 |
| **Dedicated search endpoint** | None | Need `GET /api/users/search` with lighter auth |
| **Response shape** | Returns full `UserWithPermissions` with all permission details | Overkill for autocomplete — need slim shape |
| **Frontend userService** | `getUsers(page, limit, search)` exists | Works fine; needs to point to new endpoint OR keep `getUsers` for admins and add `searchUsers` for all |
| **InventoryFormDialog** | Autocomplete UI + debounce already present | Will work once the 403 is resolved |
| **Reusable component** | Inline in InventoryFormDialog | Should extract to `UserSearchAutocomplete` for reuse across forms |
| **Type safety** | Uses `any[]` for allUsers | Should use typed `UserSearchResult` |

---

## 4. Proposed Architecture

### 4.1 Backend: New Lightweight User Search Endpoint

**Route:** `GET /api/users/search?q=<query>&limit=<n>`  
**Auth:** `authenticate` + `checkPermission('TECHNOLOGY', 1)` (not `requireAdmin`)  
**Purpose:** Return a slim list of active users for autocomplete dropdowns  

**Response shape:**
```typescript
interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  jobTitle: string | null;
  department: string | null;
}

// Response: UserSearchResult[]  (simple array, no pagination needed for autocomplete)
```

**Implementation in `user.controller.ts`:**
```typescript
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit || '20')), 50);
    const users = await userService.searchForAutocomplete(q, limit);
    res.json(users);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

**Implementation in `user.service.ts`:**
```typescript
async searchForAutocomplete(query: string, limit = 20): Promise<UserSearchResult[]> {
  const where: Prisma.UserWhereInput = {
    isActive: true,
    ...(query.length >= 2 && {
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    }),
  };

  const users = await this.prisma.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      jobTitle: true,
      department: true,
    },
    orderBy: { lastName: 'asc' },
    take: limit,
  });

  return users;
}
```

**Route registration in `user.routes.ts`** — add BEFORE `requireAdmin` so non-admins can access:
```typescript
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

// Public (authenticated) user search — must be declared BEFORE router.use(requireAdmin)
router.get(
  '/search',
  authenticate,
  validateRequest(SearchUsersQuerySchema, 'query'),
  checkPermission('TECHNOLOGY', 1),
  searchUsers
);

// All other routes require admin
router.use(authenticate);
router.use(requireAdmin);
router.use(validateCsrfToken);
// ... existing routes
```

**Validator addition in `user.validators.ts`:**
```typescript
export const SearchUsersQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});
```

### 4.2 Frontend: New `searchUsers()` method in `userService.ts`

```typescript
// Add to UserService class in frontend/src/services/userService.ts

export interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  jobTitle: string | null;
  department: string | null;
}

// In UserService class:
async searchUsers(query: string, limit = 20): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: limit.toString() });
  const response = await api.get(`/users/search?${params}`);
  return response.data;
}
```

### 4.3 Frontend: New `UserSearchAutocomplete` Reusable Component

**File:** `frontend/src/components/UserSearchAutocomplete.tsx`

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { userService, UserSearchResult } from '../services/userService';

interface UserSearchAutocompleteProps {
  value: string | null;           // assignedToUserId
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  label?: string;
  error?: boolean;
  helperText?: string;
  /** Initial user object when form opens in edit mode */
  initialUser?: UserSearchResult | null;
}

export const UserSearchAutocomplete = ({
  value,
  onChange,
  disabled = false,
  label = 'Assigned To User',
  error,
  helperText,
  initialUser = null,
}: UserSearchAutocompleteProps) => {
  const [options, setOptions] = useState<UserSearchResult[]>(initialUser ? [initialUser] : []);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Derive selected option from value
  const selectedOption = options.find((o) => o.id === value) ?? null;

  // Fetch initial options when dropdown opens with no input
  useEffect(() => {
    if (open && inputValue === '') {
      setLoading(true);
      userService.searchUsers('', 20)
        .then(setOptions)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, inputValue]);

  // Debounced search on input change
  useEffect(() => {
    if (!open || inputValue.length === 0) return;
    if (inputValue.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await userService.searchUsers(inputValue, 20);
        setOptions(results);
      } catch (err) {
        console.error('User search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, open]);

  const getLabel = (option: UserSearchResult) =>
    option.displayName ||
    `${option.firstName ?? ''} ${option.lastName ?? ''}`.trim() ||
    option.email;

  return (
    <Autocomplete
      fullWidth
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={options}
      value={selectedOption}
      inputValue={inputValue}
      onInputChange={(_, newValue) => setInputValue(newValue)}
      onChange={(_, newValue) => onChange(newValue?.id ?? null)}
      getOptionLabel={getLabel}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      filterOptions={(x) => x}   // Server-side filtering — disable client filter
      loading={loading}
      disabled={disabled}
      noOptionsText={inputValue.length < 2 ? 'Type at least 2 characters to search' : 'No users found'}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search by name or email…"
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default UserSearchAutocomplete;
```

### 4.4 InventoryFormDialog Integration

Replace the inline autocomplete state and logic with `UserSearchAutocomplete`:

**Remove:**
- State: `allUsers`, `userSearchInput`, `userSearchLoading`
- `fetchDropdownOptions` user fetch block
- Debounced `useEffect` for user search

**Add:**
```tsx
import UserSearchAutocomplete from '../UserSearchAutocomplete';
// ...

// In JSX (Row 3.5):
<UserSearchAutocomplete
  value={formData.assignedToUserId}
  onChange={(userId) => handleChange('assignedToUserId', userId)}
  disabled={loading}
  initialUser={item?.assignedToUser ?? null}
/>
```

The `initialUser` prop pre-populates the dropdown option when editing an existing item (so the assigned user's name is visible without an extra API call).

---

## 5. Type Definitions

### New types in `frontend/src/services/userService.ts`
```typescript
export interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  jobTitle: string | null;
  department: string | null;
}
```

### New validator in `backend/src/validators/user.validators.ts`
```typescript
export const SearchUsersQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.string().optional().transform((v) => (v ? Math.min(parseInt(v, 10), 50) : 20)),
});
```

### Backend return type in `backend/src/services/user.service.ts`
```typescript
export interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  jobTitle: string | null;
  department: string | null;
}
```

---

## 6. Implementation Steps (Ordered)

### Step 1 — Backend: Validator
Add `SearchUsersQuerySchema` to `backend/src/validators/user.validators.ts`.

### Step 2 — Backend: Service method
Add `searchForAutocomplete(query, limit)` to `backend/src/services/user.service.ts`. Returns `UserSearchResult[]` using `prisma.user.findMany` with `select` (no joins needed).

### Step 3 — Backend: Controller function
Add `searchUsers` export to `backend/src/controllers/user.controller.ts`.

### Step 4 — Backend: Route registration
In `backend/src/routes/user.routes.ts`, add the `GET /search` route **before** the `router.use(requireAdmin)` block, protected by `authenticate` + `checkPermission('TECHNOLOGY', 1)`.

### Step 5 — Frontend: Service method
Add `searchUsers(query, limit)` and `UserSearchResult` interface to `frontend/src/services/userService.ts`.

### Step 6 — Frontend: Reusable component
Create `frontend/src/components/UserSearchAutocomplete.tsx` as specified in section 4.3.

### Step 7 — Frontend: InventoryFormDialog refactor
- Remove inline user autocomplete state, fetch, and debounce logic
- Import and use `<UserSearchAutocomplete>` component
- Pass `initialUser={item?.assignedToUser ?? null}` for edit mode

### Step 8 — Verify
- Test as ADMIN user: search works
- Test as TECHNICIAN user with TECHNOLOGY level 1+: search works
- Test as VIEWER without TECHNOLOGY permission: 403 returned
- Test edit mode: assigned user name pre-populated correctly
- Test no-selection: `assignedToUserId` is `null`

---

## 7. Security Considerations

| Concern | Mitigation |
|---|---|
| **Endpoint access control** | `GET /users/search` uses `authenticate` (JWT required) + `checkPermission('TECHNOLOGY', 1)`. Users without TECHNOLOGY permission cannot call it. |
| **Data minimization** | The endpoint returns only `id, firstName, lastName, displayName, email, jobTitle, department` — no roles, permissions, entraId, or sensitive fields. |
| **Input sanitization** | Zod validator on `q` param; Prisma parameterized queries prevent SQL injection. |
| **Rate limiting** | Inherits the global rate limiter (`100 req / 15 min per IP`). If autocomplete calls are frequent, consider a separate stricter limiter on this route. |
| **CSRF** | `GET` request — no state mutation — CSRF token not required. Read-only. |
| **Admin endpoint unchanged** | `requireAdmin` on all other `/api/users` routes remains intact. The new `/search` route does NOT expose roles, permissions, or toggle-status functionality. |
| **Active-only results** | `searchForAutocomplete` always filters `isActive: true` so deactivated users cannot be assigned. |
| **Response size** | `limit` capped at 50 server-side (Zod `Math.min`), preventing large data dumps. |

---

## 8. Debounce Strategy

The current debounce in `InventoryFormDialog` uses `setTimeout`/`clearTimeout` inside `useEffect`. This pattern is **correct** and **sufficient**. The `UserSearchAutocomplete` component preserves this pattern.

**Debounce parameters:**
- **Delay:** 300ms — standard for search inputs; balances responsiveness with reducing API calls
- **Minimum chars:** 2 — prevents fetching on single-char input; aligns with backend Prisma `contains` efficiency
- **Initial fetch:** on dropdown open with empty input — loads top 20 sorted by lastName for quick picker access without typing

**Alternative (not required):** The `use-debounce` package (`npm i use-debounce`) provides a `useDebouncedCallback` hook that is more readable. The project does not currently use it so the native approach is preferred for consistency.

---

## 9. API Endpoint Summary

### New: `GET /api/users/search`

| Property | Value |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/users/search` |
| **Auth** | JWT (`authenticate`) + `checkPermission('TECHNOLOGY', 1)` |
| **Query params** | `q: string` (optional, default `''`), `limit: number` (optional, default `20`, max `50`) |
| **Response 200** | `UserSearchResult[]` |
| **Response 401** | Unauthenticated |
| **Response 403** | Insufficient permissions |

**Example request:**
```
GET /api/users/search?q=john&limit=10
Authorization: Bearer <jwt>
```

**Example response:**
```json
[
  {
    "id": "uuid-here",
    "firstName": "John",
    "lastName": "Smith",
    "displayName": "John Smith",
    "email": "jsmith@district.edu",
    "jobTitle": "Teacher",
    "department": "Elementary Education"
  }
]
```

---

## 10. Files to Create / Modify

| File | Action | Description |
|---|---|---|
| `backend/src/validators/user.validators.ts` | **Modify** | Add `SearchUsersQuerySchema` |
| `backend/src/services/user.service.ts` | **Modify** | Add `searchForAutocomplete()` method and `UserSearchResult` interface |
| `backend/src/controllers/user.controller.ts` | **Modify** | Add `searchUsers` controller export |
| `backend/src/routes/user.routes.ts` | **Modify** | Add `GET /search` route before `requireAdmin` block |
| `frontend/src/services/userService.ts` | **Modify** | Add `UserSearchResult` interface and `searchUsers()` method |
| `frontend/src/components/UserSearchAutocomplete.tsx` | **Create** | New reusable autocomplete component |
| `frontend/src/components/inventory/InventoryFormDialog.tsx` | **Modify** | Replace inline autocomplete with `<UserSearchAutocomplete>` |

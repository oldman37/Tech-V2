# User Management Account Type Filter — Implementation Spec

**Date:** 2026-04-08  
**Feature:** Add Staff / Student account type filter to the User Management page  
**Requested by:** Research phase (SubAgent #1)

---

## 1. Current State Analysis

### 1.1 File Inventory

| Role | Path |
|------|------|
| User Management page | `frontend/src/pages/Users.tsx` |
| Frontend user service | `frontend/src/services/userService.ts` |
| TanStack Query hook | `frontend/src/hooks/queries/useUsers.ts` |
| Query key registry | `frontend/src/lib/queryKeys.ts` |
| Backend service | `backend/src/services/user.service.ts` |
| Backend controller | `backend/src/controllers/user.controller.ts` |
| Backend routes | `backend/src/routes/user.routes.ts` |
| Backend validators | `backend/src/validators/user.validators.ts` |

### 1.2 User Management Page Layout

`Users.tsx` is a single-file React component (~500 lines). Layout from top to bottom:

1. **Header** — Title "User Management", subtitle
2. **Sync Panel** (collapsible card) — Entra ID sync stats + Sync All / Sync Staff / Sync Students buttons
3. **Search & Filter card** — Text search input (debounced 500 ms) + items-per-page select (25/50/100/200)
4. **Users table** (card, `overflow-x: auto`) — Columns: User (name + email), Job Title/Location, Role (select), Status (badge), Permissions (count), Actions (Permissions / Supervisors / Activate buttons)
5. **Pagination controls** — First/Prev/numbered pages/Next/Last

### 1.3 Existing Filters

| Filter | Type | Implementation |
|--------|------|----------------|
| Text search | `<input>` debounced 500 ms | Passed to backend via `search` query param |
| Items per page | `<select>` (25/50/100/200) | Controlled state `itemsPerPage` |

There is **no role filter**, **no status filter**, and **no account type filter** currently.

### 1.4 UI Design System

> **Important:** Despite `package.json` listing MUI, `Users.tsx` does **not** use any MUI components.  
> The page uses a custom CSS design system with class names like `btn`, `btn-sm`, `btn-primary`, `btn-secondary`, `btn-ghost`, `form-input`, `form-select`, `card`, `badge`, `badge-success`, `badge-error`, `table`, `page-header`, `page-title`, `page-description`.  
> All new UI elements **must** follow this existing CSS system — do **not** introduce MUI imports.

### 1.5 Pagination Architecture

Pagination is **server-side**. The API returns one page at a time:

```
GET /api/users?page=1&limit=50&search=smith
→ { users: [...50 records...], pagination: { page, limit, totalCount, totalPages } }
```

This is critical for the implementation decision (see §3).

### 1.6 User TypeScript Interface

Defined in `frontend/src/services/userService.ts`:

```typescript
export interface User {
  id: string;
  entraId: string;
  email: string;           // ← email is present
  firstName: string;
  lastName: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  officeLocation?: string;
  role: string;
  isActive: boolean;
  lastSync?: string;
  lastLogin?: string;
  permissions: UserPermission[];
}
```

`email` is non-optional and always returned. ✓

### 1.7 Backend `GET /api/users` — Current State

**Route:** `router.get('/', validateRequest(GetUsersQuerySchema, 'query'), getUsers)`  
**Auth:** Requires `authenticate` + `requireAdmin`  
**CSRF:** Applied via `router.use(validateCsrfToken)` (state-changing routes only — GET is exempt)

**Current validator** (`GetUsersQuerySchema`):
```typescript
z.object({
  page:   z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit:  z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  search: z.string().optional().default(''),
})
```

**Current `UserQuery` interface** (`user.service.ts`):
```typescript
interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
}
```

**Current Prisma `where` clause** (`findAll` method):
```typescript
const where: Prisma.UserWhereInput = {};

if (search) {
  where.OR = [
    { email: { contains: search, mode: 'insensitive' } },
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
    { displayName: { contains: search, mode: 'insensitive' } },
  ];
}

if (query.role)     { where.role = query.role; }
if (query.isActive !== undefined) { where.isActive = query.isActive; }
```

The `role` and `isActive` filters exist in the service but are **not yet exposed** via the validator.

---

## 2. Domain Logic: Account Type from Email

Email domains used in the organisation:

| Account Type | Email Pattern | Detection Logic |
|---|---|---|
| **Student** | `@students.ocboe.com` | `email.endsWith('@students.ocboe.com')` |
| **Staff** | `@ocboe.com` (parent domain) | `email.endsWith('@ocboe.com') && !email.endsWith('@students.ocboe.com')` |

> **Why** `!endsWith('@students.ocboe.com')` for staff?  
> `@students.ocboe.com` is a subdomain of `@ocboe.com`. A naive `endsWith('@ocboe.com')` would match both. The student check must be excluded.

**TypeScript helper:**

```typescript
export type AccountType = 'all' | 'staff' | 'student';

export function getAccountType(email: string): 'staff' | 'student' | 'unknown' {
  if (email.endsWith('@students.ocboe.com')) return 'student';
  if (email.endsWith('@ocboe.com')) return 'staff';
  return 'unknown';
}
```

---

## 3. Implementation Decision: Option A vs Option B

### Option A — Frontend-only filter
Apply `.filter()` after the TanStack Query result.

**Problem:** Pagination is server-side. With 200 users per page and 2,000 total, selecting "Staff only" would only suppress students on the *current* page. The paginated count, total pages, and "Showing X to Y of Z" stats would be wrong. This would be a misleading UX.

**Verdict: ❌ Not suitable.**

### Option B — Backend `accountType` query param ✓
Add `?accountType=staff|student` to `GET /api/users`. The backend adds an email `endsWith` clause to the Prisma `where`. Pagination counts are correct.

**Verdict: ✅ Recommended.**

**Justification:**
- Server-side pagination is already in use — filters must also be server-side to keep totals accurate.
- The Prisma `where` clause modification is minimal (one extra `AND` condition).
- No new attack surface — admin-only read endpoint, no user-supplied regex.
- Pattern is consistent with how `search`, `role`, and `isActive` are already handled in the service.

---

## 4. Files to Modify

### Backend (3 files)

| File | Change |
|------|--------|
| `backend/src/validators/user.validators.ts` | Add `accountType` optional enum field to `GetUsersQuerySchema` |
| `backend/src/services/user.service.ts` | Add `accountType` to `UserQuery`; add email `endsWith` filter in `findAll` |
| `backend/src/controllers/user.controller.ts` | No change needed — `req.query` is passed directly to `userService.findAll()` ✓ |

### Frontend (4 files)

| File | Change |
|------|--------|
| `frontend/src/services/userService.ts` | Add `accountType` param to `getUsers()`; include in `URLSearchParams` |
| `frontend/src/lib/queryKeys.ts` | Add `accountType` to `users.list()` query key factory |
| `frontend/src/hooks/queries/useUsers.ts` | Add `accountType` param to `usePaginatedUsers()` and `useUsers()` |
| `frontend/src/pages/Users.tsx` | Add `accountType` state; add `<select>` UI in filter card; pass to hook; reset page on change |

---

## 5. Exact Implementation Steps

### 5.1 Backend — `user.validators.ts`

Add `accountType` to `GetUsersQuerySchema`:

```typescript
export const GetUsersQuerySchema = z.object({
  page:        z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit:       z.string().optional().transform((val) => val ? parseInt(val, 10) : 50),
  search:      z.string().optional().default(''),
  accountType: z.enum(['all', 'staff', 'student']).optional(),
});
```

Export the updated type:
```typescript
export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
```

### 5.2 Backend — `user.service.ts`

**Step 1** — Update `UserQuery` interface:
```typescript
export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  accountType?: 'all' | 'staff' | 'student';
}
```

**Step 2** — Add email domain filter inside `findAll`, after the existing `search` block and before the count/findMany calls:

```typescript
if (query.accountType && query.accountType !== 'all') {
  const domainConditions: Prisma.UserWhereInput =
    query.accountType === 'student'
      ? { email: { endsWith: '@students.ocboe.com', mode: 'insensitive' } }
      : {
          AND: [
            { email: { endsWith: '@ocboe.com', mode: 'insensitive' } },
            { NOT: { email: { endsWith: '@students.ocboe.com', mode: 'insensitive' } } },
          ],
        };

  if (where.OR) {
    // Combine with existing search OR using AND
    where.AND = [{ OR: where.OR }, domainConditions];
    delete where.OR;
  } else {
    Object.assign(where, domainConditions);
  }
}
```

> Note: If both `search` and `accountType` are active, the `where.OR` from search is wrapped in an `AND` with the domain condition, so both filters apply together.

### 5.3 Frontend — `queryKeys.ts`

Update `users.list()` to include `accountType`:

```typescript
list: (page: number, limit: number, search?: string, accountType?: string) =>
  [...queryKeys.users.lists(), { page, limit, search, accountType }] as const,
```

This ensures a different cache entry exists for each combination of filters (TanStack Query cache isolation).

### 5.4 Frontend — `userService.ts`

Update `getUsers()` signature and URLSearchParams construction:

```typescript
async getUsers(
  page: number = 1,
  limit: number = 50,
  search: string = '',
  accountType: string = 'all'
): Promise<PaginatedResponse<User>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search }),
    ...(accountType && accountType !== 'all' && { accountType }),
  });
  const response = await api.get(`/users?${params}`);
  return response.data;
}
```

### 5.5 Frontend — `useUsers.ts`

Update both `useUsers()` and `usePaginatedUsers()`:

```typescript
export function usePaginatedUsers(
  page: number,
  limit: number,
  search: string = '',
  accountType: string = 'all'
) {
  const query = useQuery({
    queryKey: queryKeys.users.list(page, limit, search, accountType),
    queryFn: () => userService.getUsers(page, limit, search, accountType),
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    hasNextPage: (query.data?.pagination.page ?? 0) < (query.data?.pagination.totalPages ?? 0),
    hasPreviousPage: (query.data?.pagination.page ?? 1) > 1,
    isPlaceholderData: query.isPlaceholderData,
  };
}
```

### 5.6 Frontend — `Users.tsx`

**Step 1** — Add state (near the other state declarations at the top):
```typescript
const [accountType, setAccountType] = useState<'all' | 'staff' | 'student'>('all');
```

**Step 2** — Add handler:
```typescript
const handleAccountTypeChange = (value: 'all' | 'staff' | 'student') => {
  setAccountType(value);
  setCurrentPage(1); // Reset to first page when filter changes
};
```

**Step 3** — Update `usePaginatedUsers` call to pass `accountType`:
```typescript
const {
  data: usersData,
  isLoading: usersLoading,
  error: usersError,
  isPlaceholderData,
} = usePaginatedUsers(currentPage, itemsPerPage, debouncedSearchTerm, accountType);
```

**Step 4** — Add the account type filter `<select>` inside the existing "Search and filter" card, between the search input and the items-per-page control:

```tsx
{/* Account Type Filter */}
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
  <label style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Account type:</label>
  <select
    value={accountType}
    onChange={(e) => handleAccountTypeChange(e.target.value as 'all' | 'staff' | 'student')}
    className="form-select"
    style={{ width: 'auto', fontSize: '0.875rem' }}
  >
    <option value="all">All</option>
    <option value="staff">Staff (@ocboe.com)</option>
    <option value="student">Students (@students.ocboe.com)</option>
  </select>
</div>
```

Place this `<div>` between the `<input>` (search) and the items-per-page `<div>` inside the flex container of the filter card.

---

## 6. TypeScript Types Summary

### New type in `Users.tsx` (or a shared types file):
```typescript
type AccountType = 'all' | 'staff' | 'student';
```

No new shared types are required — `accountType` is passed as a plain string through the service layer and as an enum in the backend validator.

---

## 7. Filter Card Final Layout

After the change, the filter card flex row will contain:

```
[  Search input (flex: 1)  ]  [ Account type: [All ▾] ]  [ Show: [50 ▾] per page ]
```

On narrow viewports `flexWrap: 'wrap'` is already set on the container, so all three items will wrap gracefully.

---

## 8. TanStack Query Cache Behaviour

- The `queryKey` for the user list is `['users', 'list', { page, limit, search, accountType }]`.
- Each unique `{ accountType }` value creates an independent cache entry.
- Switching between "All", "Staff", "Students" shows `isPlaceholderData: true` (the old page data) while the new request is in flight, then replaces it — no blank states.
- Switching back to a previously-viewed accountType returns the cached result instantly until it becomes stale.

---

## 9. Security Considerations

| Concern | Assessment |
|---------|-----------|
| New attack surface | None — `GET /api/users` already requires `authenticate` + `requireAdmin`. |
| SQL injection | Not applicable — Prisma parameterises all queries. `endsWith` uses a parameterised `LIKE '%value'` internally. |
| Regex DoS | Not applicable — `endsWith` is a fixed string comparison, not a user-supplied regex. |
| Input validation | `accountType` is validated as a strict enum (`'all' | 'staff' | 'student'`) by Zod before reaching the service. Any other value is rejected with a 400. |
| Data leakage | Filter is read-only; it does not expose any fields that are not already returned in the unfiltered response. |

---

## 10. Out of Scope

- Adding an `accountType` column to the user table (email already shown in the User column)
- Persisting the filter selection across page reloads (localStorage)
- Exposing `role` or `isActive` filters (already in the service but out of this request)
- Using MUI `ToggleButtonGroup` — the page does not use MUI components; native `<select>` is consistent with the existing design system

---

## 11. References

1. [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — cache isolation by key composition
2. [Prisma Docs — String filters (`endsWith`)](https://www.prisma.io/docs/orm/reference/prisma-client-reference#endswith) — `endsWith` with `mode: 'insensitive'`
3. [Zod — Enum validation](https://zod.dev/?id=zod-enums) — `z.enum([...])`
4. [OWASP — Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) — allowlist approach for enum params
5. [React — Controlled components](https://react.dev/reference/react-dom/components/select) — `<select>` with `value` + `onChange`
6. Internal codebase — `search` query param pattern in `GetUsersQuerySchema`, `UserQuery`, `userService.getUsers()`, `usePaginatedUsers()` — the new `accountType` param follows the identical pattern end-to-end

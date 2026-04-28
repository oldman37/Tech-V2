# Inactive Users Appearing on Locations / Supervisors Pages — Investigation Spec

**Date:** 2026-04-08  
**Status:** Ready for Implementation  
**Priority:** High — data-integrity / UX correctness

---

## 1. Problem Summary (Root Cause)

Inactive users (`isActive: false`) appear on the **Office Locations & Supervisors** page
and on the **per-user Supervisors modal** in User Management because several backend
Prisma queries traverse the `LocationSupervisor` or `UserSupervisor` junction tables and
include related `User` records **without adding `isActive: true` as a filter on the user
side of the join**.

The `OfficeLocation.isActive` filter IS correctly applied in all relevant queries (only
active locations are returned). The gap is exclusively on the **user `isActive` filter**
that should prevent deactivated users from being returned as supervisors.

There are **no client-side `isActive` user filters** in the frontend — the frontend
trusts the backend to return only active users, so all fixes are backend-only.

---

## 2. Data Flow Map

### Locations / SupervisorManagement Page

```
SupervisorManagement.tsx
  └── useLocations()                         (hooks/queries/useLocations.ts)
        └── locationService.getAllLocations() (services/location.service.ts)
              └── GET /api/locations
                    └── LocationService.findAll()       ← BUG #1
                          └── officeLocation.findMany
                                include.supervisors
                                  include.user          ← no isActive filter

  └── EditLocationModal (when editing)
        └── locationService.getLocation(id)  (services/location.service.ts)
              └── GET /api/locations/:id
                    └── LocationService.findById()      ← BUG #2
                          └── officeLocation.findUnique
                                include.supervisors
                                  include.user          ← no isActive filter

  └── useSupervisorsList()                   (hooks/queries/useUsers.ts)
        └── GET /users/supervisors/list
              └── UserService.getSupervisorUsers()      ← CORRECT (isActive: true exists)
```

### User Management Supervisor Modal

```
Users.tsx
  └── SupervisorModal
        └── useUserSupervisors(userId)       (hooks/queries/useSupervisors.ts)
              └── supervisorService.getUserSupervisors() (services/supervisorService.ts)
                    └── GET /users/:userId/supervisors
                          └── UserService.getUserSupervisors()     ← BUG #3
                                └── userSupervisor.findMany
                                      include.supervisor            ← no isActive filter

        └── useSearchSupervisors(userId, query)
              └── supervisorService.searchPotentialSupervisors()
                    └── GET /users/:userId/supervisors/search
                          └── UserService.searchPotentialSupervisors()  ← CORRECT

        └── useSearchSupervisors already correct (has isActive: true)
```

### Supervisors-by-Type Endpoint (admin routing use)

```
GET /supervisors/type/:type
  └── LocationService.getSupervisorsByType()            ← BUG #4
        └── locationSupervisor.findMany({ where: { supervisorType } })
              include.user                               ← no isActive filter
```

### Routing / PO Approval Endpoint

```
GET /locations/:locationId/supervisor/:supervisorType
  └── LocationService.getPrimarySupervisorForRouting()  ← BUG #5
        └── locationSupervisor.findFirst({ where: { locationId, supervisorType, isPrimary: true } })
              include.user                               ← no isActive filter
```

---

## 3. Affected Files

| # | File | Function | Issue |
|---|------|----------|-------|
| 1 | `backend/src/services/location.service.ts` | `findAll()` | Supervisors include does not filter `user.isActive: true` |
| 2 | `backend/src/services/location.service.ts` | `findById()` | Same issue |
| 3 | `backend/src/services/user.service.ts` | `getUserSupervisors()` | Supervisor include does not filter `supervisor.isActive: true` |
| 4 | `backend/src/services/location.service.ts` | `getSupervisorsByType()` | No `user.isActive: true` filter |
| 5 | `backend/src/services/location.service.ts` | `getPrimarySupervisorForRouting()` | No `user.isActive: true` filter |

---

## 4. Exact Changes Required

### Fix #1 — `LocationService.findAll()` in `backend/src/services/location.service.ts`

**Current code** (inside `officeLocation.findMany`):
```typescript
include: {
  supervisors: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
        },
      },
    },
    orderBy: [
      { supervisorType: 'asc' },
      { isPrimary: 'desc' },
    ],
  },
},
```

**Required change** — add `where: { user: { isActive: true } }` to the `supervisors` include:
```typescript
include: {
  supervisors: {
    where: {
      user: { isActive: true },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
        },
      },
    },
    orderBy: [
      { supervisorType: 'asc' },
      { isPrimary: 'desc' },
    ],
  },
},
```

---

### Fix #2 — `LocationService.findById()` in `backend/src/services/location.service.ts`

**Current code** (inside `officeLocation.findUnique`):
```typescript
include: {
  supervisors: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: true,
        },
      },
    },
    orderBy: [
      { supervisorType: 'asc' },
      { isPrimary: 'desc' },
    ],
  },
},
```

**Required change** — add `where: { user: { isActive: true } }`:
```typescript
include: {
  supervisors: {
    where: {
      user: { isActive: true },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: true,
        },
      },
    },
    orderBy: [
      { supervisorType: 'asc' },
      { isPrimary: 'desc' },
    ],
  },
},
```

---

### Fix #3 — `UserService.getUserSupervisors()` in `backend/src/services/user.service.ts`

**Current code** (inside `userSupervisor.findMany`):
```typescript
const supervisors = await this.prisma.userSupervisor.findMany({
  where: { userId },
  include: {
    supervisor: {
      select: {
        id: true,
        email: true,
        displayName: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        officeLocation: true,
      },
    },
  },
  orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
});
```

**Required change** — add `supervisor: { isActive: true }` to the `where` clause:
```typescript
const supervisors = await this.prisma.userSupervisor.findMany({
  where: {
    userId,
    supervisor: { isActive: true },
  },
  include: {
    supervisor: {
      select: {
        id: true,
        email: true,
        displayName: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        officeLocation: true,
      },
    },
  },
  orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
});
```

---

### Fix #4 — `LocationService.getSupervisorsByType()` in `backend/src/services/location.service.ts`

**Current code** (inside `locationSupervisor.findMany`):
```typescript
const supervisors = await this.prisma.locationSupervisor.findMany({
  where: { supervisorType },
  include: {
    user: {
      select: {
        id: true,
        email: true,
        displayName: true,
        jobTitle: true,
      },
    },
    location: {
      select: {
        id: true,
        name: true,
        type: true,
      },
    },
  },
  orderBy: [
    { location: { name: 'asc' } },
    { isPrimary: 'desc' },
  ],
});
```

**Required change** — add `user: { isActive: true }` to the `where` clause:
```typescript
const supervisors = await this.prisma.locationSupervisor.findMany({
  where: {
    supervisorType,
    user: { isActive: true },
  },
  include: {
    user: {
      select: {
        id: true,
        email: true,
        displayName: true,
        jobTitle: true,
      },
    },
    location: {
      select: {
        id: true,
        name: true,
        type: true,
      },
    },
  },
  orderBy: [
    { location: { name: 'asc' } },
    { isPrimary: 'desc' },
  ],
});
```

---

### Fix #5 — `LocationService.getPrimarySupervisorForRouting()` in `backend/src/services/location.service.ts`

**Current code** (inside `locationSupervisor.findFirst`):
```typescript
const supervisor = await this.prisma.locationSupervisor.findFirst({
  where: {
    locationId,
    supervisorType,
    isPrimary: true,
  },
  include: {
    user: true,
  },
});
```

**Required change** — add `user: { isActive: true }` to the `where` clause:
```typescript
const supervisor = await this.prisma.locationSupervisor.findFirst({
  where: {
    locationId,
    supervisorType,
    isPrimary: true,
    user: { isActive: true },
  },
  include: {
    user: true,
  },
});
```

> **Note:** If no active primary supervisor is found, the existing `NotFoundError` throw
> is appropriate and correct behaviour. The caller will receive a 404 response, which is
> preferable to routing a notification to a deactivated user.

---

## 5. Files Confirmed NOT Affected

| File | Function | Reason OK |
|------|----------|-----------|
| `backend/src/services/user.service.ts` | `getSupervisorUsers()` | Has `isActive: true` at line ~510 |
| `backend/src/services/user.service.ts` | `searchPotentialSupervisors()` | Has `isActive: true` at line ~718 |
| `backend/src/services/user.service.ts` | `searchForAutocomplete()` | Has `isActive: true` at line ~753 |
| `backend/src/services/user.service.ts` | `getMyOfficeLocation()` | Has `isActive: true` at line ~798 |
| `backend/src/services/location.service.ts` | `findAll()` — OfficeLocation filter | Has `isActive: true` for the location itself |
| All frontend components | n/a | No client-side user isActive filtering; backend is the authority |

---

## 6. Frontend Scope

**No frontend changes are required.** The frontend trusts the backend to return only
active supervisor/user records. The `useSupervisorsList()` hook (which populates the
supervisor assignment dropdown) already calls `GET /users/supervisors/list` →
`getSupervisorUsers()`, which already has `isActive: true`. All broken paths are
exclusively in the backend service layer.

---

## 7. Implementation Steps (Priority Order)

1. **Fix `LocationService.findAll()`** — highest impact; this is the main Locations page load.
2. **Fix `LocationService.findById()`** — affects the Edit Location modal (loads on demand).
3. **Fix `UserService.getUserSupervisors()`** — affects the Supervisors modal on User Management page.
4. **Fix `LocationService.getSupervisorsByType()`** — affects admin/routing queries.
5. **Fix `LocationService.getPrimarySupervisorForRouting()`** — affects PO approval routing.

All five fixes are small, additive `where` clause additions. No schema migrations, no
new endpoints, no frontend changes.

---

## 8. Security Considerations

- **No new attack surface introduced.** The changes add more restrictive filters; they
  reduce the data returned, not expand it.
- **No input validation changes needed.** The `isActive: true` value is hardcoded in
  the service layer, not derived from user input.
- **No privilege escalation risk.** Filtering out inactive supervisors from read
  responses does not expose any new write pathways.
- **OWASP Broken Access Control (A01) note:** Returning data for deactivated accounts is
  itself a minor access-control concern. These fixes reduce the information disclosure
  footprint for deactivated users.

---

## 9. Testing Recommendations

After implementation, verify the following manually or with integration tests:

1. Deactivate a user who is assigned as a supervisor to an office location.
2. Load the Locations page — confirm the deactivated user no longer appears in the
   supervisor list for that location.
3. Open the Edit Location modal — confirm the deactivated user is absent from the
   existing supervisors list.
4. In User Management → Supervisors modal for any user — confirm deactivated supervisors
   are not shown.
5. Confirm that reactivating the user (`isActive: true`) causes them to reappear
   correctly on all pages.
6. Confirm the supervisor assignment dropdown (Add Supervisor) still only shows active
   users (it was already correct).

---

## 10. Related Files (Reference Only)

- Schema: `backend/prisma/schema.prisma` — `User.isActive Boolean @default(true)`,
  `LocationSupervisor`, `UserSupervisor` models
- Routes: `backend/src/routes/location.routes.ts`, `backend/src/routes/user.routes.ts`
- Frontend page: `frontend/src/pages/SupervisorManagement.tsx`
- Frontend page: `frontend/src/pages/Users.tsx` (Supervisor modal)
- Frontend hooks: `frontend/src/hooks/queries/useLocations.ts`,
  `frontend/src/hooks/queries/useSupervisors.ts`,
  `frontend/src/hooks/queries/useUsers.ts`
